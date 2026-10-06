// ============================================================
// LỒNG TIẾNG VIỆT AI (lớp kết nối engine với YouTube / Coursera)
//
// Không đọc từng phụ đề. Luồng thật sự:
//   bản dịch CÓ NGỮ CẢNH của từng nhóm câu (đã có từ engine dịch)
//   -> kịch bản nói liên tục theo nhịp lời gốc (dub-planner.js)
//   -> kế hoạch ngữ điệu & thời lượng -> giọng Gemini AI hoặc giọng hệ thống
//   -> đồng bộ với video (dub-engine.js)
//
// Giữ tên window.CST_DUB và các hàm cũ để phần giao diện hiện có hoạt động.
// ============================================================
(function () {
    "use strict";

    const dub = { enabled: false, engine: null, container: null, lastStatus: null };

    const DEFAULTS = {
        dubProvider: "vieneu",        // vieneu (mặc định) | auto | gemini | system
        dubLocalVoice: "",            // giọng VieNeu (trống = mặc định trong danh mục)
        dubLocalVoice2: "",
        dubGeminiVoice: "Kore",
        dubGeminiVoice2: "Charon",
        dubTtsModel: "",
        dubVoiceName: "",
        dubDuck: 0.2,                 // mức tiếng gốc khi có lời Việt (giữ nhạc nền nghe được)
        dubVolume: 1,
        dubSecondVoice: false,        // a second voice for a second speaker: off unless the viewer asks
        dubMaxRate: 0,                // fastest the voice may read (1.1 to 1.6); 0 = automatic
        dubPrepareWait: true,         // mở video mới / tua tới đoạn mới: tạm dừng tối đa 5 giây chờ phụ đề + giọng
        useAi: true,
        geminiApiKey: "",
        costMode: "balanced"
    };

    // ---------- Kho audio phía trang: L1 RAM (giữ qua các lần bật/tắt lồng tiếng) ----------
    // L2 bền vững (IndexedDB) nằm ở service worker (cst-cache.js): đọc qua tin nhắn,
    // còn GHI do chính service worker làm ngay khi nhận audio từ Gemini TTS.
    // Capped by bytes too (1.7.3): at 48 kHz a take is ~0.5 to 1 MB, so 40 entries could hold ~40 MB
    // in the page, on top of the engine's own copies of what is playing. 16 MB is ~170 s of speech;
    // anything older comes back from the service worker's store.
    const audioL1 = new Map();
    const AUDIO_L1_MAX = 40;
    const AUDIO_L1_BYTES = 16 * 1024 * 1024;
    let audioL1Bytes = 0;
    const recBytes = rec => (rec && rec.wav && rec.wav.byteLength) || 0;
    function l1Put(key, rec) {
        if (audioL1.has(key)) audioL1Bytes -= recBytes(audioL1.get(key));
        audioL1.delete(key);
        audioL1.set(key, rec);
        audioL1Bytes += recBytes(rec);
        while (audioL1.size > AUDIO_L1_MAX || (audioL1Bytes > AUDIO_L1_BYTES && audioL1.size > 1)) {
            const oldest = audioL1.keys().next().value;
            audioL1Bytes -= recBytes(audioL1.get(oldest));
            audioL1.delete(oldest);
        }
    }
    let startSeq = 0;
    const audioCache = {
        async get(keys) {
            const out = {};
            const miss = [];
            // a hit moves to the newest end (1.8.9): a take replayed on every rewind was otherwise
            // the first one evicted, however often it was used
            for (const k of keys) { if (audioL1.has(k)) { out[k] = audioL1.get(k); l1Put(k, out[k]); } else miss.push(k); }
            if (miss.length) {
                const r = await sendMessage({ action: "audioCacheGet", keys: miss });
                const hits = r && r.hits && typeof r.hits === "object" ? r.hits : {};
                for (const k of miss) {
                    const h = hits[k];
                    if (!h || typeof h.wav !== "string" || !h.wav) continue;
                    // one corrupt record is a miss for its line; it used to throw away every hit
                    let wav;
                    try { wav = window.CST_DUB_AUDIO.base64ToBytes(h.wav); } catch (e) { continue; }
                    if (!wav || !wav.length) continue;
                    const rec = { wav, duration: h.duration, sampleRate: h.sampleRate };
                    l1Put(k, rec);
                    out[k] = rec;
                }
            }
            return out;
        },
        put(key, rec) {
            l1Put(key, rec);
        }
    };

    // Xóa audio đã lưu của video đang xem (trong trang và trong kho của tiện ích), rồi tạo lại
    async function forgetVideoAudio() {
        const eng = dub.engine;
        if (!eng) return { ok: false, error: "Video này chưa bật lồng tiếng" };
        const keys = await eng.audioKeysForVideo();
        keys.forEach(k => { if (audioL1.has(k)) { audioL1Bytes -= recBytes(audioL1.get(k)); audioL1.delete(k); } });
        const r = await sendMessage({ action: "audioCacheDelete", keys });
        eng.forgetRendered();
        return { ok: !!(r && r.ok), removed: (r && r.removed) || 0 };
    }

    // A YouTube ad plays in the lecture's own <video>; the player marks it with a class (1.9.3). The
    // player element is found once and looked up again only if YouTube replaced it. Elsewhere there
    // is no such player and this always says no.
    function adShowingFor(video) {
        let player = null;
        return () => {
            if (!player || !player.isConnected) player = video && video.closest ? video.closest(".html5-video-player") : null;
            return !!(player && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting")));
        };
    }

    function sendMessage(msg) {
        return new Promise(resolve => {
            try {
                chrome.runtime.sendMessage(msg, r => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : r));
            } catch (e) { resolve({ ok: false, error: e.message }); }
        });
    }

    async function readSettings() {
        try { return { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) }; }
        catch (e) { return { ...DEFAULTS }; }
    }

    // Chọn provider theo cài đặt: Gemini AI (tự nhiên, cần API Key) và giọng
    // hệ thống làm dự phòng (miễn phí, offline). Thêm provider mới chỉ cần
    // tạo theo cùng giao diện trong dub-engine.js.
    // Video đang xem (chi phí ước tính theo video, chỉ lưu trên máy)
    function videoMeta(video) {
        // same key as content.js currentVideoMeta: other sites get the host in front
        let key = /(^|\.)(youtube\.com|coursera\.org)$/.test(location.hostname) ? location.pathname : location.hostname + location.pathname;
        try { const v = new URL(location.href).searchParams.get("v"); if (v) key = "yt:" + v; } catch (e) { /* bỏ qua */ }
        return { videoKey: key, videoSec: video && isFinite(video.duration) ? Math.round(video.duration) : 0, videoTitle: String(typeof pageVideoTitle === "function" ? pageVideoTitle() : document.title || "").slice(0, 80) };
    }

    async function buildProviders(s, video) {
        const E = window.CST_DUB_ENGINE;
        const mode = window.CST_COST ? window.CST_COST.getMode(s.costMode) : { tts: "gemini" };
        let warned = false;
        const send = async msg => {
            const r = await sendMessage({ ...msg, ...videoMeta(video) });
            if (r && r.budget === "warn" && !warned) {
                warned = true;
                console.warn("[Lồng tiếng] Sắp chạm ngân sách chi phí ước tính (xem Cài đặt > Chi phí). Khi chạm, giọng AI tự chuyển sang giọng hệ thống.");
            }
            return r;
        };
        const env = { speechSynthesis: window.speechSynthesis, SpeechSynthesisUtterance: window.SpeechSynthesisUtterance, sendMessage: send };
        const system = E.createWebSpeechProvider(env);
        // Giọng Việt trên máy (VieNeu): miễn phí nên dùng được ở mọi chế độ có lồng tiếng,
        // chỉ khi máy chủ cục bộ đang chạy. Kiểm tra SONG SONG với giọng hệ thống (danh sách
        // giọng hệ thống có thể mất tới 1,5 giây mới có) -> bật lồng tiếng nhanh hơn.
        // Paid voice off (cost-policy PAID_TTS): VieNeu is the only voice, whatever an old setting says
        const COSTP = window.CST_COST || {};
        const localOnly = !COSTP.PAID_TTS;
        const wantLocal = localOnly || s.dubProvider === "auto" || s.dubProvider === "vieneu";
        const local = wantLocal && E.createVieneuProvider ? E.createVieneuProvider(env, { localVoice: s.dubLocalVoice, localVoice2: s.dubLocalVoice2 }) : null;
        const [hasSystem, hasLocal] = await Promise.all([system.init(s.dubVoiceName), local ? local.init() : false]);
        // A cold server pages its model in during the 1-2 s before the first translated line (BACKLOG
        // 20); the service worker does nothing when the server is warm or already busy. Not awaited.
        if (hasLocal) sendMessage({ action: "localWarm", voice: s.dubLocalVoice }).catch(() => {});
        // Chế độ "Tiết kiệm": không dùng Gemini TTS (chỉ giọng miễn phí)
        const canGemini = !localOnly && !!(s.useAi && s.geminiApiKey) && mode.tts === "gemini";
        // Model TTS mà API key này gọi được thật (key mới không dùng được 2.5 TTS): khóa kho
        // audio theo đúng model sẽ tạo ra audio
        let ttsModel = s.dubTtsModel;
        // VieNeu đang chạy và là giọng chính: không cần hỏi model Gemini TTS (bớt một bước chờ)
        const geminiFirst = s.dubProvider === "gemini" || !hasLocal;
        if (canGemini && geminiFirst && !ttsModel) {
            const st = await sendMessage({ action: "modelStatus" });
            ttsModel = (st && st.effective && st.effective.tts) || "";
        }
        const gemini = canGemini ? E.createGeminiProvider(env, { geminiVoice: s.dubGeminiVoice, geminiVoice2: s.dubGeminiVoice2, ttsModel }) : null;
        let primary = null;
        const sys = hasSystem ? system : null;
        const loc = hasLocal ? local : null;
        if (localOnly) primary = loc;
        else if (s.dubProvider === "system") primary = sys || loc || gemini;
        else if (s.dubProvider === "gemini") primary = gemini || loc || sys;
        else primary = loc || gemini || sys;                    // auto + vieneu: VieNeu trước
        // VieNeu lỗi giữa chừng (tắt máy chủ): chuyển sang giọng hệ thống miễn phí, không tự
        // chuyển sang Gemini (tránh tốn tiền ngoài ý muốn)
        const fallback = !localOnly && (primary === gemini || primary === loc) && sys ? sys : null;
        const localMissing = (localOnly || s.dubProvider === "vieneu") && !hasLocal;
        return { primary, fallback, hasSystem, canGemini, hasLocal, localMissing };
    }

    // Bật lồng tiếng có nhiều bước CHỜ (đọc cài đặt, hỏi máy chủ VieNeu, hỏi model). Trong lúc chờ,
    // một lượt bật khác có thể chen vào (đổi giọng trong Cài đặt: cả dubbing.js và youtube.js đều
    // khởi động lại) -> trước đây tạo ra HAI bộ đọc cùng chạy, giọng cũ và giọng mới chồng lên nhau.
    // Mỗi lượt bật mang một số thứ tự; chỉ lượt MỚI NHẤT được tạo và chạy bộ đọc.
    // getGroups(): các nhóm câu đã dịch { start, end, srcCues, viText, viCues }
    async function start(opts) {
        stop();
        const seq = ++startSeq;
        dub.starting = true;
        try {
            return await startEngine(opts, seq);
        } finally {
            // Every way out hands the flag back: "Chỉ phụ đề" mode, no voice at all, an error. Left
            // set, the YouTube auto-dub (ytTuBatLongTieng checks it) skipped every later video on the
            // page, e.g. after the VieNeu server was started. A newer start owns it, so not then.
            if (seq === startSeq) dub.starting = false;
        }
    }

    async function startEngine(opts, seq) {
        const outdated = () => seq !== startSeq;
        // Tự bật (opts.quiet): không bật hộp thoại chặn trang, chỉ ghi ra console
        // Không dùng hộp thoại chặn trang: báo bằng thẻ nhỏ trên trình phát (tự ẩn)
        const alert = (msg, act) => (opts && opts.quiet
            ? console.warn("[Lồng tiếng] " + msg)
            : (window.CST_UI && window.CST_UI.toast ? window.CST_UI.toast(msg, { warn: true, ...act }) : console.warn("[Lồng tiếng] " + msg)));
        const s = await readSettings();
        if (outdated()) return false;
        const mode = window.CST_COST ? window.CST_COST.getMode(s.costMode) : { tts: "gemini", prefetch: 18 };
        if (mode.tts === "none") {
            alert("Đang ở chế độ \"Chỉ phụ đề\" nên lồng tiếng đã tắt. Đổi chế độ sử dụng trong Cài đặt để bật lồng tiếng.",
                { actionLabel: "Mở Cài đặt", onAction: () => sendMessage({ action: "openOptions" }) });
            return false;
        }
        const { primary, fallback, hasSystem, canGemini, localMissing } = await buildProviders(s, opts.video);
        if (outdated()) return false;
        // 1.8.1, paid voice off: VieNeu is the only voice. Its server is down: say so once, then wait
        // for it and start by itself (no Gemini, no system voice in between)
        if (!primary && localMissing && !(window.CST_COST && window.CST_COST.PAID_TTS)) {
            console.warn("[Lồng tiếng] Máy chủ VieNeu chưa chạy; chờ máy chủ, không dùng giọng khác");
            if (window.CST_UI && window.CST_UI.toast) {
                window.CST_UI.toast("Giọng VieNeu chưa chạy. Mở ~/VieNeu-TTS/cst-start.command; lồng tiếng sẽ tự bật khi máy chủ sẵn sàng.", { warn: true });
            }
            dub.enabled = true;
            doiVieNeuSanSang(opts);
            return false;
        }
        if (localMissing) {
            console.warn("[Lồng tiếng] Máy chủ VieNeu chưa chạy. Tạm dùng: " + (primary ? primary.label : "không có"));
            // Báo MỘT lần cho mỗi trang, rồi TỰ chờ máy chủ sẵn sàng và chuyển giọng, không bắt
            // người xem phải bấm gì
            if (!dub.localWarned && window.CST_UI && window.CST_UI.toast) {
                dub.localWarned = true;
                window.CST_UI.toast(
                    `Giọng VieNeu chưa sẵn sàng nên tạm dùng ${primary ? primary.label.toLowerCase() : "giọng khác"}. Sẽ tự chuyển lại khi VieNeu chạy.`,
                    { warn: true }
                );
            }
        }
        if (!primary) {
            alert(
                "Chưa có giọng đọc tiếng Việt.\n" +
                "Cách nhanh nhất (miễn phí): mở ~/VieNeu-TTS/cst-start.command để bật giọng VieNeu trên máy, rồi bật lại lồng tiếng." +
                (canGemini ? "" : "\nHoặc nhập Gemini API Key trong Cài đặt.") +
                (hasSystem ? "" : "\nHoặc tải giọng tiếng Việt của hệ điều hành (macOS: Spoken Content; Windows: Speech)."),
                { actionLabel: "Thử lại", onAction: () => start(opts) }
            );
            return false;
        }
        if (outdated()) return false;
        stop();                                   // dọn sạch bộ đọc cũ (nếu còn) trước khi tạo bộ mới
        startSeq = seq;                           // stop() vừa tăng số thứ tự: lượt này vẫn là mới nhất
        const E = window.CST_DUB_ENGINE;
        const engine = new E.DubEngine({
            video: opts.video,
            getGroups: opts.getGroups,
            providers: { primary, fallback },
            now: () => performance.now(),
            setInterval: (f, ms) => setInterval(f, ms),
            setTimeout: (f, ms) => setTimeout(f, ms),
            clearTimeout: id => clearTimeout(id),       // lookupCache drops its give-up timer with it
            clearInterval: id => clearInterval(id),
            createObjectURL: bytes => URL.createObjectURL(new Blob([bytes], { type: "audio/wav" })),
            revokeObjectURL: url => URL.revokeObjectURL(url),
            createAudio: url => { const a = new Audio(url); a.preload = "auto"; return a; },
            audioCache,
            adShowing: adShowingFor(opts.video),
            onStatus: st => { dub.lastStatus = st; renderBadge(); },
            // Tua tới đoạn chưa có audio: chờ chuẩn bị (nếu bật) để có tiếng ngay khi phát tiếp
            onReset: reason => {
                if (reason !== "seek" || !s.dubPrepareWait) return;
                const v = opts.video;
                setTimeout(() => {
                    const e = dub.engine;
                    if (!e || v.paused || e.isReadyAt(v.currentTime)) return;
                    prepareHold(v, () => { const en = dub.engine; return !en || en.isReadyAt(v.currentTime); }, { container: dub.container, reason: "seek" });
                }, 0);
            },
            log: (...a) => console.warn("[Lồng tiếng]", ...a)
        }, { duck: level(s.dubDuck, 0.2), volume: level(s.dubVolume, 1), playerOwnsVolume: /(^|\.)youtube\.com$/.test(location.hostname), secondVoice: s.dubSecondVoice === true, maxRate: Number(s.dubMaxRate) || null, prefetchMax: smartPrefetch(mode, opts.video) });
        dub.engine = engine;
        dub.enabled = true;
        dub.starting = false;
        // Bật theo dõi SAU khi bộ đọc đã chạy: stop() bên trên (dọn bộ đọc cũ) cũng tắt bộ theo dõi,
        // nên đặt ở giữa hàm thì nó bị xóa ngay và giọng không bao giờ tự chuyển về VieNeu
        if (localMissing) doiVieNeuSanSang(opts);
        else if (primary && primary.id === "vieneu") canhBaoMayChuCham(opts);
        startDebug(engine);
        dub.container = opts.container || null;
        engine.start();
        showDubBadge(dub.container);
        console.log(`[Lồng tiếng] Bắt đầu: ${primary.label} (${primary.voiceLabel || ""})${fallback ? ", dự phòng: giọng hệ thống" : ""}`);
        return true;
    }

    // Video dài (> 30 phút): tạo trước dè dặt hơn (người xem hay tua, audio xa dễ bị bỏ phí)
    function smartPrefetch(mode, video) {
        const base = mode.prefetch || 18;
        const long = video && isFinite(video.duration) && video.duration > 1800;
        return long ? Math.max(12, Math.round(base * 0.7)) : base;
    }

    // Chẩn đoán: bật bằng localStorage.cstDubDebug = "1" trên trang (không hiện gì cho người xem).
    // Ghi ảnh chụp trạng thái engine vào thuộc tính data-cst-dub của <html> mỗi 0,5 giây để đọc
    // được từ công cụ gỡ lỗi; không gửi đi đâu.
    let debugTimer = null;
    function startDebug(engine) {
        clearInterval(debugTimer);
        let on = false;
        try { on = localStorage.getItem("cstDubDebug") === "1"; } catch (e) { /* bỏ qua */ }
        if (!on) return;
        debugTimer = setInterval(() => {
            if (dub.engine !== engine) { clearInterval(debugTimer); return; }
            try { document.documentElement.setAttribute("data-cst-dub", JSON.stringify(engine.debugSnapshot())); } catch (e) { /* bỏ qua */ }
        }, 500);
    }

    function stop() {
        if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
        startSeq++;                               // lượt bật đang chờ (nếu có) tự hủy, không tạo bộ đọc nữa
        dub.starting = false;
        if (dub.engine) { try { dub.engine.stop(); } catch (e) { /* bỏ qua */ } }
        dub.engine = null;
        dub.enabled = false;
        hideDubBadge();
    }

    // Cài đặt đổi (trang tùy chọn tự lưu): áp dụng ngay khi đang lồng tiếng
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== "sync" || !dub.engine) return;
            const e = dub.engine;
            if (changes.dubDuck) e.settings.duck = level(changes.dubDuck.newValue, 0.2);
            if (changes.dubVolume) e.settings.volume = level(changes.dubVolume.newValue, 1);
            if (changes.dubMaxRate) e.settings.maxRate = Number(changes.dubMaxRate.newValue) || null;   // next sentence on
            // Đổi giọng / nhà cung cấp: khởi động lại engine với cùng nguồn
            if (changes.dubSecondVoice || changes.dubProvider || changes.dubGeminiVoice || changes.dubGeminiVoice2 || changes.dubVoiceName || changes.dubTtsModel || changes.costMode || changes.dubLocalVoice || changes.dubLocalVoice2) {
                const src = { video: e.d.video, getGroups: e.d.getGroups, container: dub.container };
                start(src);
            }
        });
    } catch (e) { /* ngoài extension */ }

    // ---------- Máy chủ giọng chạy chậm: nói cho người xem biết, một lần mỗi trang ----------
    // Máy chủ chậm thì giọng Việt trễ dần mà không có lỗi nào; người xem chỉ thấy "giọng bị trễ".
    async function canhBaoMayChuCham(opts) {
        if (dub.slowWarned) return;
        const r = await sendMessage({ action: "localTtsStatus" });
        const rtf = r && Number(r.rtf);
        if (!rtf || rtf < 0.8) return;                      // 0 = chưa đo được lượt nào
        dub.slowWarned = true;
        if (window.CST_UI && window.CST_UI.toast) {
            window.CST_UI.toast(
                `Máy chủ giọng đang chậm: tạo 1 giây lời nói mất ${rtf.toFixed(2)} giây (bình thường khoảng 0,25). Giọng Việt có thể trễ dần.`,
                { warn: true, actionLabel: "Mở Cài đặt", onAction: () => sendMessage({ action: "openOptions" }) }
            );
        }
    }

    // ---------- Tự chuyển về giọng VieNeu ngay khi máy chủ sẵn sàng ----------
    // Người xem không phải bấm "Thử lại": cứ 8 giây hỏi máy chủ một lần (tối đa 5 phút, chỉ khi
    // tab đang hiện và lồng tiếng vẫn bật). Máy chủ chạy lên là đổi giọng giữa chừng, liền mạch.
    let watchTimer = null;
    function doiVieNeuSanSang(opts) {
        if (watchTimer) return;
        const hetHan = Date.now() + 5 * 60 * 1000;
        const nhip = Number(window.CST_DUB_WATCH_MS) || 8000;      // rút ngắn được khi kiểm thử
        watchTimer = setInterval(async () => {
            const hetGio = Date.now() > hetHan;
            if (!dub.enabled || hetGio) { clearInterval(watchTimer); watchTimer = null; return; }
            if (document && document.hidden) return;           // tab ẩn: chờ, không hỏi liên tục
            const r = await sendMessage({ action: "localTtsStatus" });
            if (!r || !r.running) return;
            clearInterval(watchTimer);
            watchTimer = null;
            const s = await readSettings();
            if (window.CST_COST && window.CST_COST.PAID_TTS && s.dubProvider !== "vieneu" && s.dubProvider !== "auto") return;
            if (window.CST_UI && window.CST_UI.toast) window.CST_UI.toast("Giọng VieNeu đã sẵn sàng, đang chuyển sang giọng này.");
            start(opts);
        }, nhip);
    }

    // A stored 0..1 level. 0 is a real choice ("mute the original"), so `Number(x) || fallback`
    // is wrong here: it turned the Settings slider's 0% into 20%.
    function level(x, fallback) {
        const n = Number(x);
        return Number.isFinite(n) && x !== null && x !== "" ? Math.min(1, Math.max(0, n)) : fallback;
    }

    // One line for the quick menu under "Lồng tiếng Việt": the voice, then what is ready or wrong.
    function describeHealth() {
        const e = dub.engine;
        const st = dub.lastStatus;
        if (!dub.enabled || !e) return null;
        const voice = st && st.voice ? `Giọng ${st.voice}` : "Đang bật";
        let h;
        try { h = e.health(e.d.video.currentTime); } catch (err) { return { text: voice, warn: false }; }
        if (h.live) return { text: `${voice} · đọc trực tiếp, không chuẩn bị trước`, warn: false };
        const skipped = h.dropped ? `, đã bỏ ${h.dropped} câu để bắt kịp` : "";
        if (h.rtf != null && h.rtf >= 0.8) {
            return { text: `${voice} · máy chủ giọng chậm (1 giây lời mất ${h.rtf.toFixed(1).replace(".", ",")} giây)${skipped}`, warn: true };
        }
        // The video speaks fast and the voice keeps up with it (dub-engine paceLimits): say so, or a
        // quicker voice than usual looks like a fault
        const fast = h.pace != null && h.pace > 1.12 ? " · người nói nhanh, đọc nhanh theo" : "";
        // A slow voice on a fast speaker: the voice falls behind and lines get skipped. A quicker voice
        // makes fewer seconds of audio for the same words (measured, 1.9.9: late starts 59 -> 3 with a
        // 5.3 syllables/s voice instead of 3.6 on a fast talk), so it is suggested by name
        const alts = h.paceHigh != null && h.paceHigh >= SLOW_VOICE_PACE && st ? fasterVoices(st.voice) : [];
        const hint = alts.length ? ` · giọng này đọc chậm so với video, thử ${alts.join(" hoặc ")} để đỡ trễ và bỏ câu` : "";
        if (h.ahead >= 1) return { text: `${voice} · đã chuẩn bị trước ${Math.round(h.ahead)} giây${hint || fast}${skipped}`, warn: !!h.dropped || !!hint };
        const v = e.d.video;
        if (v && !v.paused) return { text: `${voice} · đang tạo giọng…${skipped}`, warn: !!h.dropped };
        return { text: voice, warn: false };
    }

    // The busiest quarter of the next 90 s needs the voice this much faster than its natural pace
    const SLOW_VOICE_PACE = 1.35;
    // Up to two voices of the same gender that speak clearly faster (same region first)
    function fasterVoices(name) {
        const L = window.CST_COST && window.CST_COST.LOCAL_TTS;
        const all = (L && L.voices) || [];
        const cur = all.find(v => v.id === name);
        if (!cur || !cur.sps || cur.sps >= 4.8) return [];
        return all.filter(v => v.id !== cur.id && v.gender === cur.gender && v.sps >= cur.sps + 0.8)
            .sort((a, b) => (b.region === cur.region) - (a.region === cur.region) || b.sps - a.sps)
            .slice(0, 2).map(v => v.id);
    }

    // Everything needed to read a dubbing problem after the fact, as one JSON text (the quick menu's
    // "Chép chẩn đoán" copies it). No key, no text of the video beyond line ids and times.
    function diagnostics() {
        const e = dub.engine;
        let snap = null, health = null;
        try { snap = e ? e.debugSnapshot() : null; } catch (err) { snap = { error: String(err && err.message || err) }; }
        try { health = describeHealth(); } catch (err) { health = null; }
        let version = "";
        try { version = chrome.runtime.getManifest().version; } catch (err) { /* page without the runtime */ }
        let video = "";
        try { video = new URL(location.href).searchParams.get("v") || location.pathname; } catch (err) { /* bỏ qua */ }
        const v = e && e.d ? e.d.video : null;
        return JSON.stringify({
            version, at: new Date().toISOString(), host: location.hostname, video,
            status: dub.lastStatus || null, health,
            settings: e ? { maxRate: e.settings.maxRate || null, secondVoice: !!e.settings.secondVoice, prefetchMax: e.settings.prefetchMax, duck: e.settings.duck, volume: e.settings.volume } : null,
            player: v ? { t: Math.round((v.currentTime || 0) * 100) / 100, rate: v.playbackRate, paused: !!v.paused, readyState: v.readyState, hidden: !!document.hidden } : null,
            engine: snap
        });
    }

    // ---------- Nhãn trạng thái trên video ----------
    function showDubBadge(container) {
        if (!container) return;
        let badge = container.querySelector(".cst-dub-badge");
        if (!badge) {
            badge = document.createElement("div");
            badge.className = "cst-dub-badge";
            badge.style.cssText = `
                position: absolute; top: 16px; left: 16px;
                padding: 6px 11px; border-radius: 999px;
                background: rgba(40,38,34,.94); color: #ECE8E1;
                border: 1px solid #3A3732; box-shadow: 0 8px 24px rgba(0,0,0,.4);
                font: 500 12px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
                z-index: 2147483000; pointer-events: none; max-width: 60%;
            `;
            container.appendChild(badge);
        }
        renderBadge();
    }

    function renderBadge() {
        const badge = document.querySelector(".cst-dub-badge");
        if (!badge) return;
        const st = dub.lastStatus;
        // Tối giản: nhãn bình thường (tên giọng) chỉ hiện 3 giây lúc bật rồi mờ đi; cảnh báo (chạm
        // ngân sách, phải đổi sang giọng hệ thống) thì giữ nguyên để người xem biết
        let text, warn = false;
        if (!st) text = "Lồng tiếng Việt";
        else if (st.budgetBlocked) { text = "Lồng tiếng: đã chạm ngân sách chi phí, ngừng tạo giọng AI"; warn = true; }
        else if (st.playBlocked) { text = "Lồng tiếng: Chrome đang chặn phát âm thanh, bấm vào trang video một lần để nghe"; warn = true; }
        else if (st.fallback) { text = `Lồng tiếng: đã chuyển sang giọng hệ thống (${st.reason === "budget" ? "chạm ngân sách giọng AI" : "giọng AI tạm không dùng được"})`; warn = true; }
        else text = `Lồng tiếng: ${st.voice || st.label}`;
        if (badge.textContent === text && badge.dataset.warn === String(warn)) return;
        badge.textContent = text;
        badge.dataset.warn = String(warn);
        badge.style.borderColor = warn ? "rgba(232,184,75,.55)" : "#3A3732";   // same warning edge as the toast
        badge.style.transition = "opacity .6s";
        badge.style.opacity = "1";
        clearTimeout(badgeTimer);
        if (!warn) badgeTimer = setTimeout(() => { badge.style.opacity = "0"; }, 3000);
    }
    let badgeTimer = null;

    // ---------- Chờ chuẩn bị (tối đa 5 giây) ----------
    // Tạm dừng video trong lúc tải phụ đề + dịch + tạo giọng cho đoạn sắp phát, phát tiếp NGAY khi
    // sẵn sàng (hoặc hết 5 giây). Người xem tự bấm phát trong lúc chờ: tôn trọng, bỏ chờ.
    // opts.initial: video mới mở (chưa phát): chặn lần tự phát đầu tiên của YouTube.
    const hold = { active: false };
    function prepareHold(video, ready, opts = {}) {
        if (!video || hold.active) return false;
        if (document.querySelector(".ad-showing")) return false;       // đang quảng cáo: chuẩn bị trong lúc đó
        if (ready()) return false;
        const maxMs = opts.maxMs || 5000;
        const t0 = performance.now();
        const shouldResume = opts.initial || !video.paused;
        hold.active = true;
        hold.byUs = true;
        const pauseNow = () => { try { hold.byUs = true; video.pause(); } catch (e) { /* bỏ qua */ } };
        if (!video.paused) pauseNow();
        const onPlay = () => {
            if (!hold.active) return;
            // Trình phát tự phát trong ~1,5 giây đầu (tự động phát video mới): giữ tạm dừng
            if (performance.now() - t0 < 1500) pauseNow();
            else end(false);                                            // người xem tự bấm phát
        };
        video.addEventListener("play", onPlay);
        const note = document.createElement("div");
        note.className = "cst-prepare-note";
        note.textContent = "Đang chuẩn bị phụ đề và giọng Việt…";
        // Same card as the toast and the quick menu: the product's dark surface, not a bare black box
        note.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 16px;" +
            "border-radius:12px;background:rgba(40,38,34,.94);color:#ECE8E1;border:1px solid #3A3732;" +
            "box-shadow:0 18px 46px rgba(0,0,0,.5);font:500 13px/1.4 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif;" +
            "z-index:2147483000;pointer-events:none";
        const box = opts.container || video.parentElement;
        try { box && box.appendChild(note); } catch (e) { /* bỏ qua */ }
        const iv = setInterval(() => { if (ready() || performance.now() - t0 >= maxMs) end(true); }, 100);
        function end(resume) {
            if (!hold.active) return;
            hold.active = false;
            clearInterval(iv);
            video.removeEventListener("play", onPlay);
            note.remove();
            hold.lastWaitMs = Math.round(performance.now() - t0);
            console.log(`[Lồng tiếng] Chờ chuẩn bị ${hold.lastWaitMs} ms${resume ? "" : " (người xem tự phát)"}`);
            // Video MỚI mở: YouTube thường tự phát 0,2 đến 0,4 giây trước khi kịp tạm dừng (đo thật) -> câu
            // đầu mất vài chữ, giọng Việt vào trễ. Còn ở sát đầu video thì quay về 0 rồi mới phát
            if (resume && opts.initial) { try { if (video.currentTime > 0.05 && video.currentTime < 1.5) video.currentTime = 0; } catch (e) { /* bỏ qua */ } }
            if (resume && shouldResume && video.paused) { const p = video.play(); if (p && p.catch) p.catch(() => {}); }
        }
        hold.cancel = () => end(false);
        hold.release = () => end(true);
        return true;
    }

    function hideDubBadge() {
        document.querySelectorAll(".cst-dub-badge").forEach(b => b.remove());
    }

    // The viewer corrected a line (subtitle-edits.js): rebuild the plans now. refresh(true) drops the
    // audio of every line whose text changed and keeps the rest, so only the edited lines re-render.
    function refreshText() {
        if (dub.engine) { try { dub.engine.refresh(true); } catch (e) { /* bỏ qua */ } }
    }

    window.CST_DUB = { dub, start, stop, describeHealth, diagnostics, fasterVoices, level, refreshText, forgetVideoAudio, showDubBadge, hideDubBadge, readSettings, prepareHold, hold };
})();

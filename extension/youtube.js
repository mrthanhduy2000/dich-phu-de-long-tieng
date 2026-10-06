// ============================================================
// DICH PHU DE TREN YOUTUBE
//
// Khac voi Coursera, YouTube khong dung the <track> chuan cua trinh
// duyet ma tu ve phu de bang ma rieng. Vi vay luong xu ly la:
//   1. Hoi cau noi (yt-bridge.js) de lay duong dan ban chep loi
//   2. Tai ban chep loi dang JSON tu may chu YouTube (kem thoi gian tung tu)
//   3. Gom cue thanh cau, dich bang chinh co che da dung cho Coursera
//   4. Bo phan doan tieng Viet (vi-segmenter.js) tu quyet dinh so cue,
//      diem cat va ngat dong; cue tieng Anh chi con la moc thoi gian
//   5. Tu ve phu de tieng Viet len video, dong bo theo thoi gian chay
// ============================================================

// Mỗi lần mã được nạp (kể cả nạp lại sau khi cập nhật tiện ích) có một mã thế hệ riêng. Nút và
// lớp phụ đề mang mã này; phần tử của mã CŨ (tab mở từ trước khi Tải lại, đã mất kết nối với tiện
// ích: bấm không phản hồi, không dịch được) bị dọn đi và thay bằng phần tử còn sống.
const YT_GEN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Thời điểm nạp mã này: phần tử của thế hệ CŨ HƠN thì ẩn, thế hệ mới hơn thì để yên (không hai bên ẩn nhau)
const YT_BORN = Date.now() + Math.random();
const YT_OVERLAY = `.cst-yt-overlay[data-cst-gen="${YT_GEN}"]`;
const YT_BTN = `.cst-ytp-btn[data-cst-gen="${YT_GEN}"]`;

const yt = {
    cues: [],           // cue tieng Anh: [{ start, end, text, words? }]
    groups: [],         // nhom dich: [{ text, cueIndexes, srcCues, start, end, translated, viCues }]
    viCues: [],         // cue tieng Viet da phan doan, sap theo thoi gian: [{ start, end, text, lines }]
    cueToGroupMap: new Map(),
    inFlightGroups: new Set(),
    active: false,
    busy: false,
    overlay: null,
    rafId: null,
    renderKey: "",
    lastSpokenVi: null,
    videoEl: null,
    currentVideoId: "",
    videoTitle: "",                 // the player's own title of currentVideoId (content.js pageVideoTitle)
    requestSeq: 0,
    resizeObserver: null,
    classObserver: null,
    capTionDisplayCu: null,
    daDichXong: false,
    huyDich: false,
    soNhomDaDich: 0,
    tongSoNhom: 0,
    vfcId: null,
    daGanSuKien: false,
    panelOpen: false      // bản chép lời đang mở: phụ đề nhường chỗ
};

// ============================================================
// CẤU HÌNH & QUẢN LÝ KIỂU DÁNG PHỤ ĐỀ YOUTUBE
// ============================================================
// Kiểu mặc định lấy từ MỘT nơi duy nhất (subtitle-style.js, nạp trước file này)
const defaultSubStyle = window.CST_STYLE.DEFAULT_STYLE;
let ytSubStyle = { ...defaultSubStyle };

function ytChuanHoaKieu(s) {
    return window.CST_STYLE ? window.CST_STYLE.normalizeStyle(s) : { ...defaultSubStyle, ...(s || {}) };
}

const ytSettings = {
    autoTranslate: true,        // Tự động dịch sang tiếng Việt khi phụ đề là ngôn ngữ khác
    dubEnabled: true,           // Tự bật lồng tiếng sau khi dịch (mặc định BẬT; nhớ lần bật/tắt gần nhất)
    prepareWait: true,          // Mở video mới: tạm dừng tối đa 5 giây chờ phụ đề + giọng Việt sẵn sàng
    skipSameLang: true,         // Bỏ qua dịch khi cùng ngôn ngữ
    smartSentenceBreak: true,   // Luôn bật: phân đoạn & ngắt dòng theo cú pháp tiếng Việt
    uiTheme: "auto"             // Light or dark for the on-player menu, same setting as the two pages
};

async function ytNapCaiDatKieu() {
    try {
        const res = await chrome.storage.sync.get(["subStyle", "dualMode", "skipSameLang", "autoTranslate", "dubEnabled", "dubPrepareWait", "uiTheme"]);
        if (res.uiTheme) ytSettings.uiTheme = res.uiTheme;
        ytSettings.prepareWait = res.dubPrepareWait !== false;
        if (res.autoTranslate !== undefined) ytSettings.autoTranslate = !!res.autoTranslate;
        // Chưa từng chọn (cài mới, kho cài đặt bị tạo lại) -> bật: người dùng muốn nghe giọng Việt ngay
        ytSettings.dubEnabled = res.dubEnabled !== false;
        ytSubStyle = ytChuanHoaKieu(res.subStyle);
        // dualMode is the one source of truth; subStyle.mode mirrors it (CST_STYLE.resolveDual)
        const dual = window.CST_STYLE ? window.CST_STYLE.resolveDual(res) : !!res.dualMode;
        ytSubStyle.mode = dual ? "dual" : "single";
        state.dualMode = dual;
        if (res.skipSameLang !== undefined) ytSettings.skipSameLang = !!res.skipSameLang;
        ytSettings.smartSentenceBreak = true;
    } catch (e) {
        console.warn("Chưa đọc được cài đặt kiểu phụ đề:", e);
    }
}

function ytApDungKieuPhuDe(overlay) {
    if (!overlay) return;
    const S = window.CST_STYLE;
    const s = ytChuanHoaKieu(ytSubStyle);

    overlay.style.fontFamily = S ? S.fontStack(s.fontFamily) : "Roboto, Arial, sans-serif";
    overlay.style.color = s.fontColor;
    overlay.style.fontWeight = s.fontWeight;
    overlay.style.lineHeight = String(s.lineHeight);
    overlay.style.backgroundColor = S ? S.backgroundColor(s) : "rgba(8, 8, 8, 0.75)";
    overlay.style.borderRadius = `${s.borderRadius}px`;
    overlay.style.textShadow = S ? S.textShadow(s) : "0 1px 2px rgba(0,0,0,0.8)";
    // Nền trong suốt thì bỏ luôn phần đệm để chữ không "lơ lửng" lệch tâm
    overlay.style.padding = S && S.backgroundColor(s) === "transparent" ? "2px 6px" : "0.18em 0.6em 0.22em";

    if (S) {
        // Phông web nạp xong thì vẽ lại (độ rộng chữ đổi nên ngắt dòng có thể đổi)
        S.ensureFont(document, s.fontFamily, s.fontWeight).then(ok => {
            if (!ok) console.warn(`[CST] Không nạp được phông "${S.getFont(s.fontFamily).family}", dùng phông dự phòng có dấu tiếng Việt`);
            yt.renderKey = "";
        });
    }
    yt.renderKey = "";
}

// Bo nho dem: xem lai video cu thi khong phai dich lai tu dau.
// Phien ban 2 luu cue tieng Viet da phan doan; du lieu phien ban cu (co the
// chua ma "[[__T0__]]" bi lot) duoc xoa bo.
const YT_CACHE_PREFIX = "ytcache4_";   // v4: kem nhom cau + ban dich co ngu canh cho long tieng (1.1.2)
const YT_CACHE_CU = "ytcache";
// 100 videos (2.4.0; 50 in 2.3.9, 15 before): the user watches a batch, then has the whole batch
// reviewed from this cache (background.js REVIEW_MARK counts the ones saved since the last review).
// Measured on the 15 saved on 2026-09-30: 1.32 MB, 90 KB a video, 6.8 KB a minute, so 100 such
// videos are ~9 MB and 100 of 35 minutes ~24 MB. storage.local alone holds 10 MB: the manifest asks
// for "unlimitedStorage". The byte cap is only a guard against a runaway store.
const YT_CACHE_TOI_DA = 100;
const YT_CACHE_MAX_BYTES = 64 * 1048576;
// UTF-8 bytes of a stored value, near enough: Vietnamese text is 1.15 bytes a character (measured)
const ytCacheBytes = v => Math.round(JSON.stringify(v).length * 1.15);

async function ytDocCache(videoId) {
    if (!videoId) return null;
    try {
        const key = YT_CACHE_PREFIX + videoId;
        const kq = await chrome.storage.local.get(key);
        const data = kq[key];
        if (!data || !Array.isArray(data.vi) || !Array.isArray(data.cues)) return null;
        return data;
    } catch (e) {
        return null;
    }
}

async function ytGhiCache(videoId) {
    if (!videoId || yt.viCues.length === 0) return;
    if (yt.groups.some(g => g.fallback)) {
        console.log("[AI Subtitle] Có đoạn dịch tạm bằng Google: không lưu bản dịch video này, lần sau dịch lại bằng Gemini");
        return;
    }
    try {
        const r = x => Math.round(x * 1000) / 1000;
        const key = YT_CACHE_PREFIX + videoId;
        await chrome.storage.local.set({
            [key]: {
                luc: Date.now(),
                cues: yt.cues.map(c => [r(c.start), r(c.end), c.text]),
                // the machine translation, never the viewer's edits: those live in subtitle-edits.js
                // and are laid over it on load, so a revert made in Settings really reverts
                vi: yt.viCues.map(c => [r(c.start), r(c.baseEnd != null ? c.baseEnd : c.end), (c.cstOrig ? c.cstOrig.lines : c.lines).join("\n")]),
                // Nhóm câu + bản dịch có ngữ cảnh: lồng tiếng xem lại không phải dịch lại
                g: yt.groups.filter(g => g.translated && g.viText).map(g => [
                    r(g.start), r(g.end), g.cstOrigViText != null ? g.cstOrigViText : g.viText,
                    g.srcCues.map(c => [r(c.start), r(c.end), c.text]),
                    g.viCues.map(c => [r(c.start), r(c.end), c.cstOrig ? c.cstOrig.text : c.text]),
                    g.midLine ? 1 : 0
                ])
            }
        });
        await ytDonCache();
    } catch (e) {
        console.warn("Khong ghi duoc bo nho dem:", e.message);
    }
}

// Giu lai cac video gan day nhat, xoa bot cai cu va toan bo cache phien ban cu
async function ytDonCache() {
    try {
        const tatCa = await chrome.storage.local.get(null);
        const cu = Object.keys(tatCa).filter(k => k.startsWith(YT_CACHE_CU) && !k.startsWith(YT_CACHE_PREFIX));
        // Terms unused for 60 days go, and so does an empty list: none is written since 2.3.1, and
        // 43 of the user's 51 lists were left empty from before (a missing list reads the same).
        // So does a channel list from before the stamp (content.js YT_TERMS_STAMP, 2.3.8)
        const ctxCu = Object.keys(tatCa).filter(k => k.startsWith("ctxterms_") &&
            (Date.now() - ((tatCa[k] || {}).luc || 0) > 60 * 864e5 || !((tatCa[k] || {}).terms || []).length ||
                !termsListUsable(k, tatCa[k])));
        cu.push(...ctxCu);
        if (cu.length) await chrome.storage.local.remove(cu);
        const keys = Object.keys(tatCa).filter(k => k.startsWith(YT_CACHE_PREFIX));
        keys.sort((a, b) => (tatCa[a].luc || 0) - (tatCa[b].luc || 0));
        // oldest first, until both the count and the bytes fit; the newest video always stays
        let bytes = keys.reduce((n, k) => n + ytCacheBytes(tatCa[k]), 0);
        const xoa = [];
        while (keys.length - xoa.length > 1 && (keys.length - xoa.length > YT_CACHE_TOI_DA || bytes > YT_CACHE_MAX_BYTES)) {
            bytes -= ytCacheBytes(tatCa[keys[xoa.length]]);
            xoa.push(keys[xoa.length]);
        }
        if (xoa.length) await chrome.storage.local.remove(xoa);
    } catch (e) { /* bo qua */ }
}

// Every YouTube tab ran ytDonCache on load, and it reads ALL of storage.local (up to 100 saved videos,
// the viewer's edits, the cost ledger: megabytes) only to find stale keys. Once a day is enough; a
// save (ytGhiCache) still sweeps after itself.
async function ytSweepCacheDaily() {
    try {
        const { ytSweptAt = 0 } = await chrome.storage.local.get({ ytSweptAt: 0 });
        if (Date.now() - ytSweptAt < 864e5) return;
        await chrome.storage.local.set({ ytSweptAt: Date.now() });
        await ytDonCache();
    } catch (e) { /* bỏ qua */ }
}

// Make sure the one bridge (yt-bridge.js, MAIN world) runs in this page. The manifest injects it at
// document_start; after an extension reload the service worker injects the same file. Asked once
// per page: the bridge ignores a second copy on its own.
let ytBridgeAsked = false;
function ytDamBaoBridge() {
    if (ytBridgeAsked) return;
    ytBridgeAsked = true;
    try {
        chrome.runtime.sendMessage({ action: "ensureYtBridge" }, () => { void chrome.runtime.lastError; });
    } catch (e) {
        console.warn("Chưa thể chèn bridge script:", e);
    }
}

// ---------- Hoi cau noi de lay danh sach phu de ----------
function ytHoiDanhSachPhuDe(timeoutMs = 4500) {
    ytDamBaoBridge();
    return new Promise((resolve, reject) => {
        const requestId = `cst_${Date.now()}_${yt.requestSeq++}`;

        const onMessage = event => {
            if (event.source !== window) return;
            const d = event.data;
            if (!d || d.cstType !== "TRA_LOI_PHU_DE" || d.requestId !== requestId) return;
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            clearInterval(resend);
            if (d.error) reject(new Error(d.error));
            else resolve(d);
        };

        const timer = setTimeout(() => {
            window.removeEventListener("message", onMessage);
            clearInterval(resend);
            reject(new Error("Trình phát YouTube chưa phản hồi. Hãy thử bấm lại hoặc phát video."));
        }, timeoutMs);

        window.addEventListener("message", onMessage);
        const ask = () => window.postMessage({ cstType: "YEU_CAU_PHU_DE", requestId }, "*");
        ask();
        // a bridge injected after an extension reload arrives a moment later: ask again until it answers
        const resend = setInterval(ask, 600);
    });
}

// ---------- Chon ban chep loi phu hop ----------
// ctx.spoken: the language spoken (ytNgonNguNoi); ctx.audio: the player's audio tracks. An ASR
// track in the language of an AI-dubbed audio track transcribes the dub, never the speaker: it is
// only a last resort. The spoken language's own tracks come first.
function ytChonTrack(tracks, skipSameLang = true, ctx = {}) {
    if (!tracks || tracks.length === 0) return null;
    const norm = c => String(c || "").toLowerCase().split(/[-_]/)[0];
    const dubbed = new Set(((ctx.audio && ctx.audio.tracks) || []).filter(t => t.isAutoDubbed).map(t => norm(t.lang)));
    if (dubbed.size) {
        const real = tracks.filter(t => !(t.kind === "asr" && dubbed.has(norm(t.languageCode))));
        if (real.length) tracks = real;
    }

    // Neu video da co phu de tieng Viet
    const viTrack = tracks.find(t => t.languageCode.startsWith("vi"));
    const viThuCong = tracks.find(t => t.languageCode.startsWith("vi") && t.kind !== "asr");

    if (viTrack && skipSameLang) {
        return {
            track: viThuCong || viTrack,
            daCoTiengViet: true
        };
    }

    // Uu tien: ngon ngu dang noi (thu cong > tu dong) > tieng Anh thu cong > tieng Anh tu dong > bat ky thu cong > bat ky
    const sp = ctx.spoken && ctx.spoken !== "vi" ? ctx.spoken : "";
    return {
        track:
            (sp && tracks.find(t => norm(t.languageCode) === sp && t.kind !== "asr")) ||
            (sp && tracks.find(t => norm(t.languageCode) === sp)) ||
            tracks.find(t => t.languageCode.startsWith("en") && t.kind !== "asr") ||
            tracks.find(t => t.languageCode.startsWith("en")) ||
            tracks.find(t => t.kind !== "asr") ||
            tracks[0],
        daCoTiengViet: false
    };
}

// ---------- Tai va doc ban chep loi ----------
// Nội dung phụ đề lấy qua cầu nối trong trang (yt-bridge.js): YouTube chỉ trả nội dung
// khi yêu cầu mang mã "pot" của trình phát. Cầu nối chưa sẵn sàng thì tải thẳng như cũ.
function ytHoiNoiDungPhuDe(baseUrl, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
        const requestId = `cstn_${Date.now()}_${yt.requestSeq++}`;
        const onMessage = event => {
            if (event.source !== window) return;
            const d = event.data;
            if (!d || d.cstType !== "TRA_LOI_NOI_DUNG_PHU_DE" || d.requestId !== requestId) return;
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            if (d.error) reject(new Error(d.error));
            else resolve(d);
        };
        const timer = setTimeout(() => {
            window.removeEventListener("message", onMessage);
            reject(new Error("bridge-timeout"));
        }, timeoutMs);
        window.addEventListener("message", onMessage);
        window.postMessage({ cstType: "YEU_CAU_NOI_DUNG_PHU_DE", requestId, baseUrl }, "*");
    });
}

async function ytTaiBanChepLoi(baseUrl) {
    let rawText = "";
    try {
        const r = await ytHoiNoiDungPhuDe(baseUrl);
        rawText = r.text || "";
        if (!rawText) console.warn(`[AI Subtitle] YouTube trả phụ đề rỗng (${r.reason || r.via}).`);
    } catch (e) {
        if (e.message !== "bridge-timeout") throw e;
        // Them fmt=json3 de may chu tra ve dang JSON thay vi XML, de doc hon
        const url = baseUrl.includes("fmt=") ? baseUrl : `${baseUrl}&fmt=json3`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`Máy chủ phụ đề trả về mã ${res.status}`);
        rawText = await res.text();
    }
    return ytDocNoiDungPhuDe(rawText);
}

function ytDocNoiDungPhuDe(rawText) {
    const cues = [];
    if (!rawText) return cues;

    // Cách 1: Thử parse dạng JSON3
    try {
        const data = JSON.parse(rawText);
        const events = data.events || [];
        for (const ev of events) {
            if (!ev.segs) continue;
            const text = ev.segs
                .map(s => s.utf8 || "")
                .join("")
                .replace(/\s+/g, " ")
                .trim();
            if (!text || text === "\n") continue;

            const start = (ev.tStartMs || 0) / 1000;
            const dur = (ev.dDurationMs || 0) / 1000;
            // Phu de tu dong co thoi gian TUNG TU (tOffsetMs): bo phan doan dung
            // de dat diem cat tieng Viet dung nhip noi thay vi noi suy tuyen tinh
            const words = [];
            for (const sg of ev.segs) {
                const w = (sg.utf8 || "").trim();
                if (!w) continue;
                words.push({ text: w, t: start + (sg.tOffsetMs || 0) / 1000 });
            }
            cues.push({ start, end: start + dur, text, words: words.length > 1 ? words : undefined });
        }
    } catch (parseErr) {
        // Cách 2: Parse XML dự phòng nếu YouTube trả về định dạng XML
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(rawText, "text/xml");
            const nodes = xmlDoc.querySelectorAll("p, text");
            for (const node of nodes) {
                const start = parseFloat(node.getAttribute("t") || node.getAttribute("start") || "0") / (node.getAttribute("t") ? 1000 : 1);
                const dur = parseFloat(node.getAttribute("d") || node.getAttribute("dur") || "0") / (node.getAttribute("d") ? 1000 : 1);
                const text = (node.textContent || "").replace(/\s+/g, " ").trim();
                if (text) {
                    cues.push({ start, end: start + dur, text });
                }
            }
        } catch (xmlErr) {
            console.warn("Không đọc được định dạng phụ đề XML:", xmlErr);
        }
    }

    // Phu de tu dong hay bi chong thoi gian, cat lai cho gon
    for (let i = 0; i < cues.length - 1; i++) {
        if (cues[i].end > cues[i + 1].start) cues[i].end = cues[i + 1].start;
    }

    return cues;
}

// ---------- Lop phu de tu ve ----------
// Phần tử của mã THẾ HỆ KHÁC trong cùng tab (sau khi Tải lại tiện ích, mã cũ còn chạy thêm tới 1,5
// giây): chỉ ẨN, tuyệt đối không xóa. Mã cũ tự tạo lại nút của nó ngay khi thấy nút bị xóa (theo dõi
// thay đổi DOM) và xóa nút của mã mới -> hai bên xóa / tạo lại nhau vô tận, trang treo cứng (đo thật
// 22/09/2026: tab YouTube treo, 330% CPU, sau khi Tải lại tiện ích). Ẩn chỉ đổi thuộc tính, không
// kích hoạt bộ theo dõi thêm / bớt phần tử của mã kia.
function ytAnCuaMaKhac(root, selector) {
    if (!root) return;
    root.querySelectorAll(selector).forEach(el => {
        if (el.dataset.cstGen === YT_GEN || el.style.display === "none") return;
        if (Number(el.dataset.cstBorn) > YT_BORN) return;          // của mã mới hơn: không đụng tới
        el.style.display = "none";
    });
}

function ytTaoLopPhuDe() {
    const player = document.querySelector("#movie_player") ||
                   document.querySelector(".html5-video-player");
    if (!player) return null;

    if (yt.dead) return null;
    // Lớp phụ đề của mã cũ (đã mất kết nối): ẨN, không xóa (xem ytAnCuaMaKhac)
    ytAnCuaMaKhac(player, ".cst-yt-overlay");
    let overlay = player.querySelector(YT_OVERLAY);
    if (overlay) {
        ytTheoDoiTrinhPhat(player);
        ytApDungKieuPhuDe(overlay);
        ytCapNhatKichThuoc(player, overlay);
        ytCapNhatViTri(player, overlay);
        return overlay;
    }

    overlay = document.createElement("div");
    overlay.className = "cst-yt-overlay";
    overlay.dataset.cstGen = YT_GEN;
    overlay.dataset.cstBorn = String(YT_BORN);
    overlay.style.cssText = `
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        max-width: 92%;
        width: max-content;
        box-sizing: border-box;
        text-align: center;
        white-space: pre;
        pointer-events: none;
        z-index: 60;
        opacity: 0;
        transition: opacity 0.12s ease-out, bottom 0.18s ease-out, top 0.18s ease-out, transform 0.24s cubic-bezier(.16,1,.3,1), max-width 0.24s cubic-bezier(.16,1,.3,1);
    `;
    ytApDungKieuPhuDe(overlay);
    player.appendChild(overlay);

    ytCapNhatKichThuoc(player, overlay);

    ytTheoDoiTrinhPhat(player);
    ytCapNhatViTri(player, overlay);

    return overlay;
}

// Co chu ty le theo chieu rong trinh phat va ti le font nguoi dung chon
function ytCapNhatKichThuoc(player, overlay) {
    if (!player || !overlay) return;
    const rong = player.clientWidth || 640;
    const baseCo = Math.max(14, Math.min(rong * 0.026, 40));
    const scale = window.CST_STYLE ? window.CST_STYLE.sizeFactor(ytSubStyle.fontSize) : 0.7;
    overlay.style.fontSize = `${(baseCo * scale).toFixed(1)}px`;
    yt.renderKey = "";
}

// Cỡ chữ và vị trí đổi theo kích thước trình phát (vào/ra toàn màn hình) và theo thanh
// điều khiển (YouTube thêm lớp ytp-autohide khi ẩn thanh). Lỗi cũ: hai bộ theo dõi chỉ
// tạo MỘT lần và giữ tham chiếu tới lớp phụ đề ĐẦU TIÊN; tắt/bật dịch hay chuyển video
// tạo lớp mới nhưng bộ theo dõi vẫn cập nhật lớp cũ đã bị xóa, nên phụ đề mới kẹt ở vị
// trí lúc tạo (ví dụ kẹt cao khi được tạo lúc thanh điều khiển đang hiện).
// Giờ luôn tìm lớp phụ đề HIỆN TẠI, và gắn lại nếu YouTube thay phần tử trình phát.
function ytTheoDoiTrinhPhat(player) {
    if (yt.observedPlayer === player) return;
    if (yt.resizeObserver) yt.resizeObserver.disconnect();
    if (yt.classObserver) yt.classObserver.disconnect();
    yt.observedPlayer = player;
    const lopHienTai = () => player.querySelector(YT_OVERLAY);
    if (window.ResizeObserver) {
        yt.resizeObserver = new ResizeObserver(() => {
            const o = lopHienTai();
            if (o) { ytCapNhatKichThuoc(player, o); ytCapNhatViTri(player, o); }
        });
        yt.resizeObserver.observe(player);
    }
    yt.classObserver = new MutationObserver(() => {
        const o = lopHienTai();
        if (!o) return;
        ytCapNhatViTri(player, o);
        // Đo lại khi hiệu ứng hiện/ẩn thanh điều khiển đã xong (bố cục thanh có thể đổi)
        clearTimeout(yt.viTriTimer);
        yt.viTriTimer = setTimeout(() => { const o2 = lopHienTai(); if (o2) ytCapNhatViTri(player, o2); }, 320);
    });
    yt.classObserver.observe(player, { attributes: true, attributeFilter: ["class"] });
}

// Chiều cao THẬT của thanh điều khiển YouTube đang hiện (0 khi đang ẩn). Đo trực tiếp
// vì giao diện YouTube mới có thanh điều khiển cao hơn. Trạng thái ẩn/hiện theo lớp
// ytp-autohide (không theo độ mờ: lúc vừa hiện, độ mờ còn gần 0 sẽ bị hiểu nhầm là ẩn).
function ytChieuCaoThanhDieuKhien(player) {
    if (player.classList.contains("ytp-autohide")) return 0;
    const bar = player.querySelector(".ytp-chrome-bottom");
    if (!bar) return 0;
    const cs = getComputedStyle(bar);
    if (cs.display === "none" || cs.visibility === "hidden") return 0;
    const pr = player.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    if (!br.height || br.top >= pr.bottom) return 0;
    return Math.min(pr.height * 0.4, pr.bottom - br.top);
}

// Lề người dùng chọn tính từ mép khung video và được GIỮ NGUYÊN. Lỗi cũ: mỗi lần thanh
// điều khiển hiện ra (rê chuột, tạm dừng), phụ đề bị cộng cứng 64 px nên nhảy lên cao dù
// lề chỉ 1 đến 3%. Giờ chỉ nâng khi thanh điều khiển THỰC SỰ đè lên phụ đề, nâng vừa đủ
// để không bị che, và trượt mượt; thanh ẩn đi thì trở lại đúng lề đã chọn.
function ytCapNhatViTri(player, overlay) {
    if (!player || !overlay) return;
    // With the transcript panel open the picture is narrower: keep the subtitles inside what is left
    const room = ytSideRoom();
    if (room) {
        overlay.style.maxWidth = `min(92%, calc(100% - ${room + 48}px))`;
        overlay.style.transform = `translateX(calc(-50% - ${Math.round(room / 2)}px))`;
    } else {
        overlay.style.maxWidth = "92%";
        overlay.style.transform = "translateX(-50%)";
    }
    const offset = ytSubStyle.offset !== undefined ? ytSubStyle.offset : defaultSubStyle.offset;
    const margin = player.clientHeight * offset / 100 + 6;
    if (ytSubStyle.position === "top") {
        overlay.style.top = `${Math.round(margin)}px`;
        overlay.style.bottom = "auto";
    } else {
        // "Luôn giữ sát lề": không nhích lên; vẽ trên thanh điều khiển (không chặn chuột)
        const pin = !!ytSubStyle.pinBottom;
        const bar = pin ? 0 : ytChieuCaoThanhDieuKhien(player);
        overlay.style.top = "auto";
        overlay.style.zIndex = pin ? "70" : "60";
        overlay.style.bottom = `${Math.round(Math.max(margin, bar ? bar + 6 : 0))}px`;
    }
}

// Tam an phu de goc cua YouTube de hai lop khong chong len nhau
function ytAnPhuDeGoc(an) {
    const khung = document.querySelector(".ytp-caption-window-container");
    if (!khung) return;
    if (an) {
        if (yt.capTionDisplayCu === null) yt.capTionDisplayCu = khung.style.display || "";
        khung.style.display = "none";
    } else if (yt.capTionDisplayCu !== null) {
        khung.style.display = yt.capTionDisplayCu;
        yt.capTionDisplayCu = null;
    }
}

function ytXoaLopPhuDe() {
    const overlay = document.querySelector(YT_OVERLAY);
    if (overlay) overlay.remove();
    yt.overlay = null;
}

// ---------- Ve noi dung phu de (theo dong da ngat) ----------
// Dong da ngat san theo cu phap (toi da ~42 ky tu). Neu khung hep hoac chu
// to lam mot dong vuot be rong, ngat lai bang CHINH thuat toan tieng Viet
// voi so ky tu vua khung, thay vi de trinh duyet tu xuong dong tuy tien.

// Pixels taken on the right by what we draw over the player: the transcript panel (392 + 12) or
// the quick menu (340 + 12). The subtitle moves left of it instead of running underneath: seen
// on a real page, the open menu hid the end of both subtitle lines.
function ytSideRoom() {
    return Math.max(yt.panelOpen ? 404 : 0, yt.menuOpen ? 352 : 0);
}

function ytVuaKhung(lines, text, overlay, scale) {
    const S = window.CST_STYLE;
    if (!S || !S.fitLines) return lines;
    const box = overlay.parentElement;
    const room = ytSideRoom();
    const w = (box && box.clientWidth) || 0;
    // what the transcript panel or the quick menu leaves free on the left, as a share of the player
    const rong = room && w ? Math.max(0.3, Math.min(0.92, (w - room - 48) / w)) : 0.92;
    return S.fitLines(lines, text, overlay, { scale, box: overlay.parentElement, widthRatio: rong });
}

function ytTaoKhoiChu(lines, className, css) {
    const div = document.createElement("div");
    div.className = className;
    if (css) div.style.cssText = css;
    lines.forEach((l, i) => {
        if (i) div.appendChild(document.createElement("br"));
        div.appendChild(document.createTextNode(l));
    });
    return div;
}

function ytVePhuDe(overlay, viCue, enText, opts = {}) {
    const s = ytChuanHoaKieu(ytSubStyle);
    const isDual = s.mode === "dual" || state.dualMode;
    const blocks = [];
    if (viCue) {
        const lines = ytVuaKhung(viCue.lines && viCue.lines.length ? viCue.lines : [viCue.text], viCue.text, overlay, 1);
        blocks.push(ytTaoKhoiChu(lines, "cst-vi"));
    }
    if (enText && (isDual || !viCue)) {
        const scale = viCue ? s.origScale / 100 : 1;
        const seg = window.CST_VI_SEG;
        const enLines = seg ? ytVuaKhung([enText], enText, overlay, scale) : [enText];
        const css = viCue
            ? `font-size:${scale.toFixed(2)}em;color:${s.origColor};font-weight:400;margin-top:0.12em;`
            : "opacity:0.85;";
        const block = ytTaoKhoiChu(enLines, "cst-orig", css);
        if (viCue && state.originalFirst) {
            block.style.marginTop = "0";
            block.style.marginBottom = "0.12em";
            blocks.unshift(block);
        } else {
            blocks.push(block);
        }
    }
    overlay.replaceChildren(...blocks);
    overlay.style.opacity = blocks.length ? (opts.dim ? "0.85" : "1") : "0";
}

// ---------- Tim cue dang phat ----------
// Dung tim kiem nhi phan vi ban chep loi co the co hang nghin dong
function ytTimTrong(list, timeSeconds) {
    let lo = 0, hi = list.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].start > timeSeconds) hi = mid - 1;
        else if (list[mid].end <= timeSeconds) lo = mid + 1;
        else return mid;
    }
    return -1;
}

function ytTimCue(timeSeconds) {
    return ytTimTrong(yt.cues, timeSeconds);
}

// ---------- Dich mot nhom & dung cue tieng Viet ----------
function ytGhepViCues() {
    const all = [];
    for (const g of yt.groups) if (g.viCues) all.push(...g.viCues);
    all.sort((a, b) => a.start - b.start);
    // Dam bao khong chong lan giua cac nhom (nhom sau thang)
    for (let i = 1; i < all.length; i++) {
        if (all[i].start < all[i - 1].end) all[i - 1].end = Math.max(all[i - 1].start + 0.05, all[i].start);
    }
    // display copies that linger into the gap after them (CST_STYLE.lingerCues); the group cues
    // keep the subtitle timing the voice plans from. Edits reach both (ytApplyEdits walks both).
    yt.viCues = window.CST_STYLE && window.CST_STYLE.lingerCues ? window.CST_STYLE.lingerCues(all.map(c => ({ ...c }))) : all;
    ytApplyEdits();
}

// Translation windows fixed by the group list alone (1.7.3). ytChonCuaSo used to build a window
// around whichever group a worker picked: small near the playhead, larger further on, cut short by
// what was in flight. Opening the video again (YouTube resumes where the viewer left off) built
// different windows, so the translation cache, keyed by the exact sentences, missed and Gemini was
// paid again for lines it had already translated. Now each group belongs to exactly one window
// that depends only on the text: a window closes at a sentence end once it holds WIN_SOFT_CHARS or
// WIN_SOFT_GROUPS, never grows past WIN_HARD_CHARS / WIN_HARD_GROUPS or WIN_MAX_SPAN seconds, and a
// sentence that runs across groups stays in one window (the old rule: never a fragment alone). The
// prefetch takes a window only when all of it lies inside the translate-ahead horizon.
// 2.3.2: groups are single sentences more often now (splitCuesAtSentenceEnds), so a window holds
// up to 8 / 12 of them; at 4 / 6 the same text took 29% more requests, at 8 / 12 it takes 6% more.
const WIN_SOFT_CHARS = 420, WIN_SOFT_GROUPS = 8, WIN_HARD_CHARS = 800, WIN_HARD_GROUPS = 12, WIN_MAX_SPAN = 45;
function ytCanonicalWindows(groups) {
    const of = new Array(groups.length);
    const wins = [];
    let cur = [], chars = 0;
    const close = () => {
        if (cur.length) { cur.forEach(i => { of[i] = wins.length; }); wins.push(cur); }
        cur = []; chars = 0;
    };
    // A caption line cut at a sentence end (splitCuesAtSentenceEnds): the window does not close at its
    // soft limit before the `midLine` group, so the voice's segment across the cut (dub-planner.js)
    // arrives in one piece. The hard limits hold there too. 2.3.2 let a window run past them into any
    // `midLine` group, but those come in runs (up to 26 in a row on the user's punctuated videos), and
    // windows reached 3,075 characters and 142 s: longer than the 90-120 s the prefetch looks ahead,
    // so one was sent only once the viewer was inside it. Closing there costs 3 to 12 more requests
    // a video (~600 input tokens each); when the second half arrives after the first began playing,
    // the voice starts it as a new segment (dub-planner.js opts.spoken) instead of losing its words.
    groups.forEach((g, i) => {
        const len = String(g.text || "").length + 1;
        if (cur.length && (chars + len > WIN_HARD_CHARS || cur.length >= WIN_HARD_GROUPS ||
            g.end - groups[cur[0]].start > WIN_MAX_SPAN)) close();
        cur.push(i);
        chars += len;
        const next = groups[i + 1];
        if (groupEndsSentence(g) && !(next && next.midLine) && (chars >= WIN_SOFT_CHARS || cur.length >= WIN_SOFT_GROUPS)) close();
    });
    close();
    // A short tail (a closing "Thanks for watching.") joins the window before it when that stays under
    // every hard limit: a request of its own paid the whole system prompt for one line
    const size = w => w.reduce((n, i) => n + String(groups[i].text || "").length + 1, 0);
    const tail = wins[wins.length - 1], prev = wins[wins.length - 2];
    if (prev && size(tail) < 160 && size(prev) + size(tail) <= WIN_HARD_CHARS && prev.length + tail.length <= WIN_HARD_GROUPS &&
        groups[tail[tail.length - 1]].end - groups[prev[0]].start <= WIN_MAX_SPAN) {
        prev.push(...wins.pop());
        tail.forEach(i => { of[i] = wins.length - 1; });
    }
    return { groups, of, wins };
}

function ytWindows(groups) {
    if (!yt.windows || yt.windows.groups !== groups) yt.windows = ytCanonicalWindows(groups);
    return yt.windows;
}

// True when gIdx's window should wait for the window before it: that one is in flight or still to
// do, and gIdx's window does not play within YT_CONTEXT_WAIT_SEC. Sent together, the second request
// never saw how the first was translated (no previous translation, no terms agreed there).
const YT_CONTEXT_WAIT_SEC = 20;
function ytWaitForWindowBefore(groups, gIdx, curTime) {
    const w = ytWindows(groups);
    const at = w.of[gIdx];
    if (!(at > 0) || groups[w.wins[at][0]].start - curTime <= YT_CONTEXT_WAIT_SEC) return false;
    return w.wins[at - 1].some(k => yt.inFlightGroups.has(k) ||
        (!groups[k].translated && !(groups[k].retryAt > Date.now()) && groups[k].end >= curTime - 5));
}

// The untranslated groups of gIdx's window, or [] while any of them is being translated
function ytChonCuaSo(gIdx) {
    const groups = yt.groups;
    if (!groups[gIdx] || groups[gIdx].translated || yt.inFlightGroups.has(gIdx)) return [];
    const w = ytWindows(groups);
    const idxs = w.wins[w.of[gIdx]].filter(i => !groups[i].translated);
    return idxs.some(i => yt.inFlightGroups.has(i)) ? [] : idxs;
}

// A unit whose translation also holds the next units' content (CST_QUALITY.trimContextLeak).
// Windows are translated at different times, so check each new unit against its translated
// neighbours both ways: the unit before it may be the one that leaked into this one's content.
function ytTrimLeaks(groups, idxs) {
    const Q = window.CST_QUALITY;
    if (!Q || !Q.trimContextLeak) return 0;
    const check = new Set();
    for (const i of idxs) { check.add(i - 1); check.add(i); }
    let n = 0;
    // A unit that opens with the unit before it again (CST_QUALITY.fixRepeatedHeads): the repeat is
    // dropped and the two are split again by their source lengths. Cached groups carry no .text
    const src = g => g.text || (g.srcCues || []).map(c => c.text).join(" ");
    // A sound caption ("[Music]") in square brackets, so the voice leaves it silent (2.3.1). Counted
    // apart from leaks, but in the return value: ytRepairCachedLeaks redraws what changed
    let notes = 0;
    if (Q.fixSoundNotes) {
        for (const k of check) {
            const g = groups[k];
            if (!g || !g.viText) continue;
            const [v] = Q.fixSoundNotes([g.viText], [src(g)]);
            if (v === g.viText) continue;
            g.viText = v;
            g.viCues = segmentGroupVi(g, v, groups[k + 1] ? groups[k + 1].start : undefined);
            notes++;
        }
    }
    if (Q.fixRepeatedHeads) {
        for (const k of check) {
            const a = groups[k], b = groups[k + 1];
            if (!a || !b || !a.viText || !b.viText) continue;
            const [va, vb] = Q.fixRepeatedHeads([a.viText, b.viText], [src(a), src(b)]);
            if (va === a.viText && vb === b.viText) continue;
            a.viText = va;
            b.viText = vb;
            a.viCues = segmentGroupVi(a, va, b.start);
            b.viCues = segmentGroupVi(b, vb, groups[k + 2] ? groups[k + 2].start : undefined);
            n++;
        }
    }
    // A run of answers that slid by an item (CST_QUALITY.realignSentences), also across a window seam:
    // each stretch of translated groups around the new ones is dealt its sentences again
    if (Q.realignSentences) {
        const lo = Math.max(0, Math.min(...idxs) - 6), hi = Math.min(groups.length - 1, Math.max(...idxs) + 6);
        for (let a = lo; a <= hi; a++) {
            if (!groups[a] || !groups[a].viText) continue;
            let b = a;
            while (b + 1 <= hi && groups[b + 1] && groups[b + 1].viText) b++;
            const run = groups.slice(a, b + 1);
            const before = run.map(g => g.viText);
            const after = Q.realignSentences(run.map(src), before);
            after.forEach((v, k) => {
                if (v === before[k]) return;
                const g = run[k];
                g.viText = v;
                g.viCues = segmentGroupVi(g, v, groups[a + k + 1] ? groups[a + k + 1].start : undefined);
                n++;
            });
            a = b;
        }
    }
    for (const k of check) {
        const g = groups[k];
        if (!g || !g.viText) continue;
        const next = [groups[k + 1], groups[k + 2]].filter(x => x && x.viText).map(x => x.viText).join(" ");
        if (!next) continue;
        const cut = Q.trimContextLeak(g.viText, next, { src: src(g) });
        if (cut === g.viText) continue;
        g.viText = cut;
        g.viCues = segmentGroupVi(g, cut, groups[k + 1] ? groups[k + 1].start : undefined);
        n++;
    }
    if (n) console.warn(`[AI Subtitle] Bỏ phần dịch lấn sang câu sau ở ${n} nhóm`);
    return n + notes;
}

// Translations cached before the leak check existed can still carry it. Repair them on load, with
// no request: trim the group the voice reads (yt.dubGroups) and redraw the overlay cues it covers.
function ytRepairCachedLeaks() {
    const gs = yt.dubGroups || [];
    const before = gs.map(g => g.viText);
    if (!ytTrimLeaks(gs, gs.map((g, i) => i))) return 0;
    let n = 0;
    gs.forEach((g, i) => {
        if (g.viText === before[i]) return;
        n++;
        const until = gs[i + 1] ? gs[i + 1].start : Infinity;
        yt.viCues = yt.viCues.filter(c => c.start < g.start - 0.001 || c.start >= until - 0.001);
        for (const c of g.viCues) yt.viCues.push({ start: c.start, end: c.end, text: c.text, lines: c.lines || [c.text] });
    });
    yt.viCues.sort((a, b) => a.start - b.start);
    for (let i = 1; i < yt.viCues.length; i++) {
        if (yt.viCues[i].start < yt.viCues[i - 1].end) yt.viCues[i - 1].end = Math.max(yt.viCues[i - 1].start + 0.05, yt.viCues[i].start);
    }
    return n;
}

// engine: who produced the translation. A context-free Google fallback (Gemini briefly failing) is
// shown, but the video is then not saved to the per-video cache (ytGhiCache), or it would come back
// on every later visit instead of the Gemini translation
function ytGanBanDich(groups, idxs, translations, engine) {
    idxs.forEach((gi, k) => {
        const vi = translations[k];
        if (!vi) return;
        const nextStart = groups[gi + 1] ? groups[gi + 1].start : undefined;
        const g = groups[gi];
        if (!g.translated) yt.soNhomDaDich++;
        g.fallback = engine === "google_fallback";
        g.viText = vi;                 // bản dịch có ngữ cảnh (còn dấu ngắt nghỉ ¦) cho lồng tiếng
        g.viCues = segmentGroupVi(g, vi, nextStart);
        g.translated = true;
    });
    ytTrimLeaks(groups, idxs);
    ytGhepViCues();
    yt.renderKey = "";
}

// A refine landing after the video was translated and saved (ytGhiCache) used to stay out of the
// per-video copy, so the next visit showed the pre-refine line (BACKLOG 10, fixed 1.9.4). Refines
// come in bursts: one save 500 ms after the last, and only for the video they belong to.
function ytSaveAfterRefine(groups) {
    const videoId = yt.currentVideoId;
    clearTimeout(yt.refineSaveTimer);
    yt.refineSaveTimer = setTimeout(() => {
        yt.refineSaveTimer = null;
        if (yt.huyDich || yt.groups !== groups || !yt.daDichXong || !videoId || yt.currentVideoId !== videoId) return;
        ytGhiCache(videoId);
    }, 500);
}

async function ytDichNhom(gIdx) {
    const groups = yt.groups;
    const session = yt.session;
    if (!session) return false;
    const idxs = ytChonCuaSo(gIdx);
    if (!idxs.length) return false;

    idxs.forEach(i => yt.inFlightGroups.add(i));
    try {
        const r = await translateWindow(session, idxs, {
            realtime: true,
            // Ban dich lai (sau khi phat hien dau hieu dich may) ve sau thi thay the
            onRefined: better => {
                if (yt.huyDich || yt.groups !== groups) return;
                ytGanBanDich(groups, idxs, better.translations, better.engine);
                console.log(`[AI Subtitle] Đã dịch lại tự nhiên hơn cho nhóm ${idxs.join(", ")}`);
                ytSaveAfterRefine(groups);
            }
        });
        // Nguoi dung da tat dich hoac chuyen video trong luc cho
        if (yt.huyDich || yt.groups !== groups) return false;
        if (!r.translations || r.translations.every(t => !t)) return false;
        ytGanBanDich(groups, idxs, r.translations, r.engine);
        return true;
    } catch (e) {
        console.warn(`Dịch nhóm ${idxs.join(",")} lỗi:`, e.message);
        return false;
    } finally {
        if (yt.groups === groups) idxs.forEach(i => yt.inFlightGroups.delete(i));
    }
}

// ---------- Vong lap dong bo & Dich khan cap theo thoi gian thuc (Real-time Fast Lane) ----------
// Dòng phụ đề tại t, hoặc dòng NGAY SAU t (vị trí rơi vào khoảng lặng giữa hai dòng)
function ytCueTaiHoacSau(t) {
    const i = ytTimCue(t);
    if (i !== -1) return i;
    return yt.cues.findIndex(c => c.start >= t);
}

function ytDichKhanCap(cueIdx) {
    if (cueIdx < 0 || cueIdx >= yt.cues.length) return;
    const gIdx = yt.cueToGroupMap.get(cueIdx);
    if (gIdx === undefined) return;
    ytDichNhom(gIdx);
}

// The player marks an ad with a class on itself. Found once, looked up again if YouTube replaced it
function ytAdShowing() {
    let p = yt.adPlayer;
    if (!p || !p.isConnected) p = yt.adPlayer = document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
    return !!(p && p.classList && (p.classList.contains("ad-showing") || p.classList.contains("ad-interrupting")));
}

function ytBatDauDongBo() {
    ytDungDongBo();

    const capNhat = () => {
        if (!yt.active) return;

        const video = yt.videoEl;
        const overlay = yt.overlay;
        if (!video || !overlay) return;

        // An ad plays in this same <video> and its clock is not the lecture's (1.9.3): nothing is
        // drawn and nothing is sent for translation until it is over
        if (ytAdShowing()) {
            if (yt.renderKey !== "ad") { yt.renderKey = "ad"; ytVePhuDe(overlay, null, ""); }
            return;
        }

        const t = video.currentTime;
        const viIdx = ytTimTrong(yt.viCues, t);
        const enIdx = ytTimCue(t);
        const isDual = ytSubStyle.mode === "dual" || state.dualMode;
        const key = `${viIdx}|${isDual ? enIdx : ""}|${viIdx === -1 ? enIdx : ""}`;
        if (key === yt.renderKey) return;
        yt.renderKey = key;

        const enText = enIdx !== -1 ? yt.cues[enIdx].text : "";

        if (viIdx !== -1) {
            const viCue = yt.viCues[viIdx];
            ytVePhuDe(overlay, viCue, isDual ? enText : "");
            return;
        }

        if (enIdx === -1) {
            ytVePhuDe(overlay, null, "");
            return;
        }

        // Câu hiện tại chưa dịch kịp:
        // 1. Kích hoạt dịch khẩn cấp ngay lập tức (ưu tiên số 1) và dịch trước 2 nhóm kế
        // 2. Hiện tạm câu gốc để người xem KHÔNG bị mất phụ đề
        const gIdx = yt.cueToGroupMap.get(enIdx);
        const group = gIdx !== undefined ? yt.groups[gIdx] : null;
        if (group && !group.translated) {
            ytDichNhom(gIdx);
            // the next two groups too, unless they sit in a later window that plays far enough ahead
            // to wait for this one's translation (the prefetch sends it then)
            for (const k of [gIdx + 1, gIdx + 2]) {
                if (k < yt.groups.length && !ytWaitForWindowBefore(yt.groups, k, t)) ytDichNhom(k);
            }
            ytVePhuDe(overlay, null, enText, { dim: true });
        } else {
            ytVePhuDe(overlay, null, "");
        }
    };

    if (yt.videoEl && typeof yt.videoEl.requestVideoFrameCallback === "function") {
        const vong = () => {
            if (!yt.active) return;
            capNhat();
            yt.vfcId = yt.videoEl.requestVideoFrameCallback(vong);
        };
        yt.vfcId = yt.videoEl.requestVideoFrameCallback(vong);
        // requestVideoFrameCallback dung khi video tam dung: van can cap nhat khi tua/doi kieu
        const vongCham = () => {
            if (!yt.active) return;
            if (yt.videoEl && yt.videoEl.paused) capNhat();
            yt.rafId = setTimeout(vongCham, 250);
        };
        yt.rafId = setTimeout(vongCham, 250);
    } else {
        const vong = () => {
            if (!yt.active) return;
            capNhat();
            yt.rafId = requestAnimationFrame(vong);
        };
        yt.rafId = requestAnimationFrame(vong);
    }

    // Tua hoac doi toc do phat thi phai tinh lai ngay
    if (yt.videoEl && !yt.daGanSuKien) {
        const datLai = () => {
            yt.renderKey = "";
            yt.lastSpokenVi = null;
            // Khi tua, kích hoạt dịch khẩn cấp ngay tại thời điểm mới
            if (yt.videoEl) {
                const seekIdx = ytCueTaiHoacSau(yt.videoEl.currentTime);
                if (seekIdx !== -1) ytDichKhanCap(seekIdx);
            }
        };
        yt.videoEl.addEventListener("seeked", datLai);
        yt.videoEl.addEventListener("ratechange", datLai);
        yt.daGanSuKien = true;
    }
}

function ytDungDongBo() {
    if (yt.rafId) {
        cancelAnimationFrame(yt.rafId);
        clearTimeout(yt.rafId);
    }
    if (yt.vfcId && yt.videoEl && typeof yt.videoEl.cancelVideoFrameCallback === "function") {
        yt.videoEl.cancelVideoFrameCallback(yt.vfcId);
    }
    yt.rafId = null;
    yt.vfcId = null;
    yt.renderKey = "";
}

// ---------- Động cơ dịch đa luồng cửa sổ trượt (Multi-Worker Sliding Window Engine) ----------
// 2 luồng là đủ theo kịp tốc độ xem; luồng thứ 3 chủ yếu dịch xa phía trước (lãng phí nếu người dùng tua)
const NUM_CONCURRENT_WORKERS = 2;

async function ytChayTienTrinhPrefetch(groups) {
    yt.tongSoNhom = groups.length;
    yt.soNhomDaDich = groups.filter(g => g.translated).length;
    yt.daDichXong = false;

    // Chỉ dịch trước trong khoảng "translateAhead" giây quanh vị trí đang xem
    // (không dịch cả video khi người xem có thể chỉ xem vài phút).
    const ahead = () => (window.CST_COST ? window.CST_COST.getMode(state.costMode).translateAhead : 120);

    const worker = async (workerId) => {
        while (!yt.huyDich && yt.groups === groups) {
            const video = yt.videoEl;
            const curTime = video ? video.currentTime : 0;
            const horizon = curTime + ahead();

            // Tìm nhóm chưa dịch có độ ưu tiên cao nhất gần playhead nhất
            let bestGroupIdx = -1;
            let bestDist = Infinity;

            for (let i = 0; i < groups.length; i++) {
                const g = groups[i];
                if (g.translated || yt.inFlightGroups.has(i)) continue;
                if (g.retryAt && g.retryAt > Date.now()) continue;
                if (g.end < curTime - 5) continue;
                const win = ytWindows(groups).wins[ytWindows(groups).of[i]];
                if (groups[win[win.length - 1]].start > horizon) continue;   // all of its window, or wait
                if (win.some(k => yt.inFlightGroups.has(k))) continue;        // a mate is being translated

                const diff = g.start - curTime;
                if (ytWaitForWindowBefore(groups, i, curTime)) continue;

                // Trọng số ưu tiên: các câu sắp phát trong 0s -> 45s có điểm số cao nhất
                let score = 0;
                if (diff >= -2 && diff <= 45) {
                    score = diff; // Cực kỳ gần playhead
                } else if (diff > 45) {
                    score = 100 + diff; // Trong tương lai
                } else {
                    score = 1000 + Math.abs(diff); // Đã trôi qua
                }

                if (score < bestDist) {
                    bestDist = score;
                    bestGroupIdx = i;
                }
            }

            if (bestGroupIdx === -1) {
                if (groups.every(g => g.translated)) break;
                // Chưa tới vùng cần dịch (hoặc worker khác đang dịch): chờ người xem tiến lên
                await new Promise(r => setTimeout(r, yt.inFlightGroups.size > 0 ? 150 : 1000));
                continue;
            }

            // The group's fixed window (ytCanonicalWindows), wherever the viewer is
            const win = ytWindows(groups).wins[ytWindows(groups).of[bestGroupIdx]];
            const ok = await ytDichNhom(bestGroupIdx);
            if (!ok && !groups[bestGroupIdx].translated) {
                // Lỗi mạng/hạn ngạch: đánh dấu tạm để không lặp vô hạn. Câu sắp phát (trong 30
                // giây tới) thử lại sau 2 rồi 4, 8 giây: chờ cố định 15 giây từng làm phụ đề và
                // giọng đọc im cả quãng. Câu còn xa: 15 giây như cũ. The whole window waits: marking
                // only the picked group let a worker send the same window again at once via a mate.
                const g = groups[bestGroupIdx];
                const fails = (g.fails || 0) + 1;
                const near = yt.videoEl && g.start - yt.videoEl.currentTime < 30;
                const retryAt = Date.now() + (near ? Math.min(8000, 1000 * 2 ** fails) : 15000);
                for (const k of win) if (!groups[k].translated) { groups[k].fails = fails; groups[k].retryAt = retryAt; }
                await new Promise(r => setTimeout(r, 400));
                if (groups.every(g => g.translated || (g.retryAt && g.retryAt > Date.now()))) await new Promise(r => setTimeout(r, 2000));
            }

            // Kích hoạt hiển thị ngay khi nhóm đầu tiên hoàn thành
            if (!yt.active && yt.soNhomDaDich > 0) {
                yt.active = true;
                ytBatDauDongBo();
                ytDatTrangThaiNut("on");
            }

            // Nghỉ ngắn để nhường luồng trình duyệt
            await new Promise(r => setTimeout(r, 20));
        }
    };

    const workers = [];
    for (let w = 0; w < NUM_CONCURRENT_WORKERS; w++) {
        workers.push(worker(w));
    }
    await Promise.all(workers);

    if (yt.groups !== groups || yt.huyDich) return;
    yt.daDichXong = groups.every(g => g.translated);
    if (yt.daDichXong) ytGhiCache(yt.currentVideoId);
}

function ytKichHoatHienThi() {
    yt.overlay = ytTaoLopPhuDe();
    ytAnPhuDeGoc(true);
    yt.active = true;
    yt.renderKey = "";
    yt.lastSpokenVi = null;
    ytBatDauDongBo();
    if (window.CST_DUB) window.CST_DUB.dub.videoEl = yt.videoEl;
    ytCapNhatTrangThaiNutThanhDieuKhien();
    ytDatTrangThaiNut("on");
}

// Phụ đề tiếng Việt có sẵn: hiển thị nguyên (0 lượt gọi Gemini); lồng tiếng đọc thẳng
// phụ đề tiếng Việt, nhịp theo chính nó
function ytHienThiNguyenTiengViet(viCues) {
    const seg = window.CST_VI_SEG;
    yt.cues = viCues;
    yt.groups = [];
    yt.viCues = viCues.map(c => ({
        start: c.start, end: c.end, text: c.text,
        lines: seg ? seg.breakLines(c.text) : [c.text]
    }));
    if (window.CST_STYLE && window.CST_STYLE.lingerCues) window.CST_STYLE.lingerCues(yt.viCues);
    yt.dubGroups = viCues.map(c => ({ start: c.start, end: c.end, viText: c.text, srcCues: [{ start: c.start, end: c.end, text: c.text }], viCues: [{ start: c.start, end: c.end, text: c.text }] }));
    yt.daDichXong = true;
    ytApplyEdits();
    ytKichHoatHienThi();
}

// ---------- Tự động dịch khi mở video ----------
// Ngôn ngữ nguồn: track phụ đề tự động (= ngôn ngữ đang nói) > track duy nhất > mẫu nội dung.
// Nhận diện ngay trên máy, không gọi Gemini. Tiếng Việt / không chắc chắn -> không tự dịch.
// ---------- YouTube's own AI dub in Vietnamese ----------
// Ask the bridge to switch the player back to the original audio track (true when it did).
function ytChonAmThanhGoc(timeoutMs = 2500) {
    return new Promise(resolve => {
        const requestId = `cstam_${Date.now()}_${yt.requestSeq++}`;
        const onMessage = event => {
            if (event.source !== window) return;
            const d = event.data;
            if (!d || d.cstType !== "TRA_LOI_AM_THANH_GOC" || d.requestId !== requestId) return;
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            resolve(!!d.ok);
        };
        const timer = setTimeout(() => { window.removeEventListener("message", onMessage); resolve(false); }, timeoutMs);
        window.addEventListener("message", onMessage);
        window.postMessage({ cstType: "CHON_AM_THANH_GOC", requestId }, "*");
    });
}

// Say it once per video when it happened on its own, every time when the viewer asked. The action
// switches to the original audio, then translates and dubs as usual.
function ytBaoLongTiengYouTube(videoId, always) {
    if (!always && yt.dubNoticeFor === videoId) return;
    yt.dubNoticeFor = videoId;
    ytBao("Video đang phát bằng giọng lồng tiếng AI tiếng Việt của YouTube, nên tiện ích không hiện phụ đề và không lồng tiếng thêm.", {
        actionLabel: "Dùng tiếng gốc + giọng tiện ích",
        onAction: async () => {
            if (!(await ytChonAmThanhGoc())) { ytBao("Chưa đổi được sang tiếng gốc. Hãy chọn tiếng gốc trong Cài đặt của trình phát (biểu tượng bánh răng > Âm thanh).", { warn: true }); return; }
            const ok = await ytBatDauDich({ force: true });
            ytDatTrangThaiNut(ok ? "on" : "idle");
            if (ok) await ytTuBatLongTieng();
        }
    });
}

// The bridge reports an audio-track switch. Onto the Vietnamese AI dub: our subtitles and voice
// step aside. Off it: translate as on opening the video (the language checks run again).
function ytKhiDoiAmThanh(msg) {
    const LANG = window.CST_LANG;
    if (yt.dead || !LANG || !LANG.hearsVietnameseDub || (msg.videoId && msg.videoId !== ytLayMaVideo())) return;
    const api = window.CST_DUB;
    if (LANG.hearsVietnameseDub(msg.audio)) {
        const dubbing = !!(api && api.dub && api.dub.enabled);
        if (!yt.active && !dubbing) return;
        if (dubbing) { api.stop(); ytDatTrangThaiNutLongTieng(false); }
        if (yt.active) { ytTatDich(); ytDatTrangThaiNut("idle"); }
        ytBaoLongTiengYouTube(msg.videoId || ytLayMaVideo(), true);
        return;
    }
    if (!yt.active && !yt.busy && ytSettings.autoTranslate) {
        yt.autoTried = null;
        ytTuDongDich();
    }
}

// The language spoken in the video (CST_LANG.spokenLanguage: original audio track, then ASR, then
// title). Confident enough -> decides alone; a spoken-Vietnamese video is never subtitled.
function ytNgonNguNoi(info) {
    const LANG = window.CST_LANG;
    if (!LANG || !LANG.spokenLanguage || !info) return { lang: "unknown", confidence: 0, source: "none" };
    return LANG.spokenLanguage({ audio: info.audio, tracks: info.tracks, title: info.title, description: info.description });
}

async function ytNhanDienNgonNgu(info) {
    const LANG = window.CST_LANG;
    const tracks = (info && info.tracks) || [];
    const sp = ytNgonNguNoi(info);
    if (sp.lang !== "unknown" && sp.confidence >= 0.7) {
        return { lang: sp.lang, confidence: sp.confidence, source: sp.source, action: sp.lang === "vi" ? "skip" : "translate" };
    }
    if (!LANG || !tracks.length) return { lang: "unknown", confidence: 0, source: "none", action: "unsure" };
    const asr = tracks.find(t => t.kind === "asr");
    const meta = asr ? asr.languageCode : (tracks.length === 1 ? tracks[0].languageCode : "");
    let sample = "";
    if (!meta) {
        try {
            const cues = await ytTaiBanChepLoi(ytChonTrack(tracks, false).track.baseUrl);
            sample = cues.slice(0, 40).map(c => c.text).join(" ");
        } catch (e) { /* không lấy được mẫu: độ tin cậy thấp -> không tự dịch */ }
    }
    return LANG.decide({ metaLang: meta, sample });
}

async function ytTuDongDich() {
    const ma = ytLayMaVideo();
    if (yt.dead || !ytSettings.autoTranslate || !ma || yt.active || yt.autoTried === ma) return null;
    // The video just left may still be loading (ytBatDauDich stops at its next wait): wait for it
    // rather than skip this video for good, which is what returning on `busy` did
    for (let i = 0; i < 40 && yt.busy && ytLayMaVideo() === ma; i++) await new Promise(r => setTimeout(r, 250));
    if (yt.busy || yt.active || yt.autoTried === ma || ytLayMaVideo() !== ma) return null;
    yt.autoTried = ma;
    // Chờ chuẩn bị (Cài đặt > Lồng tiếng): giữ video mới ở trạng thái dừng tối đa 5 giây trong
    // lúc tải phụ đề + dịch + tạo giọng cho đoạn đầu, rồi phát -> có tiếng Việt ngay từ câu đầu
    const api = window.CST_DUB;
    const vid = document.querySelector("#movie_player video") || document.querySelector("video");
    const holding = !!(ytSettings.prepareWait && ytSettings.dubEnabled && api && api.prepareHold && vid &&
        api.prepareHold(vid, () => { const e = api.dub.engine; return !!(e && e.isReadyAt(vid.currentTime)); },
            { initial: true, container: document.querySelector("#movie_player") }));
    const buongCho = () => { if (holding && api.hold.active) api.hold.release(); };
    try {
        return await ytTuDongDichSau(ma);
    } finally {
        // Không dịch / không lồng tiếng được: phát ngay, không bắt chờ đủ 5 giây
        if (!(api && api.dub.enabled)) buongCho();
    }
}

async function ytTuDongDichSau(ma) {
    // Trình phát chưa nạp xong dữ liệu video mới (danh sách phụ đề trống / còn của video cũ):
    // hỏi lại mỗi 0,4 giây, tối đa ~8 giây, thay vì chờ cố định rồi bỏ cuộc
    let info = null;
    for (let i = 0; i < 20; i++) {
        try { info = await ytHoiDanhSachPhuDe(); } catch (e) { info = null; }
        if (ytLayMaVideo() !== ma) return null;
        if (info && info.videoId === ma && info.tracks && info.tracks.length) break;
        info = null;
        await new Promise(r => setTimeout(r, 400));
    }
    if (!info || yt.active || yt.busy) return null;
    const q = await ytNhanDienNgonNgu(info);
    yt.langDecision = q;
    console.log(`[AI Subtitle] Ngôn ngữ video: ${q.lang} (${Math.round(q.confidence * 100)}%, theo ${q.source}) -> ${q.action === "translate" ? "tự động dịch" : q.action === "skip" ? "đã là tiếng Việt, không dịch" : "chưa chắc chắn, không tự dịch"}`);
    if (q.action !== "translate") return q;
    const ok = await ytBatDauDich({ auto: true });
    ytDatTrangThaiNut(ok ? "on" : "idle");
    if (ok && ytLayMaVideo() === ma) await ytTuBatLongTieng();
    return q;
}

// Lồng tiếng đang được bật (nút trên trình phát hoặc ô trong popup): tự bật lại sau khi dịch,
// kể cả khi chuyển sang video khác. Tự động thì không hiện hộp thoại chặn màn hình.
async function ytTuBatLongTieng() {
    const api = window.CST_DUB;
    if (!ytSettings.dubEnabled || !api || api.dub.enabled || api.dub.starting || yt.dubStarting || !yt.active || !yt.videoEl) return false;
    yt.dubStarting = true;
    try {
        const player = document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
        const ok = await api.start({ video: yt.videoEl, container: player, getGroups: ytNhomLongTieng, quiet: true });
        ytDatTrangThaiNutLongTieng(ok);
        return ok;
    } finally {
        yt.dubStarting = false;
    }
}

// opts.auto: gọi tự động khi mở video -> lỗi chỉ ghi ra console, không bật hộp thoại chặn trang
async function ytBatDauDich(opts = {}) {
    const baoLoi = msg => { if (opts.auto) console.warn("[AI Subtitle] " + msg); else ytBao(msg, { warn: true }); };
    if (yt.busy || yt.dead) return false;
    yt.busy = true;
    yt.huyDich = false;
    ytDatTrangThaiNut("loading");
    // The viewer can open another video while this one loads (caption list, captions, saved copy:
    // 1 to 3 s). ytTheoDoi then turns this run off (ytTatDich sets huyDich). Only the last wait was
    // checked before: after any other one, the old run drew its captions over the new video and sent
    // its lines to Gemini, while its `busy` made the new video's auto-translate give up.
    const ma0 = ytLayMaVideo();
    const stale = () => yt.huyDich || yt.dead || ytLayMaVideo() !== ma0;

    try {
        const info = await ytHoiDanhSachPhuDe();
        if (stale()) return false;

        // A video spoken in Vietnamese is not subtitled (checked before the cache: a translation
        // saved by an older version must not come back). Asked by hand: say why, offer to go on.
        const sp = ytNgonNguNoi(info);
        if (!opts.force && sp.lang === "vi" && sp.confidence >= 0.7) {
            console.log(`[AI Subtitle] Video nói tiếng Việt (theo ${sp.source}), không dịch phụ đề`);
            if (!opts.auto) {
                ytBao("Video này nói tiếng Việt nên tiện ích không dịch phụ đề.",
                    { actionLabel: "Vẫn dịch", onAction: () => { ytBatDauDich({ force: true }).then(ok => ytDatTrangThaiNut(ok ? "on" : "idle")); } });
            }
            return false;
        }
        // The viewer is listening to YouTube's own Vietnamese AI dub: they already hear Vietnamese.
        // Our subtitles and our voice would only double it; offer to switch to the original audio.
        if (!opts.force && window.CST_LANG && window.CST_LANG.hearsVietnameseDub && window.CST_LANG.hearsVietnameseDub(info.audio)) {
            console.log("[AI Subtitle] Đang phát giọng lồng tiếng AI tiếng Việt của YouTube, không dịch, không lồng tiếng thêm");
            ytBaoLongTiengYouTube(info.videoId, !opts.auto);
            return false;
        }

        if (!info.tracks || info.tracks.length === 0) {
            baoLoi("Video này không có phụ đề để dịch. Hãy kiểm tra xem video có hỗ trợ phụ đề hoặc phụ đề tự động (CC) không.");
            return false;
        }

        yt.currentVideoId = info.videoId || "";
        yt.videoTitle = info.title || "";
        ytLoadEdits();
        yt.videoEl = document.querySelector("#movie_player video") || document.querySelector("video");

        const chon = ytChonTrack(info.tracks, ytSettings.skipSameLang, { spoken: sp.confidence >= 0.7 ? sp.lang : "", audio: info.audio });
        if (chon.daCoTiengViet && ytSettings.skipSameLang) {
            console.log("Video đã có phụ đề tiếng Việt sẵn, áp dụng tùy chọn 'Bỏ qua dịch khi cùng ngôn ngữ'");
            const viCues = await ytTaiBanChepLoi(chon.track.baseUrl);
            if (stale()) return false;
            if (viCues.length > 0) {
                ytHienThiNguyenTiengViet(viCues);
                return true;
            }
        }

        // Xem lai video da dich thi lay ngay tu bo nho dem
        const cache = await ytDocCache(yt.currentVideoId);
        if (stale()) return false;
        if (cache) {
            yt.cues = cache.cues.map(c => ({ start: c[0], end: c[1], text: c[2] }));
            yt.groups = [];
            yt.viCues = cache.vi.map(c => {
                const lines = String(c[2] || "").split("\n");
                return { start: c[0], end: c[1], text: lines.join(" "), lines };
            });
            if (window.CST_STYLE && window.CST_STYLE.lingerCues) window.CST_STYLE.lingerCues(yt.viCues);
            yt.dubGroups = (cache.g || []).map(g => ({
                start: g[0], end: g[1], viText: g[2],
                srcCues: g[3].map(c => ({ start: c[0], end: c[1], text: c[2] })),
                viCues: g[4].map(c => ({ start: c[0], end: c[1], text: c[2] })),
                ...(g[5] ? { midLine: true } : {})     // starts inside a caption line (2.3.2)
            }));
            ytRepairCachedLeaks();
            yt.daDichXong = true;
            ytApplyEdits();
            ytKichHoatHienThi();
            console.log("Lay ban dich tu bo nho dem, khong can dich lai");
            return true;
        }

        const track = chon.track;
        // Which track we ended up on decides how good the translation can be: machine-heard captions
        // are the usual reason a line comes out wrong, so the menu says which one is in use
        yt.trackInfo = { languageCode: track.languageCode, kind: track.kind || "", viSan: !!chon.daCoTiengViet };
        console.log(`Dung ban chep loi: ${track.languageCode}${track.kind === "asr" ? " (tu dong)" : ""}`);

        const cues = await ytTaiBanChepLoi(track.baseUrl);
        if (stale()) return false;
        if (cues.length === 0) {
            baoLoi("YouTube chưa trả nội dung phụ đề. Hãy phát video vài giây rồi bấm dịch lại; nếu vẫn lỗi, tải lại trang (F5).");
            return false;
        }
        // Phụ đề nguồn đã là tiếng Việt (theo mã track hoặc nội dung): hiển thị nguyên,
        // không gửi Gemini dịch Việt sang Việt
        const LANG = window.CST_LANG;
        if (LANG && LANG.decide({ metaLang: track.languageCode, sample: cues.slice(0, 40).map(c => c.text).join(" ") }).action === "skip") {
            ytHienThiNguyenTiengViet(cues);
            return true;
        }

        // groups close where sentences do, also inside a caption line (content.js, 2.3.2)
        yt.cues = splitCuesAtSentenceEnds(cues);
        yt.viCues = [];
        yt.dubGroups = null;
        const groups = groupCuesIntoSentences(yt.cues, state.perCueMode).map(g => ({ ...g, translated: false, viCues: null }));
        yt.groups = groups;
        yt.cueToGroupMap.clear();
        yt.inFlightGroups.clear();
        groups.forEach((g, gIdx) => {
            g.cueIndexes.forEach(ci => {
                yt.cueToGroupMap.set(ci, gIdx);
            });
        });

        // Ngu canh video: tieu de, kenh, mo ta; thuat ngu da thong nhat luu theo kenh
        yt.session = await createContextSession({
            title: info.title || "",
            channel: info.author || "",
            description: info.description || "",
            keywords: info.keywords || []
        }, info.channelId ? `yt_${info.channelId}` : (info.author ? `yt_${info.author}` : ""));
        if (yt.session) yt.session.setUnits(groups.map(g => g.text));
        if (yt.groups !== groups || stale()) return false;

        console.log(`Đã nạp ${cues.length} dòng thành ${groups.length} nhóm câu. Lĩnh vực: ${yt.session ? yt.session.domain.primary : "?"}. Kích hoạt phụ đề Real-time.`);

        // KÍCH HOẠT NGAY LẬP TỨC KHÔNG CẦN CHỜ ĐỢI
        ytKichHoatHienThi();

        // Kích hoạt dịch khẩn cấp ngay cho câu hiện tại
        const curIdx = ytCueTaiHoacSau(yt.videoEl ? yt.videoEl.currentTime : 0);
        if (curIdx !== -1) ytDichKhanCap(curIdx);

        // Chạy đa luồng sliding-window prefetcher trong nền
        ytChayTienTrinhPrefetch(groups);

        return true;
    } catch (err) {
        console.error("Dich YouTube that bai:", err);
        baoLoi(`Không dịch được: ${err.message}`);
        return false;
    } finally {
        yt.busy = false;
    }
}

function ytTatDich() {
    yt.active = false;
    yt.huyDich = true;
    clearTimeout(yt.refineSaveTimer);
    yt.refineSaveTimer = null;
    ytDungDongBo();
    ytAnPhuDeGoc(false);
    ytXoaLopPhuDe();
    yt.cues = [];
    yt.groups = [];
    yt.session = null;
    yt.viCues = [];
    yt.lastSpokenVi = null;
    yt.cueToGroupMap.clear();
    yt.inFlightGroups.clear();
    yt.daDichXong = false;

    if (window.CST_DUB && window.CST_DUB.dub.enabled) {
        window.CST_DUB.stop();
        ytDatTrangThaiNutLongTieng(false);
    }
    yt.dubGroups = null;
    ytDatTrangThaiNut("idle");
}

// ---------- Nút bấm & Menu điều khiển YouTube ----------
function ytCapNhatTrangThaiNutThanhDieuKhien() {
    const btn = document.querySelector(YT_BTN);
    if (!btn) return;
    const isDub = !!(window.CST_DUB && window.CST_DUB.dub && window.CST_DUB.dub.enabled);
    CST_UI_KIT().datTrangThai(btn, {
        busy: !!yt.busy,
        on: !!(yt.active || isDub),
        title: yt.busy ? "Đang dịch phụ đề…"
            : yt.active && isDub ? "Đang bật phụ đề Việt và lồng tiếng (Alt+S, Alt+D)"
                : yt.active ? "Đang bật phụ đề tiếng Việt (Alt+S)"
                    : isDub ? "Đang lồng tiếng Việt (Alt+D)"
                        : "Dịch phụ đề & lồng tiếng tiếng Việt (Alt+S, Alt+D)"
    });
}

// The control-bar button shows the state (busy / on); the status argument is kept for the callers
function ytDatTrangThaiNut(status) {
    ytCapNhatTrangThaiNutThanhDieuKhien();
}

function ytDatTrangThaiNutLongTieng(on) {
    ytCapNhatTrangThaiNutThanhDieuKhien();
}

function ytTaoNutThanhDieuKhien() {
    const player = document.querySelector("#movie_player") ||
                   document.querySelector(".html5-video-player");
    if (!player) return;

    const rightControls = player.querySelector(".ytp-right-controls");
    if (!rightControls) return;

    if (yt.dead) return;
    // Nút của mã cũ (bấm không còn tác dụng): ẨN, không xóa (xem ytAnCuaMaKhac)
    ytAnCuaMaKhac(rightControls, ".cst-ytp-btn");
    const existing = rightControls.querySelector(YT_BTN);
    if (existing && existing.isConnected) {
        ytCapNhatTrangThaiNutThanhDieuKhien();
        return;
    }
    if (existing) existing.remove();

    const nhan = "Dịch phụ đề & lồng tiếng tiếng Việt (Alt+S, Alt+D)";
    const btn = CST_UI_KIT().taoNut(document, {
        size: 30,
        title: nhan,
        className: "ytp-button cst-ytp-btn",
        onClick: () => ytMoMenuNhanh(player, btn),
        onDblClick: async () => {
            if (yt.active) {
                ytTatDich();
            } else {
                const ok = await ytBatDauDich();
                ytDatTrangThaiNut(ok ? "on" : "idle");
                if (ok) ytTuBatLongTieng();
            }
        }
    });
    btn.dataset.cstGen = YT_GEN;
    btn.dataset.cstBorn = String(YT_BORN);
    // YouTube's bar wants a full-height hit area, wider than the badge
    btn.style.width = "44px";
    btn.style.height = "100%";
    btn.style.verticalAlign = "top";
    btn.style.marginLeft = "2px";

    // Thêm vào vị trí cuối thanh điều khiển (cạnh nút phóng to toàn màn hình)
    rightControls.appendChild(btn);
    ytCapNhatTrangThaiNutThanhDieuKhien();
}

// ---------- Thực đơn nhanh trên trình phát ----------
// Nguyên tắc (1.4.1): mỗi dòng là MỘT công tắc thật (bấm được, đọc được bằng trình đọc màn hình),
// không dùng nhãn "BẬT" trông giống nút bấm mà thực ra chỉ là chữ; trạng thái tự cập nhật khi
// đang mở; việc hay làm nhất (đổi giọng đọc) làm ngay tại đây, không phải mở trang Cài đặt.
// The mark, the button icon and the menu stylesheet live in player-ui.js, so this player and the
// Coursera one cannot drift apart. CST_PLAYER_UI is loaded before this file (see manifest.json).
const CST_UI_KIT = () => window.CST_PLAYER_UI || {};


function ytNapCssMenu() {
    const kit = CST_UI_KIT();
    if (kit.napCss) kit.napCss(document);
}

// Tiến độ dịch của video đang xem (để biết còn chờ bao lâu, thay vì chỉ thấy "Đang dịch...")
function ytTienDoDich() {
    const gs = ytNhomLongTieng() || [];
    if (!gs.length) return null;
    return { xong: gs.filter(g => g && g.viText).length, tong: gs.length };
}

function ytMoMenuNhanh(player, btn) {
    let menu = player.querySelector(".cst-yt-menu");
    if (menu && menu.dataset.cstLeaving) menu = null;             // one on its way out does not count
    if (menu) {
        // Bấm lại nút khi đang mở: đóng gọn (gỡ cả bộ lắng nghe phím Esc / bấm ra ngoài)
        if (menu.cstDong) menu.cstDong(); else menu.remove();
        return;
    }
    ytNapCssMenu();

    const el = (tag, cls, txt) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e;
    };
    // Một dòng công tắc: là NÚT thật (Tab tới được, Enter/Space bấm được) và có role=switch để
    // trình đọc màn hình đọc đúng "đang bật / đang tắt"
    const congTac = (nhan, phim, onToggle) => {
        const row = el("button", "cst-row");
        row.type = "button";
        row.setAttribute("role", "switch");
        const label = el("span", "cst-row-label");
        label.appendChild(document.createTextNode(nhan));
        const sub = el("span", "cst-row-sub");
        label.appendChild(sub);
        row.appendChild(label);
        if (phim) row.appendChild(el("span", "cst-kbd", phim));
        row.appendChild(el("span", "cst-sw"));
        row.addEventListener("click", () => { if (row.getAttribute("aria-disabled") !== "true") onToggle(row); });
        row.cstSub = sub;
        return row;
    };

    menu = el("div", "cst-yt-menu");
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "Dịch phụ đề và lồng tiếng");
    menu.dataset.cstTheme = ytSettings.uiTheme || "auto";

    const head = el("div", "cst-menu-head");
    const mark = el("span", "cst-menu-mark");
    mark.innerHTML = CST_UI_KIT().MARK_SVG || "";
    mark.style.color = "#FFFFFF";
    head.appendChild(mark);
    head.appendChild(el("span", "cst-menu-title", "Dịch & lồng tiếng Việt"));
    const x = el("button", "cst-menu-x", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Đóng");
    head.appendChild(x);
    menu.appendChild(head);

    const rowSub = congTac("Phụ đề tiếng Việt", "Alt+S", async row => {
        if (yt.active) { ytTatDich(); capNhat(); return; }
        row.setAttribute("aria-disabled", "true");
        capNhat();
        const ok = await ytBatDauDich();
        ytDatTrangThaiNut(ok ? "on" : "idle");
        row.removeAttribute("aria-disabled");
        capNhat();
    });
    const rowDub = congTac("Lồng tiếng Việt", "Alt+D", async row => {
        row.setAttribute("aria-disabled", "true");
        capNhat();
        await ytChuyenLongTieng(player);
        row.removeAttribute("aria-disabled");
        capNhat();
    });
    menu.appendChild(rowSub);
    menu.appendChild(rowDub);

    // Đổi giọng ngay tại đây: việc hay làm nhất mà trước đây phải mở trang Cài đặt
    const voiceBox = el("div", "cst-field");
    voiceBox.appendChild(el("div", "cst-field-label", "Chọn giọng"));
    const voiceSel = el("select", "cst-select");
    voiceSel.setAttribute("aria-label", "Giọng đọc tiếng Việt");
    const LOCAL = window.CST_COST && window.CST_COST.LOCAL_TTS;
    if (LOCAL) {
        for (const region of ["Nam", "Bắc", "Trung"]) {
            const ds = LOCAL.voices.filter(v => v.region === region);
            if (!ds.length) continue;
            const g = document.createElement("optgroup");
            g.label = `Giọng miền ${region}`;
            for (const v of ds) {
                const op = document.createElement("option");
                op.value = v.id;
                op.textContent = window.CST_COST && window.CST_COST.voiceLabel ? window.CST_COST.voiceLabel(v) : `${v.id} (${v.gender.toLowerCase()}, ${v.style})`;
                g.appendChild(op);
            }
            voiceSel.appendChild(g);
        }
    }
    // Hiện đúng giọng đang dùng, kể cả khi lồng tiếng chưa bật (đọc từ cài đặt đã lưu)
    if (LOCAL) {
        voiceSel.value = LOCAL.defaultVoice;
        chrome.storage.sync.get({ dubLocalVoice: "" }, r => {
            if (r && r.dubLocalVoice) voiceSel.value = r.dubLocalVoice;
        });
    }
    voiceSel.addEventListener("change", async () => {
        await chrome.storage.sync.set({ dubLocalVoice: voiceSel.value });   // engine tự tạo lại giọng mới
        ytBao(`Đang chuyển sang giọng ${voiceSel.value}…`);
    });
    voiceBox.appendChild(voiceSel);
    menu.appendChild(voiceBox);

    const volume = CST_UI_KIT().buildVolumeControls(document);
    menu.appendChild(volume.el);

    const canhBao = el("div", "cst-note-line");
    canhBao.style.display = "none";
    menu.appendChild(canhBao);

    const modeBox = el("div", "cst-field");
    modeBox.appendChild(el("div", "cst-field-label", "Kiểu hiển thị"));
    const seg = el("div", "cst-seg");
    const btnSingle = el("button", null, "Chỉ tiếng Việt");
    const btnDual = el("button", null, "Song ngữ");
    [btnSingle, btnDual].forEach(b => { b.type = "button"; seg.appendChild(b); });
    modeBox.appendChild(seg);
    menu.appendChild(modeBox);

    const size = CST_UI_KIT().buildStepper(document, {
        label: "Cỡ chữ", min: 50, max: 300, step: 10,
        get: () => ytChuanHoaKieu(ytSubStyle).fontSize,
        set: n => { ytSubStyle = ytChuanHoaKieu({ ...ytSubStyle, fontSize: n }); return chrome.storage.sync.set({ subStyle: ytSubStyle }); },
        format: n => `${n}%`
    });
    menu.appendChild(size.el);

    const rowSkip = congTac("Bỏ qua dịch khi video đã có tiếng Việt", null, async row => {
        ytSettings.skipSameLang = row.getAttribute("aria-checked") !== "true";
        await chrome.storage.sync.set({ skipSameLang: ytSettings.skipSameLang });
        capNhat();
    });
    menu.appendChild(rowSkip);

    const foot = el("div", "cst-menu-foot");
    const btnTranscript = el("button", null, "Bản chép lời");
    btnTranscript.type = "button";
    btnTranscript.title = "Xem toàn bộ lời thoại, bấm một dòng để nhảy tới, xuất tệp .srt";
    btnTranscript.addEventListener("click", () => {
        if (window.CST_TRANSCRIPT) window.CST_TRANSCRIPT.toggle(ytTranscriptAdapter());
        dongMenu();
    });
    const btnOptions = el("button", null, "Cài đặt");
    btnOptions.type = "button";
    // Dubbing diagnostics (1.9.9): one click copies what the voice engine did lately (lines dropped
    // and why, resets, errors, late starts, server speed), to paste where the problem is looked into
    const btnDiag = el("button", null, "Chép chẩn đoán");
    btnDiag.type = "button";
    btnDiag.title = "Chép tình trạng lồng tiếng gần đây (câu bị bỏ và lý do, lỗi, tốc độ máy chủ giọng) để gửi khi cần kiểm tra lỗi";
    btnDiag.addEventListener("click", async () => {
        const api = window.CST_DUB;
        const text = api && api.diagnostics ? api.diagnostics() : "";
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = !!text; } catch (e) { ok = false; }
        dongMenu();
        ytBao(ok ? "Đã chép chẩn đoán lồng tiếng. Dán vào cuộc trò chuyện để kiểm tra." : "Không chép được chẩn đoán (trình duyệt chặn bộ nhớ tạm hoặc lồng tiếng chưa bật).", { warn: !ok });
    });
    foot.appendChild(btnTranscript);
    foot.appendChild(btnDiag);
    foot.appendChild(btnOptions);
    menu.appendChild(foot);

    // ---- Trạng thái luôn đúng: vẽ lại phần chữ / công tắc mỗi 700 ms trong lúc thực đơn mở ----
    function capNhat() {
        const dubApi = window.CST_DUB;
        const isDub = !!(dubApi && dubApi.dub && dubApi.dub.enabled);
        const tienDo = ytTienDoDich();
        rowSub.setAttribute("aria-checked", String(!!yt.active));
        const nguon = ytNguonPhuDe();
        const hauTo = yt.active && nguon ? ` · ${nguon.nhan.toLowerCase()}` : "";
        rowSub.cstSub.textContent = (yt.busy ? "Đang dịch…"
            : yt.active && tienDo ? `Đã dịch ${tienDo.xong}/${tienDo.tong} đoạn`
                : yt.active ? "Đang bật" : "Đang tắt") + hauTo;
        rowSub.cstSub.style.color = yt.active && nguon && nguon.canhBao ? "var(--cst-warn)" : "";
        rowDub.setAttribute("aria-checked", String(isDub));
        const st = dubApi && dubApi.dub ? dubApi.dub.lastStatus : null;
        const suc = isDub && dubApi.describeHealth ? dubApi.describeHealth() : null;
        rowDub.cstSub.textContent = isDub ? (suc ? suc.text : "Đang bật") : "Đang tắt";
        rowDub.cstSub.style.color = suc && suc.warn ? "var(--cst-warn)" : "";
        volume.el.style.display = isDub ? "block" : "none";
        volume.refresh();
        size.refresh();
        rowSkip.setAttribute("aria-checked", String(!!ytSettings.skipSameLang));
        rowSkip.cstSub.textContent = ytSettings.skipSameLang ? "Đang bật" : "Đang tắt";
        const dual = ytSubStyle.mode === "dual" || state.dualMode;
        btnSingle.setAttribute("aria-pressed", String(!dual));
        btnDual.setAttribute("aria-pressed", String(dual));
        // Giọng đọc: chỉ hiện khi dùng giọng VieNeu trên máy (giọng Gemini / hệ thống chọn trong Cài đặt)
        const localProv = !st || st.provider === "vieneu";
        voiceBox.style.display = localProv ? "block" : "none";
        if (localProv && st && st.voice && voiceSel.value !== st.voice) voiceSel.value = st.voice;
        // Cảnh báo (nếu có): giọng phải đổi sang giọng hệ thống, chạm ngân sách, Gemini lỗi
        const lastAi = window.CST_LAST_AI_INFO || (typeof state !== "undefined" ? state.lastTranslationInfo : null);
        let msg = "";
        if (st && st.budgetBlocked) msg = "Đã chạm ngân sách chi phí nên ngừng tạo giọng AI.";
        else if (st && st.fallback) msg = st.reason === "budget"
            ? "Đã chạm ngân sách giọng AI nên đang dùng giọng hệ thống."
            : "Giọng chính không dùng được nên đang dùng giọng hệ thống.";
        else if (lastAi && lastAi.engine === "google_fallback") msg = `Gemini lỗi (${lastAi.fallbackReason || "không rõ"}), đang dịch tạm bằng Google. Bấm Cài đặt để kiểm tra Key.`;
        else if (lastAi && lastAi.engine === "google" && /API Key/.test(lastAi.fallbackReason || "")) msg = "Chưa có API Key Gemini nên đang dịch bằng Google (không theo ngữ cảnh). Bấm Cài đặt để thêm Key.";
        canhBao.textContent = msg;
        canhBao.style.display = msg ? "block" : "none";
    }
    capNhat();
    const nhipCapNhat = setInterval(capNhat, 700);

    btn.setAttribute("aria-expanded", "true");
    const nhuongCho = on => {
        yt.menuOpen = on;
        const ov = document.querySelector(YT_OVERLAY);
        if (ov) ytCapNhatViTri(player, ov);
        yt.renderKey = "";
    };
    nhuongCho(true);
    const dongMenu = () => {
        clearInterval(nhipCapNhat);
        if (CST_UI_KIT().dismiss) CST_UI_KIT().dismiss(menu); else menu.remove();
        nhuongCho(false);
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onKeyDown);
        btn.setAttribute("aria-expanded", "false");
        try { btn.focus(); } catch (e) { /* bỏ qua */ }
    };
    const onDocClick = e => { if (!menu.contains(e.target) && !btn.contains(e.target)) dongMenu(); };
    // Esc đóng; Tab quanh vòng trong thực đơn (không rơi ra sau lưng trình phát YouTube)
    const onKeyDown = e => {
        if (e.key === "Escape") { e.stopPropagation(); dongMenu(); return; }
        if (CST_UI_KIT().trapTab) CST_UI_KIT().trapTab(menu, e);
    };
    menu.cstDong = dongMenu;
    setTimeout(() => document.addEventListener("click", onDocClick), 50);
    document.addEventListener("keydown", onKeyDown);

    x.addEventListener("click", dongMenu);
    btnSingle.addEventListener("click", async () => {
        ytSubStyle.mode = "single";
        state.dualMode = false;
        await chrome.storage.sync.set({ subStyle: ytSubStyle, dualMode: false });
        yt.renderKey = "";
        capNhat();
    });
    btnDual.addEventListener("click", async () => {
        ytSubStyle.mode = "dual";
        state.dualMode = true;
        await chrome.storage.sync.set({ subStyle: ytSubStyle, dualMode: true });
        yt.renderKey = "";
        capNhat();
    });
    btnOptions.addEventListener("click", () => { dongMenu(); ytMoCaiDat(); });

    // Two sections, each holding only its own controls: what is on the page, then what is spoken
    const kit = CST_UI_KIT();
    if (kit.buildSection) {
        [head, kit.buildSection(document, "Phụ đề"), rowSub, modeBox, size.el, rowSkip,
            kit.buildSection(document, "Giọng đọc"), rowDub, voiceBox, volume.el, canhBao, foot].forEach(n => menu.appendChild(n));
    }
    player.appendChild(menu);
    setTimeout(() => { try { rowSub.focus(); } catch (e) { /* bỏ qua */ } }, 0);
}

// Nguồn cho lồng tiếng: nhóm câu đã dịch có ngữ cảnh (hoặc từ bộ nhớ đệm)
function ytNhomLongTieng() {
    return yt.dubGroups && yt.dubGroups.length ? yt.dubGroups : yt.groups;
}

// Mở trang Cài đặt: content script KHÔNG tự điều hướng tới chrome-extension://.../options.html
// (trang web mở tài nguyên tiện ích bị Chrome chặn: ERR_BLOCKED_BY_CLIENT). Nhờ service
// worker (ngữ cảnh có quyền của tiện ích) gọi chrome.runtime.openOptionsPage().
// Thông báo nhỏ trên trình phát (content.js dựng), không chặn trang như alert()
// What the transcript panel needs from this player. The lists are the ones the overlay already
// draws from, so the panel costs no extra work and fills in as the translation arrives.
// ---- The viewer's own corrections (subtitle-edits.js) ----
// Live translation shares cue objects between yt.groups and yt.viCues; the cache and the
// "already Vietnamese" paths keep separate yt.dubGroups. All three are walked.
function ytApplyEdits() {
    const E = window.CST_EDITS;
    if (!E) return 0;
    if (!yt.edits && !(yt.viCues || []).some(c => c.cstOrig)) return 0;   // nothing stored, nothing to undo
    const n = E.sync(yt.edits, { groups: [...(yt.groups || []), ...(yt.dubGroups || [])], display: yt.viCues });
    if (n) { yt.renderKey = ""; E.notify(); }
    return n;
}

function ytEditKey() {
    return "yt:" + (yt.currentVideoId || ytLayMaVideo() || "");
}

async function ytLoadEdits() {
    const E = window.CST_EDITS;
    yt.edits = null;
    if (!E) return;
    const key = ytEditKey();
    const rec = await E.load(key);
    if (ytEditKey() !== key) return;                  // the viewer moved to another video meanwhile
    yt.edits = rec;
    ytApplyEdits();
}

function ytTranscriptAdapter() {
    return {
        box: () => document.querySelector("#movie_player") || document.querySelector(".html5-video-player"),
        videoEl: () => yt.videoEl || document.querySelector("video"),
        lines: () => (window.CST_TRANSCRIPT ? window.CST_TRANSCRIPT.mergeLines(yt.viCues, yt.cues) : []),
        title: () => pageVideoTitle(),
        dual: () => ytSubStyle.mode === "dual" || state.dualMode,
        theme: () => ytSettings.uiTheme || "auto",
        saveEdit: async (line, text) => {
            yt.edits = await window.CST_EDITS.save(ytEditKey(),
                { title: pageVideoTitle(), url: location.href },
                line.start, text, line.machine);
            ytApplyEdits();
        },
        onPanel: on => {
            yt.panelOpen = !!on;
            const player = document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
            const overlay = document.querySelector(YT_OVERLAY);
            if (player && overlay) ytCapNhatViTri(player, overlay);
            yt.renderKey = "";
        }
    };
}

// How trustworthy the source captions are: the one thing that decides translation quality and the
// user could not see before. Machine-heard captions have no punctuation and mishear names.
function ytNguonPhuDe() {
    const info = yt.trackInfo;
    if (!info) return null;
    if (info.kind === "asr") return { nhan: "Phụ đề máy nghe tự động", canhBao: true };
    return { nhan: info.viSan ? "Phụ đề tiếng Việt có sẵn" : "Phụ đề tác giả tải lên", canhBao: false };
}

function ytBao(msg, opts) {
    if (window.CST_UI && window.CST_UI.toast) return window.CST_UI.toast(msg, opts);
    console.warn("[AI Subtitle] " + msg);
    return null;
}

function ytMoCaiDat() {
    try {
        chrome.runtime.sendMessage({ action: "openOptions" }, res => {
            const err = chrome.runtime.lastError;
            if (err || !res || !res.ok) {
                const why = err ? err.message : (res && res.error) || "không có phản hồi";
                console.warn("[AI Subtitle] Không mở được trang Cài đặt:", why);
                ytBao("Chưa mở được trang Cài đặt (" + why + "). Hãy bấm biểu tượng tiện ích trên thanh công cụ rồi chọn Cài đặt.", { warn: true });
            }
        });
    } catch (e) {
        // Tiện ích vừa được nạp lại: kết nối cũ của trang đã hết hiệu lực
        console.warn("[AI Subtitle] Không mở được trang Cài đặt:", e.message);
        ytBao("Tiện ích vừa được cập nhật nên trang này đang dùng kết nối cũ. Hãy tải lại trang rồi bấm lại.", { warn: true, actionLabel: "Tải lại trang", onAction: () => location.reload() });
    }
}

async function ytChuyenLongTieng(player) {
    const api = window.CST_DUB;
    if (!api) return;

    if (api.dub.enabled) {
        api.stop();
        ytDatTrangThaiNutLongTieng(false);
        ytGhiLongTieng(false);
        return;
    }

    // Lồng tiếng dùng chính bản dịch có ngữ cảnh, nên phải bật dịch trước
    if (!yt.active) {
        // Không hỏi bằng hộp thoại chặn trang: bấm lồng tiếng nghĩa là đồng ý dịch trước
        ytBao("Đang dịch phụ đề để lồng tiếng…");
        const ok = await ytBatDauDich();
        ytDatTrangThaiNut(ok ? "on" : "idle");
        if (!ok) return;
    }

    const ok = await api.start({ video: yt.videoEl, container: player, getGroups: ytNhomLongTieng });
    ytDatTrangThaiNutLongTieng(ok);
    if (ok) ytGhiLongTieng(true);
}

// Nhớ lựa chọn lồng tiếng (cùng khóa với ô trong popup) để video sau tự bật
function ytGhiLongTieng(on) {
    ytSettings.dubEnabled = !!on;
    try { chrome.storage.sync.set({ dubEnabled: !!on }); } catch (e) { /* bỏ qua */ }
}

// ---------- Theo doi chuyen video ----------
function ytLayMaVideo() {
    try {
        const u = new URL(location.href);
        return u.searchParams.get("v") || "";
    } catch (e) {
        return "";
    }
}

function ytTheoDoi() {
    let maHienTai = ytLayMaVideo();

    const kiemTra = () => {
        if (yt.dead) return;
        const ma = ytLayMaVideo();

        if (ma === maHienTai) return;
        maHienTai = ma;

        if (yt.active || yt.busy) ytTatDich();
        yt.currentVideoId = ma;
        yt.videoTitle = "";
        setTimeout(() => {
            ytTaoNutThanhDieuKhien();
            ytTuDongDich();
        }, 300);
    };

    yt.navTimer = setInterval(kiemTra, 800);
    window.addEventListener("yt-navigate-finish", kiemTra);
    window.addEventListener("popstate", kiemTra);
    // a dead copy (extension reloaded) drops its listeners too, not only its button observer
    yt.navUnwatch = () => {
        clearInterval(yt.navTimer);
        window.removeEventListener("yt-navigate-finish", kiemTra);
        window.removeEventListener("popstate", kiemTra);
    };

    // YouTube mutates the body many times a second (comments, recommendations, live chat, the
    // progress bar), and every check queries the whole document. Run at most once per 150 ms:
    // at once on the leading edge, then once more after the burst, so a removed button still
    // comes back within a moment.
    const checkButton = () => {
        if (yt.dead) return;
        if (!document.querySelector(YT_BTN)) ytTaoNutThanhDieuKhien();
        else ytAnCuaMaKhac(document, ".cst-ytp-btn");
    };
    let lastCheck = -Infinity, trailing = null;
    const observer = new MutationObserver(() => {
        if (yt.dead || trailing) return;
        const now = Date.now();
        if (now - lastCheck >= 150) { lastCheck = now; checkButton(); return; }
        trailing = setTimeout(() => { trailing = null; lastCheck = Date.now(); checkButton(); }, 150 - (now - lastCheck));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    yt.btnObserver = observer;
}

// ---------- Khoi dong ----------
// Tiện ích vừa được Tải lại / cập nhật: mã đang chạy trong tab này mất kết nối (không dịch, không
// lồng tiếng được nữa). Tự tắt gọn: dừng giọng, bỏ lớp phụ đề và nút, trả phụ đề gốc; mã mới do
// service worker nạp lại vào tab sẽ tiếp quản (không cần F5).
function ytConKetNoi() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
}
function ytTuTatKhiMatKetNoi() {
    const timer = setInterval(() => {
        if (ytConKetNoi()) return;
        clearInterval(timer);
        yt.dead = true;                       // trước khi gỡ phần tử: bộ theo dõi không tạo lại nút nữa
        try { if (yt.btnObserver) yt.btnObserver.disconnect(); } catch (e) { /* bỏ qua */ }
        try { if (yt.navUnwatch) yt.navUnwatch(); } catch (e) { /* bỏ qua */ }
        try { ytTatDich(); } catch (e) { /* bỏ qua */ }
        try { if (window.CST_DUB) window.CST_DUB.stop(); } catch (e) { /* bỏ qua */ }
        document.querySelectorAll(`${YT_OVERLAY}, ${YT_BTN}`).forEach(el => el.remove());
        yt.huyDich = true;
        console.log("[AI Subtitle] Tiện ích vừa được nạp lại: mã cũ trong tab này đã tự tắt.");
    }, 1500);
}

async function ytKhoiDong() {
    if (!location.hostname.includes("youtube.com")) return;
    ytTuTatKhiMatKetNoi();
    await ytNapCaiDatKieu();

    // Lắng nghe thay đổi tùy chọn trực tiếp từ options page
    try {
        // An edit saved in another tab or in Settings shows here at once (reverts included)
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== "local" || !window.CST_EDITS || !yt.currentVideoId) return;
            const ch = changes[window.CST_EDITS.keyOf(ytEditKey())];
            if (!ch) return;
            yt.edits = ch.newValue || null;
            ytApplyEdits();
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "sync") {
                if (changes.subStyle) {
                    ytSubStyle = ytChuanHoaKieu({ ...ytSubStyle, ...changes.subStyle.newValue });
                    // a stale mirror must not override dualMode (popup writes dualMode alone)
                    ytSubStyle.mode = state.dualMode ? "dual" : "single";
                    const player = document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
                    const overlay = document.querySelector(YT_OVERLAY);
                    if (player && overlay) {
                        ytApDungKieuPhuDe(overlay);
                        ytCapNhatKichThuoc(player, overlay);
                        ytCapNhatViTri(player, overlay);
                        yt.renderKey = "";
                    }
                }
                if (changes.skipSameLang) ytSettings.skipSameLang = changes.skipSameLang.newValue !== false;   // next video
                if (changes.dualMode) {
                    state.dualMode = !!changes.dualMode.newValue;
                    ytSubStyle.mode = state.dualMode ? "dual" : "single";
                    yt.renderKey = "";
                }
                if (changes.uiTheme) {
                    ytSettings.uiTheme = changes.uiTheme.newValue || "auto";
                    const open = document.querySelector(".cst-yt-menu");
                    if (open) open.dataset.cstTheme = ytSettings.uiTheme;
                }
                if (changes.autoTranslate) ytSettings.autoTranslate = !!changes.autoTranslate.newValue;
                if (changes.dubPrepareWait) ytSettings.prepareWait = changes.dubPrepareWait.newValue !== false;
                if (changes.dubEnabled) {
                    const bat = changes.dubEnabled.newValue !== false;
                    const doi = bat !== ytSettings.dubEnabled;
                    ytSettings.dubEnabled = bat;
                    const api = window.CST_DUB;
                    // Trang Cài đặt tự lưu TẤT CẢ mục mỗi lần đổi một thứ (ví dụ đổi giọng) nên
                    // dubEnabled cũng bị báo "đổi" dù giá trị y nguyên: chỉ xử lý khi đổi thật,
                    // không bật thêm một bộ đọc nữa (hai giọng chồng nhau)
                    if (!doi) return;
                    if (bat) ytTuBatLongTieng();
                    else if (api && api.dub.enabled) { api.stop(); ytDatTrangThaiNutLongTieng(false); }
                }
            }
        });
    } catch (e) {}

    ytTaoNutThanhDieuKhien();
    ytTheoDoi();
    // Tự dịch sớm; ytTuDongDich tự chờ trình phát có danh sách phụ đề
    setTimeout(ytTuDongDich, 400);
    window.addEventListener("message", event => {
        if (event.source === window && event.data && event.data.cstType === "AM_THANH_DOI") ytKhiDoiAmThanh(event.data);
    });
    ytSweepCacheDaily();
    console.log("Da san sang dich phu de YouTube");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ytKhoiDong);
} else {
    ytKhoiDong();
}

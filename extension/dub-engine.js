// ============================================================
// ENGINE LỒNG TIẾNG VIỆT: TTS PROVIDER + LẬP LỊCH + ĐỒNG BỘ VỚI VIDEO
//
// SOURCE TIMING ─▶ CONTEXT-AWARE TRANSLATION (nhóm câu đã dịch)
//   ─▶ DUB SCRIPT (dub-planner) ─▶ SPEECH PLAN (ngữ điệu + thời lượng)
//   ─▶ TTS PROVIDER (Gemini TTS: audio thật | Web Speech: giọng hệ thống)
//   ─▶ AUDIO TIMING ALIGNMENT (co giãn giữ cao độ / tốc độ theo cụm)
//   ─▶ SYNC ENGINE (bám currentTime của video: pause, seek, tốc độ phát,
//      buffering, sửa lệch) ─▶ MIX (hạ nhỏ tiếng gốc mượt, không giật)
//
// Phần lõi không gọi trực tiếp API trình duyệt: video, đồng hồ, bộ hẹn giờ,
// provider, phần tử audio đều được truyền vào -> kiểm thử được bằng mô phỏng.
// ============================================================
(function (root) {
    "use strict";

    const PLAN = (root && root.CST_DUB_PLAN) || (typeof require === "function" ? require("./dub-planner.js") : null);
    const AUDIO = (root && root.CST_DUB_AUDIO) || (typeof require === "function" ? require("./dub-audio.js") : null);
    const CACHE = (root && root.CST_CACHE) || (typeof require === "function" ? require("./cst-cache.js") : null);
    const COST = (root && root.CST_COST) || (typeof require === "function" ? require("./cost-policy.js") : null);
    const PROSODY = (root && root.CST_DUB_PROSODY) || (typeof require === "function" ? require("./dub-prosody.js") : null);
    const SPEECH = (root && root.CST_DUB_SPEECH) || (typeof require === "function" ? (() => { try { return require("./dub-speech.js"); } catch (e) { return null; } })() : null);

    // Tăng khi đổi cách dựng kịch bản đọc cho Gemini TTS (hướng dẫn giọng, dấu ngắt)
    // -> audio cũ trong kho không bị phát nhầm với cấu hình mới.
    const TTS_STYLE_VERSION = 1;
    const DEFAULT_TTS_MODEL = COST.DEFAULT_MODELS.tts;

    const SYNC = {
        tickMs: 50,
        startTolerance: 0.04,     // bắt đầu cụm sớm tối đa (giây media)
        driftCorrect: 0.15,       // lệch audio vượt ngưỡng này thì tua lại
        // Drift handling (1.6.8). Measured in real Chrome on 120 s of VieNeu dubbing: the old
        // per-tick nudge (threshold 0.035 s, rate re-set every 50 ms) changed playbackRate 510 times
        // on playing voices, about 21 per sentence. Every change restarts Chrome's pitch-preserving
        // time-stretch, which is the audible stutter. Now: the audio's start-up latency is absorbed
        // once (driftAnchor), drift is smoothed, and a nudge has hysteresis and a minimum spacing.
        driftNudge: 0.08,         // smoothed drift beyond this starts a nudge ...
        driftNudgeOff: 0.02,      // ... which ends once the drift is back within this
        nudgeMax: 0.03,           // a nudge is one fixed step of 3% (pitch kept)
        nudgeSpacing: 0.8,        // seconds (media) between two rate changes on one voice
        driftAnchor: 0.12,        // an element that came up ahead by up to this is absorbed, not chased
        // Start-up (2.4.6). Chrome needs time to start a media element (a fresh one, one it idled, one
        // just seeked): ~20 ms on a quiet machine, 0.16 to 0.96 s in the user's Chrome while the voice
        // server made takes (chrome://media-internals). driftCorrect read that wait as drift and
        // seeked again, which restarts the wait: one 1.4x line was seeked 7 times in 1.1 s, each seek
        // a pop, the voice on and off ("bụp bụp, lúc được lúc không"). A start or a seek is now
        // complete only once the element is seen moving; the wait is absorbed into the line's
        // timeline (it starts that much later, every word kept), never chased.
        startMoved: 0.015,        // moved this far past where it was set: the element is playing
        startWaitMax: 2.5,        // wall s a line waits for its element to start before it may end unheard
        reseekSpacing: 2.0,       // wall s between two drift seeks of one playing voice
        // Edges without a click (2.4.6): Chrome cuts a media element's wave wherever a pause, a seek
        // or a start lands, and applies its volume once per audio buffer (~10 ms) without a ramp. A
        // voice resumed inside its take stays silent until it moves, then fades in; a sounding voice
        // that must stop (the video paused or stalled, the next line due) steps down first.
        fadeFrom: 0.02,           // a start this far into a take is inside it (the take's own start fades in)
        restartFade: 0.04,        // s, fade-in of a voice resumed inside its take
        pauseFade: 0.04,          // s, fade-out before a sounding voice is paused
        fadeStepMs: 10,           // ms between two volume steps (about one audio buffer)
        snapToNatural: 0.05,      // a sentence rate within 5% of 1.0 plays at exactly 1.0 (no stretch at all)
        maxLagBoost: 0.25,        // tăng tốc tối đa để đuổi kịp khi trễ
        maxSpeechRate: 1.3,       // tốc độ phát audio tối đa (giữ cao độ) kể cả khi đuổi kịp
        endGrace: 0.4,            // chờ audio tự kết thúc thêm tối đa bấy nhiêu giây sau mốc dự kiến
        // NHỊP NÓI BÁM PHỤ ĐỀ NHƯNG ĐỀU: mỗi câu co giãn để nói xong đúng lúc phụ đề của nó
        // hết (không chạy trước, không tụt lại), trong dải hẹp, và đổi từ từ giữa các câu
        minSpeechRate: 0.95,      // chậm nhất 0,95x (giữ cao độ; chậm hơn nghe kéo lê)
        fitSlack: 0.25,           // được nói quá mốc cuối phụ đề của câu tối đa bấy nhiêu giây
        catchUpMax: 0.08,         // đang trễ so với phụ đề: nhanh thêm tối đa 8% để bắt kịp dần
        rateStepUp: 0.1,          // câu sau được nhanh hơn câu trước tối đa 0,1 (câu tràn khung: đuổi kịp, không dồn trễ)
        rateStepDown: 0.06,       // ... và chậm lại từ từ, tối đa 0,06 mỗi câu
        rateStepInSentence: 0.03, // the next part of a sentence being read: at most this change
        sentenceGap: 0.18,        // câu trước kết thúc bằng dấu chấm: nghỉ tối thiểu trước câu sau (như người thật)
        joinGap: 0,               // câu trước còn nối tiếp (chưa hết ý): nói liền, không nghỉ
        // ... unless that part ended on a comma, semicolon or colon (1.7.2): a long sentence is cut
        // into two requests at a comma (segSoft), each take is trimmed to 25 ms of silence, and the
        // second part followed after ~0.05 s, where the same comma inside one take rests 0.14 to
        // 0.28 s. This keeps the join as long as a comma after a long clause.
        joinGapClause: 0.15,
        joinGapValue: 0.3,        // ... also after a cut at a clause boundary this strong (dub-prosody value)
        chainLead: 0.8,           // câu CHƯA HẾT (đoạn trước không kết thúc bằng dấu chấm): đoạn sau được
                                  // nói sớm tối đa bấy nhiêu giây ngay sau đoạn trước, không đứng im chờ phụ đề.
                                  // Trước 1.3.2 là 2,0 giây: phụ đề người dịch (TED) ngắn hơn lời gốc, độ sớm
                                  // CỘNG DỒN qua chuỗi đoạn -> đo thật giọng đi trước phụ đề tới 2,0 giây
        rateMemory: 4,            // câu trước kết thúc cách đây quá bấy nhiêu giây thì không cần nối nhịp
        maxQueueLag: 4.5,
        // ... but a line whose audio is ready is read anyway, up to maxQueueLagHard late (readsLate,
        // 2.4.5). Dropping it did not buy the sync back: on the user's 40 saved videos (745 min,
        // healthy server, Mỹ Duyên) reading every such line took drops 8 -> 0 and words lost
        // 113 -> 0, while the latest start went 6.68 -> 6.70 s and starts over 4.5 s late 11 -> 38
        // of 7271; none came near 8. 2.4.2's absorbsLag read only a line that gave time back.
        // maxQueueLag alone still drops a line whose audio is not ready (a slow server).
        maxQueueLagHard: 8,
        keepBehind: 90,           // giữ audio các câu vừa qua trong 90 giây (tua lùi ngắn phát ngay)
        keepAhead: 240,           // audio quá xa phía trước (sau khi tua lùi) cũng được giải phóng
        releaseEvery: 5000,       // kiểm tra giải phóng mỗi 5 giây (ms)         // câu chờ trong hàng quá mức này (giây): bỏ nguyên câu, không cắt giữa
        skipAfter: 8,             // lag + expected wait above this: give up on the segment and skip
                                  // to one whose audio can still arrive. Measured: 4.5 loses 2 more
                                  // sentences when the server is only slightly slow
        skipAheadMax: 60,         // safety bound on one skip (s). Measured on a real timeline with a
                                  // slow server: capping at 6 to 14 loses MORE sentences (14/61 vs
                                  // 29/61), because a short jump lands late again and skips again
        renderOverhead: 0.6,      // fixed seconds per TTS request (network, startup), outside the rtf,
                                  // until renderOver() has fitted the real one (VieNeu measured 0.07)
        overFitMin: 4,            // takes needed before the overhead is fitted from them ...
        overFitSpread: 1.5,       // ... spanning at least this many seconds of audio
        overFitKeep: 12,          // the fit uses the latest this many takes
        overFitRange: [0.05, 1.5], // a fitted overhead is kept inside this
        overFitPad: 0.3,          // ... and this is added for the reach decisions. The exact figure let
                                  // marginal lines in that then started late: rapid seeks on a healthy
                                  // server (60 runs) late 25 -> 33; with 0.3 29, and slow servers 539
        rtfShortAudio: 1.2,       // a take shorter than this is mostly overhead: never the "latest" rtf
        firstRtfCap: 1.0,         // first rtf sample of a run is capped: it carries the server's cold start
        dropLag: 4.0,             // giọng hệ thống trễ quá mức này mới bỏ phần còn lại của đoạn cũ (bớt mất lời)
        prefetchMax: 30,          // trần tạo trước audio (giây); chế độ sử dụng có thể hạ thấp hơn
        prefetchMin: 12,
        // Free local voice: audio made this far ahead (media seconds at 1x, scaled up by the video rate)
        // is the only shock absorber when the server slows down (macOS paging the model out, a busy
        // CPU: server.log had RTF 0.6-0.87 for minutes) on a fast speaker, whose Vietnamese needs up
        // to 1.25 s of audio per second of video (measured live, zPSs9a0MYGw). 20 s absorbed none of
        // it (1.9.9, real engine on a virtual clock, 6-min fast talks): server at 0.9x for 200 s,
        // lines dropped 22 -> 1; a 60 s stall 12 -> 0; at 1.2x for 90 s 10 -> 0 and silence 33 -> 3 s.
        // 90-120 gained nothing more. Free, and a seek only wastes renders nobody pays for.
        freeAheadMin: 60,
        freeAheadMax: 90,
        // ... but at a seek only a job for the first this many seconds after the landing point is
        // kept; one further ahead made the line under the playhead wait on the serial server
        seekKeepAhead: 20,
        batchSpill: 6,            // một lượt gộp được nhận thêm đoạn liền kề ngay sau tầm nhìn (giảm số lượt gọi)
        prefetchPaused: 10,       // khi video tạm dừng chỉ chuẩn bị đoạn sắp tới
        maxBatchSyl: 110,         // một lượt TTS ~20-25 giây audio (Gemini TTS cho phép tới 32k token)
        maxBatchPlans: 4,
        maxJobs: 3,               // tối đa 3 lượt TTS cùng lúc (kể cả lượt cũ đang chạy nốt sau khi tua)
        firstBatchSyl: 40,        // lượt ĐẦU sau khi bật / tua: chỉ một câu ngắn -> có tiếng sớm nhất
        thinBuffer: 1.5,          // audio sẵn phía trước < (độ trễ TTS x hệ số này) -> cho chạy 2 lượt để bắt kịp
        keepIfDone: 0.6,          // lượt cũ đã chạy >= 60% thời gian thường lệ: để chạy nốt (audio đã gần như chắc chắn bị tính tiền)
        denseRatio: 1.15,         // câu phải đọc nhanh hơn 1,15x mới vừa khung: rút khoảng nghỉ trong câu (không bỏ chữ)
        lagMaxSpeechRate: 1.4,    // đang trễ > lagBoostAt giây: được đọc nhanh tới 1,4x (Mỹ Duyên ~5 âm tiết/giây,
        lagBoostAt: 1.0,          // ngang tốc độ đọc tin tức) để bắt kịp, KHÔNG bỏ chữ
        // Adapt to how fast the video speaks (1.6.1). A slow voice (Kim Thanh, 3.8 syllables/s) on a
        // fast speaker hit the fixed 1.3x ceiling sentence after sentence and fell ~2 s behind. The
        // engine now reads the pace of the next paceWindow seconds: the speed each sentence needs
        // to fit its subtitle, at this voice's measured rate. A fast stretch lifts the floor (an
        // even, brisk pace instead of slow-fast-slow) and loosens the ceiling, never beyond what a
        // fast newsreader says (maxSpokenSps). A slow video changes nothing.
        planStep: 60,             // the planning window moves in steps of this many seconds
        planBehind: 150,          // ... and covers this much before the current step
        planAhead: 300,           // ... and this much after it (keepAhead 240 + prefetch fits inside)
        paceWindow: 90,
        paceEvery: 2000,          // ms between two pace readings
        paceFloorShare: 0.92,     // floor = this share of the typical need (median)
        paceCeilingMax: 1.55,     // ceiling may rise to this (lag boost adds 0.1 on top)
        paceCeilingPad: 1.08,     // ceiling = the upper-quartile need, plus this margin
        maxSpokenSps: 5.8,        // no rate makes the voice say more than this many syllables/s
        lookAhead: 3,             // sentences ahead that may pull the rate up early (see chooseRate)
        lookAheadEarly: 0.5,      // ... and how much sooner than its subtitle a sentence may end for it
        // Delivery scorecard (debugSnapshot only, 1.8.6): a line starting this late counts as a late
        // start; a silence this long beyond the rest the engine means to keep counts as a delivery gap
        lateStart: 0.5,
        eventKeep: 150,           // diagnostics ring (note): this many recent events are kept
        entryWaitMin: 1.0,        // a line entered at a start or seek with this much left, then lost waiting for audio, counts as dropped
        crowdGainMin: 1.0,        // crowdsNext gives a late line up only for at least this much gained
        gapMin: 0.12,
        // Entering a line mid-way (after a seek, 1.8.7): start at a stop the voice really made, not at
        // the proportional position (inside a syllable ~85% of the time, a click with no fade-in).
        // Back to the stop before it up to entryBack s (a phrase heard again), else ahead to the next
        // one up to entryAhead s (a few words skipped); neither in reach: the proportional position.
        entryStopMs: 40,          // a silence this long is a gap between words. Measured on 25 real takes,
                                  // 1,509 landings: 80 ms left 6% inside the voice, 60 ms 1.3%, 40 ms 0.3%
        entryBack: 1.2,
        entryAhead: 0.8,
        adResumeWithin: 2,        // after an ad, the cut line goes on only if the lecture is this close to where it was
        // Optimistic render time, used by unreachable() before a render is measured: a line is only
        // given up when even this cannot bring its audio in time (healthy VieNeu measured ~0.24)
        reachOverheadMin: 0.2,
        reachRtfMin: 0.2,
        // Resilience (1.8.8). The service worker can fail to answer at all (evicted mid-reply,
        // IndexedDB wedged): Chrome then closes the port only after ~5 min. A store lookup waits at
        // most lookupTimeout (the worker's own read limit is 1.5 s a key; waking it ~1 s), then counts
        // as a miss; a TTS job silent for jobStallMs is let go. Its retry joins the same request in
        // the worker (ttsInFlight), so nothing is generated twice. background.js worst legit case:
        // idle wait 20 s + cold limit 60 s.
        lookupTimeout: 4000,
        jobStallMs: 90000,
        orphanStallMs: 20000,     // a job left behind (seek, line passed) stops counting toward maxJobs
                                  // this long after it was left: three silent ones used to block for good
        // A take is accepted only with a real length (a NaN duration made every later rate NaN)
        minAudio: 0.05,
        // A play() the browser refused (autoplay policy, NotAllowedError) is asked again after this
        // long, not on every 50 ms tick: 282 calls in 20 s of refusals before (1.9.0)
        playRetryMs: 1000,
        // A system-voice phrase whose end Chrome never reports is given up after its predicted length
        // x liveStallFactor + liveStallPadMs (wall clock), then the next phrase goes on (1.9.1)
        liveStallFactor: 2.5,
        liveStallPadMs: 2000,
        maxAudio: 600,
        duckRampTicks: 9,         // ticks from full to the duck level or back (0.45 s), in equal dB steps
        // (2.1.2) Ticks from full to the duck level once a voice is already sounding over it (a take
        // that came just in time: the first line after a start or a seek, a slow server). A line
        // announced ahead has the original down before it starts, at the slower duckRampTicks
        duckAttackTicks: 4,
        duckHold: 0.35,           // the original stays down this long (media s) after a line ends
        // (2.0.8) Before a line whose start is known (its take is in the page, or a system-voice
        // phrase), a gap shorter than this (wall seconds) keeps the original down, and after a longer
        // one it comes down before the line starts (lineComing)
        duckBridge: 2.0
    };

    // ============================================================
    // PROVIDER: lớp trừu tượng để thay engine TTS mà không sửa phần còn lại
    //   caps.prerender: trả về audio có sẵn (đo được thời lượng, co giãn được)
    //   caps.live     : phát trực tiếp từng cụm (Web Speech)
    //   caps.rate / pitch / style / ssml / timeStretch
    // ============================================================

    // ---- Web Speech (giọng hệ thống, miễn phí, chạy offline) ----
    function createWebSpeechProvider(env) {
        const synth = env.speechSynthesis;
        const Utter = env.SpeechSynthesisUtterance;
        let voices = [];
        const model = { ...PLAN.DEFAULT_VOICE_MODEL };
        const provider = {
            id: "system",
            label: "Giọng hệ thống",
            caps: { live: true, prerender: false, rate: true, pitch: true, style: false, ssml: false, timeStretch: false },
            voiceModel: model,
            async init(prefName) {
                voices = await loadVoices(synth);
                const vi = voices.filter(v => /^vi/i.test(v.lang || ""));
                const pref = voices.find(v => v.name === prefName);
                // Giọng chất lượng cao (Enhanced/Premium/Natural) được ưu tiên
                const sorted = vi.sort((a, b) => score(b) - score(a));
                provider.voices = { S1: pref || sorted[0] || null, S2: sorted.find(v => v !== (pref || sorted[0])) || pref || sorted[0] || null };
                provider.voiceLabel = provider.voices.S1 ? provider.voices.S1.name : "";
                return !!provider.voices.S1;
                function score(v) { return (/enhanced|premium|natural|neural|nâng cao|cao cấp|tự nhiên/i.test(v.name) ? 10 : 0) + (v.localService ? 1 : 0); }
            },
            // Phát một cụm; trả về handle có cancel()
            speak(text, opts, cb) {
                const u = new Utter(text);
                const voice = (provider.voices && (provider.voices[opts.speaker] || provider.voices.S1)) || null;
                if (voice) u.voice = voice;
                u.lang = "vi-VN";
                u.rate = Math.max(0.5, Math.min(2.6, opts.rate));
                // Người nói thứ hai dùng cùng giọng thì hạ cao độ để phân biệt
                const speakerPitch = opts.speaker === "S2" && provider.voices && provider.voices.S2 === provider.voices.S1 ? 0.88 : 1;
                u.pitch = Math.max(0.5, Math.min(1.6, opts.pitch * speakerPitch));
                u.volume = Math.max(0, Math.min(1, opts.volume == null ? 1 : opts.volume));
                let done = false;
                u.onstart = () => cb.onstart && cb.onstart();
                u.onend = () => { if (!done) { done = true; cb.onend && cb.onend(); } };
                u.onerror = e => { if (!done) { done = true; cb.onerror && cb.onerror(e); } };
                synth.speak(u);
                // The handle holds the utterance: one nothing refers to can be collected with its
                // handlers, and its end is then never reported (a known Chrome behaviour)
                return { utterance: u, cancel() { if (!done) { done = true; } synth.cancel(); } };
            },
            stopAll() { try { synth.cancel(); } catch (e) { /* bỏ qua */ } }
        };
        return provider;
    }

    function loadVoices(synth) {
        return new Promise(resolve => {
            const v = synth.getVoices();
            if (v && v.length) return resolve(v);
            let settled = false;
            const done = () => { if (!settled) { settled = true; resolve(synth.getVoices() || []); } };
            try { synth.addEventListener("voiceschanged", done, { once: true }); } catch (e) { /* bỏ qua */ }
            setTimeout(done, 1500);
        });
    }

    // ---- Gemini TTS (giọng AI tự nhiên, trả audio PCM) ----
    // Gọi qua service worker (background.js, action "synthesizeSpeech").
    function createGeminiProvider(env, settings) {
        const provider = {
            id: "gemini",
            label: "Giọng Gemini AI",
            caps: { live: false, prerender: true, rate: false, pitch: false, style: true, ssml: false, timeStretch: true },
            // Giọng AI tự nhiên nói nhanh hơn giọng hệ thống; thời lượng thật đo từ audio
            voiceModel: { ...PLAN.DEFAULT_VOICE_MODEL, sylPerSec: 4.6, rateExp: 1, pauseFactor: 1.3 },
            voices: { S1: settings.geminiVoice || "Kore", S2: settings.geminiVoice2 || "Charon" },
            get voiceLabel() { return provider.voices.S1; },
            async init() { return true; },
            // Khóa kho audio: mọi thứ QUYẾT ĐỊNH âm thanh (không dùng mã video) ->
            // cùng câu, cùng giọng, cùng kiểu đọc ở video khác vẫn dùng lại được.
            audioKey(plan) {
                const pace = plan.sps > 5.2 ? "fast" : plan.sps < 3.8 ? "slow" : "normal";
                return CACHE.hashKey([
                    "audio", TTS_STYLE_VERSION, settings.ttsModel || DEFAULT_TTS_MODEL,
                    provider.voices[plan.speaker] || provider.voices.S1,
                    CACHE.normalizeText(plan.text).toLowerCase(),
                    plan.intent || "neutral", (plan.emphasisWords || []).map(w => w.toLowerCase()).sort(), pace
                ]);
            },
            abort(jobId) { env.sendMessage({ action: "ttsAbort", jobId }); },
            // Gộp nhiều đoạn liền nhau vào MỘT lượt TTS. Service worker cắt lại theo
            // khoảng lặng và LƯU KHO từng đoạn (theo khóa gửi kèm) trước khi trả lời:
            // tab đóng hay trả lời bị mất thì audio đã trả tiền vẫn còn.
            async render(plans, ctx = {}) {
                const speaker = plans[0].speaker;
                const keys = await Promise.all(plans.map(p => p.audioKey || provider.audioKey(p)));
                const res = await env.sendMessage({
                    action: "synthesizeSpeech",
                    text: geminiScript(plans, ctx),
                    voice: provider.voices[speaker] || provider.voices.S1,
                    model: settings.ttsModel || "",
                    jobId: ctx.jobId,
                    parts: plans.map((p, k) => ({ key: keys[k], weight: p.phrases.reduce((a, ph) => a + ph.syl, 0) }))
                });
                if (res && (res.aborted || res.errorType === "aborted")) { const err = new Error("Đã hủy"); err.aborted = true; throw err; }
                if (res && res.errorType === "split") { const err = new Error(res.error); err.splitFailed = true; throw err; }
                if (!res || !res.ok || !Array.isArray(res.parts)) {
                    const err = new Error(res ? res.error : "Không có phản hồi TTS");
                    err.type = res && res.errorType;
                    throw err;
                }
                return res.parts.map((sp, k) => ({
                    planId: plans[k].id, wav: AUDIO.base64ToBytes(sp.wav), duration: sp.duration, sampleRate: sp.sampleRate, cached: !!res.fromCache
                }));
            }
        };
        return provider;
    }

    // ---- Giọng Việt trên máy: VieNeu-TTS (máy chủ cục bộ qua service worker) ----
    // Miễn phí, nhanh (M3: ~0,25 giây tạo cho 1 giây lời nói), giọng Việt bản ngữ theo vùng.
    // Máy chủ trên CPU chỉ phục vụ MỘT luồng: mỗi lượt một câu, gửi lần lượt (caps.serial).
    // Không nhận lời chỉ dẫn ngữ điệu: nhịp ngắt nghỉ thể hiện bằng dấu câu.
    // 2: nhiệt độ 0,6 + rút khoảng lặng dài + dấu câu mới -> audio cũ không dùng lẫn
    // 3: giữ khoảng ngừng tự nhiên (tới 0,4 giây) + dấu phẩy ở chỗ người nói gốc ngừng
    // 4 (1.6.7): no comma at source pauses, punctuation-aware pause shaping, 48 kHz
    // 5 (1.6.8): pause shaping v2 (comma pause follows the clause), gentler gate, longer segments
    // 6 (1.7.0): spectral hiss removal (AUDIO.denoise) before shaping
    // 7 (1.7.2): rumble cut, corrected hiss estimate, no gate, pauses at clause openings, 20 ms onset
    // 8 (1.7.5): pauses kept before adjunct openers (bằng cách, thông qua, dựa trên...)
    // 9 (1.7.6): prosody model (dub-prosody.js) picks the pauses, breathing commas in long stretches
    // 10 (1.7.8): English spans rendered for the voice (dub-speech.js), no pause inside a span, the
    //    backlog-16 pause rules: the cached audio is shaped, so every line re-renders once (free)
    // 11 (1.8.0): the key also carries the prosody signature of the line (PROSODY.signature): from
    //    now on a change to the text analysis re-renders only the lines it changes. The pronunciation
    //    is keyed by the rendered text itself (speakScript). Neither touches the paid voice's key
    const LOCAL_STYLE_VERSION = 11;
    // Free voice segmenting: whole sentences across translation groups, and a segment may run to
    // 11 s (paid: 8) before it is cut at a subtitle line. Every cut restarts the voice's intonation;
    // the free server renders ~4x faster than real time, so a longer segment costs ~3 s ahead.
    const FREE_SEGMENTS = { joinGroups: true, segSoft: 8, segHard: 11 };
    function createVieneuProvider(env, settings) {
        const L = COST.LOCAL_TTS;
        const provider = {
            id: L.id,
            label: L.label,
            caps: { live: false, prerender: true, rate: false, pitch: false, style: false, ssml: false, timeStretch: true, serial: true, maxBatch: 1, free: true },
            // Nhịp nền: giọng chậm (kể chuyện, đọc truyện) được tăng tốc đều tới nhịp mục tiêu
            tempo: { targetSps: L.targetSps, maxTempo: L.maxTempo, minSps: L.minSps, maxFloor: L.maxFloor },
            // Mô hình thời lượng cho bộ lập kế hoạch = thời lượng PHÁT (đã tính nhịp nền)
            voiceModel: { ...PLAN.DEFAULT_VOICE_MODEL, sylPerSec: L.targetSps * 0.97, rateExp: 1, pauseFactor: 1.0 },
            voices: { S1: settings.localVoice || L.defaultVoice, S2: settings.localVoice2 || L.defaultVoice2 },
            // Tốc độ tự nhiên của giọng (đo trước trên máy; sau đó engine tự đo từ audio thật)
            naturalSps(speaker) {
                const v = L.voices.find(x => x.id === (provider.voices[speaker] || provider.voices.S1));
                // Đo thật trên bài giảng: tốc độ khi lồng tiếng ~86% tốc độ đo bằng câu mẫu (số,
                // từ tiếng Anh, khoảng lặng ngắn còn lại); engine tự đo lại từ audio thật
                return (v && v.sps ? v.sps : 4.8) * 0.86;
            },
            get voiceLabel() { return provider.voices.S1; },
            async init() {
                const r = await env.sendMessage({ action: "localTtsStatus" });
                // Không "làm nóng giọng" nữa: đo thật, 2 lượt làm nóng chen TRƯỚC câu đầu tiên
                // (~0,6 giây) trong khi lợi ích chỉ ~0,2 giây ở lượt đầu của mỗi giọng
                return !!(r && r.running);
            },
            audioKey(plan) {
                const plain = plainScript(plan);
                const base = ["audio-local", LOCAL_STYLE_VERSION, L.model, L.sampleRate,
                    provider.voices[plan.speaker] || provider.voices.S1, CACHE.normalizeText(speakScript(plan)).toLowerCase(),
                    PROSODY && PROSODY.signature ? PROSODY.signature(plain) : ""];
                // Câu dày chữ tạo với khoảng nghỉ ngắn hơn: khóa kho riêng (không dùng lẫn audio thường)
                return CACHE.hashKey(plan.tightPauses ? [...base, "tight"] : base);
            },
            abort(jobId) { env.sendMessage({ action: "ttsAbort", jobId }); },
            async render(plans, ctx = {}) {
                const out = [];
                for (const p of plans) {
                    const key = p.audioKey || await provider.audioKey(p);
                    const res = await env.sendMessage({
                        action: "synthesizeSpeech", engine: L.id,
                        text: plainScript(p), speak: speakScript(p), voice: provider.voices[p.speaker] || provider.voices.S1,
                        jobId: ctx.jobId, parts: [{ key, weight: p.phrases.reduce((a, ph) => a + ph.syl, 0) }],
                        maxPause: p.tightPauses ? L.tightPause : undefined, breath: breathAt(p)
                    });
                    if (res && (res.aborted || res.errorType === "aborted")) { const err = new Error("Đã hủy"); err.aborted = true; throw err; }
                    if (!res || !res.ok || !Array.isArray(res.parts) || !res.parts[0] || typeof res.parts[0].wav !== "string") {
                        const err = new Error(res ? res.error || "VieNeu trả dữ liệu không hợp lệ" : "Không có phản hồi từ VieNeu");
                        // no reply at all (worker evicted, port closed) vs an answer without audio
                        err.type = !res ? "no_response" : res.ok ? "invalid" : (res.errorType || "local_error");
                        throw err;
                    }
                    const sp = res.parts[0];
                    let wav;
                    try { wav = AUDIO.base64ToBytes(sp.wav); } catch (e) { const err = new Error("Audio VieNeu hỏng (base64)"); err.type = "invalid"; throw err; }
                    out.push({ planId: p.id, wav, duration: sp.duration, sampleRate: sp.sampleRate, cached: !!res.fromCache });
                }
                return out;
            }
        };
        return provider;
    }

    // Plain text for VieNeu (no prosody instructions; it pauses at punctuation):
    //   - the translation's own punctuation, plus a comma after an opener ("Bây giờ, ...") and
    //     (1.7.6) a breathing comma in a long unpunctuated stretch (dub-prosody breathText). No
    //     comma at every hint or source pause: VieNeu stops 0.3 to 0.45 s at each one
    //   - a sentence that runs on into the next subtitle gets no full stop (no falling close)
    //   - symbols it cannot read are dropped: ¦, [music], (laughs), ♪, >>, a leading dialogue dash
    // The rest the voice takes after a segment before the next one: a sentence gap after a finished
    // sentence, none inside a running one, a comma's worth when the part ended on , ; : (1.7.2), or
    // (1.7.6) when it was cut at a clause boundary the text has no comma for ("... tại Toronto |
    // đã tạo ra"): one take ends and the next starts there, as a reader would breathe
    function gapAfter(plan, next) {
        if (!plan || !plan.continuesNext) return SYNC.sentenceGap;
        const text = plainScript(plan);
        if (/[,;:]["”')\]]*$/.test(text)) return SYNC.joinGapClause;
        return next && PROSODY && PROSODY.boundaryValue(text, plainScript(next)) >= SYNC.joinGapValue ? SYNC.joinGapClause : SYNC.joinGap;
    }

    // (2.0.9) One tick of the duck ramp: equal steps of loudness (dB), the ear's scale, not of
    // amplitude, so full <-> duck level takes SYNC.duckRampTicks ticks either way. The linear ramp
    // (0.09 a tick) jumped +2.9 dB on its first step back up and crept +0.8 dB on its last, and a line
    // that began over a loud original had it 1.6 dB louder in its first 0.45 s. A duck of 0 ramps to
    // -40 dB, then off; a shallow one still moves at least 6 dB over the ramp.
    function duckStep(from, target, duck, ticks) {
        const FLOOR = 0.01;
        const span = Math.max(6, -20 * Math.log10(Math.max(FLOOR, Math.min(1, duck))));
        const ratio = Math.pow(10, -span / 20 / (ticks || SYNC.duckRampTicks));
        if (from > target) { const x = from * ratio; return x <= target + 1e-6 || x < FLOOR ? target : x; }
        const x = Math.max(from, FLOOR) / ratio;
        return x >= target - 1e-6 ? target : x;
    }

    function plainScript(plan) {
        // 1.7.6: a breathing comma at the best clause boundary of a long unpunctuated stretch
        return PROSODY ? PROSODY.breathText(scriptBase(plan)) : scriptBase(plan);
    }

    // (2.1.8) The words plainScript put a breathing comma after, sent with the take so its shaping
    // keeps a breath there, not a written comma's pause (dub-audio shapePauses opts.breath)
    function breathAt(plan) {
        return PROSODY && PROSODY.breathAdded ? PROSODY.breathAdded(scriptBase(plan)) : [];
    }

    // plainScript before the breathing commas
    function scriptBase(plan) {
        const parts = plan.phrases.map((ph, k) => {
            let t = ph.text.replace(/¦/g, "").replace(/\[[^\]]*\]|\([^)]*\)|[♪♫*_#]|>>/g, " ").replace(/^\s*[-–]\s+/, "").trim();
            const last = k === plan.phrases.length - 1;
            // Only an opener ("Bây giờ, ...") earns a comma the text does not have. 1.6.7 dropped the
            // comma at the source speaker's pauses: they are mapped onto the Vietnamese by position,
            // often landed mid-phrase, and the voice stopped where the sentence has no break
            const natural = ph.breakKind === "opener";
            if (!last && natural && t && !/[.,;:!?…]$/.test(t)) t += ",";
            return t;
        }).filter(Boolean);
        let s = parts.join(" ").replace(/\s+([,.;:!?…])/g, "$1").replace(/\s+/g, " ").trim();
        if (s && !plan.continuesNext && !/[.!?…]$/.test(s)) s += ".";
        return s;
    }

    // What VieNeu is asked to say: plainScript with its English spans written the way its front end
    // reads them right (dub-speech.js: "IKEA" -> <en>ikea</en>, "Tom Hanks" -> <en>tahm</en> Hanks).
    // plainScript stays the text the pauses are placed on; this one is only spoken, and keys the
    // audio cache (a line the renderer leaves alone is the same string as plainScript).
    function speakScript(plan) {
        const s = plainScript(plan);
        return SPEECH ? SPEECH.render(s, { source: plan.srcText }).text : s;
    }

    // Kịch bản đọc cho Gemini TTS: hướng dẫn giọng (ngữ điệu, nhịp, nhấn) + lời thoại.
    // Khoảng dừng thể hiện bằng dấu câu ("…" = ngừng dài, "," = ngừng ngắn).
    function geminiScript(plans, ctx = {}) {
        const persona = ctx.persona || "một người Việt đang nói tự nhiên trong video, giọng ấm, rõ ràng, như đang giảng giải cho người nghe";
        const notes = [];
        plans.forEach((p, i) => {
            const bits = [];
            if (p.intent && p.intent !== "neutral") bits.push(p.style);
            if (p.emphasisWords && p.emphasisWords.length) bits.push(`nhấn vào "${p.emphasisWords.join('", "')}"`);
            if (p.sps > 5.2) bits.push("nói nhanh, gọn");
            else if (p.sps < 3.8) bits.push("nói thong thả");
            if (bits.length) notes.push(`đoạn ${i + 1}: ${bits.join(", ")}`);
        });
        const lines = plans.map(p => p.phrases.map((ph, k) => {
            const last = k === p.phrases.length - 1;
            let t = ph.text.replace(/¦/g, "").trim();
            // Chỉ yêu cầu ngừng lâu khi thật cần: khoảng lặng cũng được tạo (và tính tiền) như audio
            if (!last && ph.pause >= 0.6 && !/[.,;:!?…]$/.test(t)) t += "…";
            else if (!last && ph.pause >= 0.12 && !/[.,;:!?…]$/.test(t)) t += ",";
            return t;
        }).join(" "));
        return `Đọc bằng tiếng Việt như ${persona}. Ngắt nghỉ theo dấu câu, dấu "…" là ngừng lâu hơn; nghỉ rõ giữa các đoạn. ` +
            (notes.length ? `Ngữ điệu: ${notes.join("; ")}. ` : "") +
            `Chỉ đọc phần lời thoại dưới đây, không đọc phần hướng dẫn này:\n\n${lines.join("\n\n")}`;
    }

    // ============================================================
    // ENGINE
    // ============================================================
    class DubEngine {
        // deps: { video, getGroups, providers:{primary, fallback}, now, setInterval, clearInterval, setTimeout, clearTimeout,
        //         createAudio(url), createObjectURL(bytes), revokeObjectURL, onStatus }
        // There is no condensing path: a line is always spoken whole (CLAUDE.md rule 1). 1.7.3 removed
        // the machinery that a single `condense: null` in dubbing.js used to keep switched off.
        constructor(deps, settings = {}) {
            this.d = deps;
            this.settings = { duck: 0.2, volume: 1, ...settings };
            this.provider = deps.providers.primary;
            this.fallback = deps.providers.fallback || null;
            this.plans = [];
            this.planById = new Map();
            this.sourceSig = "";
            this.rendered = new Map();      // planId -> { url, duration, stretch, el }
            this.pending = new Map();       // planId -> jobId that is making it (only that job clears it)
            this.failed = new Map();        // planId -> số lần lỗi
            this.cacheChecked = new Set();  // planId đã tra kho audio (tránh tra lại)
            this.jobs = new Map();          // jobId -> { planIds, t0, orphan }
            this.jobSeq = 0;
            this.renderLatency = null;      // EMA thời gian một lượt TTS (giây)
            this.renderRtf = null;          // EMA of generation speed (seconds spent / seconds of speech)
            this.lastRtf = null;            // latest rtf sample
            this.renderTakes = [];          // { audio, secs } of recent takes made while the server was free
            this.fittedOver = null;         // fixed seconds per request fitted from them (renderOver)
            this.seekTimes = [];
            this.live = null;               // { planId, k, handle, speaking, phraseStartMedia, wallStart, rate }
            this.speech = null;             // lời đang phát (audio có sẵn): { id, mediaStart, offset, rate, end }
            this.voiceSps = new Map();      // tốc độ nói thật của từng người nói (âm tiết/giây, đo từ audio)
            this.lastRate = null;
            this.warmup = true;             // lượt TTS đầu tiên nhỏ (có tiếng sớm nhất)
            this.lastSpokenStart = null;    // mốc bắt đầu của câu vừa nói (hàng đợi lời nói)
            this.entryWait = null;          // the line waited on for audio at a start or a seek
            this.lastT = null;
            this.stats = { started: [], corrections: 0, dropped: 0, errors: 0, requests: 0, lagMax: 0, cacheHits: 0, ttsPlans: 0, aborted: 0 };
            this.duckFactor = 1;
            this.duckDirty = false;         // volume written by someone else: re-apply the duck next tick
            this.baseVolume = null;
            this.lastSetVolume = null;
            this.speakingUntilMedia = -1;
            this.consecutiveErrors = 0;
            this.running = false;
        }

        start() {
            if (this.running) return;
            this.running = true;
            const v = this.d.video;
            // A duck left by an engine in another script instance (the old one after a Reload) holds
            // the user's level in the element; the element's own volume is that level ducked
            // A held level below the element's own is stale (raised since): the element wins
            const held = this.heldBaseVolume();
            this.baseVolume = held != null && held >= v.volume - 0.005 ? held : v.volume;
            this.claimVolume();
            this.onVolume = () => {
                if (this.lastSetVolume === null || Math.abs(v.volume - this.lastSetVolume) <= 0.005) return;
                // Someone else wrote the volume. YouTube's player writes its own full (unducked) level:
                // its slider never shows our ducked value, and it re-applies Stable Volume by itself
                // (measured after a seek: 0.1 -> 0.89). That value is the new base, and the duck must
                // be applied again, or the original track stays loud until the voice pauses.
                // A plain <video> control shows the ducked value, so a drag there is scaled back up.
                this.baseVolume = this.settings.playerOwnsVolume ? v.volume : Math.min(1, v.volume / Math.max(0.05, this.duckFactor));
                this.duckDirty = true;
                // (2.4.6) Measured in the user's YouTube tab: the player wrote its full level (0.825
                // over a 0.2475 duck) 2 s after play and the original sounded at full until the next
                // tick, up to 50 ms, a loud blip. The duck goes back at once
                if (this.settings.playerOwnsVolume && this.duckFactor < 1 && this.ownsVolume()) this.setVideoVolume(this.baseVolume * this.duckFactor);
            };
            // an ad swapping into the element seeks it too: the ad gate resets once the ad is over
            this.onSeek = () => { if (!this.isAdShowing()) this.hardReset("seek"); };
            this.onPauseLike = () => this.silence();
            this.onWaiting = () => { this.waiting = true; this.silence(); };
            this.onPlaying = () => { this.waiting = false; };
            v.addEventListener("volumechange", this.onVolume);
            v.addEventListener("seeking", this.onSeek);
            v.addEventListener("pause", this.onPauseLike);
            v.addEventListener("waiting", this.onWaiting);
            v.addEventListener("playing", this.onPlaying);
            v.addEventListener("seeked", this.onPlaying);
            // Video phát tiếp (sự kiện của chính video, không bị giãn như bộ đếm giờ khi cửa sổ bị che)
            this.onTimeUpdate = () => { if (this.running) this.tick(); };
            v.addEventListener("timeupdate", this.onTimeUpdate);
            this.timer = this.d.setInterval(() => this.tick(), SYNC.tickMs);
            this.headAt = Math.round(v.currentTime || 0);   // đoạn đầu ngắn quanh chỗ bắt đầu xem
            this.resetWall = this.d.now();
            this.startedAt = this.resetWall;
            this.events = [];
            this.refresh();
            this.status();
        }

        stop() {
            if (!this.running) return;
            this.running = false;
            this.d.clearInterval(this.timer);
            // the wake-up for the next line: left pending, a restart before it fired could not set its own
            if (this.gapTimer != null && this.d.clearTimeout) this.d.clearTimeout(this.gapTimer);
            this.gapTimer = null;
            const v = this.d.video;
            v.removeEventListener("volumechange", this.onVolume);
            v.removeEventListener("seeking", this.onSeek);
            v.removeEventListener("pause", this.onPauseLike);
            v.removeEventListener("waiting", this.onWaiting);
            v.removeEventListener("playing", this.onPlaying);
            v.removeEventListener("seeked", this.onPlaying);
            v.removeEventListener("timeupdate", this.onTimeUpdate);
            this.silence();
            // Another video, dubbing off: requests still queued for this one must not keep the next
            // video's first line waiting (background.js lets a request the server started finish)
            for (const [jobId, job] of this.jobs) {
                job.orphan = true;
                job.orphanAt = this.d.now();
                if (this.provider.abort) { try { this.provider.abort(jobId); } catch (e) { /* bỏ qua */ } }
            }
            // released, not just paused (1.9.4): a paused element keeps its media player until GC. A
            // sounding one fades out first (2.4.7) and its URL goes after it, not under it
            for (const r of this.rendered.values()) {
                const url = r.url, revoke = () => { if (url && this.d.revokeObjectURL) this.d.revokeObjectURL(url); };
                if (r.el) this.releaseAudio(r, true, revoke);
                else revoke();
            }
            this.rendered.clear();
            this.setVideoVolume(this.baseVolume == null ? v.volume : this.baseVolume, true);
        }

        // ---------------- Dựng kịch bản & kế hoạch từ bản dịch có ngữ cảnh ----------------
        refresh(force) {
            const given = this.d.getGroups() || [];
            const all = given.filter(g => g && g.viText && g.viCues && g.viCues.length);
            // Only a window around playback is planned. Measured on a 60-minute lecture: planning the
            // whole video took ~90 ms on the page's main thread, and it ran again every time one more
            // group finished translating, i.e. hundreds of visible stutters. The window moves in
            // planStep steps, so a rebuild happens at most once per step while nothing new arrives.
            const t = (this.d.video && this.d.video.currentTime) || 0;
            const step = Math.floor(t / SYNC.planStep);
            const from = (step * SYNC.planStep) - SYNC.planBehind;
            const to = (step + 1) * SYNC.planStep + SYNC.planAhead;
            const groups = [];
            let tail = null;
            for (const g of all) {
                if (g.end < from) continue;
                if (g.start > to) { if (!tail || g.start < tail.start) tail = g; continue; }
                groups.push(g);
            }
            if (tail) groups.push(tail);              // one past the edge, so continuesNext stays right
            // A text that changed at the same length (a refine swapping "bước" for "khâu") left the
            // old lengths-only signature as it was, and the voice kept reading the old words. Each
            // group's last text is remembered by object; the same string compares at once, so this
            // stays as cheap as the lengths it replaces on the every-tick path.
            const seen = this.textSeen || (this.textSeen = new WeakMap());
            for (const g of groups) {
                if (seen.get(g) !== g.viText) { seen.set(g, g.viText); this.textRev = (this.textRev || 0) + 1; }
            }
            const sig = step + "|" + groups.length + "|" + this.textRev + "|" + (this.provider && this.provider.id) + "|" + (this.provider && this.provider.caps && this.provider.caps.free ? this.headAt : "");
            if (!force && sig === this.sourceSig) return false;
            this.sourceSig = sig;
            // Chỉ giọng MIỄN PHÍ (VieNeu) mới cắt đoạn đầu ngắn: đổi điểm cắt sau khi tua có thể phải
            // tạo lại vài đoạn; với Gemini TTS (tính tiền) giữ nguyên cách cắt để không tạo trùng
            const free = !!(this.provider && this.provider.caps && this.provider.caps.free);
            // who speaks when, from the source of every group, translated or not (2.4.8). With one
            // voice no turn at all: a reply inside a group is read on in the same breath, as before
            // (cut there, 45 saved videos: 53 more late starts, 2 s more silence, nothing gained)
            const speakerTurns = this.settings.secondVoice ? PLAN.speakerTurns(given) : PLAN.NO_TURNS;
            // what the queue has spoken or passed never changes (buildDubScript opts.spoken)
            const s0 = this.lastSpokenStart;
            const passed = s0 == null ? null : (this.plans || []).find(p => Math.abs(p.start - s0) < 1e-6);
            const spoken = s0 == null ? null : { start: s0, end: passed ? passed.end : s0 };
            const script = this.oneVoice(PLAN.buildDubScript(groups, { headAt: free ? this.headAt : null, speakerTurns, spoken, ...(free ? FREE_SEGMENTS : {}) }));
            const opts = { voiceModel: this.provider.voiceModel };
            this.plans = PLAN.planAll(script, opts);
            this.planById = new Map(this.plans.map(p => [p.id, p]));
            // Audio đã tạo cho lời thoại KHÁC (đoạn được cắt lại sau khi tua, bản dịch được sửa):
            // bỏ để tạo lại cho đúng lời, trừ đoạn đang nói
            for (const [id, r] of this.rendered) {
                const p = this.planById.get(id);
                if (p && r.text != null && r.text !== p.text && !(this.speech && this.speech.id === id)) {
                    if (r.el) this.releaseAudio(r);   // as in stop() and releaseOld(): not only its URL
                    if (r.url && this.d.revokeObjectURL) this.d.revokeObjectURL(r.url);
                    this.rendered.delete(id);
                    this.cacheChecked.delete(id);
                }
            }
            return true;
        }

        // The second voice (a different voice when the subtitles mark another speaker with ">>",
        // "- " or "NAME:") is optional and off by default: a voice switching mid-video surprises
        // more than it helps when the marks are unreliable. Off = everyone is S1.
        oneVoice(script) {
            if (this.settings.secondVoice) return script;
            for (const sg of script) sg.speaker = "S1";
            return script;
        }

        planAt(t) {
            const ps = this.plans;
            let lo = 0, hi = ps.length - 1, found = -1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (ps[mid].start <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
            }
            return found;
        }

        // ---------------- Vòng lặp chính ----------------
        tick() {
            if (!this.running) return;
            // A newer engine on this <video> (the new content script after a Reload) owns the duck:
            // this one stops, so two voices never read over each other
            if (!this.ownsVolume()) { this.stats.superseded = (this.stats.superseded || 0) + 1; this.stop(); return; }
            if (this.adGate()) return;
            const v = this.d.video;
            const t = v.currentTime;
            const now = this.d.now();
            if (this.lastT !== null && (t < this.lastT - 0.3 || t > this.lastT + 2.5)) {
                // A forward jump that matches the wall clock since the last tick is this page's own
                // timer running late (a long task, memory pressure, a throttled tab), not a seek: the
                // video and the voice element both played on meanwhile. A reset there cut the line
                // being read and entered it again mid-way. A real seek fires 'seeking' anyway.
                const ahead = t - this.lastT;
                const played = this.lastTickAt != null ? (now - this.lastTickAt) / 1000 * (v.playbackRate || 1) : 0;
                if (ahead > 0 && Math.abs(ahead - played) <= Math.max(0.5, ahead * 0.15)) this.stats.lateTicks = (this.stats.lateTicks || 0) + 1;
                else this.hardReset("jump");
            }
            this.lastTickAt = now;
            // Video không tiến dù không tạm dừng (mạng chậm) quá 400 ms: coi như đang tải
            if (this.lastT === null || t !== this.lastT) this.lastAdvance = now;
            const stalled = !v.paused && now - (this.lastAdvance || now) > 400;
            this.lastT = t;
            // Chưa nói câu nào mà vị trí đã khác xa điểm bắt đầu (YouTube khôi phục vị trí xem sau
            // khi bật): dời điểm cắt đoạn ngắn tới vị trí thật
            if (this.lastSpokenStart == null && !this.speech && !this.headPinned && Math.abs(t - (this.headAt || 0)) > 10) this.headAt = Math.round(t);
            this.refresh();

            const playing = !v.paused && !v.ended && (v.readyState === undefined || v.readyState >= 3) && !this.waiting && !stalled;
            // Chẩn đoán: video đang chạy mà engine coi là chưa phát được (lý do + thời điểm media)
            if (!playing && !v.paused && !v.ended) {
                const g = this.stats.gate || (this.stats.gate = { waiting: 0, ready: 0, stalled: 0, lastT: null });
                if (this.waiting) g.waiting++; else if (v.readyState !== undefined && v.readyState < 3) g.ready++; else if (stalled) g.stalled++;
                g.lastT = Math.round(t * 100) / 100;
            }
            if (playing) {
                if (this.provider.caps.live) this.tickLive(t, v.playbackRate || 1);
                else this.tickBuffer(t, v.playbackRate || 1);
            } else {
                this.silence();
            }
            // Lượt TTS không còn liên quan (tua, nhảy vị trí): hủy, kiểm tra thưa để rẻ
            if (this.jobs.size && (!this.lastJobCheck || now - this.lastJobCheck > 500)) {
                this.lastJobCheck = now;
                this.cancelObsoleteJobs(t);
            }
            this.schedule(t);
            this.updateDuck(t, playing);
            if (!this.lastRelease || now - this.lastRelease > SYNC.releaseEvery) {
                this.lastRelease = now;
                this.releaseOld(t);
            }
        }

        // ---- Ads (1.9.3) ----
        // A YouTube ad plays in the lecture's own <video>, so its clock (0 to 30 s) read as the
        // lecture's: the first lines were read over the ad, the ad was ducked and those lines were
        // rendered. d.adShowing() (optional) says an ad is on: nothing is spoken, scheduled or ducked,
        // and the lecture position is left as it was. When the ad ends the engine resets once at
        // wherever the lecture is, so held audio plays at once (audioReadyAt).
        isAdShowing() {
            if (!this.d.adShowing) return false;
            try { return !!this.d.adShowing(); } catch (e) { return false; }
        }
        adGate() {
            if (this.isAdShowing()) {
                if (!this.inAd) {
                    this.inAd = true;
                    this.stats.ads = (this.stats.ads || 0) + 1;
                    // the line the ad cut, and how far the voice had got in it (BACKLOG 35)
                    const S = this.speech, r = S && this.rendered.get(S.id);
                    this.adCut = S && r && r.el && !r.el.ended && this.lastT != null
                        ? { id: S.id, pos: r.el.currentTime || 0, at: this.lastT } : null;
                    // ... or, the voice resting between lines, the line it last finished: after the ad
                    // that line is not read again from the video's place (live harness, 2.0.0: the tail
                    // of a finished line was read twice because its subtitle was still up)
                    if (!this.adCut && this.lastSpokenId && this.lastT != null)
                        this.adCut = { done: true, id: this.lastSpokenId, start: this.lastSpokenStart, at: this.lastT };
                    this.silence();
                    this.speech = null;
                }
                this.updateDuck(0, false);              // the ad plays at the user's own level
                return true;
            }
            if (this.inAd) {
                this.inAd = false;
                this.lastT = null;                      // the ad's clock says nothing about a jump
                this.hardReset("ad");
                this.adResume = this.adCut;
                this.adCut = null;
            }
            return false;
        }

        // After an ad: the line it cut goes on where the VOICE was, not where the video is (BACKLOG
        // 35). A line already running late was entered at the video's place and skipped ~3 s nobody
        // heard (live harness, RTF 0.9). Back to the voice's own stop before that point, never ahead.
        takeAdResume(t) {
            const x = this.adResume;
            this.adResume = null;
            if (!x || Math.abs(t - x.at) > SYNC.adResumeWithin) return null;    // the lecture moved: a seek
            if (x.done) {                       // go on after the line already heard
                this.lastSpokenStart = x.start;
                this.lastSpokenId = x.id;
                this.stats.adKeptPlace = (this.stats.adKeptPlace || 0) + 1;
                return null;
            }
            const p = this.planById.get(x.id), r = this.rendered.get(x.id);
            if (!p || !r || x.pos >= r.duration - 0.3) return null;
            let offset = x.pos;
            for (const e of r.stops || []) { if (e > x.pos + 0.05) break; if (x.pos - e <= SYNC.entryBack) { offset = e; break; } }
            this.stats.adResumed = (this.stats.adResumed || 0) + 1;
            return { p, r, offset, lag: Math.max(0, t - p.start - offset) };
        }

        // ---- Phát trực tiếp theo cụm (Web Speech) ----
        // Mỗi cụm được NEO vào mốc thời gian của nó trong video: nói xong sớm thì
        // chờ (giữ khoảng ngừng tự nhiên), bị trễ thì tăng tốc nhẹ; trễ quá mức
        // thì bỏ phần còn lại của đoạn cũ -> không bao giờ lệch tích lũy.
        tickLive(t, videoRate) {
            const L = this.live;
            if (L && L.speaking) {
                // không cắt ngang một cụm đang nói, unless its end is overdue (liveStallFactor)
                if (!this.liveStalled(L, videoRate)) return;
                this.countError("speech_stalled");
                L.cancelled = true;
                L.speaking = false;
                try { L.handle && L.handle.cancel(); } catch (e) { /* bỏ qua */ }
                const stuck = this.planById.get(L.planId);
                if (!stuck || L.k >= stuck.phrases.length - 1) L.finished = true;
            }
            let idx = this.planAt(t);
            if (idx < 0) return;
            let plan = this.plans[idx];
            let k = 0;
            if (L && L.planId === plan.id) {
                k = L.k + 1;
            } else if (L && L.planId && this.planById.has(L.planId) && !L.finished) {
                // Còn cụm của đoạn trước chưa nói xong (do trễ): nói nốt nếu chưa trễ quá
                const prev = this.planById.get(L.planId);
                if (L.k + 1 < prev.phrases.length) {
                    const due = prev.start + prev.phrases[L.k + 1].offset;
                    if (t - due < SYNC.dropLag) { plan = prev; k = L.k + 1; }
                    else this.stats.dropped++;
                }
            } else if (!L || t - plan.start > SYNC.dropLag) {
                // Vào giữa đoạn (sau khi tua, hoặc trễ quá nhiều): bắt đầu ở cụm chưa trôi qua
                while (k < plan.phrases.length && t - plan.start > plan.phrases[k].offset + plan.phrases[k].dur * 0.4) k++;
            }
            if (k >= plan.phrases.length) {
                if (L && L.planId === plan.id) L.finished = true;
                return;
            }
            const ph = plan.phrases[k];
            const due = plan.start + ph.offset;
            if (t < due - SYNC.startTolerance) return;   // chưa tới lúc: giữ khoảng ngừng
            const lag = Math.max(0, t - due);
            this.stats.lagMax = Math.max(this.stats.lagMax, lag);
            const boost = lag > 0.2 ? 1 + Math.min(SYNC.maxLagBoost, lag * 0.3) : 1;
            // Tốc độ giọng phải nhanh THỰC SỰ theo tốc độ phát video và mức đuổi kịp:
            // giải ngược qua mô hình giọng (tăng hệ số 1,5 không làm giọng nhanh 1,5 lần)
            const m = this.provider.voiceModel;
            const baseSpeed = PLAN.speedMultiplier(plan.rate * ph.rateMul, m);
            const rate = PLAN.rateForSpeedup(baseSpeed * boost * videoRate, m);
            const state = { planId: plan.id, k, speaking: true, finished: false, rate, wallStart: null, sentAt: this.d.now(), predicted: ph.dur / boost, planCal: plan.calibration || 1 };
            this.live = state;
            this.speakingUntilMedia = due + ph.dur + SYNC.duckHold;
            if (k === 0) this.stats.started.push({ id: plan.id, t, due: plan.start, lag });
            try {
                state.handle = this.provider.speak(ph.text, { rate, pitch: plan.pitch * ph.pitchMul, volume: this.settings.volume, speaker: plan.speaker }, {
                    onstart: () => { state.wallStart = this.d.now(); },
                    onend: () => {
                        state.speaking = false;
                        state.endMedia = this.d.video.currentTime;
                        if (state.wallStart !== null && !state.cancelled) this.calibrate(state, videoRate);
                        if (k === plan.phrases.length - 1) state.finished = true;
                    },
                    onerror: (e) => {
                        state.speaking = false;
                        // Bị hủy chủ động (tạm dừng, tua) không phải lỗi giọng
                        if (state.cancelled || (e && /interrupted|canceled|cancelled/i.test(e.error || ""))) return;
                        state.finished = true;
                        this.onProviderError(new Error("Lỗi phát giọng: " + (e && e.error)));
                    }
                });
            } catch (e) {
                state.speaking = false;
                this.onProviderError(e);
            }
        }

        // A phrase still "speaking" long past its predicted length (media seconds at videoRate), counted
        // from its start, or from when it was sent if Chrome never reported a start either
        liveStalled(L, videoRate) {
            const from = L.wallStart != null ? L.wallStart : L.sentAt;
            if (from == null) return false;
            const limit = (L.predicted || 0) / Math.max(0.25, videoRate) * 1000 * SYNC.liveStallFactor + SYNC.liveStallPadMs;
            return this.d.now() - from > limit;
        }

        // Tự hiệu chỉnh mô hình thời lượng theo thời gian nói thật đo được
        calibrate(state, videoRate) {
            const wall = (this.d.now() - state.wallStart) / 1000;
            if (wall < 0.25) return;
            const actualMedia = wall * videoRate;
            const ratio = actualMedia / Math.max(0.1, state.predicted);
            if (ratio < 0.4 || ratio > 2.5) return;
            const m = this.provider.voiceModel;
            // Dự đoán của cụm được tính với hệ số hiệu chỉnh LÚC LẬP KẾ HOẠCH:
            // giá trị đúng = hệ số đó x tỷ lệ đo được; tiến dần tới (EMA) để không dao động
            const cur = m.calibration || 1;
            const measured = state.planCal * ratio;
            const next = Math.min(1.6, Math.max(0.6, cur + (measured - cur) * 0.3));
            if (Math.abs(next - (m.calibration || 1)) / (m.calibration || 1) > 0.01) {
                m.calibration = next;
                this.calibrationDirty = (this.calibrationDirty || 0) + 1;
                if (this.calibrationDirty >= 4) { this.calibrationDirty = 0; this.replanFuture(); }
            }
        }

        replanFuture() {
            const t = this.d.video.currentTime;
            this.sourceSig = "";
            const activeId = this.live && this.live.planId;
            const keep = this.plans.filter(p => p.start <= t + 1 || p.id === activeId);
            this.refresh(true);
            const map = new Map(keep.map(p => [p.id, p]));
            this.plans = this.plans.map(p => map.get(p.id) || p);
            this.planById = new Map(this.plans.map(p => [p.id, p]));
        }

        // ---- Phát audio có sẵn (Gemini TTS): DÒNG THỜI GIAN LỜI NÓI tách khỏi phụ đề ----
        // Mốc phụ đề (cue.start / cue.end) chỉ là THAM CHIẾU để bắt đầu. Lời nói có
        // speech.start / speech.duration / speech.end riêng, lấy theo THỜI LƯỢNG AUDIO THẬT:
        //   - một câu đang nói KHÔNG BAO GIỜ bị cắt vì phụ đề kết thúc hay câu sau tới giờ
        //   - câu sau xếp hàng chờ câu trước nói xong (không chồng tiếng), rồi nói hơi nhanh
        //     hơn một chút để bắt kịp; trễ quá nhiều thì bỏ NGUYÊN câu (không cắt giữa chừng)
        //   - tạm dừng / tải chậm: giữ nguyên trạng thái, chạy tiếp đúng chỗ
        //   - tua: bỏ lời đang nói, bắt đầu lại ở vị trí mới
        tickBuffer(t, videoRate) {
            let S = this.speech;
            if (S) {
                const r = this.rendered.get(S.id);
                // Audio tự phát tới HẾT (sự kiện ended); chỉ ép dừng khi đã quá mốc dự kiến rõ rệt
                // (audio lỗi / bị treo), để không bao giờ mất âm cuối vì lệch vài chục mili giây
                // (2.4.6) An element Chrome is still starting has not said a word yet: it is not over
                // at its planned end, only once it has waited SYNC.startWaitMax for nothing
                const starting = !S.moving && S.cueWall != null && this.d.now() - S.cueWall < SYNC.startWaitMax * 1000;
                const finished = !r || !r.el || r.el.ended || (t >= S.end + SYNC.endGrace && !starting);
                if (!finished) {
                    this.driveSpeech(S, r, t, videoRate);
                    this.speakingUntilMedia = S.end + SYNC.duckHold;
                    this.prepareNext(S.id);
                    return;
                }
                // The line is over: its element (and Chrome's media player and decoded audio behind it)
                // is let go; the blob URL stays, so a rewind builds a new element in a few ms
                if (r && r.el) this.releaseAudio(r);
                const done = this.planById.get(S.id);
                this.lastSpeechEnd = t;
                this.lastSpeechJoined = !!(done && done.continuesNext);
                this.lastSpeechGap = gapAfter(done, done ? this.plans[this.plans.indexOf(done) + 1] : null);
                this.speech = S = null;
            }
            const next = (this.adResume && this.takeAdResume(t)) || this.nextSpeech(t);
            if (!next) return;
            const { p, r, offset, lag } = next;
            this.meterStart(p, t, lag);
            const rate = this.chooseRate(p, r, t, offset, lag);
            // prev*: what was spoken before, given back if this take turns out unplayable (onPlayFailed)
            this.speech = S = { id: p.id, mediaStart: t, offset, rate, end: t + (r.duration - offset) / rate, prevSpokenStart: this.lastSpokenStart, prevSpokenId: this.lastSpokenId };
            this.lastSpokenStart = p.start;
            this.lastSpokenId = p.id;
            this.stats.started.push({ id: p.id, t, due: p.start, lag, rate, speechEnd: S.end, cueEnd: p.end });
            if (lag > SYNC.lateStart) this.note("late", { id: p.id, lag: Math.round(lag * 100) / 100, rate: Math.round(rate * 100) / 100 });
            for (const [id, x] of this.rendered) if (x.el && id !== p.id && !x.el.paused) this.quietPause(x.el);
            if (!r.el) r.el = this.makeAudio(r.url);
            this.driveSpeech(S, r, t, videoRate, true);
            this.speakingUntilMedia = S.end + SYNC.duckHold;
        }

        // A play() that started: a block reported earlier (playBlocked) is over
        onPlayStarted() {
            if (!this.playBlocked) return;
            this.playBlocked = false;
            this.status();
        }

        // A play() the element refused, by the browser's error name (1.9.0). Every refusal used to be
        // a provider error and the paused element was asked again on every tick:
        //   AbortError: a pause or seek cut the start short. Normal, asked again when due, and never
        //     counted toward switching to the system voice (three during fast seeks did that).
        //   NotAllowedError: the autoplay policy. Asked again after SYNC.playRetryMs; the badge says
        //     so (status playBlocked) until a play starts.
        //   anything else (NotSupportedError: a take the browser cannot decode): the take is dropped
        //     and made again like a failed render, instead of being fed to the element 20 times a second.
        onPlayFailed(S, el, e) {
            const name = (e && e.name) || "";
            if (name === "AbortError") { this.countError("play_interrupted"); return; }
            this.onProviderError(e);
            if (name === "NotAllowedError") {
                this.countError("play_blocked");
                S.retryAt = this.d.now() + SYNC.playRetryMs;
                if (!this.playBlocked) { this.playBlocked = true; this.status(); }
                return;
            }
            this.countError("play_failed");
            const r = this.rendered.get(S.id);
            if (!this.running || !r || r.el !== el) return;
            this.releaseAudio(r);
            if (r.url && this.d.revokeObjectURL) this.d.revokeObjectURL(r.url);
            this.rendered.delete(S.id);
            this.failed.set(S.id, (this.failed.get(S.id) || 0) + 1);
            if (this.speech !== S) return;
            // the line was never heard: it goes back to the schedule, which makes it again while it
            // can still be reached (unreachable) and skips it otherwise
            this.speech = null;
            if (this.lastSpokenId === S.id) { this.lastSpokenStart = S.prevSpokenStart; this.lastSpokenId = S.prevSpokenId; }
        }

        // fade: a voice still sounding steps down first (quietPause), then lets go (2.4.7: a seek, an
        // ad, dubbing off). The line is forgotten at once either way: r.el is cleared before the fade
        // begins. after: called once the element is let go (stop() revokes its URL there)
        releaseAudio(r, fade, after) {
            const el = r.el;
            r.el = null;
            const drop = () => {
                try { el.cstFade = null; el.pause(); if (el.removeAttribute) el.removeAttribute("src"); if (el.load) el.load(); } catch (e) { /* bỏ qua */ }
                if (after) after();
            };
            if (fade && !el.paused) this.quietPause(el, drop);
            else drop();
        }

        // Scorecard (debug only): time from start / seek to the first voice, late starts, and silences
        // the pipeline caused, i.e. beyond the rest after the previous line (gapAfter) and before
        // which the line's subtitle had already begun. An intended pause is never counted.
        meterStart(p, t, lag) {
            const st = this.stats;
            if (this.resetWall != null) {
                (st.recoverMs || (st.recoverMs = [])).push(Math.round(this.d.now() - this.resetWall));
                if (st.recoverMs.length > 20) st.recoverMs.shift();
                this.resetWall = null;
            }
            if (lag > SYNC.lateStart) st.late = (st.late || 0) + 1;
            if (this.lastSpeechEnd != null && this.lastSpokenStart != null) {
                const rest = this.lastSpeechGap != null ? this.lastSpeechGap : SYNC.sentenceGap;
                const gap = t - Math.max(this.lastSpeechEnd + rest, p.start - SYNC.startTolerance);
                if (gap > SYNC.gapMin && gap < 60) { st.gaps = (st.gaps || 0) + 1; st.gapSec = (st.gapSec || 0) + gap; }
            }
        }

        // Audio của một đoạn. Khi phát XONG thì chạy vòng xử lý ngay (không chờ nhịp 50 ms): đoạn kế
        // tiếp bắt đầu liền mạch. Khi cửa sổ bị che, Chrome giãn bộ đếm giờ của trang tới ~1 giây
        // (đo thật) -> trước đây giữa hai đoạn có thể hụt tới 1 giây
        makeAudio(url) {
            const el = this.d.createAudio(url);
            try { if (el && el.addEventListener) el.addEventListener("ended", () => { if (this.running) this.tick(); }); } catch (e) { /* bỏ qua */ }
            return el;
        }

        // Nhịp nền của giọng: giọng nói chậm hơn nhịp mục tiêu được tăng tốc ĐỀU cho cả video
        // (giữ cao độ, có trần); tốc độ thật của giọng đo từ audio đã tạo (tự hiệu chỉnh)
        baseTempo(p) {
            const cfg = this.provider.tempo;
            if (!cfg) return 1;
            const sps = this.voiceSps.get(p.speaker) || (this.provider.naturalSps ? this.provider.naturalSps(p.speaker) : cfg.targetSps);
            return Math.max(1, Math.min(cfg.maxTempo, cfg.targetSps / Math.max(1, sps)));
        }

        // Tốc độ phát của MỘT câu = thời lượng audio / khung của câu (từ lúc bắt đầu nói tới
        // mốc cuối phụ đề của câu, không lấn sang câu sau). Nhờ vậy lời không chạy trước phụ
        // đề ở câu thưa, không tụt lại ở câu dày. Giới hạn trong [0,95x ; 1,3x], nhanh thêm
        // chút nếu đang trễ, rồi LÀM MƯỢT so với câu trước (đổi tối đa 0,06 mỗi câu).
        // Tốc độ SÀN theo giọng: giọng chậm (kể chuyện) không bao giờ bị kéo xuống dưới ~4 âm
        // tiết/giây nghe được (đo thật: Mỹ Duyên 3,5 -> sàn ~x1,13); giọng nhanh sàn 0,95x.
        // Video đang phát nhanh (1,25x, 1,5x) thì audio vốn đã nhanh theo video: không nhân thêm.
        floorRate(p) {
            const cfg = this.provider.tempo;
            let f = SYNC.minSpeechRate;
            if (cfg && cfg.minSps) {
                const sps = this.voiceSps.get(p.speaker) || (this.provider.naturalSps ? this.provider.naturalSps(p.speaker) : cfg.minSps);
                f = Math.max(f, Math.min(cfg.maxFloor || 1.15, cfg.minSps / Math.max(1, sps)));
            }
            const vr = Math.max(1, (this.d.video && this.d.video.playbackRate) || 1);
            return Math.max(SYNC.minSpeechRate, f / vr);
        }

        // How fast the coming stretch of the video speaks, as the playback rate each sentence needs to
        // fit its subtitle with this voice: { mid, high } (syllable-weighted median and upper
        // quartile). Rendered audio gives the true length; otherwise the voice's measured pace.
        videoPace(t) {
            const now = this.d.now ? this.d.now() : 0;
            if (this.pace && now - this.pace.at < SYNC.paceEvery) return this.pace;
            const need = [];
            const ps = this.plans;
            for (let i = 0; i < ps.length; i++) {
                const p = ps[i];
                if (p.start < t - 10 || p.start > t + SYNC.paceWindow) continue;
                const syl = p.phrases.reduce((a, ph) => a + ph.syl, 0);
                if (syl < 3) continue;
                const x = this.planNeed(i);
                if (x != null) need.push({ x, w: syl });
            }
            const pick = share => {
                if (!need.length) return 1;
                const a = need.slice().sort((u, v) => u.x - v.x);
                const total = a.reduce((s2, u) => s2 + u.w, 0);
                let acc = 0;
                for (const u of a) { acc += u.w; if (acc >= total * share) return u.x; }
                return a[a.length - 1].x;
            };
            this.pace = { at: now, mid: pick(0.5), high: pick(0.75), n: need.length };
            return this.pace;
        }

        // The playback rate plan i needs to finish inside its subtitle slot, or null if unknown
        planNeed(i) {
            const ps = this.plans;
            const p = ps[i];
            if (!p) return null;
            const syl = p.phrases.reduce((a, ph) => a + ph.syl, 0);
            const r = this.rendered.get(p.id);
            const sps = this.voiceSps.get(p.speaker) || (this.provider.naturalSps ? this.provider.naturalSps(p.speaker) : 4.5);
            const natural = r && r.duration ? r.duration : syl / Math.max(1, sps);
            const next = ps[i + 1];
            let end = p.start + (p.targetDuration || 0) + SYNC.fitSlack;
            if (next) end = Math.min(end, p.continuesNext ? next.start : next.start - 0.12);
            const slot = end - p.start;
            return slot >= 0.5 ? natural / slot : null;
        }

        // Rate limits for this moment: the fixed ones, widened for a fast-speaking stretch
        paceLimits(p, t) {
            const pace = this.videoPace(t);
            const sps = this.voiceSps.get(p.speaker) || (this.provider.naturalSps ? this.provider.naturalSps(p.speaker) : 4.5);
            const spsCap = SYNC.maxSpokenSps / Math.max(1, sps);
            const vr = Math.max(1, (this.d.video && this.d.video.playbackRate) || 1);
            let ceiling = Math.max(SYNC.maxSpeechRate, Math.min(SYNC.paceCeilingMax, pace.high * SYNC.paceCeilingPad, spsCap));
            let lagCeiling = Math.max(SYNC.lagMaxSpeechRate, Math.min(SYNC.paceCeilingMax + 0.1, ceiling + 0.1, spsCap));
            // the video itself already plays faster: its rate multiplies ours, so the room shrinks
            if (vr > 1) { ceiling = Math.max(SYNC.maxSpeechRate, ceiling / vr); lagCeiling = Math.max(SYNC.lagMaxSpeechRate, lagCeiling / vr); }
            const cap = this.userMaxRate();
            if (cap) { ceiling = Math.min(ceiling, cap); lagCeiling = Math.min(lagCeiling, cap); }
            const floor = pace.mid > 1 ? Math.min(ceiling, pace.mid * SYNC.paceFloorShare) / vr : 0;
            return { ceiling, lagCeiling, floor };
        }

        // A line due more than maxQueueLag ago is still read while its audio is ready and it is due
        // no more than maxQueueLagHard ago (SYNC: dropping it bought no sync back).
        readsLate(p, t) {
            if (t - p.start > SYNC.maxQueueLagHard) return false;
            const r = this.rendered.get(p.id);
            return !!(r && r.duration > 0);
        }

        // The viewer's "fastest the voice may read" setting (dubMaxRate), or null for automatic.
        // It wins over every adaptive ceiling: a capped voice falls behind instead of rushing, and
        // no word is ever dropped to make up for it.
        userMaxRate() {
            const m = Number(this.settings.maxRate);
            return m >= 1 && m <= 2 ? m : null;
        }

        chooseRate(p, r, t, offset, lag) {
            const lim = this.provider.caps && this.provider.caps.prerender ? this.paceLimits(p, t) : { ceiling: Math.min(SYNC.maxSpeechRate, this.userMaxRate() || 9), lagCeiling: Math.min(SYNC.lagMaxSpeechRate, this.userMaxRate() || 9), floor: 0 };
            const i = this.plans.indexOf(p);
            const next = i >= 0 ? this.plans[i + 1] : null;
            // Câu CHƯA HẾT (đoạn nối tiếp sang đoạn sau): đọc lấp tới đoạn sau, được chậm xuống
            // 0,95x như người nói gốc đang nói thưa, thay vì nói nhanh rồi im giữa câu chờ phụ đề
            const joined = !!(p.continuesNext && next);
            // ... nhưng chỉ chậm hơn tốc độ sàn của giọng tối đa 0,08 (giọng chậm như Mỹ Duyên: sàn
            // 1,11 -> đoạn nối tiếp >= 1,03) để đoạn sau không phải nhảy tốc độ đột ngột
            // Đang nói SỚM hơn phụ đề (nối liền đoạn trước) mà câu vẫn chưa hết: được chậm tới 0,95x
            // để lấp khung, thay vì nói nhanh rồi phải nghỉ giữa câu hay chạy trước phụ đề
            const early = p.start - t;
            let floor = joined ? (early > 0.3 ? SYNC.minSpeechRate : Math.max(SYNC.minSpeechRate, this.floorRate(p) - 0.08)) : this.floorRate(p);
            // a fast-speaking stretch: keep the pace up evenly, unless we are ahead of the subtitle
            if (early <= 0.3) floor = Math.max(floor, lim.floor);
            let endAt = joined ? next.start - gapAfter(p, next) : p.start + (p.targetDuration || 0) + SYNC.fitSlack;
            if (next && !joined) endAt = Math.min(endAt, next.start - 0.12);
            const win = Math.max(0.5, endAt - t);
            let want = (r.duration - offset) / win;
            if (lag > 0.25) want *= 1 + Math.min(SYNC.catchUpMax, lag * 0.05);
            want = Math.max(floor, want);
            // Đang sớm giữa câu: được chậm lại nhanh hơn (0,1 mỗi đoạn, như lúc tăng tốc) để kịp lấp khung
            const stepDown = joined && early > 0.3 ? SYNC.rateStepUp : SYNC.rateStepDown;
            // Look ahead: a dense sentence coming up (in the same stretch of speech) is reached by
            // speeding up gradually from here, since the rate may only climb rateStepUp per sentence.
            // Measured on a real timeline: without it a 35-syllable sentence in a 6.5 s slot (needs
            // 1.5x) got 1.3x and pushed 1.4 s of lag onto the next one.
            if (this.provider.caps && this.provider.caps.prerender && i >= 0) {
                let ahead = want;
                let gapEnd = p.start + (r.duration - offset) / Math.max(1, want);
                for (let k = 1; k <= SYNC.lookAhead; k++) {
                    const q = this.plans[i + k];
                    if (!q || q.start - gapEnd > SYNC.rateMemory) break;
                    const need = this.planNeed(i + k);
                    if (need != null) ahead = Math.max(ahead, Math.min(lim.ceiling, need) - SYNC.rateStepUp * k);
                    gapEnd = q.start + (q.targetDuration || 0);
                }
                // ... but never so fast that this sentence ends well before its own subtitle does:
                // the voice running ahead of the text was a complaint of its own (1.3.2)
                const earliest = (r.duration - offset) / Math.max(0.5, win - SYNC.lookAheadEarly);
                want = Math.max(want, Math.min(ahead, earliest));
            }
            if (this.lastRate && t - this.lastRateEnd < SYNC.rateMemory) {
                want = Math.max(this.lastRate - stepDown, Math.min(this.lastRate + SYNC.rateStepUp, want));
            }
            let ceiling = lag > SYNC.lagBoostAt ? lim.lagCeiling : lim.ceiling;
            // Vừa bắt kịp (trần trở về 1,3x): hạ tốc độ từ từ, không tụt 0,1 trong một câu
            if (this.lastRate && t - this.lastRateEnd < SYNC.rateMemory) ceiling = Math.max(ceiling, Math.min(lim.lagCeiling, this.lastRate - SYNC.rateStepDown));
            if (lag > SYNC.lagBoostAt) want = Math.max(want, (r.duration - offset) / win * (1 + Math.min(0.12, lag * 0.06)));
            let rate = Math.max(floor, Math.min(ceiling, want));
            // Tốc độ sàn vừa được hiệu chỉnh lại (đo giọng thật) không được làm nhịp nhảy quá bước cho phép
            if (this.lastRate && t - this.lastRateEnd < SYNC.rateMemory) rate = Math.min(rate, this.lastRate + SYNC.rateStepUp);
            // Close to natural speed and not behind: play at exactly 1.0. Any other rate goes through
            // Chrome's time-stretch, which roughens the voice (1.6.7 measurements); finishing up to 5%
            // early leaves a natural gap, and 5% late stays inside fitSlack.
            // (not for a slow voice whose floor rate is above 1: it is sped up on purpose)
            const natural = this.floorRate(p) <= 1 ? 1 : 0;
            const recent = this.lastRate && t - this.lastRateEnd < SYNC.rateMemory;
            // The rest of a sentence the voice is still reading keeps its pace (a tempo change inside a
            // sentence is heard), unless the voice has fallen behind. Slowing down stays free while the
            // sentence goes on after this part: finishing early there means a silence mid-sentence
            // while the next subtitle is waited for, which is worse than a change of pace
            const prevPlan = i > 0 ? this.plans[i - 1] : null;
            const inSentence = !!(recent && prevPlan && prevPlan.continuesNext && this.lastSpokenId === prevPlan.id && lag <= SYNC.lagBoostAt);
            const up = inSentence ? SYNC.rateStepInSentence : null;
            const down = inSentence && !joined ? SYNC.rateStepInSentence : null;
            if (up != null) rate = Math.min(this.lastRate + up, rate);
            if (down != null) rate = Math.max(this.lastRate - down, rate);
            const smoothOk = !recent || ((1 >= this.lastRate - (down != null ? down : SYNC.rateStepDown) - 1e-9) &&
                (1 <= this.lastRate + (up != null ? up : SYNC.rateStepUp) + 1e-9));
            if (natural === 1 && lag < 0.3 && smoothOk && Math.abs(rate - 1) <= SYNC.snapToNatural + 1e-6) {
                const over = rate > 1 ? (r.duration - offset) * (1 - 1 / rate) : 0;
                if (over <= SYNC.fitSlack) rate = 1;
            }
            const cap = this.userMaxRate();
            if (cap) rate = Math.min(rate, cap);          // above even a slow voice's floor rate
            this.lastRate = rate;
            this.lastRateEnd = t + (r.duration - offset) / rate;
            return rate;
        }

        // Tạo sẵn (và cho trình duyệt giải mã) audio của câu kế tiếp trong lúc câu hiện tại
        // đang nói -> câu sau bắt đầu ngay, không hụt vài chục mili giây giữa hai câu
        prepareNext(currentId) {
            const i = this.plans.findIndex(p => p.id === currentId);
            const next = i >= 0 ? this.plans[i + 1] : null;
            const r = next && this.rendered.get(next.id);
            if (r && !r.el) r.el = this.makeAudio(r.url);
        }

        // Giải phóng audio của các câu đã qua xa (video dài không giữ hàng trăm MB trong trang).
        // Tua lại thì audio được lấy lại từ kho (RAM / IndexedDB), không tạo lại.
        releaseOld(t) {
            // Chỉ giải phóng khi có kho audio để lấy lại (không bao giờ phải tạo lại, tốn tiền)
            if (!this.d.audioCache || !this.provider.audioKey) return;
            for (const [id, r] of this.rendered) {
                const p = this.planById.get(id);
                if (this.speech && this.speech.id === id) continue;
                // no plan any more: outside the planning window (far from playback) or re-cut. Kept
                // forever before, which leaked an object URL and its audio per plan that went away.
                if (!p || p.start + (r.duration / (r.stretch || 1)) < t - SYNC.keepBehind || p.start > t + SYNC.keepAhead) {
                    if (r.el) this.releaseAudio(r);
                    if (r.url && this.d.revokeObjectURL) this.d.revokeObjectURL(r.url);
                    this.rendered.delete(id);
                    this.cacheChecked.delete(id);
                    this.stats.released = (this.stats.released || 0) + 1;
                }
            }
        }

        // Câu tiếp theo trong hàng đợi lời nói
        nextSpeech(t) {
            const tol = SYNC.startTolerance;
            if (this.lastSpokenStart == null) {
                // Vừa bắt đầu / vừa tua: chỉ xét câu tại vị trí hiện tại; đã vào giữa câu thì
                // phát từ đúng đoạn tương ứng, câu đã trôi qua thì chờ câu sau
                const idx = this.planAt(t + tol);
                if (idx < 0) return null;
                const p = this.plans[idx];
                // A line waited on here with time left to say it, then passed without a word, was
                // given up for a slow voice: it counts in stats.dropped ("đã bỏ N câu", BACKLOG 38).
                // A line the viewer seeked into its last second is their skip, not ours.
                const waited = this.entryWait;
                if (waited && waited !== p.id) {
                    this.entryWait = null;
                    const w = this.planById.get(waited);
                    if (w && w.start < p.start) {
                        this.stats.dropped++;
                        this.note("drop", { id: waited, why: "entry-no-audio" });
                    }
                }
                const r = this.rendered.get(p.id);
                if (!r) {
                    const g = this.stats.gate || (this.stats.gate = { waiting: 0, ready: 0, stalled: 0, lastT: null });
                    g.noAudio = (g.noAudio || 0) + 1;
                    g.noAudioT = Math.round(t * 100) / 100;
                    if (this.entryWait !== p.id && p.end - t > SYNC.entryWaitMin) this.entryWait = p.id;
                    return null;
                }
                // Vào giữa đoạn: vị trí trong audio = phần khung đã trôi qua x (độ dài audio / khung).
                // Trước đây nhân với nhịp nền 1,22 -> tưởng đoạn sắp xong, bỏ luôn, im ~6 giây
                const into = Math.max(0, t - p.start);
                const i = this.plans.indexOf(p);
                const next = i >= 0 ? this.plans[i + 1] : null;
                const span = Math.max(0.5, (next ? Math.min(next.start, p.end + 0.5) : p.end) - p.start);
                const scale = Math.max(0.7, Math.min(1.3, r.duration / span));
                const offset = into > 0.3 ? this.entryPoint(r, into * scale) : 0;
                // (chỉ khi đã VÀO GIỮA đoạn: đoạn rất ngắn < 0,8 giây từng luôn bị bỏ vì điều kiện này đúng cả khi offset = 0)
                const lost = this.entryWait === p.id;
                this.entryWait = null;
                if (offset > 0 && offset >= r.duration - Math.min(0.8, r.duration * 0.5)) {
                    this.lastSpokenStart = p.start;
                    if (lost) this.stats.dropped++;
                    this.note("drop", { id: p.id, why: lost ? "entry-no-audio" : "entered-too-late", into: Math.round(into * 100) / 100 });
                    return null;
                }
                return { p, r, offset, lag: 0 };
            }
            // Câu trước vừa nói xong (đang trễ, câu sau đã tới giờ): nghỉ một nhịp như người thật
            const restAfter = this.lastSpeechGap != null ? this.lastSpeechGap : (this.lastSpeechJoined ? SYNC.joinGap : SYNC.sentenceGap);
            if (this.lastSpeechEnd != null && t < this.lastSpeechEnd + restAfter) {
                // Hẹn đúng lúc hết nhịp nghỉ (không chờ vòng đếm giờ kế, có thể tới 1 giây khi cửa sổ bị che)
                const wait = this.lastSpeechEnd + restAfter - t;
                if (this.d.setTimeout && !this.gapTimer) this.gapTimer = this.d.setTimeout(() => { this.gapTimer = null; if (this.running) this.tick(); }, Math.max(10, wait * 1000 / Math.max(0.25, this.d.video.playbackRate || 1)));
                return null;
            }
            const prev = this.lastSpokenId ? this.planById.get(this.lastSpokenId) : null;
            for (const p of this.plans) {
                if (p.start <= this.lastSpokenStart + 1e-6) continue;
                if (t < p.start - tol) {                              // chưa tới giờ
                    // Câu đang dở (đoạn vừa nói còn nối tiếp sang đoạn này) và giọng đã nói xong:
                    // nói tiếp luôn (sớm tối đa chainLead) thay vì im giữa câu chờ phụ đề
                    const chainable = prev && prev.continuesNext && this.plans[this.plans.indexOf(prev) + 1] === p &&
                        this.lastSpeechEnd != null && this.rendered.has(p.id);
                    if (!chainable) return null;
                    if (p.start - t > SYNC.chainLead) {
                        // Giọng đã đi trước phụ đề nhiều: nghỉ lấy hơi ngắn, nói tiếp khi còn sớm đúng chainLead
                        // (không để độ sớm cộng dồn qua cả chuỗi đoạn)
                        const wait = p.start - SYNC.chainLead - t;
                        if (this.d.setTimeout && !this.gapTimer) this.gapTimer = this.d.setTimeout(() => { this.gapTimer = null; if (this.running) this.tick(); }, Math.max(10, wait * 1000 / Math.max(0.25, this.d.video.playbackRate || 1)));
                        return null;
                    }
                    this.stats.chained = (this.stats.chained || 0) + 1;
                    return { p, r: this.rendered.get(p.id), offset: 0, lag: t - p.start };
                }
                const lag = t - p.start;
                if (lag > SYNC.maxQueueLag && !this.readsLate(p, t)) {   // trễ quá xa: bỏ NGUYÊN câu
                    this.lastSpokenStart = p.start;
                    this.stats.dropped++;
                    this.note("drop", { id: p.id, why: this.rendered.has(p.id) ? "lag" : "lag-no-audio", lag: Math.round(lag * 100) / 100 });
                    continue;
                }
                const r = this.rendered.get(p.id);
                // Câu đã tạo lỗi hết lượt thử (không còn đang tạo): bỏ qua NGAY, đọc câu sau
                // đúng giờ, không im chờ tới ngưỡng trễ
                if (!r && (this.failed.get(p.id) || 0) >= 2 && !this.pending.has(p.id)) {
                    this.lastSpokenStart = p.start;
                    this.stats.dropped++;
                    this.note("drop", { id: p.id, why: "failed" });
                    continue;
                }
                if (r) return { p, r, offset: 0, lag };
                // No audio yet: wait only while waiting can still pay off. With a server slower than
                // real time the audio lands long after the subtitle is gone; waiting 4.5s per
                // sentence and dropping them one by one measured 12/61 sentences spoken and a
                // 63s silence. Skipping to the first reachable sentence measured 30/61.
                const wait = this.waitAudio(p);
                if (lag + wait <= SYNC.skipAfter) return null;        // still reachable: wait
                this.skipAhead(t, wait);
            }
            return null;
        }

        // Media seconds until this segment's audio can exist, from the measured generation speed.
        // A segment not sent yet also waits for the job in flight to finish.
        waitAudio(p) {
            const vr = Math.max(0.25, (this.d.video && this.d.video.playbackRate) || 1);
            const rtf = this.dropRtf();
            for (const j of this.jobs.values()) if (!j.orphan && j.planIds.indexOf(p.id) >= 0) return this.jobRemain(j) * vr;
            return (this.serverBusy() + (p.estDuration || 2) * rtf + this.renderOver()) * vr;
        }

        // Wall seconds until a job is done, from the length known when it was sent: after a seek the
        // plans are rebuilt and a job left running for the old place is no longer among them (it read
        // as 0 s, the server as free)
        jobRemain(job) {
            const est = job.est != null ? job.est : job.planIds.reduce((a, id) => a + ((this.planById.get(id) || {}).estDuration || 0), 0);
            return Math.max(0.3, est * this.dropRtf() + this.renderOver() - (this.d.now() - job.t0) / 1000);
        }

        // Wall seconds before the server can start a new request. A serial server (VieNeu) finishes a
        // job left behind by a seek first (background.js keeps a request the server has started)
        serverBusy() {
            let busy = 0;
            const serial = !!(this.provider.caps && this.provider.caps.serial);
            for (const j of this.jobs.values()) if (!j.orphan || serial) busy = Math.max(busy, this.jobRemain(j));
            return busy;
        }

        // Fixed seconds a request costs outside generation. A least-squares line through recent takes
        // (seconds spent against seconds of audio) once they span enough audio; the 0.6 guess before.
        noteTake(audio, secs) {
            const T = this.renderTakes;
            T.push({ audio, secs });
            if (T.length > SYNC.overFitKeep) T.shift();
            this.fittedOver = null;
            if (T.length < SYNC.overFitMin) return;
            const lo = Math.min(...T.map(x => x.audio)), hi = Math.max(...T.map(x => x.audio));
            if (hi - lo < SYNC.overFitSpread) return;
            const n = T.length, mx = T.reduce((a, x) => a + x.audio, 0) / n, my = T.reduce((a, x) => a + x.secs, 0) / n;
            const vxx = T.reduce((a, x) => a + (x.audio - mx) ** 2, 0);
            const slope = T.reduce((a, x) => a + (x.audio - mx) * (x.secs - my), 0) / vxx;
            if (!(slope > 0)) return;
            const [min, max] = SYNC.overFitRange;
            this.fittedOver = Math.max(min, Math.min(max, my - slope * mx));
        }

        renderOver() {
            return this.fittedOver != null ? this.fittedOver + SYNC.overFitPad : SYNC.renderOverhead;
        }

        // Generation speed used to decide whether a sentence is unreachable. The lower of the smoothed
        // value and the latest sample: a server that has just recovered (cold start over) stops
        // costing sentences at once, while a server that stays slow still shows it in both.
        dropRtf() {
            if (this.renderRtf == null) return 0.5;
            return this.lastRtf != null ? Math.min(this.renderRtf, this.lastRtf) : this.renderRtf;
        }

        // Server cannot keep up: drop the segments whose audio is certain to land late and move the
        // queue to the first one that can still make it. Stops before a segment that already has
        // audio, so nothing already generated is wasted.
        skipAhead(t, wait) {
            const target = t + Math.min(wait, SYNC.skipAheadMax) + 0.5;
            const from = this.lastSpokenStart == null ? -Infinity : this.lastSpokenStart;
            let moved = 0, mark = null;
            for (const q of this.plans) {
                if (q.start <= from + 1e-6) continue;
                if (q.start >= target || this.rendered.has(q.id)) break;
                mark = q.start;
                moved++;
            }
            if (!moved) return false;
            this.lastSpokenStart = mark;
            this.stats.dropped += moved;
            this.stats.skipped = (this.stats.skipped || 0) + 1;
            this.note("skip", { lines: moved, to: Math.round(mark * 100) / 100, wait: Math.round(wait * 100) / 100, rtf: Math.round(this.dropRtf() * 100) / 100 });
            return true;
        }

        // Đã sẵn sàng đọc tại vị trí t chưa: phụ đề quanh đó đã dịch và đoạn đọc sắp tới đã có audio.
        // Dùng cho "chờ chuẩn bị" (tạm dừng video tối đa vài giây khi mở video mới / tua tới đoạn mới).
        isReadyAt(t, ahead = 4) {
            const raw = (this.d.getGroups() || []).filter(g => g && g.end > t && g.start < t + ahead);
            if (raw.some(g => !g.viText)) return false;                 // còn nhóm chưa dịch
            this.refresh();
            const p = this.plans.find(x => x.end > t + 0.2 && x.start < t + ahead);
            if (!p) return raw.length === 0 || this.plans.length > 0;   // quãng không có lời: không cần chờ
            if ((this.failed.get(p.id) || 0) >= 2) return true;        // đoạn lỗi: không chờ nữa
            const r = this.rendered.get(p.id);
            if (!r) return false;
            // Cho trình duyệt nạp sẵn audio đoạn đầu ngay khi còn tạm dừng: video chạy là có tiếng liền
            if (!r.el && r.url) r.el = this.makeAudio(r.url);
            return true;
        }

        // Ảnh chụp trạng thái để chẩn đoán (chỉ khi bật cờ gỡ lỗi): đoạn quanh vị trí xem, đoạn đã nói
        debugSnapshot() {
            const t = this.d.video.currentTime;
            const r2 = x => Math.round(x * 100) / 100;
            return {
                t: r2(t), provider: this.provider.id, gate: this.stats.gate || null, waiting: !!this.waiting, rs: this.d.video.readyState,
                lastSpoken: this.lastSpokenStart, headAt: this.headAt, speech: this.speech ? { id: this.speech.id, end: r2(this.speech.end), rate: r2(this.speech.rate) } : null,
                ahead: r2(this.prefetchAhead()), jobs: this.jobs.size, dropped: this.stats.dropped, errors: this.stats.errors, chained: this.stats.chained || 0,
                delivery: { recoverMs: (this.stats.recoverMs || []).slice(-5), late: this.stats.late || 0, gaps: this.stats.gaps || 0, gapSec: r2(this.stats.gapSec || 0), requests: this.stats.requests, cacheHits: this.stats.cacheHits, aborted: this.stats.aborted, detached: this.stats.detached || 0, held: this.rendered.size, elements: [...this.rendered.values()].filter(x => x.el).length,
                    // what a "pop" heard while the voice plays can be (2.4.2): a re-seek of a sounding
                    // voice (each a jump), a rate nudge, the original coming back up between lines
                    reseeks: this.stats.corrections || 0, nudges: this.stats.nudges || 0, duckUps: this.stats.duckUps || 0,
                    // (2.4.6) how long Chrome took to start a voice (play() or a seek until it moved)
                    startUp: this.stats.startUp ? { n: this.stats.startUp.n, slow: this.stats.startUp.slow, maxMs: this.stats.startUp.maxMs, avgMs: Math.round(this.stats.startUp.sumMs / Math.max(1, this.stats.startUp.n)) } : null },
                plans: this.plans.filter(p => p.end > t - 15 && p.start < t + 30).map(p => ({
                    id: p.id, s: r2(p.start), e: r2(p.end), cont: !!p.continuesNext, syl: p.phrases.reduce((a, ph) => a + ph.syl, 0),
                    st: this.rendered.has(p.id) ? "ok" : this.pending.has(p.id) ? "tao" : (this.failed.get(p.id) || 0) >= 2 ? "loi" : "chua",
                    dur: this.rendered.has(p.id) ? r2(this.rendered.get(p.id).duration) : null
                })),
                started: this.stats.started.slice(-25).map(x => ({ id: x.id, t: r2(x.t), due: r2(x.due), rate: r2(x.rate), end: r2(x.speechEnd), cueEnd: r2(x.cueEnd) })),
                rtf: this.renderRtf == null ? null : r2(this.renderRtf), rtfLast: this.lastRtf == null ? null : r2(this.lastRtf),
                over: this.fittedOver == null ? null : r2(this.fittedOver), pace: this.pace ? { mid: r2(this.pace.mid), high: r2(this.pace.high) } : null,
                lateTicks: this.stats.lateTicks || 0, errorTypes: this.stats.errorTypes || null, spoken: this.stats.started.length,
                events: (this.events || []).slice()
            };
        }

        // Giữ audio khớp với dòng thời gian lời nói (không phải mốc phụ đề)
        // (2.4.6) A play() or a seek is complete only once the element is seen moving (settleSpeech):
        // until then its standing still is Chrome starting it, never drift to chase (SYNC startMoved)
        driveSpeech(S, r, t, videoRate, starting) {
            const el = r.el || (r.el = this.makeAudio(r.url));
            const baseRate = S.rate * videoRate;
            try { el.preservesPitch = true; } catch (e) { /* bỏ qua */ }
            el.cstFade = null;                                        // a stop on its way down is called off: the voice goes on
            if (el.paused || starting) {
                if (el.paused && !starting && S.retryAt && this.d.now() < S.retryAt) return;
                if (Math.abs(el.playbackRate - baseRate) > 0.001) el.playbackRate = baseRate;
                el.currentTime = Math.max(0, S.offset + (t - S.mediaStart) * S.rate);
                this.cueSpeech(S, el);
                if (el.paused) {
                    const pr = el.play();
                    if (pr && pr.then) pr.then(() => this.onPlayStarted(), e => this.onPlayFailed(S, el, e));
                }
                return;
            }
            if (!this.settleSpeech(S, el, t)) return;                // still starting: nothing to chase yet
            const expected = S.offset + (t - S.mediaStart) * S.rate;
            let drift = el.currentTime - expected;                    // dương: audio đi trước
            // A seek restarts Chrome's start-up wait, so a playing voice is moved at most once per
            // SYNC.reseekSpacing; a drift in between is left to the rate nudge below
            const spaced = S.reseekWall == null || this.d.now() - S.reseekWall >= SYNC.reseekSpacing * 1000;
            if (Math.abs(drift) > SYNC.driftCorrect && spaced) {
                el.currentTime = expected;                            // lệch lớn: đặt lại đúng chỗ
                if (Math.abs(el.playbackRate - baseRate) > 0.001) el.playbackRate = baseRate;
                S.nudge = 0; S.driftEma = 0;
                S.reseekWall = this.d.now();
                this.stats.corrections++;
                this.cueSpeech(S, el);
                return;
            }
            // currentTime of a media element moves in steps: smooth before deciding anything
            S.driftEma = S.driftEma == null ? drift : S.driftEma * 0.8 + drift * 0.2;
            const ema = S.driftEma;
            let nudge = S.nudge || 0;                                 // -1 slow down, 0 none, +1 speed up
            if (!nudge && Math.abs(ema) > SYNC.driftNudge) nudge = ema > 0 ? -1 : 1;
            else if (nudge && Math.abs(ema) < SYNC.driftNudgeOff) nudge = 0;
            const want = baseRate * (1 + nudge * SYNC.nudgeMax);
            const since = t - (S.lastRateAt != null ? S.lastRateAt : -Infinity);
            const baseChanged = Math.abs(el.playbackRate - baseRate * (1 + (S.nudge || 0) * SYNC.nudgeMax)) > 0.002;
            if (Math.abs(el.playbackRate - want) > 0.002 && (since >= SYNC.nudgeSpacing || baseChanged)) {
                el.playbackRate = want;
                S.lastRateAt = t;
                S.nudge = nudge;
                if (nudge) this.stats.nudges = (this.stats.nudges || 0) + 1;
            }
        }

        // (2.4.6) The element was just set to a place and asked to play (a line's start, a resume
        // after a pause or a stall, a drift seek). A place inside the take would start on a sounding
        // sample, a click: the voice stays silent until it moves, then fades in
        cueSpeech(S, el) {
            S.moving = false;
            S.cuePos = el.currentTime || 0;
            S.cueWall = this.d.now();
            S.fadeHeld = S.cuePos > SYNC.fadeFrom;
            S.fadeAt = null;
            this.speechVolume(S, el);
            this.watchSpeech(S, el);
        }

        // The start is complete once the element has moved past where it was set. The time that took
        // is absorbed into the line's timeline (the old once-per-line anchor, now after every start and
        // every seek, and without its 0.12 s cap: a seek there skipped words and restarted the wait).
        // An element that came up ahead is absorbed only within driftAnchor. False while it starts.
        settleSpeech(S, el, t) {
            if (!S.moving) {
                const from = S.cuePos != null ? S.cuePos : S.offset || 0;
                if (!(el.currentTime > from + SYNC.startMoved)) { this.speechVolume(S, el); return false; }
                S.moving = true;
                const late = S.offset + (t - S.mediaStart) * S.rate - el.currentTime;
                if (late > 0 || -late <= SYNC.driftAnchor) {
                    S.mediaStart += late / S.rate;
                    S.end += late / S.rate;
                }
                if (S.cueWall != null) this.noteStartUp(this.d.now() - S.cueWall);
                if (S.fadeHeld) { S.fadeHeld = false; S.fadeAt = this.d.now(); }
            }
            this.speechVolume(S, el);
            return true;
        }

        // The voice's volume: the user's level, 0 while a start inside the take waits to move, a ramp
        // over SYNC.restartFade once it does. The ramp is squared: its first step is 6% of the level,
        // not 25% (measured in Chrome on the first samples after a resume: a straight ramp left the
        // voice coming up at 0.4x its level in its first 5 ms)
        speechVolume(S, el) {
            const level = this.settings.volume;
            let v = level;
            if (S.fadeHeld) v = 0;
            else if (S.fadeAt != null) {
                const k = (this.d.now() - S.fadeAt) / (SYNC.restartFade * 1000);
                if (k >= 1) S.fadeAt = null;
                else v = level * Math.max(0, k) * Math.max(0, k);
            }
            el.volume = v;
        }

        // While the element starts and while it fades in, look every SYNC.fadeStepMs rather than every
        // tick (50 ms): the fade begins within ~10 ms of the first sound and moves in small steps
        watchSpeech(S, el) {
            if (!this.d.setTimeout || S.watching) return;
            S.watching = true;
            const step = () => {
                S.watching = false;
                const r = this.rendered.get(S.id);
                if (!this.running || this.speech !== S || !r || r.el !== el || el.paused) return;
                this.settleSpeech(S, el, this.d.video.currentTime);
                if (!S.moving || S.fadeAt != null) { S.watching = true; this.d.setTimeout(step, SYNC.fadeStepMs); }
            };
            this.d.setTimeout(step, SYNC.fadeStepMs);
        }

        // (2.4.6) Stop a voice that may be sounding without a click: its volume steps down over
        // SYNC.pauseFade, then it pauses. For the video pausing or stalling and a line giving way to
        // the next; a seek or a stop lets the element go at once (the video's own sound jumps too).
        // tick() calls silence() every 50 ms while the video is stopped: a stop already on its way
        // down is left to finish, and driveSpeech calls it off when the voice goes on (el.cstFade).
        // The steps are squared, (1 - k/n)^2: 64%, 36%, 16%, 4%, then the pause. Straight steps (75,
        // 50, 25%) still cut the wave at a third of the voice's level (measured in Chrome).
        // then: called once the voice is paused (releaseAudio lets the element go after its fade). A
        // fade already on its way down takes it too; a fade called off by driveSpeech never calls it,
        // but driveSpeech only drives an element still held by its line, and a released one is not.
        quietPause(el, then) {
            const done = () => { if (then) then(); };
            if (el.paused) return done();
            const n = Math.round(SYNC.pauseFade * 1000 / SYNC.fadeStepMs) + 1;
            if (!this.d.setTimeout || n < 3 || !(el.volume > 0)) { el.cstFade = null; el.pause(); return done(); }
            if (el.cstFade) { if (then) (el.cstFade.then || (el.cstFade.then = [])).push(then); return; }
            const v0 = el.volume, token = { then: then ? [then] : [] };
            el.cstFade = token;
            let k = 0;
            const finish = () => { el.cstFade = null; for (const f of token.then) f(); };
            const step = () => {
                if (el.cstFade !== token) return;
                if (el.paused) return finish();
                if (++k >= n) { el.pause(); return finish(); }
                el.volume = v0 * (1 - k / n) * (1 - k / n);
                this.d.setTimeout(step, SYNC.fadeStepMs);
            };
            step();
        }

        // How long Chrome took to start a voice element (play() or a seek until it moved), for
        // "Chép chẩn đoán": a slow machine shows here, not as pops any more
        noteStartUp(ms) {
            const s = this.stats.startUp || (this.stats.startUp = { n: 0, slow: 0, maxMs: 0, sumMs: 0 });
            s.n++;
            s.sumMs += ms;
            if (ms > s.maxMs) s.maxMs = Math.round(ms);
            if (ms > 150) s.slow++;
        }

        // ---------------- Lập lịch tạo audio quanh vị trí đang phát ----------------
        // Tầm nhìn tạo trước THÍCH ỨNG: đủ để kịp phát (theo độ trễ TTS đo được và
        // tốc độ phát), nhưng không xa hơn trần của chế độ; người dùng hay tua thì thu hẹp.
        // ignorePause: the horizon while playing, for deciding what is obsolete. Pausing lowers how far
        // ahead new work goes, but it must not cancel the next lines already being made (1.8.6)
        prefetchAhead(ignorePause) {
            const v = this.d.video;
            const paused = v.paused && !ignorePause;
            const max = Math.min(SYNC.prefetchMax, this.settings.prefetchMax != null ? this.settings.prefetchMax : SYNC.prefetchMax);
            const lat = this.renderLatency != null ? this.renderLatency : 4;
            let ahead = (lat * 2.5 + 4) * Math.max(1, v.playbackRate || 1);
            const now = this.d.now();
            this.seekTimes = this.seekTimes.filter(x => now - x < 60000);
            if (this.seekTimes.length >= 2) ahead *= 0.6;           // hay tua: audio xa dễ bị bỏ phí
            if (paused) ahead = Math.min(ahead, SYNC.prefetchPaused);
            // Free local voice: far ahead (SYNC.freeAheadMin), so a slow stretch of the server or one
            // stuck take does not silence the voice. In media seconds, so scaled by the video rate: at
            // 2x, 60 media seconds were only 30 s of real time to absorb anything
            if (this.provider.caps && this.provider.caps.free && !paused) {
                const vr = Math.max(1, v.playbackRate || 1);
                return Math.max(SYNC.freeAheadMin * vr, Math.min(SYNC.freeAheadMax * vr, ahead));
            }
            return Math.max(Math.min(SYNC.prefetchMin, max), Math.min(max, ahead));
        }

        schedule(t) {
            if (!this.provider.caps.prerender) return;
            if (this.busyLookup || this.budgetBlocked) return;
            if (this.headProbe != null && this.resolveHeadProbe(t)) return;
            // Bình thường chỉ MỘT lượt TTS cho vị trí đang xem. Khi audio sẵn phía trước sắp
            // cạn (mạng chậm, vừa tua) cho chạy thêm lượt thứ hai để bắt kịp: KHÔNG tốn thêm
            // (tiền tính theo độ dài audio, không theo số lượt). Lượt cũ chạy nốt không chặn
            // vị trí mới; tổng số lượt cùng lúc có trần.
            let active = 0;
            for (const j of this.jobs.values()) if (!j.orphan) active++;
            // API từng báo vượt giới hạn tốc độ (hay gặp với key miễn phí): chỉ 1 lượt mỗi lúc
            const maxActive = !this.conservative && !this.provider.caps.serial && active && this.bufferedAhead(t) < (this.renderLatency != null ? this.renderLatency : 4) * SYNC.thinBuffer ? 2 : 1;
            if (active >= maxActive || this.jobs.size >= SYNC.maxJobs) return;
            const to = t + this.prefetchAhead();
            // Vừa bật / vừa tua (chưa nói câu nào): đoạn đã hết phụ đề sẽ không bao giờ được đọc
            // -> không tạo audio cho nó (từng làm tiếng đầu tiên chậm thêm một lượt tạo giọng)
            const fresh = this.lastSpokenStart == null;
            // A segment at or behind the speech queue mark (spoken, or dropped for lag) will never
            // be spoken: rendering it steals a server slot from the segment that is about to play
            const spoken = this.lastSpokenStart;
            const inWindow = p => p.start + p.estDuration >= t - 1 && (spoken == null || p.start > spoken) && !(fresh && p.end < t + 0.3) && p.start <= to && !this.rendered.has(p.id) && !this.pending.has(p.id) && (this.failed.get(p.id) || 0) < 2 && !(fresh && this.unreachable(p, t));
            let todo = this.plans.filter(inWindow).sort((a, b) => a.start - b.start);
            if (!todo.length) return;

            // Giọng MIỄN PHÍ (VieNeu) + người nói nhanh: câu (theo tốc độ ĐO THẬT của giọng) phải đọc
            // nhanh hơn 1,15x mới vừa khung -> tạo giọng với khoảng nghỉ trong câu ngắn hơn (0,15 giây).
            // KHÔNG rút gọn lời thoại (giữ đủ nội dung người nói truyền đạt).
            if (this.provider.caps && this.provider.caps.free) {
                for (const p of todo) if (p.tightPauses == null) p.tightPauses = this.denseRatio(p) > SYNC.denseRatio;
            }

            // 1. KHO AUDIO (RAM -> IndexedDB): đoạn đã từng tạo thì không gọi TTS nữa.
            // A batch may also take segments just past the window (SYNC.batchSpill), so those are
            // looked up too. Before, a revisit re-rendered and paid for a stored segment that sat
            // right after an unheard stretch. Only for a provider that batches: VieNeu renders one
            // segment per call and sets tightPauses, part of its key, when a segment enters the window.
            const maxPlans = this.provider.caps.maxBatch || SYNC.maxBatchPlans;
            const cached = !!(this.d.audioCache && this.provider.audioKey);
            const spill = p => p.start > to && p.start <= to + SYNC.batchSpill && !this.rendered.has(p.id) && !this.pending.has(p.id);
            const unchecked = todo.concat(maxPlans > 1 ? this.plans.filter(spill) : []).filter(p => !this.cacheChecked.has(p.id)).slice(0, 8);
            if (unchecked.length && cached) {
                this.lookupCache(unchecked);
                return;
            }

            const first = todo[0];

            // 2. TTS: gộp các đoạn liền nhau cùng người nói, không vượt tầm nhìn. Lượt đầu
            // sau khi bật / tua chỉ lấy một câu ngắn để có tiếng ngay (audio nhỏ về nhanh hơn).
            const warmup = this.warmup && !this.conservative;
            // Starving (nothing buffered ahead): a big batch is self-defeating, since none of it
            // arrives until the last segment is generated. Ask for ONE short segment instead, so
            // there is voice again as soon as possible, and let the next pass continue.
            const starving = this.lastSpokenStart != null && this.bufferedAhead(t) < 0.5;
            const maxSyl = warmup || starving ? SYNC.firstBatchSyl : SYNC.maxBatchSyl;
            const batch = [first];
            if (starving) { this.warmup = false; this.renderBatch(batch); return; }
            let syl = first.phrases.reduce((a, ph) => a + ph.syl, 0);
            for (let i = this.plans.indexOf(first) + 1; i < this.plans.length && batch.length < maxPlans; i++) {
                const p = this.plans[i];
                const s = p.phrases.reduce((a, ph) => a + ph.syl, 0);
                if (!(inWindow(p) || spill(p)) || p.speaker !== first.speaker || syl + s > maxSyl || (this.failed.get(p.id) || 0) > 0) break;
                if (cached && !this.cacheChecked.has(p.id)) break;       // never pay for audio not yet looked up
                if (p.start - batch[batch.length - 1].end > 3) break;
                batch.push(p);
                syl += s;
            }
            this.warmup = false;
            this.renderBatch(batch);
        }

        // Just started or seeked, video running: a line whose audio cannot exist before its subtitle
        // is nearly over (the point where nextSpeech gives up on entering it) would be generated only
        // to be skipped, and on a serial server it pushes back the next line, the one that can still
        // be heard. Simulated with a server at RTF 0.9: voice 13.5 s after a seek. Before the first
        // measurement an optimistic render time is used (SYNC.reachRtfMin), never the 0.5 guess
        // (which would skip the first line on a healthy server): at 2x the first line under the
        // playhead was rendered and then skipped; at 1x it is kept.
        unreachable(p, t) {
            if (this.d.video.paused) return false;
            const vr = Math.max(0.25, this.d.video.playbackRate || 1);
            const wait = this.renderRtf == null ? (SYNC.reachOverheadMin + (p.estDuration || 2) * SYNC.reachRtfMin) * vr : this.waitAudio(p);
            if (t + wait > p.end - Math.min(0.8, (p.end - p.start) * 0.5)) return true;
            return this.crowdsNext(p, t, wait, vr);
        }

        // A serial server near real time (BACKLOG 33): a line whose audio lands late anyway (entered
        // mid-way, its head skipped) still costs its whole render, and the next line queues behind
        // it and starts late too; that late start carries into the lines after it (a chase). Give
        // the late line up when the next one gains more time than the late line had left to be
        // heard. Simulated at RTF 0.9 after a seek: see DUBBING.md "1.9.7".
        crowdsNext(p, t, wait, vr) {
            if (this.renderRtf == null || !(this.provider.caps && this.provider.caps.serial)) return false;
            const lands = t + wait;
            if (lands <= p.start + SYNC.lateStart) return false;       // on time: keep it whole
            const q = this.plans[this.plans.indexOf(p) + 1];
            if (!q || this.rendered.has(q.id) || this.pending.has(q.id)) return false;
            const rtf = this.dropRtf(), over = this.renderOver();
            const own = ((q.estDuration || 2) * rtf + over) * vr;
            const mine = ((p.estDuration || 2) * rtf + over) * vr;
            const lateWith = Math.max(0, lands + own - q.start);
            const lateWithout = Math.max(0, lands - mine + own - q.start);
            const heard = Math.max(0, p.end - lands);
            return lateWith > SYNC.lateStart && lateWith - lateWithout >= Math.max(SYNC.crowdGainMin, heard);
        }

        // What the viewer should know about the voice right now, for the quick menu: how much audio
        // is ready ahead, how fast the server makes it, how many sentences were skipped to catch up.
        health(t) {
            return {
                live: !!this.provider.caps.live,
                ahead: this.provider.caps.live ? 0 : this.bufferedAhead(t),
                rtf: this.renderRtf == null ? null : this.renderRtf,
                dropped: this.stats.dropped || 0,
                errors: (this.stats.errors || 0) + (this.stats.timeouts || 0),
                pace: this.pace && this.pace.n >= 3 ? this.pace.mid : null,    // typical rate the video asks for
                paceHigh: this.pace && this.pace.n >= 3 ? this.pace.high : null // ... and what its busiest quarter asks
            };
        }

        // Số giây audio ĐÃ CÓ liên tục phía trước vị trí đang xem
        bufferedAhead(t) {
            let end = t;
            for (const p of this.plans) {
                if (p.start + p.estDuration < t) continue;
                if (p.start > end + 1.5) break;                       // có khoảng trống lời nói dài: coi như liền
                const r = this.rendered.get(p.id);
                if (!r) break;
                end = Math.max(end, p.start + r.duration / r.stretch);
            }
            return end - t;
        }

        // Tỉ lệ (audio ước theo tốc độ ĐO THẬT của giọng) / khung của câu: > 1 là phải đọc nhanh hơn 1x.
        // Đo thật (1.2.9): ước theo tốc độ mục tiêu thấy "vừa khung" trong khi audio thật dài gấp 1,3.
        denseRatio(p) {
            const syl = p.phrases.reduce((a, ph) => a + ph.syl, 0);
            const sps = this.voiceSps.get(p.speaker) || (this.provider.naturalSps ? this.provider.naturalSps(p.speaker) : 4);
            const i = this.plans.indexOf(p);
            const next = i >= 0 ? this.plans[i + 1] : null;
            const win = Math.max(0.8, next ? Math.min(next.start - p.start, (p.targetDuration || 0) + 1.5) : (p.targetDuration || 0) + 0.25);
            return (syl / Math.max(1, sps)) / win;
        }

        // Store lookup. Never holds the scheduler longer than SYNC.lookupTimeout: past it the plans
        // count as misses and scheduling goes on; hits that still arrive later are used if they fit.
        // A hit is kept only while the engine runs and only for the plan now holding that id with the
        // same text (the line may have been re-cut or re-translated while the lookup was out).
        async lookupCache(plans) {
            const seq = this.lookupSeq = (this.lookupSeq || 0) + 1;
            this.busyLookup = true;
            let timer = null;
            const giveUp = () => {
                if (this.lookupSeq !== seq || !this.busyLookup) return;
                this.countError("lookup_timeout");
                plans.forEach(p => this.cacheChecked.add(p.id));
                this.busyLookup = false;
            };
            if (this.d.setTimeout) timer = this.d.setTimeout(giveUp, SYNC.lookupTimeout);
            try {
                const keys = await Promise.all(plans.map(p => this.provider.audioKey(p)));
                const hits = await this.d.audioCache.get(keys);
                if (!this.running) return;
                plans.forEach((p, i) => {
                    this.cacheChecked.add(p.id);
                    p.audioKey = keys[i];
                    const h = hits && hits[keys[i]];
                    if (!h) return;
                    const cur = this.planById.get(p.id);
                    if (!cur || cur.text !== p.text || this.rendered.has(p.id)) return;
                    const duration = this.audioLength(h.wav, h.duration);
                    if (duration == null) { this.countError("bad_audio"); return; }
                    cur.audioKey = keys[i];
                    this.stats.cacheHits++;
                    this.addRendered(cur, h.wav, duration);
                });
            } catch (e) {
                this.countError("lookup_failed");
                plans.forEach(p => this.cacheChecked.add(p.id));
            } finally {
                if (timer != null && this.d.clearTimeout) this.d.clearTimeout(timer);
                if (this.lookupSeq === seq) this.busyLookup = false;
                if (this.running) this.status();
            }
        }

        // The length of a take in seconds, or null when it is not usable: bytes must be there, and
        // the reported duration finite and plausible; a missing one is read from the WAV header.
        audioLength(wav, duration) {
            if (!wav || typeof wav.length !== "number" || wav.length < 1) return null;
            let d = Number(duration);
            if (!(isFinite(d) && d >= SYNC.minAudio && d <= SYNC.maxAudio)) {
                try { const w = AUDIO.decodeWav(wav); d = w.samples.length / w.sampleRate; } catch (e) { return null; }
            }
            return isFinite(d) && d >= SYNC.minAudio && d <= SYNC.maxAudio ? d : null;
        }

        // Diagnostics: errors by kind (debugSnapshot().delivery.errorTypes). Kinds: the service
        // worker's errorType (timeout, local_unavailable, local_error, rate_limit, quota, budget,
        // split, no_audio, disabled, invalid, dropped), plus the engine's own: aborted, no_response,
        // lookup_timeout, lookup_failed, bad_audio, job_stalled, play_interrupted, play_blocked,
        // play_failed, speech_stalled, unknown.
        countError(kind) {
            const m = this.stats.errorTypes || (this.stats.errorTypes = {});
            m[kind] = (m[kind] || 0) + 1;
            this.note("error", { kind });
        }

        // Diagnostics (1.9.9): the last SYNC.eventKeep things that cost the viewer words or time
        // (a line dropped and why, a skip, a reset and why, an error, a late start), with the media
        // time. Always on and tiny: debugSnapshot() and the quick menu's "Chép chẩn đoán" read it,
        // so a problem seen once can be read without a debug flag or a reload.
        note(kind, o) {
            const E = this.events || (this.events = []);
            const v = this.d.video;
            E.push({ at: Math.round((this.d.now() - (this.startedAt || 0)) / 100) / 10, t: v ? Math.round((v.currentTime || 0) * 100) / 100 : null, k: kind, ...o });
            if (E.length > SYNC.eventKeep) E.shift();
        }

        addRendered(p, wav, duration) {
            // Khớp thời lượng CỤC BỘ theo THỜI LƯỢNG AUDIO THẬT: chỉ co giãn (giữ cao độ, có
            // trần) khi audio dài hơn khoảng trống tới câu sau; phần vượt còn lại được phát
            // trọn (câu sau xếp hàng chờ). Không rút gọn rồi tạo lại audio sau khi đã có audio.
            const i = this.plans.indexOf(p);
            const next = i >= 0 ? this.plans[i + 1] : null;
            const room = next ? next.start - p.start - 0.1 : Infinity;
            const slot = Math.max(0.3, p.targetDuration, room);
            // stretch = nhịp nền của giọng (ước lượng thời lượng phát); tốc độ thật của từng câu
            // được chọn lúc bắt đầu nói (chooseRate) để nhịp đều giữa các câu
            const stretch = this.baseTempo(p);
            const url = this.d.createObjectURL(wav);
            this.rendered.set(p.id, { url, duration, stretch, fit: duration / slot, overflow: duration / stretch - slot, text: p.text, stops: this.findStops(wav, duration) });
        }

        // Where the voice resumes after each stop inside the take (seconds), for entryPoint. ~0.5 ms
        // per take; a take that is not a 16-bit WAV (test stubs) has none
        findStops(wav, duration) {
            try {
                const d = AUDIO.decodeWav(wav);
                return AUDIO.findSilences(d.samples, d.sampleRate, { minMs: SYNC.entryStopMs })
                    .filter(x => x.start > 0.05 && x.end < duration - 0.3)
                    .map(x => Math.max(0, x.end - 0.02));
            } catch (e) { return null; }
        }

        // The audio position to enter a line at, near the proportional position o (see SYNC.entryBack)
        entryPoint(r, o) {
            if (!r.stops) return o;
            let back = 0, ahead = null;
            for (const e of r.stops) { if (e <= o + 0.05) back = e; else { ahead = e; break; } }
            if (o - back <= SYNC.entryBack) { this.stats.cleanEntries = (this.stats.cleanEntries || 0) + 1; return back; }
            if (ahead != null && ahead - o <= SYNC.entryAhead) { this.stats.cleanEntries = (this.stats.cleanEntries || 0) + 1; return ahead; }
            this.stats.rawEntries = (this.stats.rawEntries || 0) + 1;
            return o;
        }

        async renderBatch(batch) {
            const jobId = `tts${++this.jobSeq}_${Date.now()}`;
            batch.forEach(p => this.pending.set(p.id, jobId));
            const job = { planIds: batch.map(p => p.id), t0: this.d.now(), orphan: false, queued: this.jobs.size > 0,
                ahead: this.jobs.size && this.provider.caps && this.provider.caps.serial ? this.serverBusy() : 0,
                est: batch.reduce((a, p) => a + (p.estDuration || 0), 0) };
            this.jobs.set(jobId, job);
            this.stats.requests++;
            this.stats.ttsPlans += batch.length;
            const provider = this.provider;
            try {
                const out = await provider.render(batch, { persona: this.settings.persona, jobId });
                const secs = (this.d.now() - job.t0) / 1000;
                // A job left behind (its line passed, a seek) still measured the server: skipping its
                // sample froze the estimate exactly when the server could not keep up, because then
                // nearly every job is left behind (1.9.9: the estimate stayed at 0.47 on a server at
                // 1.0x, and the engine kept chasing lines it could not reach). Latency stays live-only.
                {
                    if (!job.orphan) this.renderLatency = this.renderLatency == null ? secs : this.renderLatency * 0.7 + secs * 0.3;
                    // Generation speed = seconds spent / seconds of speech. Predicts the remaining
                    // wait far better than per-job latency, because batch sizes differ by a lot.
                    // A healthy local server is ~0.23; >= 1 means slower than real time.
                    // Audio the worker's store answered was not generated now: counted as a render
                    // it read as ~0.1 (min of EMA and last in dropRtf), and the next reach decision
                    // expected 1.7 s for a 9.4 s render on a server at RTF 0.9 (BACKLOG 33)
                    const audioSecs = out.reduce((a, o) => a + (o.cached ? 0 : o.duration || 0), 0);
                    // A take queued behind another still gives a sample (dropping those left the
                    // estimate stale after seeks: worst recovery 25 s in the simulated matrix), but
                    // not a point for the overhead fit, whose intercept that wait would inflate
                    if (audioSecs > 0.3) {
                        // Overhead is taken out here because waitAudio adds it back per request;
                        // counting it twice made short single-sentence jobs look 2x slower.
                        // The overhead is fitted from recent takes (renderOver): with the 0.6 guess a
                        // real VieNeu take of 0.6 s audio in 0.17 s read as RTF 0.08 (true 0.21).
                        if (!job.queued) this.noteTake(audioSecs, secs);
                        // queued behind another job on a serial server: that job's predicted rest is
                        // not this take's time (after a burst of seeks RTF 0.3 read as 0.55, and
                        // the next seek skipped a line it could reach: 5.9 s to voice, live harness)
                        const own = Math.max(0, secs - (job.ahead || 0));
                        let rtf = Math.max(0.05, own - this.renderOver()) / audioSecs;
                        // The first job pays the server's cold start: VieNeu idle for days had its
                        // model swapped out by macOS and the first render measured 3.5x real time
                        // (0.23 warm), which then dropped 7 sentences. One sample never says "slow".
                        if (this.renderRtf == null) rtf = Math.min(rtf, SYNC.firstRtfCap);
                        // a short take is mostly overhead: an error there of 0.1 s moves its rtf by
                        // 0.1 / audio, so it feeds the average but is never the "latest" sample
                        if (audioSecs >= SYNC.rtfShortAudio || this.lastRtf == null) this.lastRtf = rtf;
                        this.renderRtf = this.renderRtf == null ? rtf : this.renderRtf * 0.7 + rtf * 0.3;
                    }
                }
                for (const o of out) {
                    const p = batch.find(x => x.id === o.planId);
                    if (!p) continue;
                    // Kho bền vững đã được service worker ghi TRƯỚC khi trả lời; ở đây chỉ
                    // nhớ trong RAM của trang để bật lại lồng tiếng / tua lại là phát ngay.
                    // keyed by the voice that made this audio, not the one current now (a switch to
                    // the fallback mid-flight stored the old voice's take under the new voice's key)
                    if (this.d.audioCache && provider.audioKey) {
                        const key = p.audioKey || await provider.audioKey(p);
                        this.d.audioCache.put(key, { wav: o.wav, duration: o.duration, sampleRate: o.sampleRate });
                    }
                    if (!this.running || this.provider !== provider) continue;
                    if (this.audioLength(o.wav, o.duration) === Number(o.duration)) {
                        this.measureVoice(p, o.duration);
                        // Hiệu chỉnh mô hình thời lượng theo thời lượng PHÁT (đã tính nhịp nền)
                        this.calibrateFromAudio(p, o.duration / this.baseTempo(p));
                    }
                    // A late result whose line has changed since (re-cut, edited): never play it
                    const cur = this.planById.get(o.planId);
                    const duration = this.audioLength(o.wav, o.duration);
                    if (duration == null) { this.countError("bad_audio"); this.failed.set(p.id, (this.failed.get(p.id) || 0) + 1); continue; }
                    if (cur && cur.text === p.text && !this.rendered.has(cur.id)) this.addRendered(cur, o.wav, duration);
                }
                this.consecutiveErrors = 0;
            } catch (e) {
                this.countError(e && e.aborted ? "aborted" : (e && e.type) || "unknown");
                if (e && e.aborted) {
                    this.stats.aborted++;                       // hủy chủ động khi tua: không tính lỗi
                } else if (e && e.splitFailed && batch.length > 1) {
                    // Cắt không chắc chắn: tạo lại từng đoạn riêng cho đúng nội dung
                    batch.forEach(p => this.failed.set(p.id, 1));
                } else if (e && e.type === "timeout" && provider.caps.free) {
                    // Giọng trên máy (miễn phí): hết giờ thì được tạo lại (tối đa 2 lần), không bỏ câu
                    batch.forEach(p => this.failed.set(p.id, (this.failed.get(p.id) || 0) + 1));
                    this.stats.timeouts = (this.stats.timeouts || 0) + 1;
                    this.onProviderError(e);
                } else if (e && e.type === "timeout") {
                    // Quá thời gian chờ: máy chủ có thể ĐÃ tạo (và tính tiền) audio -> không gửi
                    // lại cho các đoạn này (tránh tạo trùng); chúng được bỏ qua trong hàng đợi lời nói
                    batch.forEach(p => this.failed.set(p.id, 2));
                    this.stats.timeouts = (this.stats.timeouts || 0) + 1;
                    this.onProviderError(e);
                } else if (e && (e.type === "rate_limit" || e.type === "quota")) {
                    // Vượt giới hạn tốc độ: từ giờ tạo audio dè dặt (1 lượt mỗi lúc, lượt lớn)
                    this.conservative = true;
                    batch.forEach(p => this.failed.set(p.id, (this.failed.get(p.id) || 0) + 1));
                    this.onProviderError(e);
                } else if (e && e.type === "budget") {
                    // Chạm ngân sách: chuyển hẳn sang giọng hệ thống (nếu có), không tạo audio AI nữa
                    this.stats.budgetStops = (this.stats.budgetStops || 0) + 1;
                    this.switchToFallback("budget");
                } else {
                    batch.forEach(p => this.failed.set(p.id, (this.failed.get(p.id) || 0) + 1));
                    this.onProviderError(e);
                }
            } finally {
                // only this job's claim: a job let go by the watchdog must not clear its retry's
                batch.forEach(p => { if (this.pending.get(p.id) === jobId) this.pending.delete(p.id); });
                this.jobs.delete(jobId);
                this.status();
            }
        }

        // Tốc độ nói thật của từng người nói (âm tiết/giây) từ audio đã tạo -> nhịp nền chính xác
        measureVoice(p, duration) {
            if (!this.provider.tempo || duration < 1.2) return;
            const syl = p.phrases.reduce((a, ph) => a + ph.syl, 0);
            const sps = syl / duration;
            if (sps < 2 || sps > 9) return;
            const cur = this.voiceSps.get(p.speaker);
            this.voiceSps.set(p.speaker, cur ? cur + (sps - cur) * 0.25 : sps);
        }

        // The AI voice's real speaking rate, measured from the audio received -> better duration
        // estimates for the plans still ahead.
        calibrateFromAudio(p, duration) {
            const m = this.provider.voiceModel;
            if (!m || duration < 0.8) return;
            const base = { ...m, calibration: 1 };
            let natural = 0;
            p.phrases.forEach((ph, k) => {
                natural += PLAN.speechSeconds(ph.syl, 1, base);
                if (k < p.phrases.length - 1) natural += PLAN.pauseSeconds(ph.pauseAfter, 1, base);
            });
            if (natural < 0.5) return;
            const measured = duration / natural;
            if (measured < 0.4 || measured > 2.5) return;
            const cur = m.calibration || 1;
            m.calibration = Math.min(1.8, Math.max(0.55, cur + (measured - cur) * 0.3));
            this.audioSamples = (this.audioSamples || 0) + 1;
            if (this.audioSamples % 3 === 0 && Math.abs(m.calibration - cur) / cur > 0.03) this.replanFuture();
        }

        // Người dùng tua / nhảy đi: lượt TTS không còn liên quan tới vị trí mới
        //   - mới gửi: hủy (nhường chỗ ngay cho vị trí mới)
        //   - đã chạy gần xong: để chạy nốt; audio vào kho, quay lại là có ngay,
        //     vì hủy lúc này gần như chắc chắn vẫn bị tính tiền mà không nhận được gì
        // Cả hai trường hợp đều không còn chặn việc tạo audio cho vị trí mới.
        // reach: how far ahead a job still counts as useful. A seek passes SYNC.seekKeepAhead: a job
        // for a line far ahead of the landing point would otherwise hold the serial server while the
        // line under the playhead waits (the 60 s free horizon, 1.9.9)
        cancelObsoleteJobs(t, reach) {
            const to = t + (reach != null ? Math.min(reach, this.prefetchAhead(true)) : this.prefetchAhead(true));
            const now = this.d.now();
            const usual = (this.renderLatency != null ? this.renderLatency : 4) * 1000;
            for (const [jobId, job] of this.jobs) {
                // No answer for jobStallMs: the reply is lost. Forget the job (it counted toward
                // maxJobs forever: three of them silenced the voice for good) and free its lines;
                // a retry joins the worker's request if that is still running.
                if (now - job.t0 > SYNC.jobStallMs || (job.orphan && now - (job.orphanAt || job.t0) > SYNC.orphanStallMs)) {
                    this.jobs.delete(jobId);
                    job.orphan = true;
                    for (const id of job.planIds) {
                        if (this.pending.get(id) !== jobId) continue;
                        this.pending.delete(id);
                        this.failed.set(id, (this.failed.get(id) || 0) + 1);
                    }
                    this.countError("job_stalled");
                    continue;
                }
                if (job.orphan) continue;
                const relevant = job.planIds.some(id => {
                    const p = this.planById.get(id);
                    return p && p.start + p.estDuration >= t - 1 && p.start <= to;
                });
                if (relevant) continue;
                job.orphan = true;
                job.orphanAt = now;
                if (now - job.t0 >= usual * SYNC.keepIfDone || !this.provider.abort) {
                    this.stats.detached = (this.stats.detached || 0) + 1;
                } else {
                    try { this.provider.abort(jobId); } catch (e) { /* bỏ qua */ }
                }
            }
        }

        onProviderError(e) {
            this.stats.errors++;
            this.consecutiveErrors++;
            if (this.d.log) this.d.log("Lỗi lồng tiếng:", e && e.message);
            // Giọng trên máy (VieNeu, miễn phí): lỗi tạm thời (máy bận, một câu bị kẹt) chỉ
            // thử lại câu đó; CHỈ chuyển sang giọng hệ thống khi máy chủ thật sự không chạy
            if (this.provider.caps && this.provider.caps.free && !(e && e.type === "local_unavailable")) return;
            // Giọng AI lỗi liên tục (hết hạn mức, mất mạng): chuyển hẳn sang giọng
            // hệ thống cho cả video -> giọng nhất quán, video không bị ảnh hưởng.
            if (this.consecutiveErrors >= 3) this.switchToFallback("errors");
        }

        switchToFallback(reason) {
            this.fallbackReason = reason;
            if (this.fallback && this.provider !== this.fallback) {
                this.silence();
                this.speech = null;
                this.provider = this.fallback;
                this.sourceSig = "";
                this.refresh(true);
                this.status("fallback");
            } else if (reason === "budget") {
                this.budgetBlocked = true;          // không có giọng dự phòng: ngừng tạo audio AI
                this.status("budget");
            }
        }

        // ---------------- Dừng / đặt lại ----------------
        silence() {
            if (this.live && this.live.speaking) {
                this.live.cancelled = true;
                try { this.live.handle && this.live.handle.cancel(); } catch (e) { /* bỏ qua */ }
                this.live.speaking = false;
                // Tiếp tục lại đúng cụm đang nói dở khi video chạy tiếp
                this.live.k = Math.max(-1, this.live.k - 1);
                this.live.finished = false;
            }
            try { this.provider.stopAll && this.provider.stopAll(); } catch (e) { /* bỏ qua */ }
            for (const r of this.rendered.values()) if (r.el && !r.el.paused) this.quietPause(r.el);
            this.speakingUntilMedia = -1;
        }

        // Khóa kho audio của MỌI đoạn trong video này. Cách cắt đoạn đầu phụ thuộc chỗ bắt đầu xem
        // (headAt) và câu dày chữ có khóa riêng: tính đủ các biến thể để xóa sạch
        async audioKeysForVideo() {
            if (!this.provider || !this.provider.audioKey) return [];
            const groups = (this.d.getGroups() || []).filter(g => g && g.viText && g.viCues && g.viCues.length);
            const plans = [...this.plans];
            const heads = new Set([this.headAt, 0, null, Math.round((this.d.video && this.d.video.currentTime) || 0)]);
            const free = !!(this.provider.caps && this.provider.caps.free);
            for (const h of heads) {
                for (const joinGroups of free ? [true, false] : [false]) {
                    plans.push(...PLAN.planAll(this.oneVoice(PLAN.buildDubScript(groups, { headAt: h, ...(joinGroups ? FREE_SEGMENTS : {}) })), { voiceModel: this.provider.voiceModel }));
                }
            }
            const keys = new Set();
            for (const p of plans) {
                if (p.audioKey) keys.add(p.audioKey);
                for (const tight of [false, true]) keys.add(await this.provider.audioKey({ ...p, tightPauses: tight }));
            }
            return [...keys];
        }

        // Bỏ audio đang giữ trong trang (sau khi xóa kho): tạo lại từ vị trí đang xem
        forgetRendered() {
            for (const [, r] of this.rendered) {
                if (r.el) this.releaseAudio(r);
                if (r.url && this.d.revokeObjectURL) this.d.revokeObjectURL(r.url);
            }
            this.rendered.clear();
            this.cacheChecked.clear();
            for (const p of this.plans) delete p.audioKey;
            this.hardReset("forget-audio");
        }

        hardReset(reason) {
            this.note("reset", { why: reason });
            this.pace = null;                   // the pace of where we were says nothing about where we are
            this.silence();
            this.speech = null;                 // lời đang nói không còn đúng vị trí: bỏ
            this.adResume = null;               // a seek after an ad: the cut line is not taken up again
            // elements made for where we were (the line cut off, the one prepared after it) go too,
            // a sounding one after the fade silence() began (a cut at once was a click on every seek)
            for (const r of this.rendered.values()) if (r.el) this.releaseAudio(r, true);
            this.lastSpokenStart = null;
            this.entryWait = null;              // a line waited on before the seek was the viewer's skip
            this.lastRate = null;               // vị trí mới: không nối nhịp với câu cũ
            this.lastSpeechEnd = null;
            this.lastSpokenId = null;
            this.warmup = true;                 // lượt TTS kế tiếp nhỏ để có tiếng ngay ở vị trí mới
            // A short head cut around the new position gets voice sooner when nothing is ready there.
            // When the audio at the landing point is already in the page (a rewind, a seek into what
            // was prefetched) the cut stays: that audio plays at once from its offset, where a new cut
            // re-rendered the line (0.8 s on a warm server, one wasted request, more when slow)
            const at = this.d.video.currentTime || 0;
            this.headPinned = this.audioReadyAt(at);
            // Not in the page, but the store may hold it under the current cut (a rewind past
            // keepBehind): keep the cut until schedule has looked (resolveHeadProbe, 1.8.7)
            this.headProbe = !this.headPinned && this.d.audioCache && this.provider.audioKey ? at : null;
            if (this.headProbe != null) this.headPinned = true;
            if (!this.headPinned) this.headAt = Math.round(at);
            this.resetWall = this.d.now();
            this.live = null;
            this.lastT = null;
            this.seekTimes.push(this.d.now());
            this.cancelObsoleteJobs(this.d.video.currentTime, SYNC.seekKeepAhead * Math.max(1, this.d.video.playbackRate || 1));
            if (this.d.onReset) { try { this.d.onReset(reason); } catch (e) { /* bỏ qua */ } }
        }

        // After a seek with nothing in the page: look the lines at the landing point up in the store
        // under the current cut first. A hit plays at once; a miss makes the short head cut as before,
        // one store round trip later. Simulated rewind of 3 min: voice 0.95 -> 0.05 s, 1 request less.
        // true = wait (lookup running, or the plans were just re-cut)
        resolveHeadProbe(t) {
            const i = this.planAt(t + SYNC.startTolerance);
            const p = i >= 0 ? this.plans[i] : null;
            const next = this.plans[i + 1];
            const want = [p && t < p.end ? p : null, next && next.start - t < 3 ? next : null].filter(Boolean);
            const free = !!(this.provider.caps && this.provider.caps.free);
            const look = want.filter(q => !this.cacheChecked.has(q.id) && !this.rendered.has(q.id));
            if (look.length) {
                if (free) for (const q of look) if (q.tightPauses == null) q.tightPauses = this.denseRatio(q) > SYNC.denseRatio;
                this.lookupCache(look);
                return true;
            }
            this.headProbe = null;
            if (want.length && this.audioReadyAt(t)) { this.stats.storeReuse = (this.stats.storeReuse || 0) + 1; return false; }
            this.headPinned = false;
            this.headAt = Math.round(t);
            this.refresh();
            return true;
        }

        // The line under t (or, in a silence, the next one within 2 s) has audio, and if t is near its
        // end (where nextSpeech skips it) the line after it has audio too
        audioReadyAt(t) {
            const i = this.planAt(t + SYNC.startTolerance);
            const p = i >= 0 ? this.plans[i] : null;
            const next = this.plans[i + 1];
            if (p && t < p.end) return this.rendered.has(p.id) && (p.end - t > 1 || !next || this.rendered.has(next.id));
            return !!(next && next.start - t < 2 && this.rendered.has(next.id));
        }

        // ---------------- Hạ nhỏ tiếng gốc (ducking) mượt ----------------
        // Trình duyệt không tách được giọng khỏi nhạc nền của video YouTube/Coursera
        // (luồng media khác nguồn), nên giữ nhạc nền bằng cách HẠ NHỎ tiếng gốc
        // khi có lời Việt, tăng/giảm dần để không giật.
        updateDuck(t, playing) {
            // (2.0.8) Paused, loading or stalled with a line under way or about to start: the original
            // stays down. It came back to full during a pause, and the voice went on over it at 91%
            const cut = this.live && this.live.cancelled && !this.live.finished;    // a system-voice phrase cut by the pause
            const held = !playing && !this.d.video.ended && !this.inAd && !!(this.speech || cut || this.lineComing(t));
            // A system-voice phrase still speaking past its predicted end (a slower voice) is still speech
            const speaking = t <= this.speakingUntilMedia || !!(this.live && this.live.speaking);
            const active = held || (playing && (speaking || this.lineComing(t)));
            const target = active ? this.settings.duck : 1;
            if (!this.duckDirty && Math.abs(this.duckFactor - target) < 1e-3) return;
            this.duckDirty = false;
            // A voice already sounding over a loud original: it comes down at the attack speed
            const over = playing && target < this.duckFactor && ((this.speech && t >= this.speech.mediaStart) || !!(this.live && this.live.speaking));
            const was = this.duckFactor;
            this.duckFactor = duckStep(this.duckFactor, target, this.settings.duck, over ? SYNC.duckAttackTicks : 0);
            if (this.duckFactor === 1 && was < 1) this.stats.duckUps = (this.stats.duckUps || 0) + 1;
            this.setVideoVolume((this.baseVolume == null ? 1 : this.baseVolume) * this.duckFactor);
        }

        // (2.0.8) Between two lines: when the next one starts (nextVoiceAt), a gap under
        // SYNC.duckBridge wall seconds keeps the original down, and after a longer one it is down
        // again when the line starts. Before, it came back after duckHold whatever came next. Nine
        // simulator scenarios: 88 of 180 gaps under 1.5 s let it up and down again (a pump), 2 now
        // (a take not made in time); 163 of 265 lines began over it above 50%, 11 now (the first
        // line after a start, a late take). The system voice: 10 of 30 and 18 of 38, both 0 now
        lineComing(t) {
            const next = this.nextVoiceAt(t);
            if (!next || t > next.at + SYNC.duckHold) return false;    // due and still silent: let it up
            const vr = Math.max(0.25, this.d.video.playbackRate || 1);
            const ramp = SYNC.duckRampTicks * SYNC.tickMs / 1000;
            if (next.pending) return (next.at - next.end) / vr <= SYNC.duckBridge;
            return (next.end != null && (next.at - next.end) / vr <= SYNC.duckBridge) || t >= next.at - ramp * vr;
        }

        // { end, at }: the media time the last line ended (null after a start or a seek) and the one
        // the next starts, by the rules that start it. A take in the page: nextSpeech's (the rest after
        // the last line; a running sentence may take the next part up to chainLead early; else the
        // subtitle's start). The system voice: tickLive's (each phrase at its own place in the video).
        // null while a line plays or when the next one's start is not known (its take is not made)
        nextVoiceAt(t) {
            if (this.speech) return null;
            if (this.provider.caps.live) {
                const L = this.live, plan = L && L.planId ? this.planById.get(L.planId) : null;
                if (!plan || L.speaking || L.endMedia == null) return null;
                const q = L.k + 1 < plan.phrases.length ? plan : this.plans[this.plans.indexOf(plan) + 1];
                if (!q || !q.phrases.length) return null;
                const due = q.start + q.phrases[q === plan ? L.k + 1 : 0].offset;
                return { end: L.endMedia, at: Math.max(L.endMedia, due - SYNC.startTolerance, q === plan ? -Infinity : q.start) };
            }
            const end = this.lastSpeechEnd, fresh = this.lastSpokenStart == null;
            const q = this.plans[this.planAt(fresh ? t + SYNC.startTolerance : this.lastSpokenStart + 1e-6) + 1];
            if (!q) return null;
            if (!this.rendered.has(q.id)) {
                // (2.1.3) Its take is on the way: the line can start once it is made, by the speed
                // measured. Only the bridge uses this (lineComing), so a take that overruns its
                // estimate still lets the original up duckBridge after the last line
                const jobId = this.pending.get(q.id), job = jobId != null && this.jobs.get(jobId);
                if (end == null || !job || job.orphan) return null;
                const vr = Math.max(0.25, this.d.video.playbackRate || 1);
                return { end, at: Math.max(q.start - SYNC.startTolerance, t + this.jobRemain(job) * vr), pending: true };
            }
            const prev = end != null && this.lastSpokenId ? this.planById.get(this.lastSpokenId) : null;
            const chain = !!(prev && prev.continuesNext && this.plans[this.plans.indexOf(prev) + 1] === q);
            const rest = this.lastSpeechGap != null ? this.lastSpeechGap : (this.lastSpeechJoined ? SYNC.joinGap : SYNC.sentenceGap);
            return { end, at: Math.max(end != null ? end + rest : -Infinity, q.start - (chain ? SYNC.chainLead : SYNC.startTolerance)) };
        }

        setVideoVolume(vol, restore) {
            const v = this.d.video;
            // Another engine owns this element's volume now: never write it, never restore it (that
            // restore would be our base, which the owner has already taken over)
            if (!this.ownsVolume()) { this.lastSetVolume = null; return; }
            const x = Math.max(0, Math.min(1, vol));
            this.lastSetVolume = restore ? null : x;
            try { v.volume = x; } catch (e) { /* bỏ qua */ }
            if (!restore) this.lastSetVolume = v.volume;
            if (restore) this.releaseVolume();
            else this.markVolume("data-cst-duck-base", this.baseVolume == null ? v.volume : this.baseVolume);
        }

        // ---- Who ducks this <video> (1.9.2) ----
        // Content scripts from before and after a Reload run in different isolated worlds and share
        // only the DOM. Two attributes on the element say which engine ducks it and the user's own
        // level, so a new engine starts from that level and an old one stands down. Before, each took
        // the other's ducked level for the user's: YouTube was left at 0.01 of 0.80 after dubbing.
        // Elements without attributes (tests' stand-ins) behave as before.
        attrApi() {
            const v = this.d.video;
            return v && typeof v.getAttribute === "function" && typeof v.setAttribute === "function" ? v : null;
        }
        heldBaseVolume() {
            const v = this.attrApi();
            if (!v) return null;
            const x = Number(v.getAttribute("data-cst-duck-base"));
            return v.getAttribute("data-cst-duck-owner") && v.getAttribute("data-cst-duck-base") != null && isFinite(x) && x >= 0 && x <= 1 ? x : null;
        }
        claimVolume() {
            this.volumeToken = this.volumeToken || `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
            this.volumeSuperseded = false;
            this.markVolume("data-cst-duck-owner", this.volumeToken);
            this.markVolume("data-cst-duck-base", this.baseVolume);
        }
        ownsVolume() {
            if (this.volumeSuperseded) return false;
            const v = this.attrApi();
            if (!v || !this.volumeToken) return true;
            const owner = v.getAttribute("data-cst-duck-owner");
            if (owner && owner !== this.volumeToken) { this.volumeSuperseded = true; return false; }
            // cleared by someone (the page, a stop elsewhere) while we run: ours again
            if (!owner && this.running) this.markVolume("data-cst-duck-owner", this.volumeToken);
            return true;
        }
        releaseVolume() {
            const v = this.attrApi();
            if (!v || v.getAttribute("data-cst-duck-owner") !== this.volumeToken) return;
            try { v.removeAttribute("data-cst-duck-owner"); v.removeAttribute("data-cst-duck-base"); } catch (e) { /* bỏ qua */ }
        }
        markVolume(name, value) {
            const v = this.attrApi();
            if (!v || value == null) return;
            const text = typeof value === "number" ? String(Math.round(value * 1000) / 1000) : String(value);
            try { if (v.getAttribute(name) !== text) v.setAttribute(name, text); } catch (e) { /* bỏ qua */ }
        }

        status(kind) {
            if (!this.d.onStatus) return;
            const ready = this.provider.caps.prerender ? this.rendered.size : this.plans.length;
            this.d.onStatus({
                provider: this.provider.id,
                label: this.provider.label,
                voice: this.provider.voiceLabel || "",
                segments: this.plans.length,
                ready,
                fallback: kind === "fallback" || (this.fallback && this.provider === this.fallback && this.d.providers.primary !== this.fallback),
                reason: this.fallbackReason || "",
                budgetBlocked: !!this.budgetBlocked,
                playBlocked: !!this.playBlocked
            });
        }
    }

    const api = { DubEngine, createWebSpeechProvider, createGeminiProvider, createVieneuProvider, geminiScript, plainScript, speakScript, gapAfter, SYNC, TTS_STYLE_VERSION, DEFAULT_TTS_MODEL };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_DUB_ENGINE = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

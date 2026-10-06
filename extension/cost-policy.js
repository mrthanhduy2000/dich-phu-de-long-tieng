// ============================================================
// CHÍNH SÁCH CHI PHÍ: CHẾ ĐỘ SỬ DỤNG + ĐỊNH TUYẾN MODEL DỊCH
//
// Thứ tự ưu tiên:  LOCAL -> CACHE -> MODEL RẺ -> MODEL MẠNH (khi cần) -> TTS (khi cần)
//
// DANH MỤC MODEL DUY NHẤT của tiện ích: trang Cài đặt, service worker, lồng tiếng,
// bước chuyển đổi cài đặt cũ và kiểm thử đều đọc từ đây (không ghi tên model ở nơi khác).
// Kiểm tra theo tài liệu chính thức Gemini API (trang Models, Pricing, Deprecations
// cập nhật 16 đến 17/09/2026). Không lưu số tiền trong code (giá có thể đổi): chỉ lưu
// THỨ TỰ giá (costRank, 1 = rẻ nhất) để chính sách lùi model không bao giờ lén lên model đắt hơn.
// ============================================================
(function (root) {
    "use strict";

    // access "restricted": model còn hoạt động nhưng Google không cấp cho API key / dự án MỚI
    //   (API trả 404 "no longer available to new users"). Chỉ dùng khi key này gọi được thật.
    // shutdown / replacement: lịch ngừng hỗ trợ theo trang Deprecations.
    // estPrice: USD per 1M tokens, paid tier, text input (Pricing page re-checked 2026-09-29; output
    //   includes thinking tokens; cache: the rate of input served from Google's implicit cache).
    //   Only for the cost estimate and budget, no other decision.
    const TRANSLATION_MODELS = [
        { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", hint: "rẻ nhất", costRank: 1, access: "restricted", estPrice: { in: 0.10, out: 0.40, cache: 0.01 } },
        { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", hint: "rẻ, mọi API key đều dùng được", costRank: 2, shutdown: "2027-05-07", replacement: "gemini-3.5-flash-lite", estPrice: { in: 0.25, out: 1.50, cache: 0.025 } },
        { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", hint: "hiểu ngữ cảnh tốt hơn, đắt hơn", costRank: 3, estPrice: { in: 0.30, out: 2.50, cache: 0.03 } },
        // Flash thế hệ 3 mặc định "suy nghĩ" mức trung bình (token suy nghĩ tính như đầu ra) -> hạ xuống thấp
        { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", hint: "hiểu sâu nhất, đắt nhất", costRank: 4, thinkingLevel: "low", estPrice: { in: 0.75, out: 3.75, cache: 0.075 } }
    ];
    const TTS_MODELS = [
        { id: "gemini-2.5-flash-preview-tts", label: "Gemini 2.5 Flash TTS", costRank: 1, access: "restricted", estPrice: { in: 0.50, out: 10.00 } },
        { id: "gemini-3.1-flash-tts-preview", label: "Gemini 3.1 Flash TTS", costRank: 2, estPrice: { in: 1.00, out: 20.00 } }
        // Không có Pro TTS: đắt gấp đôi và không bao giờ được tự động dùng
    ];
    const AUDIO_TOKENS_PER_SEC = 25;      // tài liệu Gemini: 25 token cho mỗi giây audio

    // Giọng Việt CHẠY TRÊN MÁY: VieNeu-TTS v3 Turbo (Apache 2.0, github.com/pnnbao97/VieNeu-TTS).
    // Máy chủ cục bộ tương thích OpenAI, chỉ mở trên 127.0.0.1; không tốn tiền API.
    // Đo trên MacBook Air M3 (CPU, ONNX fp32): tạo 5 giây lời nói mất khoảng 1,1 giây.
    const LOCAL_TTS = {
        id: "vieneu",
        label: "Giọng Việt trên máy (VieNeu)",
        model: "vieneu-v3-turbo",
        url: "http://127.0.0.1:8000",
        modelLabel: "VieNeu-TTS v3 Turbo",
        // 48 kHz, the model's native rate (1.6.7; was 24 kHz). Measured in Chrome on one Thục Đoan
        // take played with preservesPitch: harmonicity of the roughest 10% of voiced frames fell
        // 0.700 -> 0.613 at 1.4x from a 24 kHz copy, but only 0.669 -> 0.649 from the 48 kHz
        // original. The time-stretch on the lower rate is what made fast passages sound rough.
        sampleRate: 48000,
        // Nhiệt độ lấy mẫu: đo 4 lần/câu trên máy Đàm, độ dài dao động 8 đến 12% ở 0,8 (mặc định
        // của VieNeu) còn 4 đến 6% ở 0,6 -> nhịp nói đều hơn giữa các câu, giọng vẫn tự nhiên
        temperature: 0.6,
        // Rumble cut before the hiss removal (1.7.2, AUDIO.highPass): female voices have nothing
        // under ~130 Hz, male ones reach ~85 Hz (Thái Sơn)
        highPassHz: { female: 80, male: 60 },
        maxPause: 0.4, 
        tightPause: 0.15,                  // câu dày chữ (người nói nhanh): khoảng nghỉ trong câu tối đa 0,15 giây
                    // khoảng lặng trong câu dài hơn mức này thì rút ngắn lại
        // Nhịp nói MỤC TIÊU (âm tiết/giây, sau khi rút khoảng lặng) cho lồng tiếng: giọng chậm hơn
        // được tăng tốc ĐỀU cho cả video (giữ cao độ), tối đa maxTempo; giọng nhanh hơn giữ nguyên
        targetSps: 4.8,
        // Đo thật trên bài giảng: Mỹ Duyên chỉ ~3,6 âm tiết/giây sau khi rút khoảng lặng -> cần
        // tăng tốc nhiều hơn 1,15; 1,22 vẫn trong vùng co giãn giữ cao độ nghe tự nhiên
        maxTempo: 1.22,
        // Tốc độ nghe TỐI THIỂU khi lồng tiếng (âm tiết/giây): câu thưa được đọc chậm lại cho
        // khớp phụ đề nhưng không dưới mức này (Đàm: "lúc nói quá chậm"); sàn tối đa 1,15x
        minSps: 4.0,
        maxFloor: 1.15,
        startScript: "~/VieNeu-TTS/cst-start.command",
        defaultVoice: "Mỹ Duyên",
        defaultVoice2: "Thái Sơn",
        // sps: tốc độ nói đo trên máy Đàm (âm tiết/giây, không tính khoảng lặng).
        // 2026-09-23: all 25 measured on the local server (3 lecture sentences each, voiced frames
        // only, scaled by 0.984 to match the 4 voices measured earlier, which the method reproduced
        // within 4%). Before, 21 voices shared a guess of 4.8, off by up to 24%.
        voices: [
            { id: "Thùy Dung", sps: 5.4, gender: "Nữ", region: "Nam", style: "tin tức" },
            { id: "Mỹ Duyên", sps: 4.2, gender: "Nữ", region: "Nam", style: "đọc truyện" },
            { id: "Thục Đoan", sps: 5.3, gender: "Nữ", region: "Nam", style: "kể chuyện" },
            { id: "Kim Thanh", sps: 3.8, gender: "Nữ", region: "Nam", style: "đọc truyện" },
            { id: "Minh Triết", sps: 5.2, gender: "Nam", region: "Nam", style: "tin tức" },
            { id: "Đức Trí", sps: 4.0, gender: "Nam", region: "Nam", style: "đọc truyện" },
            { id: "Thái Sơn", sps: 4.6, gender: "Nam", region: "Nam", style: "kể chuyện" },
            { id: "Adam", sps: 5.0, gender: "Nam", region: "Nam", style: "tự nhiên" },
            { id: "Minh Quân Pro", sps: 5.4, gender: "Nam", region: "Bắc", style: "tự nhiên" },
            { id: "Trúc Ly", sps: 5.7, gender: "Nữ", region: "Bắc", style: "tự nhiên" },
            { id: "Mai Anh", sps: 5.0, gender: "Nữ", region: "Bắc", style: "tin tức" },
            { id: "Ngọc Huyền", sps: 5.1, gender: "Nữ", region: "Bắc", style: "tự nhiên" },
            { id: "Anh Khôi", sps: 5.5, gender: "Nam", region: "Bắc", style: "kể chuyện" },
            { id: "Adam bựa", sps: 4.9, gender: "Nam", region: "Bắc", style: "tự nhiên" },
            { id: "Thiền Tâm Đức", sps: 4.4, gender: "Nam", region: "Bắc", style: "kể chuyện" },
            { id: "Minh Đức", sps: 4.7, gender: "Nam", region: "Bắc", style: "tin tức" },
            { id: "Phạm Tuyên", sps: 5.0, gender: "Nam", region: "Bắc", style: "tự nhiên" },
            { id: "Xuân Vĩnh", sps: 5.5, gender: "Nam", region: "Bắc", style: "tự nhiên" },
            { id: "Thanh Bình", sps: 5.8, gender: "Nam", region: "Bắc", style: "kể chuyện" },
            { id: "Ngọc Linh", sps: 4.9, gender: "Nữ", region: "Bắc", style: "kể chuyện" },
            { id: "Đoan Trang", sps: 4.9, gender: "Nữ", region: "Bắc", style: "tự nhiên" },
            { id: "Quỳnh Anh", sps: 4.6, gender: "Nữ", region: "Bắc", style: "đọc truyện" },
            { id: "Mạnh Dũng", sps: 5.3, gender: "Nam", region: "Bắc", style: "tự nhiên" },
            { id: "Quang Sơn", sps: 5.5, gender: "Nam", region: "Trung", style: "tự nhiên" },
            { id: "Ngọc Trân", sps: 4.6, gender: "Nữ", region: "Trung", style: "tự nhiên" }
        ]
    };

    // "auto" = model Flash-Lite RẺ NHẤT mà API key hiện tại gọi được thật:
    // key có quyền 2.5 -> 2.5; key mới (2.5 trả 404 cho key mới) -> 3.1.
    const AUTO = "auto";
    const AUTO_CANDIDATES = ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
    const DEFAULT_MODELS = {
        cheap: AUTO,                         // model chính: mọi phụ đề
        strong: "gemini-3.5-flash-lite",     // model nâng cấp: chỉ câu khó / dịch lại ở chế độ Cao cấp
        tts: "gemini-2.5-flash-preview-tts"  // giọng AI: key không có quyền 2.5 thì dùng 3.1 TTS
    };

    // Model đã bị Google tắt / tên cũ không còn hợp lệ -> model thay thế
    const RETIRED_MODELS = {
        "gemini-3.1-flash-lite-preview": AUTO,
        "gemini-2.0-flash": AUTO,
        "gemini-2.0-flash-lite": AUTO
    };

    const findModel = id => TRANSLATION_MODELS.find(m => m.id === id) || TTS_MODELS.find(m => m.id === id) || null;
    const costRank = id => (findModel(id) || { costRank: Infinity }).costRank;
    const modelLabel = id => (id === AUTO ? "Tự động" : (findModel(id) || { label: id }).label);

    // Đã qua ngày ngừng hỗ trợ: dùng model thay thế luôn, không chờ API báo lỗi
    function afterShutdown(id, today) {
        const m = findModel(id);
        return !!(m && m.shutdown && (today || new Date().toISOString().slice(0, 10)) >= m.shutdown);
    }
    function liveModel(id, today) {
        let cur = id;
        for (let i = 0; i < 4 && afterShutdown(cur, today); i++) cur = findModel(cur).replacement || AUTO_CANDIDATES[AUTO_CANDIDATES.length - 1];
        return cur;
    }

    function thinkingLevelFor(id) {
        const m = findModel(id);
        if (m) return m.thinkingLevel || null;
        // Model nhập tay: Flash thế hệ 3 (không Lite) cũng hạ mức suy nghĩ
        return /^gemini-3.*flash/i.test(id) && !/lite/i.test(id) ? "low" : null;
    }

    // Chuỗi model sẽ thử cho một yêu cầu dịch.
    //   isUnavailable(model): model đã được xác nhận KHÔNG gọi được với key này
    //   (404 cho key mới / model không tồn tại) -> bỏ qua luôn, không thử lại mỗi phụ đề.
    //   - model chính: người dùng chọn, hoặc "auto" = rẻ nhất gọi được
    //   - strong: model nâng cấp, không dùng được thì về model chính
    //   - lùi thêm theo giá tăng dần, có trần: Tiết kiệm = giá model RẺ NHẤT key gọi được
    //     (không bao giờ đắt hơn cần thiết); chế độ khác = giá model nâng cấp đã chấp nhận
    function modelChain(tier, cfg, modeId, isUnavailable = () => false, today) {
        const ok = id => id && !isUnavailable(id) && !afterShutdown(id, today);
        const auto = cfg.cheap === AUTO || !cfg.cheap;
        const chosen = auto ? null : liveModel(cfg.cheap, today);
        const strong = tier === "strong" ? liveModel(cfg.strong || DEFAULT_MODELS.strong, today) : null;
        const firstUsable = [chosen, ...AUTO_CANDIDATES].find(ok);
        const economy = modeId === "economy" || modeId === "subtitles";
        const rankUsable = firstUsable ? costRank(firstUsable) : 0;
        const ceiling = economy
            ? Math.max(chosen ? costRank(chosen) : 0, rankUsable)
            : Math.max(rankUsable, costRank(cfg.strong || DEFAULT_MODELS.strong));
        const byPrice = [...TRANSLATION_MODELS].sort((a, b) => a.costRank - b.costRank).map(m => m.id);
        const chain = [strong, chosen, ...(auto ? AUTO_CANDIDATES : []), ...byPrice]
            .filter(id => ok(id) && (id === strong || id === chosen || costRank(id) <= ceiling));
        return [...new Set(chain)];
    }

    // Chuyển đổi cài đặt model cũ (một lần cho mỗi phiên bản danh mục)
    //   <=1.1.3: 3.5 Flash-Lite / 3.1 Flash-Lite do tiện ích tự đặt làm mặc định -> "auto"
    //   1.1.5  : 2.5 Flash-Lite do bản 1.1.5 tự đặt cho MỌI key (sai với key mới) -> "auto"
    //            ("auto" vẫn dùng 2.5 nếu key có quyền, nên người đang dùng được 2.5 không mất gì)
    //   Tên model đã bị Google tắt -> "auto". Lựa chọn khác của người dùng giữ nguyên.
    const MODELS_VERSION = 116;
    function migrateModelSettings(cfg) {
        const patch = {};
        const ver = cfg.modelsVersion || 0;
        if (ver >= MODELS_VERSION) return patch;
        const cur = cfg.geminiModel || "";
        if (!cur || RETIRED_MODELS[cur]) patch.geminiModel = AUTO;
        else if (ver < 114 && !cfg.costMigration113 && cur === "gemini-3.5-flash-lite") { patch.geminiModel = AUTO; patch.geminiStrongModel = DEFAULT_MODELS.strong; }
        else if (ver < 114 && cur === "gemini-3.1-flash-lite") patch.geminiModel = AUTO;
        else if (ver === 114 && cur === "gemini-2.5-flash-lite") patch.geminiModel = AUTO;
        if (RETIRED_MODELS[cfg.geminiStrongModel]) patch.geminiStrongModel = DEFAULT_MODELS.strong;
        patch.modelsVersion = MODELS_VERSION;
        return patch;
    }

    // Ngân sách mặc định (USD ước tính). 0 = không giới hạn. Người dùng chỉnh trong Cài đặt.
    const BUDGET_DEFAULTS = { daily: 1.0, video: 0.5, warnAt: 0.8 };

    // ---------------- Ước tính chi phí (chỉ để hiển thị và giới hạn ngân sách) ----------------
    // Price of a model id as the catalog knows it. A typed id is matched after dropping what only
    // names a release ("models/", "-preview", "-latest", "-001", a date), then by family and
    // generation ("3.1" + "flash-lite"; a newer generation takes the dearest of its kind). A model
    // of no known kind (a Pro, say) has no price here: PRICE_UNKNOWN is only a placeholder and the
    // Settings card says the amount may be low. how: "exact" | "variant" | "family" | "unknown".
    const PRICES_CHECKED = "2026-09-29";
    const PRICING_URL = "https://ai.google.dev/gemini-api/docs/pricing";
    const PRICE_UNKNOWN = { in: 0.75, out: 3.75 };
    function priceOf(id) {
        const exact = findModel(id);
        if (exact && exact.estPrice) return { price: exact.estPrice, how: "exact", base: exact.id };
        const norm = String(id || "").toLowerCase().replace(/^models\//, "")
            .replace(/-(preview|latest|exp(erimental)?)(-[\w.-]*)?$/, "").replace(/-\d{3}$/, "").replace(/-\d{2}-\d{2,4}$/, "");
        const variant = findModel(norm);
        if (variant && variant.estPrice) return { price: variant.estPrice, how: "variant", base: variant.id };
        const gen = (norm.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1];
        const kind = /flash-lite/.test(norm) ? "flash-lite" : /flash/.test(norm) ? "flash" : null;
        const same = TRANSLATION_MODELS.filter(m => kind && (kind === "flash" ? /flash(?!-lite)/.test(m.id) : m.id.includes(kind)));
        const sameGen = same.find(m => gen && m.id.startsWith(`gemini-${gen}-`));
        if (sameGen) return { price: sameGen.estPrice, how: "family", base: sameGen.id };
        if (same.length) { const top = same.reduce((a, b) => (b.estPrice.out > a.estPrice.out ? b : a)); return { price: top.estPrice, how: "family", base: top.id }; }
        return { price: PRICE_UNKNOWN, how: "unknown", base: null };
    }
    // cachedTok: the part of inTok Google served from its implicit cache, billed at p.cache
    function estimateTextCost(model, inTok, outTok, cachedTok = 0) {
        const p = priceOf(model).price;
        const cached = Math.min(cachedTok || 0, inTok);
        return ((inTok - cached) * p.in + cached * (p.cache != null ? p.cache : p.in) + outTok * p.out) / 1e6;
    }
    function estimateTtsCost(model, textChars, audioSec) {
        const p = (findModel(model) || {}).estPrice || { in: 1, out: 20 };
        return (Math.ceil(textChars / 4) * p.in + audioSec * AUDIO_TOKENS_PER_SEC * p.out) / 1e6;
    }

    // ---------------- Money display (Settings cost card, popup) ----------------
    // Google bills in USD; the VND figure is a conversion for reading only. FX.usdVnd is the
    // mid-market reference on FX.asOf (Wise / Yahoo, 26,022.5 on 2026-09-29); a card is charged
    // at its bank's selling rate, a little higher, which the viewer can type in instead.
    // costExtraPct: tax or bank fee the viewer sees on the real bill, added to every amount shown.
    // Display only: budgets and the ledger stay in plain USD.
    const FX = { usdVnd: 26020, asOf: "2026-09-29", min: 5000, max: 100000 };
    const CURRENCIES = ["vnd", "usd", "both"];
    const MONEY_DEFAULTS = { costCurrency: "both", costUsdVnd: FX.usdVnd, costExtraPct: 0 };
    function moneyOpts(cfg = {}) {
        const rate = Number(cfg.costUsdVnd);
        const extra = Number(cfg.costExtraPct);
        return {
            currency: CURRENCIES.includes(cfg.costCurrency) ? cfg.costCurrency : MONEY_DEFAULTS.costCurrency,
            rate: rate >= FX.min && rate <= FX.max ? rate : FX.usdVnd,
            extraPct: extra > 0 && extra <= 50 ? extra : 0
        };
    }
    // Decimal comma, thousands dot (vi-VN), without depending on the runtime's locale data
    function viNumber(x, digits) {
        const [int, frac] = Math.abs(x).toFixed(digits).split(".");
        return (x < 0 ? "-" : "") + int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (frac ? "," + frac : "");
    }
    // Enough digits that a single call (~0.0005 USD, ~13 đ) never shows as 0
    function formatUsd(usd) {
        const a = Math.abs(usd || 0);
        return `${viNumber(usd || 0, a === 0 ? 0 : a >= 100 ? 0 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4)} USD`;
    }
    function formatVnd(vnd) {
        const a = Math.abs(vnd || 0);
        return `${viNumber(vnd || 0, a === 0 || a >= 100 ? 0 : 1)} đ`;
    }
    // { usd, vnd, text }: text follows the chosen currency; "both" puts đồng first, USD in brackets
    function money(usd, opts) {
        const o = opts && opts.rate ? opts : moneyOpts(opts);
        const billed = (usd || 0) * (1 + o.extraPct / 100);
        const u = formatUsd(billed), v = formatVnd(billed * o.rate);
        return { usd: u, vnd: v, text: o.currency === "usd" ? u : o.currency === "vnd" ? v : `${v} (${u})` };
    }

    // Chế độ sử dụng (tên dễ hiểu cho người dùng)
    //   escalate : cho phép đưa câu khó lên model mạnh
    //   refine   : "strong" dịch lại bằng model mạnh | "cheap" chỉ khi lỗi nặng | "none"
    //   tts      : "gemini" | "system" | "none"
    //   prefetch : số giây tạo audio trước tối đa (thích ứng theo độ trễ)
    // Dubbing never condenses speech: there is no condense code (CLAUDE.md rule 1).
    //   translateAhead: YouTube chỉ dịch trước bấy nhiêu giây quanh vị trí xem
    const MODES = {
        premium: {
            label: "Cao cấp: dịch kỹ + giọng AI",
            desc: "Câu khó được dịch lại bằng model mạnh hơn, lồng tiếng bằng giọng Gemini AI, tạo audio trước tối đa 30 giây.",
            escalate: true, refine: "strong", tts: "gemini", prefetch: 30, translateAhead: 180
        },
        balanced: {
            label: "Cân bằng (khuyên dùng)",
            desc: "Model rẻ cho mọi câu, chỉ dịch lại khi lỗi nặng; giọng Gemini AI; tạo audio trước ít hơn.",
            escalate: false, refine: "cheap", tts: "gemini", prefetch: 18, translateAhead: 120
        },
        economy: {
            label: "Tiết kiệm: giọng miễn phí trên máy",
            desc: "Model rẻ, không dịch lại; lồng tiếng bằng giọng Việt chạy trên máy (VieNeu nếu đang bật, không thì giọng hệ thống), không tốn phí TTS.",
            escalate: false, refine: "none", tts: "local", prefetch: 18, translateAhead: 90
        },
        subtitles: {
            label: "Chỉ phụ đề",
            desc: "Chỉ dịch phụ đề bằng model rẻ, tắt lồng tiếng.",
            escalate: false, refine: "none", tts: "none", prefetch: 0, translateAhead: 90
        }
    };

    function getMode(name) {
        return MODES[name] ? { id: name, ...MODES[name] } : { id: "balanced", ...MODES.balanced };
    }

    // ---------------- Định tuyến độ khó (tất định, rẻ) ----------------
    const PRONOUN_RE = /\b(?:it|its|this|that|these|those|they|them|their|he|she|one)\b/gi;
    const START_REF_RE = /^\s*(?:it|this|that|these|those|they|he|she|which|so|and|but|because|or)\b/i;
    const SUBORD_RE = /\b(?:which|whereas|although|though|unless|whereby|provided that|given that|in which|such that|so that|even if|whether)\b/gi;
    const IDIOM_RE = /\b(?:piece of cake|bottom line|rule of thumb|under the hood|low[- ]hanging fruit|on the fly|out of the box|at the end of the day|in a nutshell|boils? down to|come into play|ballpark|sanity check|big picture|get rid of|figure (?:it )?out|come up with|end up|turn(?:s|ed)? out|kind of|sort of|go ahead and|wrap up|build on|run into|look into|point out|carry out|break down|set up|go over|go through|walk (?:you )?through|pay off|kick off|roll out|keep track of|bear in mind|that said|that being said|as a matter of fact)\b/gi;

    // req: { sentences:[...], context:{senseHints, phraseHints, ...}, placeholders:[...] }
    // Trả về { score, reasons, tier: "cheap" | "strong" }
    function routeDifficulty(req, opts = {}) {
        const text = (req.sentences || []).join(" ");
        const reasons = [];
        let score = 0;
        const add = (n, why) => { score += n; reasons.push(why); };

        const longest = Math.max(0, ...(req.sentences || []).map(s => s.length));
        if (text.length > 320) add(1, "đoạn dài");
        if (longest > 180) add(1, "câu rất dài");

        const pronouns = (text.match(PRONOUN_RE) || []).length;
        const words = (text.match(/[A-Za-z']+/g) || []).length || 1;
        if (pronouns >= 3 && pronouns / words > 0.08) add(1, "nhiều đại từ");
        // Câu ngắn phụ thuộc ngữ cảnh: "It does.", "That's why." , mảnh câu
        for (const s of req.sentences || []) {
            const w = (s.match(/[A-Za-z']+/g) || []).length;
            if (w > 0 && w <= 5 && START_REF_RE.test(s)) { add(1, "câu ngắn phụ thuộc ngữ cảnh"); break; }
        }

        const idioms = (text.match(IDIOM_RE) || []).length;
        if (idioms >= 1) add(Math.min(2, idioms), "thành ngữ / cụm động từ");

        const subord = (text.match(SUBORD_RE) || []).length;
        const commas = (text.match(/,/g) || []).length;
        if (subord >= 2 || (subord >= 1 && commas >= 3)) add(1, "câu nhiều mệnh đề");

        const senses = (req.context && req.context.senseHints) ? req.context.senseHints.length : 0;
        if (senses >= 3) add(1, "nhiều từ đa nghĩa");
        if ((req.placeholders || []).length >= 3) add(1, "dày thuật ngữ");

        // Phụ đề tự động không dấu câu, dài: khó hiểu cấu trúc
        if (text.length > 150 && !/[.!?]/.test(text) && text === text.toLowerCase()) add(1, "phụ đề tự động không dấu câu");

        const threshold = opts.threshold || 3;
        return { score, reasons, tier: score >= threshold ? "strong" : "cheap" };
    }

    // "Mỹ Duyên (nữ, đọc truyện, nói chậm)": the measured pace helps pick a voice for a dense talk
    function voiceLabel(v) {
        if (!v) return "";
        const pace = !v.sps ? "" : v.sps < 4.4 ? ", nói chậm" : v.sps > 5.2 ? ", nói nhanh" : ", nói vừa";
        return `${v.id} (${String(v.gender || "").toLowerCase()}, ${v.style}${pace})`;
    }

    // Paid voice (Gemini TTS) switched off by the user on 2026-09-27: dubbing uses the free local
    // VieNeu voice only. The Gemini TTS code stays (tested), but nothing reaches it: dubbing.js never
    // creates the provider, the service worker refuses a non-local synthesizeSpeech, Settings offers
    // VieNeu only. Set true to bring the paid voice back, and with it three known costs closed while
    // it is off (git: BACKLOG 11, 13, 28): a refined line is voiced twice, the Settings preview is not
    // cached, a name split over two translation groups stays two takes.
    const PAID_TTS = false;

    const api = {
        voiceLabel, PAID_TTS,
        TRANSLATION_MODELS, TTS_MODELS, LOCAL_TTS, DEFAULT_MODELS, RETIRED_MODELS, MODELS_VERSION, AUTO, AUTO_CANDIDATES, AUDIO_TOKENS_PER_SEC,
        findModel, modelLabel, costRank, thinkingLevelFor, modelChain, migrateModelSettings, afterShutdown, liveModel,
        estimateTextCost, estimateTtsCost, BUDGET_DEFAULTS, priceOf, PRICE_UNKNOWN, PRICES_CHECKED, PRICING_URL,
        FX, CURRENCIES, MONEY_DEFAULTS, moneyOpts, formatUsd, formatVnd, money,
        MODES, getMode, routeDifficulty
    };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_COST = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

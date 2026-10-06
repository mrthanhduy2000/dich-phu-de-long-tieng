// ============================================================
// NHẬN DIỆN NGÔN NGỮ PHỤ ĐỀ NGAY TRÊN MÁY (không gọi Gemini chỉ để nhận diện)
//
// Thứ tự tin cậy:
//   1. thông tin của chính track phụ đề (mã ngôn ngữ YouTube / thuộc tính srclang)
//   2. thông tin trang / video đáng tin (ví dụ track phụ đề tự động = ngôn ngữ đang nói)
//   3. nhận diện từ mẫu nội dung phụ đề (chữ viết + từ thông dụng)
// Nếu mẫu nội dung chắc chắn MÂU THUẪN với thông tin track (track gắn nhãn sai) thì tin mẫu.
// Độ tin cậy thấp -> KHÔNG tự động dịch (người dùng vẫn bấm dịch tay được).
// ============================================================
(function (root) {
    "use strict";

    // Chữ cái chỉ tiếng Việt dùng (loại á à é è... vì tiếng Pháp/Tây Ban Nha/Bồ Đào Nha cũng có).
    // Not ã (Portuguese "não", "então") nor ă (Romanian "să"): with them a Portuguese lecture read as
    // Vietnamese at 0.94 and was skipped, every line returned untranslated
    const VI_ONLY = /[đơưạảằắẳẵặầấẩẫậẹẻẽềếểễệỉĩịọỏồốổỗộờớởỡợụủừứửữựỳỷỹỵ]/gi;
    const SCRIPTS = [
        ["ko", /[가-힯ᄀ-ᇿ㄰-㆏]/g],
        ["ja", /[぀-ヿ]/g],
        ["zh", /[一-鿿]/g],
        ["ru", /[Ѐ-ӿ]/g],
        ["th", /[฀-๿]/g],
        ["ar", /[؀-ۿ]/g],
        ["he", /[֐-׿]/g],
        ["hi", /[ऀ-ॿ]/g]
    ];
    const STOP = {
        en: "the and of to is that it you we this in for are with on be have as not but they what can so if or at by from your there will just about one all do an was which how when our",
        es: "el la de que y en los se del las un por con no una para es lo como pero sus al más esto muy también",
        fr: "le la les de des et est un une que qui dans pour pas ce il vous nous sur avec plus ne au du",
        de: "der die das und ist nicht ein eine zu den mit sich auch auf für es wir sie ich dem von",
        pt: "o a os de que e do da em um para é com não uma se na no mais as dos como mas",
        id: "yang dan di ini itu dengan untuk tidak dari dalam ada akan kita saya juga ke bisa kami",
        it: "il di che e la per un non sono una le del della si con ma anche questo come",
        vi: "va la cua nhung khong duoc cac mot trong nay cho voi thi da se nguoi chung toi ban"
    };
    const STOP_SETS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(" "))]));

    // "en-US", "en", "a.en" (YouTube tự động), "zh-Hans", "iw" (mã cũ của tiếng Do Thái)
    function normCode(code) {
        const c = String(code || "").trim().toLowerCase().replace(/^a\./, "");
        if (!c) return "";
        const base = c.split(/[-_]/)[0];
        return { iw: "he", in: "id", jw: "jv", fil: "tl" }[base] || base;
    }

    function detectText(text) {
        const t = String(text || "").replace(/\[[^\]]*\]|\([^)]*\)|https?:\S+|\d+/g, " ");
        const letters = (t.match(/\p{L}/gu) || []).length;
        if (letters < 20) return { lang: "unknown", confidence: 0 };
        for (const [lang, re] of SCRIPTS) {
            const n = (t.match(re) || []).length;
            const ratio = n / letters;
            // Tiếng Nhật dùng cả chữ Hán: chỉ cần có kana là tiếng Nhật
            if (lang === "ja" && ratio > 0.08) return { lang, confidence: Math.min(0.98, 0.75 + ratio) };
            if (lang !== "ja" && ratio > 0.3) return { lang, confidence: Math.min(0.98, 0.6 + ratio * 0.4) };
        }
        const vi = (t.match(VI_ONLY) || []).length / letters;
        if (vi > 0.025) return { lang: "vi", confidence: Math.min(0.99, 0.75 + vi * 4) };
        const words = t.toLowerCase().match(/\p{L}+/gu) || [];
        if (words.length < 5) return { lang: "unknown", confidence: 0 };
        const scores = Object.entries(STOP_SETS)
            .map(([lang, set]) => [lang, words.filter(w => set.has(w)).length / words.length])
            .sort((a, b) => b[1] - a[1]);
        const [best, second] = scores;
        if (best[1] < 0.08) return { lang: "unknown", confidence: 0.2 };
        const margin = best[1] - second[1];
        const confidence = Math.max(0, Math.min(0.97, 0.35 + best[1] * 1.2 + margin * 1.5));
        return { lang: best[0], confidence };
    }

    // meta: mã ngôn ngữ của track / video; sample: vài chục dòng phụ đề
    // Trả về { lang, confidence, source, action: "translate" | "skip" | "unsure" }
    function decide({ metaLang, sample, minConfidence = 0.7 } = {}) {
        const meta = normCode(metaLang);
        const det = sample ? detectText(sample) : null;
        let lang = "unknown", confidence = 0, source = "none";
        if (meta && det && det.lang !== "unknown" && det.lang !== meta && det.confidence >= 0.85) {
            lang = det.lang; confidence = det.confidence; source = "sample";          // track gắn nhãn sai
        } else if (meta) {
            lang = meta; confidence = det && det.lang === meta ? 0.98 : 0.9; source = "metadata";
        } else if (det) {
            lang = det.lang; confidence = det.confidence; source = "sample";
        }
        let action = "translate";
        if (lang === "vi" && confidence >= 0.5) action = "skip";                     // tiếng Việt: không dịch
        else if (lang === "unknown" || confidence < minConfidence) action = "unsure";
        return { lang, confidence, source, action };
    }

    // The language actually SPOKEN in a YouTube video, from the strongest signal available:
    //   1. the original (not auto-dubbed) audio track the player reports       -> "audio"
    //   2. the one auto-caption (ASR) track = YouTube's own reading of speech   -> "asr"
    //      several ASR tracks (one per AI-dubbed audio): the one whose language is not a dub,
    //      else the one matching the title's language                             -> "asr+title"
    //   3. no ASR at all: a title + description written in Vietnamese, unless it says the video is
    //      a translation ("Vietsub", "thuyết minh", ...)                           -> "title"
    // Measured 2026-09-26 on 3lY0eRQhYkY (Vietnamese news): audio "vi.4" original + "en-US.10"
    // auto-dubbed, and the English ASR of the dub listed FIRST, which made the old "first ASR track"
    // rule call the video English and translate YouTube's English dub back into Vietnamese.
    const TRANSLATED_MARK = /vietsub|viet\s*sub|thuy[eế]t\s*minh|l[oồ]ng\s*ti[eế]ng|ph[uụ]\s*đ[eề]\s*vi[eệ]t|engsub|eng\s*sub/i;
    function spokenLanguage({ audio, tracks, title, description } = {}) {
        const a = audio || {};
        if (a.original) return { lang: normCode(a.original), confidence: 0.97, source: "audio" };
        const list = tracks || [];
        const dubbed = new Set((a.tracks || []).filter(t => t.isAutoDubbed).map(t => normCode(t.lang)));
        const asr = list.filter(t => t.kind === "asr");
        const meta = [title, description].filter(Boolean).join(" ");
        const titleDet = meta && !TRANSLATED_MARK.test(meta) ? detectText(meta) : { lang: "unknown", confidence: 0 };
        if (asr.length === 1) return { lang: normCode(asr[0].languageCode), confidence: 0.95, source: "asr" };
        if (asr.length > 1) {
            const notDub = asr.filter(t => !dubbed.has(normCode(t.languageCode)));
            if (notDub.length === 1 && dubbed.size) return { lang: normCode(notDub[0].languageCode), confidence: 0.93, source: "asr" };
            const byTitle = titleDet.confidence >= 0.8 && asr.find(t => normCode(t.languageCode) === titleDet.lang);
            if (byTitle) return { lang: titleDet.lang, confidence: 0.85, source: "asr+title" };
            return { lang: normCode(asr[0].languageCode), confidence: 0.5, source: "asr" };
        }
        if (titleDet.lang === "vi" && titleDet.confidence >= 0.9) return { lang: "vi", confidence: 0.8, source: "title" };
        return { lang: "unknown", confidence: 0, source: "none" };
    }

    // The viewer is listening to YouTube's own AI dub in Vietnamese (the original is another
    // language): they already hear Vietnamese, so our subtitles and our voice would only double it.
    function hearsVietnameseDub(audio) {
        return !!(audio && audio.currentDubbed && normCode(audio.current) === "vi" && normCode(audio.original) !== "vi");
    }

    const api = { normCode, detectText, decide, spokenLanguage, hearsVietnameseDub, TRANSLATED_MARK };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_LANG = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

// ============================================================
// LẬP KẾ HOẠCH LỒNG TIẾNG (DUB SCRIPT + PROSODY/SPEECH PLAN)
//
// SOURCE AUDIO/TIMING -> CONTEXT-AWARE TRANSLATION (đã có)
//   -> DUB SCRIPT      : chia bản dịch thành các ĐOẠN NÓI liên tục theo nhịp
//                        lời gốc (không phải theo từng cue phụ đề)
//   -> SPEECH ADAPT    : chuyển văn bản sang dạng dễ đọc thành tiếng (số, ký
//                        hiệu, ngoặc) mà KHÔNG đổi nghĩa
//   -> PROSODY PLAN    : cụm ngắt nghỉ, khoảng dừng, nhấn giọng, cao độ, tốc độ,
//                        ý định câu (hỏi, cảnh báo, kết luận...)
//   -> TIMING FIT      : estimated vs original duration; strategies are rate, pause
//                        compression, running into the silence after, audio stretch.
//                        The words are never shortened ("needs-condense" only marks
//                        an overflow the engine absorbs by chaining).
// Module thuần, không đụng DOM: chạy được trong trình duyệt và Node (kiểm thử).
// ============================================================
(function (root) {
    "use strict";

    const SEG = (root && root.CST_VI_SEG) ||
        (typeof require === "function" ? require("./vi-segmenter.js") : null);

    // ---------------- Đọc số tiếng Việt ----------------
    const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

    function readTriple(n, full) {
        const h = Math.floor(n / 100);
        const t = Math.floor((n % 100) / 10);
        const u = n % 10;
        const out = [];
        if (h > 0 || full) out.push(DIGITS[h], "trăm");
        if (t === 0) {
            if (u > 0 && (h > 0 || full)) out.push("linh");
        } else if (t === 1) {
            out.push("mười");
        } else {
            out.push(DIGITS[t], "mươi");
        }
        if (u > 0) {
            if (u === 1 && t >= 2) out.push("mốt");
            else if (u === 5 && t >= 1) out.push("lăm");
            else if (u === 4 && t >= 2) out.push("tư");
            else out.push(DIGITS[u]);
        }
        return out;
    }

    // 175 -> "một trăm bảy mươi lăm"; 2024 -> "hai nghìn không trăm hai mươi tư"
    function numberToVietnamese(num) {
        let n = Math.floor(Math.abs(Number(num)));
        if (!Number.isFinite(n)) return String(num);
        if (n === 0) return "không";
        const units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
        const groups = [];
        while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
        const words = [];
        for (let i = groups.length - 1; i >= 0; i--) {
            const g = groups[i];
            if (g === 0) continue;
            const full = i < groups.length - 1;
            words.push(...readTriple(g, full));
            // 1.800.000.000.000 -> "một nghìn tám trăm tỷ" (không lặp "tỷ")
            const unit = i === 4 && groups[3] > 0 ? "nghìn" : units[i];
            if (unit) words.push(unit);
        }
        return (num < 0 ? "âm " : "") + words.join(" ");
    }

    // ---------------- Đếm âm tiết (để ước lượng thời lượng nói) ----------------
    function englishSyllables(w) {
        const s = w.toLowerCase().replace(/[^a-z]/g, "");
        if (!s) return 0;
        let groups = (s.match(/[aeiouy]+/g) || []).length;
        if (s.length > 3 && /[^aeiouy]e$/.test(s) && !/le$/.test(s)) groups--;
        return Math.max(1, groups);
    }

    // Pure function of the word, asked for the same words on every plan rebuild: memoised
    const sylCountMemo = new Map();
    function tokenSyllables(raw) {
        const key = String(raw);
        let n = sylCountMemo.get(key);
        if (n === undefined) {
            n = countTokenSyllables(key);
            if (sylCountMemo.size >= 20000) sylCountMemo.clear();
            sylCountMemo.set(key, n);
        }
        return n;
    }

    function countTokenSyllables(raw) {
        const t = String(raw).replace(/^[^\p{L}\p{N}%]+|[^\p{L}\p{N}%]+$/gu, "");
        if (!t) return 0;
        if (/^\d+(?:[.,]\d+)?%?$/.test(t)) {
            const [intPart, dec] = t.replace("%", "").split(/[.,]/);
            let n = numberToVietnamese(Number(intPart)).split(" ").length;
            if (dec) n += 1 + dec.length;                 // "phẩy" + từng chữ số
            if (t.endsWith("%")) n += 2;                  // "phần trăm"
            return n;
        }
        if (/^[A-Z0-9]{2,6}$/.test(t)) return t.length;   // viết tắt đọc từng chữ: GPU
        const parts = t.split("-");
        let n = 0;
        for (const p of parts) {
            if (!p) continue;
            if (SEG && SEG.isVietWord(p.toLowerCase())) n += 1;
            else if (/^\d+$/.test(p)) n += numberToVietnamese(Number(p)).split(" ").length;
            else n += englishSyllables(p);
        }
        return n;
    }

    function countSyllables(text) {
        return String(text || "").split(/\s+/).filter(Boolean).reduce((a, w) => a + tokenSyllables(w), 0);
    }

    // ---------------- A number: version or quantity (1.8.0) ----------------
    // One parser for every place that must tell them apart (adaptForSpeech here, the model-number
    // rule in dub-speech.js), not a rule per model. What follows wins over what precedes: a unit of
    // measure after the number makes it an amount ("CPU 3.5 GHz", "GPU 2.5 GB", "RAM 4096 MB"); then a
    // section word or a product name before it makes it a version ("phiên bản 3.5", "Python 3.12",
    // "iOS 18.2"); anything else is an amount ("Trong 3.5 giây", "2,5 kg"). Only units that never start
    // a phrase of their own count: "Python 3.12 năm ngoái" is still a version.
    const MEASURE_UNITS = new Set(("% gb mb kb tb pb gib mib ghz mhz khz hz ms km cm mm nm kg mg ml kw kwh mah fps px dpi bpm " +
        "kcal °c °f inch lít mét giây tflops gbps mbps w v").split(" "));
    const SECTION_WORDS = /^(?:phiên bản|version|mục|chương|phần|bài|điều|khoản)$/i;
    function numberRole(before, after) {
        const unit = String(after || "").trim().split(/\s+/)[0].toLowerCase().replace(/[.,;:!?…)"”]+$/, "");
        if (unit && MEASURE_UNITS.has(unit)) return "quantity";
        const w = String(before || "").trim();
        if (SECTION_WORDS.test(w)) return "version";
        if (/^(?=[a-z]*[A-Z])[A-Za-z]+$/.test(w) && !(SEG && SEG.isVietWord && SEG.isVietWord(w.toLowerCase()))) return "version";
        return "quantity";
    }

    // ---------------- Chuyển văn bản sang dạng dễ đọc thành tiếng ----------------
    // Chỉ đổi CÁCH VIẾT, không đổi nghĩa: ký hiệu, số thập phân, ngoặc đơn.
    function adaptForSpeech(text) {
        let t = SEG ? SEG.cleanText(text, { keepHints: true }) : String(text || "");
        // Every rule below was checked against the VieNeu server's own normalizer (sea_g2p), by
        // reading back what it actually says. See tests/dub.test.js "speech text".
        // Web addresses: without this the scheme is spelled out letter by letter ("hát tê tê phê")
        t = t.replace(/\bhttps?:\/\/(?:www\.)?/gi, "").replace(/\bwww\./gi, "");
        // Only real domain endings, lower case: "TP.HCM" or "v.v." must stay as they are
        t = t.replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|ai|io|dev|edu|gov|vn|co|app|me|info|so|gg|tv|ly|us|uk)\b(?:\/[\w\-./]*[\w\-/])?/g,
            m => m.replace(/\//g, " gạch chéo ").replace(/\./g, " chấm ").replace(/\s+/g, " ").trim());
        // $20 -> "20 đô la" (read as "hai mươi u s d" otherwise); 5 USD -> "5 đô la"
        t = t.replace(/(?:US)?\$\s?(\d[\d.,]*)(\s?(?:[KMB]|nghìn|ngàn|triệu|tỷ)\b)?/g, (m0, n, mag) => `${n}${mag || ""} đô la`);
        t = t.replace(/(\d)\s?USD\b/g, "$1 đô la");
        t = t.replace(/(\d)\s*%/g, "$1 phần trăm");
        // 7B / 200K / 1.5M after a number: "7 tỷ", "200 nghìn", "1.5 triệu" (not "bảy bê", "hai trăm ca")
        t = t.replace(/\b(\d+(?:[.,]\d+)?)\s?([KMB])\b/g, (m0, n, u) => `${n} ${{ K: "nghìn", M: "triệu", B: "tỷ" }[u]}`);
        // Grouped thousands, Vietnamese 1.500.000 or English 1,500,000: say it in words. The old code
        // stripped the dots to 1500000, and the server reads 7+ digit runs one digit at a time
        // ("một năm không không không không không"); an English 1,000 came out as "một".
        t = t.replace(/\b\d{1,3}(?:\.\d{3})+(?![.,]?\d)|\b\d{1,3}(?:,\d{3})+(?![.,]?\d)/g, m => numberToVietnamese(Number(m.replace(/[.,]/g, ""))));
        t = t.replace(/\b\d{7,}\b/g, m => numberToVietnamese(Number(m)));
        // A hyphenated identifier with a number in it is one name, not a range: "GPT-5.6",
        // "Llama-3.3-70B", "COVID-19", a model id with a version inside. The server says the hyphen
        // ("gạch ngang", "dash") and reads the dot as a decimal ("phẩy"): split into words, dots "chấm".
        t = t.replace(/(?<![\p{L}\p{N}.\/@_-])[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+(?:\.\d+)*)+(?![\p{L}\p{N}\/@_-]|\.\d)/gu,
            m => /\d/.test(m) ? m.split("-").map(p => p.replace(/(\d)\.(?=\d)/g, "$1 chấm ")).join(" ") : m);
        // A version or a section number is read with "chấm": Python 3.11, Claude 3.5, phiên bản 2.0, mục 3.4
        t = t.replace(/(?:\b(phiên bản)\s+)?\bv(\d+(?:\.\d+)+)\b/gi, (m0, pre, v) => `${pre || "phiên bản"} ${v.split(".").join(" chấm ")}`);
        // 127.0.0.1, 1.2.3: three or more parts is never a decimal
        t = t.replace(/\b\d+(?:\.\d+){2,}\b/g, m => m.split(".").join(" chấm "));
        // A capitalised word counts only if it is not Vietnamese: "Trong 3.5 giây" is a decimal
        // (1.8.0: through numberRole, so a unit after it keeps it an amount: "CPU 3.5 GHz")
        t = t.replace(/(?<![\p{L}\p{N}])([A-Za-zÀ-ỹĐđ]+(?: bản)?)(\s)(\d+)\.(\d+)(?![.,]?\d)/gu, (m0, w, sp, a, b, at, all) =>
            numberRole(w, all.slice(at + m0.length)) === "version" ? `${w}${sp}${a} chấm ${b}` : m0);
        // 2x, 1,3x -> "2 lần", "1,3 lần" ("hai ích" otherwise). Algebra like 2x - 1 or 2x = 4 is left alone
        t = t.replace(/\b(\d+(?:[.,]\d+)?)[x×](?![\p{L}\d])(?!\s*[-+*/=^<>])/gu, "$1 lần");
        // 1,4 / 3.5 -> "1 phẩy 4" (thập phân 1 đến 2 chữ số)
        t = t.replace(/\b(\d+)[.,](\d{1,2})\b/g, "$1 phẩy $2");
        // 1st, 2nd, 3rd, 4th -> thứ nhất, thứ hai, thứ ba, thứ tư ("một st" otherwise)
        const ORD = { 1: "thứ nhất", 2: "thứ hai", 3: "thứ ba", 4: "thứ tư" };
        t = t.replace(/\b(\d+)(?:st|nd|rd|th)\b/gi, (m0, n) => ORD[n] || `thứ ${n}`);
        // 1990s -> "thập niên 1990" (the server reads the s as "giây"); "những năm 1990s" -> "những năm 1990"
        t = t.replace(/\b(những năm|thập niên)\s+(\d{2,4})'?s\b/gi, "$1 $2");
        t = t.replace(/(?<![\p{L}])([Nn])ăm\s+(\d{4})'?s\b/gu, (m0, n, y) => `${n === "N" ? "Những" : "những"} năm ${y}`);
        t = t.replace(/\b(\d{2}|\d{3}0)'?s\b/g, "thập niên $1");
        // #1 -> "số 1" ("thăng một" otherwise)
        t = t.replace(/#(\d+)/g, "số $1");

        t = t.replace(/(\d)\s*[x×]\s*(\d)/g, "$1 nhân $2");
        t = t.replace(/\s=\s|(?<=\w)=(?=\w)/g, " bằng ");
        t = t.replace(/\s\+\s/g, " cộng ");
        t = t.replace(/\s*(?:->|→|=>)\s*/g, " thành ");
        t = t.replace(/\s&\s/g, " và ");
        // Đơn vị đo đọc như người Việt nói: "60 km/h" -> "60 ki-lô-mét trên giờ"
        const UNIT_SAY = { km: "ki-lô-mét", m: "mét", cm: "xen-ti-mét", mm: "mi-li-mét", kg: "ki-lô-gam", g: "gam", h: "giờ", s: "giây", ms: "mi-li-giây", min: "phút" };
        t = t.replace(/(\d)\s*(km|m|cm|kg|g)\/(h|s|min)\b/gi, (m0, d, u1, u2) => `${d} ${UNIT_SAY[u1.toLowerCase()]} trên ${UNIT_SAY[u2.toLowerCase()]}`);
        t = t.replace(/(\d)\s*(km|cm|mm|kg|ms)\b/g, (m0, d, u) => `${d} ${UNIT_SAY[u]}`);
        t = t.replace(/\be\.g\.,?/gi, "ví dụ,").replace(/\bi\.e\.,?/gi, "tức là,");
        t = t.replace(/(ví dụ|tức là),\s+\1(?![\p{L}])/giu, "$1");   // "e.g. ví dụ" said the same words twice
        // Ngoặc đơn: đọc như chú thích, ngắt nghỉ nhẹ hai bên
        t = t.replace(/\s*\(([^()]{1,80})\)\s*/g, ", $1, ");
        t = t.replace(/["“”«»]/g, "");
        t = t.replace(/^\s*[-–—]\s+/, "");
        t = t.replace(/\s*,\s*,/g, ",").replace(/,\s*([.!?])/g, "$1");
        return t.replace(/\s{2,}/g, " ").trim();
    }

    // ---------------- Nhận diện ý định câu (quyết định giọng điệu) ----------------
    const INTENT_RULES = [
        ["question", /\?\s*$/],
        ["warning", /\b(?:careful|be careful|warning|watch out|never|don'?t|do not|avoid|beware|make sure not|dangerous|mistake)\b/i],
        ["conclusion", /\b(?:in summary|to summarize|to sum up|in conclusion|that'?s (?:it|all)|finally|to wrap up|overall|in short|so that'?s)\b/i],
        ["humor", /\b(?:haha|lol|just kidding|joke|funny)\b|\[(?:laughter|laughs)\]/i],
        ["excited", /\b(?:amazing|awesome|incredible|exciting|wow|fantastic|super cool|love this)\b/i],
        ["emphasis", /\b(?:important|crucial|key (?:idea|point|insight)|remember|note that|notice|essential|critical|really matters|pay attention)\b/i],
        ["explanation", /\b(?:because|which means|this means|that is|in other words|the reason|so that|here'?s how|for example|for instance)\b/i],
        ["transition", /^\s*(?:now|so|okay|ok|alright|all right|next|well|first|second|then|let'?s)\b/i]
    ];

    function classifyIntent(en, vi) {
        const e = String(en || "");
        const v = String(vi || "");
        if (/\?\s*$/.test(v) || /\?\s*$/.test(e)) {
            return { type: "question", short: countSyllables(v) <= 4 };
        }
        if (/!\s*$/.test(e) || /!\s*$/.test(v)) {
            return { type: /\b(?:don'?t|never|careful|stop)\b/i.test(e) ? "warning" : "excited", short: countSyllables(v) <= 4 };
        }
        for (const [type, re] of INTENT_RULES) if (re.test(e)) return { type, short: false };
        if (/\b(?:quan trọng|cần nhớ|lưu ý|chú ý|then chốt|cốt lõi)/i.test(v)) return { type: "emphasis", short: false };
        if (/^\s*(?:tóm lại|kết luận|cuối cùng|nói tóm lại)/i.test(v)) return { type: "conclusion", short: false };
        return { type: "neutral", short: false };
    }

    // Tham số giọng theo ý định. Cao độ/tốc độ là HỆ SỐ nhân quanh giọng nền
    // của người nói (không reset), đủ nhẹ để không nghe "diễn".
    const INTENT_PROSODY = {
        neutral:     { rate: 1.00, pitch: 1.00, endPitch: 1.00, endPause: 0.34, style: "giọng kể, tự nhiên" },
        explanation: { rate: 0.98, pitch: 1.00, endPitch: 0.99, endPause: 0.36, style: "giọng giảng giải, rõ ràng, từ tốn" },
        transition:  { rate: 1.00, pitch: 1.01, endPitch: 1.00, endPause: 0.30, style: "giọng dẫn dắt, chuyển ý" },
        question:    { rate: 0.97, pitch: 1.02, endPitch: 1.12, endPause: 0.45, style: "giọng hỏi, lên giọng ở cuối câu" },
        excited:     { rate: 1.05, pitch: 1.07, endPitch: 1.04, endPause: 0.36, style: "giọng hào hứng, tươi" },
        emphasis:    { rate: 0.95, pitch: 1.03, endPitch: 1.00, endPause: 0.42, style: "giọng chắc, nhấn vào ý chính" },
        warning:     { rate: 0.94, pitch: 0.97, endPitch: 0.96, endPause: 0.42, style: "giọng nghiêm, cảnh báo nhẹ" },
        humor:       { rate: 1.04, pitch: 1.05, endPitch: 1.03, endPause: 0.40, style: "giọng vui, hóm hỉnh" },
        conclusion:  { rate: 0.95, pitch: 0.99, endPitch: 0.95, endPause: 0.50, style: "giọng kết luận, chậm lại ở cuối" }
    };

    const EMPHASIS_VI = /(?:rất|cực kỳ|vô cùng|quan trọng|then chốt|cốt lõi|chính là|không bao giờ|luôn luôn|tuyệt đối|đặc biệt|phải nhớ|lưu ý|chú ý|duy nhất|hoàn toàn)/i;
    const OPENERS_EN = /^\s*(now|so|okay|ok|alright|all right|well|right|anyway|first|next|then|um+|uh+)\b[,.…]*/i;
    const OPENERS_VI = /^\s*((?:bây giờ|giờ thì|giờ|vậy thì|vậy|được rồi|rồi|nào|đầu tiên|tiếp theo|thứ nhất|thứ hai|sau đó|thế thì|thế|ừm|à)[,.…]?)(\s+)/i;

    // ---------------- Mô hình thời lượng nói ----------------
    // Hiệu chỉnh bằng 120 mẫu giọng tiếng Việt thật (macOS "Linh", cũng là giọng
    // Chrome dùng), 20 câu x 6 tốc độ từ 1.0 đến 2.2: sai số trung bình 3,3%,
    // không mức nào quá 5% (xem tests/tools-fit-voice.js).
    const DEFAULT_VOICE_MODEL = {
        sylPerSec: 3.45,     // âm tiết/giây ở tốc độ 1.0 (chưa tính khoảng dừng)
        rateExp: 0.85,       // thời lượng ~ 1 / rate^rateExp
        rateCurve: 0,        // độ "bão hòa" khi tăng tốc (giọng Linh: không có)
        overhead: 0.1,       // độ trễ khởi đầu/kết thúc mỗi lần phát (giây)
        pauseFactor: 1.8,    // khoảng dừng thực tế so với bảng PAUSE
        calibration: 1.0     // hệ số tự hiệu chỉnh khi đo thời lượng thật lúc phát
    };

    function pauseSeconds(p, rate, model) {
        const m = model || DEFAULT_VOICE_MODEL;
        return p * (m.pauseFactor || 1) / speedMultiplier(rate, m) * (m.calibration || 1);
    }

    // Hệ số tăng tốc thực tế: rate^(e - c*ln(rate)). c > 0 mô tả việc giọng
    // "bão hòa": đẩy tốc độ cao thì câu không ngắn đi tương ứng.
    function speedMultiplier(rate, m) {
        const r = Math.max(0.3, rate);
        return Math.pow(r, m.rateExp - (m.rateCurve || 0) * Math.log(r));
    }

    function speechSeconds(syl, rate, model) {
        const m = model || DEFAULT_VOICE_MODEL;
        return (syl / m.sylPerSec) / speedMultiplier(rate, m) * (m.calibration || 1);
    }

    // ---------------- Cụm ngắt nghỉ trong một đoạn nói ----------------
    const PAUSE = { hint: 0.10, comma: 0.20, semicolon: 0.28, colon: 0.26, period: 0.36, question: 0.40, exclaim: 0.38, ellipsis: 0.48, opener: 0.30, breath: 0.07 };

    function punctPause(trail) {
        if (!trail) return 0;
        if (/…|\.\.\./.test(trail)) return PAUSE.ellipsis;
        if (/\?/.test(trail)) return PAUSE.question;
        if (/!/.test(trail)) return PAUSE.exclaim;
        if (/\./.test(trail)) return PAUSE.period;
        if (/;/.test(trail)) return PAUSE.semicolon;
        if (/:/.test(trail)) return PAUSE.colon;
        if (/,/.test(trail)) return PAUSE.comma;
        return 0;
    }

    // Chia đoạn nói thành cụm (phrase) tại dấu câu, gợi ý ¦ của Gemini, khoảng
    // ngừng thật trong lời gốc, và "chỗ lấy hơi" khi cụm quá dài.
    // Memoised on (text, source pauses): every plan rebuild asks again for the same segments, and the
    // tokenize + analyze inside was most of a rebuild's cost. Callers get fresh copies to mutate.
    const phraseMemo = new Map();
    function buildPhrases(speechText, opts = {}) {
        const key = speechText + "\u0001" + JSON.stringify(opts.sourcePauses || []);
        let hit = phraseMemo.get(key);
        if (!hit) {
            hit = buildPhrasesUncached(speechText, opts);
            if (phraseMemo.size >= 3000) phraseMemo.clear();
            phraseMemo.set(key, hit);
        }
        return hit.map(ph => ({ ...ph }));
    }

    function buildPhrasesUncached(speechText, opts = {}) {
        if (!SEG) return [{ text: speechText, syl: countSyllables(speechText), pauseAfter: 0 }];
        const tokens = SEG.tokenize(speechText);
        if (!tokens.length) return [];
        const { gap } = SEG.analyze(tokens);
        const breaks = new Map(); // chỉ số token bắt đầu cụm mới -> {pause, kind}
        for (let i = 1; i < tokens.length; i++) {
            const p = punctPause(tokens[i - 1].trail);
            if (p > 0) breaks.set(i, { pause: p, kind: "punct" });
            else if (tokens[i].hint) breaks.set(i, { pause: PAUSE.hint, kind: "hint" });
        }
        // Khoảng ngừng thật của người nói (ánh xạ tỷ lệ vị trí) -> tái tạo nhịp
        for (const sp of opts.sourcePauses || []) {
            let best = -1, bestCost = Infinity;
            const total = tokens.length;
            for (let i = 1; i < total; i++) {
                const frac = i / total;
                if (Math.abs(frac - sp.frac) > 0.18) continue;
                const cost = Math.abs(frac - sp.frac) * 200 + (gap[i] || 0) - (breaks.has(i) ? 40 : 0);
                if (cost < bestCost) { bestCost = cost; best = i; }
            }
            if (best > 0 && bestCost < 90) {
                const cur = breaks.get(best);
                const pause = Math.min(0.75, Math.max(cur ? cur.pause : 0.12, sp.dur * 0.85));
                breaks.set(best, { pause, kind: "source" });
            }
        }
        // Chỗ lấy hơi: cụm > 16 âm tiết thì tách ở khe cú pháp tốt nhất
        const starts = [0, ...[...breaks.keys()].sort((a, b) => a - b), tokens.length];
        for (let k = 0; k < starts.length - 1; k++) {
            const a = starts[k], b = starts[k + 1];
            let syl = 0;
            for (let i = a; i < b; i++) syl += tokenSyllables(tokens[i].raw);
            if (syl <= 16 || b - a < 6) continue;
            let best = -1, bestCost = Infinity;
            for (let i = a + 3; i <= b - 3; i++) {
                const mid = Math.abs((i - a) / (b - a) - 0.5) * 60;
                const c = (gap[i] || 0) + mid;
                if (c < bestCost) { bestCost = c; best = i; }
            }
            if (best > 0 && bestCost < 60) breaks.set(best, { pause: PAUSE.breath, kind: "breath" });
        }
        const cut = [0, ...[...breaks.keys()].sort((a, b) => a - b), tokens.length];
        const phrases = [];
        for (let k = 0; k < cut.length - 1; k++) {
            const a = cut[k], b = cut[k + 1];
            const raw = [];
            for (let i = a; i < b; i++) raw.push(tokens[i].raw);
            const text = raw.join(" ");
            const br = breaks.get(b);
            phrases.push({ text, syl: countSyllables(text), pauseAfter: br ? br.pause : 0, breakKind: br ? br.kind : "end" });
        }
        return phrases;
    }

    // ---------------- DUB SCRIPT: đoạn nói liên tục từ các nhóm đã dịch ----------------
    // Đầu vào mỗi nhóm: { start, end, srcCues:[{start,end,text,words}], viText, viCues:[{start,end,text}] }
    // Một đoạn nói = một hoặc nhiều cue phụ đề liền mạch; tách khi lời gốc có
    // khoảng lặng thật (>= 0,55 giây). Cue phụ đề chỉ là mốc thời gian.
    function sourcePausesIn(srcCues, start, end) {
        const pauses = [];
        const span = Math.max(0.01, end - start);
        for (let i = 0; i < srcCues.length; i++) {
            const c = srcCues[i];
            const words = Array.isArray(c.words) ? c.words : null;
            if (words) {
                for (let k = 1; k < words.length; k++) {
                    const g = words[k].t - words[k - 1].t - 0.45; // trừ thời lượng nói trung bình của 1 từ
                    if (g >= 0.25 && words[k].t > start && words[k].t < end) pauses.push({ frac: (words[k].t - start) / span, dur: g });
                }
            }
            const next = srcCues[i + 1];
            if (next) {
                const g = next.start - c.end;
                if (g >= 0.25 && c.end > start && c.end < end) pauses.push({ frac: (c.end - start) / span, dur: g });
            }
            // "Now... / So, um," trong lời gốc: nhịp mở đầu
            if (i === 0 && OPENERS_EN.test(c.text) && /^\s*\S+(?:\s\S+)?\s*(?:,|\.\.\.|…)/.test(c.text)) {
                pauses.push({ frac: 0.06, dur: 0.3, opener: true });
            }
        }
        return pauses;
    }

    // Chú thích ÂM THANH trong phụ đề ("(Vỗ tay)", "(Cười)", "[Nhạc]", "(Laughter)"): hiện trên màn hình
    // nhưng KHÔNG đọc thành lời (đọc lên nghe rất mất tự nhiên). Ngoặc vuông luôn là chú thích; ngoặc
    // đơn chỉ bỏ khi nội dung là tiếng động / phản ứng khán giả (giữ ngoặc giải thích như "AI (trí tuệ
    // nhân tạo)").
    const SOUND_RE = /^(?:(?:tiếng|có tiếng|khán giả)\s+)*(?:cười(?:\s+lớn|\s+ồ)?|vỗ tay(?:\s+và\s+(?:cười|hò reo|reo hò))?|nhạc(?:\s+nền)?|âm nhạc|hò reo|reo hò|ồ lên|xì xào|ồn ào|im lặng|thở dài|huýt sáo|hát|hoan hô|laughter|laughs|laughing|applause|music|cheers|cheering|audience\b.*|silence|sighs?|whistl\w*|inaudible|khán giả)(?:\s*(?:\)|\])?)$/i;
    function stripSoundNotes(text) {
        return String(text || "")
            .replace(/\[[^\]]*\]|[♪♫]+/g, " ")
            .replace(/\(([^()]{1,40})\)/g, (m, inner) => (SOUND_RE.test(inner.replace(/¦/g, "").trim()) ? " " : m))
            .replace(/\s{2,}/g, " ").trim();
    }
    const hasWords = t => /[\p{L}\p{N}]/u.test(String(t || "").replace(/¦/g, ""));

    // A speaker label of edited captions ("ANDREW HUBERMAN: Welcome to...") stays in the translation,
    // so the subtitle still says who speaks, but it is not read: the voice said "Andy Galpin" and
    // "Andrew Huberman" 262 times in one 3-hour podcast (the user's 2026-10-01 batch), each one heard
    // as words of the sentence, on a fast talk that dropped lines for time. Only a label in capitals
    // that the group's own source carries is taken out, where a line or a sentence starts.
    // (a line may end on the label: "... vì-- ANDY GALPIN:"; a hint mark ¦ may stand before it)
    const LABEL_RE = /(^[\s¦]*|[.!?…—–-]["”')\]]*[\s¦]+)(\p{Lu}[\p{Lu}\p{M}.'’-]*(?:\s+\p{Lu}[\p{Lu}\p{M}.'’-]*){0,3}):(?:\s+|$)/gmu;
    function speakerLabels(src) {
        const out = new Set();
        for (const m of String(src || "").matchAll(LABEL_RE)) if (/\p{Lu}{2}/u.test(m[2])) out.add(m[2]);
        return out;
    }
    function stripSpeakerLabels(text, labels) {
        if (!labels || !labels.size) return text;
        return String(text || "").replace(LABEL_RE, (m, lead, name) => (labels.has(name) ? lead : m));
    }

    // ---------------- Who speaks (2.4.8) ----------------
    // The second voice used to switch at every ">>", "- " or "NAME:" that opened a group's first
    // caption line, and nowhere else. Over the user's 46 saved videos that was wrong both ways:
    // - YouTube's recognizer writes ">>" around music and sighs inside one person's talk ("Last-minute
    //   meals, >> [music] >> last-minute shopping"): 82 of the 457 marks, in 7 one-person vlogs, and
    //   a few lone marks in other monologues (2 to 4 a video, minutes apart). One stray mark put the
    //   rest of a one-person video in the other voice: the user turned the second voice off.
    // - Half the real turns sit inside a group (rtAi3qa8UtQ: 57 of 111, "You want hot or ice? >> Uh,
    //   hot."). Never seen, they left the alternation out of step for the rest of the talk.
    // Now every mark of the source is read, with its time (a mark inside a caption line by its share
    // of the line's characters). A mark next to a sound note is no turn. Anonymous marks (">>", "- ")
    // count only in a video that is a conversation: at least TURN_MIN_PAIRED of them answered by
    // another within TURN_PAIR_S (a question and its answer, a reply). Lone marks minutes apart are a
    // monologue. A "NAME:" label counts when the video uses such labels (below). Built from the source alone, over all groups (the
    // translated ones or not), so the voice of a line never changes as the translation fills in.
    const TURN_PAIR_S = 12;
    const TURN_MIN_PAIRED = 4;
    const TURN_MAIN_S = 45;
    const TURN_NOTE = /^\s*(?:(?:\[[^\][]*\]|\((?:music|applause|laughter|laughs|sighs?|inaudible)\)|[♪♫]+)\s*)+$/i;
    // "ANDREW HUBERMAN:", "Dr. Galpin:": up to 4 words, each capitalized (or a name particle). Not a
    // sentence that ends on a colon ("This is even worse: ..."), not a credit ("Translator: Jenny
    // Zurawell" opens every TED talk): in PsihkFWDt3Y those three put 83% of a one-person talk in the
    // other voice. And a label used fewer than TURN_MIN_NAMED times in the whole video is no system.
    const NAMED_RE = /^([A-Z][A-Za-z.'’ -]{0,28}[A-Za-z.]):\s/;
    const NOT_A_NAME = /^(?:Note|Step|Example|Tip|Warning|Q|A|Translator|Reviewer|Transcriber|Transcript|Subtitles?|Captions?|Source|Credits?|Update|Edit|Disclaimer)$/i;
    const NAME_PARTICLE = /^(?:de|da|del|der|di|du|la|le|van|von|bin|al|y)$/;
    const TURN_MIN_NAMED = 3;
    const nameOf = text => {
        const m = String(text || "").match(NAMED_RE);
        if (!m || NOT_A_NAME.test(m[1].trim())) return null;
        const words = m[1].trim().split(/\s+/);
        return words.length <= 4 && words.every(w => /^[A-Z]/.test(w) || NAME_PARTICLE.test(w)) ? m[1].trim() : null;
    };
    const turnsMemo = typeof WeakMap === "function" ? new WeakMap() : null;
    function speakerTurns(groups) {
        const memo = turnsMemo && Array.isArray(groups) ? turnsMemo.get(groups) : null;
        if (memo && memo.n === groups.length) return memo.turns;
        const list = (groups || []).filter(g => g && g.srcCues && g.srcCues.length).sort((a, b) => a.start - b.start);
        const pieces = [];                       // { t, text, kind: null | "anon" | "named", name }
        let endT = 0;
        for (const g of list) for (const c of g.srcCues) {
            endT = Math.max(endT, c.end);
            const text = String(c.text || "");
            const parts = text.split(">>");
            let at = 0;
            parts.forEach((part, k) => {
                // a mark's time: where its ">>" stands in the line, by characters
                const t = c.start + (c.end - c.start) * (text.length ? Math.max(0, at - 2) / text.length : 0);
                at += part.length + 2;
                const p = part.trim();
                const name = nameOf(p);
                let kind = k > 0 ? "anon" : null;
                if (name) kind = "named";
                else if (/^-\s+\S/.test(p)) kind = "anon";
                pieces.push({ t, text: p, kind, name });
            });
        }
        const speech = p => !!p && !!p.text && !TURN_NOTE.test(p.text);
        const anon = [];
        for (let j = 0; j < pieces.length; j++) {
            const p = pieces[j];
            if (p.kind !== "anon") continue;
            let b = j - 1;
            while (b >= 0 && !pieces[b].text) b--;
            let a = j;
            while (a < pieces.length && !pieces[a].text) a++;
            // ">> [music] >> ...": the recognizer marks the note itself, so the mark into it and the one
            // out of it are no turn, except that a question before it is answered by the other one
            // ("is there? >> [laughter] >> It's not the best tasting thing."): then one turn
            if (b >= 0 && TURN_NOTE.test(pieces[b].text)) { p.kind = "noise"; continue; }
            if (a < pieces.length && TURN_NOTE.test(pieces[a].text)) {
                let q = j - 1;
                while (q >= 0 && !speech(pieces[q])) q--;
                if (!(q >= 0 && /\?["”')\]]*$/.test(pieces[q].text))) { p.kind = "noise"; continue; }
            }
            anon.push(p);
        }
        const paired = anon.filter((p, k) => (k > 0 && p.t - anon[k - 1].t <= TURN_PAIR_S) || (k + 1 < anon.length && anon[k + 1].t - p.t <= TURN_PAIR_S)).length;
        const conversation = paired >= TURN_MIN_PAIRED;
        const labelled = pieces.filter(p => p.kind === "named").length >= TURN_MIN_NAMED;
        const marks = [];
        const named = new Map();
        let idx = 0, spoken = false;
        for (const p of pieces) {
            if (p.kind === "named" && labelled) {
                if (!named.has(p.name)) named.set(p.name, named.size);
                idx = named.get(p.name);
                marks.push({ t: p.t, idx });
            } else if (p.kind === "anon" && conversation) {
                if (spoken) idx = idx === 0 ? 1 : 0;
                marks.push({ t: p.t, idx });
            }
            if (speech(p)) spoken = true;
        }
        // Anonymous turns only alternate, so one turn the recognizer missed swaps the two voices for
        // the rest of the video (a vlogger back from a 5-line sketch in the other voice). Whoever
        // talks on for TURN_MAIN_S without a turn is taken for the video's main speaker and read in
        // the main voice; the alternation goes on from there. A swap now lasts until the next long
        // stretch, not to the end.
        // Named speakers: the one who talks longest gets the main voice (UIy-WQCZd4M: the guest, 69%
        // of the talk, was the second voice because the host spoke first)
        if (labelled && marks.length > 1) {
            const talk = new Map();
            marks.forEach((m, k) => talk.set(m.idx, (talk.get(m.idx) || 0) + (k + 1 < marks.length ? marks[k + 1].t : endT) - m.t));
            const main = [...talk].sort((a, b) => b[1] - a[1])[0][0];
            // two voices: everyone but the main speaker shares the second
            for (const m of marks) m.idx = m.idx === main ? 0 : 1;
        }
        if (!labelled && marks.length) {
            let flip = false;
            marks.forEach((m, k) => {
                let i = m.idx ^ (flip ? 1 : 0);
                if ((k + 1 < marks.length ? marks[k + 1].t : endT) - m.t >= TURN_MAIN_S && i !== 0) { flip = !flip; i = 0; }
                m.idx = i;
            });
        }
        const turns = { marks, conversation, labelled, anon: anon.length, paired };
        if (turnsMemo && Array.isArray(groups)) turnsMemo.set(groups, { n: groups.length, turns });
        return turns;
    }
    // One voice: nobody's turn ends a segment
    const NO_TURNS = Object.freeze({ marks: Object.freeze([]), conversation: false, labelled: false, anon: 0, paired: 0 });
    // The speaker at time t: the last mark at or before it
    function speakerAt(turns, t) {
        const m = turns.marks;
        let lo = 0, hi = m.length - 1, k = -1;
        while (lo <= hi) { const mid = (lo + hi) >> 1; if (m[mid].t <= t + 1e-6) { k = mid; lo = mid + 1; } else hi = mid - 1; }
        return k < 0 ? 0 : m[k].idx;
    }
    // A mark after a and at or before b (a turn between two pieces, even back to the same voice)
    function turnBetween(turns, a, b) {
        const m = turns.marks;
        let lo = 0, hi = m.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (m[mid].t <= a + 1e-6) lo = mid + 1; else hi = mid; }
        return lo < m.length && m[lo].t <= b + 1e-6;
    }

    function buildDubScript(groups, opts = {}) {
        const segments = [];
        // who speaks when: from every group of the video (the engine passes it for a window)
        const TURNS = opts.speakerTurns || speakerTurns(groups);
        const mid = c => (c.start + c.end) / 2;
        const PAUSE_SPLIT = opts.pauseSplit || 0.55;
        const SEG_SOFT = opts.segSoft || 6;       // đoạn đã >= 6 giây và dòng trước kết thúc bằng dấu câu: cắt
        const SEG_HARD = opts.segHard || 8;       // thêm dòng này sẽ vượt 8 giây: cắt ở ranh giới dòng
        // Quanh chỗ BẮT ĐẦU xem (vừa bật lồng tiếng / vừa tua): đoạn đọc ngắn (~3,5 giây) để lượt
        // tạo giọng đầu tiên xong nhanh (~0,8 giây thay vì ~2 giây), có tiếng sớm hơn
        const HEAD_AT = opts.headAt != null ? opts.headAt : null;
        const HEAD_HARD = opts.headHard || 3.5;
        const hardFor = start => (HEAD_AT != null && start >= HEAD_AT - 8 && start <= HEAD_AT + 6 ? HEAD_HARD : SEG_HARD);

        const list = (groups || []).filter(g => g && g.viText && g.viCues && g.viCues.length);
        list.sort((a, b) => a.start - b.start);
        // opts.joinGroups (free voice only, 1.6.7): a sentence that runs across two translation groups
        // is read in ONE request when nothing separates them (same speaker, no sentence end, no real
        // pause). Split, the voice closed the first half with a falling tone, stopped, and started
        // the rest as a new utterance: the break the viewer heard mid-sentence. Paid voices keep the
        // per-group cut, because a group translated later would change an already billed segment.
        const JOIN = !!opts.joinGroups;
        // A line boundary inside a phrase (the prosody model forbids a pause there) is bridged over a
        // silence up to this long; a longer one is a real break in the video and is followed
        const BRIDGE_MAX = 1.2;
        const insidePhrase = (seg, next) => {
            const P = prosody();
            return !!(P && SEG) && P.boundaryValue(SEG.cleanText(seg.texts[seg.texts.length - 1]), SEG.cleanText(next.text)) < P.K.minValue;
        };
        const endsSentence = t => /[.!?…]["”')\]]*\s*$/.test(String(t || "").replace(/¦/g, "").trim());
        let cur = null;
        const flush = () => { if (cur) { segments.push(cur); cur = null; } };
        // opts.spoken: { start, end } of the last segment the engine has spoken or passed. It goes on
        // from the first segment that starts after `start`, so a segment starting there takes no
        // piece ending after `end`: a group translated later (the next window, arriving while that
        // segment played) was carried into it and those words were never read. Pieces up to `end`
        // still join, or a carry made before it played would come apart and be read twice.
        // 2.3.6, simulated on the user's video, every window arriving 0.5-2 s before the one before
        // it ended: 105-125 syllables never read at the cuts youtube.js now makes at a hard limit
        const SPOKEN = opts.spoken || null;
        const pastSpoken = (seg, end) => !!SPOKEN && seg.start <= SPOKEN.start + 1e-6 && end > SPOKEN.end + 1e-6;

        for (let gi = 0; gi < list.length; gi++) {
            const g = list[gi];

            // Phân bổ token của bản dịch (còn dấu gợi ý ¦) cho từng cue theo thứ tự
            const tokens = SEG ? SEG.tokenize(g.viText) : [];
            const cueTok = g.viCues.map(c => (SEG ? SEG.tokenize(c.text).length : 0));
            let ti = 0;
            const labels = speakerLabels((g.srcCues || []).map(c => c.text).join("\n"));
            const cueTexts = g.viCues.map((c, k) => {
                if (!SEG) return c.text;
                const part = tokens.slice(ti, ti + cueTok[k]);
                ti += cueTok[k];
                return part.map(t => (t.hint ? "¦ " : "") + t.raw).join(" ");
            }).map(t => stripSpeakerLabels(stripSoundNotes(t), labels));

            // Lời gốc có khoảng lặng thật ngay sau thời điểm t hay không
            const src = g.srcCues || [];
            const sourcePauseAt = t => src.some((c, k) => {
                const n = src[k + 1];
                return n && Math.abs(c.end - t) < 0.25 && n.start - c.end >= PAUSE_SPLIT;
            });

            // Gom cue thành đoạn nói, tách ở khoảng lặng thật. Đoạn nói cũng KHÔNG được quá dài:
            // phụ đề tự động (không dấu câu, các dòng nối liền) từng gộp cả nhóm 20 đến 30 giây
            // lời thành MỘT lượt tạo giọng -> VieNeu mất 6 đến 8 giây mới có audio đầu tiên, video
            // đã trôi qua đoạn đó. Nay cắt ở ranh giới dòng phụ đề khi đoạn đã dài: ưu tiên chỗ
            // có dấu câu (từ SEG_SOFT giây), bắt buộc cắt khi tới SEG_HARD giây.
            const endsWithPunct = t => /[,.;:!?…]["”')\]]*\s*$/.test(String(t || "").replace(/¦/g, "").trim());
            // Quanh điểm bắt đầu xem: khung phụ đề dài (2 dòng ~5 giây) được chia theo từ thành các
            // phần ~HEAD_HARD giây (ưu tiên cắt sau dấu câu, thời gian chia theo số âm tiết) để đoạn
            // đọc đầu tiên ngắn, tạo giọng nhanh
            const pieces = [];
            g.viCues.forEach((c, k) => {
                const dur = c.end - c.start;
                const words = String(cueTexts[k] || "").split(/\s+/).filter(Boolean);
                const n = hardFor(c.start) === HEAD_HARD && dur > HEAD_HARD + 0.8 && words.length >= 6 ? Math.min(3, Math.ceil(dur / HEAD_HARD)) : 1;
                if (n === 1) {
                    // Chia khung phụ đề thành các VẾ theo dấu câu bên trong (mỗi vế >= 3 từ), thời gian
                    // theo số âm tiết: đoạn đọc có thể được cắt ngay sau dấu phẩy / dấu chấm giữa khung,
                    // không phải cắt ở ranh giới khung (thường giữa một vế câu -> nghe như ngắt ngang)
                    const syl1 = words.map(w => Math.max(1, tokenSyllables(w.replace(/¦/g, ""))));
                    const total1 = syl1.reduce((a, b) => a + b, 0) || 1;
                    const cuts1 = [];
                    let lastCut = 0;
                    for (let w = 0; w < words.length - 1; w++) {
                        if (/[,.;:!?…]["”')\]]*$/.test(words[w]) && w + 1 - lastCut >= 3 && words.length - (w + 1) >= 3) { cuts1.push(w + 1); lastCut = w + 1; }
                    }
                    if (!cuts1.length) { pieces.push({ start: c.start, end: c.end, text: cueTexts[k] }); return; }
                    let f1 = 0, s1 = c.start;
                    [...cuts1, words.length].forEach(to => {
                        const ps = syl1.slice(f1, to).reduce((a, b) => a + b, 0);
                        const e1 = to === words.length ? c.end : s1 + dur * ps / total1;
                        pieces.push({ start: s1, end: e1, text: words.slice(f1, to).join(" ") });
                        f1 = to; s1 = e1;
                    });
                    return;
                }
                // a translator's hint mark ("¦", its own token) is no syllable
                const syl = words.map(w => (w === "¦" ? 0 : Math.max(1, tokenSyllables(w.replace(/¦/g, "")))));
                const total = syl.reduce((a, b) => a + b, 0);
                // 2.0.6: the cut goes where speech may pause, near the middle. Cut by syllables alone,
                // 106 of 157 head cuts over the corpus sentences fell inside a phrase or a word
                // ("mạng | nơ-ron", "điện | tử"), and each cut restarts the voice's intonation
                const vals = lineGapValues(words);
                // ... but no piece longer than maxPiece x HEAD_HARD: it is the first request's length
                const maxSyl = total * HEAD_HARD * HEAD_CUT.maxPiece / dur;
                const cuts = [];
                for (let j = 1; j < n; j++) {
                    const target = total * j / n;
                    const from = cuts.length ? syl.slice(0, cuts[cuts.length - 1]).reduce((a, b) => a + b, 0) : 0;
                    let acc = 0, best = -1, bestCost = Infinity;
                    for (let w = 0; w < words.length - 1; w++) {
                        acc += syl[w];
                        if (w + 1 < 3 || words.length - (w + 1) < 3) continue;
                        if (vals && acc - from > maxSyl) break;
                        const cost = Math.abs(acc - target) - (vals ? HEAD_CUT.perValue * Math.min(1, vals[w]) - (vals[w] < 0 ? HEAD_CUT.inside : 0) :
                            (/[,.;:!?…]$/.test(words[w]) ? 3 : 0));
                        if (cost < bestCost && (!cuts.length || w + 1 > cuts[cuts.length - 1])) { bestCost = cost; best = w + 1; }
                    }
                    if (best > 0) cuts.push(best);
                }
                let from = 0, t0 = c.start;
                [...cuts, words.length].forEach(to => {
                    const part = words.slice(from, to);
                    const ps = syl.slice(from, to).reduce((a, b) => a + b, 0);
                    const t1 = to === words.length ? c.end : t0 + dur * ps / total;
                    pieces.push({ start: t0, end: t1, text: part.join(" ") });
                    from = to; t0 = t1;
                });
            });
            const open = c => ({ start: c.start, end: c.end, texts: [], parts: [], cueCount: 0, groupIndex: gi, speaker: c.speaker, srcCues: g.srcCues || [], group: g });
            const add = c => {
                // a segment carried over from the previous group takes this group's source lines too
                if (cur.group !== g) { cur.srcCues = [...cur.srcCues, ...(g.srcCues || [])]; cur.group = g; }
                cur.texts.push(c.text); cur.parts.push(c); cur.end = c.end; cur.cueCount++;
            };
            // Khung chỉ có chú thích âm thanh ("(Vỗ tay)"): không đọc, để thành khoảng lặng
            for (let k = pieces.length - 1; k >= 0; k--) if (!hasWords(pieces[k].text)) pieces.splice(k, 1);
            // A turn inside a piece ("Có ngay. Bạn muốn nóng hay đá? Nóng." over "...hot or ice? >> Uh,
            // hot."): the piece is cut at the sentence end nearest the turn's share of its time
            for (let k = 0; k < pieces.length; k++) {
                const c = pieces[k];
                const inside = TURNS.marks.find(m => m.t > c.start + 0.15 && m.t < c.end - 0.15);
                if (!inside) continue;
                const words = String(c.text).split(/\s+/).filter(Boolean);
                const syl = words.map(w => Math.max(1, tokenSyllables(w.replace(/¦/g, ""))));
                const total = syl.reduce((a, b) => a + b, 0) || 1;
                const share = (inside.t - c.start) / (c.end - c.start);
                let best = -1, bestCost = Infinity, acc = 0;
                for (let w = 0; w < words.length - 1; w++) {
                    acc += syl[w];
                    if (!/[.!?…]["”')\]]*$/.test(words[w])) continue;
                    const cost = Math.abs(acc / total - share);
                    if (cost < bestCost && cost < 0.3) { bestCost = cost; best = w + 1; }
                }
                if (best < 0) continue;
                const at = c.start + (c.end - c.start) * syl.slice(0, best).reduce((a, b) => a + b, 0) / total;
                pieces.splice(k, 1, { start: c.start, end: at, text: words.slice(0, best).join(" ") }, { start: at, end: c.end, text: words.slice(best).join(" "), turnAt: inside.t });
            }
            // each piece is read by whoever speaks at its middle (a piece cut at a turn: just after the
            // turn); a turn between two pieces ends a segment
            for (const c of pieces) c.speaker = `S${speakerAt(TURNS, c.turnAt != null ? Math.max(c.turnAt, mid(c)) : mid(c)) + 1}`;
            const turnAfter = (seg, c) => c.speaker !== seg.speaker || turnBetween(TURNS, mid(seg.parts[seg.parts.length - 1]), mid(c));
            // Carry the open segment into this group (free voice): the lines below then cut it by the
            // same rules as inside one group (length, a pause, a source pause). A sentence still
            // running is carried over a short pause, or bridged over a longer one inside a phrase.
            // 2.3.2: so is a finished sentence when this group starts inside the caption line the
            // last one ended in (`midLine`, content.js splitCuesAtSentenceEnds): the voice reads
            // across that cut as it did when the line was one group (both halves come in one
            // translation window, unless the window meets a hard limit there: youtube.js
            // ytCanonicalWindows, 2.3.6; the later half then re-plans that segment). Simulated on
            // the user's 6 punctuated videos: closed there, late starts 88 -> 124; carried, 87.
            // Carrying every finished sentence gave 71, but the line it dropped lost 52 syllables
            // instead of 29 (docs/DUBBING.md "Across a caption line cut")
            if (cur) {
                const first = pieces[0];
                const gap = first ? first.start - cur.end : Infinity;
                const running = !endsSentence(cur.texts[cur.texts.length - 1]);
                const carry = JOIN && first && !turnAfter(cur, first) &&
                    ((gap < PAUSE_SPLIT && (running || g.midLine)) || (running && gap < BRIDGE_MAX && insidePhrase(cur, first)));
                if (!carry) flush();
            }
            pieces.forEach(c => {
                if (cur && (pastSpoken(cur, c.end) || turnAfter(cur, c))) flush();
                const gapBefore = cur ? c.start - cur.end : 0;
                const len = cur ? c.end - cur.start : 0;
                const hard = cur && len > hardFor(cur.start);
                const soft = cur && cur.end - cur.start >= SEG_SOFT && endsWithPunct(cur.texts[cur.texts.length - 1]);
                if (cur && hard && !soft && cur.parts.length >= 2) {
                    // Buộc phải cắt: lùi về chỗ có dấu câu gần nhất ở nửa sau của đoạn (nếu có) để
                    // không cắt ngang giữa một vế câu
                    let at = -1;
                    for (let i = cur.parts.length - 2; i >= Math.floor(cur.parts.length / 2); i--) {
                        if (endsWithPunct(cur.parts[i].text)) { at = i; break; }
                    }
                    // Free voice (1.7.6), no punctuation to fall back to: the line boundary where
                    // speech pauses best, if it beats cutting right here ("đưa ra | quyết định"
                    // split a verb from its object; each cut restarts the voice's intonation).
                    // Paid voices keep their cuts: a moved cut would re-bill stored audio
                    if (at < 0 && JOIN) at = prosodicCut(cur, c, hardFor(cur.start));
                    if (at >= 0) {
                        const rest = cur.parts.slice(at + 1);
                        cur.parts = cur.parts.slice(0, at + 1);
                        cur.texts = cur.parts.map(x => x.text);
                        cur.end = cur.parts[cur.parts.length - 1].end;
                        cur.cueCount = cur.parts.length;
                        flush();
                        cur = open(rest[0]);
                        rest.forEach(add);
                    }
                }
                const len2 = cur ? c.end - cur.start : 0;
                const tooLong = cur && (len2 > hardFor(cur.start) || (cur.end - cur.start >= SEG_SOFT && endsWithPunct(cur.texts[cur.texts.length - 1])));
                // 1.8.0, free voice: a pause of the source speaker inside a phrase of the Vietnamese
                // ("Christopher | Nolan", "3,5 | GHz", "ở California | trong quý") is not a speech
                // boundary: the segment runs on (up to BRIDGE_MAX of silence), only length forces a cut
                const bridge = JOIN && cur && !tooLong && gapBefore < BRIDGE_MAX && insidePhrase(cur, c);
                if (cur && !bridge && (gapBefore >= PAUSE_SPLIT || sourcePauseAt(cur.end) || tooLong)) flush();
                if (!cur) cur = open(c);
                add(c);
            });
            if (!JOIN) flush();
        }
        flush();

        // Đoạn quá ngắn (<= 2 âm tiết, ví dụ "Và", "Thế là") mà câu còn tiếp ngay sau: gộp vào đoạn
        // sau. Đo thật (TED, phụ đề người dịch): đoạn 1 âm tiết trong khung 1,6 giây -> audio 0,4 giây,
        // giọng phải nghỉ giữa câu hoặc chạy trước phụ đề
        for (let i = segments.length - 2; i >= 0; i--) {
            const a = segments[i], b = segments[i + 1];
            const txt = (SEG ? SEG.cleanText(a.texts.join(" ")) : a.texts.join(" "));
            if (countSyllables(txt) > 2 || /[.!?…]["”')\]]*$/.test(txt)) continue;
            if (a.speaker !== b.speaker || b.start - a.end >= 1.5 || pastSpoken(a, b.end)) continue;
            b.start = a.start;
            b.texts = [...a.texts, ...b.texts];
            b.parts = [...a.parts, ...b.parts];
            b.cueCount += a.cueCount;
            if (a.srcCues !== b.srcCues) b.srcCues = [...a.srcCues, ...b.srcCues];
            segments.splice(i, 1);
        }

        // Hoàn thiện: văn bản nói, khoảng trống phía sau (slot), liên tục với đoạn sau.
        // Mã đoạn CHỈ theo mốc thời gian (không theo số thứ tự): bản dịch về không theo thứ tự
        // (dịch song song, ưu tiên quanh vị trí đang xem), một nhóm phía trước dịch xong muộn
        // từng làm lệch số thứ tự -> đổi mã MỌI đoạn phía sau -> engine mất audio đã tạo,
        // phải tạo lại, giọng im từng quãng.
        const usedIds = new Set();
        return segments.map((s, i) => {
            let id = `t${Math.round(s.start * 1000)}`;
            for (let k = 2; usedIds.has(id); k++) id = `t${Math.round(s.start * 1000)}_${k}`;
            usedIds.add(id);
            const next = segments[i + 1];
            const subtitleText = (SEG ? SEG.cleanText(s.texts.join(" ")) : s.texts.join(" "));
            const srcText = s.srcCues.filter(c => c.end > s.start - 0.05 && c.start < s.end + 0.05).map(c => c.text).join(" ");
            const gapAfter = next ? next.start - s.end : 3;
            const slotEnd = next ? Math.max(s.end, Math.min(next.start - 0.12, s.end + 1.6)) : s.end + 2;
            return {
                id,
                index: i,
                start: s.start,
                end: s.end,
                slotEnd,
                speaker: s.speaker,
                cueCount: s.cueCount,
                subtitleText,
                speechSource: s.texts.join(" "),
                srcText,
                sourcePauses: sourcePausesIn(s.srcCues, s.start, s.end),
                // Câu CHƯA HẾT: không kết thúc bằng dấu câu kết câu, cùng người nói, đoạn sau tới trong
                // 1,5 giây (trước: chỉ khi khoảng lặng < 0,3 giây -> phụ đề tự động có khoảng ngừng
                // nhỏ giữa câu bị coi là hết câu, giọng dừng hẳn chờ phụ đề)
                continuesNext: !!next && gapAfter < 1.5 && next.speaker === s.speaker && !/[.!?…]["”')\]]*$/.test(subtitleText)
            };
        });
    }

    // Index of the part after which segment `seg` is best cut, or -1 to cut before `next` (where it
    // would be cut anyway). Any line boundary counts, even in the first half (with two long lines the
    // full stop after the first used to be skipped), if the first piece lasts 2 s, the rest plus
    // `next` fits in `hard` seconds, and it beats cutting here by 0.3 in boundary value.
    const prosody = () => (root && root.CST_DUB_PROSODY) ||
        (typeof require === "function" ? (() => { try { return require("./dub-prosody.js"); } catch (e) { return null; } })() : null);
    // A head cut (buildDubScript) weighs the boundary value against the distance from the middle, in
    // syllables per unit of value; a cut inside a phrase (value < 0) is taken only when the line has
    // no other place to cut
    const HEAD_CUT = { perValue: 3, inside: 20, maxPiece: 1.5 };
    // Boundary value after each word of a subtitle line (the translator's "¦" marks are their own
    // tokens and share the gap they sit in), or null when the prosody model is not loaded or reads
    // the words differently
    function lineGapValues(words) {
        const P = prosody();
        if (!P) return null;
        const clean = words.map(w => w.replace(/¦/g, "")).filter(Boolean);
        const a = P.analyze(clean.join(" "));
        if (a.words.length !== clean.length) return null;
        let c = -1;
        return words.map(w => {
            if (w.replace(/¦/g, "")) c++;
            return c >= 0 && a.gaps[c] ? a.gaps[c].value : 2;
        });
    }
    function prosodicCut(seg, next, hard) {
        const P = prosody();
        const parts = seg.parts;
        if (!P || !SEG) return -1;
        const texts = [...parts, next].map(x => SEG.cleanText(x.text));
        const a = P.analyze(texts.join(" "));
        let n = 0;
        const ends = texts.map(t => (n += SEG.tokenize(t).length) - 1);
        if (n !== a.words.length) return -1;
        const value = k => (a.gaps[ends[k]] ? a.gaps[ends[k]].value : -4);
        // 1.8.0: when cutting here would split a phrase (a name, a number and its unit, a subject's
        // prepositional phrase), any line boundary that is not inside one is better
        const here = value(parts.length - 1);
        let best = -1, bestValue = here < P.K.minValue ? P.K.minValue - 1e-9 : Math.max(0.3, here + 0.3);
        for (let i = parts.length - 2; i >= 0; i--) {
            if (parts[i].end - seg.start < 2 || next.end - parts[i + 1].start > hard) continue;
            if (value(i) > bestValue) { bestValue = value(i); best = i; }
        }
        return best;
    }

    // ---------------- PROSODY + TIMING PLAN ----------------
    // Giới hạn tính theo TỐC ĐỘ NÓI THẬT (âm tiết/giây), không theo hệ số của
    // từng engine: người Việt giảng bài ~4,5 đến 5,5 âm tiết/giây. Giọng hệ thống
    // mặc định chậm (3,6) nên được phép tăng hệ số nhiều hơn giọng AI vốn nói nhanh.
    const LIMITS = {
        minSps: 3.3,           // chậm hơn nữa nghe lê thê
        comfortSps: 5.0,       // nhanh nhưng vẫn tự nhiên
        maxSps: 5.9,           // ceiling: faster is hard to follow; any overflow chains on, never shortened
        maxStretch: 1.15,      // co giãn audio giữ cao độ (chỉ với audio có sẵn)
        minPauseScale: 0.55,
        maxPauseScale: 1.5
    };

    // Hệ số tốc độ của engine để đạt tốc độ nói sps
    // Hệ số tốc độ engine để giọng nhanh gấp "mult" lần so với ở tốc độ 1.0
    // (ví dụ video phát 1,5x thì giọng phải thực sự nhanh 1,5x, không phải hệ số 1,5)
    function rateForSpeedup(mult, model) {
        const m = model || DEFAULT_VOICE_MODEL;
        return rateForSps(mult * m.sylPerSec, m);
    }

    function rateForSps(sps, model) {
        const m = model || DEFAULT_VOICE_MODEL;
        const want = sps / m.sylPerSec;
        let lo = 0.3, hi = 4;
        if (speedMultiplier(hi, m) < want) return hi;   // giọng không nói nhanh được đến vậy
        for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (speedMultiplier(mid, m) < want) lo = mid; else hi = mid;
        }
        return hi;
    }

    function planSegment(seg, opts = {}) {
        const model = { ...DEFAULT_VOICE_MODEL, ...(opts.voiceModel || {}) };
        const speechText = adaptForSpeech(seg.speechSource || seg.subtitleText);
        const intent = classifyIntent(seg.srcText, speechText);
        const P = INTENT_PROSODY[intent.type] || INTENT_PROSODY.neutral;

        let phrases = buildPhrases(speechText, { sourcePauses: seg.sourcePauses });

        // Nhịp mở đầu: "Now, ..." -> "Bây giờ, ..." tách thành một nhịp riêng
        if (phrases.length && seg.sourcePauses.some(p => p.opener)) {
            const m = phrases[0].text.match(OPENERS_VI);
            if (m && phrases[0].text.length > m[1].length + 3) {
                const head = m[1];
                const rest = phrases[0].text.slice(m[0].length);
                phrases.splice(0, 1,
                    { text: head, syl: countSyllables(head), pauseAfter: PAUSE.opener, breakKind: "opener" },
                    { ...phrases[0], text: rest, syl: countSyllables(rest) });
            }
        }
        if (!phrases.length) return null;

        // Nhấn giọng & cao độ theo cụm (hệ số nhỏ, quanh giọng nền của người nói)
        const emphasisWords = [];
        phrases.forEach((ph, k) => {
            ph.rateMul = P.rate;
            ph.pitchMul = P.pitch;
            ph.emphasis = EMPHASIS_VI.test(ph.text);
            if (ph.emphasis) {
                ph.rateMul *= 0.94;
                ph.pitchMul *= 1.03;
                const m = ph.text.match(EMPHASIS_VI);
                if (m) emphasisWords.push(m[0]);
            }
            if (ph.breakKind === "opener") { ph.rateMul *= 0.96; }
            if (k === phrases.length - 1) {
                ph.pitchMul *= P.endPitch;
                ph.pauseAfter = seg.continuesNext ? 0.08 : 0;   // khoảng dừng cuối do khoảng lặng thật quyết định
            }
        });

        // ---- Khớp thời lượng ----
        const natural = Math.max(0.3, seg.end - seg.start);      // thời lượng người nói gốc
        const available = Math.max(natural, seg.slotEnd - seg.start);
        const est = (rate, pauseScale) => phrases.reduce((a, ph, k) =>
            a + speechSeconds(ph.syl, rate * ph.rateMul, model) + (k < phrases.length - 1 ? pauseSeconds(ph.pauseAfter * pauseScale, rate, model) : 0), 0) + model.overhead;

        const est1 = est(1, 1);
        const strategies = [];
        let rate = 1;
        let pauseScale = 1;
        const target = natural * 0.97;

        // Sàn tốc độ tính cả hệ số ngữ điệu của từng cụm (câu hỏi, nhấn mạnh nói chậm hơn)
        const minMul = Math.min(...phrases.map(ph => ph.rateMul || 1));
        const minRate = Math.min(1, rateForSps(LIMITS.minSps, model) / Math.max(0.5, minMul));
        const comfortRate = Math.max(1, rateForSps(LIMITS.comfortSps, model));
        const maxRate = Math.max(comfortRate, rateForSps(LIMITS.maxSps, model));
        if (est1 <= target) {
            // Tiếng Việt ngắn hơn: giãn khoảng dừng + chậm lại nhẹ để lấp nhịp gốc
            pauseScale = Math.min(LIMITS.maxPauseScale, 1 + (target - est1) / Math.max(0.3, est1));
            let lo = minRate, hi = 1;
            for (let it = 0; it < 30; it++) {
                const mid = (lo + hi) / 2;
                if (est(mid, pauseScale) > target) lo = mid; else hi = mid;
            }
            rate = hi;
            strategies.push("slow-fill");
        } else {
            pauseScale = LIMITS.minPauseScale;
            strategies.push("compress-pauses");
            const solve = (budget, maxR) => {
                let lo = 0.9, hi = maxR;
                if (est(hi, pauseScale) > budget) return hi;
                for (let it = 0; it < 30; it++) {
                    const mid = (lo + hi) / 2;
                    if (est(mid, pauseScale) > budget) lo = mid; else hi = mid;
                }
                return hi;
            };
            rate = solve(target, comfortRate);
            if (est(rate, pauseScale) > target) {
                strategies.push("use-silence");
                rate = solve(available * 0.98, comfortRate);
                if (est(rate, pauseScale) > available * 0.98) {
                    strategies.push("faster");
                    rate = solve(available * 0.98, maxRate);
                }
            } else {
                strategies.push("rate-up");
            }
        }
        const estDuration = est(rate, pauseScale);
        const overflow = Math.max(0, estDuration - available);
        if (overflow > 0.05) strategies.push("needs-condense");

        // Mốc thời gian từng cụm (tương đối so với start), để đồng bộ và tua giữa đoạn
        let t = model.overhead / 2;
        for (const ph of phrases) {
            ph.offset = t;
            ph.dur = speechSeconds(ph.syl, rate * ph.rateMul, model);
            ph.pause = pauseSeconds(ph.pauseAfter * pauseScale, rate, model);
            t += ph.dur + ph.pause;
        }

        const speechTime = phrases.reduce((a, ph) => a + ph.dur, 0);
        return {
            id: seg.id,
            index: seg.index,
            sps: phrases.reduce((a, ph) => a + ph.syl, 0) / Math.max(0.1, speechTime),
            calibration: model.calibration || 1,
            speaker: seg.speaker,
            start: seg.start,
            end: seg.end,
            slotEnd: seg.slotEnd,
            text: phrases.map(p => p.text).join(" "),
            subtitleText: seg.subtitleText,
            srcText: seg.srcText,
            intent: intent.type,
            phrases,
            rate,
            pauseScale,
            pitch: 1,
            emphasisWords,
            naturalDuration: natural,
            targetDuration: available,
            estDuration,
            durationRatio: est1 / natural,
            overflow,
            strategies,
            continuesNext: seg.continuesNext,
            style: P.style
        };
    }

    // Giọng liền mạch: tốc độ giữa hai đoạn sát nhau không nhảy đột ngột.
    // Chỉ NÂNG đoạn chậm lên gần đoạn bên cạnh (không bao giờ làm đoạn cần nhanh bị chậm lại).
    function smoothRates(plans, maxJump = 0.1) {
        for (let pass = 0; pass < 2; pass++) {
            for (let i = 1; i < plans.length; i++) {
                const a = plans[i - 1], b = plans[i];
                if (!a || !b || a.speaker !== b.speaker || b.start - a.end > 0.8) continue;
                if (b.rate < a.rate - maxJump) rescale(b, a.rate - maxJump);
                if (a.rate < b.rate - maxJump) rescale(a, b.rate - maxJump);
            }
        }
        return plans;
    }

    function rescale(plan, newRate) {
        const f = plan.rate / newRate;
        plan.rate = newRate;
        plan.estDuration = plan.estDuration * f;
        for (const ph of plan.phrases) { ph.offset *= f; ph.dur *= f; }
        if (!plan.strategies.includes("smoothed")) plan.strategies.push("smoothed");
    }

    function planAll(segments, opts = {}) {
        const plans = segments.map(s => planSegment(s, opts)).filter(Boolean);
        return smoothRates(plans);
    }

    const api = {
        numberToVietnamese, countSyllables, adaptForSpeech, numberRole, classifyIntent, buildPhrases, speakerTurns, speakerAt, NO_TURNS,
        buildDubScript, stripSoundNotes, speakerLabels, stripSpeakerLabels, planSegment, planAll, smoothRates, speechSeconds, pauseSeconds, rateForSps, rateForSpeedup, speedMultiplier,
        DEFAULT_VOICE_MODEL, LIMITS, INTENT_PROSODY, PAUSE
    };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_DUB_PLAN = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

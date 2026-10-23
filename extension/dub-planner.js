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
        // Past 15 digits a double has lost the low digits and "units" below runs out (1e18 read "một"):
        // such a run is an id or a serial, said digit by digit like a long fraction
        if (typeof num === "string" && /^\d{16,}$/.test(num)) return num.split("").join(" ");
        let n = Math.floor(Math.abs(Number(num)));
        if (!Number.isFinite(n)) return String(num);
        if (n >= 1e18) return BigInt(n).toString().split("").join(" ");
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
    // 2.6.2: a glossary name with a number, a symbol or a hyphen in it ("Veo 3.1", "K+", "2% BHA", "(G)I-DLE") is
    // said by its own reading (GLOSSARY_SAY, dub-speech.js) before the number and symbol rules below
    // turn "3.1" into "3 phẩy 1". Only those keys: the rest of the glossary goes through render().
    let keepKeys = null;
    const keepRe = () => {
        if (keepKeys !== null) return keepKeys;
        const SP = (root && root.CST_DUB_SPEECH) ||
            (typeof require === "function" ? (() => { try { return require("./dub-speech.js"); } catch (e) { return null; } })() : null);
        const say = SP && SP.GLOSSARY_SAY ? SP.GLOSSARY_SAY : {};
        const keys = Object.keys(say).filter(k => /[^\p{L} ]/u.test(k)).sort((x, y) => y.length - x.length);
        const esc = k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // a key that starts with a symbol ("% Arabica") may follow a letter once cleanText has closed the space
        const sym = keys.filter(k => !/^\p{L}/u.test(k)), words = keys.filter(k => /^\p{L}/u.test(k));
        keepKeys = keys.length ? {
            // (2.8.0) one led by a digit ("5G") never starts inside a longer number: "65g" was "6" + "5G"
            sym: sym.length ? new RegExp("(" + sym.map(k => (/^\p{N}/u.test(k) ? "(?<!\\p{N})" : "") + esc(k)).join("|") + ")(?![\\p{L}\\p{N}])", "giu") : null,
            re: words.length ? new RegExp("(?<![\\p{L}\\p{N}])(" + words.map(esc).join("|") + ")(?![\\p{L}\\p{N}])", "giu") : null,
            say } : false;
        return keepKeys;
    };
    const UNIT_SQ = { km: "ki-lô-mét", m: "mét", cm: "xen-ti-mét", mm: "mi-li-mét" };
    // (2.9.9) digit-by-digit words: a PIN, a one-time code, a phone number, a tax or ID number
    const ID_WORDS = /((?<![\p{L}])(?:OTP|PIN|CCCD|CMND|CMT|MST|SĐT|STK|mã số thuế|số điện thoại|điện thoại|hotline|số tài khoản|mã xác (?:nhận|minh|thực)|mã bảo mật|mã pin|mã otp)(?![\p{L}])[^\d\n]{0,10}?)(\+?\d[\d ]{2,}\d)(?![\d.,]\d)/giu;
    function adaptForSpeech(text) {
        // (2.6.4) letter-led names are kept before cleanText, which turns a slash into "hoặc" ("CI/CD")
        const keep = keepRe();
        let t = String(text || "");
        if (keep && keep.re) t = t.replace(keep.re, (m, g1, off, all) => {
            const r = keep.say[m.toLowerCase()];
            return r ? (off > 0 && /\p{L}$/u.test(all[off - 1]) ? " " : "") + r : m;
        });
        t = SEG ? SEG.cleanText(t, { keepHints: true }) : t;
        if (keep) for (const re of [keep.sym]) if (re) t = t.replace(re, (m, g1, off, all) => {
            const r = keep.say[m.toLowerCase()];
            return r ? (off > 0 && /\p{L}$/u.test(all[off - 1]) ? " " : "") + r : m;
        });
        // Every rule below was checked against the VieNeu server's own normalizer (sea_g2p), by
        // reading back what it actually says. See tests/dub.test.js "speech text".
        // (2.8.2) Text faces are read as words by VieNeu: ":D" "đê", "^^" "mũ mũ", "<3" "nhỏ hơn ba",
        // "=)))" "bằng", "xD" "xd" (tools/vieneu-g2p.py). The subtitle keeps them; the voice says nothing
        // Eyes are only : ; = (an 8 is a digit: "583" lost its "83"), and a face looks right ("):" closed
        // a bracket after "(04:58")
        // never right after a digit: "8:3", "2:1", "3:00" are times and ratios
        t = t.replace(/(^|[\s\p{L}.,!?…])(?:[:;=][-'^]?[)(DPpOo3\]\[|]+|\^[_.\-]?\^|T[_.]T|-_-|>_<|<3+|xD+|XD+)(?=$|[\s.,!?…])/gu, (m0, lead) => (/\s/.test(lead) ? "" : lead));
        // (2.8.3) Symbols between words, as VieNeu read them (a corpus pass over every saved line):
        // "paprika / ớt chuông" said "trên" (it means or), "Tôi > Khuyến mãi" (a menu path) "lớn hơn",
        // "@thebudgetdermatologist" "a còng ...", "cửa hàng 7/11" (the shop, not the 7th of November)
        t = t.replace(/((?:cửa hàng|tiệm|ở|tại|siêu thị)\s+)7\s?\/\s?11(?![\p{N}])/giu, "$1<en>seven eleven</en>").replace(/7-Eleven/gi, "<en>seven eleven</en>");
        t = t.replace(/(\p{L})\s+>\s+(?=\p{L})/gu, "$1, ");
        t = t.replace(/(^|\s)@(?=[A-Za-z0-9_.]{2,})/g, "$1");
        // Web addresses: without this the scheme is spelled out letter by letter ("hát tê tê phê")
        t = t.replace(/\bhttps?:\/\/(?:www\.)?/gi, "").replace(/\bwww\./gi, "");
        // Only real domain endings, lower case: "TP.HCM" or "v.v." must stay as they are
        t = t.replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|ai|io|dev|edu|gov|vn|co|app|me|info|so|gg|tv|ly|us|uk)\b(?:\/[\w\-./]*[\w\-/])?/g,
            m => m.replace(/\//g, " gạch chéo ").replace(/\./g, " chấm ").replace(/\s+/g, " ").trim());
        // (2.9.9) A code, a PIN or a phone number is said digit by digit, never as one amount
        // ("mã OTP 482913" was "bốn trăm tám mươi hai nghìn chín trăm mười ba")
        t = t.replace(ID_WORDS, (m0, lead, num) => lead + num.replace(/\d/g, d => " " + d).replace(/\s+/g, " ").trim().replace(/^/, ""));
        // 9am, 9:30 PM, 7 p.m.: the hour and the part of the day ("a m" was spelled out)
        t = t.replace(/(?<![\p{L}\p{N}:])(\d{1,2})(?::(\d{2}))?\s?([ap])\.?m(?:\.(?=\s+\p{Ll}))?(?![\p{L}\p{N}])/giu, (m0, h, mi, ap) => {
            const hour = Number(h);
            if (hour < 1 || hour > 12 || (mi && Number(mi) > 59)) return m0;
            const part = ap.toLowerCase() === "a" ? "sáng" : (hour === 12 || hour < 6 ? "chiều" : "tối");
            return `${hour} giờ${mi && mi !== "00" ? " " + Number(mi) : ""} ${part}`;
        });
        // (2.9.9) 60fps: the server leaves "fps" bare. A spaced hyphen between a larger and a smaller number
        // is a subtraction ("10 - 5"), which the server read as the range "mười đến năm"; a rising pair stays
        t = t.replace(/(\d)\s?fps(?![\p{L}\p{N}])/giu, "$1 khung hình trên giây");
        t = t.replace(/(?<![\p{L}\p{N}.,-])(\d+)\s[-–]\s(\d+)(?![\p{L}\p{N}.,-])/gu, (m0, x, y) => (Number(x) > Number(y) ? `${x} trừ ${y}` : m0));
        // A minus sign before a number: -5, −5°C ("gạch ngang năm" otherwise)
        t = t.replace(/(?<![\p{L}\p{N}])(?<!\d\s)[-−](?=\d)/gu, "âm ");
        // $20 -> "20 đô la" (read as "hai mươi u s d" otherwise); 5 USD -> "5 đô la"
        t = t.replace(/(?:US)?\$\s?(\d+(?:[.,]\d+)*)(\s?(?:[KMB]|nghìn|ngàn|triệu|tỷ)\b)?/g, (m0, n, mag) => `${n}${mag || ""} đô la`);
        t = t.replace(/(\d)\s?USD\b/g, "$1 đô la");
        // (2.9.9) the other currencies: €50, 50€, 20 EUR, £30, ¥1000; and the dong: 100.000đ, 5 VND
        // ("một trăm nghìnđ" glued, "vê en đê" spelled)
        const CURRENCY = { "€": "ơ-rô", "£": "bảng Anh", "¥": "yên", EUR: "ơ-rô", GBP: "bảng Anh", JPY: "yên", CNY: "nhân dân tệ", RMB: "nhân dân tệ" };
        t = t.replace(/([€£¥])\s?(\d+(?:[.,]\d+)*)(\s?(?:[KMB]|nghìn|ngàn|triệu|tỷ)(?![\p{L}\p{N}]))?/gu, (m0, c, n, mag) => `${n}${mag || ""} ${CURRENCY[c]}`);
        t = t.replace(/(\d)\s?([€£¥])/gu, (m0, d, c) => `${d} ${CURRENCY[c]}`);
        t = t.replace(/(\d)\s?(EUR|GBP|JPY|CNY|RMB)(?![\p{L}\p{N}])/gu, (m0, d, c) => `${d} ${CURRENCY[c]}`);
        t = t.replace(/(\d)\s?(?:₫|đ|VNĐ|VND)(?![\p{L}\p{N}])/gu, "$1 đồng");
        t = t.replace(/(\d)\s*%/g, "$1 phần trăm");
        // 7B / 200K / 1.5M after a number: "7 tỷ", "200 nghìn", "1.5 triệu" (not "bảy bê", "hai trăm ca")
        // (2.8.0) ... except a screen or a video: "4K", "8K" in a line about one is a resolution ("video 4
        // nghìn" before), said "bốn ca" (as a digit before "ca", VieNeu read "four"). Money stays
        // nghìn: "6K đến 8K một tháng" names no screen
        const SCREEN = /video|màn hình|độ phân giải|quay|camera|máy ảnh|tivi|\bTV\b|HDR|phim|youtube|stream|chuẩn|\bfps\b|\d\s?fps|\bOLED\b|\bUHD\b|\bHz\b/i;
        if (SCREEN.test(t)) t = t.replace(/\b([48])K\b/g, (m0, n) => `${n === "4" ? "bốn" : "tám"} ca`);
        // (2.8.2) ... only a letter standing alone: "2020 Mình" was "2020 triệuình" (\b ends at "ì")
        t = t.replace(/\b(\d+(?:[.,]\d+)?)\s?([KMB])(?![\p{L}\p{N}])/gu, (m0, n, u) => `${n} ${{ K: "nghìn", M: "triệu", B: "tỷ" }[u]}`);
        // (2.8.4) ... and "30k" in lower case (VieNeu: "ba mươi ca"), but not a retirement plan (401k, 403b)
        t = t.replace(/\b(\d+(?:[.,]\d+)?)\s?k(?![\p{L}\p{N}])/gu, (m0, n) => (/^(?:401|403|457)$/.test(n) ? m0 : `${n} nghìn`));
        // Grouped thousands, Vietnamese 1.500.000 or English 1,500,000: say it in words. The old code
        // stripped the dots to 1500000, and the server reads 7+ digit runs one digit at a time
        // ("một năm không không không không không"); an English 1,000 came out as "một".
        // (2.9.9) 1.234,56 and 1,234.56: the grouped part in words, the cents after "phẩy"
        t = t.replace(/\b(\d{1,3}(?:\.\d{3})+),(\d{1,2})(?!\d)|\b(\d{1,3}(?:,\d{3})+)\.(\d{1,2})(?!\d)/g, (m0, a, b, c, d) =>
            `${numberToVietnamese(Number((a || c).replace(/[.,]/g, "")))} phẩy ${b || d}`);
        // (2.9.9) a long fraction is a decimal, digit by digit: 3.14159, 0.001 (a leading 0 group is
        // never a thousand). 1.234 and 12.500 stay Vietnamese thousands
        t = t.replace(/(?<![\p{N}.,])(\d+)[.,](\d+)(?![.,]?\d)/gu, (m0, a, b) =>
            b.length >= 4 || (b.length === 3 && /^0+$/.test(a)) ? `${a} phẩy ${b.split("").join(" ")}` : m0);
        t = t.replace(/\b\d{1,3}(?:\.\d{3})+(?![.,]?\d)|\b\d{1,3}(?:,\d{3})+(?![.,]?\d)/g, m => numberToVietnamese(m.replace(/[.,]/g, "")));
        // a run starting with 0 is an identifier (tax code, phone): the server says it digit by digit
        t = t.replace(/\b(?!0)\d{7,}\b/g, m => numberToVietnamese(m.length > 15 ? m : Number(m)));
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
        // 2.6.1: C#, F#: "sharp" (the server said "thăng")
        t = t.replace(/(?<![\p{L}\p{N}])([A-G])#(?![\p{L}\p{N}#])/gu, "$1 sharp");

        t = t.replace(/(\d)\s*[x×]\s*(\d)/g, "$1 nhân $2");
        // (2.9.9) Area and volume units, powers, comparison signs
        t = t.replace(/(\d)\s?(km|cm|mm|m)[²2](?![\p{L}\p{N}])/gu, (m0, d, u) => `${d} ${UNIT_SQ[u]} vuông`);
        t = t.replace(/(\d)\s?(km|cm|mm|m)[³3](?![\p{L}\p{N}])/gu, (m0, d, u) => `${d} ${UNIT_SQ[u]} khối`);
        t = t.replace(/(?<=[\p{L}\p{N}])²/gu, " bình phương").replace(/(?<=[\p{L}\p{N}])³/gu, " lập phương");
        t = t.replace(/(?<=[\p{L}\p{N}])\s?\^\s?(\d+)(?![\p{L}\p{N}])/gu, (m0, e) => ` mũ ${e}`);
        t = t.replace(/\s?≥\s?/g, " lớn hơn hoặc bằng ").replace(/\s?≤\s?/g, " nhỏ hơn hoặc bằng ").replace(/\s?≠\s?/g, " khác ")
            .replace(/\s?[≈≃]\s?/g, " xấp xỉ ").replace(/\s?±\s?/g, " cộng trừ ").replace(/√\s?(?=\p{N})/gu, "căn bậc hai của ").replace(/π/g, "pi");
        t = t.replace(/\s=\s|(?<=\w)=(?=\w)/g, " bằng ");
        // 2.6.1: "+" inside an English name is "and" ("Travel + Leisure", "Florence + The Machine"),
        // glued to its end "plus" ("Disney+", "Apple TV+", "C++"); between numbers still "cộng"
        const enName = w => /^[A-Z][A-Za-z'’.]*$/.test(w) && !(SEG && SEG.isVietWord && SEG.isVietWord(w.replace(/['’]s$|\.$/i, "").toLowerCase()));
        // word lengths are bounded below: an unbounded run made one 100,000-letter word cost 22 s (quadratic scan)
        t = t.replace(/([A-Za-z][A-Za-z'’.]{0,40})\s\+\s([A-Z][A-Za-z'’.]{0,40})/g, (m0, a, b) => (enName(a) || enName(b) ? `${a} and ${b}` : m0));
        t = t.replace(/(?<![\p{L}\p{N}])([A-Za-z][A-Za-z0-9]*)(\+{1,2})(?![\p{L}\p{N}+])/gu, (m0, w, plus) =>
            /^[A-Z]/.test(w) || w.length === 1 ? `${w} ${plus.length === 2 ? "plus plus" : "plus"}` : m0);
        t = t.replace(/\s\+\s/g, " cộng ");
        t = t.replace(/\s*(?:->|→|=>)\s*/g, " thành ");
        // 2.6.0: "&" inside an English name ("Johnson & Johnson", "Ben & Jerry's") is "and", said the
        // English way; between Vietnamese words, or Vietnamese-syllable ones ("Nam & Lan"), "và"
        const enWord = w => /^[A-Za-z][A-Za-z'’.]*$/.test(w) && !(SEG && SEG.isVietWord && SEG.isVietWord(w.replace(/['’]s$|\.$/i, "").toLowerCase()));
        t = t.replace(/([A-Za-z][A-Za-z'’.]{0,40})\s&\s([A-Z][A-Za-z'’.]{0,40})/g, (m0, a, b) => (enWord(a) || enWord(b) ? `${a} and ${b}` : m0));
        t = t.replace(/\s&\s/g, " và ");
        // Đơn vị đo đọc như người Việt nói: "60 km/h" -> "60 ki-lô-mét trên giờ"
        const UNIT_SAY = { km: "ki-lô-mét", m: "mét", cm: "xen-ti-mét", mm: "mi-li-mét", kg: "ki-lô-gam", g: "gam", h: "giờ", s: "giây", ms: "mi-li-giây", min: "phút" };
        t = t.replace(/(\d)\s*(km|m|cm|kg|g)\/(h|s|min)\b/gi, (m0, d, u1, u2) => `${d} ${UNIT_SAY[u1.toLowerCase()]} trên ${UNIT_SAY[u2.toLowerCase()]}`);
        t = t.replace(/(\d)\s*(km|cm|mm|kg|ms)\b/g, (m0, d, u) => `${d} ${UNIT_SAY[u]}`);
        // (2.8.0) The VieNeu normalizer reads most units glued to a number itself ("400g" bốn trăm gam,
        // "500ml", "225°C" độ xê, "45W" oát, "12GB"), checked with tools/vieneu-g2p.py. Not these:
        // "4 mph" (said "mph"), "15$" ("u s d")
        t = t.replace(/(\d)\s?mph(?![\p{L}\p{N}])/gu, "$1 dặm một giờ");
        t = t.replace(/(\d[\d.,]*)\s?\$(?![\p{L}\p{N}])/g, "$1 đô la");
        // a cook's fraction: "1/2 cốc" is "nửa cốc", "3/4 chén" "ba phần tư chén" (VieNeu: "ba trên bốn"); not a date ("ngày 1/4")
        // nor "24/7" (numerator not below its denominator)
        t = t.replace(/(?<![\p{L}\p{N}/.,])([1-7])\/([2-8])(?![\p{N}/])/gu, (m0, a, b, at, all) => {
            if (+a >= +b || /(?:ngày|hôm|tháng|mùng|mồng)\s*$/i.test(all.slice(0, at))) return m0;
            if (a === "1" && b === "2") return "nửa";
            return `${numberToVietnamese(+a)} phần ${b === "4" ? "tư" : numberToVietnamese(+b)}`;
        });
        // (2.8.3) a slash between words (after the web addresses and the units: "km/h"): "per" before a unit of time or count
        // ("dặm/giờ" một giờ, "50 nghìn/người"), kept between single letters ("P/E", "A/B"), "or" else
        t = t.replace(/(\p{L}{1,40})\s*\/\s*(\p{L}{1,40})/gu, (m0, a, b) =>
            (a.length < 2 && b.length < 2 || /^(?:km|m|cm|mm|kg|g)$/i.test(a) && /^(?:h|s|min)$/i.test(b) ? m0
                : /^(?:giờ|phút|giây|ngày|tuần|tháng|năm|người|lần|suất|cái|chiếc|gói|hộp|kg|ký|cân|lít|m2|tiếng|h|s|min)$/i.test(b) ? `${a} một ${b}` : `${a} hoặc ${b}`));
        t = t.replace(/\be\.g\.,?/gi, "ví dụ,").replace(/\bi\.e\.,?/gi, "tức là,");
        t = t.replace(/(ví dụ|tức là),\s+\1(?![\p{L}])/giu, "$1");   // "e.g. ví dụ" said the same words twice
        // Ngoặc đơn: đọc như chú thích, ngắt nghỉ nhẹ hai bên
        // 2.6.1: one letter in parentheses glued to a code is part of its name: "401(k)", "Lp(a)",
        // "Ear (a)": the letter, no pause
        t = t.replace(/\s*\(([^()]{1,80})\)\s*/g, (m0, inner, at, all) =>
            /^[a-z]$/.test(inner) && /(?:^|[^\p{L}\p{N}])(?:\d{3,}|[A-Za-z]*[A-Z][A-Za-z]*)$/u.test(all.slice(0, at)) ? m0 : `, ${inner}, `);
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
    // 2.5.4: a note with words after the sound ("(Nhạc nền sôi động)", "(tiếng gõ cửa)", "(upbeat
    // music)") was read aloud: the user is not hard of hearing and does not want the captions'
    // descriptions read. A parenthesis that opens on a sound (not "nhạc sĩ", not a language
    // "tiếng Anh") and stays short is a note, whatever follows.
    const SOUND_HEAD_RE = /^(?:(?:có|những|các)\s+)?(?:(?:tiếng|âm thanh)(?!\s+(?:anh|việt|pháp|nhật|hàn|trung|đức|nga|ý|tây|bồ|thái|lào|khmer|hoa|quan|quảng|lóng|địa|mẹ|nói|người)(?![\p{L}\p{N}]))|nhạc(?!\s+(?:sĩ|cụ|trưởng|viện|phẩm|lý|kịch|công|sư))|âm nhạc|giai điệu|cười|vỗ tay|hò reo|reo hò|khán giả|đám đông|im lặng|thở|huýt sáo|hát|hoan hô|hò hét|la hét|reo|khóc|nức nở|hắt hơi|chuông|còi|gõ cửa)(?![\p{L}\p{N}])/iu;
    const SOUND_EN_RE = /\b(?:music|musical|applause|laughter|laughs?|laughing|cheers?|cheering|chuckl\w*|sighs?|gasps?|whoosh\w*|beep\w*|ringing|rings|playing|instrumental|sound|noise|silence|inaudible|indistinct|crowd)\b/i;
    const isSoundNote = inner => {
        const t = inner.replace(/¦/g, "").trim();
        if (SOUND_RE.test(t)) return true;
        if (t.split(/\s+/).length > 7) return false;
        return SOUND_HEAD_RE.test(t) || (/^[a-z]/.test(t) && SOUND_EN_RE.test(t));
    };
    // srcNotesOnly: the line's source is only notes ("[upbeat music]", "(door closes)"): then every
    // parenthesis of the translation is that note, however it was worded
    function stripSoundNotes(text, srcNotesOnly = false) {
        return String(text || "")
            .replace(/\[[^\]]*\]|[♪♫]+/g, " ")
            .replace(/\(([^()]{1,60})\)/g, (m, inner) => (srcNotesOnly || isSoundNote(inner) ? " " : m))
            .replace(/\s{2,}/g, " ").trim();
    }
    // (2.8.1) A parenthesis that holds a sentence is speech, not a note: subtitled Japanese and Korean
    // vlogs put a cat's or a thought's words in brackets ("(Cat: Are you listening?)"), and a line of
    // nothing else was taken for a sound note and never read. A note is a sound (isSoundNote) or a
    // word or two ("(door closes)", "(Speaking Japanese)")
    const notesOnly = text => /[\[(♪♫]/.test(text) && !hasWords(String(text || "").replace(/\[[^\]]*\]|[♪♫]+/g, " ")
        .replace(/\(([^()]*)\)/g, (m, inner) => (isSoundNote(inner) || inner.trim().split(/\s+/).length < 3 ? " " : m)));
    const hasWords = t => /[\p{L}\p{N}]/u.test(String(t || "").replace(/¦/g, ""));

    // A speaker label of edited captions ("ANDREW HUBERMAN: Welcome to...") stays in the translation,
    // so the subtitle still says who speaks, but it is not read: the voice said "Andy Galpin" and
    // "Andrew Huberman" 262 times in one 3-hour podcast (the user's 2026-10-01 batch), each one heard
    // as words of the sentence, on a fast talk that dropped lines for time. Only a label in capitals
    // that the group's own source carries is taken out, where a line or a sentence starts.
    // (a line may end on the label: "... vì-- ANDY GALPIN:"; a hint mark ¦ may stand before it)
    // News transcripts write a guest's first turn with who they are ("TAMARA KEITH, National Public
    // Radio:", "REP. MARIA ELVIRA SALAZAR (R-FL):"): that goes too, translated or not, for a name of
    // two words or more that the source writes that way (2.5.3; "NASA, the agency, said:" is no label)
    const LABEL_RE = /(^[\s¦]*|[.!?…—–-]["”')\]]*[\s¦]+)(\p{Lu}[\p{Lu}\p{M}.'’-]*(?:\s+\p{Lu}[\p{Lu}\p{M}.'’-]*){0,4}):(?:\s+|$)/gmu;
    const LABEL_WHO_RE = /(^[\s¦]*|[.!?…—–-]["”')\]]*[\s¦]+)(\p{Lu}[\p{Lu}\p{M}.'’-]*(?:\s+\p{Lu}[\p{Lu}\p{M}.'’-]*){0,4})((?:\s*\([^()\n]{1,40}\))?(?:,\s+[^:\n]{1,120})?):(?:\s+|$)/gmu;
    function speakerLabels(src) {
        const out = new Set();
        for (const m of String(src || "").matchAll(LABEL_RE)) if (/\p{Lu}{2}/u.test(m[2])) out.add(m[2]);
        for (const m of String(src || "").matchAll(LABEL_WHO_RE)) {
            if (m[3] && /\p{Lu}{2}/u.test(m[2]) && /\s/.test(m[2]) && /^\s*\(|^,\s+[\p{Lu}\d]/u.test(m[3]) && m[3].length <= 92) out.add(m[2]);
        }
        return out;
    }
    function stripSpeakerLabels(text, labels) {
        if (!labels || !labels.size) return text;
        return String(text || "").replace(LABEL_WHO_RE, (m, lead, name) => (labels.has(name) ? lead : m));
    }
    // The same, keeping where each label stood: the index of the word after it in the text left
    // (buildDubScript cuts a turn the source names right there)
    function stripLabelsAt(text, labels) {
        const MARK = "\u2063";
        const marked = labels && labels.size ? String(text || "").replace(LABEL_WHO_RE, (m, lead, name) => (labels.has(name) ? lead + MARK : m)) : String(text || "");
        if (marked.indexOf(MARK) < 0) return { text: marked, at: [] };
        const words = [], at = [];
        for (const w of marked.split(/\s+/).filter(Boolean)) {
            if (w.indexOf(MARK) >= 0) at.push(words.length);
            const rest = w.split(MARK).join("");
            if (rest) words.push(rest);
        }
        return { text: words.join(" "), at };
    }

    // ---------------- Who speaks (2.4.8; 2.5.2: an AI reading; 2.5.3: up to eight voices) ----------------
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
    // A name in capitals may carry a party or a title after it, the way news transcripts write a
    // speaker's first turn ("TAMARA KEITH, National Public Radio:", "COL. JOEL RAYBURN (RET.):",
    // "REP. MARIA ELVIRA SALAZAR (R-FL):"). Missed, that whole first answer stayed in the host's
    // voice: 4 of 19 news panels lost 15 to 30 points (2026-10-16 speaker lab)
    const NAMED_CAPS_RE = /^([A-Z][A-Z.'’ -]{1,44}[A-Z.])(?:\s*\([^()]{1,30}\))?(?:,\s+[^:]{1,90})?:\s/;
    const NOT_A_NAME = /^(?:Note|Step|Example|Tip|Warning|Q|A|Translator|Reviewer|Transcriber|Transcript|Subtitles?|Captions?|Source|Credits?|Update|Edit|Disclaimer)$/i;
    const NAME_PARTICLE = /^(?:de|da|del|der|di|du|la|le|van|von|bin|al|y)$/;
    const TURN_MIN_NAMED = 3;
    const LABEL_SAME_SHARE = 0.25;
    const LABEL_GAP_SHARE = 0.5;
    // As many voices as speakers, up to eight (S1..S8; five in 2.5.2): a ninth speaker and on share the
    // voices after the main one. Over 30 news videos with named transcripts (2026-10-16), five
    // voices left 7 people in another speaker's voice on panels and reports; the free voice has 25
    const MAX_VOICES = 8;
    const voiceIdx = rank => (rank < MAX_VOICES ? rank : 1 + ((rank - 1) % (MAX_VOICES - 1)));
    // An AI reading of who speaks (background.js analyzeSpeakers, turned into times by speakerHints)
    // is taken only for a real conversation. A speaker heard once and briefly (a quote read as a
    // turn) is folded into whoever spoke before: a voice of its own needs AI_MIN_TURNS turns or
    // AI_MIN_TALK_S seconds of talk (15 s in 2.5.2 folded real interviewees of news reports into the
    // reporter's voice: 8 s, +0.7 points of words in the right voice over 30 videos, no monologue
    // given a second voice). A turn within AI_SNAP_S of a ">>" the recognizer wrote moves onto it
    // (the AI knows who, the recognizer heard when).
    const AI_MIN_TURNS = 2;
    const AI_MIN_TALK_S = 8;
    const AI_SNAP_S = 2;
    // "Yeah. ANDREW HUBERMAN: ..." (UIy-WQCZd4M): the last word of the one before, then the label. The
    // name is what follows the last sentence end, unless that end is a title's ("Dr. Galpin:")
    const TITLE_ABBR = /^(?:Dr|Mr|Mrs|Ms|Mx|Prof|St|Jr|Sr|Rev|Gen|Col|Capt|Sgt|Lt)$/;
    const nameOf = text => {
        const caps = String(text || "").match(NAMED_CAPS_RE);
        const m = caps && /[A-Z]{2}/.test(caps[1]) ? caps : String(text || "").match(NAMED_RE);
        if (!m) return null;
        let name = m[1].trim();
        let cut = -1;
        for (const e of name.matchAll(/([A-Za-z]+)[.!?…]\s+/g)) if (!TITLE_ABBR.test(e[1])) cut = e.index + e[0].length;
        if (cut > 0) name = name.slice(cut);
        if (!name || NOT_A_NAME.test(name)) return null;
        const words = name.split(/\s+/);
        return words.length <= (m === caps ? 6 : 4) && words.every(w => /^[A-Z]/.test(w) || NAME_PARTICLE.test(w)) ? name : null;
    };
    const turnsMemo = typeof WeakMap === "function" ? new WeakMap() : null;
    // opts.ai: the AI reading for this video ({ turns: [{ t, speaker }], speakers, confidence,
    // until }, speakerHints below), or null
    function speakerTurns(groups, opts = {}) {
        const ai = opts.ai || null;
        const memo = turnsMemo && Array.isArray(groups) ? turnsMemo.get(groups) : null;
        if (memo && memo.n === groups.length && memo.ai === ai) return memo.turns;
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
        const labels = pieces.filter(p => p.kind === "named");
        const labelled = labels.length >= TURN_MIN_NAMED;
        const complete = labelled && labelsComplete(labels, endT);
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
        // of the talk, was the second voice because the host spoke first), the next ones a voice each
        // in order of talk (2.5.2; before, everyone else shared the second voice)
        // Labels that name only some of the turns (a host's "Amna:" before each question, the guests'
        // answers bare) give way to an AI reading: on 4 of 30 news videos they put the whole video
        // in one or two voices (28 to 75% of the words right), the reading 77 to 99%
        let source = "none", genders = [], out = marks;
        const viaAi = ai && !complete ? acceptAiTurns(ai, endT, anon.map(p => p.t)) : null;
        if (viaAi) {
            out = viaAi.marks;
            genders = viaAi.genders;
            source = "ai";
        } else if (labelled && marks.length > 1) {
            const rank = rankByTalk(marks.map(m => ({ t: m.t, sp: m.idx })), endT);
            for (const m of marks) m.idx = voiceIdx(rank.get(m.idx));
            source = "names";
        } else {
            if (!labelled && marks.length) {
                let flip = false;
                marks.forEach((m, k) => {
                    let i = m.idx ^ (flip ? 1 : 0);
                    if ((k + 1 < marks.length ? marks[k + 1].t : endT) - m.t >= TURN_MAIN_S && i !== 0) { flip = !flip; i = 0; }
                    m.idx = i;
                });
                source = "marks";
            } else if (labelled) source = "names";
        }
        const voices = out.reduce((n, m) => Math.max(n, m.idx + 1), 1);
        const turns = { marks: out, conversation, labelled, complete, anon: anon.length, paired, source, voices, genders };
        if (turnsMemo && Array.isArray(groups)) turnsMemo.set(groups, { n: groups.length, ai, turns });
        return turns;
    }
    // "NAME:" labels that name every turn: two names or more, a name seldom right after itself (a
    // host labelled before each question, the answers bare, repeats it) and no stretch without a
    // label over half the labelled talk (the anchors labelled at the start and the end of a report)
    function labelsComplete(named, endT) {
        if (new Set(named.map(p => p.name)).size < 2) return false;
        let same = 0, gap = endT - named[named.length - 1].t;
        for (let k = 1; k < named.length; k++) {
            if (named[k].name === named[k - 1].name) same++;
            gap = Math.max(gap, named[k].t - named[k - 1].t);
        }
        return same <= LABEL_SAME_SHARE * (named.length - 1) && gap <= LABEL_GAP_SHARE * Math.max(1, endT - named[0].t);
    }
    // Talk per speaker over time-ordered turns ({ t, sp }), each turn running to the next one (the
    // last to endT): the rank of each speaker, the one who talks longest first
    function talkBySpeaker(turns, endT) {
        const talk = new Map();
        turns.forEach((x, k) => {
            const s = talk.get(x.sp) || { talk: 0, turns: 0, first: x.t };
            s.talk += Math.max(0, (k + 1 < turns.length ? turns[k + 1].t : endT) - x.t);
            s.turns++;
            talk.set(x.sp, s);
        });
        return talk;
    }
    function rankByTalk(turns, endT) {
        const order = [...talkBySpeaker(turns, endT)].sort((a, b) => b[1].talk - a[1].talk || a[1].first - b[1].first);
        return new Map(order.map(([sp], r) => [sp, r]));
    }
    function acceptAiTurns(ai, endT, markTimes) {
        if (!ai || ai.confidence === "low" || !Array.isArray(ai.turns)) return null;
        const until = Math.min(endT, Number.isFinite(ai.until) ? ai.until : endT);
        let turns = ai.turns.filter(x => x && Number.isFinite(x.t) && x.speaker != null && x.t <= until)
            .map(x => ({ t: x.t, sp: String(x.speaker) })).sort((a, b) => a.t - b.t);
        const near = (markTimes || []).slice().sort((a, b) => a - b);
        if (near.length) {
            turns = turns.map(x => {
                let best = null;
                for (const m of near) if (Math.abs(m - x.t) <= AI_SNAP_S && (best == null || Math.abs(m - x.t) < Math.abs(best - x.t))) best = m;
                return best == null ? x : { ...x, t: best };
            });
        }
        const squash = list => list.filter((x, k) => k === 0 || x.sp !== list[k - 1].sp);
        turns = squash(turns);
        // fold the minor speakers until none is left (folding one can merge two turns of another)
        for (let pass = 0; pass < 4; pass++) {
            const talk = talkBySpeaker(turns, until);
            const minor = new Set([...talk].filter(([, s]) => s.turns < AI_MIN_TURNS && s.talk < AI_MIN_TALK_S).map(([sp]) => sp));
            if (!minor.size) break;
            turns = squash(turns.filter(x => !minor.has(x.sp)));
        }
        const rank = rankByTalk(turns, until);
        if (rank.size < 2) return null;
        const marks = turns.map(x => ({ t: x.t, idx: voiceIdx(rank.get(x.sp)) }));
        // Past the part read (a long video still being read in parts): the main voice
        if (until < endT - 1 && marks.length && marks[marks.length - 1].idx !== 0) marks.push({ t: until, idx: 0 });
        const genders = [];
        for (const [sp, r] of rank) {
            const s = (ai.speakers || []).find(x => String(x.id) === sp);
            if (r < MAX_VOICES) genders[r] = s && /^(male|female)$/.test(s.gender) ? s.gender : "unknown";
        }
        return { marks, genders };
    }
    // One voice: nobody's turn ends a segment
    const NO_TURNS = Object.freeze({ marks: Object.freeze([]), conversation: false, labelled: false, complete: false, anon: 0, paired: 0, source: "none", voices: 1, genders: Object.freeze([]) });

    // ---- The lines an AI reading is asked about, and its answer as times (2.5.2) ----
    // Every caption line of the video in time order (each group's source; a line shared by two
    // groups once), sound-only lines left out. The answer names lines by their index in this list.
    // Captions cut into short pieces (half of them under JOIN_SHORT characters, as recognizer
    // captions are) go joined into sentences (joinCaptionLines).
    function speakerLines(groups) {
        const seen = new Set();
        const out = [];
        for (const g of (groups || []).filter(x => x && x.srcCues).sort((a, b) => a.start - b.start)) {
            for (const c of g.srcCues) {
                const text = String(c.text || "").replace(/\s+/g, " ").trim();
                const key = c.start + "|" + text;
                if (!text || seen.has(key) || TURN_NOTE.test(text)) continue;
                seen.add(key);
                out.push({ start: c.start, end: c.end, text });
            }
        }
        const sizes = out.map(l => l.text.length).sort((a, b) => a - b);
        const pieces = splitAtMarks(out);
        return sizes.length && sizes[sizes.length >> 1] < JOIN_SHORT ? joinCaptionLines(pieces) : pieces;
    }
    // A ">>" inside a caption line opens a line of its own (2.6.6), as it already did when short
    // pieces are joined: the reading names turns by line, so a turn inside a line was placed at the
    // line's start or not at all. qSlxe4hA66g (Korean recognizer captions, two lines a caption, 92 of
    // 167 captions carry a ">>", most of them inside): the reading gave one speaker to whole lines
    // holding two or three turns. A piece's time is its share of the line's characters, as the
    // marks' times are in speakerTurns. Which length decides joining is still the whole lines'.
    function splitAtMarks(lines) {
        const out = [];
        for (const l of lines) {
            const text = l.text;
            const at = [...text.matchAll(/>>/g)].map(m => m.index).filter(i => i > 0);
            if (!at.length) { out.push(l); continue; }
            const span = l.end - l.start;
            const cuts = [0, ...at, text.length];
            for (let k = 0; k + 1 < cuts.length; k++) {
                const piece = text.slice(cuts[k], cuts[k + 1]).trim();
                if (!piece || piece === ">>" || TURN_NOTE.test(piece.replace(/^>>\s*/, ""))) continue;
                out.push({ start: l.start + span * cuts[k] / text.length, end: l.start + span * cuts[k + 1] / text.length, text: piece });
            }
        }
        return out;
    }
    // Short caption pieces joined into sentences: a piece goes on the line before unless that line
    // ends a sentence, would pass JOIN_MAX characters, or JOIN_GAP seconds of silence lie between;
    // a ">>", "- " or "NAME:" piece always opens a line. Read piece by piece, a long talk made the
    // model write a turn for nearly every line: 1289 pieces of a 30-minute show (JBvcMfa7K6E, half
    // of them under 23 characters) ran its 900-line part into the 16,384-token cap at temperature
    // 0 and 1 (55 to 58 turns kept; 10,799 tokens for 104 at 0.5); its 637 sentences read in one
    // call, 5,227 tokens, 178 turns, 3 speakers. On 7 news videos captioned in pieces the words in
    // the right voice moved 0.3 points (noise); on 22 captioned in whole lines joining cost 3.9, so
    // those stay as they are
    const JOIN_SHORT = 40, JOIN_MAX = 160, JOIN_GAP = 1.5;
    const TURN_OPEN = /^(?:>>|-\s|\p{Lu}[\p{Lu}\p{M}.'’-]*(?:\s+\p{Lu}[\p{Lu}\p{M}.'’-]*){0,4}:\s)/u;
    function joinCaptionLines(caps) {
        const out = [];
        let cur = null;
        for (const c of caps) {
            if (cur && !TURN_OPEN.test(c.text) && c.start - cur.end < JOIN_GAP && !/[.!?…]["”')\]]*$/.test(cur.text) &&
                cur.text.length + 1 + c.text.length <= JOIN_MAX) {
                cur.parts.push({ pos: cur.text.length + 1, start: c.start, end: c.end, len: c.text.length });
                cur.text += " " + c.text;
                cur.end = Math.max(cur.end, c.end);
                continue;
            }
            cur = { start: c.start, end: c.end, text: c.text, parts: [{ pos: 0, start: c.start, end: c.end, len: c.text.length }] };
            out.push(cur);
        }
        return out;
    }
    // The time of a character of a line: within the caption piece it came from
    function timeIn(l, pos) {
        if (!l.parts) return l.start + (l.end - l.start) * pos / Math.max(1, l.text.length);
        let p = l.parts[0];
        for (const q of l.parts) if (q.pos <= pos) p = q;
        return p.start + (p.end - p.start) * Math.min(1, Math.max(0, pos - p.pos) / Math.max(1, p.len));
    }
    // answer: { speakers: [{ id, label, gender }], turns: [{ line, speaker, at }], confidence } for
    // lines[from .. from + count - 1]. A turn starting inside a line ("at": its first words) takes
    // its time from where those words stand in the line, as a ">>" does.
    function speakerHints(lines, answer, from = 0, count = lines.length - from) {
        const turns = [];
        for (const x of (answer && answer.turns) || []) {
            const i = from + (x && Number.isInteger(x.line) ? x.line : -1);
            if (i < from || i >= from + count || i >= lines.length) continue;
            const found = findAt(lines, i, String((x && x.at) || ""), from, Math.min(lines.length, from + count)) || afterSentenceTail(lines, i, from);
            const c = lines[found ? found.line : i];
            let t = c.start;
            if (found && found.pos > 0) t = timeIn(c, found.pos);
            turns.push({ t, speaker: x.speaker });
        }
        const last = lines[Math.min(lines.length, from + count) - 1];
        return { turns, speakers: (answer && answer.speakers) || [], confidence: (answer && answer.confidence) || "low", until: last ? last.end : 0 };
    }
    // Where a turn's first words ("at") stand: the longest start of them (2 words or more) found in
    // the line named, else in the one after or before it, case and punctuation aside; the words may
    // run on into the next line ("... the CEO >> I" / "felt like the country"). The reading often
    // gives a whole sentence running into the next line, or counts one line off: of 191 turns
    // inside a line over 30 news videos, 42 were not found as written and went to the line start
    function findAt(lines, i, at, lo, hi) {
        const key = w => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
        const want = String(at).split(/\s+/).map(key).filter(Boolean);
        if (!want.length) return null;
        const toksOf = j => [...lines[j].text.matchAll(/\S+/g)].map(m => ({ k: key(m[0]), pos: m.index })).filter(x => x.k);
        for (let k = Math.min(want.length, 6); k >= Math.min(2, want.length); k--) {
            for (const j of [i, i + 1, i - 1]) {
                if (j < lo || j >= hi) continue;
                const own = toksOf(j);
                const toks = j + 1 < hi ? [...own, ...toksOf(j + 1)] : own;
                for (let s = 0; s < own.length && s + k <= toks.length; s++) {
                    let same = true;
                    for (let q = 0; q < k && same; q++) same = toks[s + q].k === want[q];
                    if (same) return { line: j, pos: toks[s].pos };
                }
            }
        }
        return null;
    }
    // A turn named by its line alone (no first words, or none found: 236 of 411 turns): when the
    // line opens on the tail of a sentence (the line before ends without . ! ?), the one talking
    // finishes it and the turn comes after it ("pain. Over to you."). Over 29 news videos read from
    // recognizer-like captions it moved 42 turns, 32 nearer the real one and 8 farther: words in the
    // right voice 89.4 -> 90.2% (2.5.3). "Dr. Smith" and "U. S." are no sentence end
    function afterSentenceTail(lines, i, lo) {
        if (i <= lo || /[.!?…]["”')\]]*$/.test(lines[i - 1].text.trim())) return null;
        for (const m of lines[i].text.matchAll(/([\p{L}\p{N}'’]+)[.!?…]+["”')\]]*\s+(?=\S)/gu)) {
            if (TITLE_ABBR.test(m[1]) || /^\p{Lu}$/u.test(m[1])) continue;
            return { line: i, pos: m.index + m[0].length };
        }
        return null;
    }
    // Parts of a long video read one after another: one reading, the later part's turns after the
    // earlier one's, its "until"
    function mergeSpeakerHints(a, b) {
        if (!a) return b;
        if (!b) return a;
        const rank = { low: 0, medium: 1, high: 2 };
        return {
            turns: [...a.turns.filter(x => x.t < (b.turns[0] ? b.turns[0].t : Infinity)), ...b.turns],
            speakers: [...a.speakers, ...b.speakers.filter(s => !a.speakers.some(o => String(o.id) === String(s.id)))],
            confidence: rank[b.confidence] < rank[a.confidence] ? b.confidence : a.confidence,
            until: Math.max(a.until || 0, b.until || 0)
        };
    }
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

    // Where a piece may be cut at a turn inside it, in order of preference, and how far from the
    // turn's share of the piece's time (buildDubScript)
    const TURN_CUTS = [[/(?:[.!?…]|--|—)["”')\]]*$/, 0.3], [/[,;:]["”')\]]*$/, 0.2]];
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
        const SEG_STRETCH = opts.segStretch != null ? opts.segStretch : 2;
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
            const srcNotes = (g.srcCues || []).length > 0 && notesOnly((g.srcCues || []).map(c => c.text).join(" "));
            const cueLabels = [];
            const cueTexts = g.viCues.map((c, k) => {
                if (!SEG) return c.text;
                const part = tokens.slice(ti, ti + cueTok[k]);
                ti += cueTok[k];
                return part.map(t => (t.hint ? "¦ " : "") + t.raw).join(" ");
            }).map((t, k) => { const r = stripLabelsAt(stripSoundNotes(t, srcNotes), labels); cueLabels[k] = r.at; return r.text; });
            // where in a piece of words from .. to of cue k a label stood (0: none inside it)
            const labelIn = (k, from, to) => { const x = (cueLabels[k] || []).find(i => i > from && i < to); return x == null ? 0 : x - from; };

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
                    if (!cuts1.length) { pieces.push({ start: c.start, end: c.end, text: cueTexts[k], labelAt: labelIn(k, 0, words.length) }); return; }
                    let f1 = 0, s1 = c.start;
                    [...cuts1, words.length].forEach(to => {
                        const ps = syl1.slice(f1, to).reduce((a, b) => a + b, 0);
                        const e1 = to === words.length ? c.end : s1 + dur * ps / total1;
                        pieces.push({ start: s1, end: e1, text: words.slice(f1, to).join(" "), labelAt: labelIn(k, f1, to) });
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
                    pieces.push({ start: t0, end: t1, text: part.join(" "), labelAt: labelIn(k, from, to) });
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
            // hot."): the piece is cut at the sentence end nearest the turn's share of its time. 2.5.3:
            // an interrupted one ("vì-- Vâng, chắc chắn rồi.") ends there too, and failing both, a
            // comma close to the turn does: over the user's 5 saved conversations the voice changed
            // mid-sentence 18 times in 652 ("vì-- Vâng," | "chắc chắn rồi.", the "yeah" in the wrong voice)
            for (let k = 0; k < pieces.length; k++) {
                const c = pieces[k];
                // (a label stands where the source line starts; the translation's line may give its
                // words less time than they had, the turn then falls just after the piece)
                const inside = TURNS.marks.find(m => m.t > c.start + 0.15 && m.t < c.end - 0.15) ||
                    (c.labelAt > 0 ? TURNS.marks.find(m => m.t > c.start + 0.15 && m.t < c.end + 2) : null);
                if (!inside) continue;
                const words = String(c.text).split(/\s+/).filter(Boolean);
                const syl = words.map(w => Math.max(1, tokenSyllables(w.replace(/¦/g, ""))));
                const total = syl.reduce((a, b) => a + b, 0) || 1;
                const share = (inside.t - c.start) / (c.end - c.start);
                // a label the source carries says where exactly (the translation keeps 262 of 339)
                let best = c.labelAt > 0 && c.labelAt < words.length ? c.labelAt : -1;
                for (const [mark, near] of best > 0 ? [] : TURN_CUTS) {
                    let bestCost = Infinity, acc = 0;
                    for (let w = 0; w < words.length - 1; w++) {
                        acc += syl[w];
                        if (!mark.test(words[w])) continue;
                        const cost = Math.abs(acc / total - share);
                        if (cost < bestCost && cost < near) { bestCost = cost; best = w + 1; }
                    }
                    if (best >= 0) break;
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
            pieces.forEach((c, pi) => {
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
                // 2.5.3, free voice: a cut the length forces where no line boundary is better and that
                // falls inside a phrase ("cường độ cao với | những quãng nghỉ") waits for the end of
                // this line, up to SEG_STRETCH s more, when speech may pause there. 39 of the 7794 cuts
                // over the user's 44 saved videos fell inside a phrase, 38 of them forced by length.
                // Not near where playback starts: the first request stays short (HEAD_HARD)
                const next = pieces[pi + 1];
                const stretch = JOIN && cur && hardFor(cur.start) === SEG_HARD && len2 > SEG_HARD && len2 <= SEG_HARD + SEG_STRETCH &&
                    !endsWithPunct(cur.texts[cur.texts.length - 1]) && insidePhrase(cur, c) &&
                    (endsWithPunct(c.text) || (!!next && !insidePhrase({ texts: [c.text] }, next)));
                const tooLong = cur && (len2 > hardFor(cur.start) + (stretch ? SEG_STRETCH : 0) || (cur.end - cur.start >= SEG_SOFT && endsWithPunct(cur.texts[cur.texts.length - 1])));
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

    // Captions that are already Vietnamese (a site's official track): one dub group per cue, in the
    // shape the translator makes, so the planner, the pacing and the pauses see no difference.
    // Cues are { start, end, text } or TextTrack cues { startTime, endTime, text }.
    function groupsFromViCues(cues) {
        const out = [];
        for (const c of cues || []) {
            const start = c.start !== undefined ? c.start : c.startTime;
            const end = c.end !== undefined ? c.end : c.endTime;
            const text = String((c && c.text) || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
            if (!text || !isFinite(start) || !isFinite(end) || end <= start) continue;
            out.push({ start, end, viText: text, srcCues: [{ start, end, text }], viCues: [{ start, end, text }] });
        }
        return out;
    }

    const api = {
        groupsFromViCues, numberToVietnamese, countSyllables, adaptForSpeech, numberRole, classifyIntent, buildPhrases, speakerTurns, speakerAt, NO_TURNS, MAX_VOICES, speakerLines, speakerHints, mergeSpeakerHints,
        buildDubScript, stripSoundNotes, notesOnly, speakerLabels, stripSpeakerLabels, stripLabelsAt, planSegment, planAll, smoothRates, speechSeconds, pauseSeconds, rateForSps, rateForSpeedup, speedMultiplier,
        DEFAULT_VOICE_MODEL, LIMITS, INTENT_PROSODY, PAUSE
    };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_DUB_PLAN = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

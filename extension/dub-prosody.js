// ============================================================
// PROSODY: where Vietnamese speech may pause, how strongly, and which of a voice's own stops to keep
//
// The free voice (VieNeu) decides where it stops; the extension can only shorten those stops, never
// create one. So pause placement is a selection problem over the stops the voice made:
//   analyze(text)      every gap between two words gets a boundary value from the subtitle
//                      segmenter's linguistic scoring (clause openers, compounds, terms, numbers +
//                      units, names, words that need the next word...) and, at punctuation, a role
//                      (sentence, clause, lead-in, list item, comma) and a target pause length
//   choose(...)        punctuation the voice honoured is always kept; among its other stops a
//                      dynamic program picks the subset that maximises boundary value minus a cost
//                      per pause, minus a penalty for runs of speech that are too short (choppy) or
//                      too long (no breath), measured in the take's own voiced seconds
//   breathGroups(text) the same selection on text alone (no audio), with estimated durations
// Pure: no DOM, no audio. Runs in the page, the service worker and Node.
// ============================================================
(function (root) {
    "use strict";
    const SEG = (root && root.CST_VI_SEG) ||
        (typeof require === "function" ? (() => { try { return require("./vi-segmenter.js"); } catch (e) { return null; } })() : null);

    // Model constants. Measured on 56 sentences x 5 real VieNeu takes (Mỹ Duyên, Thái Sơn), see
    // docs/DUBBING.md "Prosody model (1.7.6)"; three held-out sets of 16 checked the result
    // (tests/prosody-corpus.js, tools/prosody-eval.js).
    const K = {
        valueAt: 5, valueScale: 20,   // boundary value = (valueAt - segmenter cost) / valueScale
        pauseCost: 0.9,              // every pause the text does not ask for must earn this much
        shortRun: 0.8, shortWeight: 2,  // a run of speech under 0.8 s voiced is choppy ...
        longRun: 2.6, longWeight: 0.45, // ... one over 2.6 s voiced needs a breath (quadratic)
        voiceWeight: 0.5,             // a long stop is the voice's own phrasing: it adds up to this
        minStop: 0.12,                // a shorter stop is never kept as a pause
        breathKeep: 0.14,             // (2.1.8) a breathing comma keeps at least this (else phrasePause)
        minValue: 0,                  // below this a gap is inside a phrase: never a pause, however long the run
        // A subject boundary is invited when the subject has subjectLong syllables or the clause
        // subjectClauseMin (1.9.5): ~4.3 s at sps, one breath
        subjectClauseMin: 20, subjectLong: 8,
        sps: 4.6                      // text-only estimate of voiced syllables per second
    };

    // Syllables a token takes to say. The planner's count reads it as the voice does ("GPU" 3, "72"
    // 3, "usage" 2); the fallback counts vowel groups and digits. Positions in the text are measured
    // in these, so a take's stops are placed right after an acronym or a number.
    const plan = () => (root && root.CST_DUB_PLAN) ||
        (typeof require === "function" ? (() => { try { return require("./dub-planner.js"); } catch (e) { return null; } })() : null);
    const speech = () => (root && root.CST_DUB_SPEECH) ||
        (typeof require === "function" ? (() => { try { return require("./dub-speech.js"); } catch (e) { return null; } })() : null);
    function syllables(raw) {
        const P = plan();
        const n = P ? P.countSyllables(raw) : 0;
        return n > 0 ? n : spokenWeight(raw);
    }
    const VOWELS = /[aeiouyàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]+/g;
    function spokenWeight(word) {
        const w = String(word || "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
        if (!w) return 0;
        if (/\d/.test(w)) return Math.max(1, w.replace(/\D/g, "").length);
        const g = w.match(VOWELS);
        return Math.max(1, g ? g.length : 1);
    }

    const OPENERS = (SEG && SEG._lex && SEG._lex.OPENERS) || {};
    const LEFT_BIND = (SEG && SEG._lex && SEG._lex.LEFT_BIND) || {};
    // A fronted subordinate clause: the comma that closes it is a real clause boundary
    const SUBORDINATE = /^(nếu|khi|sau khi|trước khi|trong khi|mặc dù|dù|tuy|vì|bởi vì|do|để|nhờ|giả sử|một khi|mỗi khi|cho dù|ngay khi|trong trường hợp)$/;
    // Joining words a comma leans on into (the next item follows closely)
    const JOINERS = new Set(["và", "hoặc", "hay", "rồi", "mà", "cùng"]);
    const bare = w => String(w || "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
    const round3 = x => Math.round(x * 1000) / 1000;

    // Longest opener phrase starting at word i, and its segmenter weight
    function openerAt(words, i) {
        for (let len = 4; len >= 1; len--) {
            if (i + len > words.length) continue;
            const parts = words.slice(i, i + len);
            if (parts.slice(0, -1).some(w => w.punct)) continue;
            const p = parts.map(w => w.bare).join(" ");
            if (OPENERS[p] !== undefined) return { phrase: p, weight: OPENERS[p] };
        }
        return null;
    }

    function tokenizeWords(text) {
        if (SEG) return SEG.tokenize(text).map(t => t.raw);
        return String(text || "").split(/\s+/).filter(Boolean);
    }

    function punctOf(raw) {
        const m = String(raw).match(/([.!?…]|[;:]|,)["”')\]]*$/);
        if (!m) return null;
        return /[.!?…]/.test(m[1]) ? "sentence" : /[;:]/.test(m[1]) ? "clause" : "comma";
    }

    // ---- 1. Text analysis (memoised: the same segment text is analysed once) ----
    const memo = new Map();
    function analyze(text) {
        const key = String(text || "");
        let hit = memo.get(key);
        if (hit) return hit;
        hit = analyzeUncached(key);
        if (memo.size >= 600) memo.clear();
        memo.set(key, hit);
        return hit;
    }

    function analyzeUncached(text) {
        const raws = tokenizeWords(text);
        const words = raws.map(raw => ({ raw, bare: bare(raw), syl: syllables(raw), punct: punctOf(raw), mark: (raw.match(/[.!?…;:,]/g) || []).pop() || null }));
        let cost = null, inside = null, tokens = null;
        if (SEG) {
            tokens = SEG.tokenize(text);
            if (tokens.length === words.length) ({ gap: cost, inside } = SEG.analyze(tokens));
            else tokens = null;
        }
        const gaps = [];
        let pos = 0;
        for (let i = 0; i < words.length - 1; i++) {
            pos += words[i].syl;
            let c = cost ? cost[i + 1] : (words[i].punct ? -38 : 24);
            // A several-word adjunct opener ("thông qua", "dựa trên", "so với") after a content word:
            // the line-break scoring counts its first syllable as a content word and adds the
            // content-pair cost. Not the strong ones: "ví dụ", "tiếp theo" are also nouns ("xem ví dụ")
            // (not after a word that needs the next one: "từ | tiếp theo" is "the next word"; a weak
            // binder like "nhiều" does not count: "thấp hơn nhiều | so với"; never inside a longer
            // phrase: "có | nghĩa là")
            const op = !words[i].punct && !(LEFT_BIND[words[i].bare] >= 40) && !(inside && inside[i + 1] >= 80) && openerAt(words, i + 1);
            if (op && op.phrase.includes(" ") && op.weight <= 14) c = Math.min(c, 10 - op.weight);
            gaps.push({ i, pos, punct: words[i].punct, mark: words[i].mark, cost: c, value: valueOf(c),
                unit: !!tokens && !words[i].punct && isUnit(tokens, inside, i), inWord: !!(inside && inside[i + 1] >= 80) });
        }
        const total = pos + (words.length ? words[words.length - 1].syl : 0);
        // Inside an English name, term or model ("Google Ads API", "Christopher Nolan", "GPT 5 chấm
        // 6"): one unit, never a pause, whatever the line-break scoring gave it (dub-speech.js)
        const S = speech();
        if (S && tokens) {
            const inside = S.spanGaps(text);
            if (inside.length === gaps.length) gaps.forEach((g, i) => { if (inside[i] && !g.punct) { g.cost = Math.max(g.cost, 80); g.unit = true; g.span = true; } });
            const st = S.analyze(text).tokens;
            if (st.length === words.length) words.forEach((w, i) => { w.span = st[i].span; });
        }
        markConnectives(words, gaps);
        assignRoles(words, gaps);
        adjustJoins(words, gaps);
        const clauses = constituents(words, gaps);
        for (const g of gaps) if (!g.punct) labelPhrase(g);
        for (const g of gaps) g.tier = g.punct ? "punct" : g.unit || g.value < K.minValue ? "hard" : g.value < 0.5 ? "soft" : "open";
        return { text, words, gaps, total, clauses };
    }
    const valueOf = c => Math.max(-4, Math.min(2, (K.valueAt - c) / K.valueScale));
    // Inside one word, term, name or number: the voice does not stop there for long
    const UNITS = (SEG && SEG._lex && SEG._lex.UNITS) || new Set();
    function isUnit(tokens, inside, i) {
        if (inside && inside[i + 1] >= 80) return true;
        const a = tokens[i], b = tokens[i + 1], c = tokens[i + 2];
        const num = t => t && (t.isNumber || t.isNumberWord || t.core === "phẩy");
        return num(a) && (num(b) || UNITS.has(b.core) || (c && UNITS.has(b.core + " " + c.core)));
    }
    function labelPhrase(g) {
        g.role = g.cost >= 40 ? "bound" : g.value >= 0.5 ? "open" : "phrase";
        g.level = g.value >= 0.5 ? "short" : g.value > 0 ? "micro" : "none";
    }

    // Connectives the line-break lexicon does not have: never split inside; "chứ không" ("rather
    // than") opens a phrase, "hơn là" weakly ("hiệu quả hơn là" is still the comparative), "kể cả
    // khi" ("even when") like "ngay cả khi" (without it, "khi" alone made "kể cả | khi" a boundary)
    const CONNECTIVES = { "chứ không": 18, "hơn là": 8, "làm thế nào để": 0, "như thế nào để": 0, "làm sao để": 0, "kể cả khi": 20 };
    function markConnectives(words, gaps) {
        for (const [phrase, weight] of Object.entries(CONNECTIVES)) {
            const parts = phrase.split(" ");
            for (let s = 0; s + parts.length <= words.length; s++) {
                if (!parts.every((p, k) => words[s + k].bare === p && (k === parts.length - 1 || !words[s + k].punct))) continue;
                for (let k = s; k < s + parts.length - 1; k++) { gaps[k].cost = Math.max(gaps[k].cost, 60); gaps[k].unit = true; gaps[k].value = valueOf(gaps[k].cost); }
                if (weight && s > 0 && !gaps[s - 1].punct && !gaps[s - 1].unit) { gaps[s - 1].cost = Math.min(gaps[s - 1].cost, 10 - weight); gaps[s - 1].value = valueOf(gaps[s - 1].cost); }
            }
        }
    }

    // What the line-break scoring does not know about speech:
    //   "và" / "hoặc" / "hay" join two clauses only when both sides are long; between short phrases
    //   ("thử lại và kết quả tốt hơn") or the last item of a list ("Apple, Microsoft và Google")
    //   they are not a boundary at all
    //   "rằng" starts the complement of the verb before it: no pause on either side of it
    //   a long subject before its predicate ("một nhóm nghiên cứu nhỏ tại Toronto | đã tạo ra") is a
    //   phrase boundary a reader breathes at; after a short one ("hệ thống sẽ") it is not
    const PREVERBAL = new Set(["đã", "đang", "sẽ", "vẫn", "cũng", "đều", "chưa", "không", "cần", "phải", "luôn", "thường", "sắp", "vừa", "có thể", "chỉ", "lại"]);
    // counting the subject back stops at a clause opening, a pronoun (its own subject: "chúng ta biết
    // | mô hình đã học"), a modal ("rất có thể | mô hình") or a verb that takes a clause
    const SUBJECT_STOP = new Set(["là", "rằng", "thì", "mà", "tôi", "ta", "bạn", "họ", "nó", "mình", "anh", "chị", "em",
        "thể", "rất", "cũng", "đã", "sẽ", "đang", "vẫn", "không", "chưa", "cần", "phải", "biết", "nghĩ", "thấy", "tin", "hiểu"]);
    const MODAL_BEFORE = new Set(["định", "biết", "nghĩ", "xét", "nhắc", "hỏi"]);
    const THINKING = new Set(["nghĩ", "thấy", "biết", "tin", "hiểu", "mong", "muốn", "khuyên", "bảo", "nói", "vân", "khoăn", "chắc", "xem"]);
    // Nouns ending in a pronoun word: "thói quen của trẻ em" has no pronoun subject in it
    const KIN_NOUNS = new Set(["trẻ em", "anh em", "chị em", "anh chị"]);
    const PRONOUN_SUBJECT = new Set(["chúng", "tôi", "bạn", "họ", "nó", "các", "người", "mình", "ta"]);
    // Verbs of change: "tăng | từ 72,5%" is the verb's from-to complement, not an adjunct
    const CHANGE_VERBS = new Set(["tăng", "giảm", "lên", "xuống", "hạ", "rơi", "sụt", "tụt", "vọt", "nhảy", "chuyển", "đổi", "dao động", "kéo dài"]);
    // Verbs that open the predicate after a nominal subject in expository speech, with no preverbal
    // word before them (1.9.6, BACKLOG 16: "Độ chính xác trên tập kiểm tra | đạt 95%"). The segmenter
    // rates a noun -> verb gap as inside a phrase (value -0.95): the voice's own stop there was closed
    // while one inside the subject ("chính xác | trên tập") was invited. Two-word ones are matched
    // whole; a word that is part of a compound ("chiếm dụng") is not a verb here
    const PRED_VERBS = new Set(["đạt", "chiếm", "vượt", "gồm", "cho thấy", "mang lại", "gây ra", "dẫn đến", "tạo ra",
        "bao gồm", "đòi hỏi", "trở thành", "đóng vai trò", "phụ thuộc", "giúp",
        // 2026-09-29 (syntax5): transitive verbs of effect that head an expository predicate
        "ảnh hưởng đến", "ảnh hưởng tới", "tác động đến", "tác động tới", "cải thiện", "tiết kiệm", "phản ánh",
        "thúc đẩy", "tiêu tốn", "quyết định", "chứng minh", "thể hiện", "đóng góp", "hạn chế", "làm tăng", "làm giảm"]);
    const SUBJECT_PP = new Set(["trên", "trong", "ở", "tại", "dưới", "giữa", "về"]);
    // After these a word of the list is a noun: "đưa ra | quyết định", "những hạn chế", "tiền tiết kiệm"
    const NOUN_BEFORE = new Set(["các", "những", "một", "mọi", "mỗi", "nhiều", "ít", "vài", "ra", "có", "của", "là", "tiền", "sự", "việc"]);
    const predVerbAt = (words, gaps, i) => {
        if (i > 0 && NOUN_BEFORE.has(words[i - 1].bare)) return 0;
        const two = words[i + 1] ? `${words[i].bare} ${words[i + 1].bare}` : "";
        const three = words[i + 2] ? `${two} ${words[i + 2].bare}` : "";
        if (PRED_VERBS.has(three)) return 3;
        if (PRED_VERBS.has(two)) return 2;
        if (PRED_VERBS.has(words[i].bare) && !(gaps[i] && gaps[i].inWord)) return 1;
        return 0;
    };
    // "từ" as the noun "word": "dự đoán | từ tiếp theo" is "predict the next word"
    const WORD_NOUN_AFTER = new Set(["tiếp", "kế", "khóa", "khoá", "vựng", "loại", "gốc", "lạ", "đơn", "ghép"]);
    // Gradable adjectives: "chỉ tốt | bằng dữ liệu" is "only as good as", not "by means of"
    const GRADABLE = new Set(["tốt", "hay", "giỏi", "cao", "thấp", "lớn", "nhỏ", "to", "nhanh", "chậm", "mạnh", "yếu", "rẻ", "đắt",
        "dài", "ngắn", "đẹp", "xấu", "nặng", "nhẹ", "xa", "gần", "sớm", "muộn", "dễ", "khó", "giàu", "nghèo", "già", "trẻ", "kém",
        "tệ", "đúng", "chính xác", "hiệu quả", "quan trọng", "phổ biến", "nhiều", "ít", "rộng", "hẹp", "sâu", "nông",
        "dễ dàng", "khó khăn", "đơn giản", "phức tạp", "nhanh chóng", "thuận tiện", "tốn kém"]);
    // Relative "mà": after these heads, or before a pronoun subject, it opens a clause that modifies
    // the noun before it ("dữ liệu | mà nó được huấn luyện"). Contrastive "mà" ("không chỉ ... mà
    // còn") is followed by an adverb, not a subject.
    const QUANTITY = new Set(["mươi", "trăm", "nghìn", "ngàn", "triệu", "tỷ", "lần", "đôi", "rưỡi"]);
    const REL_HEADS = new Set(["cách", "điều", "thứ", "cái", "nơi", "lúc", "người", "lý do", "nhất", "gì"]);
    const REL_SUBJECT = new Set(["nó", "chúng", "tôi", "bạn", "các", "họ", "ta", "mình", "anh", "chị", "em", "người", "ai"]);
    // A temporal modifier that closes a subject noun phrase ("doanh thu ... trong quý vừa qua | tăng")
    const TIME_END = ["vừa qua", "vừa rồi", "gần đây", "năm ngoái", "năm qua", "năm nay", "hiện nay", "trước đây", "hôm qua", "tháng trước", "tuần trước"];
    function adjustJoins(words, gaps) {
        let zone = 0, listed = false, sentStart = 0, commaYet = false, fronted = false;
        const sylSince = (a, b) => { let n = 0; for (let k = a; k <= b; k++) n += words[k].syl; return n; };
        const at = (i, n) => words.slice(i, i + n).map(w => w.bare).join(" ");
        const isNum = w => !!w && (/^\d/.test(w.bare) || /^(một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)$/.test(w.bare));
        // Syllables of the subject before gap g: back to punctuation, a clause opener, "là" or "rằng".
        // "thể" stops it only as "có thể" ("tập thể dục" is a verb phrase inside the subject)
        // Syllables of a relative clause starting at word i ("mà ..."): to punctuation, a joiner or a
        // clause opener
        const relativeLength = i => {
            let n = 0;
            for (let k = i; k < words.length; k++) {
                if (k > i + 1 && (JOINERS.has(words[k].bare) || (OPENERS[words[k].bare] || 0) >= 14)) break;
                // the main clause's predicate resumes: "chiếc máy mà tôi mua hôm qua | đã hỏng" (not
                // right after the clause's own subject: "mà nó đã nhìn thấy")
                if (k > i + 2 && PREVERBAL.has(words[k].bare) && !REL_SUBJECT.has(words[k - 1].bare)) break;
                n += words[k].syl;
                if (words[k].punct) break;
            }
            return n;
        };
        // Syllables of the clause starting at word a, to the next punctuation
        const clauseSyl = a => { let n = 0; for (let k = a; k < words.length; k++) { n += words[k].syl; if (words[k].punct) break; } return n; };
        const subjectBefore = g => {
            let subj = 0;
            for (let k = g.i; k >= zone; k--) {
                const w = words[k];
                if (w.bare === "thể" ? k > 0 && words[k - 1].bare === "có" : SUBJECT_STOP.has(w.bare) && !(k > 0 && KIN_NOUNS.has(`${words[k - 1].bare} ${w.bare}`))) break;
                if ((OPENERS[w.bare] || 0) >= 14 && !JOINERS.has(w.bare)) break;
                subj += w.syl;
            }
            return subj;
        };
        // a clause from a to b with its predicate already said, and no verb of thinking or deciding
        // that "nên" ("should") could complete ("Tôi nghĩ công ty nên", "đang phân vân nên")
        const isResultClause = (a, b) => {
            const ws = words.slice(a, b + 1).map(w => w.bare);
            if (ws.some(w => THINKING.has(w)) || MODAL_BEFORE.has(ws[ws.length - 1])) return false;
            let right = 0;
            for (let k = b + 2; k < words.length; k++) { right += words[k].syl; if (words[k].punct) break; }
            if (right < 4) return false;
            if (/^(vì|do|bởi|tại|nhờ)$/.test(ws[0])) return ws.length >= 2;     // "Vì trời mưa | nên"
            return sylSince(a, b) >= 4 && (ws.some((w, k) => DEGREE.has(w) || PREVERBAL.has(w) || w === "bị" || w === "được" || (k > 0 && CHANGE_VERBS.has(w))));
        };
        const startClause = i => {
            const first = words.slice(i, i + 2).map(w => w.bare);
            fronted = SUBORDINATE.test(first[0] || "") || SUBORDINATE.test(first.join(" "));
        };
        startClause(0);
        for (const g of gaps) {
            const next = words[g.i + 1];
            if (g.punct) {
                listed = g.role === "list" || (listed && g.punct === "comma"); zone = g.i + 1;
                if (g.punct === "sentence") { sentStart = g.i + 1; commaYet = false; startClause(g.i + 1); } else commaYet = true;
                continue;
            }
            if (next.bare === "và" || next.bare === "hoặc" || next.bare === "hay") {
                let left = 0, right = 0;
                for (let k = zone; k <= g.i; k++) left += words[k].syl;
                for (let k = g.i + 1; k < words.length; k++) { right += words[k].syl; if (words[k].punct) break; }
                // two English names or terms joined ("ROI và KPI", "Facebook và Instagram",
                // "Christopher Nolan và Emma Thomas"): one noun phrase, not two clauses
                const names = words[g.i].span >= 0 && words[g.i + 2] && words[g.i + 2].span >= 0;
                // the last item of a list is read with its "và" after a breath when it is long itself:
                // "hộ chiếu, ảnh thẻ / và bản sao kê ngân hàng trong ba tháng gần nhất"; the item ends
                // where a predicate starts ("Apple, Microsoft và Google | đều đang ...")
                let item = 0;
                for (let k = g.i + 2; k < words.length; k++) {
                    const w = words[k].bare;
                    if (PREVERBAL.has(w) || w === "là" || w === "được" || w === "bị" || (OPENERS[w] || 0) >= 20) break;
                    item += words[k].syl;
                    if (words[k].punct) break;
                }
                // (a list the comma roles missed: an item of <= 6 syllables right after a comma)
                const longLast = (listed || (zone > 0 && gaps[zone - 1].punct === "comma" && left <= 6)) && !names && item >= 8;
                if (!longLast && (listed || left < 5 || right < 6 || names)) g.cost += 30;
            } else if (next.bare === "nên" && (SUBJECT_STOP.has(words[g.i].bare) || MODAL_BEFORE.has(words[g.i].bare))) {
                // "chúng ta | nên", "quyết định | nên": "nên" is "should" here, not "so"
                g.cost = Math.max(g.cost, 30);
            } else if (next.bare === "nên" && g.cost < 40) {
                // result "nên" ("so") after a clause that already has its predicate, written without a
                // comma: "Trời mưa rất to từ sáng | nên buổi quay phải dời" is two clauses, like "để".
                // Without a predicate marker (degree adverb, preverbal word, "bị" / "được", a verb of
                // change) or a fronted "vì" / "do", "nên" may be "should" ("Doanh nghiệp nhỏ nên tập
                // trung", "Tôi nghĩ công ty nên"): a legal but uninvited boundary
                if (isResultClause(zone, g.i)) {
                    g.cost = Math.min(g.cost, -12);
                    // the fronted "Vì ..." clause ends here: a pronoun after a time word inside the
                    // result clause is its subject, not a main clause ("nên sáng nay | tôi", 1.9.5)
                    fronted = false;
                } else g.cost = Math.max(g.cost, 0);
            } else if (fronted && !commaYet && g.cost < 40 && PRONOUN_SUBJECT.has(next.bare) && sylSince(sentStart, g.i) >= 6) {
                // "Khi dữ liệu bị thiếu | chúng ta phải...": the main clause after a fronted clause
                // written without its comma (once: a later pronoun is an object, "loại bỏ chúng")
                g.cost = Math.min(g.cost, -15);
                fronted = false;
            } else if (next.bare === "trước" && words[g.i + 2] && (words[g.i + 2].bare === "đó" || words[g.i + 2].bare === "đây")) {
                // "kết quả | trước đó": after a word "trước đó" means "earlier" and belongs to what
                // precedes; as the opener "before that" it follows punctuation
                g.cost = Math.max(g.cost, 20);
            } else if (next.bare === "rằng") {
                // "phát hiện ra | rằng": never more than a joint between a verb and its complement
                g.cost = Math.max(g.cost, 20);
            } else if (next.bare === "từ" && ((CHANGE_VERBS.has(words[g.i].bare) || CHANGE_VERBS.has(at(g.i - 1, 2))) && isNum(words[g.i + 2]) ||
                WORD_NOUN_AFTER.has((words[g.i + 2] || {}).bare))) {
                // "tăng | từ 72,5% lên 91%": the from-to complement of a verb of change;
                // "dự đoán | từ tiếp theo": the noun "word"
                g.cost = Math.max(g.cost, 20);
            } else if ((next.bare === "bằng" || next.bare === "như") && (GRADABLE.has(words[g.i].bare) || GRADABLE.has(at(g.i - 1, 2)))) {
                // "chỉ tốt | bằng dữ liệu": comparative "as good as"; 1.9.5 the same with "như":
                // "không hề dễ dàng | như nhiều người nghĩ" (after a noun "như" still opens examples)
                g.cost = Math.max(g.cost, 20);
            } else if (next.bare === "so" && words[g.i + 2] && words[g.i + 2].bare === "với" &&
                (words.slice(Math.max(zone, g.i - 2), g.i + 1).some(w => w.bare === "hơn") ||
                 words.slice(Math.max(zone, g.i - 3), g.i + 1).some(w => isNum(w) || QUANTITY.has(w.bare)))) {
                // "thấp hơn nhiều | so với": the standard of a comparison, not an adjunct; the same after
                // a measured change: "tăng hai mươi phần trăm | so với cùng kỳ", "gấp đôi | so với"
                g.cost = Math.max(g.cost, 20);
            } else if (next.bare === "mà" && !words[g.i].punct && (REL_HEADS.has(words[g.i].bare) || REL_HEADS.has(at(g.i - 1, 2)) ||
                (REL_SUBJECT.has((words[g.i + 2] || {}).bare) && relativeLength(g.i + 1) <= 6))) {
                // relative "mà" after the noun it modifies: "điều quan trọng nhất | mà các bạn cần nhớ",
                // "dữ liệu | mà nó được huấn luyện". A long relative clause after a long noun phrase
                // keeps its light boundary ("toàn bộ ngữ cảnh / mà nó đã nhìn thấy trước đó")
                g.cost = Math.max(g.cost, 20);
            } else if (next.bare === "thì" && !fronted && sylSince(zone, g.i) - (/^(còn|nhưng|mà|và)$/.test(words[zone].bare) ? 1 : 0) <= 6) {
                // topic "thì" after a short topic: "còn dữ liệu kiểm tra | thì"; after a fronted
                // condition ("Nếu ... | thì") it stays the clause boundary
                g.cost = Math.max(g.cost, 20);
            } else if ((next.bare === "là" || at(g.i + 1, 3) === "có nghĩa là" || /^(nghĩa là|tức là)$/.test(at(g.i + 1, 2))) &&
                sylSince(zone, g.i) <= 4 && g.cost < 20) {
                // copula after a short subject: "bước tiếp theo | là"; 2.2.6 the copulas that explain
                // (BACKLOG 16): "Điều này | có nghĩa là", "Tức là", "nghĩa là" (corpus e1 was WRONG there)
                g.cost = Math.max(g.cost, 20);
            } else if (TIME_END.includes(at(g.i + 1, 2)) && /^vừa/.test(next.bare)) {
                // "quý | vừa qua": "vừa qua" modifies the noun before it ("the past quarter")
                g.cost = Math.max(g.cost, 20);
            } else if (TIME_END.includes(at(g.i, 2))) {
                // inside "vừa qua", "gần đây": one unit
                g.cost = Math.max(g.cost, 60); g.unit = true;
            } else if (TIME_END.includes(at(g.i - 1, 2)) && g.i - 1 > zone && !OPENERS[next.bare] && !JOINERS.has(next.bare) && subjectBefore(g) >= 5) {
                // a temporal modifier closing a long subject: "doanh thu ... trong quý vừa qua | tăng"
                g.cost = Math.min(g.cost, -2);
                g.subjectEnd = true;
            } else if (predVerbAt(words, gaps, g.i + 1) && !listed && g.cost > 0 && g.cost < 40 && !g.inWord &&
                !gaps.some(h => h.subjectEnd && h.i >= zone && h.i < g.i)) {
                // a predicate verb after its subject (PRED_VERBS): invited like "đã" after a long subject
                // (value 0.35); after a short one in a short clause legal but not invited (value 0): the
                // voice decides. Readers disagree there (blind split 2 marked "Số nhân viên của công ty |
                // đã" wrong, syntax4 V1 marks "Độ chính xác trên tập kiểm tra | đạt" right); it was closed
                const subj = subjectBefore(g);
                if (subj < 5) continue;
                // a prepositional phrase inside the subject ("Độ chính xác trên tập kiểm tra | đạt") makes
                // it a phrase of its own however short. Only prepositions of place and topic: "của" is a
                // possessive, "qua", "ra", "vào" also follow verbs ("ghé qua sửa | giúp")
                const withPP = words.slice(zone + 1, g.i + 1).some(w => SUBJECT_PP.has(w.bare));
                const short = subj < K.subjectLong && clauseSyl(zone) < K.subjectClauseMin && !withPP;
                g.cost = Math.min(g.cost, short ? K.valueAt : K.valueAt - 7);
                g.subjectEnd = true;
            } else if ((PREVERBAL.has(next.bare) || (next.bare === "có" && words[g.i + 2] && words[g.i + 2].bare === "thể")) && g.cost > 0 && g.cost < 40) {
                // subject length: back to punctuation, a clause opener, "là" or "rằng"
                if (subjectBefore(g) < 5) continue;
                // A short subject in a clause that fits one breath is read with its predicate (1.9.5,
                // BACKLOG 30: "Số nhân viên của công ty | đã tăng từ 10 lên 20 người", a 6-syllable
                // subject). A long subject keeps its boundary however short the clause ("Những người
                // thường xuyên tập thể dục vào buổi sáng | thường có ...").
                // Closed (just below 0): real takes of tests/prosody-corpus.js syntax3 kept 13 wrong
                // stops with 1.9.4, 4 with a legal-but-uninvited 0, 1 closed. After a list ("CPU, bộ nhớ,
                // tốc độ mạng và độ trễ | đều") the subject is the whole list: left alone
                if (!listed && subjectBefore(g) < K.subjectLong && clauseSyl(zone) < K.subjectClauseMin) {
                    g.cost = Math.max(g.cost, K.valueAt + 1); g.subjectEnd = true; g.value = valueOf(g.cost); continue;
                }
                g.cost -= 12;
                g.subjectEnd = true;
            } else continue;
            g.value = valueOf(g.cost);
        }
        // A predicate of 3 syllables or less after a subject boundary is not a phrase of its own: the
        // adjunct after it belongs to it ("... vừa qua | tăng mạnh nhờ vào ...", not "tăng mạnh | nhờ")
        for (const g of gaps) {
            if (!g.subjectEnd) continue;
            let syl = 0;
            for (const h of gaps.slice(g.i + 1)) {
                syl += words[h.i].syl;
                if (h.punct || syl > 3) break;
                const op = openerAt(words, h.i + 1);
                if (op && op.weight <= 14 && h.cost < 12) { h.cost = 12; h.value = valueOf(h.cost); }
            }
        }
    }

    // ---- Constituents (1.8.0) ----
    // A light clause frame, enough to keep a phrase whole: where each clause starts, what opens it (its
    // role), where its subject ends and its predicate starts. The predicate markers are words the model
    // already knows (preverbal words, "là", "được" / "bị", verbs of change); a personal pronoun is a
    // subject of its own. Nothing here creates a pause; it only forbids one inside a constituent:
    //   A. a prepositional phrase inside the subject modifies its noun: "Một công ty ... ở California |
    //      trong quý vừa qua | đã ..." has one boundary, before the predicate (up to 22 syllables of
    //      subject; a longer one keeps its inner boundaries for breath)
    //   B. a short predicate keeps its first adjunct: "tăng mạnh nhờ vào ...", "làm việc với ...",
    //      "đang chạy Google Ads cho ..." (<= 3 syllables before an adjunct opener, <= 5 before a plain
    //      preposition). A purpose, cause or condition clause is not an adjunct: "Tôi dùng ChatGPT / để
    //      phân tích" keeps its boundary
    // A clause that starts with a preposition (a fronted adjunct: "Ở Việt Nam các công ty ...") gets no
    // subject. Where no marker is found ("Độ chính xác trên tập kiểm tra đạt ...") nothing changes.
    const PREPOSITIONS = new Set(["trong", "ở", "tại", "trên", "dưới", "của", "từ", "với", "về", "cho", "theo", "giữa",
        "ngoài", "sau", "trước", "qua", "bằng", "nhờ", "đến", "tới", "vào", "cùng"]);
    const CLAUSE_ROLE = [
        [/^(để|để mà|nhằm|nhằm mục đích)$/, "purpose"], [/^(vì|bởi vì|tại vì|bởi lẽ|do)$/, "cause"],
        [/^(nếu|nếu như|giả sử|giả như|trừ khi|miễn là)$/, "condition"],
        [/^(nhưng|nhưng mà|tuy nhiên|tuy vậy|mặc dù|dù|dù cho|cho dù|song|trái lại|ngược lại)$/, "contrast"],
        [/^(khi|khi mà|trong khi|sau khi|trước khi|cho đến khi|ngay khi|mỗi khi|một khi|đến khi)$/, "time"],
        [/^(vì vậy|vì thế|do đó|do vậy|cho nên|thế nên|vậy nên|nên)$/, "result"], [/^rằng$/, "complement"], [/^mà$/, "relative"]
    ];
    const DEGREE = new Set(["rất", "khá", "hơi", "quá", "cực", "vô cùng", "hết sức"]);
    const SUBJECT_PRONOUN = /^(tôi|ta|mình|bạn|họ|nó|chúng tôi|chúng ta|các bạn|mọi người|người ta|(anh|chị|em|ông|bà|cô|cậu) ấy)$/;
    function constituents(words, gaps) {
        const n = words.length;
        const at = (i, len) => words.slice(i, i + len).map(w => w.bare).join(" ");
        const clauses = [];
        // clause starts: sentence start, after punctuation, before a clause opener
        let start = 0;
        const close = end => { if (end >= start) clauses.push({ start, end }); start = end + 1; };
        for (let i = 0; i < n - 1; i++) {
            if (gaps[i].punct) { close(i); continue; }
            const op = openerAt(words, i + 1);
            if (op && (op.weight >= 20 || op.phrase === "rằng") && !JOINERS.has(op.phrase) && op.phrase !== "là" && !gaps[i].unit && gaps[i].value >= K.minValue) close(i);
        }
        close(n - 1);
        for (const c of clauses) {
            const op = openerAt(words, c.start);
            const role = op ? (CLAUSE_ROLE.find(([re]) => re.test(op.phrase)) || [null, null])[1] : null;
            c.role = role || "main";
            let s = c.start + (op && role ? op.phrase.split(" ").length : 0);
            if (s > c.end) continue;
            if (c.start > 0) gaps[c.start - 1].clauseRole = c.role;
            // subject: a pronoun, or the words before the first predicate marker
            const pro = [3, 2, 1].find(len => s + len - 1 <= c.end && SUBJECT_PRONOUN.test(at(s, len)));
            if (pro) { c.subject = [s, s + pro - 1]; c.pred = s + pro; }
            else if (!PREPOSITIONS.has(words[s].bare) && !OPENERS[words[s].bare]) {
                for (let v = s + 1; v <= c.end; v++) {
                    const w = words[v].bare, gBefore = gaps[v - 1];
                    // a degree adverb means the predicate already started at a verb the model does not
                    // know ("Mô hình học | rất nhanh"): no subject to find
                    if (gBefore.punct || DEGREE.has(w)) break;
                    // a predicate verb the segmenter reads as one word ("cải thiện") is still a verb
                    const pv = !gBefore.inWord && predVerbAt(words, gaps, v) > 0;
                    if ((gBefore.inWord || (gaps[v] && gaps[v].inWord)) && w !== "có" && !pv) continue;   // "không gian", "chỉ số": a noun
                    if (w === "vừa" && TIME_END.includes(at(v, 2))) continue;      // "quý vừa qua"
                    const marker = PREVERBAL.has(w) || w === "là" || w === "được" || w === "bị" || CHANGE_VERBS.has(w) ||
                        (w === "có" && words[v + 1] && words[v + 1].bare === "thể") || predVerbAt(words, gaps, v) > 0;
                    if (!marker) continue;
                    if (v - s >= 2) { c.subject = [s, v - 1]; c.pred = v; }
                    break;
                }
            }
            if (!c.subject) continue;
            // A. no pause inside the subject before one of its prepositional phrases
            const [a, b] = c.subject;
            let subjSyl = 0;
            for (let k = a; k <= b; k++) subjSyl += words[k].syl;
            if (b > a && subjSyl <= 22) {
                for (let i = a; i < b; i++) {
                    const g = gaps[i];
                    if (g.punct || g.unit || !PREPOSITIONS.has(words[i + 1].bare) || LEFT_BIND[words[i].bare] >= 40) continue;
                    if (g.cost < 25) { g.cost = 25; g.value = valueOf(g.cost); }
                    g.inSubject = true;
                }
            }
            // B. a short predicate keeps its first adjunct
            let syl = 0;
            for (let i = c.pred; i < c.end; i++) {
                syl += words[i].syl;
                const g = gaps[i];
                if (g.punct || syl > 5) break;
                const op = openerAt(words, i + 1);
                if (!op || op.weight > 14) continue;
                const plain = PREPOSITIONS.has(op.phrase.split(" ")[0]) && op.weight <= 9;
                if (syl <= 3 || plain) {
                    if (!g.unit && g.cost < 12) { g.cost = 12; g.value = valueOf(g.cost); }
                    g.predicateAdjunct = true;
                }
                break;
            }
        }
        // C. a purpose clause that completes a short predicate is its complement, not a clause of its
        // own: "Mình ghé qua đây để mua ít cà phê", "dùng Adobe Premiere Pro để dựng video". When
        // either side is short (<= 6 syllables) and both fit one breath (<= 16) the gap before "để"
        // stays a legal but uninvited boundary (soft); two long sides keep their clause boundary
        const sylOf = (a, b) => { let n = 0; for (let k = a; k <= b; k++) n += words[k].syl; return n; };
        clauses.forEach((c, j) => {
            // 1.9.5: a time clause the same ("gặp lỗi | khi cài đặt", "Hãy lưu lại tệp | khi bạn làm xong")
            if ((c.role !== "purpose" && c.role !== "time") || j === 0 || !gaps[c.start - 1] || gaps[c.start - 1].punct) return;
            let end = c.start;
            while (end < n - 1 && !words[end].punct) end++;
            const main = sylOf(clauses[j - 1].start, c.start - 1), purpose = sylOf(c.start, end);
            const g = gaps[c.start - 1];
            if ((main <= 6 || purpose <= 6) && main + purpose <= 16 && g.cost < 0) {
                g.cost = 0; g.value = valueOf(g.cost);
                g.purposeAttached = true;
            }
        });
        return clauses;
    }

    // Roles and target pause lengths at punctuation, continuous in the lengths around it.
    // Kept from the measured 1.6.8 / 1.7.2 rules: a comma rests by the clause before it
    // (0.14 + 0.012 per word, max 0.28), a full stop by its sentence (0.28 + 0.01 per word), ? +0.05,
    // ! +0.03, ; and : 0.2 + 0.012 per word (max 0.32), a comma before a short tag is lighter.
    // New in 1.7.6: list items rest alike, a lead-in is light, a comma before a contrast or cause
    // ("nhưng", "vì vậy") no longer leans on, the comma closing a fronted clause ("Nếu ..., ") and a
    // sentence followed by a transition ("... . Tuy nhiên") rest a little longer.
    function assignRoles(words, gaps) {
        // syllables and words since the last punctuation / sentence start, up to the next one
        let sinceW = 0, sinceSyl = 0, sentW = 0, sentStart = 0, zoneStart = 0;
        const nextPunct = i => { for (let j = i + 1; j < words.length; j++) if (words[j].punct) return j; return words.length - 1; };
        const sylBetween = (a, b) => { let s = 0; for (let k = a; k <= b; k++) s += words[k].syl; return s; };
        // comma runs inside a clause zone: a list when the items between two commas are short
        const commaGaps = gaps.filter(g => g.punct === "comma").map(g => g.i);
        const isList = new Set();
        for (let k = 0; k < commaGaps.length; k++) {
            let e = k;
            while (e + 1 < commaGaps.length && !words.slice(commaGaps[e] + 1, commaGaps[e + 1]).some(w => w.punct) &&
                sylBetween(commaGaps[e] + 1, commaGaps[e + 1]) <= 6) e++;
            if (e > k) { for (let q = k; q <= e; q++) isList.add(commaGaps[q]); k = e; continue; }
            // one comma: "A, B và C" with short A
            const i = commaGaps[k];
            let start = i; while (start > 0 && !words[start - 1].punct) start--;
            const end = nextPunct(i);
            const after = words.slice(i + 1, Math.min(end + 1, i + 6)).map(w => w.bare);
            if (sylBetween(start, i) <= 4 && (after.includes("và") || after.includes("hoặc")) && sylBetween(i + 1, end) <= 9) isList.add(i);
        }
        for (const g of gaps) {
            const i = g.i;
            sinceW++; sentW++;
            sinceSyl += words[i].syl;
            const next = words[i + 1];
            let ahead = 0; for (let j = i + 1; j < words.length; j++) { ahead++; if (words[j].punct) break; }
            if (!g.punct) continue;
            const op = openerAt(words, i + 1);
            const strongNext = op && op.weight >= 24 && !JOINERS.has(op.phrase);
            let pause;
            if (g.punct === "sentence") {
                pause = 0.28 + 0.01 * Math.min(sentW, 12) + (g.mark === "?" ? 0.05 : g.mark === "!" ? 0.03 : 0);
                if (strongNext) pause += 0.03;
                g.role = "sentence";
                sentW = 0; sentStart = i + 1;
            } else if (g.punct === "clause") {
                pause = Math.min(0.32, 0.2 + 0.012 * sinceW);
                g.role = "clause";
            } else {
                const lead = sylBetween(zoneStart, i) <= 3;
                const opening = words.slice(sentStart, Math.min(i + 1, sentStart + 3)).map(w => w.bare);
                const fronted = SUBORDINATE.test(opening[0] || "") || SUBORDINATE.test(opening.slice(0, 2).join(" ")) || SUBORDINATE.test(opening.join(" "));
                if (isList.has(i)) {
                    const lastItem = next && (next.bare === "và" || next.bare === "hoặc");
                    pause = 0.15 + (lastItem ? 0.02 : 0);
                    g.role = "list";
                } else if (lead) {
                    pause = 0.12 + 0.01 * Math.min(3, sinceSyl);
                    g.role = "lead";
                } else {
                    pause = Math.min(0.28, 0.14 + 0.012 * Math.min(sinceW, 12));
                    if (next && JOINERS.has(next.bare)) pause -= 0.04;
                    else if (strongNext) pause += 0.02;
                    if (fronted && zoneStart === sentStart) pause += 0.03;
                    if (ahead <= 2) pause -= 0.03;
                    pause = Math.max(0.1, Math.min(0.28, pause));
                    g.role = "comma";
                }
            }
            g.pause = round3(pause);
            sinceW = 0; sinceSyl = 0;
            zoneStart = i + 1;
        }
        for (const g of gaps) if (g.punct) g.level = g.punct === "sentence" ? "long" : g.punct === "clause" || g.role === "comma" ? "medium" : "short";
    }

    // ---- 2. Selection ----
    // runPenalty(sec): a run of voiced speech between two kept pauses
    function runPenalty(sec, k) {
        const s = Math.max(0, k.shortRun - sec), l = Math.max(0, sec - k.longRun);
        return k.shortWeight * s * s + k.longWeight * l * l;
    }
    // Length of a pause the text does not punctuate: stronger boundaries and longer runs before it
    // rest a little longer; always shorter than a comma (0.1 to 0.22 s)
    function phrasePause(value, runBefore) {
        return round3(Math.min(0.22, 0.1 + 0.05 * Math.max(0, Math.min(1.2, value)) / 1.2 + 0.025 * Math.min(3, Math.max(0, runBefore))));
    }

    // points: every boundary in time order: { sec, fixed, value, dur } where fixed ones (start,
    // punctuation the voice honoured, end) are always kept. Returns the set of chosen indices.
    function selectBoundaries(points, opts = {}) {
        const k = { ...K, ...(opts.model || {}) };
        const tight = !!opts.tight;
        const cost = k.pauseCost * (tight ? 1.8 : 1);
        const kk = tight ? { ...k, longRun: k.longRun + 1 } : k;
        const chosen = new Set(points.map((p, j) => (p.fixed ? j : -1)).filter(j => j >= 0));
        // independent stretches between fixed boundaries
        const fixedIdx = [...chosen].sort((a, b) => a - b);
        for (let f = 0; f < fixedIdx.length - 1; f++) {
            const a = fixedIdx[f], b = fixedIdx[f + 1];
            if (b - a < 2) continue;
            const idx = [];
            for (let j = a; j <= b; j++) idx.push(j);
            const best = new Array(idx.length).fill(-Infinity), from = new Array(idx.length).fill(-1);
            best[0] = 0;
            for (let q = 1; q < idx.length; q++) {
                const p = points[idx[q]];
                const gain = q === idx.length - 1 ? 0 : p.value + k.voiceWeight * voiceEvidence(p.dur) - cost;
                if (q < idx.length - 1 && ((p.dur != null && p.dur < k.minStop) || p.value < k.minValue)) continue;
                for (let r = 0; r < q; r++) {
                    if (best[r] === -Infinity) continue;
                    const v = best[r] - runPenalty(p.sec - points[idx[r]].sec, kk) + gain;
                    if (v > best[q]) { best[q] = v; from[q] = r; }
                }
            }
            for (let q = from[idx.length - 1]; q > 0; q = from[q]) chosen.add(idx[q]);
        }
        return chosen;
    }
    // The voice's stop length as evidence of its own phrasing: 0 at 0.12 s, 1 from 0.4 s
    function voiceEvidence(dur) {
        if (dur == null) return 0;
        return Math.max(0, Math.min(1, (dur - 0.12) / 0.28));
    }

    // Decide every stop of a take. stops: [{ gap, sec, dur, punct }] in time order (gap = index into
    // analysis.gaps, -1 if none; punct = true when matched to punctuation). voiced: the take's voiced
    // seconds. Returns [{ keep, kind }] per stop, keep being the pause length before caps.
    function choose(analysis, stops, voiced, opts = {}) {
        // two stops on one gap (a stop broken by a click): only the longer one is a candidate
        const longest = new Map();
        stops.forEach((s, j) => {
            if (!(s.gap >= 0 && analysis.gaps[s.gap])) return;
            if (!longest.has(s.gap) || stops[longest.get(s.gap)].dur < s.dur) longest.set(s.gap, j);
        });
        const points = [{ sec: 0, fixed: true, value: 0 }];
        stops.forEach((s, j) => {
            if (longest.get(s.gap) !== j) return;
            points.push({ sec: s.sec, fixed: !!s.punct, value: analysis.gaps[s.gap].value, dur: s.dur, stop: j });
        });
        points.push({ sec: voiced, fixed: true, value: 0 });
        const chosen = selectBoundaries(points, opts);
        const out = stops.map(() => ({ keep: 0, kind: "joint" }));
        let lastSec = 0;
        points.forEach((p, q) => {
            if (!chosen.has(q)) return;
            if (p.stop != null) {
                const s = stops[p.stop], g = analysis.gaps[s.gap];
                // A breathing comma (s.breath) is always kept, but for a breath's length, not a comma's
                out[p.stop] = s.breath ? { keep: Math.max(K.breathKeep, phrasePause(g.value, p.sec - lastSec)), kind: "breath" }
                    : s.punct ? { keep: g.pause, kind: g.punct } : { keep: phrasePause(g.value, p.sec - lastSec), kind: "soft" };
            }
            lastSec = p.sec;
        });
        return out;
    }

    // Text only: the breath groups a reader would use, with durations estimated from syllables.
    // Returns [{ gap, word, pause, role }].
    function breathGroups(text, opts = {}) {
        const a = analyze(text);
        const sps = opts.sps || K.sps;
        const points = [{ sec: 0, fixed: true, value: 0 }];
        a.gaps.forEach((g, i) => points.push({ sec: g.pos / sps, fixed: !!g.punct, value: g.value, dur: null, gap: i }));
        points.push({ sec: a.total / sps, fixed: true, value: 0 });
        const chosen = selectBoundaries(points, opts);
        const out = [];
        let lastSec = 0;
        points.forEach((p, q) => {
            if (!chosen.has(q)) return;
            if (p.gap != null) {
                const g = a.gaps[p.gap];
                out.push({ gap: p.gap, word: a.words[p.gap].raw, role: g.punct ? g.role : "phrase", pause: g.punct ? g.pause : phrasePause(g.value, p.sec - lastSec) });
            }
            lastSec = p.sec;
        });
        return out;
    }

    // ---- 3. Text for the free voice ----
    // A long stretch with no punctuation: the voice often reads it in one breath, or stops at a
    // different place on every take. A comma at the best clause boundary of that stretch makes it
    // stop there every time. Measured on 7 such sentences x 5 real takes: the voice stopped at 35
    // of 35 inserted commas; longest run 16.9 -> 14.2 syllables on average, 28 -> 18 at worst; the
    // 37-syllable sentence read 27/16/27/16/16 before, 16 on all five after; +0.35% duration.
    // Only strong boundaries (clause openers, a main clause after a fronted one), only in a run of
    // 20+ syllables, 7+ on each side: a comma in a weak place would be heard. The words never change.
    // (2.1.5) minValue 0.6 -> 0.35 and minRun 20 -> 18 also take the boundaries the marks call
    // either way ("/": "... Performance Max này, đã tăng"), where the voice mostly stopped already.
    // On the 20 of 184 corpus sentences it changes (6 of them held out), 100 real takes each way:
    // "|" read in one run 18/60 -> 0/60, stops where the marks say none 2 -> 0, longest run p90
    // 22 -> 17 syllables (max 38 -> 26), kept pause mean 0.18 -> 0.24 s, duration +0.7%.
    // (2.1.6) minSide 7 -> 6 ("Do tốc độ học quá lớn, nên ..."), and a stretch of 26+ syllables may
    // breathe at a weaker boundary (longValue 0.1): it had no gap of 0.35 and was read in one run of
    // up to 36. The 7 corpus sentences this changes (3 held out), 35 real takes each way: every added
    // comma stopped the voice (35/35), longest run p90 26 -> 15 syllables (max 30 -> 17), "|" read in
    // one run 0/15 both, stops where the marks say none 0 -> 1 (the voice's own, before "trong quý"),
    // duration +1.4%. The weak places it takes ("các biểu diễn, từ dữ liệu thô") are ones the voice
    // chose itself on 2 of 5 takes without the comma.
    // (2.1.7) minRun 18 -> 16, and a run of fallbackRun 15+ the text-only choice left whole (it keeps
    // a pause budget, so "Chi phí quảng cáo trên mạng xã hội | chiếm phần lớn ngân sách" got none)
    // takes its best boundary of value >= minValue. The comma is only in what the voice is sent, not
    // in the subtitle. The 20 corpus sentences it changes, 100 real takes each way: "|" read in one
    // run 30/55 -> 0/55, stops where the marks say none 0 -> 0, longest run p90 17 -> 10 syllables.
    // All 184 sentences as sent (920 takes): RAN-ON 39/365 -> 9/365, WRONG 1 -> 1, length +0.2%.
    // (2.1.9) fallbackRun 15 -> 14: "CPU, bộ nhớ, tốc độ mạng và độ trễ, đều ảnh hưởng ..." was read
    // in one run on 3 of 5 takes. The 3 corpus sentences it changes, 15 real takes each way: "|" read
    // in one run 3/10 -> 0/10, no stop where the marks say none. 13 was not tried on takes: it also
    // cuts a 13-syllable "không chỉ rẻ hơn, mà còn ...".
    const BREATH = { minRun: 16, fallbackRun: 14, minSide: 6, minValue: 0.35, longRun: 26, longValue: 0.1 };
    const breathMemo = new Map();
    function breathText(text) {
        return breathInfo(text).text;
    }
    // (2.1.8) The word indices breathText put a comma after: the audio shaping keeps a breath there,
    // not a written comma's pause (dub-audio shapePauses opts.breath)
    function breathAdded(text) {
        return breathInfo(text).added.slice();
    }
    function breathInfo(text) {
        const key = String(text || "");
        let hit = breathMemo.get(key);
        if (hit !== undefined) return hit;
        const a = analyze(key);
        const add = new Set();
        const sum = (x, y) => { let n = 0; for (let k = x; k <= y; k++) n += a.words[k].syl; return n; };
        for (const b of breathGroups(key)) {
            const g = a.gaps[b.gap];
            if (b.role !== "phrase") continue;
            let from = b.gap; while (from > 0 && !a.words[from - 1].punct) from--;
            let to = b.gap + 1; while (to < a.words.length - 1 && !a.words[to].punct) to++;
            if (g.value < (sum(from, to) >= BREATH.longRun ? BREATH.longValue : BREATH.minValue)) continue;
            if (sum(from, to) < BREATH.minRun || sum(from, b.gap) < BREATH.minSide || sum(b.gap + 1, to) < BREATH.minSide) continue;
            add.add(b.gap);
        }
        // A run the text-only choice left whole: its best boundary, if strong enough (2.1.7)
        for (let from = 0; from < a.words.length; ) {
            let to = from; while (to < a.words.length - 1 && !a.words[to].punct) to++;
            let best = -1;
            if (sum(from, to) >= BREATH.fallbackRun && ![...add].some(g => g >= from && g < to)) {
                for (let k = from; k < to; k++) {
                    const g = a.gaps[k];
                    if (g.punct || g.unit || g.value < BREATH.minValue || sum(from, k) < BREATH.minSide || sum(k + 1, to) < BREATH.minSide) continue;
                    if (best < 0 || g.value > a.gaps[best].value) best = k;
                }
            }
            if (best >= 0) add.add(best);
            from = to + 1;
        }
        hit = { text: add.size ? a.words.map((w, i) => w.raw + (add.has(i) ? "," : "")).join(" ") : key, added: [...add].sort((x, y) => x - y) };
        if (breathMemo.size >= 600) breathMemo.clear();
        breathMemo.set(key, hit);
        return hit;
    }

    // Boundary value between the end of one text and the start of the next (a segment cut)
    function boundaryValue(left, right) {
        const l = String(left || "").trim().split(/\s+/).filter(Boolean).slice(-6);
        const r = String(right || "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
        if (!l.length || !r.length) return 0;
        const a = analyze(l.join(" ") + " " + r.join(" "));
        const g = a.gaps[a.words.length - r.length - 1];
        return g ? g.value : 0;
    }

    // What the text analysis decided for a line, as a short string (1.8.0): per gap the value, whether
    // it is a unit, and a punctuation pause. The free voice's audio key carries it, because its cached
    // audio is shaped by these decisions: a change to the analysis re-renders exactly the lines whose
    // decisions changed, instead of a version bump re-rendering every line. The shaping code itself
    // (choose, the alignment) is still versioned by LOCAL_STYLE_VERSION in dub-engine.js.
    function signature(text) {
        return analyze(text).gaps.map(g => g.punct ? `p${g.pause}` : `${g.unit ? "u" : ""}${Math.round(g.value * 20)}`).join(",");
    }

    // One token map for both readers (1.8.0): what dub-speech.js decided about each word (language,
    // entity, how sure, how it is said) and what this model decided about the gaps around it.
    // Neither parses the text on its own: both read the same tokenisation (vi-segmenter), memoised.
    function tokenMap(text, ctx = {}) {
        const a = analyze(text), S = speech();
        const st = S ? S.analyze(text, ctx).tokens : null;
        const same = st && st.length === a.words.length;
        return a.words.map((w, i) => {
            const t = same ? st[i] : null;
            const before = i > 0 ? a.gaps[i - 1] : null, after = a.gaps[i] || null;
            return {
                id: i, surface: w.raw, normalized: w.bare,
                language: t ? t.lang : null, spanId: t ? t.span : -1, entityType: t ? t.entity : null,
                pronunciationMode: t ? (t.letters ? "letters" : t.strong && t.shape === "ambig" ? "respell" : t.shape === "caps" ? "voice" : "as-is") : "as-is",
                pronunciationConfidence: t ? t.conf : null,
                boundaryBefore: before ? before.tier : "start", boundaryAfter: after ? after.tier : "end"
            };
        });
    }

    const api = { analyze, choose, breathGroups, breathText, breathAdded, boundaryValue, selectBoundaries, spokenWeight, syllables, runPenalty, signature, tokenMap, K };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_DUB_PROSODY = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

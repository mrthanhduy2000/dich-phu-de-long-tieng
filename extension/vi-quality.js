// ============================================================
// PHÁT HIỆN BẢN DỊCH "DỊCH MÁY"
//
// Kiểm tra tất định, chạy tức thì trên từng câu đã dịch:
//   - cấu trúc sao chép tiếng Anh (calque): "trong thứ tự để", "tất cả của",
//     "nó là quan trọng để", "hãy để chúng ta", "đang đi để"...
//   - từ đa nghĩa bị dịch theo nghĩa phổ biến nhất sai lĩnh vực
//   - đại từ "nó" mở câu không rõ tham chiếu
//   - lặp từ, lạm dụng "của nó", "một cách", câu bị động dày đặc
//   - thuật ngữ không nhất quán với thuật ngữ đã thống nhất
//   - bỏ sót / thêm nội dung (tỷ lệ độ dài bất thường), sót tiếng Anh
// Nếu điểm vượt ngưỡng, engine chạy lại lượt dịch kèm danh sách vấn đề.
// ============================================================
(function (root) {
    "use strict";

    // JavaScript: \b chỉ hiểu chữ ASCII, nên "\bthứ" không bao giờ khớp.
    // Đổi mọi \b thành ranh giới hiểu chữ tiếng Việt có dấu (Unicode).
    const B = "(?:(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}])|(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}]))";
    function vre(re) {
        const flags = re.flags.includes("u") ? re.flags : re.flags + "u";
        return new RegExp(re.source.split("\\b").join(B), flags);
    }

    // [mẫu, mức độ, mô tả, gợi ý]
    const CALQUES_RAW = [
        [/\btrong thứ tự để\b/i, 3, "'in order to' dịch từng chữ", "dùng 'để'"],
        [/\b(?:lấy|có) một cái nhìn\b/i, 3, "'take a look' dịch từng chữ", "dùng 'xem qua'"],
        [/\b(?:tạo ra|làm) (?:cảm giác|ý nghĩa)\b/i, 3, "'make sense' dịch từng chữ", "dùng 'hợp lý' / 'dễ hiểu'"],
        [/\bở cuối của ngày\b/i, 3, "'at the end of the day' dịch từng chữ", "dùng 'suy cho cùng'"],
        [/\bđi (?:trước|tới trước) và\b/i, 3, "'go ahead and' dịch từng chữ", "bỏ hoặc dùng 'giờ ta...'"],
        [/\btrên đầu của\b/i, 2, "'on top of' dịch từng chữ", "dùng 'ngoài ra' / 'bên trên'"],
        [/\bnhư một vấn đề của (?:thực tế|sự thật)\b/i, 3, "'as a matter of fact' dịch từng chữ", "dùng 'thực ra'"],
        [/\b(?:rất nhiều|nhiều|một số|tất cả|mỗi|hầu hết|phần lớn|một vài|vài) của (?:các|những|chúng|họ|nó)\b/i, 3, "'some/all/many of' dịch từng chữ", "bỏ 'của'"],
        [/\bmột trong số của\b/i, 3, "'one of' dịch thừa 'của'", "dùng 'một trong những'"],
        [/(?:^|[.!?]\s+)nó là (?:quan trọng|cần thiết|có thể|dễ|khó|hữu ích|tốt|rõ ràng|đáng)\b/i, 3, "chủ ngữ giả 'It is ... to' dịch từng chữ", "đảo thành 'Điều quan trọng là...' / 'Cần...'"],
        [/\bhãy để (?:chúng ta|chúng tôi)\b/i, 3, "'let us' dịch từng chữ", "dùng 'hãy cùng' / 'chúng ta hãy'"],
        [/\b(?:đang|sẽ) đi để\b/i, 3, "'going to' dịch thành 'đi để'", "dùng 'sẽ'"],
        [/\bcó một .{1,40}? mà (?:là|được)\b/i, 1, "'there is a ... that is' bám cấu trúc", "viết gọn lại"],
        [/\bcái mà\b/i, 2, "'which/that' dịch thành 'cái mà'", "bỏ hoặc dùng 'mà'"],
        [/\bđiều mà\b.*\bđiều mà\b/i, 2, "lặp 'điều mà' (bám mệnh đề quan hệ tiếng Anh)", "viết lại"],
        [/\bđiều này là bởi vì\b/i, 1, "'this is because' dịch từng chữ", "dùng 'sở dĩ vậy là vì' / 'vì'"],
        [/\bnếu bạn muốn để\b/i, 2, "'if you want to' dịch thừa 'để'", "bỏ 'để'"],
        [/\bđược biết đến như là\b/i, 1, "'known as' dịch dài dòng", "dùng 'được gọi là'"],
        [/\bbạn có thể nhìn thấy\b/i, 1, "'you can see' dịch sát chữ", "dùng 'có thể thấy'"],
        [/\bchúng ta đã có được\b/i, 1, "'we have got' dịch sát chữ", "dùng 'ta có'"],
        [/\bcảm ơn bạn vì đã\b/i, 1, "'thank you for' bám cấu trúc", "dùng 'cảm ơn bạn đã'"],
        [/\btàu (?:mô hình|mạng|dữ liệu)\b/i, 3, "'train' dịch nhầm thành 'tàu'", "dùng 'huấn luyện'"],
        [/\b(?:chạy|đi) qua (?:về phía trước|chuyển tiếp)\b|\bvượt qua (?:về phía trước|chuyển tiếp|tiến)\b/i, 3, "'forward pass' dịch theo nghĩa 'vượt qua'", "dùng 'lượt truyền xuôi / lan truyền tiến'"],
        [/\bđường chuyền (?:về phía trước|tiến|ngược)\b/i, 3, "'forward/backward pass' dịch như bóng đá", "dùng 'lượt truyền xuôi/ngược'"],
        [/\bngười mẫu (?:học|ngôn ngữ|máy|AI)\b/i, 3, "'model' dịch nhầm thành 'người mẫu'", "dùng 'mô hình'"],
        [/\b(?:con chuột|con bọ) (?:trong|của) (?:mã|chương trình)\b/i, 3, "'bug' dịch theo nghĩa côn trùng", "dùng 'lỗi'"],
        [/\bkhách hàng tiềm năng (?:đến|tới) (?:kết quả|việc)\b/i, 2, "'lead to' dịch nhầm thành 'khách hàng tiềm năng'", "dùng 'dẫn đến'"],
        // Bổ sung sau khi rà thêm các lối dịch máy hay gặp trong phụ đề bài giảng
        [/\bnhững gì (?:chúng ta|bạn|tôi|mình) (?:sẽ|đang) (?:làm|nói) là\b/i, 3, "'what we're going to do is' bám cấu trúc", "dùng 'Việc ta sẽ làm là' / 'Giờ ta sẽ'"],
        [/\bnghĩ về (?:nó|điều này|cái này) như(?: là)?\b/i, 2, "'think of it as' dịch từng chữ", "dùng 'có thể xem nó như'"],
        [/\bđây là nơi .{1,40}? (?:đến|vào) (?:trong|cuộc)\b/i, 3, "'this is where X comes in' dịch từng chữ", "dùng 'lúc này X phát huy tác dụng'"],
        [/\bnó (?:quay|hóa|hoá) ra (?:rằng|là)\b/i, 3, "'it turns out that' thêm 'nó' thừa", "dùng 'hóa ra'"],
        [/\btrong (?:điều khoản|các điều khoản|thuật ngữ) của\b/i, 3, "'in terms of' dịch từng chữ", "dùng 'về mặt' / 'xét về'"],
        [/\bmột cặp của\b/i, 3, "'a couple of' dịch từng chữ", "dùng 'vài'"],
        [/\bhãy để tôi\b/i, 2, "'let me' dịch từng chữ", "dùng 'để tôi' / 'tôi sẽ'"],
        [/\bchăm sóc của\b/i, 3, "'take care of' dịch từng chữ", "dùng 'xử lý' / 'lo'"],
        [/\btrên (?:tay|mặt) khác\b/i, 3, "'on the other hand' dịch từng chữ", "dùng 'mặt khác'"],
        [/\btại cùng (?:một )?thời (?:điểm|gian)\b/i, 2, "'at the same time' dịch từng chữ", "dùng 'đồng thời' / 'cùng lúc'"],
        [/\blàm (?:cho )?chắc chắn (?:rằng|là)?\b/i, 3, "'make sure' dịch từng chữ", "dùng 'đảm bảo'"],
        [/\bkết thúc lên\b/i, 3, "'end up' dịch từng chữ", "dùng 'rốt cuộc' / 'cuối cùng lại'"],
        [/\bhình ra\b/i, 3, "'figure out' dịch từng chữ", "dùng 'tìm ra' / 'hiểu ra'"],
        [/\btrả (?:sự |một sự )?chú ý\b/i, 3, "'pay attention' dịch từng chữ", "dùng 'chú ý'"],
        [/\blặn sâu\b/i, 2, "'deep dive' dịch từng chữ", "dùng 'đi sâu vào'"],
        [/\bnó (?:là )?đáng (?:để )?(?:lưu ý|chú ý|nói|nhắc)\b/i, 3, "'it's worth noting' thêm 'nó' thừa", "dùng 'Cần lưu ý'"],
        [/\bmô hình (?:của|trong) kinh doanh\b/i, 1, "'business model' đảo trật tự", "dùng 'mô hình kinh doanh'"]
    ];
    const CALQUES = CALQUES_RAW.map(([re, sev, d, f]) => [vre(re), sev, d, f]);

    // A word said twice in a row is a slip only for grammar words, which Vietnamese never doubles, and
    // for English ones left in ("the the"). Content words double on purpose ("nổi rần rần", "ầm ầm",
    // "chung chung"): the old allow list of 14 of them flagged "rần rần" as a severity-3 slip (2.3.0).
    const REPEAT_SLIP = new Set(["của", "là", "và", "được", "bị", "những", "các", "một", "cho", "với", "trong", "này", "để",
        "thì", "mà", "đã", "đang", "sẽ", "về", "khi", "nếu", "vì", "nhưng", "hoặc", "rằng", "tôi", "bạn", "chúng", "họ", "nó",
        "không", "có", "ở", "tại", "theo", "như", "cũng", "đó", "the", "of", "to", "and", "is", "that"]);

    function countMatches(text, re) {
        return (String(text).match(re) || []).length;
    }

    // Words Vietnamese has borrowed and writes as they are: keeping them is the right translation.
    // "video" alone was 27 of the leftovers counted in the user's cache (2.3.2).
    const LOANWORDS = new Set(["video", "clip", "online", "offline", "email", "internet", "website", "web", "blog", "vlog",
        "vlogger", "podcast", "livestream", "game", "file", "link", "app", "laptop", "smartphone", "selfie", "fan", "idol",
        "show", "camera", "marketing", "startup", "trend", "style", "menu", "wifi", "virus", "robot", "radio", "taxi",
        "pizza", "karaoke", "yoga", "gym", "voucher", "combo", "team", "size", "playlist", "deadline", "feedback",
        "content", "youtuber", "influencer", "sale", "shop", "shopping", "stress", "test", "logo", "slide", "font", "spa",
        "massage", "hashtag", "emoji", "tag", "mail", "chat",
        // Substances Vietnamese health writing names as they are, and sport and food words used as
        // they are. In the user's 2026-10-01 batch the first five alone were 148 of 340 leftover
        // words, and 16 of the 17 refine flags of one sleep lecture (a refine request each in
        // Balanced mode, the user's), on lines that were right
        "caffeine", "melatonin", "cortisol", "adenosine", "dopamine", "serotonin", "adrenaline", "noradrenaline",
        "epinephrine", "norepinephrine", "testosterone", "estrogen", "progesterone", "insulin", "glucose", "glycogen",
        "cholesterol", "collagen", "creatine", "taurine", "theanine", "apigenin", "melanopsin", "lactate", "ketone",
        "hormone", "vitamin", "protein", "omega", "aspirin", "ibuprofen", "nicotine", "modafinil", "armodafinil",
        "amphetamine", "cocaine", "cardio", "squat", "deadlift", "golf", "tennis", "guitar", "piano", "marathon",
        "kickboxing", "jujitsu", "sandwich", "hamburger", "burger", "latte", "cappuccino", "max", "rep", "reps",
        "euro", "lux",
        // The 2026-10-05 batch, two supplement podcasts and a nutrition talk: with the inner-capital
        // rule, 50 of its 53 leftover words, all substances, foods and things Vietnamese writes as
        // they are (one paid refine). Earlier batches' kept words of the same kind too
        "gluten", "celiac", "glutathione", "creatinine", "monohydrate", "hydrochloride", "methyl", "threonate",
        "curcumin", "dextrose", "melanin", "niacin", "folate", "glyphosate", "urolithin", "heme", "serum",
        "granola", "soda", "sofa", "salad", "album", "hoodie", "jeans", "sedan", "diesel", "ukulele", "martini", "paleo"]);
    // Vietnamese words with no diacritics that English also has: "động cơ chổi than" for "brushed
    // motors ... longer than" read as "than" left in English twice (2.4.5). Not one of them in the
    // translation is evidence of English left in; an untranslated English phrase has other words.
    const VI_PLAIN = new Set(["than", "can", "tin", "ban", "bang", "hang", "long", "sang", "song", "hay", "may", "con",
        "tan", "son", "man", "cam", "pin", "ham", "lam", "rang", "tim", "chi", "lan", "nam", "bao", "sau", "mai", "nay", "tao"]);
    // A web address, an e-mail or a handle is copied, never translated ("betterhelp.com/malamalife"
    // made "betterhelp" and "com" two leftovers of a sponsor line and paid for a refine, 2.3.2)
    const ADDRESS_RE = /(?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?:\/\S*)?|[\w.-]+@[\w-]+(?:\.[\w-]+)+|@[\w.]+/gi;

    function englishLeftovers(vi, allow) {
        // Unicode word edges: with ASCII \b, "thuật" gave "thu" and "thảo" gave "tha"
        const words = String(vi).replace(ADDRESS_RE, " ").match(/(?<![\p{L}\p{N}])[A-Za-z][A-Za-z'-]{2,}(?![\p{L}\p{N}])/gu) || [];
        const allowSet = allow || new Set();
        return words.filter(w => {
            if (/^[A-Z0-9]{2,}$/.test(w)) return false;          // viết tắt: GPU, API
            if (/[A-Z].*[A-Z]/.test(w.slice(1))) return false;   // camelCase, PyTorch
            if (/^[A-Z]/.test(w)) return false;                  // tên riêng
            if (/^[a-z]+[A-Z]/.test(w)) return false;            // a brand with an inner capital: iPad, eBay, eGFR
            if (LOANWORDS.has(w.toLowerCase()) || VI_PLAIN.has(w)) return false;
            if (allowSet.has(w.toLowerCase())) return false;
            return true;
        });
    }

    // Sound notes ("[Music]", "♪") are translated from a list (soundNoteLine), so they take no part in
    // judging a line: a lyric line full of notes read as an "abnormally short" translation (2.3.2)
    const NOTE_SPAN = /\[[^\][]*\]|[♪♫]+/g;
    // ... nor do speaker labels of edited captions ("ANDREW HUBERMAN: Number six."), which the model
    // keeps in some lines and drops in others: dropped, "Số sáu." read as an omission (2026-10-01)
    const LABEL_SPAN = /(^|[.!?…-]\s+)(\p{Lu}[\p{Lu}\p{M}.'’-]*(?:\s+\p{Lu}[\p{Lu}\p{M}.'’-]*){0,3}):\s+/gu;
    const dropLabels = t => t.replace(LABEL_SPAN, (m, lead, name) => (/\p{Lu}{2}/u.test(name) ? lead : m));

    // src: câu tiếng Anh, vi: bản dịch, opts: { terms:[{en,vi}], keep:Set(từ được giữ nguyên) }
    function assess(src, vi, opts = {}) {
        const issues = [];
        const s = dropLabels(String(src || "").replace(NOTE_SPAN, " ").replace(/\s+/g, " ").trim());
        const v = dropLabels(String(vi || "").split("¦").join(" ").replace(NOTE_SPAN, " ").replace(/\s+/g, " ").trim());
        const add = (type, severity, detail, fix) => issues.push({ type, severity, detail, fix });
        if (!s && String(src || "").trim()) return finish(issues);        // sound notes only
        // ... in round brackets too: "(Laughter)" left "[Tiếng cười]", read as an empty translation, a
        // severity-3 issue and a refine request in Balanced mode (4 TED lines, 2026-10-01 batch)
        if (soundNoteLine(src)) return finish(issues);
        // Beside a note, a word or four is mostly the recognizer hearing the music ("[Music] is
        // [Music]", "S [Musik]", "mahusus in cand daya [Musik]"): leaving it out is no empty line
        if (!v && /\[[^\][]*\]|[♪♫]/.test(String(src || "")) && s.split(" ").length <= 4) return finish(issues);

        if (!v) {
            add("empty", 3, "bản dịch rỗng", "dịch đầy đủ");
            return finish(issues);
        }

        for (const [re, sev, detail, fix] of CALQUES) {
            if (re.test(v)) add("calque", sev, detail, fix);
        }

        const words = v.split(" ");
        if (countMatches(v, vre(/\bcủa nó\b/gi)) >= 2) add("calque", 2, "lạm dụng 'của nó' (sao chép 'its')", "bỏ bớt, dùng 'này' hoặc lược");
        if (countMatches(v, vre(/\bmột cách\b/gi)) >= 2) add("calque", 2, "lạm dụng 'một cách' (sao chép trạng từ -ly)", "dùng tính từ/trạng từ trực tiếp");
        if (countMatches(v, vre(/\b(?:được|bị)\b/gi)) >= 3 && words.length < 30) add("passive", 2, "câu bị động dày đặc", "chuyển sang chủ động");
        if (vre(/(?:^|[.!?]\s+)Nó\b/).test(v) && /(?:^|[.!?]\s+)(?:It|This)\b/.test(s)) {
            add("pronoun", 1, "'It/This' dịch máy móc thành 'Nó'", "nêu rõ đối tượng (mô hình, hàm...) nếu ngữ cảnh cho phép");
        }
        for (let i = 1; i < words.length; i++) {
            // "...của tôi. Tôi thích..." is two sentences, not "tôi tôi": a repeat across punctuation
            // flagged 9 of 531 real lines, each a severity-3 issue that paid for a refine (2.3.0)
            if (/[,.;:!?…)"”'\]]$/.test(words[i - 1]) || /^[("“'[]/.test(words[i])) continue;
            const a = words[i - 1].toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
            const b = words[i].toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
            if (a && a === b && REPEAT_SLIP.has(a)) { add("repeat", 3, `lặp từ "${a} ${b}"`, "bỏ từ lặp"); break; }
        }

        // Tỷ lệ độ dài: tiếng Việt thường dài 0,9 đến 1,6 lần tiếng Anh (tính ký tự). Only for a source
        // in Latin or Cyrillic letters: one Chinese character is a whole syllable, and a Hindi mantra
        // read as "abnormally short" twice in the user's cache (2.3.2)
        const letters = s.match(/\p{L}/gu) || [];
        const alphabetic = letters.filter(ch => /[\p{Script=Latin}\p{Script=Cyrillic}]/u.test(ch)).length >= letters.length * 0.7;
        if (s.length >= 25 && alphabetic) {
            const r = v.length / s.length;
            if (r < 0.55) add("omission", 3, `bản dịch ngắn bất thường (${r.toFixed(2)} lần câu gốc), có thể bỏ sót ý`, "dịch đủ ý");
            else if (r > 2.3) add("addition", 2, `bản dịch dài bất thường (${r.toFixed(2)} lần câu gốc), có thể thêm ý`, "bỏ phần thêm");
        }

        // Sót tiếng Anh (không tính tên riêng, viết tắt, thuật ngữ được giữ)
        const keep = new Set([...(opts.keep || [])].map(x => String(x).toLowerCase()));
        (opts.terms || []).forEach(t => String(t.vi || "").split(/\s+/).forEach(w => keep.add(w.toLowerCase())));
        const leftovers = englishLeftovers(v, keep).filter(w => new RegExp(`\\b${w}\\b`, "i").test(s));
        const srcWords = (s.match(/[A-Za-z]+/g) || []).length || 1;
        if (leftovers.length >= 3 || (leftovers.length >= 2 && leftovers.length / srcWords > 0.2)) {
            add("untranslated", leftovers.length >= 3 ? 3 : 2, `còn từ tiếng Anh chưa dịch: ${leftovers.slice(0, 5).join(", ")}`, "dịch hoặc giữ có chủ ý");
        }

        // Thuật ngữ đã thống nhất nhưng câu này dùng cách khác
        for (const t of opts.terms || []) {
            if (!t.en || !t.vi) continue;
            const inSrc = new RegExp(`(?<![A-Za-z])${t.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:e?s)?(?![A-Za-z])`, "i").test(s);
            if (!inSrc) continue;
            const low = v.toLowerCase();
            if (!low.includes(t.vi.toLowerCase()) && !low.includes(t.en.toLowerCase())) {
                add("terminology", 1, `thuật ngữ "${t.en}" đã thống nhất là "${t.vi}" nhưng câu này dịch khác`, `dùng "${t.vi}" nếu cùng nghĩa`);
            }
        }
        return finish(issues);
    }

    function finish(issues) {
        const score = issues.reduce((a, b) => a + b.severity, 0);
        return {
            score,
            issues,
            // Dịch lại khi có lỗi nặng, hoặc nhiều lỗi nhẹ cộng dồn
            needsRefine: issues.some(i => i.severity >= 3) || score >= 4
        };
    }

    // ---------- Context leaking into a translation ----------
    // Each request carries the neighbouring lines as context, and now and then the model translates
    // that context too, into the unit before it. Measured on a real cached video: one group's
    // translation held the next two groups' content (which were also translated on their own), so
    // the subtitle showed a sentence twice and the voice read it twice, at 36 to 51 characters per
    // second to fit. Detect it by the text itself, with no extra request: the tail of this unit
    // repeats the next unit's translation, word pair for word pair.
    const syllables = t => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
    const pairs = w => { const out = []; for (let i = 1; i < w.length; i++) out.push(w[i - 1] + " " + w[i]); return out; };
    function clauseEnds(t) {
        const out = [];
        const re = /[,.;:!?…]+["”')\]]*\s+/g;
        let m;
        while ((m = re.exec(t))) out.push(m.index + m[0].length);
        return out;
    }

    // A tail can look like the next units without being theirs: the speaker says a thing twice, or in
    // two parallel clauses ("spend this money on yourself" / "... on someone else", "drop by 1 to 3
    // degrees" / "a 1 to 3 degree increase"). In the user's 2026-10-01 batch 9 lines lost a clause
    // that way when translated, each cut to 0.22-0.54 of its source's length ("Bạn phải nhớ rằng"),
    // and the repair on load cut 7 more saved lines, in long units ("Và nếu bạn đang có những mối
    // quan hệ không"), every time the video opened. A leak adds the next units on top of the unit's
    // own text, so with the source known a cut is refused when the whole translation is under
    // LEAK_ROOM times the source's length (no room for a leaked unit: 1.29 is the 90th percentile of
    // 4934 real units, the leaks measured were 2 to 2.4), or when it would leave less than
    // LEAK_KEEP_MIN of that length and the whole is under LEAK_FULL_MIN.
    const LEAK_ROOM = 1.3;
    const LEAK_KEEP_MIN = 0.7;
    const LEAK_FULL_MIN = 1.8;

    // Returns text without the leaked tail, or text unchanged. next: the following unit(s)' translation.
    // opts.src: this unit's source line (enables the guard above).
    function trimContextLeak(text, next, opts) {
        const t = String(text || "");
        const nextPairs = new Set(pairs(syllables(next)));
        const nextWords = new Set(syllables(next));
        if (!nextPairs.size) return t;
        const ends = clauseEnds(t);
        let best = null;
        for (const b of ends) {
            const tail = pairs(syllables(t.slice(b)));
            if (tail.length < 6 || syllables(t.slice(0, b)).length < 4) continue;
            const hit = tail.filter(x => nextPairs.has(x)).length;
            // at least half the word pairs repeat the next unit, and more repeat than not
            const score = hit - (tail.length - hit);
            if (hit >= 6 && hit / tail.length >= 0.5 && (!best || score > best.score)) best = { b, score };
        }
        if (!best) return t;
        // Walk back over short clauses made only of the next unit's words ("Ngoài khoản đó ra,"):
        // a paraphrase shares words, not word pairs. Stop at the first clause with its own content.
        let cut = best.b;
        for (let k = ends.indexOf(cut) - 1; k >= -1; k--) {
            const from = k >= 0 ? ends[k] : 0;
            const clause = syllables(t.slice(from, cut));
            if (!clause.length || clause.length > 6) break;
            if (clause.filter(w => nextWords.has(w)).length / clause.length < 1) break;
            if (syllables(t.slice(0, from)).length < 4) break;
            cut = from;
        }
        const out = t.slice(0, cut).replace(/[,;:\s]+$/, "");
        const own = opts && opts.src ? String(opts.src).replace(NOTE_SPAN, " ").replace(/\s+/g, " ").trim().length : 0;
        if (own >= 20 && (t.length < own * LEAK_ROOM || (out.length < own * LEAK_KEEP_MIN && t.length < own * LEAK_FULL_MIN))) return t;
        return out;
    }

    // ---------- A unit that opens by translating the one before it again ----------
    // Seen in the user's cache (2.3.0): a window's middle item was a sentence fragment; the model
    // answered it with only the fragment's first words, then opened the next item with those same
    // words and the rest of the sentence. The line was shown and spoken twice. trimContextLeak
    // looks at a unit's tail only, so this head repeat passed.
    const REPEAT_MIN_WORDS = 6;
    function wordSpans(t) {
        const out = [];
        const re = /[\p{L}\p{M}\p{N}]+/gu;              // \p{M}: Devanagari vowel signs, decomposed accents
        let m;
        while ((m = re.exec(t))) out.push({ w: m[0].toLowerCase(), e: m.index + m[0].length });
        return out;
    }
    // The two source lines share a run of three words: the source repeats itself (a chorus, a
    // mantra that says a line twice with one word changed), so a repeat in the translation is its own
    function sourceRepeats(x, y) {
        const tri = s => { const w = wordSpans(String(s || "")).map(o => o.w); const out = new Set(); for (let i = 2; i < w.length; i++) out.add(w[i - 2] + " " + w[i - 1] + " " + w[i]); return out; };
        const a = tri(x);
        for (const t of tri(y)) if (a.has(t)) return true;
        return false;
    }
    // Largest m >= min such that the last m words of A are the first m words of B (0 if none)
    function headRepeat(A, B, min) {
        for (let m = Math.min(A.length, B.length); m >= min; m--) {
            let same = true;
            for (let i = 0; i < m && same; i++) same = A[A.length - m + i].w === B[i].w;
            if (same) return m;
        }
        return 0;
    }
    // The same seam the other way round, in other words (2.4.4). A source unit that stops mid-sentence
    // ends a window ("you can put it in a" | "charger or in a box so it's out of sight out of mind"):
    // the model finished the sentence in that unit anyway, and the next window translated the
    // sentence's end again ("... chiếc hộp để khuất tầm mắt, khuất tâm trí." | "ngăn kéo hoặc trong
    // hộp để khuất tầm mắt, khuất tâm trí."), so it was shown and read twice. Not word for word, so
    // headRepeat misses it. Measured on the user's 40 cached videos (6873 units): 2 such seams, and
    // 45 lookalikes that are not: a speaker repeating or answering ("Any average?" | "An average."),
    // a sentence split right ("Chẳng ai" | "cần tất cả chúng cả."). Those are told apart by the seam:
    // the source unit runs on (no sentence end), its translation closes a sentence anyway, and the
    // next unit's first sentence is shorter than that sentence and shares most of its word pairs.
    const RETOLD_MIN_PAIRS = 3;
    const RETOLD_SHARE = 0.6;
    const SENTENCE_END = /[.!?…]+["”')\]]*/;
    function retoldHead(a, b, srcA, srcB) {
        if (!srcA || !srcB || sourceRepeats(srcA, srcB)) return 0;
        const tail = String(srcA).replace(/[\s¦]+$/, "");
        if (new RegExp(SENTENCE_END.source + "$").test(tail) || !new RegExp(SENTENCE_END.source + "$").test(a)) return 0;
        const head = b.match(new RegExp("^[^.!?…]*" + SENTENCE_END.source));
        if (!head || !/[\p{L}\p{N}]/u.test(b.slice(head[0].length))) return 0;   // b would be left empty
        const sentences = a.split(new RegExp("(?<=" + SENTENCE_END.source + ")\\s+")).filter(Boolean);
        const last = wordSpans(sentences[sentences.length - 1]).map(o => o.w);
        const H = wordSpans(head[0]).map(o => o.w);
        if (H.length >= last.length) return 0;
        const own = new Set(); for (let i = 1; i < last.length; i++) own.add(last[i - 1] + " " + last[i]);
        let hit = 0; for (let i = 1; i < H.length; i++) if (own.has(H[i - 1] + " " + H[i])) hit++;
        return hit >= RETOLD_MIN_PAIRS && hit / (H.length - 1) >= RETOLD_SHARE ? head[0].length : 0;
    }

    // The seam moved, nothing repeated (2.4.4): a unit translated the next unit's content too, and the
    // next window, given that translation as context, answered its unit with only the last words.
    // Seen once in the user's 40 videos: 1.91 times its source on one side, 0.08 on the other ("cơn
    // đau mới thực sự ập đến và"); the voice had to fit both in the first slot, fell 4.6 s behind and
    // dropped a 60-word line. Over 5000 units the ratio's 1st and 99th percentiles are 0.65 and 1.60,
    // so a seam past SHIFT_HI on one side and under SHIFT_LO on the other is split again at the clause
    // end that gives each unit its source's share. Words are only moved, never added or dropped.
    const SHIFT_HI = 1.6;
    const SHIFT_LO = 0.45;
    const SHIFT_MIN_SRC = 40;
    const CLAUSE_END = /[,.;:!?…]["”')\]]*[\s¦]+(?=\S)/g;
    const plainLen = t => String(t || "").split("¦").join(" ").replace(NOTE_SPAN, " ").replace(/>>/g, " ").replace(/\s+/g, " ").trim().length;
    function shiftedTail(a, b, srcA, srcB) {
        const la = plainLen(srcA), lb = plainLen(srcB);
        if (la < SHIFT_MIN_SRC || lb < SHIFT_MIN_SRC || plainLen(a) < la * SHIFT_HI || plainLen(b) > lb * SHIFT_LO) return -1;
        const share = la / (la + lb), total = a.length + 1 + b.length;
        const cost = p => Math.abs(p / total - share) + (p < a.length && !/[.!?…]["”')\]]*[\s¦]+$/.test(a.slice(0, p)) ? 0.03 : 0);
        let best = a.length;
        const re = new RegExp(CLAUSE_END.source, "g");
        let c;
        while ((c = re.exec(a))) if (cost(c.index + c[0].length) < cost(best)) best = c.index + c[0].length;
        return best < a.length ? best : -1;
    }
    // vi: the translations of consecutive units, src: their source lines (same order). Returns a new
    // array. When unit k+1 opens with unit k's last REPEAT_MIN_WORDS+ words word for word, and the
    // source lines do not repeat each other (a chorus, a mantra), the repeat is dropped from k+1 and
    // the text between them is split again at the clause end that gives unit k its share of the
    // source: left short, unit k had a few words in its slot and k+1 twice its text to fit. When k+1
    // opens by retelling the end of k's sentence (retoldHead), that first sentence is dropped; when
    // k holds k+1's content and k+1 is nearly empty (shiftedTail), k's tail moves over to k+1.
    function fixRepeatedHeads(vi, src) {
        const out = (vi || []).slice();
        const srcLen = i => String((src && src[i]) || "").trim().length;
        for (let k = 0; k + 1 < out.length; k++) {
            const a = String(out[k] || "").trim(), b = String(out[k + 1] || "");
            const A = wordSpans(a), B = wordSpans(b);
            const m = headRepeat(A, B, REPEAT_MIN_WORDS);
            if (!m) {
                if (!src || !a || !b.trim()) continue;
                const cut = retoldHead(a, b.trim(), src[k], src[k + 1]);
                if (cut) { out[k + 1] = b.trim().slice(cut).replace(/^[\s¦,;:.…]+/, "").trim(); continue; }
                const p = shiftedTail(a, b.trim(), src[k], src[k + 1]);
                if (p > 0) {
                    out[k] = a.slice(0, p).replace(/[\s¦]+$/, "");
                    out[k + 1] = (a.slice(p).replace(/^[\s¦]+/, "") + " " + b.trim()).trim();
                }
                continue;
            }
            if (m >= B.length) continue;                    // b is only the repeat
            if (src && sourceRepeats(src[k], src[k + 1])) continue;
            const rest = b.slice(B[m - 1].e);
            const glue = /^[\s¦]*[,;:.!?…]/.test(rest) ? "" : " ";
            // candidate cuts: every clause end of rest but its last, and 0 (move nothing)
            const cuts = [0];
            const re = /[,.;:!?…]["”')\]]*[\s¦]+(?=\S)/g;
            let c;
            while ((c = re.exec(rest))) cuts.push(c.index + c[0].length);
            let best = 0;
            const la = srcLen(k), lb = srcLen(k + 1);
            if (la && lb) {
                const share = la / (la + lb);
                const total = a.length + glue.length + rest.trim().length;
                const cost = p => Math.abs((p ? a.length + glue.length + rest.slice(0, p).trim().length : a.length) / total - share) +
                    (p && !/[.!?…]["”')\]]*[\s¦]+$/.test(rest.slice(0, p)) ? 0.03 : 0);
                for (const p of cuts) if (cost(p) < cost(best)) best = p;
            }
            out[k] = best ? (a + glue + rest.slice(0, best).replace(/^[\s¦]+/, "")).trim() : a;
            out[k + 1] = rest.slice(best).replace(/^[\s¦,;:.…]+/, "").trim();
        }
        return out;
    }

    // ---------- A window whose answers slid by one item (2.4.5) ----------
    // Seen in a podcast window of short lines: the model split one line in two ("no, no." / "It's
    // drop everything and read."), so the next answers each sat one item late ("It's 8:00." showed
    // "Mọi việc phải dừng lại hết để đọc sách.", "You're supposed to be reading." showed "Đã 8 giờ
    // rồi."), until two lines were merged and one was lost. Only one item looked short, and its
    // flag asked the refine to "translate in full", not to realign. Found by length: in a run of
    // SLIDE_MIN_RUN+ items, each answer's length fits the neighbouring item's source clearly better
    // than its own. Over the user's 40 videos (6873 units) one run, this one; number anchors (a
    // number in the source missing from its answer, present in the neighbour's) agree: 1 of 736.
    const SLIDE_MIN_RUN = 3;
    const SLIDE_MARGIN = 0.25;
    const SLIDE_GAIN = 0.5;
    const lenMiss = (v, s) => Math.abs(Math.log((v + 8) / (s + 8)));   // +8: short lines are noisy
    const latinShare = t => { const l = String(t).match(/\p{L}/gu) || []; return l.length ? l.filter(ch => /[\p{Script=Latin}\p{Script=Cyrillic}]/u.test(ch)).length / l.length : 0; };
    // src, vi: one window's items. Returns the indices whose answer slid, ascending.
    function misalignedItems(src, vi) {
        const S = (src || []).map(plainLen), V = (vi || []).map(plainLen);
        const hit = new Set();
        if (S.length < SLIDE_MIN_RUN || V.length !== S.length || latinShare((src || []).join(" ")) < 0.7) return [];
        for (const d of [1, -1]) {                    // 1: answer i is item i-1's; -1: item i+1's
            let run = 0, gain = 0;
            for (let i = 0; i <= S.length; i++) {
                const j = i - d;
                const g = i < S.length && j >= 0 && j < S.length && V[i] && S[i] ? lenMiss(V[i], S[i]) - lenMiss(V[i], S[j]) : 0;
                if (g > SLIDE_MARGIN) { run++; gain += g; continue; }
                if (run >= SLIDE_MIN_RUN && gain / run > SLIDE_GAIN) for (let k = i - run; k < i; k++) hit.add(k);
                run = 0; gain = 0;
            }
        }
        return [...hit].sort((a, b) => a - b);
    }

    // Which answers a refine keeps. Item by item, the one that scores better, so a refine never makes
    // a line worse. Not when the first answer slid: mixed items of a slid answer and a realigned one
    // show a line twice and lose another, so the whole refined window is taken, if it scores better.
    function pickRefined(first, again, q1, q2) {
        const slid = q1.some(q => q.issues.some(i => i.type === "misaligned"));
        if (!slid) return first.map((t, k) => (q2[k].score < q1[k].score ? again[k] : t));
        const total = qs => qs.reduce((a, q) => a + q.score, 0);
        return total(q2) < total(q1) ? again.slice() : first.slice();
    }

    // ---------- Realigning a slid run by its sentences (2.4.7) ----------
    // A podcast window: one 20 s item held three speaker turns, the model answered only the first and
    // put the second turn into the next item, so every next answer sat one item late until two were
    // merged ("Creapure là thương hiệu đến từ Đức." under "It has the highest standard...", and three
    // sentences squeezed into the 1.6 s of ">> Creapure is from Germany."). misalignedItems missed it:
    // one item in the run fit both neighbours equally by length. The answers are all there, only cut
    // in the wrong places, so the cuts are moved back for free: the answers' sentences are dealt to
    // the items again, in order, by a dynamic program over where each item's sentences end, scoring
    // each item by how far its length is from its source's (the log ratio's spread over 6496 units is
    // 0.18) and by kept words or numbers ("NSF", "1832") that sit under a neighbour's source instead
    // of their own. A run is moved only when that saves REALIGN_MIN_GAIN: over the user's 45 videos
    // the cases above 4 were 10 below 10 (lookalikes: "Lean mass. Lean mass, yeah." over two turns)
    // and 4 above 40 (two of them seams fixRepeatedHeads mends first). Words are only moved.
    const REALIGN_MIN_GAIN = 20;
    const REALIGN_DRIFT = 3;            // an item's last sentence moves at most this many sentences
    const REALIGN_SPREAD = 0.18;
    const REALIGN_RATIO = 1.04;         // median Vietnamese / English length over the same units
    const REALIGN_ANCHOR = 1.5;
    const SENTENCE_GAP = /(?<=[.!?…]["”')\]]*)[\s¦]+(?=[^\s¦])/;
    const anchorWords = t => String(t || "").replace(NOTE_SPAN, " ").toLowerCase()
        .match(/(?<![\p{L}\p{N}])(?:[a-z][a-z'-]{2,}|\d(?:[\d.,]*\d)?)(?![\p{L}\p{N}])/gu) || [];
    // src, vi: items in order (a window, or a whole video's groups). Returns vi, or a new array.
    function realignSentences(src, vi) {
        const N = (src || []).length;
        if (N < 2 || !Array.isArray(vi) || vi.length !== N || latinShare(src.join(" ")) < 0.7) return vi;
        const items = vi.map(t => String(t || "").trim() ? String(t).trim().split(SENTENCE_GAP) : []);
        const sents = [], orig = [0];
        items.forEach(x => { sents.push(...x); orig.push(sents.length); });
        const M = sents.length;
        const pre = [0];
        sents.forEach(s => pre.push(pre[pre.length - 1] + plainLen(s) + 1));
        const S = src.map(plainLen);
        const srcWords = src.map(s => new Set(anchorWords(s)));
        const sentWords = sents.map(anchorWords);
        const memo = new Map();
        const cost = (i, a, b) => {
            const key = (i * (M + 1) + a) * (M + 1) + b;
            if (memo.has(key)) return memo.get(key);
            const V = Math.max(0, pre[b] - pre[a] - 1);
            const z = !S[i] && !V ? 0 : Math.log((V + 8) / (REALIGN_RATIO * S[i] + 8)) / REALIGN_SPREAD;
            let c = z * z;
            for (let k = a; k < b; k++) for (const w of sentWords[k]) {
                if (srcWords[i].has(w)) continue;
                for (let j = Math.max(0, i - REALIGN_DRIFT); j <= Math.min(N - 1, i + REALIGN_DRIFT); j++) {
                    if (j !== i && srcWords[j].has(w)) { c += REALIGN_ANCHOR; break; }
                }
            }
            memo.set(key, c);
            return c;
        };
        // best[i]: sentence count consumed by items 0..i-1 -> { c, prev }
        let layer = new Map([[0, { c: 0, prev: -1 }]]);
        const back = [layer];
        for (let i = 0; i < N; i++) {
            const next = new Map();
            const need = items[i].length ? 1 : 0;       // an answered item keeps a sentence
            for (const [j, st] of layer) {
                const lo = Math.max(j + need, orig[i + 1] - REALIGN_DRIFT), hi = Math.min(M, orig[i + 1] + REALIGN_DRIFT);
                for (let k = lo; k <= hi; k++) {
                    if (i === N - 1 && k !== M) continue;
                    const c = st.c + cost(i, j, k);
                    const cur = next.get(k);
                    if (!cur || c < cur.c) next.set(k, { c, prev: j });
                }
            }
            back.push(layer = next);
        }
        if (!layer.has(M)) return vi;
        const cuts = new Array(N + 1);
        cuts[N] = M;
        for (let i = N; i > 0; i--) cuts[i - 1] = back[i].get(cuts[i]).prev;
        let out = vi;
        for (let b = 1; b < N; b++) {
            if (cuts[b] === orig[b]) continue;
            let e = b;
            while (e + 1 < N && cuts[e + 1] !== orig[e + 1]) e++;
            let gain = 0;
            for (let i = b - 1; i <= e; i++) gain += cost(i, orig[i], orig[i + 1]) - cost(i, cuts[i], cuts[i + 1]);
            if (gain >= REALIGN_MIN_GAIN) {
                if (out === vi) out = vi.slice();
                for (let i = b - 1; i <= e; i++) out[i] = sents.slice(cuts[i], cuts[i + 1]).join(" ");
            }
            b = e;
        }
        return out;
    }

    // ---------- Sound captions ----------
    // Automatic captions mark music, applause and laughter as lines of their own, in the caption's
    // language ("[Music]", "[Musik]", "[Tepuk tangan]"); Coursera writes "[MUSIC]", "[SOUND]". In the
    // user's cache (2.3.1) the model gave "Âm nhạc", "[Âm nhạc]" and "(Âm nhạc)" within one video,
    // and the dub planner leaves only bracketed notes silent, so the bare ones were read aloud. A
    // line of notes only is translated here from this list (a window of nothing else sends no
    // request), and a known note inside speech gets its square brackets back. Square brackets are
    // always a note; round ones only around a word of this list.
    const SOUND_WORDS = {
        "Âm nhạc": ["music", "musik", "musique", "música", "musica", "muziek", "muzyka", "musika", "muzik", "müzik", "музыка", "موسيقى", "音楽", "音乐", "音樂", "음악", "संगीत", "เพลง", "ดนตรี", "âm nhạc", "nhạc"],
        "Vỗ tay": ["applause", "applaus", "applaudissements", "aplausos", "applausi", "oklaski", "palakpakan", "alkış", "аплодисменты", "تصفيق", "拍手", "掌声", "掌聲", "박수", "तालियाँ", "เสียงปรบมือ", "tepuk tangan", "vỗ tay"],
        "Tiếng cười": ["laughter", "laughs", "laughing", "laugh", "gelächter", "lachen", "rires", "risas", "risos", "risate", "śmiech", "смех", "ضحك", "笑い", "笑", "笑声", "笑聲", "웃음", "हंसी", "เสียงหัวเราะ", "tertawa", "tiếng cười", "cười"],
        "Reo hò": ["cheering", "cheers", "reo hò", "hò reo"],
        "Âm thanh": ["sound"],
        "Im lặng": ["silence", "blank audio", "im lặng"]
    };
    // How the model writes each of them inside a Vietnamese line
    const SOUND_VI = {
        "Âm nhạc": "(?:tiếng\\s+)?(?:âm\\s+)?nhạc(?:\\s+nền)?",
        "Vỗ tay": "(?:tiếng\\s+)?vỗ\\s+tay",
        "Tiếng cười": "(?:tiếng\\s+)?cười(?:\\s+lớn)?",
        "Reo hò": "(?:tiếng\\s+)?(?:reo\\s+hò|hò\\s+reo)",
        "Âm thanh": "(?:tiếng\\s+)?âm\\s+thanh",
        "Im lặng": "(?:sự\\s+)?im\\s+lặng"
    };
    const soundKey = s => String(s || "").normalize("NFC").toLowerCase().replace(/[\s_]+/g, " ").replace(/^[\s.…,;:!?-]+|[\s.…,;:!?-]+$/g, "");
    const SOUND_OF = new Map(Object.entries(SOUND_WORDS).flatMap(([vi, list]) => list.map(w => [soundKey(w), vi])));
    const SOUND_VI_RE = Object.entries(SOUND_VI).map(([word, form]) =>
        [word, new RegExp(`([\\[(]\\s*)?(?<![\\p{L}\\p{M}\\p{N}])(${form})(?![\\p{L}\\p{M}\\p{N}])(\\s*[\\])])?`, "giu")]);
    const NOTE_RE = /\[[^\][]*\]|\([^()]*\)|[♪♫]+/g;

    // A line that holds sound notes only: { vi } with the list's words, or vi "" when a note is not in
    // the list (the model translates it, fixSoundNotes brackets its answer). null for a line of speech.
    function soundNoteLine(src) {
        const s = String(src || "").replace(/¦/g, " ").trim();
        const notes = s.match(NOTE_RE);
        if (!notes || /[\p{L}\p{N}]/u.test(s.replace(NOTE_RE, " "))) return null;
        let known = true;
        const vi = [];
        for (const n of notes) {
            if (/^[♪♫]/.test(n)) { vi.push(n); continue; }
            const word = SOUND_OF.get(soundKey(n.slice(1, -1)));
            if (!word && n[0] === "(") return null;            // "(for example)" is speech
            if (!word) known = false;
            vi.push(word ? `[${word}]` : n);
        }
        return { vi: known ? vi.join(" ") : "" };
    }

    // ">>" is how the captions mark a new speaker. The model drops it from most lines and keeps it in
    // a few (27 source lines with it in the user's cache, 5 kept), so the rest lose it here too; the
    // voice takes its speaker turns from the source line (dub-planner.js detectSpeakerMark).
    function dropTurnMarks(text, src) {
        if (!text || !/>>/.test(src) || !/>>/.test(text)) return text;
        const t = String(text).replace(/\s*>>+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
        return /[\p{L}\p{N}]/u.test(t) ? t : text;
    }
    // Automatic captions drop "[music]" wherever the background music is, inside a sentence too
    // ("pays [music] for a gym membership"). The model leaves most of them out; the one it keeps
    // cuts a phrase in two on screen ("dễ dàng [Âm nhạc] vệ sinh": 10 lines in 5 of the user's 21
    // cached videos). Inside a sentence = after a word or a comma and before a lower-case word; a
    // note at the start, at the end or between two sentences stays.
    const MUSIC_INSIDE = /(?<=[\p{L}\p{N},])\s+\[Âm nhạc\]\s+(?=\p{Ll})/gu;

    // A speaker label that opens the source ("ANDREW HUBERMAN: Fantastic.") was kept by the model in
    // some lines and dropped in others (77 of 339 in UIy-WQCZd4M, 2026-10-01), so the subtitle named
    // the speaker now and then. It goes back in front when the translation lacks it. The voice never
    // reads a label (dub-planner.js stripSpeakerLabels).
    const LEAD_LABEL = /^\s*(\p{Lu}[\p{Lu}\p{M}.'’-]*(?:\s+\p{Lu}[\p{Lu}\p{M}.'’-]*){0,3}):\s+\S/u;
    function restoreLabel(text, src) {
        const m = String(src || "").match(LEAD_LABEL);
        if (!m || !/\p{Lu}{2}/u.test(m[1]) || !text || !/[\p{L}\p{N}]/u.test(text) || String(text).includes(m[1] + ":")) return text;
        return `${m[1]}: ${String(text).replace(/^\s+/, "")}`;
    }

    function fixSoundNotes(vi, src) {
        return (vi || []).map((text, i) => {
            const s = String((src && src[i]) || "");
            text = restoreLabel(dropTurnMarks(text, s), s);
            if (!/[[(♪♫]/.test(s)) return text;
            const line = soundNoteLine(s);
            if (line && line.vi) return line.vi;              // even when the model gave nothing
            if (!text) return text;
            if (line) {
                const t = String(text).replace(/¦/g, " ").replace(/\s+/g, " ").trim();
                if (!/[\p{L}\p{N}]/u.test(t.replace(/\[[^\][]*\]|[♪♫]+/g, " "))) return t;
                return `[${t.replace(/[[\]()]/g, "").trim()}]`;
            }
            // Speech with notes in it: a note the model left in the source language is translated,
            // then as many of the list's words as the source has notes get square brackets, taken in
            // order among the words that were bracketed (a lone "]" too: "Vỗ tay] Được rồi"),
            // capitalized as a note is ("Âm nhạc maha mahaun Âm nhạc") or alone on the line;
            // "buồn cười", "thích âm nhạc" are speech and stay.
            const counts = new Map();
            for (const n of s.match(NOTE_RE) || []) {
                const word = n[0] === "[" || n[0] === "(" ? SOUND_OF.get(soundKey(n.slice(1, -1))) : null;
                if (word) counts.set(word, (counts.get(word) || 0) + 1);
            }
            if (!counts.size) return text;
            let out = String(text).replace(/\[([^\][]*)\]/g, (m, inner) => { const w = SOUND_OF.get(soundKey(inner)); return w ? `[${w}]` : m; });
            for (const [word, re] of SOUND_VI_RE) {
                let left = counts.get(word) || 0;
                if (!left) continue;
                out = out.replace(re, (m, open, w, close, at, str) => {
                    if (left <= 0) return m;
                    const alone = !/[\p{L}\p{N}]/u.test(str.slice(0, at) + str.slice(at + m.length));
                    const note = open && close ? true
                        : open || close ? /[[\]]/.test((open || "") + (close || ""))
                            : alone || /^\p{Lu}/u.test(w);
                    if (!note) return m;
                    left--;
                    return `[${word}]`;
                });
            }
            return counts.has("Âm nhạc") ? out.replace(MUSIC_INSIDE, " ") : out;
        });
    }

    const api = { assess, CALQUES, englishLeftovers, vre, trimContextLeak, fixRepeatedHeads, soundNoteLine, fixSoundNotes, misalignedItems, pickRefined, realignSentences };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_QUALITY = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

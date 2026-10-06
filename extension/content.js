// ============================================================
// Coursera Subtitle Translator v3
// Sua loi phu de tran man hinh: ban dich duoc phan bo ve tung dong
// theo ty le do dai, thay vi gan ca cau vao moi dong.
// ============================================================

// Gom cue thanh CAU tron ven truoc khi dich: cau tron ven thi Gemini dich tu nhien
// hon va bo phan doan tieng Viet co du tu do chon diem cat. Cac nguong mem/cung
// chi dung khi phu de khong co dau cau (phu de tu dong).
const GROUP_SOFT_CHARS = 170;      // tu day tro di, dong nhom o cho ngat nghi
const GROUP_HARD_CHARS = 520;      // cau dai van giu tron trong mot nhom (khong dich thanh 2 manh)
const GROUP_HARD_CUES = 12;
const GROUP_MAX_SECONDS = 24;
const GROUP_PAUSE_SECONDS = 1.5;   // lang lau hon muc nay la sang y khac

const state = {
    active: false,
    dualMode: false,
    perCueMode: false,
    glossaryKeep: [],
    glossaryNormalize: [],
    glossaryEnabled: true,
    glossaryMisses: 0,
    glossaryTranslateAs: new Map(),
    reExact: null,
    reLoose: null,
    reRisky: null,
    dubEnabled: true,
    originalFirst: false,
    originalCueTexts: null,
    originalCues: null,
    glossaryMultiTerms: [],
    costMode: "balanced",
    activeTrack: null,
    intervals: [],
    observers: [],
    currentUrl: location.href,
    busy: false,
    // Bumped on every page change (watchNavigation) and when the viewer turns translation off. A
    // track translation started under another value is obsolete: it stops taking windows and never
    // applies its result (translateTrackSite)
    navGen: 0,
    busyGen: -1,            // navGen of the translation run holding `busy`
    groupTotal: 0           // groups of the current track translation (popup progress)
};

// A translation run is going on for what is on screen now (not one left behind by a page change
// or a switch-off, which only finishes its window in flight)
function csTranslating() {
    return state.busy && state.busyGen === state.navGen;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- Thông báo nhỏ trên trình phát (thay hộp thoại chặn trang) ----------
// Hộp thoại alert() chặn cả trang cho tới khi người xem bấm OK (video vẫn chạy, mất lời).
// Thay bằng một thẻ nhỏ góc trên trình phát: tự ẩn, đọc được bằng trình đọc màn hình
// (role=status), có thể kèm MỘT nút thao tác (ví dụ "Mở Cài đặt").
function cstToast(message, opts = {}) {
    try {
        document.querySelectorAll(".cst-toast").forEach(t => t.remove());
        const host = document.querySelector("#movie_player") || document.querySelector(".html5-video-player")
            || document.querySelector("video")?.parentElement || document.body;
        const box = document.createElement("div");
        box.className = "cst-toast";
        box.setAttribute("role", "status");
        box.setAttribute("aria-live", "polite");
        const inPlayer = host !== document.body;
        // Same palette as the popup, the Settings page and the on-player menu. It stays dark in both
        // themes because it sits on top of a video, where a cream panel would glare.
        box.style.cssText = `position:${inPlayer ? "absolute" : "fixed"};top:${inPlayer ? "58px" : "16px"};left:50%;transform:translateX(-50%);
            max-width:min(620px,84%);display:flex;align-items:center;gap:12px;z-index:2147483001;
            padding:11px 14px;border-radius:12px;background:rgba(40,38,34,.965);color:#ECE8E1;
            font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
            box-shadow:0 18px 46px rgba(0,0,0,.5);
            border:1px solid ${opts.warn ? "rgba(232,184,75,.55)" : "#3A3732"};opacity:0;transition:opacity .25s`;
        const text = document.createElement("span");
        text.textContent = message;
        text.style.cssText = "flex:1;white-space:pre-line";
        box.appendChild(text);
        if (opts.actionLabel && opts.onAction) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = opts.actionLabel;
            btn.style.cssText = "flex-shrink:0;padding:6px 12px;border-radius:8px;border:none;background:#D97757;color:#FFFFFF;font:inherit;font-weight:500;cursor:pointer";
            btn.addEventListener("click", () => { box.remove(); try { opts.onAction(); } catch (e) { /* bỏ qua */ } });
            box.appendChild(btn);
        }
        const close = document.createElement("button");
        close.type = "button";
        close.setAttribute("aria-label", "Đóng thông báo");
        close.textContent = "✕";
        close.style.cssText = "flex-shrink:0;background:none;border:none;color:#A8A39A;font-size:13px;cursor:pointer;padding:2px 4px;border-radius:6px";
        close.addEventListener("click", () => box.remove());
        box.appendChild(close);
        host.appendChild(box);
        requestAnimationFrame(() => { box.style.opacity = "1"; });
        const ms = opts.ms || (opts.actionLabel ? 12000 : 6000);
        setTimeout(() => { box.style.opacity = "0"; setTimeout(() => box.remove(), 300); }, ms);
        return box;
    } catch (e) {
        console.warn("[AI Subtitle]", message);
        return null;
    }
}
window.CST_UI = { toast: cstToast };

function getCurrentSite() {
    const url = location.href;
    if (url.includes("coursera.org")) return "coursera";
    // YouTube do youtube.js lo, vi phu de o do hoat dong theo co che khac han
    if (url.includes("youtube.com")) return "youtube";
    // Any other page: the scripts only get here when the viewer asked for it (popup button or a
    // shortcut injects them through activeTab), and the page is served by the shared <video> path
    return "generic";
}

// Coursera and every other page share one pipeline: a <video> with standard text tracks
function isTrackSite(site) {
    return site === "coursera" || site === "generic";
}

// ---------- Chen CSS gioi han kich thuoc phu de ----------
// Ngan phu de phu kin man hinh khi mot dong lo bi dai
function injectCueStyle() {
    const existing = document.getElementById("cst-cue-style");
    if (existing) existing.remove();
    const S = window.CST_STYLE;
    if (!S) return;

    const s = S.normalizeStyle(state.subStyle);
    // Nap phong web (Be Vietnam Pro, Inter...) neu duoc chon; bi chan thi dung bo du phong
    S.ensureFont(document, s.fontFamily, s.fontWeight);

    const style = document.createElement("style");
    style.id = "cst-cue-style";
    // 130% la co chuan cua trinh phat (giu nguyen quy uoc cu cua ban 1.0.4)
    const fontEm = (S.sizeFactor(s.fontSize) * 100 / 130).toFixed(2);
    style.textContent = `
        video::cue {
            font-family: ${S.fontStack(s.fontFamily)} !important;
            font-size: ${fontEm}em !important;
            font-weight: ${s.fontWeight} !important;
            line-height: ${s.lineHeight} !important;
            background-color: ${S.backgroundColor(s)} !important;
            color: ${s.fontColor} !important;
            text-shadow: ${S.textShadow(s)} !important;
            white-space: pre-line !important;
        }
        video::cue(.cst-orig) {
            font-size: ${(s.origScale / 100).toFixed(2)}em;
            color: ${s.origColor};
        }
    `;
    (document.head || document.documentElement).appendChild(style);
}

// The control-bar button's state. Kept as a named function because the whole file calls it.
function setIconState(status) {
    csUpdateButton(status);
}

// ---------- Bao ve thuat ngu va danh tu rieng ----------
// Y tuong: truoc khi gui di dich, thay moi thuat ngu can giu nguyen
// bang mot ma danh dau tam (vi du ZQ0QZ). May dich khong hieu ma nay
// nen giu nguyen no. Dich xong thi thay ma do tro lai bang thuat ngu goc.
//
// Toc do: thay vi quet van ban mot lan cho MOI thuat ngu (hang tram lan),
// gom tat ca thuat ngu vao MOT bieu thuc duy nhat va chi quet hai lan.

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Muc co chu hoa -> phai so khop dung chu hoa (tranh "Excel" bat nham "excel")
function needsExactCase(term) {
    return /[A-Z]/.test(term);
}

// Bien mot thuat ngu thanh mau nhan dien, co chap nhan dang so nhieu.
// Day la phan sua loi quan trong: truoc day "landing page" khong bat duoc
// "landing pages", "AI agent" khong bat duoc "AI agents".
function termToPattern(term) {
    // Ket thuc bang phu am + y  ->  chap nhan ca "y" va "ies"
    // (case study / case studies, category / categories)
    if (/[bcdfghjklmnpqrstvwxz]y$/i.test(term)) {
        return escapeRegex(term.slice(0, -1)) + "(?:y|ies)";
    }
    // Ket thuc bang chu cai  ->  cho phep them "s" hoac "es"
    // (agent / agents, box / boxes). Neu tu von khong co dang so nhieu
    // thi phan them nay khong khop gi ca, hoan toan vo hai.
    if (/[a-z0-9]$/i.test(term)) {
        return escapeRegex(term) + "(?:e?s)?";
    }
    return escapeRegex(term);
}

// Dung bieu thuc gop tu danh sach thuat ngu, sap xep cum dai truoc
// de "Claude Code" duoc bat truoc "Claude"
function buildMasterRegex(terms, flags) {
    if (terms.length === 0) return null;
    const sorted = [...terms].sort((a, b) => b.length - a.length);
    const parts = sorted.map(termToPattern);
    // Khong cho khop khi ky tu lien ke la chu hoac so
    return new RegExp(`(?<![\\w])(?:${parts.join("|")})(?![\\w])`, flags);
}

// ---------- Thuat ngu phu thuoc ngu canh ----------
// Mot so tu chi la thuat ngu khi doan van dang noi ve linh vuc do.
// "agent" trong bai giang AI la AI agent, nhung trong bai giang bao hiem
// lai la dai ly that. Chi bao ve khi doan van co dau hieu cua linh vuc.
function buildContextualRegex(text) {
    const danhSach = (typeof CST_CONTEXTUAL_TERMS !== "undefined") ? CST_CONTEXTUAL_TERMS : [];
    if (danhSach.length === 0) return null;

    const phuHop = danhSach.filter(muc =>
        muc.context.some(tuKhoa => text.toLowerCase().includes(tuKhoa.toLowerCase()))
    );
    if (phuHop.length === 0) return null;

    const parts = phuHop
        .map(m => m.term)
        .sort((a, b) => b.length - a.length)
        .map(termToPattern);

    try {
        return new RegExp(`(?<![\\w])(?:${parts.join("|")})(?![\\w])`, "gi");
    } catch (e) {
        return null;
    }
}

function rebuildGlossaryRegex() {
    const risky = new Set(
        (typeof CST_RISKY_PROPER !== "undefined" ? CST_RISKY_PROPER : [])
    );

    const exact = [];
    const loose = [];
    const riskyList = [];

    for (const term of state.glossaryKeep) {
        if (!term || term.length < 2) continue;
        if (risky.has(term)) riskyList.push(term);
        else if (needsExactCase(term)) exact.push(term);
        else loose.push(term);
    }

    try {
        state.reExact = buildMasterRegex(exact, "g");
        state.reLoose = buildMasterRegex(loose, "gi");

        // Tang thu ba: ten rieng trung tu tieng Anh thong dung.
        // Chi bao ve khi KHONG dung dau cau, tranh bat nham
        // "Notion of freedom" hay "Excel at your job" o dau cau.
        if (riskyList.length > 0) {
            const sorted = [...riskyList].sort((a, b) => b.length - a.length);
            const parts = sorted.map(escapeRegex);
            state.reRisky = new RegExp(
                `(?<![.!?]["')\\]]?\\s)(?<!^)(?<![\\w])(?:${parts.join("|")})(?![\\w])`,
                "g"
            );
        } else {
            state.reRisky = null;
        }
    } catch (err) {
        console.warn("Khong dung duoc bieu thuc tu dien:", err.message);
        state.reExact = null;
        state.reLoose = null;
        state.reRisky = null;
    }

    console.log(`Tu dien: ${exact.length} muc dung chu hoa, ${loose.length} muc khong phan biet, ${riskyList.length} ten rieng can than trong`);
}

// The rendering declared for a matched term. The match patterns accept plurals, the map holds the
// singular: "interest rates" and "case studies" must find "interest rate" and "case study".
function translateAsFor(match) {
    const map = state.glossaryTranslateAs;
    const k = String(match).toLowerCase();
    if (map.has(k)) return map.get(k);
    if (k.endsWith("ies") && map.has(k.slice(0, -3) + "y")) return map.get(k.slice(0, -3) + "y");
    if (k.endsWith("es") && map.has(k.slice(0, -2))) return map.get(k.slice(0, -2));
    if (k.endsWith("s") && map.has(k.slice(0, -1))) return map.get(k.slice(0, -1));
    return undefined;
}

function protectGlossary(text) {
    if (!state.glossaryEnabled) return { text, terms: [] };

    let out = text;

    // Buoc 1: chuan hoa cac bien the ve dang chuan
    for (const [pattern, canonical] of state.glossaryNormalize) {
        try {
            out = out.replace(new RegExp(pattern, "gi"), canonical);
        } catch (e) { /* mau khong hop le thi bo qua */ }
    }

    // Buoc 2: thay thuat ngu bang ma danh dau
    const terms = [];
    const replaceWithToken = (match) => {
        // Neu nguoi dung khai bao dang "tu goc => dang muon hien"
        // thi dien dang muon hien, nguoc lai giu nguyen ban goc
        const custom = translateAsFor(match);
        const id = terms.length;
        terms.push(custom !== undefined ? custom : match);
        // Dung token an toan co khoang trang bao boc de may dich khong dinh tu lien vao token
        return ` [[__T${id}__]] `;
    };

    if (state.reExact) {
        state.reExact.lastIndex = 0;
        out = out.replace(state.reExact, replaceWithToken);
    }
    if (state.reLoose) {
        state.reLoose.lastIndex = 0;
        out = out.replace(state.reLoose, replaceWithToken);
    }
    if (state.reRisky) {
        state.reRisky.lastIndex = 0;
        out = out.replace(state.reRisky, replaceWithToken);
    }

    // Tang thu tu: thuat ngu chi co nghia trong dung linh vuc
    const reContext = buildContextualRegex(text);
    if (reContext) {
        out = out.replace(reContext, replaceWithToken);
    }

    return { text: out, terms };
}

// Buoc loc cuoi cho MOI ban dich: xoa ma giu cho bi sot, markdown, ngoac kep
// bao ngoai. Giu lai dau goi y ngat nghi "¦" cho bo phan doan (se bi xoa khi hien thi).
function finalizeTranslation(text) {
    if (window.CST_VI_SEG) return window.CST_VI_SEG.cleanText(text, { keepHints: true });
    return String(text || "").replace(/\[\[[^\]]*\]\]|__T\d+__|ZQ\d+QZ/gi, " ").replace(/\s{2,}/g, " ").trim();
}

function stripHints(text) {
    return String(text || "").split("¦").join(" ").replace(/\s{2,}/g, " ").trim();
}

function restoreGlossary(text, terms) {
    if (terms.length === 0) return finalizeTranslation(text);

    // Regex da dang: bat ca format moi [[__T0__]] va format cu ZQ0QZ / Z Q 0 Q Z
    let restored = text.replace(/(?:\[\[\s*__\s*T\s*(\d+)\s*__\s*\]\]|__T\s*(\d+)\s*__|Z\s*Q\s*(\d+)\s*Q\s*Z)/gi, (match, p1, p2, p3, offset, whole) => {
        const num = p1 !== undefined ? p1 : (p2 !== undefined ? p2 : p3);
        const idx = parseInt(num, 10);
        if (terms[idx] === undefined) return match;
        return sentenceStartAt(whole, offset) ? capitalizeLowerTerm(terms[idx]) : terms[idx];
    });

    // Don dep khoang trang thua sinh ra boi token
    restored = restored.replace(/[ \t]{2,}/g, " ").trim();

    const leftover = restored.match(/(?:\[\[\s*__\s*T\s*\d+\s*__\s*\]\]|__T\s*\d+\s*__|Z\s*Q\s*\d+\s*Q\s*Z)/gi);
    if (leftover) {
        state.glossaryMisses += leftover.length;
    }

    // Ma nao con sot (vi du mo hinh doi so thu tu) thi xoa, khong de lot ra man hinh
    return finalizeTranslation(restored);
}

// A term restored where a sentence starts: "độ lệch chuẩn cho biết..." must read "Độ lệch chuẩn...".
function sentenceStartAt(text, offset) {
    return /(?:^|[.!?…]["”')\]]?\s)[\s"“'(\[-]*$/.test(text.slice(0, offset));
}

// Only an all-lowercase term is capitalized: "iOS", "eCPM" or "n8n" keep their brand casing.
function capitalizeLowerTerm(term) {
    const t = String(term);
    if (t !== t.toLowerCase() || !t) return t;
    return t.charAt(0).toLocaleUpperCase("vi") + t.slice(1);
}

function glossaryIntact(translatedText, terms) {
    if (terms.length === 0) return true;
    const found = (translatedText.match(/(?:\[\[\s*__\s*T\s*\d+\s*__\s*\]\]|__T\s*\d+\s*__|Z\s*Q\s*\d+\s*Q\s*Z)/gi) || []).length;
    return found >= Math.ceil(terms.length * 0.4);
}

// ---------- Tang goi dich thuat (co ngu canh) ----------
// SOURCE CONTEXT -> CONTEXT UNDERSTANDING -> TERMINOLOGY -> TRANSLATION
// -> NATURALIZATION (kiem tra dich may + dich lai) -> (phan doan, ngat dong o buoc sau)

// Bao ve thuat ngu tren CA DOAN: ma giu cho danh so chung cho moi muc,
// kem bang giai nghia de mo hinh van hieu tung ma dai dien cho tu gi
// (loi cu: mo hinh chi thay "[[__T0__]]" nen khong biet cau noi ve gi).
function protectMany(sentences) {
    const joined = sentences.join("\n");
    const res = protectGlossary(joined);
    const texts = res.text.split("\n").map(t => t.replace(/[ \t]{2,}/g, " ").trim());
    if (texts.length !== sentences.length) return { texts: sentences, terms: [] };
    return { texts, terms: res.terms };
}

function sendMessageAsync(msg) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(msg, response => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (!response || !response.ok) reject(new Error(response ? response.error : "Khong co phan hoi"));
            else resolve(response);
        });
    });
}

// What context went with the request, so it can be checked in the console while watching, with no
// extra call: previous source, previous translation, the far antecedent, agreed terms, hints.
function contextSummary(ctx) {
    if (!ctx) return "";
    const yes = v => (v && (!Array.isArray(v) || v.length) ? "✓" : "✗");
    return ` · ngữ cảnh: câu trước ${yes(ctx.prevSource)}, bản dịch trước ${yes(ctx.prevTranslation)}, nhắc lại xa ${yes(ctx.refSource)}` +
        `, thuật ngữ ${(ctx.terms || []).length}, gợi ý ${(ctx.senseHints || []).length + (ctx.phraseHints || []).length}`;
}

function logEngine(response, n, ctx) {
    window.CST_LAST_AI_INFO = response;
    state.lastTranslationInfo = response;
    if (response.engine === "gemini") {
        const fb = response.fallbackFrom ? `, ${response.fallbackFrom} không dùng được nên lùi sang model này` : "";
        console.log(`%c[AI Subtitle]%c 🤖 GEMINI (${response.model}) ${n} đoạn, ${response.latency}ms${response.fromCache ? " (bộ nhớ đệm)" : ""}${fb}${contextSummary(ctx)}`,
            "background:#D97757;color:#fff;padding:2px 6px;border-radius:4px;font-weight:bold;", "color:#D97757;font-weight:bold;");
    } else if (response.engine === "google_fallback") {
        console.warn(`[AI Subtitle] ⚠️ Gemini lỗi ("${response.fallbackReason || "Không xác định"}"), dùng Google Translate (không có ngữ cảnh)`);
    }
}

// Gui mot cua so gom cac doan phu de lien tiep + goi ngu canh.
// opts: { hints, refine: { draft:[], issues:[] } }
// opts: { tier: "cheap" | "strong", wantTerms, refine: { draft:[], issues:[] } }
// Video đang xem (để tính chi phí ước tính theo từng video, chỉ lưu trên máy)
function currentVideoMeta() {
    // generic pages: host + path, so "/watch" on two different sites is not one video
    let key = getCurrentSite() === "generic" ? location.hostname + location.pathname : location.pathname;
    try { const v = new URL(location.href).searchParams.get("v"); if (v) key = "yt:" + v; } catch (e) { /* bỏ qua */ }
    const video = document.querySelector("video");
    return { videoKey: key, videoSec: video && isFinite(video.duration) ? Math.round(video.duration) : 0, videoTitle: pageVideoTitle().slice(0, 80) };
}

// The video's title as the viewer knows it, for the cost card, the popup, the transcript panel and
// the edits list (dubbing.js and youtube.js use it too). YouTube's tab title carries the unread
// notification count in front ("(3) ") and " - YouTube" behind; the raw title used to reach the
// cost card with both.
function pageVideoTitle() {
    const site = getCurrentSite();
    if (site !== "youtube") return (site === "generic" ? genericMeta() : courseraMeta()).title;
    // The player's title once youtube.js has it for the video in the address bar: the tab title
    // cannot tell a count "(3) " from a title that itself starts with "(2024) "
    let v = "";
    try { v = new URL(location.href).searchParams.get("v") || ""; } catch (e) { v = ""; }
    if (typeof yt !== "undefined" && yt.videoTitle && v && yt.currentVideoId === v) return yt.videoTitle.trim();
    return String(document.title || "").replace(/^\(\d+\+?\)\s*/, "").replace(/\s*-\s*YouTube\s*$/i, "").trim();
}

async function requestUnit(req, opts = {}) {
    // Nội dung đã là tiếng Việt (track gắn nhãn sai, phụ đề trộn): giữ nguyên, không gọi Gemini
    const LANG = window.CST_LANG;
    if (LANG && !opts.refine) {
        const d = LANG.detectText(req.sentences.join(" "));
        if (d.lang === "vi" && d.confidence >= 0.9) return { ok: true, engine: "same-language", translations: req.sentences.slice(), terms: [] };
    }
    // A window of sound captions only ("[Music]" between songs): translated from a fixed list
    const Q = window.CST_QUALITY;
    if (Q && Q.soundNoteLine && !opts.refine) {
        const notes = req.sentences.map(Q.soundNoteLine);
        if (notes.every(n => n && n.vi)) return { ok: true, engine: "sound-notes", translations: notes.map(n => n.vi), terms: [] };
    }
    const prot = protectMany(req.sentences);
    const placeholders = prot.terms.map((term, id) => ({ id, term }));
    const msg = {
        action: "translateUnit",
        sentences: prot.texts,
        context: req.context,
        placeholders,
        tier: opts.tier || "cheap",
        wantTerms: !!opts.wantTerms,
        refine: opts.refine || null,
        ...currentVideoMeta()
    };
    let res = await sendMessageAsync(msg);
    let translations = res.translations || [];

    if (res.restored) {
        // Bản cuối từ cache (đã khôi phục thuật ngữ từ trước)
        translations = translations.map(finalizeTranslation);
    } else if (prot.terms.length) {
        const joined = translations.join(" ");
        if (!glossaryIntact(joined, prot.terms)) {
            // Ma bi hong: gui lai ban goc khong bao ve (van giu ngu canh)
            console.warn("Ma danh dau bi hong, dich lai khong bao ve thuat ngu");
            res = await sendMessageAsync({ ...msg, sentences: req.sentences, placeholders: [] });
            translations = (res.translations || []).map(finalizeTranslation);
        } else {
            translations = translations.map(t => restoreGlossary(t, prot.terms));
        }
    } else {
        translations = translations.map(finalizeTranslation);
    }
    logEngine(res, req.sentences.length, req.context);
    return { ...res, translations };
}

function qualityKeepSet() {
    if (!state._qualityKeep || state._qualityKeepSrc !== state.glossaryKeep) {
        state._qualityKeep = new Set(state.glossaryKeep.flatMap(t => String(t).toLowerCase().split(/\s+/)));
        state._qualityKeepSrc = state.glossaryKeep;
    }
    return state._qualityKeep;
}

function assessAll(req, translations) {
    const Q = window.CST_QUALITY;
    if (!Q) return translations.map(() => ({ score: 0, issues: [], needsRefine: false }));
    const out = translations.map((vi, k) => Q.assess(req.sentences[k], vi, {
        terms: req.context.terms,
        keep: qualityKeepSet()
    }));
    // Answers that slid by one item (CST_QUALITY.misalignedItems): told to the refine as such
    for (const k of Q.misalignedItems ? Q.misalignedItems(req.sentences, translations) : []) {
        out[k].issues.push({ type: "misaligned", severity: 3, detail: "bản dịch lệch dòng, khớp với câu gốc của mục liền trước hoặc liền sau", fix: "mỗi mục dịch đúng câu gốc của chính nó, không tách hay gộp sang mục khác" });
        out[k].score += 3;
        out[k].needsRefine = true;
    }
    return out;
}

function costMode() {
    const C = window.CST_COST;
    return C ? C.getMode(state.costMode) : { id: "balanced", escalate: false, refine: "cheap" };
}

// Có nên dịch lại không, và bằng model nào (tối đa MỘT lần cho mỗi cửa sổ):
//   Cao cấp  : có dấu hiệu dịch máy -> dịch lại bằng model mạnh
//   Cân bằng : chỉ khi lỗi NẶNG (mức 3) -> dịch lại bằng model rẻ
//   Tiết kiệm / Chỉ phụ đề: không dịch lại
function refinePlan(first, quality) {
    if (first.engine !== "gemini" || first.fromCache) return null;
    const mode = costMode();
    if (mode.refine === "strong" && quality.some(q => q.needsRefine)) return { tier: "strong" };
    if (mode.refine === "cheap" && quality.some(q => q.issues.some(i => i.severity >= 3))) return { tier: "cheap" };
    return null;
}

// Dich lai co huong dan khi phat hien dau hieu "dich may". Chi nhan ban
// dich lai neu diem chat luong tot hon (khong bao gio lam te di), va luu
// ban cuoi vao cache de lan sau khong phai dich lai.
async function refineUnit(req, first, quality, plan) {
    const issues = [];
    quality.forEach((q, k) => q.issues.forEach(i => issues.push(`mục ${k + 1}: ${i.detail}${i.fix ? ` (${i.fix})` : ""}`)));
    try {
        const again = await requestUnit(req, {
            tier: plan.tier,
            refine: { draft: first.translations.map(stripHints), issues: issues.slice(0, 10) }
        });
        const q2 = assessAll(req, again.translations);
        const pick = window.CST_QUALITY && window.CST_QUALITY.pickRefined
            ? window.CST_QUALITY.pickRefined(first.translations, again.translations, quality, q2)
            : first.translations.map((t, k) => (q2[k].score < quality[k].score ? again.translations[k] : t));
        const improved = pick.some((t, k) => t !== first.translations[k]);
        if (!improved) return null;
        if (first.cacheKey) {
            sendMessageAsync({ action: "translateUnitStore", cacheKey: first.cacheKey, translations: pick, terms: first.terms || [], model: again.model, tier: plan.tier }).catch(() => {});
        }
        return { ...first, translations: pick, refined: true, tier: plan.tier };
    } catch (e) {
        console.warn("Dich lai that bai, giu ban dau:", e.message);
        return null;
    }
}

// Dich cac nhom idxs (lien tiep) cua mot phien ngu canh.
// LOCAL (ngữ cảnh, định tuyến) -> CACHE -> MODEL RẺ -> MODEL MẠNH khi câu khó / lỗi.
// realtime = true: tra ban dau ngay (khong de nguoi xem cho), viec dich lai
// chay nen va goi onRefined khi co ban tot hon.
async function translateWindow(session, idxs, opts = {}) {
    const req = session.buildRequest(idxs);
    const mode = costMode();
    // Định tuyến tất định: chỉ câu khó mới lên model mạnh (và chỉ ở chế độ Cao cấp)
    const route = window.CST_COST ? window.CST_COST.routeDifficulty(req) : { tier: "cheap" };
    const tier = mode.escalate && route.tier === "strong" ? "strong" : "cheap";
    // Thuật ngữ chỉ xin khi đoạn có thuật ngữ mới (không phải mọi cửa sổ)
    const wantTerms = typeof session.wantsTerms === "function" ? session.wantsTerms(req) : false;
    const first = await requestUnit(req, { tier, wantTerms });
    // The free fixes first (sound notes, a unit that opens with the one before it again), so the
    // quality check judges the mended text: a head repeat always left its first unit "abnormally
    // short", a severity-3 issue, and Balanced mode paid a refine for what is fixed for nothing (2.3.2)
    first.translations = localFixes(first.translations, req.sentences);
    if (first.fromCache) {
        session.record(idxs, first);
        return first;
    }
    const quality = assessAll(req, first.translations);
    const plan = refinePlan(first, quality);

    if (plan && !opts.realtime) {
        const better = await refineUnit(req, first, quality, plan);
        const result = better || first;
        session.record(idxs, result);
        saveSessionTermsSoon(session);
        return result;
    }

    session.record(idxs, first);
    saveSessionTermsSoon(session);
    if (plan && opts.realtime && typeof opts.onRefined === "function") {
        refineUnit(req, first, quality, plan).then(better => {
            if (!better) return;
            session.record(idxs, better);
            opts.onRefined(better);
        });
    }
    return first;
}

function localFixes(translations, sources) {
    const Q = window.CST_QUALITY;
    if (!Q || !Q.fixSoundNotes || !Q.fixRepeatedHeads || !Array.isArray(translations)) return translations;
    const mended = Q.fixRepeatedHeads(Q.fixSoundNotes(translations, sources), sources);
    // A slid run is mended for free here, so it no longer pays for a refine (2.4.7)
    return Q.realignSentences ? Q.realignSentences(sources, mended) : mended;
}

// Luu thuat ngu da thong nhat theo khoa hoc / kenh de nhat quan giua cac bai
// A YouTube channel's list carries this stamp; one without it is not read and the daily sweep drops
// it (youtube.js ytDonCache). Every channel list in the user's storage was learned before 2.3.0,
// while everyday videos were taken for technical ones, and held everyday words and a brand as
// agreed terms ("Whole Foods = thực phẩm hữu cơ", "pricey = giá thành cao", "declutter = dọn dẹp").
// Each later video of the channel sent them as [THUẬT NGỮ ĐÃ THỐNG NHẤT] and saved the list again,
// so it never aged out. An everyday video learns no terms now (ContextSession.wantsTerms).
const YT_TERMS_STAMP = 2;
const termsListUsable = (key, list) => !!list && (!/^ctxterms_yt_/.test(key) || list.v === YT_TERMS_STAMP);
let termSaveTimer = null;
function saveSessionTermsSoon(session) {
    if (!session || !session.storageKey) return;
    clearTimeout(termSaveTimer);
    termSaveTimer = setTimeout(() => {
        // An everyday video learns no terms; 43 of 51 real keys were an empty list, one per channel
        try { const terms = session.exportTerms(); if (terms.length) chrome.storage.local.set({ [session.storageKey]: { luc: Date.now(), v: YT_TERMS_STAMP, terms } }); } catch (e) { /* bo qua */ }
    }, 1500);
}

async function createContextSession(meta, storageKey) {
    const C = window.CST_CONTEXT;
    if (!C) return null;
    const session = new C.ContextSession(meta);
    session.storageKey = storageKey ? `ctxterms_${storageKey}`.slice(0, 120) : "";
    if (session.storageKey) {
        try {
            const kq = await chrome.storage.local.get(session.storageKey);
            if (kq && termsListUsable(session.storageKey, kq[session.storageKey])) session.importTerms(kq[session.storageKey].terms);
        } catch (e) { /* bo qua */ }
    }
    return session;
}

function groupEndsSentence(g) {
    return /[.!?…]["')\]]?$/.test(String(g && g.text || "").trim());
}

// Dich toan bo nhom (Coursera): chia thanh cac cua so lien tiep 600-1200 ky tu,
// uu tien ket thuc cua so o cuoi cau de moi lan goi la mot doan tron y.
// alive(): false once the viewer has left the page; no further window is sent (the one in flight
// finishes and is cached by the service worker, so coming back costs nothing).
// opts.startAt: the playhead; its window goes first. opts.onWindow(results): after every window.
async function translateAllGroups(session, groups, onProgress, alive = () => true, opts = {}) {
    const results = new Array(groups.length).fill("");
    const windows = [];
    let cur = [];
    let chars = 0;
    for (let i = 0; i < groups.length; i++) {
        cur.push(i);
        chars += groups[i].text.length + 1;
        // Chi cat cung khi qua dai; binh thuong luon dung o cuoi cau
        const full = chars >= 1200 || cur.length >= 16;
        const soft = groupEndsSentence(groups[i]) && (chars >= 600 || cur.length >= 8);
        if (full || soft) { windows.push(cur); cur = []; chars = 0; }
    }
    if (cur.length) windows.push(cur);
    // A short tail (e.g. a closing "Thanks for watching.") rides with the window before it when that
    // stays under the hard limits: a request of its own paid the whole system prompt for one line.
    const winChars = w => w.reduce((n, i) => n + groups[i].text.length + 1, 0);
    if (windows.length > 1) {
        const tail = windows[windows.length - 1], prev = windows[windows.length - 2];
        if (winChars(tail) < 240 && winChars(prev) + winChars(tail) < 1200 && prev.length + tail.length <= 16) {
            prev.push(...windows.pop());
        }
    }
    // The window under the playhead first, then on from there, the ones before it last: Coursera
    // resumes a lecture where the viewer left off, and in text order that line came last
    if (opts.startAt > 0) {
        const k = windows.findIndex(w => groups[w[w.length - 1]].end >= opts.startAt);
        if (k > 0) windows.push(...windows.splice(0, k));
    }

    // Two workers, each walking its own contiguous half in order. They used to take windows turn
    // about, so window k+1 was always sent while window k was still in flight and no request ever
    // carried the previous window's translation (measured: 6 of 6 on a 49-group lecture). Now only
    // the first window of each half goes without it, and the total time stays about the same.
    let done = 0;
    const half = Math.ceil(windows.length / 2);
    const chains = [windows.slice(0, half), windows.slice(half)];
    const worker = async chain => {
        for (const idxs of chain) {
            if (!alive()) break;
            try {
                const r = await translateWindow(session, idxs, { realtime: false });
                idxs.forEach((gi, k) => { results[gi] = r.translations[k] || ""; });
            } catch (err) {
                console.warn("Loi dich cua so, dich tung nhom:", err.message);
                for (const gi of idxs) {
                    if (!alive()) break;
                    try {
                        const r = await translateWindow(session, [gi], { realtime: false });
                        results[gi] = r.translations[0] || "";
                    } catch (e2) {
                        results[gi] = "";
                    }
                }
            }
            done += idxs.length;
            if (onProgress && alive()) onProgress(done, groups.length);
            if (opts.onWindow && alive()) opts.onWindow(results);
        }
    };
    await Promise.all(chains.map(worker));
    return results;
}

// ---------- Chon track phu de ----------
// A caption track as the rest of this file reads it: { track: TextTrack, srclang, kind, label }.
// <track> elements already have that shape. Players such as video.js, Plyr or hls.js often add
// tracks with addTextTrack() and no element, so on generic pages those are wrapped the same way.
function trackWrap(tt) {
    return { track: tt, srclang: tt.language || "", kind: tt.kind || "", label: tt.label || "" };
}

function pageTracks() {
    const els = Array.from(document.getElementsByTagName("track"));
    if (getCurrentSite() !== "generic") return els;          // Coursera: exactly as before
    const v = csVideo();
    if (!v) return [];
    const own = els.filter(t => v.contains(t));
    const seen = new Set(own.map(t => t.track));
    const extra = Array.from(v.textTracks || []).filter(tt => !seen.has(tt) && !/^cst/i.test(tt.label || "")
        && tt.kind !== "metadata" && tt.kind !== "chapters" && tt.kind !== "descriptions");
    return own.concat(extra.map(trackWrap));
}

function pickBestTrack() {
    const tracks = pageTracks();
    if (tracks.length === 0) return null;

    const usable = tracks.filter(t => {
        const kind = (t.kind || "").toLowerCase();
        return kind === "" || kind === "subtitles" || kind === "captions";
    });
    let pool = usable.length > 0 ? usable : tracks;

    const isVi = t => (t.srclang || "").toLowerCase().startsWith("vi");
    const viTrack = pool.find(isVi);
    // Settings "Dùng phụ đề tiếng Việt có sẵn" (skipSameLang, on by default). Off: translate from
    // the source track anyway, e.g. when the site's Vietnamese is a poor machine translation.
    if (viTrack && state.skipSameLang !== false) return { track: viTrack, alreadyVietnamese: true };
    const others = pool.filter(t => !isVi(t));
    if (viTrack && others.length) pool = others;

    const enTrack = pool.find(t => (t.srclang || "").toLowerCase().startsWith("en"));
    const chosen = enTrack || pool[0];
    console.log("Dung track phu de ngon ngu:", chosen.srclang || "(khong ro)");
    return { track: chosen, alreadyVietnamese: false };
}

async function waitForCues(track, maxWaitMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        if (track.cues && track.cues.length > 0) return track.cues;
        await sleep(250);
    }
    return null;
}

// ---------- Gom dong phu de thanh cau ----------
// Nhom = don vi DICH. Uu tien cau tron ven (dau ket cau). Voi phu de tu dong
// khong co dau cau: dong nhom o khoang lang dai, hoac khi da du dai va gap
// cho ngat nghi (dau phay, khoang lang ngan truoc cue ke tiep).
function cueStart(c) { return c.startTime !== undefined ? c.startTime : c.start; }
function cueEnd(c) { return c.endTime !== undefined ? c.endTime : c.end; }
function plainCueText(c) {
    return String((c && c.text) || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function makeGroup(cues, idxs) {
    const srcCues = idxs.map(i => ({
        start: cueStart(cues[i]),
        end: cueEnd(cues[i]),
        text: plainCueText(cues[i]),
        words: cues[i].words
    }));
    const g = {
        text: srcCues.map(c => c.text).join(" "),
        cueIndexes: [...idxs],
        cueTexts: srcCues.map(c => c.text),
        srcCues,
        start: srcCues[0].start,
        end: Math.max(...srcCues.map(c => c.end))
    };
    if (cues[idxs[0]] && cues[idxs[0]].midLine) g.midLine = true;   // the voice reads on into it (dub-planner.js)
    return g;
}

// A caption line that ends one sentence and starts the next ("cook more at home. I feel like I am")
// is cut in two there, so a group can close where its sentence does. Grouping only looks at the end
// of a line: measured on the user's 6 punctuated YouTube videos (2.3.2), 112 of 316 groups ended
// mid-sentence, cut by the 24 s / 520 character limits, and 64 translation windows ended on a
// fragment, which is where the model finished the sentence from the next window's context (a leak)
// or split one sentence over two items (a head repeat). With the cut: 11 groups, 1 window.
// Plain cues only ({ start, end, text, words }); word times, when the automatic captions have them,
// place the cut, else the characters do. A piece under 0.3 s or without two letters keeps the line
// whole, with one exception: a sentence that starts in the last word or two of a line ("5 years now.
// There's") gets barely one word's time there, so on the user's first video with the cut (2.3.6)
// all 8 one-word and 4 of 10 two-word starts kept their lines whole (13 of 56), and one group ran
// 20 s over four sentences to end on a comma. That start moves to the front of the next line, when
// the next line follows within a second and is speech from the same speaker (no ">>").
// Every piece after the first is marked `midLine`, and so is a line that took a sentence start: the
// voice still reads across the cut, as it did when the line was one group, and a translation window
// does not close there at its soft limit (youtube.js).
const SENTENCE_CUT_RE = /[.!?…]+["'”’)\]]?\s+(?=["'“‘(\[]?[\p{Lu}\p{N}¿¡])/gu;
const SENTENCE_ABBR_RE = /(?:^|[\s(])(?:e\.g|i\.e|vs|fig|dr|prof|mr|mrs|ms|st|jr|sr|approx|dept|vol|no|etc|al|eq|sec|pp?)\.$/i;
function splitCuesAtSentenceEnds(cues) {
    const out = [];
    const list = cues || [];
    const tooShort = p => p.end - p.start < 0.3 || !/\p{L}.*\p{L}/su.test(p.text);
    // letters outside a "[music]" note, and no ">>" (a new speaker)
    const takesStart = (next, c) => !!next && next.start - c.end <= 1 && !/^\s*>>/.test(next.text || "") &&
        /\p{L}.*\p{L}/su.test(String(next.text || "").replace(/\[[^\]]*\]/g, ""));
    let carry = null;
    for (let n = 0; n < list.length; n++) {
        let c = list[n];
        if (carry) {
            const own = String((c && c.text) || "").trim();
            c = { ...c, start: carry.start, text: carry.text + " " + own, midLine: true,
                words: carry.words ? [...carry.words, ...(Array.isArray(c.words) ? c.words : [{ text: own, t: c.start }])] : undefined };
            carry = null;
        }
        const text = String((c && c.text) || "");
        const cuts = [];
        SENTENCE_CUT_RE.lastIndex = 0;
        let m;
        while ((m = SENTENCE_CUT_RE.exec(text))) {
            if (!SENTENCE_ABBR_RE.test(text.slice(0, m.index + m[0].length).trim())) cuts.push(m.index + m[0].length);
        }
        if (!cuts.length || !(c.end > c.start)) { out.push(c); continue; }
        // where each word sits in the text, for its time
        const words = Array.isArray(c.words) ? c.words : null;
        const at = [];
        if (words) {
            let pos = 0;
            for (const w of words) { const i = text.indexOf(w.text, pos); at.push(i < 0 ? pos : i); pos = i < 0 ? pos : i + w.text.length; }
        }
        const timeAt = p => {
            if (words) {
                const k = at.findIndex(i => i >= p);
                if (k > 0 && words[k].t > c.start && words[k].t < c.end) return words[k].t;
            }
            return c.start + (c.end - c.start) * p / text.length;
        };
        const bounds = [0, ...cuts, text.length];
        const pieces = [];
        for (let i = 0; i + 1 < bounds.length; i++) {
            const a = bounds[i], b = bounds[i + 1];
            const piece = { start: i ? timeAt(a) : c.start, end: i + 2 < bounds.length ? timeAt(b) : c.end, text: text.slice(a, b).trim() };
            if (i || c.midLine) piece.midLine = true;
            if (words) {
                const ws = words.filter((w, k) => at[k] >= a && at[k] < b);
                if (ws.length > 1) piece.words = ws;
            }
            pieces.push(piece);
        }
        const last = pieces[pieces.length - 1];
        if (tooShort(last) && !pieces.slice(0, -1).some(tooShort) && takesStart(list[n + 1], c)) {
            const from = bounds[bounds.length - 2];
            carry = { start: last.start, text: last.text, words: words ? words.filter((w, k) => at[k] >= from) : null };
            pieces.pop();
        }
        if (pieces.some(tooShort)) out.push(c);
        else out.push(...pieces);
    }
    return out;
}

function groupCuesIntoSentences(cues, perCueMode) {
    const groups = [];

    // Che do dich tung dong rieng: moi dong la mot nhom
    if (perCueMode) {
        for (let i = 0; i < cues.length; i++) {
            if (plainCueText(cues[i])) groups.push(makeGroup(cues, [i]));
        }
        return groups;
    }

    let cur = [];
    let chars = 0;
    const closeGroup = () => {
        if (cur.length) groups.push(makeGroup(cues, cur));
        cur = [];
        chars = 0;
    };

    for (let i = 0; i < cues.length; i++) {
        const text = plainCueText(cues[i]);
        if (!text) continue;

        const isAbbr = /\b(?:e\.g|i\.e|vs|fig|dr|prof|mr|ms|approx|dept|vol|no|etc|al|eq|sec|pp?)\.$/i.test(text);
        const isEllipsis = /(?:\.{3,}|…)$/.test(text);
        const endsSentence = /[.!?]["')\]]?$/.test(text) && !isAbbr && !isEllipsis;

        if (cur.length > 0) {
            const prev = cues[cur[cur.length - 1]];
            const gap = cueStart(cues[i]) - cueEnd(prev);
            const span = cueEnd(cues[i]) - cueStart(cues[cur[0]]);
            // A sentence's short last piece ("mind.", 0.72 s) joins the group a limit would close
            // before it, by a little: alone it made a group of its own, and the model put half the
            // sentence's Vietnamese there (2.3.7: krPKW8J6JSM 29 syllables on 0.72 s, the voice fell
            // 6 s behind and dropped the next line; zPSs9a0MYGw 15 on 1.72 s). Those are the only 2
            // groups this changes on the user's 16 videos. Only a pause still closes before it.
            const lastPiece = endsSentence && text.length <= 40 && cueEnd(cues[i]) - cueStart(cues[i]) <= 2 &&
                span <= GROUP_MAX_SECONDS + 3 && chars + text.length + 1 <= GROUP_HARD_CHARS + 40 && cur.length <= GROUP_HARD_CUES;
            // Khoang lang dai (chuyen slide, doi y) hoac nhom da cham gioi han cung
            if ((typeof gap === "number" && gap > GROUP_PAUSE_SECONDS) || (!lastPiece && (
                chars + text.length + 1 > GROUP_HARD_CHARS ||
                cur.length >= GROUP_HARD_CUES ||
                span > GROUP_MAX_SECONDS))) {
                closeGroup();
            }
        }

        cur.push(i);
        chars += text.length + 1;

        if (endsSentence) {
            closeGroup();
            continue;
        }

        if (chars >= GROUP_SOFT_CHARS) {
            const next = cues[i + 1];
            const gapNext = next ? cueStart(next) - cueEnd(cues[i]) : Infinity;
            if (/[,;:–—-]["')\]]?$/.test(text) || gapNext >= 0.35) closeGroup();
        }
    }
    closeGroup();

    return groups;
}

// ============================================================
// PHAN DOAN & NGAT DONG TIENG VIET
// Toan bo thuat toan nam trong vi-segmenter.js (CST_VI_SEG):
//   - quyet dinh so cue tieng Viet va diem cat (khong ep theo so cue tieng Anh)
//   - ngat moi cue thanh 1-2 dong theo cu phap tieng Viet
//   - gan thoi gian bam theo nhip noi cua cue nguon
// ============================================================
// A translation that carries the next units' content too (see CST_QUALITY.trimContextLeak) shows
// that content twice and makes the voice read it twice. Compare each unit with the next two.
// sources: the groups' source lines; with them a unit that opens with the unit before it again is
// fixed too (CST_QUALITY.fixRepeatedHeads, 2.3.0), and a sound caption gets its square brackets so
// the voice leaves it silent (CST_QUALITY.fixSoundNotes, 2.3.1; not counted as a leak)
function trimTranslationLeaks(translations, quiet, sources) {
    const Q = window.CST_QUALITY;
    if (!Q || !Q.trimContextLeak) return { list: translations, trimmed: 0 };
    let trimmed = 0;
    if (sources && Q.fixSoundNotes) translations = Q.fixSoundNotes(translations, sources);
    if (sources && Q.fixRepeatedHeads) {
        const fixed = Q.fixRepeatedHeads(translations, sources);
        trimmed += fixed.filter((t, i) => t !== translations[i]).length;
        translations = fixed;
    }
    // A run of answers that slid by an item gets its sentences dealt back (CST_QUALITY.realignSentences)
    if (sources && Q.realignSentences) {
        const fixed = Q.realignSentences(sources, translations);
        trimmed += fixed.filter((t, i) => t !== translations[i]).length;
        translations = fixed;
    }
    const list = translations.map((t, i) => {
        if (!t) return t;
        const next = [translations[i + 1], translations[i + 2]].filter(Boolean).join(" ");
        if (!next) return t;
        const out = Q.trimContextLeak(t, next, sources ? { src: sources[i] } : undefined);
        if (out !== t) trimmed++;
        return out;
    });
    if (trimmed && !quiet) console.warn(`[AI Subtitle] Bỏ phần dịch lấn sang câu sau ở ${trimmed} nhóm`);
    return { list, trimmed };
}

function segmentGroupVi(group, viText, nextStart) {
    // Cho phep cue cuoi keo dai vao khoang lang phia sau neu qua day chu,
    // nhung khong de len nhom ke tiep.
    const limit = group.end + 1.5;
    const maxEnd = typeof nextStart === "number" ? Math.min(limit, Math.max(group.end, nextStart - 0.04)) : limit;
    const seg = window.CST_VI_SEG;
    if (!seg) {
        const t = stripHints(viText);
        return [{ start: group.start, end: group.end, text: t, lines: [t] }];
    }
    return seg.segmentGroupSafe(viText, group.srcCues, {
        maxEnd,
        keepTerms: state.glossaryMultiTerms || []
    });
}

// ---------- Ap ban dich len phu de (Coursera) ----------
// Thay toan bo cue tieng Anh bang cue tieng Viet moi (so luong va thoi gian
// do bo phan doan quyet dinh). Cue goc duoc giu lai de khoi phuc khi tat dich.
function removeAllCues(track) {
    if (!track || !track.cues) return;
    const list = Array.from(track.cues);
    for (const c of list) {
        try { track.removeCue(c); } catch (e) { /* bo qua */ }
    }
}

// Vị trí + lề (Cài đặt) cho phụ đề Coursera. Trình phát Coursera dùng track phụ đề của
// trình duyệt, nên đặt qua thuộc tính của từng cue:
//   - một dòng: line theo % khung video (snapToLines = false), căn theo mép dưới/trên
//   - song ngữ: giữ xếp theo hàng (-1/-3 từ dưới, 0/2 từ trên) để hai cue không chồng nhau
// role: "vi" | "orig"
function placeCue(cue, role) {
    const S = window.CST_STYLE;
    const s = S ? S.normalizeStyle(state.subStyle) : { position: "bottom", offset: 1 };
    const top = s.position === "top";
    try {
        if (state.dualMode) {
            // Dòng đọc trước (nằm trên): bản gốc nếu bật "gốc trước", ngược lại là bản dịch
            const readFirst = (role === "orig") === !!state.originalFirst;
            cue.snapToLines = true;
            cue.line = top ? (readFirst ? 0 : 2) : (readFirst ? -3 : -1);
        } else {
            cue.snapToLines = false;
            cue.line = top ? s.offset : 100 - s.offset;
            cue.lineAlign = top ? "start" : "end";
        }
    } catch (e) { /* trình duyệt không cho đặt: giữ vị trí mặc định */ }
}

// Đổi vị trí / lề trong Cài đặt khi đang xem: đặt lại các cue đã hiển thị
function repositionCues() {
    const track = state.activeTrack && state.activeTrack.track;
    if (!track || !track.cues) return;
    for (const cue of Array.from(track.cues)) placeCue(cue, /^cst-vi-/.test(cue.id) ? "vi" : "orig");
}

// The Vietnamese cues of one group, cut once per translation (the progressive display and the final
// pass ask for the same group again). Copies: the viewer's edits are laid over the cues in place.
function csGroupCues(groups, gi, vi) {
    const group = groups[gi];
    if (!group.cstSeg || group.cstSeg.vi !== vi) {
        const nextStart = groups[gi + 1] ? groups[gi + 1].start : undefined;
        group.cstSeg = { vi, segs: segmentGroupVi(group, vi, nextStart) };
    }
    return group.cstSeg.segs.map(s => ({ ...s, lines: (s.lines || [s.text]).slice() }));
}

// While the rest of the lecture is still being translated: what is done goes on screen and to the
// voice now (the overlay shows the English line where there is no Vietnamese yet). The track's own
// cues are rewritten once, by applyTranslation, at the end.
function csShowTranslated(track, groups, translations) {
    const list = trimTranslationLeaks(translations, true, groups.map(g => g.text)).list;
    const dub = [];
    groups.forEach((group, gi) => {
        if (list[gi]) dub.push({ start: group.start, end: group.end, srcCues: group.srcCues, viText: list[gi], viCues: csGroupCues(groups, gi, list[gi]) });
    });
    state.dubGroups = dub;
    csShowGroups(track);
    csApplyEdits();
}

// Our overlay paints from here on (cs.viCues from state.dubGroups, cs.origCues from the source).
// The track keeps its cues (the "restore original" path reads them) but goes to "hidden", so the
// browser draws nothing: its cue boxes and Coursera's own caption box used to land on top of each other.
function csShowGroups(track) {
    const originals = state.originalCues || [];
    cs.viCues = [];
    cs.origCues = [];
    for (const g of state.dubGroups) for (const c of (g.viCues || [])) {
        cs.viCues.push({ start: c.start, end: c.end, lines: c.lines || [c.text], text: c.text || (c.lines || []).join(" ") });
    }
    cs.viCues.sort((a, b) => a.start - b.start);
    for (let i = 1; i < cs.viCues.length; i++) {
        if (cs.viCues[i].start < cs.viCues[i - 1].end) cs.viCues[i - 1].end = Math.max(cs.viCues[i - 1].start + 0.05, cs.viCues[i].start);
    }
    if (window.CST_STYLE && window.CST_STYLE.lingerCues) window.CST_STYLE.lingerCues(cs.viCues);   // reading time
    originals.forEach((cue, i) => {
        const text = plainCueText({ text: state.originalCueTexts.get(i) });
        if (text) cs.origCues.push({ start: cue.startTime, end: cue.endTime, text });
    });
    cs.origCues.sort((a, b) => a.start - b.start);
    try { track.mode = "hidden"; } catch (e) { /* bỏ qua */ }
    cs.renderKey = "";
    csStartRender();
}

function applyTranslation(track, groups, translations) {
    translations = trimTranslationLeaks(translations, false, groups.map(g => g.text)).list;
    const originals = state.originalCues || [];
    removeAllCues(track);
    state.dubGroups = [];

    let longestLine = 0;
    let viCount = 0;
    const CueCtor = window.VTTCue || window.TextTrackCue;

    groups.forEach((group, gi) => {
        const vi = translations[gi];
        if (!vi) {
            // Nhom dich loi: giu cue goc de nguoi xem khong mat phu de
            group.cueIndexes.forEach(ci => { if (originals[ci]) track.addCue(originals[ci]); });
            return;
        }
        const segs = csGroupCues(groups, gi, vi);
        // Nguồn cho lồng tiếng: nhóm câu + bản dịch có ngữ cảnh + mốc thời gian
        state.dubGroups.push({ start: group.start, end: group.end, srcCues: group.srcCues, viText: vi, viCues: segs });
        segs.forEach((s, k) => {
            const cue = new CueCtor(s.start, s.end, s.lines.join("\n"));
            cue.id = `cst-vi-${gi}-${k}`;
            placeCue(cue, "vi");
            track.addCue(cue);
            viCount++;
            for (const l of s.lines) longestLine = Math.max(longestLine, l.length);
        });
    });

    if (state.dualMode) {
        // Song ngu: dua cue goc tro lai, boc lop cst-orig de dinh dang rieng
        originals.forEach((cue, i) => {
            const original = plainCueText({ text: state.originalCueTexts.get(i) });
            if (!original) return;
            cue.text = `<c.cst-orig>${original}</c>`;
            placeCue(cue, "orig");
            track.addCue(cue);
        });
    }

    csShowGroups(track);
    csLoadEdits();

    console.log(`Da ap ban dich: ${originals.length} cue goc -> ${viCount} cue tieng Viet, dong dai nhat ${longestLine} ky tu`);
    if (state.glossaryMisses > 0) {
        console.warn(`Co ${state.glossaryMisses} thuat ngu khong khoi phuc duoc dung cach`);
    }
}

function restoreOriginalCues() {
    if (!state.activeTrack || !state.originalCues) return;
    const track = state.activeTrack.track;
    if (!track) return;
    removeAllCues(track);
    state.originalCues.forEach((cue, idx) => {
        if (state.originalCueTexts.has(idx)) cue.text = state.originalCueTexts.get(idx);
        if (state.originalCueLines && state.originalCueLines.has(idx)) {
            try { cue.line = state.originalCueLines.get(idx); } catch (e) { /* bo qua */ }
        }
        track.addCue(cue);
    });
    console.log("Da khoi phuc phu de goc");
}

// ---------- Luong chinh ----------
function courseraMeta() {
    const m = location.pathname.match(/\/learn\/([^/]+)/) || location.pathname.match(/\/courses?\/([^/]+)/);
    const slug = m ? m[1] : location.hostname;
    const h1 = document.querySelector("h1");
    const title = (h1 && h1.textContent.trim()) || String(document.title || "").replace(/\s*[|\-]\s*Coursera.*$/i, "").trim();
    return {
        title,
        course: slug.replace(/[-_]+/g, " "),
        channel: "Coursera",
        courseKey: `${getCurrentSite()}_${slug}`
    };
}

// Title and context for a page that is neither Coursera nor YouTube
function genericMeta() {
    const og = document.querySelector('meta[property="og:title"]');
    const h1 = document.querySelector("h1");
    const title = ((og && og.content) || (h1 && h1.textContent) || document.title || "").trim().slice(0, 160);
    const host = location.hostname.replace(/^www\./, "");
    const first = (location.pathname.split("/").filter(Boolean)[0] || "").slice(0, 60);
    return { title, course: "", channel: host, courseKey: `generic_${host}_${first}` };
}

// Coursera and generic pages: translate the video's own text track.
// opts.onShown(): once, when the first translated lines are on screen (the voice can start then)
async function translateTrackSite(opts = {}) {
    const generic = getCurrentSite() === "generic";
    if (generic && !csVideo()) {
        cstToast("Trang này không có video nào để dịch phụ đề.", { warn: true });
        return false;
    }
    const picked = pickBestTrack();
    if (!picked) {
        cstToast(generic
            ? "Video trên trang này không có phụ đề chuẩn mà tiện ích đọc được. Hãy bật phụ đề (CC) trên trình phát rồi thử lại; nếu trang tự vẽ phụ đề riêng hoặc đặt video trong khung nhúng thì tiện ích chưa hỗ trợ."
            : "Không tìm thấy phụ đề cho video này. Hãy bật phụ đề (CC) trên trình phát rồi bấm dịch lại.", { warn: true });
        return false;
    }
    if (picked.alreadyVietnamese) {
        cstToast(generic
            ? "Video này đã có phụ đề tiếng Việt. Hãy chọn tiếng Việt trong menu phụ đề của trình phát."
            : "Khóa học này đã có phụ đề tiếng Việt chính thức, chất lượng tốt hơn dịch máy. Hãy chọn Vietnamese trong menu phụ đề của trình phát.");
        return false;
    }

    const trackEl = picked.track;
    trackEl.track.mode = "showing";
    // Coursera is a single-page app: the viewer can move to the next lecture while this one is still
    // being translated (a whole lecture takes ~20 s). Before, the old run went on paying Gemini for
    // every remaining window, then drew the old lecture's Vietnamese over the new video, and its
    // `busy` flag made the new lecture's auto-translate give up.
    const gen = state.navGen;
    const alive = () => !state.dead && state.navGen === gen;

    const cues = await waitForCues(trackEl.track);
    if (!alive()) return false;
    if (!cues) {
        cstToast("Phụ đề chưa nạp xong. Hãy phát video vài giây rồi bấm dịch lại.", { warn: true });
        return false;
    }

    state.originalCues = Array.from(cues);
    state.originalCueTexts = new Map();
    state.originalCueLines = new Map();
    state.originalCues.forEach((cue, i) => {
        state.originalCueTexts.set(i, cue.text);
        state.originalCueLines.set(i, cue.line);
    });
    state.activeTrack = trackEl;

    const groups = groupCuesIntoSentences(state.originalCues, state.perCueMode);
    console.log(`Da gom ${cues.length} dong phu de thanh ${groups.length} nhom dich`);

    // Ngu canh bai giang: tieu de, ten khoa hoc (tu duong dan), thuat ngu da dung o cac bai truoc
    const meta = generic ? genericMeta() : courseraMeta();
    const session = await createContextSession(meta, meta.courseKey);
    if (!alive()) return false;
    session.setUnits(groups.map(g => g.text));
    state.contextSession = session;
    state.groupTotal = groups.length;
    console.log(`Linh vuc nhan dien: ${session.domain.primary}${session.domain.secondary ? " + " + session.domain.secondary : ""}`);

    // Lines go on screen window by window (1.7.5). Before, nothing showed until the last window of the
    // whole lecture was back: one Gemini round trip per two windows, a dozen windows in a lecture.
    let shown = false;
    const showSoFar = results => {
        csShowTranslated(trackEl.track, groups, results);
        if (shown) return;
        shown = true;
        state.active = true;
        setIconState("on");
        cs.edits = null;                  // the last page's edits must not touch these lines meanwhile
        csLoadEdits();
        if (opts.onShown) { try { opts.onShown(); } catch (e) { /* bỏ qua */ } }
    };
    const v = csVideo();
    const translations = await translateAllGroups(
        session,
        groups,
        (done, total) => {
            const btn = document.querySelector(CS_BTN);
            if (btn) btn.setAttribute("title", `Đang dịch ${done}/${total} nhóm…`);
        },
        alive,
        { startAt: v ? v.currentTime : 0, onWindow: showSoFar }
    );
    if (!alive()) {
        console.log("[AI Subtitle] Đã chuyển trang trong lúc dịch: bỏ bản dịch của trang cũ");
        return false;
    }

    applyTranslation(trackEl.track, groups, translations);
    return true;
}

// opts.onShown: see translateTrackSite
async function enableTranslation(opts = {}) {
    // A run the viewer just turned off (or left) may still be finishing its window in flight. It will
    // not apply anything: wait for it rather than ignore this click
    for (let i = 0; i < 80 && state.busy && !csTranslating(); i++) await sleep(250);
    if (state.busy) return;
    state.busy = true;
    state.busyGen = state.navGen;
    state.glossaryMisses = 0;
    let failed = false;
    injectCueStyle();
    setIconState("loading");

    try {
        const site = getCurrentSite();
        let success = false;
        if (isTrackSite(site)) {
            success = await translateTrackSite(opts);
        } else if (site === "youtube") {
            if (typeof ytBatDauDich === "function") {
                success = await ytBatDauDich();
                if (success && typeof ytTuBatLongTieng === "function") ytTuBatLongTieng();
            } else {
                console.warn("ytBatDauDich chưa sẵn sàng trên trang YouTube");
            }
        } else {
            cstToast("Trang web này chưa được hỗ trợ.", { warn: true });
        }

        // a run turned off or left behind says nothing about what is on screen now
        if (state.busyGen === state.navGen) {
            state.active = success;
            setIconState(success ? "on" : "idle");
        }
    } catch (err) {
        failed = true;
        console.error("Dịch thất bại:", err);
        state.active = false;
        setIconState("error");
        cstToast(`Dịch thất bại: ${err.message}\nHãy kiểm tra kết nối mạng rồi thử lại.`, { warn: true });
    } finally {
        state.busy = false;
        // The state above was drawn while `busy` still held: the button kept spinning with
        // "Đang dịch phụ đề…" after the translation had finished (seen in 1.7.4). An error keeps its own.
        if (!failed) csUpdateButton();
    }
}

function disableTranslation() {
    const site = getCurrentSite();
    if (site === "youtube") {
        if (typeof ytTatDich === "function") {
            ytTatDich();
        }
        state.active = false;
        setIconState("idle");
        return;
    }

    state.navGen++;                           // a translation still running stops and applies nothing
    state.groupTotal = 0;
    // Tat long tieng truoc vi no doc tu phu de da dich
    if (window.CST_DUB && window.CST_DUB.dub.enabled) {
        window.CST_DUB.stop();
        csUpdateButton();
    }
    csStopRender();
    restoreOriginalCues();
    state.active = false;
    state.originalCueTexts = null;
    state.originalCues = null;
    state.activeTrack = null;
    setIconState("idle");
}

// ---------- Nut bam tren trinh phat ----------
// Mã thế hệ của lần nạp mã này (xem YT_GEN trong youtube.js): nút của mã cũ đã mất kết nối
// với tiện ích (sau khi Tải lại) bị thay bằng nút còn sống
const CS_GEN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);


// ---------- Coursera: control-bar button, subtitle overlay, quick menu ----------
// Same shape as YouTube. Two things used to go wrong here: the Vietnamese was handed to the
// browser's own cue renderer, which Coursera paints too, so the two boxes overlapped; and the
// controls were two circles floating over the picture instead of a button in the player's bar.

const CS_BTN = `.cst-cs-btn[data-cst-gen="${CS_GEN}"]`;
const CS_OVERLAY = `.cst-cs-overlay[data-cst-gen="${CS_GEN}"]`;
const cs = { viCues: [], origCues: [], renderKey: "", raf: 0, timer: 0, styleKey: "", panelOpen: false, menuOpen: false, edits: null };

// The render loop runs every frame and asks where the video and the player box are. Finding them
// walks the video's ancestors and measures every control-bar button (and, on generic pages, every
// video): layout reads, 60 times a second. The answer only changes when the page reflows, so it is
// kept for CS_MEMO_MS, and dropped at once when the element leaves the page. Building the button
// always looks afresh (csControlGroup).
const CS_MEMO_MS = 500;
const csMemo = { box: null, boxAt: -Infinity, video: null, videoAt: -Infinity };
const csNow = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

function csVideo() {
    if (getCurrentSite() !== "generic") return document.querySelector("video");
    const now = csNow();
    if (csMemo.video && csMemo.video.isConnected && now - csMemo.videoAt < CS_MEMO_MS) return csMemo.video;
    // Generic pages can hold several videos (previews, ads, a muted hero loop): take the biggest
    // one on screen, a playing one first
    let best = null, bestScore = 0;
    for (const v of document.querySelectorAll("video")) {
        const r = v.getBoundingClientRect();
        const area = Math.max(0, r.width) * Math.max(0, r.height);
        if (area < 120 * 68) continue;
        const score = area * (v.paused ? 1 : 2);
        if (score > bestScore) { bestScore = score; best = v; }
    }
    csMemo.video = best;
    csMemo.videoAt = now;
    return best;
}

// Coursera's class names are hashed and change between deploys, so the control bar is found by
// geometry. Measured trap: searching the whole document catches the buttons of any dialog that
// happens to overlap the picture, so the search climbs the video's own ancestors and stops at the
// first one holding at least three controls of its own, never at <body>.
function csPlayerParts() {
    const v = csVideo();
    if (!v) return null;
    const r = v.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const inBar = b => {
        const br = b.getBoundingClientRect();
        return br.width > 10 && br.height > 10
            && br.top > r.top + r.height * 0.55 && br.bottom < r.bottom + 90
            && br.left >= r.left - 24 && br.right <= r.right + 24;
    };
    let box = v.parentElement;
    let btns = [];
    while (box && box !== document.body) {
        btns = [...box.querySelectorAll("button")].filter(b => !b.classList.contains("cst-cs-btn") && inBar(b));
        if (btns.length >= 3) break;
        box = box.parentElement;
    }
    if (!box || box === document.body || btns.length < 3) return null;
    // the rightmost control is the anchor (fullscreen); ours goes in front of it
    const last = btns.reduce((a, b) => (b.getBoundingClientRect().left > a.getBoundingClientRect().left ? b : a));
    const wrap = last.parentElement;
    const group = wrap && wrap.parentElement;
    if (!group || group.children.length < 2) return null;
    return { box, group, before: wrap, height: Math.round(wrap.getBoundingClientRect().height) || 48 };
}

function csControlGroup() {
    return csPlayerParts();
}

// The container holding both the picture and the control bar: the overlay goes in there so it
// lines up with the video and rides along into fullscreen.
function csPlayerBox() {
    const now = csNow();
    if (csMemo.box && csMemo.box.isConnected !== false && now - csMemo.boxAt < CS_MEMO_MS) return csMemo.box;
    const parts = csPlayerParts();
    let box = parts ? parts.box : null;
    if (!box) {
        const v = csVideo();
        box = !v ? null : getCurrentSite() === "generic" ? csFrame(v) : v.parentElement;
    }
    csMemo.box = box;
    csMemo.boxAt = now;
    return box;
}

// Generic page, no control bar found: the video's parent can be much bigger than the picture
// (an article column), so the overlay, the button and the menu live in a transparent frame laid
// exactly over the video. csRender keeps it aligned when the page reflows.
function csFrame(v) {
    const parent = v.parentElement;
    if (!parent) return null;
    let f = parent.querySelector(`.cst-cs-frame[data-cst-gen="${CS_GEN}"]`);
    if (!f) {
        csHideOlderGen(parent, ".cst-cs-frame");
        if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
        f = document.createElement("div");
        f.className = "cst-cs-frame";
        f.dataset.cstGen = CS_GEN;
        f.style.cssText = "position:absolute;pointer-events:none;z-index:2147483000;overflow:visible;";
        parent.appendChild(f);
    }
    csAlignFrame(f, v);
    return f;
}

function csAlignFrame(f, v) {
    const pr = f.parentElement.getBoundingClientRect();
    const vr = v.getBoundingClientRect();
    const box = `${Math.round(vr.left - pr.left + f.parentElement.scrollLeft)},${Math.round(vr.top - pr.top + f.parentElement.scrollTop)},${Math.round(vr.width)},${Math.round(vr.height)}`;
    if (f.dataset.box === box) return;
    f.dataset.box = box;
    const [x, y, w, h] = box.split(",");
    f.style.left = `${x}px`; f.style.top = `${y}px`; f.style.width = `${w}px`; f.style.height = `${h}px`;
}

// Elements from an older generation of this script (after Reload) cannot work any more. Hide them,
// never remove them: removing makes the old code rebuild and remove ours, and the tab spins.
function csHideOlderGen(root, selector) {
    if (!root) return;
    root.querySelectorAll(selector).forEach(el => {
        if (el.dataset.cstGen !== CS_GEN && el.style.display !== "none") el.style.display = "none";
    });
}

function csCreateButton() {
    const kit = window.CST_PLAYER_UI;
    csMemo.boxAt = -Infinity;                     // the bar may have been rebuilt: look afresh
    const ctl = csControlGroup();
    if (kit && !ctl && getCurrentSite() === "generic") return csCreateFloatingButton(kit);
    if (!kit || !ctl) return null;
    csHideOlderGen(document, ".cst-translate-icon, .cst-dub-icon, .cst-cs-btn");
    const existing = document.querySelector(CS_BTN);
    if (existing && existing.isConnected) {
        csUpdateButton();
        return existing;
    }
    const size = Math.max(26, Math.min(32, ctl.height - 16));
    const btn = kit.taoNut(document, {
        size,
        title: "Dịch phụ đề & lồng tiếng tiếng Việt",
        className: "cst-cs-btn",
        onClick: () => csOpenMenu(btn),
        onDblClick: () => { if (state.active) disableTranslation(); else enableTranslation(); }
    });
    btn.dataset.cstGen = CS_GEN;
    btn.style.width = `${ctl.height}px`;
    btn.style.height = `${ctl.height}px`;
    const wrap = document.createElement("div");
    wrap.className = "cst-cs-btn-wrap";
    wrap.dataset.cstGen = CS_GEN;
    wrap.style.cssText = "display:flex;align-items:center;justify-content:center;";
    wrap.appendChild(btn);
    ctl.group.insertBefore(wrap, ctl.before);
    csUpdateButton();
    return btn;
}

// Generic page without a control bar we can recognise (a bare <video controls>, a custom player):
// the same button, floating in the top-right corner of the picture.
function csCreateFloatingButton(kit) {
    const box = csPlayerBox();
    if (!box) return null;
    csHideOlderGen(document, ".cst-cs-btn");
    const existing = document.querySelector(CS_BTN);
    if (existing && existing.isConnected) { csUpdateButton(); return existing; }
    const btn = kit.taoNut(document, {
        size: 28,
        title: "Dịch phụ đề & lồng tiếng tiếng Việt",
        className: "cst-cs-btn",
        onClick: () => csOpenMenu(btn),
        onDblClick: () => { if (state.active) disableTranslation(); else enableTranslation(); }
    });
    btn.dataset.cstGen = CS_GEN;
    btn.dataset.cstFloat = "1";
    btn.style.cssText += ";position:absolute;top:10px;right:10px;width:40px;height:40px;border-radius:10px;" +
        "background:rgba(0,0,0,.55);pointer-events:auto;opacity:.75;transition:opacity .15s ease;z-index:3;";
    btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; });
    btn.addEventListener("mouseleave", () => { btn.style.opacity = ".75"; });
    box.appendChild(btn);
    csUpdateButton();
    return btn;
}

function csUpdateButton(status) {
    const kit = window.CST_PLAYER_UI;
    const btn = document.querySelector(CS_BTN);
    if (!kit || !btn) return;
    const isDub = !!(window.CST_DUB && window.CST_DUB.dub && window.CST_DUB.dub.enabled);
    // lines on screen while the rest is still translated: "on", not a spinner (1.7.5)
    const busy = !state.active && (status === "loading" || csTranslating());
    const on = status === "on" || state.active || isDub;
    kit.datTrangThai(btn, {
        busy,
        on: on && !busy,
        title: busy ? "Đang dịch phụ đề…"
            : status === "error" ? "Dịch thất bại. Bấm để thử lại"
                : state.active && csTranslating() ? "Đang bật phụ đề tiếng Việt, đang dịch tiếp phần sau"
                    : state.active && isDub ? "Đang bật phụ đề Việt và lồng tiếng"
                        : state.active ? "Đang bật phụ đề tiếng Việt"
                            : isDub ? "Đang lồng tiếng Việt"
                                : "Dịch phụ đề & lồng tiếng tiếng Việt"
    });
}

// ---- The subtitle overlay: our own box on the picture, never the browser's cue renderer ----
function csOverlay() {
    const box = csPlayerBox();
    if (!box) return null;
    csHideOlderGen(box, ".cst-cs-overlay");
    let ov = box.querySelector(CS_OVERLAY);
    if (ov && ov.isConnected) return ov;
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    ov = document.createElement("div");
    ov.className = "cst-cs-overlay";
    ov.dataset.cstGen = CS_GEN;
    // Same box as the YouTube overlay: the lines are already fitted to the width, so the browser
    // must not wrap them again (white-space:pre), and the box hugs the text (width:max-content).
    ov.style.cssText = "position:absolute;left:50%;transform:translateX(-50%);max-width:92%;" +
        "width:max-content;box-sizing:border-box;text-align:center;pointer-events:none;" +
        "white-space:pre;opacity:0;z-index:60;transition:opacity .12s ease,bottom .18s ease-out,transform .24s cubic-bezier(.16,1,.3,1),max-width .24s cubic-bezier(.16,1,.3,1);";
    box.appendChild(ov);
    cs.styleKey = "";
    csApplyOverlayStyle(ov);
    return ov;
}

// Pixels taken on the right by the transcript panel (392 + 12) or the quick menu (340 + 12); the
// subtitle moves left of it instead of running underneath (see ytSideRoom in youtube.js).
function csSideRoom() {
    return Math.max(cs.panelOpen ? 404 : 0, cs.menuOpen ? 352 : 0);
}

function csApplyOverlayStyle(ov) {
    const S = window.CST_STYLE;
    if (!ov || !S) return;
    const s = S.normalizeStyle(state.subStyle);
    const box = csPlayerBox();
    const width = (box && box.clientWidth) || 640;
    const height = (box && box.clientHeight) || 360;
    const base = Math.max(14, Math.min(width * 0.026, 40));
    ov.style.fontFamily = S.fontStack(s.fontFamily);
    ov.style.fontSize = `${(base * S.sizeFactor(s.fontSize)).toFixed(1)}px`;
    ov.style.fontWeight = s.fontWeight;
    ov.style.lineHeight = String(s.lineHeight);
    ov.style.color = s.fontColor;
    ov.style.backgroundColor = S.backgroundColor(s);
    ov.style.borderRadius = `${s.borderRadius}px`;
    ov.style.textShadow = S.textShadow(s);
    ov.style.padding = S.backgroundColor(s) === "transparent" ? "2px 6px" : "0.18em 0.6em 0.22em";
    // With the transcript panel open the picture is narrower: keep the subtitles inside what is left
    const room = csSideRoom();
    if (room) {
        ov.style.maxWidth = `min(92%, calc(100% - ${room + 48}px))`;
        ov.style.transform = `translateX(calc(-50% - ${Math.round(room / 2)}px))`;
    } else {
        ov.style.maxWidth = "92%";
        ov.style.transform = "translateX(-50%)";
    }
    const margin = height * (s.offset || 0) / 100 + 6;
    const ctl = csControlGroup();
    const bar = s.pinBottom ? 0 : (ctl ? ctl.height + 16 : 64);
    if (s.position === "top") {
        ov.style.top = `${Math.round(margin)}px`;
        ov.style.bottom = "auto";
    } else {
        ov.style.top = "auto";
        ov.style.bottom = `${Math.round(Math.max(margin, bar))}px`;
    }
    S.ensureFont(document, s.fontFamily, s.fontWeight).then(() => { cs.renderKey = ""; });
    cs.styleKey = `${width}x${height}|${JSON.stringify(s)}`;
    cs.renderKey = "";
}

// A style change (Settings page, the size buttons in the quick menu) must show at once. csRender
// only re-applies the style when the player changes size, so without this a new font size waited
// for the next resize.
function csRestyle() {
    const ov = document.querySelector(CS_OVERLAY);
    if (ov) csApplyOverlayStyle(ov);
    cs.renderKey = "";
}

function csFindCue(list, t) {
    let lo = 0, hi = list.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].start > t) hi = mid - 1;
        else if (list[mid].end <= t) lo = mid + 1;
        else return list[mid];
    }
    return null;
}

function csPaint(ov, vi, origText) {
    const S = window.CST_STYLE;
    const s = S ? S.normalizeStyle(state.subStyle) : { origScale: 80, origColor: "#d4d4d8" };
    const box = csPlayerBox();
    const blocks = [];
    const block = (lines, css) => {
        const d = document.createElement("div");
        if (css) d.style.cssText = css;
        d.textContent = lines.join("\n");
        return d;
    };
    // The segmenter cuts by syntax, not by pixels. Without this the browser wraps an over-wide line
    // wherever it likes, which is how "... mà bạn có thể thực / hiện," showed up on a real lecture.
    const room = csSideRoom();
    const w = (box && box.clientWidth) || 0;
    // what the transcript panel or the quick menu leaves free on the left, as a share of the player
    const rong = room && w ? Math.max(0.3, Math.min(0.92, (w - room - 48) / w)) : 0.92;
    const vua = (lines, text, scale) => (S && S.fitLines
        ? S.fitLines(lines, text, ov, { scale, box, widthRatio: rong })
        : lines);
    if (vi) {
        const lines = vi.lines && vi.lines.length ? vi.lines : [vi.text];
        blocks.push(block(vua(lines, vi.text || lines.join(" "), 1)));
    }
    if (origText && (state.dualMode || !vi)) {
        const scale = vi ? (s.origScale || 80) / 100 : 1;
        const css = vi
            ? `font-size:${scale.toFixed(2)}em;color:${s.origColor};font-weight:400;margin-top:0.12em;`
            : "opacity:0.85;";
        const b = block(vua([origText], origText, scale), css);
        if (vi && state.originalFirst) {
            b.style.marginTop = "0";
            b.style.marginBottom = "0.12em";
            blocks.unshift(b);
        } else {
            blocks.push(b);
        }
    }
    ov.replaceChildren(...blocks);
    ov.style.opacity = blocks.length ? "1" : "0";
}

function csRender() {
    const v = csVideo();
    const ov = document.querySelector(CS_OVERLAY);
    if (!v || !ov) return;
    // Coursera can switch its own captions back on; only one of us should be painting.
    // Exception: a bare <video> in native fullscreen shows nothing but itself, so there the
    // browser draws the Vietnamese cues (the track holds them) and our overlay steps aside.
    const track = state.activeTrack && state.activeTrack.track;
    const nativeFull = typeof document !== "undefined" && document.fullscreenElement === v;
    if (track) {
        const want = nativeFull ? "showing" : "hidden";
        if (track.mode !== want) track.mode = want;
    }
    ov.style.visibility = nativeFull ? "hidden" : "";
    const box = csPlayerBox();
    if (box && cs.styleKey && !cs.styleKey.startsWith(`${box.clientWidth}x${box.clientHeight}|`)) csApplyOverlayStyle(ov);
    const t = v.currentTime;
    const vi = csFindCue(cs.viCues, t);
    const orig = csFindCue(cs.origCues, t);
    const key = `${vi ? vi.start : -1}|${state.dualMode && orig ? orig.start : -1}`;
    if (key === cs.renderKey) return;
    cs.renderKey = key;
    csPaint(ov, vi, orig ? orig.text : "");
}

// One frame per repaint while the tab is visible. A test harness (and any context without
// requestAnimationFrame) falls back to a plain 100 ms timer.
function csStartRender() {
    csOverlay();
    if (cs.raf || cs.timer) return;
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : null;
    if (!raf) {
        cs.timer = setInterval(csRender, 100);
        return;
    }
    const tick = () => {
        if (!cs.raf) return;
        csRender();
        cs.raf = raf(tick);
    };
    cs.raf = raf(tick);
}

function csStopRender() {
    if (cs.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(cs.raf);
    if (cs.timer) clearInterval(cs.timer);
    cs.timer = 0;
    cs.raf = 0;
    cs.renderKey = "";
    const ov = document.querySelector(CS_OVERLAY);
    if (ov) ov.remove();
    const track = state.activeTrack && state.activeTrack.track;
    if (track && track.mode === "hidden") track.mode = "showing";
}

// What the transcript panel needs from this player: the same two lists the overlay draws from.
// ---- The viewer's own corrections (subtitle-edits.js) ----
function csEditKey() {
    return currentVideoMeta().videoKey;
}

// Lay the stored edits over what the overlay draws (cs.viCues) and what the voice reads
// (state.dubGroups). They are separate objects on Coursera, so both lists are walked.
function csApplyEdits() {
    const E = window.CST_EDITS;
    if (!E) return 0;
    const n = E.sync(cs.edits, { groups: state.dubGroups, display: cs.viCues });
    if (n) { cs.renderKey = ""; E.notify(); }
    return n;
}

async function csLoadEdits() {
    const E = window.CST_EDITS;
    if (!E) return;
    cs.edits = await E.load(csEditKey());
    csApplyEdits();
}

function csTranscriptAdapter() {
    return {
        box: () => csPlayerBox(),
        videoEl: () => csVideo(),
        lines: () => (window.CST_TRANSCRIPT ? window.CST_TRANSCRIPT.mergeLines(cs.viCues, cs.origCues) : []),
        title: () => pageVideoTitle(),
        dual: () => !!state.dualMode,
        theme: () => state.uiTheme || "auto",
        saveEdit: async (line, text) => {
            cs.edits = await window.CST_EDITS.save(csEditKey(),
                { title: pageVideoTitle(), url: location.href },
                line.start, text, line.machine);
            csApplyEdits();
        },
        onPanel: on => {
            cs.panelOpen = !!on;
            const ov = document.querySelector(CS_OVERLAY);
            if (ov) csApplyOverlayStyle(ov);
            cs.renderKey = "";
        }
    };
}

// How trustworthy the source captions are. Coursera labels machine-heard tracks "(auto)".
function csSubtitleSource() {
    const el = state.activeTrack;
    if (!el) return null;
    const label = `${el.label || ""} ${el.srclang || ""}`.toLowerCase();
    if (/auto/.test(label)) return { nhan: "Phụ đề máy nghe tự động", canhBao: true };
    return { nhan: getCurrentSite() === "generic" ? "Phụ đề của trình phát" : "Phụ đề của khoá học", canhBao: false };
}

// ---- The quick menu, the same panel YouTube shows ----
function csOpenMenu(btn) {
    const box = csPlayerBox();
    const kit = window.CST_PLAYER_UI;
    if (!box || !kit) return;
    let open = box.querySelector(".cst-yt-menu");
    if (open && open.dataset.cstLeaving) open = null;             // one on its way out does not count
    if (open) {
        if (open.cstDong) open.cstDong(); else open.remove();
        return;
    }
    kit.napCss(document);

    const el = (tag, cls, txt) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e;
    };
    const congTac = (nhan, onToggle) => {
        const row = el("button", "cst-row");
        row.type = "button";
        row.setAttribute("role", "switch");
        const label = el("span", "cst-row-label");
        label.appendChild(document.createTextNode(nhan));
        const sub = el("span", "cst-row-sub");
        label.appendChild(sub);
        row.appendChild(label);
        row.appendChild(el("span", "cst-sw"));
        row.addEventListener("click", () => { if (row.getAttribute("aria-disabled") !== "true") onToggle(row); });
        row.cstSub = sub;
        return row;
    };

    const menu = el("div", "cst-yt-menu");
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "Dịch phụ đề và lồng tiếng");
    menu.dataset.cstGen = CS_GEN;
    menu.dataset.cstTheme = state.uiTheme || "auto";
    menu.style.bottom = `${(csControlGroup() || { height: 48 }).height + 22}px`;

    const head = el("div", "cst-menu-head");
    const mark = el("span", "cst-menu-mark");
    mark.innerHTML = kit.MARK_SVG;
    mark.style.color = "#FFFFFF";
    head.appendChild(mark);
    head.appendChild(el("span", "cst-menu-title", "Dịch & lồng tiếng Việt"));
    const x = el("button", "cst-menu-x", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Đóng");
    head.appendChild(x);
    menu.appendChild(head);

    const rowSub = congTac("Phụ đề tiếng Việt", async row => {
        if (state.active) { disableTranslation(); capNhat(); return; }
        row.setAttribute("aria-disabled", "true");
        capNhat();
        await enableTranslation();
        row.removeAttribute("aria-disabled");
        capNhat();
    });
    const rowDub = congTac("Lồng tiếng Việt", async row => {
        row.setAttribute("aria-disabled", "true");
        capNhat();
        await toggleDubbing(csPlayerBox() || document.body);
        row.removeAttribute("aria-disabled");
        capNhat();
    });
    menu.appendChild(rowSub);
    menu.appendChild(rowDub);

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
        voiceSel.value = LOCAL.defaultVoice;
        try {
            chrome.storage.sync.get({ dubLocalVoice: "" }, r => { if (r && r.dubLocalVoice) voiceSel.value = r.dubLocalVoice; });
        } catch (e) { /* bỏ qua */ }
    }
    voiceSel.addEventListener("change", async () => {
        try { await chrome.storage.sync.set({ dubLocalVoice: voiceSel.value }); } catch (e) { /* bỏ qua */ }
        cstToast(`Đang chuyển sang giọng ${voiceSel.value}…`);
    });
    voiceBox.appendChild(voiceSel);
    menu.appendChild(voiceBox);
    const volume = kit.buildVolumeControls(document);
    menu.appendChild(volume.el);

    const modeBox = el("div", "cst-field");
    modeBox.appendChild(el("div", "cst-field-label", "Kiểu hiển thị"));
    const seg = el("div", "cst-seg");
    const btnSingle = el("button", null, "Chỉ tiếng Việt");
    const btnDual = el("button", null, "Song ngữ");
    [btnSingle, btnDual].forEach(b => { b.type = "button"; seg.appendChild(b); });
    modeBox.appendChild(seg);
    menu.appendChild(modeBox);

    const S = window.CST_STYLE;
    const size = kit.buildStepper(document, {
        label: "Cỡ chữ", min: 50, max: 300, step: 10,
        get: () => (S ? S.normalizeStyle(state.subStyle).fontSize : 100),
        set: n => {
            // keep the subStyle.mode mirror in step with dualMode, the real source
            state.subStyle = { ...(state.subStyle || {}), fontSize: n, mode: state.dualMode ? "dual" : "single" };
            csRestyle();
            try { return chrome.storage.sync.set({ subStyle: state.subStyle }); } catch (e) { return null; }
        },
        format: n => `${n}%`
    });
    menu.appendChild(size.el);

    const foot = el("div", "cst-menu-foot");
    const btnTranscript = el("button", null, "Bản chép lời");
    btnTranscript.type = "button";
    btnTranscript.title = "Xem toàn bộ lời thoại, bấm một dòng để nhảy tới, xuất tệp .srt";
    btnTranscript.addEventListener("click", () => {
        if (window.CST_TRANSCRIPT) window.CST_TRANSCRIPT.toggle(csTranscriptAdapter());
        dong();
    });
    const btnOptions = el("button", null, "Cài đặt");
    btnOptions.type = "button";
    foot.appendChild(btnTranscript);
    foot.appendChild(btnOptions);
    menu.appendChild(foot);

    const datKieuHienThi = async dual => {
        state.dualMode = dual;
        cs.renderKey = "";
        if (state.subStyle) state.subStyle = { ...state.subStyle, mode: dual ? "dual" : "single" };
        try { await chrome.storage.sync.set(state.subStyle ? { dualMode: dual, subStyle: state.subStyle } : { dualMode: dual }); } catch (e) { /* bỏ qua */ }
        capNhat();
    };
    btnSingle.addEventListener("click", () => datKieuHienThi(false));
    btnDual.addEventListener("click", () => datKieuHienThi(true));
    btnOptions.addEventListener("click", () => {
        try { chrome.runtime.sendMessage({ action: "openOptions" }); } catch (e) { /* bỏ qua */ }
    });

    function capNhat() {
        const dubApi = window.CST_DUB;
        const isDub = !!(dubApi && dubApi.dub && dubApi.dub.enabled);
        rowSub.setAttribute("aria-checked", String(!!state.active));
        const nguon = csSubtitleSource();
        const hauTo = state.active && nguon ? ` · ${nguon.nhan.toLowerCase()}` : "";
        rowSub.cstSub.textContent = (state.active && csTranslating() ? "Đang bật, đang dịch tiếp" : csTranslating() ? "Đang dịch…" : state.active ? "Đang bật" : "Đang tắt") + hauTo;
        rowSub.cstSub.style.color = state.active && nguon && nguon.canhBao ? "var(--cst-warn)" : "";
        rowDub.setAttribute("aria-checked", String(isDub));
        const st = dubApi && dubApi.dub ? dubApi.dub.lastStatus : null;
        const suc = isDub && dubApi.describeHealth ? dubApi.describeHealth() : null;
        rowDub.cstSub.textContent = isDub ? (suc ? suc.text : "Đang bật") : "Đang tắt";
        rowDub.cstSub.style.color = suc && suc.warn ? "var(--cst-warn)" : "";
        volume.el.style.display = isDub ? "block" : "none";
        volume.refresh();
        size.refresh();
        btnSingle.setAttribute("aria-pressed", String(!state.dualMode));
        btnDual.setAttribute("aria-pressed", String(!!state.dualMode));
        const localProv = !st || st.provider === "vieneu";
        voiceBox.style.display = localProv ? "block" : "none";
        if (localProv && st && st.voice && voiceSel.value !== st.voice) voiceSel.value = st.voice;
        csUpdateButton();
    }
    capNhat();
    const nhip = setInterval(capNhat, 700);

    // Two sections, each holding only its own controls: what is on the page, then what is spoken
    if (kit.buildSection) {
        [head, kit.buildSection(document, "Phụ đề"), rowSub, modeBox, size.el,
            kit.buildSection(document, "Giọng đọc"), rowDub, voiceBox, volume.el, foot].forEach(n => menu.appendChild(n));
    }
    box.appendChild(menu);
    btn.setAttribute("aria-expanded", "true");
    const nhuongCho = on => {
        cs.menuOpen = on;
        const ov = document.querySelector(CS_OVERLAY);
        if (ov) csApplyOverlayStyle(ov);
        cs.renderKey = "";
    };
    nhuongCho(true);
    const dong = () => {
        clearInterval(nhip);
        if (kit.dismiss) kit.dismiss(menu); else menu.remove();
        nhuongCho(false);
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onKeyDown);
        btn.setAttribute("aria-expanded", "false");
        try { btn.focus(); } catch (e) { /* bỏ qua */ }
    };
    menu.cstDong = dong;
    const onDocClick = e => { if (!menu.contains(e.target) && !btn.contains(e.target)) dong(); };
    const onKeyDown = e => {
        if (e.key === "Escape") { e.stopPropagation(); dong(); return; }
        if (kit.trapTab) kit.trapTab(menu, e);                // Tab goes round inside the menu, as on YouTube
    };
    setTimeout(() => {
        document.addEventListener("click", onDocClick);
        document.addEventListener("keydown", onKeyDown);
    }, 0);
    x.addEventListener("click", dong);
}

async function toggleDubbing(container) {
    const api = window.CST_DUB;
    if (!api) {
        cstToast("Không nạp được phần lồng tiếng. Hãy tải lại trang rồi thử lại.", { warn: true });
        return;
    }

    if (api.dub.enabled) {
        api.stop();
        csUpdateButton();
        rememberDub(false);
        return;
    }

    const startVoice = async () => {
        if (api.dub.enabled || api.dub.starting) return;
        const videoEl = csVideo() || container.querySelector("video");
        const ok = await api.start({ video: videoEl, container, getGroups: () => state.dubGroups || [] });
        csUpdateButton();
        if (ok) rememberDub(true);
    };

    // Long tieng doc tu ban dich co ngu canh, nen phai dich truoc
    if (!state.active) {
        // Không hỏi bằng hộp thoại chặn trang: người dùng vừa bấm lồng tiếng nghĩa là đồng ý dịch
        cstToast("Đang dịch phụ đề để lồng tiếng…");
        // the voice starts with the first translated lines (the engine takes the rest as it comes)
        await enableTranslation({ onShown: () => { startVoice(); } });
        if (!state.active) return;
    }
    await startVoice();
}

// Nhớ bật/tắt lồng tiếng (cùng khóa với ô trong popup) để bài sau tự bật
function rememberDub(on) {
    state.dubEnabled = !!on;
    try { chrome.storage.sync.set({ dubEnabled: !!on }); } catch (e) { /* bỏ qua */ }
}

// Coursera: đã dịch xong và lồng tiếng đang được bật -> tự bật, không hộp thoại
async function courseraAutoDub() {
    const api = window.CST_DUB;
    if (!isTrackSite(getCurrentSite()) || !state.dubEnabled || !api || api.dub.enabled || state.dubStarting || !state.active) return false;
    const videoEl = csVideo();
    if (!videoEl) return false;
    const container = csPlayerBox() || videoEl.parentElement;
    state.dubStarting = true;
    try {
        const ok = await api.start({ video: videoEl, container, getGroups: () => state.dubGroups || [], quiet: true });
        csUpdateButton();
        return ok;
    } finally {
        state.dubStarting = false;
    }
}

function watchNavigation() {
    const checkUrl = () => {
        if (state.dead) return;
        if (location.href !== state.currentUrl) {
            console.log("Da chuyen bai giang, dat lai trang thai");
            state.currentUrl = location.href;
            state.navGen++;
            state.groupTotal = 0;
            if (window.CST_DUB && window.CST_DUB.dub.enabled) window.CST_DUB.stop();
            // the old lecture's lines must not linger in the popup count or the transcript panel
            state.dubGroups = [];
            cs.viCues = [];
            cs.origCues = [];
            state.active = false;
            state.originalCueTexts = null;
            state.activeTrack = null;
            csStopRender();
            setTimeout(() => { csCreateButton(); courseraAutoTranslate(); }, 1500);
        }
    };
    const interval = setInterval(checkUrl, 1000);
    state.intervals.push(interval);
    window.addEventListener("popstate", checkUrl);
}


// Nap tu dien: gop cac nhom nganh dang bat voi danh sach nguoi dung tu them
async function loadGlossary() {
    const groups = (typeof CST_GLOSSARY_GROUPS !== "undefined") ? CST_GLOSSARY_GROUPS : {};
    const defaultNorm = (typeof CST_DEFAULT_NORMALIZE !== "undefined") ? CST_DEFAULT_NORMALIZE : [];
    const allGroupKeys = Object.keys(groups);

    try {
        const saved = await chrome.storage.sync.get({
            glossaryEnabled: true,
            enabledGroups: allGroupKeys,
            knownGroups: null,
            userKeep: "",
            userNormalize: ""
        });
        const enabledGroups = (typeof CST_resolveEnabledGroups === "function")
            ? CST_resolveEnabledGroups(saved) : saved.enabledGroups;

        state.glossaryEnabled = saved.glossaryEnabled;

        // Gom thuat ngu tu cac nhom nganh dang bat
        const fromGroups = [];
        // Settled Vietnamese renderings of the enabled groups; a user rule below overrides them
        state.glossaryTranslateAs = new Map();
        for (const key of enabledGroups) {
            if (groups[key] && Array.isArray(groups[key].terms)) {
                fromGroups.push(...groups[key].terms);
            }
            for (const [en, vi] of Object.entries((groups[key] && groups[key].vi) || {})) {
                state.glossaryTranslateAs.set(en, vi);
            }
        }

        // Thuat ngu nguoi dung tu them, moi dong mot tu
        const userKeep = saved.userKeep
            .split("\n")
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith("#"));
        // A term the user asked to keep in English wins over the group's Vietnamese rendering
        for (const t of userKeep) state.glossaryTranslateAs.delete(t.toLowerCase());

        // Quy tac dich rieng: "tu goc => dang muon hien"
        // Ve trai duoc bao ve, khi khoi phuc thi dien ve phai
        const userTerms = [];
        saved.userNormalize
            .split("\n")
            .map(s => s.trim())
            .filter(s => s.includes("=>"))
            .forEach(line => {
                const [from, to] = line.split("=>").map(p => p.trim());
                if (!from || !to) return;
                userTerms.push(from);
                state.glossaryTranslateAs.set(from.toLowerCase(), to);
            });

        state.glossaryKeep = [...new Set([...userKeep, ...userTerms, ...fromGroups])];
        // Thuat ngu nhieu tu (dang hien thi cuoi cung) de bo phan doan khong cat doi
        state.glossaryMultiTerms = [...new Set([
            ...state.glossaryKeep,
            ...state.glossaryTranslateAs.values()
        ])].filter(t => /\s/.test(String(t).trim()));
        state.glossaryNormalize = defaultNorm;

        rebuildGlossaryRegex();
    } catch (err) {
        console.warn("Khong nap duoc tu dien:", err.message);
        state.glossaryKeep = [];
        state.glossaryNormalize = defaultNorm;
    }
}

async function loadSettings() {
    try {
        const saved = await chrome.storage.sync.get({
            dualMode: null, perCueMode: false, originalFirst: false,
            subStyle: null, costMode: "balanced", autoTranslate: true, dubEnabled: true, skipSameLang: true,
            uiTheme: "auto"
        });
        state.dubEnabled = saved.dubEnabled !== false;
        state.costMode = saved.costMode;
        state.autoTranslate = saved.autoTranslate !== false;
        state.skipSameLang = saved.skipSameLang !== false;
        state.dualMode = window.CST_STYLE ? window.CST_STYLE.resolveDual(saved) : !!saved.dualMode;
        state.uiTheme = saved.uiTheme || "auto";
        state.perCueMode = saved.perCueMode;
        state.originalFirst = saved.originalFirst;
        if (saved.subStyle) state.subStyle = saved.subStyle;
        await loadGlossary();
    } catch (err) {
        console.warn("Khong doc duoc tuy chon da luu:", err.message);
    }
}

async function init() {
    await loadSettings();

    // Lắng nghe thay đổi cài đặt từ options để cập nhật ngay
    try {
        // An edit saved in another tab or in Settings shows here at once (reverts included)
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== "local" || !window.CST_EDITS) return;
            const ch = changes[window.CST_EDITS.keyOf(csEditKey())];
            if (!ch) return;
            cs.edits = ch.newValue || null;
            csApplyEdits();
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "sync") {
                if (changes.subStyle) {
                    // subStyle.mode is only a mirror: dualMode decides (CST_STYLE.resolveDual)
                    state.subStyle = changes.subStyle.newValue;
                    injectCueStyle();
                    repositionCues();
                    csRestyle();
                }
                if (changes.dualMode) {
                    state.dualMode = !!changes.dualMode.newValue;
                    cs.renderKey = "";            // repaint now, not at the next cue
                }
                // The popup's "Tiếng Anh ở trên" applied only after the next Translate click
                if (changes.originalFirst) {
                    state.originalFirst = !!changes.originalFirst.newValue;
                    cs.renderKey = "";
                    repositionCues();
                    if (typeof yt !== "undefined") yt.renderKey = "";
                }
                if (changes.costMode) state.costMode = changes.costMode.newValue;
                if (changes.autoTranslate) state.autoTranslate = changes.autoTranslate.newValue !== false;
                if (changes.skipSameLang) state.skipSameLang = changes.skipSameLang.newValue !== false;
                // Tu dien thay doi: ap dung cho cac cau dich tiep theo, khong can tai lai trang
                if (changes.glossaryEnabled || changes.enabledGroups || changes.userKeep || changes.userNormalize) {
                    loadGlossary();
                }
                if (changes.dubEnabled) {
                    state.dubEnabled = changes.dubEnabled.newValue !== false;
                    if (isTrackSite(getCurrentSite())) {
                        if (state.dubEnabled) courseraAutoDub();
                        else if (window.CST_DUB && window.CST_DUB.dub.enabled) { window.CST_DUB.stop(); csUpdateButton(); }
                    }
                }
                // (dubbing.js tự áp dụng thay đổi giọng / mức âm cho engine lồng tiếng đang chạy)
            }
        });
    } catch (e) {}

    // Tren YouTube, youtube.js dam nhiem phan giao dien va dich
    if (getCurrentSite() === "youtube") {
        console.log("Dang o YouTube, phan xu ly do youtube.js dam nhiem");
        return;
    }
    injectCueStyle();
    csCreateButton();
    if (getCurrentSite() === "generic") {
        // a player often sizes its <video> only after metadata loads, and a quiet page may not
        // mutate again: keep trying for a while instead of waiting for the body observer
        let tries = 0;
        const again = setInterval(() => {
            if (state.dead || document.querySelector(CS_BTN) || ++tries > 30) { clearInterval(again); return; }
            csCreateButton();
        }, 1000);
        state.intervals.push(again);
    }

    // Coursera rebuilds its control bar on navigation; put the button back when it does. Checked
    // at most once per 150 ms (leading edge + one trailing check) instead of on every body mutation.
    let lastCheck = -Infinity, trailing = null;
    const checkButton = () => { if (!state.dead && !document.querySelector(CS_BTN)) csCreateButton(); };
    const observer = new MutationObserver(() => {
        if (state.dead || trailing) return;
        const now = Date.now();
        if (now - lastCheck >= 150) { lastCheck = now; checkButton(); return; }
        trailing = setTimeout(() => { trailing = null; lastCheck = Date.now(); checkButton(); }, 150 - (now - lastCheck));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    state.observers.push(observer);

    watchNavigation();
    courseraAutoTranslate();
    // Tiện ích vừa được Tải lại: mã này mất kết nối -> tự tắt gọn (mã mới được nạp lại vào tab)
    const kt = setInterval(() => {
        let ok = false;
        try { ok = !!(chrome.runtime && chrome.runtime.id); } catch (e) { ok = false; }
        if (ok) return;
        clearInterval(kt);
        state.dead = true;
        // The navigation poll and the generic-page retries too: left running, a lecture change after
        // Reload made this dead copy build its button again and hide the live one (csHideOlderGen)
        state.intervals.forEach(id => clearInterval(id));
        state.intervals = [];
        try { if (window.CST_DUB) window.CST_DUB.stop(); } catch (e) { /* bỏ qua */ }
        try { if (state.active) disableTranslation(); } catch (e) { /* bỏ qua */ }
        state.observers.forEach(o => { try { o.disconnect(); } catch (e) { /* bỏ qua */ } });
        document.querySelectorAll(`[data-cst-gen="${CS_GEN}"]`).forEach(el => el.remove());
        state.autoTranslate = false;
    }, 1500);
}

// ---------- Tự động dịch bài giảng (Coursera) ----------
// Chỉ khi phụ đề KHÔNG phải tiếng Việt và nhận diện đủ chắc (nhận diện trên máy,
// không gọi Gemini). Tắt "Tự động dịch" thì vẫn bấm nút dịch tay được.
async function courseraAutoTranslate() {
    // generic pages: the viewer just asked for a translation, nothing to decide automatically
    if (getCurrentSite() !== "coursera") return null;
    if (!state.autoTranslate || state.active) return null;
    const url = location.href;
    if (state.autoTriedUrl === url) return null;
    // The lecture just left may still be finishing its window in flight (up to Gemini's 15 s
    // timeout): wait for it instead of giving up on this lecture for good
    for (let i = 0; i < 80 && state.busy && location.href === url; i++) await sleep(250);
    if (state.busy) return null;
    let picked = null;
    for (let i = 0; i < 30 && !(picked = pickBestTrack()); i++) await sleep(500);   // chờ trình phát nạp track
    if (location.href !== url || state.active || state.busy) return null;
    state.autoTriedUrl = url;
    if (!picked) return null;
    const LANG = window.CST_LANG;
    let decision;
    if (picked.alreadyVietnamese) {
        decision = { lang: "vi", confidence: 0.9, source: "metadata", action: "skip" };
    } else {
        const tr = picked.track.track;
        const was = tr.mode;
        if (was === "disabled") tr.mode = "hidden";              // nạp nội dung để lấy mẫu, không hiện lên
        const cues = await waitForCues(tr, 6000);
        if (was === "disabled" && !state.active) tr.mode = was;
        const sample = cues ? Array.from(cues).slice(0, 40).map(plainCueText).join(" ") : "";
        decision = LANG ? LANG.decide({ metaLang: picked.track.srclang, sample }) : { lang: "unknown", confidence: 0, source: "none", action: "unsure" };
    }
    state.langDecision = decision;
    console.log(`[AI Subtitle] Ngôn ngữ phụ đề: ${decision.lang} (${Math.round(decision.confidence * 100)}%, theo ${decision.source}) -> ${decision.action === "translate" ? "tự động dịch" : decision.action === "skip" ? "đã là tiếng Việt, không dịch" : "chưa chắc chắn, không tự dịch"}`);
    if (decision.action === "translate") {
        // the voice starts with the first translated lines, not after the whole lecture
        await enableTranslation({ onShown: () => { if (location.href === url) courseraAutoDub(); } });
        if (state.active && location.href === url) await courseraAutoDub();
    }
    return decision;
}

// Phím tắt: bật/tắt phụ đề (Alt+S) và lồng tiếng (Alt+D) ngay trên trang đang xem,
// luôn báo lại bằng một thẻ nhỏ để người dùng biết phím vừa ăn
async function xuLyPhimTat(command, site) {
    const dubApi = window.CST_DUB;
    if (site === "youtube") {
        if (typeof yt === "undefined" || !yt.videoEl) { cstToast("Hãy mở một video YouTube trước."); return { ok: false }; }
        if (command === "bat-tat-phu-de") {
            if (yt.active) { ytTatDich(); cstToast("Đã tắt phụ đề tiếng Việt."); return { ok: true, on: false }; }
            cstToast("Đang dịch phụ đề sang tiếng Việt…");
            const ok = await ytBatDauDich();
            ytDatTrangThaiNut(ok ? "on" : "idle");
            if (ok) cstToast("Đã bật phụ đề tiếng Việt.");
            return { ok };
        }
        if (command === "bat-tat-long-tieng") {
            const player = document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
            const dangBat = !!(dubApi && dubApi.dub.enabled);
            if (!dangBat) cstToast("Đang chuẩn bị lồng tiếng Việt…");
            await ytChuyenLongTieng(player);
            cstToast(dubApi && dubApi.dub.enabled ? "Đã bật lồng tiếng Việt." : "Đã tắt lồng tiếng Việt.");
            return { ok: true };
        }
        return { ok: false };
    }
    if (command === "bat-tat-phu-de") {
        if (state.active) { disableTranslation(); cstToast("Đã tắt phụ đề tiếng Việt."); return { ok: true, on: false }; }
        cstToast("Đang dịch phụ đề sang tiếng Việt…");
        await enableTranslation();
        return { ok: true };
    }
    if (command === "bat-tat-long-tieng") {
        if (!dubApi) { cstToast("Trang này chưa bật được lồng tiếng."); return { ok: false }; }
        if (dubApi.dub.enabled) { dubApi.stop(); rememberDub(false); cstToast("Đã tắt lồng tiếng Việt."); return { ok: true, on: false }; }
        cstToast("Đang chuẩn bị lồng tiếng Việt…");
        const videoEl = csVideo();
        await toggleDubbing((videoEl && videoEl.parentElement) || document.body);
        const on = !!(window.CST_DUB && window.CST_DUB.dub.enabled);
        cstToast(on ? "Đã bật lồng tiếng Việt." : "Chưa bật được lồng tiếng trên trang này.", { warn: !on });
        return { ok: on };
    }
    return { ok: false };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const site = getCurrentSite();
    if (request.method === "translate") {
        state.dualMode = !!request.dualMode;
        state.perCueMode = !!request.perCueMode;
        state.originalFirst = !!request.originalFirst;
        if (request.dubEnabled !== undefined) {
            state.dubEnabled = !!request.dubEnabled;

        }
        injectCueStyle();

        if (site === "youtube") {
            if (typeof ytNapCaiDatKieu === "function") ytNapCaiDatKieu();
            if (typeof ytBatDauDich === "function") {
                ytBatDauDich().then(ok => {
                    if (ok && typeof ytTuBatLongTieng === "function") ytTuBatLongTieng();
                    sendResponse({ method: "translate", status: ok ? "success" : "failed" });
                }).catch(err => {
                    console.error("Lỗi kích hoạt YouTube:", err);
                    sendResponse({ method: "translate", status: "error", message: err.message });
                });
                return true;
            }
        }

        if (!state.active) {
            const dub = () => { if (state.active && site === "generic") courseraAutoDub(); };
            enableTranslation({ onShown: dub }).then(dub);
        }
        sendResponse({ method: "translate", status: "success" });
        return true;
    }
    if (request.method === "phimTat") {
        xuLyPhimTat(request.command, site).then(sendResponse, () => sendResponse({ ok: false }));
        return true;
    }
    if (request.method === "forgetVideoAudio") {
        if (!window.CST_DUB || !window.CST_DUB.forgetVideoAudio) { sendResponse({ ok: false, error: "Chưa bật lồng tiếng" }); return true; }
        window.CST_DUB.forgetVideoAudio().then(sendResponse, e => sendResponse({ ok: false, error: e.message }));
        return true;
    }
    if (request.method === "getStatus") {
        // Bảng điều khiển hiện trạng thái THẬT của trang đang xem: đang dịch tới đâu, đang đọc
        // bằng giọng nào (trước đây chỉ có bật/tắt nên bấm xong không biết chuyện gì đang xảy ra)
        const dubApi = window.CST_DUB;
        const st = dubApi && dubApi.dub ? dubApi.dub.lastStatus : null;
        const health = dubApi && dubApi.describeHealth ? dubApi.describeHealth() : null;
        const dub = { on: !!(dubApi && dubApi.dub && dubApi.dub.enabled), voice: (st && st.voice) || "", label: (st && st.label) || "", health: health ? health.text : "", warn: !!(health && health.warn) };
        const title = pageVideoTitle();
        const demXong = gs => (gs || []).filter(g => g && g.viText).length;
        if (site === "youtube" && typeof yt !== "undefined") {
            const gs = (typeof ytNhomLongTieng === "function" ? ytNhomLongTieng() : yt.groups) || [];
            sendResponse({ site, title, active: yt.active, busy: yt.busy, dub, xong: demXong(gs), tong: gs.length });
            return true;
        }
        const gs = state.dubGroups || [];
        // tong: every group of the lecture (it was the translated ones, so the popup said "done" at once)
        sendResponse({ site, title, active: state.active, busy: csTranslating(), dub, xong: demXong(gs), tong: Math.max(gs.length, state.groupTotal || 0), host: location.hostname.replace(/^www\./, "") });
        return true;
    }
});

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

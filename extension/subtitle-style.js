// ============================================================
// KIỂU PHỤ ĐỀ DÙNG CHUNG (trang cài đặt, Coursera, YouTube)
//
// Vấn đề cũ: danh sách phông chỉ là tên phông hệ thống trần
// ("Roboto", "Segoe UI"...). Máy không có phông đó thì trình duyệt âm thầm
// lùi về Arial, nên nhiều lựa chọn trông y hệt nhau. Viền chữ tính bằng px
// cố định nên không co giãn theo cỡ chữ.
//
// Cách mới:
//   - Mỗi phông là một "bộ phông" đầy đủ, có phương án dự phòng hỗ trợ
//     tiếng Việt, không bao giờ rơi về phông thiếu dấu.
//   - Phông web (Be Vietnam Pro, Inter...) được nạp từ Google Fonts
//     với bộ ký tự tiếng Việt khi người dùng chọn.
//   - Phông hệ thống được kiểm tra có trên máy hay không để trang cài đặt
//     báo rõ thay vì im lặng dùng phông khác.
//   - Viền và bóng chữ tính theo em nên luôn cân đối ở mọi cỡ chữ.
// ============================================================
(function (root) {
    "use strict";

    const SANS_FALLBACK = `"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`;
    const SERIF_FALLBACK = `Georgia, "Times New Roman", "Noto Serif", serif`;
    const MONO_FALLBACK = `ui-monospace, Menlo, Consolas, "Courier New", monospace`;

    // web: tên họ phông + các độ đậm có sẵn trên Google Fonts
    const FONTS = [
        { id: "be-vietnam-pro", label: "Be Vietnam Pro (thiết kế riêng cho tiếng Việt)", family: "Be Vietnam Pro", web: "300;400;500;600;700;800", fallback: SANS_FALLBACK },
        { id: "inter", label: "Inter (hiện đại, rất rõ nét)", family: "Inter", web: "300;400;500;600;700;800", fallback: SANS_FALLBACK },
        { id: "roboto", label: "Roboto (giống phụ đề YouTube)", family: "Roboto", web: "300;400;500;700", fallback: SANS_FALLBACK },
        { id: "noto-sans", label: "Noto Sans (dấu tiếng Việt chuẩn)", family: "Noto Sans", web: "300;400;500;600;700;800", fallback: SANS_FALLBACK },
        { id: "nunito", label: "Nunito (bo tròn, thân thiện)", family: "Nunito", web: "300;400;500;600;700;800", fallback: SANS_FALLBACK },
        { id: "lexend", label: "Lexend (tối ưu tốc độ đọc)", family: "Lexend", web: "300;400;500;600;700;800", fallback: SANS_FALLBACK },
        { id: "montserrat", label: "Montserrat (hình học, mạnh mẽ)", family: "Montserrat", web: "300;400;500;600;700;800", fallback: SANS_FALLBACK },
        { id: "system", label: "Phông hệ thống (San Francisco / Segoe UI)", family: "", stack: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` },
        { id: "helvetica", label: "Helvetica Neue", family: "Helvetica Neue", local: true, fallback: `Helvetica, Arial, ${SANS_FALLBACK}` },
        { id: "arial", label: "Arial", family: "Arial", local: true, fallback: `"Arial Unicode MS", ${SANS_FALLBACK}` },
        { id: "merriweather", label: "Merriweather (có chân, dễ đọc)", family: "Merriweather", web: "300;400;700", fallback: SERIF_FALLBACK },
        { id: "noto-serif", label: "Noto Serif (có chân)", family: "Noto Serif", web: "400;700", fallback: SERIF_FALLBACK },
        { id: "georgia", label: "Georgia (có chân)", family: "Georgia", local: true, fallback: SERIF_FALLBACK },
        { id: "times", label: "Times New Roman", family: "Times New Roman", local: true, fallback: SERIF_FALLBACK },
        { id: "roboto-mono", label: "Roboto Mono (đơn cách)", family: "Roboto Mono", web: "300;400;500;700", fallback: MONO_FALLBACK }
    ];

    // Loại phông: dùng để nhóm trong trang cài đặt
    for (const f of FONTS) {
        f.kind = f.fallback === SERIF_FALLBACK ? "serif" : f.fallback === MONO_FALLBACK ? "mono" : "sans";
    }

    // Giá trị cũ đã lưu (tên phông trần) -> mã phông mới
    const LEGACY = {
        "helvetica neue": "helvetica", "roboto": "roboto", "arial": "arial", "arial unicode ms": "arial",
        "segoe ui": "system", "georgia": "georgia", "courier new": "roboto-mono", "times new roman": "times"
    };

    const STROKES = [
        { id: "none", label: "Không viền" },
        { id: "shadow", label: "Đổ bóng nhẹ (dễ nhìn)" },
        { id: "thin", label: "Viền mảnh" },
        { id: "thick", label: "Viền dày (nền sáng, video nhiều chữ)" },
        { id: "glow", label: "Quầng mờ (mềm mại)" },
        { id: "raised", label: "Nổi khối" }
    ];

    const DEFAULT_STYLE = {
        mode: "single",
        position: "bottom",
        offset: 1,
        pinBottom: false,          // true: luôn sát lề đã chọn, thanh điều khiển có thể che tạm
        fontFamily: "be-vietnam-pro",
        fontSize: 100,             // 1.7.0 scale: 100% = the old 70%, the size the user reads best
        fontWeight: "400",
        strokeStyle: "glow",
        strokeColor: "#000000",
        fontColor: "#ffffff",
        bgColor: "#000000",
        bgOpacity: 75,
        borderRadius: 6,
        lineHeight: 1.38,          // tiếng Việt có dấu chồng nên cần dòng thoáng hơn tiếng Anh
        origScale: 80,             // cỡ dòng gốc trong chế độ song ngữ (% so với bản dịch)
        origColor: "#d4d4d8"
    };

    function getFont(id) {
        return FONTS.find(f => f.id === id) || FONTS[0];
    }

    function normalizeStyle(style) {
        const s = { ...DEFAULT_STYLE, ...(style || {}) };
        if (!FONTS.some(f => f.id === s.fontFamily)) {
            s.fontFamily = LEGACY[String(s.fontFamily || "").toLowerCase()] || DEFAULT_STYLE.fontFamily;
        }
        if (!STROKES.some(k => k.id === s.strokeStyle)) s.strokeStyle = DEFAULT_STYLE.strokeStyle;
        s.fontSize = clampNum(s.fontSize, 50, 300, DEFAULT_STYLE.fontSize);
        s.bgOpacity = clampNum(s.bgOpacity, 0, 100, DEFAULT_STYLE.bgOpacity);
        s.offset = clampNum(s.offset, 0, 40, DEFAULT_STYLE.offset);
        s.borderRadius = clampNum(s.borderRadius, 0, 24, DEFAULT_STYLE.borderRadius);
        s.lineHeight = clampNum(s.lineHeight, 1.1, 1.8, DEFAULT_STYLE.lineHeight);
        s.origScale = clampNum(s.origScale, 50, 100, DEFAULT_STYLE.origScale);
        s.fontWeight = String(s.fontWeight || DEFAULT_STYLE.fontWeight);
        s.pinBottom = s.pinBottom === true;
        return s;
    }

    function clampNum(v, min, max, def) {
        const n = Number(v);
        return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
    }

    function fontStack(id) {
        const f = getFont(id);
        if (f.stack) return f.stack;
        // Bỏ tên trùng (ví dụ "Be Vietnam Pro" vừa là phông chính vừa đứng đầu bộ dự phòng)
        const parts = [`"${f.family}"`, ...f.fallback.split(",").map(x => x.trim())];
        return parts.filter((x, i) => parts.findIndex(y => y.replace(/"/g, "") === x.replace(/"/g, "")) === i).join(", ");
    }

    function googleFontsUrl(f) {
        const fam = f.family.replace(/ /g, "+");
        return `https://fonts.googleapis.com/css2?family=${fam}:wght@${f.web}&display=swap`;
    }

    // Nạp phông web vào tài liệu (trang cài đặt hoặc trang video). Trả về Promise
    // true nếu phông đã sẵn sàng. Nếu bị chặn (CSP, mạng) thì bộ dự phòng vẫn
    // hiển thị tiếng Việt đầy đủ dấu.
    function ensureFont(doc, id, weight) {
        const f = getFont(id);
        if (!doc || !f.web) return Promise.resolve(!f.local || isLocalFontAvailable(doc, f.family));
        const linkId = `cst-font-${f.id}`;
        if (!doc.getElementById(linkId)) {
            const link = doc.createElement("link");
            link.id = linkId;
            link.rel = "stylesheet";
            link.href = googleFontsUrl(f);
            (doc.head || doc.documentElement).appendChild(link);
        }
        if (!doc.fonts || !doc.fonts.load) return Promise.resolve(true);
        const spec = `${weight || 500} 20px "${f.family}"`;
        return new Promise(resolve => {
            let done = false;
            const finish = ok => { if (!done) { done = true; resolve(ok); } };
            setTimeout(() => finish(doc.fonts.check(spec, "Tiếng Việt")), 4000);
            const link = doc.getElementById(linkId);
            const tryLoad = () => doc.fonts.load(spec, "Tiếng Việt có dấu").then(list => finish(list.length > 0)).catch(() => finish(false));
            if (link && !link.sheet) link.addEventListener("load", tryLoad, { once: true });
            else tryLoad();
            if (link) link.addEventListener("error", () => finish(false), { once: true });
        });
    }

    // Phông hệ thống có thật sự trên máy không: so độ rộng chữ với phông dự phòng
    function isLocalFontAvailable(doc, family) {
        try {
            const canvas = doc.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const sample = "Mạng nơ-ron tích chập WMmwil 0123";
            return ["monospace", "serif", "sans-serif"].some(base => {
                ctx.font = `32px ${base}`;
                const w0 = ctx.measureText(sample).width;
                ctx.font = `32px "${family}", ${base}`;
                return Math.abs(ctx.measureText(sample).width - w0) > 0.5;
            });
        } catch (e) {
            return true;
        }
    }

    // Viền chữ thật (nhiều bóng xếp vòng tròn) theo đơn vị em
    function ring(width, color, steps) {
        const parts = [];
        for (let i = 0; i < steps; i++) {
            const a = (i / steps) * Math.PI * 2;
            parts.push(`${(Math.cos(a) * width).toFixed(3)}em ${(Math.sin(a) * width).toFixed(3)}em 0 ${color}`);
        }
        return parts.join(", ");
    }

    function hexToRgba(hex, alpha) {
        let h = String(hex || "#000000").replace("#", "");
        if (h.length === 3) h = h.split("").map(c => c + c).join("");
        const r = parseInt(h.substring(0, 2) || "0", 16) || 0;
        const g = parseInt(h.substring(2, 4) || "0", 16) || 0;
        const b = parseInt(h.substring(4, 6) || "0", 16) || 0;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function textShadow(style) {
        const s = normalizeStyle(style);
        const c = s.strokeColor || "#000000";
        switch (s.strokeStyle) {
            case "none": return "none";
            case "thin": return `${ring(0.045, c, 12)}, 0 0.06em 0.14em ${hexToRgba(c, 0.6)}`;
            case "thick": return `${ring(0.08, c, 16)}, 0 0.08em 0.2em ${hexToRgba(c, 0.75)}`;
            case "glow": return `0 0 0.12em ${hexToRgba(c, 0.95)}, 0 0 0.28em ${hexToRgba(c, 0.8)}, 0 0 0.45em ${hexToRgba(c, 0.5)}`;
            case "raised": return `0.035em 0.035em 0 ${c}, 0.07em 0.07em 0 ${hexToRgba(c, 0.7)}, 0.1em 0.1em 0.12em ${hexToRgba(c, 0.5)}`;
            case "shadow":
            default: return `0 0.05em 0.12em ${hexToRgba(c, 0.85)}, 0 0 0.08em ${hexToRgba(c, 0.9)}`;
        }
    }

    function backgroundColor(style) {
        const s = normalizeStyle(style);
        if (s.bgColor === "transparent" || s.bgOpacity === 0) return "transparent";
        return hexToRgba(s.bgColor, (s.bgOpacity / 100).toFixed(2));
    }

    // ---------- Fitting a cue to the box it is drawn in ----------
    // The segmenter breaks a cue into lines by syntax, not by pixels, so a long line can still be
    // wider than the overlay. Left to CSS the browser then wraps it anywhere, which is how
    // "... mà bạn có thể thực / hiện," happened on a real lecture. Measure the real font and, when a
    // line does not fit, ask the segmenter to break the same text into shorter lines.
    let measureCtx = null;

    // Canvas when there is one; otherwise an estimate in the same unit (px), because the caller
    // compares the result against a pixel width. A rough average glyph is half the font size.
    function textWidth(text, font, fontPx) {
        const uoc = () => String(text).length * (fontPx || parseFloat(font) || 16) * 0.5;
        if (typeof document === "undefined") return uoc();
        if (!measureCtx) {
            const c = document.createElement("canvas");
            measureCtx = c.getContext ? c.getContext("2d") : null;
        }
        if (!measureCtx) return uoc();
        measureCtx.font = font;
        return measureCtx.measureText(text).width;
    }

    // lines: what the segmenter produced. text: the same cue as one string. box: the element the
    // overlay is drawn in. opts.scale: for the smaller source-language block. Returns lines that fit.
    function fitLines(lines, text, overlay, opts = {}) {
        const seg = (typeof globalThis !== "undefined" && globalThis.CST_VI_SEG) || null;
        const box = opts.box || (overlay && overlay.parentElement);
        if (!seg || !box || !overlay || !lines || !lines.length) return lines;
        const cs = typeof getComputedStyle === "function" ? getComputedStyle(overlay) : {};
        const fontPx = parseFloat(overlay.style.fontSize || cs.fontSize || 16) * (opts.scale || 1);
        if (!(fontPx > 0)) return lines;
        const font = `${cs.fontWeight || 400} ${fontPx}px ${cs.fontFamily || "sans-serif"}`;
        const padX = fontPx * 1.3;
        const avail = (box.clientWidth || 0) * (opts.widthRatio || 0.88) - padX;
        if (!(avail > 0)) return lines;
        let widest = 0;
        let widestLen = 1;
        for (const l of lines) {
            const w = textWidth(l, font, fontPx);
            if (w > widest) { widest = w; widestLen = l.length; }
        }
        if (widest <= avail) return lines;
        const perChar = widest / Math.max(1, widestLen);
        const maxChars = Math.max(12, Math.floor(avail / perChar) - 1);
        return seg.breakLines(text, { maxLineChars: maxChars, maxLines: opts.maxLines || 4 });
    }

    // Bilingual display has one source of truth: the top-level `dualMode` storage key, which the
    // popup, Settings and both in-page menus all write. `subStyle.mode` is only a mirror and is
    // read back solely when `dualMode` was never stored (settings from before the key existed).
    function resolveDual(saved) {
        if (!saved) return false;
        if (saved.dualMode !== undefined && saved.dualMode !== null) return !!saved.dualMode;
        return !!(saved.subStyle && saved.subStyle.mode === "dual");
    }

    // Reading time (1.7.0): a line stays on screen into the silence after it, up to maxLinger
    // seconds, never closer than `gap` to the next line. Measured on the 22 fixture sentences: 5 of
    // 32 lines ran faster than 20 characters per second and one showed for under a second. Display
    // only; the voice keeps the subtitle's own timing (it plans from the dub groups, not from these).
    function lingerCues(cues, opts = {}) {
        const maxLinger = opts.maxLinger != null ? opts.maxLinger : 0.7;
        const gap = opts.gap != null ? opts.gap : 0.06;
        // idempotent: the subtitle's own end is kept in baseEnd, so running it twice (a cache load of
        // an already lingered list) never stretches a line further
        for (let i = 0; i < cues.length; i++) {
            const c = cues[i], next = cues[i + 1];
            if (c.baseEnd == null) c.baseEnd = c.end;
            const limit = next ? next.start - gap : c.baseEnd + maxLinger;
            c.end = Math.max(c.baseEnd, Math.min(c.baseEnd + maxLinger, limit));
        }
        return cues;
    }

    // Subtitle size scale (1.7.0). The user found the old 70% the right reading size and asked for it
    // to be called 100%; every size is rescaled the same way. fontSize is what the viewer sees and
    // picks, SIZE_UNIT turns it into the old multiplier: 100 -> 0.70, 130 -> 0.91, 200 -> 1.40.
    const SIZE_UNIT = 0.7;
    const sizeFactor = fontSize => (Number(fontSize) || DEFAULT_STYLE.fontSize) / 100 * SIZE_UNIT;

    const api = {
        FONTS, STROKES, DEFAULT_STYLE, resolveDual, SIZE_UNIT, sizeFactor, lingerCues,
        getFont, normalizeStyle, fontStack, ensureFont, isLocalFontAvailable,
        textShadow, backgroundColor, hexToRgba, googleFontsUrl,
        fitLines, textWidth
    };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_STYLE = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

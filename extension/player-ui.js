// Shared player UI: the product mark, the control-bar button and the quick-menu stylesheet.
// Both players draw from here, so the button on YouTube and the button on Coursera cannot drift
// apart again. Loaded before content.js and youtube.js (see manifest.json).
(function (root) {
    "use strict";

    // The product mark, drawn inline where we own the container (menu header, popup, Settings).
    const MARK_SVG = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" aria-hidden="true" focusable="false">
        <path d="M4.2 4.6h15.6c1.55 0 2.8 1.25 2.8 2.8v7.9c0 1.55-1.25 2.8-2.8 2.8h-6.6l-4.3 3.2c-.62.46-1.5.02-1.5-.75V18.1H4.2c-1.55 0-2.8-1.25-2.8-2.8V7.4c0-1.55 1.25-2.8 2.8-2.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
        <g transform="translate(12 11.35) scale(0.42) translate(-12 -12)">
            <path d="M12 2C12.4 7.2 16.8 11.6 22 12C16.8 12.4 12.4 16.8 12 22C11.6 16.8 7.2 12.4 2 12C7.2 11.6 11.6 7.2 12 2Z" fill="currentColor"></path>
        </g>
    </svg>`;

    // The same mark inside a speech bubble, for the button that sits in a player's control bar.
    // It is painted as a background image: measured on a real YouTube page, their stylesheet
    // computes an inline <svg> inside .ytp-button to width 0 and the button goes blank.
    const BTN_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none">
        <path d="M4.2 4.6h15.6c1.55 0 2.8 1.25 2.8 2.8v7.9c0 1.55-1.25 2.8-2.8 2.8h-6.6l-4.3 3.2c-.62.46-1.5.02-1.5-.75V18.1H4.2c-1.55 0-2.8-1.25-2.8-2.8V7.4c0-1.55 1.25-2.8 2.8-2.8Z" stroke="#FFFFFF" stroke-width="1.8" stroke-linejoin="round"/>
        <g transform="translate(12 11.35) scale(0.42) translate(-12 -12)">
            <path d="M12 2C12.4 7.2 16.8 11.6 22 12C16.8 12.4 12.4 16.8 12 22C11.6 16.8 7.2 12.4 2 12C7.2 11.6 11.6 7.2 12 2Z" fill="#FFFFFF"/>
        </g>
    </svg>`;
    const BTN_ICON_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BTN_ICON_SVG)}`;

    const MENU_CSS = `
/* One visual language across the three surfaces: the popup, the Settings page and this menu.
   The tokens mirror popup.css; light or dark follows the uiTheme setting (auto = the machine). */
.cst-yt-menu, .cst-tr-panel {
    --cst-bg:rgba(31,30,27,.975); --cst-card:#282622; --cst-card-hover:#312E2A; --cst-soft:#23211E;
    --cst-text:#ECE8E1; --cst-text-2:#A8A39A; --cst-muted:#78736B;
    --cst-border:#3A3732; --cst-border-2:#48453F;
    --cst-accent:#D97757; --cst-accent-hover:#E08567; --cst-accent-soft:#33241F;
    --cst-accent-shadow:rgba(217,119,87,.35); --cst-warn:#E8B84B;
    --cst-shadow:0 18px 46px rgba(0,0,0,.55);
    --cst-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --cst-serif:"Newsreader","Tiempos Headline","Iowan Old Style",Charter,Georgia,serif;
    color-scheme:dark;       /* native controls (range track, select popup) follow the theme too */
}
.cst-yt-menu[data-cst-theme="light"], .cst-yt-menu[data-cst-theme="auto"],
.cst-tr-panel[data-cst-theme="light"], .cst-tr-panel[data-cst-theme="auto"] {
    --cst-bg:rgba(250,249,245,.985); --cst-card:#FFFFFF; --cst-card-hover:#F2EFE8; --cst-soft:#F6F4EE;
    --cst-text:#262420; --cst-text-2:#6B665E; --cst-muted:#969086;
    --cst-border:#E8E4DC; --cst-border-2:#DDD8CE;
    --cst-accent:#D97757; --cst-accent-hover:#C56646; --cst-accent-soft:#FAF1EC;
    --cst-accent-shadow:rgba(217,119,87,.22); --cst-warn:#B4791C;
    --cst-shadow:0 18px 46px rgba(38,36,32,.28);
    color-scheme:light;
}
@media (prefers-color-scheme: dark) {
    .cst-yt-menu[data-cst-theme="auto"], .cst-tr-panel[data-cst-theme="auto"] {
        --cst-bg:rgba(31,30,27,.975); --cst-card:#282622; --cst-card-hover:#312E2A; --cst-soft:#23211E;
        --cst-text:#ECE8E1; --cst-text-2:#A8A39A; --cst-muted:#78736B;
        --cst-border:#3A3732; --cst-border-2:#48453F;
        --cst-accent:#D97757; --cst-accent-hover:#E08567; --cst-accent-soft:#33241F;
        --cst-accent-shadow:rgba(217,119,87,.35); --cst-warn:#E8B84B;
        --cst-shadow:0 18px 46px rgba(0,0,0,.55);
        color-scheme:dark;
    }
}
.cst-yt-menu { position:absolute; bottom:58px; right:12px; width:340px; max-height:min(84%,600px); overflow-y:auto; overscroll-behavior:contain;
    background:var(--cst-bg); backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px);
    border:1px solid var(--cst-border); border-radius:18px; padding:16px 16px 14px;
    box-shadow:var(--cst-shadow); color:var(--cst-text); font:13px/1.45 var(--cst-sans);
    z-index:1000; user-select:none; scrollbar-width:thin; }
.cst-yt-menu * { box-sizing:border-box; }
.cst-menu-head { display:flex; align-items:center; gap:9px; padding:1px 2px 11px; }
.cst-menu-mark { flex-shrink:0; width:24px; height:24px; border-radius:8px; background:var(--cst-accent);
    display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px var(--cst-accent-shadow); }
.cst-menu-mark svg { width:15px; height:15px; display:block; }
.cst-menu-title { flex:1; font-family:var(--cst-serif); font-size:15.5px; font-weight:500; letter-spacing:-.2px; color:var(--cst-text); }
.cst-menu-x { background:none; border:none; color:var(--cst-muted); font-size:14px; line-height:1; cursor:pointer;
    padding:5px 7px; border-radius:8px; transition:background-color .18s ease,color .18s ease; }
.cst-menu-x:hover { color:var(--cst-text); background:var(--cst-card-hover); }
.cst-row { display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:10px 12px;
    border:1px solid var(--cst-border); border-radius:12px; background:var(--cst-card); color:var(--cst-text);
    font:inherit; cursor:pointer; margin-bottom:8px; transition:background-color .18s ease,border-color .18s ease; }
.cst-row:hover { background:var(--cst-card-hover); border-color:var(--cst-border-2); }
.cst-row[aria-disabled="true"] { opacity:.55; cursor:default; }
.cst-row-label { flex:1; font-weight:500; font-size:13px; }
.cst-row-sub { display:block; font-weight:400; font-size:11.5px; color:var(--cst-text-2); margin-top:3px; }
.cst-kbd { flex-shrink:0; font-family:var(--cst-sans); font-size:10.5px; color:var(--cst-text-2);
    border:1px solid var(--cst-border); background:var(--cst-soft); border-radius:4px; padding:2px 6px; }
.cst-sw { flex-shrink:0; width:36px; height:20px; border-radius:999px; background:var(--cst-border-2);
    position:relative; transition:background-color .22s cubic-bezier(.16,1,.3,1); }
.cst-sw::after { content:""; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%;
    background:#FFFFFF; box-shadow:0 1px 3px rgba(0,0,0,.18); transition:transform .25s cubic-bezier(.34,1.56,.64,1); }
.cst-row[aria-checked="true"] .cst-sw { background:var(--cst-accent); }
.cst-row[aria-checked="true"] .cst-sw::after { transform:translateX(16px); }
.cst-sep { height:1px; background:var(--cst-border); margin:10px 2px; }
.cst-field { padding:0 2px 10px; }
.cst-field-label { font-size:11px; letter-spacing:.2px; text-transform:uppercase; color:var(--cst-muted); margin-bottom:7px; }
.cst-seg { display:flex; gap:3px; padding:3px; border-radius:999px; background:var(--cst-soft); border:1px solid var(--cst-border); }
.cst-seg button { flex:1; padding:6px 0; border-radius:999px; border:none; background:none; color:var(--cst-text-2);
    font:inherit; font-size:12.5px; cursor:pointer; transition:background-color .18s ease,color .18s ease; }
.cst-seg button:hover { color:var(--cst-text); }
.cst-seg button[aria-pressed="true"] { background:var(--cst-card); color:var(--cst-text); font-weight:600;
    box-shadow:0 1px 3px rgba(0,0,0,.18); }
.cst-select { width:100%; padding:9px 10px; border-radius:8px; border:1px solid var(--cst-border);
    background:var(--cst-card); color:var(--cst-text); font:inherit; font-size:13px; cursor:pointer; }
.cst-select:hover { border-color:var(--cst-border-2); }
.cst-select option, .cst-select optgroup { background:var(--cst-card); color:var(--cst-text); }
.cst-note-line { padding:0 2px 10px; font-size:11.5px; line-height:1.45; color:var(--cst-warn); }
.cst-menu-foot { display:flex; gap:8px; margin-top:14px; padding-top:14px; border-top:1px solid var(--cst-border); }
.cst-menu-foot button { flex:1; padding:9px 0; border-radius:8px; border:1px solid var(--cst-border);
    background:var(--cst-soft); color:var(--cst-text); font:inherit; font-size:13px; font-weight:500; cursor:pointer;
    transition:background-color .18s ease,border-color .18s ease; }
.cst-menu-foot button:hover { background:var(--cst-card-hover); border-color:var(--cst-border-2); }
.cst-yt-menu :focus-visible, .cst-tr-panel :focus-visible { outline:2px solid var(--cst-accent); outline-offset:2px; }

/* ---- Transcript panel: the talk as text, beside the picture ---- */
.cst-tr-panel { position:absolute; top:12px; right:12px; bottom:76px; width:min(392px,44%);
    display:flex; flex-direction:column; gap:8px; padding:12px;
    background:var(--cst-bg); backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px);
    border:1px solid var(--cst-border); border-radius:16px; box-shadow:var(--cst-shadow);
    color:var(--cst-text); font:13px/1.45 var(--cst-sans); z-index:62; user-select:text; }
.cst-tr-panel * { box-sizing:border-box; }
.cst-tr-head { display:flex; align-items:center; gap:8px; }
.cst-tr-title { flex:1; font-family:var(--cst-serif); font-size:15px; font-weight:500; letter-spacing:-.2px; }
.cst-tr-act { flex-shrink:0; padding:5px 10px; border-radius:8px; border:1px solid var(--cst-border);
    background:var(--cst-soft); color:var(--cst-text); font:inherit; font-size:12px; font-weight:500; cursor:pointer;
    transition:background-color .18s ease,border-color .18s ease; }
.cst-tr-act:hover { background:var(--cst-card-hover); border-color:var(--cst-border-2); }
.cst-tr-search { width:100%; padding:7px 10px; border-radius:8px; border:1px solid var(--cst-border);
    background:var(--cst-card); color:var(--cst-text); font:inherit; font-size:12.5px; }
.cst-tr-search::placeholder { color:var(--cst-muted); }
.cst-tr-list { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:2px; padding-right:2px; }
.cst-tr-row { display:flex; gap:9px; width:100%; text-align:left; padding:7px 9px; border:1px solid transparent;
    border-radius:10px; background:none; color:var(--cst-text); font:inherit; cursor:pointer;
    transition:background-color .15s ease,border-color .15s ease; }
.cst-tr-row:hover { background:var(--cst-card-hover); }
.cst-tr-row[data-cst-now="1"] { background:var(--cst-accent-soft); border-color:var(--cst-accent); }
.cst-tr-time { flex-shrink:0; width:42px; font-size:11.5px; color:var(--cst-muted); padding-top:1px; font-variant-numeric:tabular-nums; }
.cst-tr-text { flex:1; display:flex; flex-direction:column; gap:2px; }
.cst-tr-vi { font-size:13px; }
.cst-tr-en { font-size:11.5px; color:var(--cst-text-2); }
.cst-tr-meta { font-size:11.5px; color:var(--cst-muted); letter-spacing:.2px; margin-top:-4px; font-variant-numeric:tabular-nums; }
.cst-tr-panel .cst-tr-list { gap:0; }
.cst-tr-panel .cst-tr-row { padding:9px 10px 9px 12px; border:none; border-left:2px solid transparent; border-radius:0 10px 10px 0; }
.cst-tr-panel .cst-tr-row + .cst-tr-row { background-image:linear-gradient(var(--cst-border),var(--cst-border)); background-size:calc(100% - 12px) 1px; background-position:12px 0; background-repeat:no-repeat; }
.cst-tr-panel .cst-tr-row[data-cst-now="1"] { background:var(--cst-accent-soft); border-left-color:var(--cst-accent); }
.cst-tr-panel .cst-tr-time { width:40px; padding-top:2px; font-size:11px; letter-spacing:.3px; }
.cst-tr-panel .cst-tr-vi { font-size:13.5px; line-height:1.55; }
.cst-tr-panel .cst-tr-en { font-family:var(--cst-serif); font-style:italic; font-size:12.5px; line-height:1.45; }
.cst-tr-row { position:relative; }
.cst-tr-edit { flex-shrink:0; align-self:flex-start; width:26px; height:26px; margin:-2px -4px 0 0; border-radius:8px;
    border:none; background:none; color:var(--cst-muted); font-size:13px; line-height:1; cursor:pointer; opacity:0;
    transition:opacity .15s ease,background-color .15s ease,color .15s ease; }
.cst-tr-row:hover .cst-tr-edit, .cst-tr-row:focus-within .cst-tr-edit, .cst-tr-edit:focus-visible { opacity:1; }
.cst-tr-edit:hover { background:var(--cst-card-hover); color:var(--cst-text); }
.cst-tr-row[data-cst-editing="1"] .cst-tr-edit { display:none; }
.cst-tr-row[data-cst-editing="1"] { background:var(--cst-card); border-color:var(--cst-border-2); cursor:default; }
.cst-tr-mark { display:block; margin-top:3px; font-size:10px; font-weight:600; letter-spacing:.2px; color:var(--cst-accent); }
.cst-tr-form { display:flex; flex-direction:column; gap:6px; }
.cst-tr-input { width:100%; min-height:52px; resize:vertical; padding:7px 9px; border-radius:8px;
    border:1px solid var(--cst-accent); background:var(--cst-soft); color:var(--cst-text); font:inherit; font-size:13px; line-height:1.45; }
.cst-tr-panel .cst-tr-input:focus-visible { outline:none; box-shadow:0 0 0 3px var(--cst-accent-shadow); }
.cst-tr-acts { display:flex; flex-wrap:wrap; gap:6px; }
.cst-tr-save { padding:5px 12px; border-radius:8px; border:none; background:var(--cst-accent); color:#FFFFFF;
    font:inherit; font-size:12px; font-weight:600; cursor:pointer; transition:background-color .18s ease; }
.cst-tr-save:hover { background:var(--cst-accent-hover); }
.cst-tr-empty { padding:14px 4px; font-size:12.5px; color:var(--cst-text-2); text-align:center; }
/* ---- Sections: a serif title and a hairline, like a chapter heading in a book ---- */
.cst-sec { display:flex; align-items:center; gap:10px; margin:14px 2px 10px; }
.cst-sec:first-of-type { margin-top:4px; }
.cst-sec-title { font-family:var(--cst-serif); font-size:13.5px; font-style:italic; letter-spacing:.1px; color:var(--cst-text-2); }
.cst-sec::after { content:""; flex:1; height:1px; background:var(--cst-border); }
/* ---- Quick controls: subtitle size stepper and volume sliders ---- */
.cst-step { display:flex; align-items:center; gap:6px; }
.cst-step button { flex-shrink:0; width:36px; height:30px; border-radius:8px; border:1px solid var(--cst-border);
    background:var(--cst-soft); color:var(--cst-text); font:inherit; font-size:13px; font-weight:600; cursor:pointer;
    transition:background-color .18s ease,border-color .18s ease; }
.cst-step button:hover { background:var(--cst-card-hover); border-color:var(--cst-border-2); }
.cst-step button:disabled { opacity:.4; cursor:default; }
.cst-step-val { flex:1; text-align:center; font-size:13px; font-weight:600; font-variant-numeric:tabular-nums; }
.cst-range-head { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:5px; }
.cst-range-head .cst-field-label { margin-bottom:0; }
.cst-range-val { font-size:11.5px; color:var(--cst-text-2); font-variant-numeric:tabular-nums; }
.cst-range { -webkit-appearance:none; appearance:none; width:100%; height:4px; margin:6px 0; border-radius:999px; cursor:pointer;
    background:linear-gradient(to right,var(--cst-accent) var(--cst-fill,50%),var(--cst-border-2) var(--cst-fill,50%)); }
.cst-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:16px; height:16px; border-radius:50%;
    background:#FFFFFF; border:2px solid var(--cst-accent); box-shadow:0 1px 4px rgba(0,0,0,.3); }
.cst-range::-moz-range-thumb { width:12px; height:12px; border-radius:50%; background:#FFFFFF; border:2px solid var(--cst-accent); }
.cst-health { display:block; margin-top:3px; font-size:11.5px; color:var(--cst-text-2); }
.cst-health[data-warn="1"] { color:var(--cst-warn); }
@media (max-width: 720px) { .cst-tr-panel { width:min(392px,72%); bottom:64px; } }
/* ---- Motion: short and soft, and none at all for "reduce motion" ---- */
@keyframes cst-pop-in { from { opacity:0; transform:translateY(8px) scale(.985); } to { opacity:1; transform:none; } }
@keyframes cst-pop-out { from { opacity:1; transform:none; } to { opacity:0; transform:translateY(6px) scale(.99); } }
@keyframes cst-slide-in { from { opacity:0; transform:translateX(14px); } to { opacity:1; transform:none; } }
@keyframes cst-slide-out { from { opacity:1; transform:none; } to { opacity:0; transform:translateX(10px); } }
.cst-yt-menu { transform-origin:bottom right; animation:cst-pop-in .2s cubic-bezier(.16,1,.3,1) both; }
.cst-yt-menu[data-cst-leaving] { animation:cst-pop-out .13s ease-in both; pointer-events:none; }
.cst-tr-panel { animation:cst-slide-in .24s cubic-bezier(.16,1,.3,1) both; }
.cst-tr-panel[data-cst-leaving] { animation:cst-slide-out .15s ease-in both; pointer-events:none; }
@media (prefers-reduced-motion: reduce) {
    .cst-yt-menu *, .cst-yt-menu *::after { transition-duration:.001ms !important; }
    .cst-yt-menu, .cst-tr-panel, .cst-yt-menu[data-cst-leaving], .cst-tr-panel[data-cst-leaving] { animation:none !important; }
}
`;

    function napCss(doc) {
        if (!doc || doc.getElementById("cst-yt-menu-css")) return;
        const st = doc.createElement("style");
        st.id = "cst-yt-menu-css";
        st.textContent = MENU_CSS;
        (doc.head || doc.documentElement).appendChild(st);
    }

    // The badge inside the button: accent square, the mark painted on it, a status dot on top.
    function badgeCss(size) {
        return `width:${size}px;height:${size}px;border-radius:9px;background-color:#D97757;` +
            `background-image:url("${BTN_ICON_URL}");background-repeat:no-repeat;background-position:center;` +
            `background-size:${Math.round(size * 0.63)}px ${Math.round(size * 0.63)}px;` +
            `box-shadow:0 2px 8px rgba(217, 119, 87, 0.45);` +
            `transition:transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;`;
    }

    function dotCss(size) {
        return `display:none;position:absolute;top:${Math.round(size * 0.17)}px;right:${Math.round(size * 0.17)}px;` +
            `width:8px;height:8px;border-radius:50%;background:#22C55E;border:1.5px solid #1F1E1B;` +
            `box-shadow:0 0 4px rgba(34, 197, 94, 0.8);`;
    }

    // doc: the document to build in. size: the badge's side in px (the control bars differ).
    function taoNut(doc, { size = 30, title = "", className = "", onClick, onDblClick } = {}) {
        const btn = doc.createElement("button");
        btn.type = "button";
        if (className) btn.className = className;
        btn.setAttribute("title", title);
        btn.setAttribute("aria-label", title);
        btn.style.cssText = "position:relative;display:inline-flex;align-items:center;justify-content:center;" +
            "cursor:pointer;border:none;background:transparent;padding:0;outline:none;flex-shrink:0;";
        const badge = doc.createElement("div");
        badge.className = "cst-btn-badge";
        badge.style.cssText = badgeCss(size);
        const dot = doc.createElement("span");
        dot.className = "cst-btn-dot";
        dot.style.cssText = dotCss(size);
        btn.appendChild(badge);
        btn.appendChild(dot);
        btn.addEventListener("mouseenter", () => {
            badge.style.transform = "scale(1.08)";
            badge.style.boxShadow = "0 4px 14px rgba(217, 119, 87, 0.55)";
        });
        btn.addEventListener("mouseleave", () => {
            badge.style.transform = "scale(1)";
            badge.style.boxShadow = btn.dataset.cstOn === "1"
                ? "0 0 12px rgba(217, 119, 87, 0.75)" : "0 2px 8px rgba(217, 119, 87, 0.45)";
        });
        if (onClick) btn.addEventListener("click", e => { e.stopPropagation(); e.preventDefault(); onClick(e); });
        if (onDblClick) btn.addEventListener("dblclick", e => { e.stopPropagation(); e.preventDefault(); onDblClick(e); });
        return btn;
    }

    // Two states only, the same two the popup shows: amber while it works, green while it is on.
    // What exactly is on goes in the title, where a screen reader can read it.
    function datTrangThai(btn, { busy = false, on = false, title = "" } = {}) {
        if (!btn) return;
        const badge = btn.querySelector(".cst-btn-badge");
        const dot = btn.querySelector(".cst-btn-dot");
        btn.dataset.cstOn = on ? "1" : "0";
        btn.setAttribute("aria-pressed", String(!!on));
        if (title) {
            btn.setAttribute("title", title);
            btn.setAttribute("aria-label", title);
        }
        if (dot) {
            const mau = busy ? "#E8B84B" : on ? "#22C55E" : null;
            dot.style.display = mau ? "block" : "none";
            if (mau) {
                dot.style.backgroundColor = mau;
                dot.style.boxShadow = `0 0 5px ${mau}`;
            }
        }
        if (badge) {
            badge.style.backgroundColor = on ? "#E08567" : "#D97757";   // never the shorthand: it drops the icon
            badge.style.boxShadow = on ? "0 0 12px rgba(217, 119, 87, 0.75)" : "0 2px 8px rgba(217, 119, 87, 0.45)";
        }
    }

    // A section heading inside the quick menu ("Phụ đề", "Giọng đọc")
    function buildSection(doc, title) {
        const h = doc.createElement("div");
        h.className = "cst-sec";
        h.setAttribute("role", "heading");
        h.setAttribute("aria-level", "3");
        const t = doc.createElement("span");
        t.className = "cst-sec-title";
        t.textContent = title;
        h.appendChild(t);
        return h;
    }

    // [-] value [+] for a number the viewer nudges often (subtitle size). get() reads the current
    // value, set(n) stores it; the stepper clamps and redraws itself.
    function buildStepper(doc, { label, get, set, min, max, step, format }) {
        const box = doc.createElement("div");
        box.className = "cst-field";
        const head = doc.createElement("div");
        head.className = "cst-field-label";
        head.textContent = label;
        box.appendChild(head);
        const row = doc.createElement("div");
        row.className = "cst-step";
        const minus = doc.createElement("button");
        const plus = doc.createElement("button");
        const val = doc.createElement("span");
        val.className = "cst-step-val";
        val.setAttribute("aria-live", "polite");
        minus.type = plus.type = "button";
        minus.textContent = "A−";
        plus.textContent = "A+";
        minus.setAttribute("aria-label", `Giảm ${label.toLowerCase()}`);
        plus.setAttribute("aria-label", `Tăng ${label.toLowerCase()}`);
        row.appendChild(minus);
        row.appendChild(val);
        row.appendChild(plus);
        box.appendChild(row);
        const refresh = () => {
            const n = Number(get());
            val.textContent = format ? format(n) : String(n);
            minus.disabled = n <= min;
            plus.disabled = n >= max;
        };
        const nudge = dir => {
            const n = Math.min(max, Math.max(min, Math.round((Number(get()) + dir * step) / step) * step));
            Promise.resolve(set(n)).then(refresh, refresh);
            refresh();
        };
        minus.addEventListener("click", () => nudge(-1));
        plus.addEventListener("click", () => nudge(1));
        refresh();
        return { el: box, refresh };
    }

    // A labelled range input that stores on release and shows its value while dragging.
    function buildSlider(doc, { label, get, set, min, max, step, format }) {
        const box = doc.createElement("div");
        box.className = "cst-field";
        const head = doc.createElement("div");
        head.className = "cst-range-head";
        const name = doc.createElement("span");
        name.className = "cst-field-label";
        name.textContent = label;
        const val = doc.createElement("span");
        val.className = "cst-range-val";
        head.appendChild(name);
        head.appendChild(val);
        const input = doc.createElement("input");
        input.type = "range";
        input.className = "cst-range";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.setAttribute("aria-label", label);
        box.appendChild(head);
        box.appendChild(input);
        const show = n => {
            val.textContent = format ? format(n) : String(n);
            // the filled part of the track: drawn by us, so it matches the theme in light and dark
            const fill = `${Math.round((n - min) / Math.max(1e-9, max - min) * 100)}%`;
            if (input.style.setProperty) input.style.setProperty("--cst-fill", fill);
        };
        const refresh = () => {
            if (doc.activeElement === input) return;          // do not yank the thumb mid-drag
            const n = Number(get());
            input.value = String(n);
            show(n);
        };
        input.addEventListener("input", () => show(Number(input.value)));
        input.addEventListener("change", () => set(Number(input.value)));
        refresh();
        return { el: box, refresh, input };
    }

    // The two volume sliders every dubbing viewer reaches for: the Vietnamese voice, and how far the
    // original is turned down under it. Same storage keys and ranges as the Settings page;
    // dubbing.js's storage listener applies a change while the voice is playing.
    function buildVolumeControls(doc) {
        const vol = { dubVolume: 1, dubDuck: 0.2 };
        const pct = n => `${Math.round(n)}%`;
        const store = obj => { try { return chrome.storage.sync.set(obj); } catch (e) { return null; } };
        const box = doc.createElement("div");
        const voice = buildSlider(doc, {
            label: "Âm lượng giọng", min: 40, max: 100, step: 5, format: pct,
            get: () => Math.round(vol.dubVolume * 100),
            set: n => { vol.dubVolume = n / 100; return store({ dubVolume: vol.dubVolume }); }
        });
        const duck = buildSlider(doc, {
            label: "Tiếng gốc khi đọc", min: 0, max: 60, step: 5, format: n => (n ? pct(n) : "tắt hẳn"),
            get: () => Math.round(vol.dubDuck * 100),
            set: n => { vol.dubDuck = n / 100; return store({ dubDuck: vol.dubDuck }); }
        });
        box.appendChild(voice.el);
        box.appendChild(duck.el);
        const refresh = () => { voice.refresh(); duck.refresh(); };
        try {
            chrome.storage.sync.get({ dubVolume: 1, dubDuck: 0.2 }, r => {
                const L = root.CST_DUB && root.CST_DUB.level;
                vol.dubVolume = L ? L(r && r.dubVolume, 1) : Number(r && r.dubVolume) || 1;
                vol.dubDuck = L ? L(r && r.dubDuck, 0.2) : Number(r && r.dubDuck);
                refresh();
            });
        } catch (e) { /* no extension context */ }
        return { el: box, refresh };
    }

    // Remove a menu or panel after a short exit animation. Marked data-cst-leaving at once, so a
    // lookup for "the open menu" can skip it; removed right away where there is no animation to
    // wait for (reduced motion, or a test harness without matchMedia).
    function dismiss(el) {
        if (!el || el.dataset.cstLeaving) return;
        const w = typeof window !== "undefined" ? window : null;
        const still = !w || !w.matchMedia || w.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (still) { el.remove(); return; }
        el.dataset.cstLeaving = "1";
        setTimeout(() => el.remove(), 170);
    }

    // Tab and Shift+Tab go round inside an open quick menu instead of falling behind the player.
    // Every focusable control counts, the range sliders too (the YouTube menu listed buttons and
    // selects only, so Tab left from the volume slider; the Coursera menu had no loop at all).
    // Returns true when it moved the focus.
    function trapTab(menu, e, doc) {
        const d = doc || (typeof document !== "undefined" ? document : null);
        if (!d || e.key !== "Tab" || !menu.contains(d.activeElement)) return false;
        const items = [...menu.querySelectorAll("button, select, input, textarea, [tabindex]:not([tabindex='-1'])")]
            .filter(x => !x.disabled && x.getAttribute("aria-disabled") !== "true" && !x.hidden && x.getClientRects().length > 0);
        if (!items.length) return false;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); return true; }
        if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); return true; }
        return false;
    }

    root.CST_PLAYER_UI = { MARK_SVG, BTN_ICON_SVG, BTN_ICON_URL, MENU_CSS, napCss, taoNut, datTrangThai, buildStepper, buildSlider, buildVolumeControls, buildSection, dismiss, trapTab };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) module.exports = globalThis.CST_PLAYER_UI;

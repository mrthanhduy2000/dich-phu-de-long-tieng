// Keyboard shortcuts the viewer sets (2.5.7). None is set out of the box: Settings has a
// "Tùy chỉnh" button per action that records the next key combination. Shared by the content
// scripts (content.js listens for the keys on YouTube and Coursera), the Settings page and the popup.
//
// Storage: chrome.storage.sync "shortcuts" -> { "<action>": { code, ctrl, alt, shift, meta } }.
// `code` is the physical key (KeyboardEvent.code), not the character: on a Mac, Option+S types "ß"
// and a Vietnamese input method rewrites letters, but the code stays "KeyS". The same stored
// combination reads as "⌥S" on a Mac and "Alt+S" on Windows.
(function (root) {
    "use strict";

    const KEY = "shortcuts";
    const ACTIONS = [
        { id: "bat-tat-phu-de", label: "Bật/tắt phụ đề tiếng Việt" },
        { id: "bat-tat-long-tieng", label: "Bật/tắt lồng tiếng Việt" },
        { id: "mo-bang-dieu-khien", label: "Mở bảng điều khiển trên video" }
    ];

    function isMac(nav) {
        const n = nav || root.navigator || {};
        const p = (n.userAgentData && n.userAgentData.platform) || n.platform || n.userAgent || "";
        return /mac|iphone|ipad/i.test(p);
    }

    const NAMED = {
        Space: "Space", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Escape: "Esc",
        ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Home: "Home", End: "End",
        PageUp: "PageUp", PageDown: "PageDown", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
        Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`"
    };
    function keyLabel(code) {
        const c = String(code || "");
        if (/^Key[A-Z]$/.test(c)) return c.slice(3);
        if (/^Digit\d$/.test(c)) return c.slice(5);
        if (/^Numpad\d$/.test(c)) return "Num " + c.slice(6);
        if (/^F\d{1,2}$/.test(c)) return c;
        return NAMED[c] || c;
    }

    const MODIFIER_CODES = /^(?:Shift|Control|Alt|Meta|OS)(?:Left|Right)?$|^(?:CapsLock|Fn|FnLock)$/;
    const isFKey = code => /^F([1-9]|1[0-2])$/.test(code);

    // A combination from a keydown, or null for a lone modifier
    function fromEvent(e) {
        if (!e || !e.code || MODIFIER_CODES.test(e.code)) return null;
        return { code: e.code, ctrl: !!e.ctrlKey, alt: !!e.altKey, shift: !!e.shiftKey, meta: !!e.metaKey };
    }

    function format(combo, mac = isMac()) {
        if (!combo || !combo.code) return "";
        const k = keyLabel(combo.code);
        if (mac) return (combo.ctrl ? "⌃" : "") + (combo.alt ? "⌥" : "") + (combo.shift ? "⇧" : "") + (combo.meta ? "⌘" : "") + k;
        return [combo.ctrl && "Ctrl", combo.alt && "Alt", combo.shift && "Shift", combo.meta && "Win", k].filter(Boolean).join("+");
    }

    const same = (a, b) => !!a && !!b && a.code === b.code && !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt && !!a.shift === !!b.shift && !!a.meta === !!b.meta;
    const matches = (e, combo) => same(fromEvent(e), combo);

    // Keys the browser or the system keeps for itself (closing a tab, quitting, the address bar):
    // a page never sees them, or taking them would surprise the viewer
    const RESERVED = [
        ["meta", "KeyW"], ["meta", "KeyQ"], ["meta", "KeyT"], ["meta", "KeyN"], ["meta", "KeyR"], ["meta", "KeyL"],
        ["meta", "KeyH"], ["meta", "KeyM"], ["meta", "Tab"], ["meta", "KeyC"], ["meta", "KeyV"], ["meta", "KeyX"],
        ["meta", "KeyA"], ["meta", "KeyZ"], ["meta", "KeyF"], ["meta", "KeyP"], ["meta", "KeyS"], ["meta", "Space"],
        ["ctrl", "KeyW"], ["ctrl", "KeyT"], ["ctrl", "KeyN"], ["ctrl", "KeyR"], ["ctrl", "KeyL"], ["ctrl", "Tab"],
        ["ctrl", "KeyC"], ["ctrl", "KeyV"], ["ctrl", "KeyX"], ["ctrl", "KeyA"], ["ctrl", "KeyZ"], ["ctrl", "KeyF"],
        ["ctrl", "KeyP"], ["ctrl", "KeyS"], ["alt", "F4"], ["alt", "Tab"]
    ];

    // Why a combination cannot be used, in Vietnamese for the Settings page, or "" when it can.
    // others: { action: combo } already set; action: the one being set.
    function problem(combo, others = {}, action = "", mac = isMac()) {
        if (!combo) return "Hãy bấm thêm một phím chữ hoặc số cùng phím bổ trợ.";
        const mods = combo.ctrl || combo.alt || combo.meta;
        if (!mods && !isFKey(combo.code)) {
            return mac ? "Cần giữ thêm ⌘ Command, ⌥ Option hoặc ⌃ Control: phím đơn sẽ trùng phím tắt của YouTube và khi gõ chữ."
                : "Cần giữ thêm Ctrl hoặc Alt: phím đơn sẽ trùng phím tắt của YouTube và khi gõ chữ.";
        }
        const only = m => ["ctrl", "alt", "meta"].every(k => !!combo[k] === (k === m)) && !combo.shift;
        if (RESERVED.some(([m, code]) => code === combo.code && only(m))) return `${format(combo, mac)} là phím của trình duyệt, hãy chọn tổ hợp khác.`;
        for (const a of ACTIONS) {
            if (a.id !== action && same(others[a.id], combo)) return `${format(combo, mac)} đang dùng cho "${a.label}".`;
        }
        return "";
    }

    // Stored value -> only well-formed combinations of known actions
    function clean(stored) {
        const out = {};
        for (const a of ACTIONS) {
            const c = stored && stored[a.id];
            if (c && typeof c.code === "string" && c.code && !MODIFIER_CODES.test(c.code)) {
                out[a.id] = { code: c.code, ctrl: !!c.ctrl, alt: !!c.alt, shift: !!c.shift, meta: !!c.meta };
            }
        }
        return out;
    }

    // The action a keydown asks for, or "" (typing in a field never counts)
    function actionFor(e, map) {
        const t = e && e.target;
        if (t && (t.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""))) return "";
        for (const a of ACTIONS) if (map && matches(e, map[a.id])) return a.id;
        return "";
    }

    const api = { KEY, ACTIONS, isMac, keyLabel, fromEvent, format, matches, problem, clean, actionFor };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_SHORTCUTS = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

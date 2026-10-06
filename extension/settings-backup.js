// ============================================================
// Settings backup: every setting (chrome.storage.sync) plus the viewer's own line corrections
// (storage.local "edits:*") in one JSON file, and back again.
//
// Why it exists: removing the extension and loading it unpacked again makes Chrome create a new
// settings store, and the Gemini API key, voices, glossary lists and corrections are gone. Caches
// (translations, audio, cost ledger, model probes) are left out: they rebuild on their own.
// Pure functions only; options.js does the file and storage work.
// ============================================================
(function (root) {
    "use strict";

    const FORMAT = "cst-settings-backup";
    const FORMAT_VERSION = 1;
    const SECRET_KEYS = ["geminiApiKey"];
    const LOCAL_PREFIXES = ["edits:"];
    const MAX_FILE_CHARS = 5 * 1024 * 1024;

    const keyOk = k => typeof k === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(k);
    const localKeyOk = k => typeof k === "string" && k.length <= 512 && LOCAL_PREFIXES.some(p => k.startsWith(p));

    // sync, local: what chrome.storage returned. opts.includeKey: keep the Gemini API key.
    function buildBackup(sync, local, opts = {}) {
        const s = {};
        for (const [k, v] of Object.entries(sync || {})) {
            if (!keyOk(k) || v === undefined) continue;
            if (!opts.includeKey && SECRET_KEYS.includes(k)) continue;
            s[k] = v;
        }
        const l = {};
        for (const [k, v] of Object.entries(local || {})) if (localKeyOk(k) && v != null) l[k] = v;
        return {
            format: FORMAT,
            version: FORMAT_VERSION,
            app: opts.appVersion || "",
            exported: opts.now || new Date().toISOString(),
            hasKey: !!(opts.includeKey && s.geminiApiKey),
            sync: s,
            local: l
        };
    }

    // Returns { ok, sync, local, summary } or { ok: false, error } with a message for the viewer.
    function parseBackup(text) {
        if (typeof text !== "string" || !text.trim()) return { ok: false, error: "Tệp trống." };
        if (text.length > MAX_FILE_CHARS) return { ok: false, error: "Tệp quá lớn, không phải tệp sao lưu của tiện ích." };
        let data;
        try { data = JSON.parse(text); } catch (e) { return { ok: false, error: "Tệp không đúng định dạng JSON." }; }
        if (!data || data.format !== FORMAT || typeof data.sync !== "object" || !data.sync) {
            return { ok: false, error: "Đây không phải tệp sao lưu cài đặt của tiện ích này." };
        }
        if (Number(data.version) > FORMAT_VERSION) {
            return { ok: false, error: "Tệp sao lưu được tạo bởi phiên bản mới hơn. Hãy cập nhật tiện ích trước." };
        }
        const sync = {};
        for (const [k, v] of Object.entries(data.sync)) if (keyOk(k) && v !== undefined && v !== null) sync[k] = v;
        const local = {};
        for (const [k, v] of Object.entries(data.local || {})) if (localKeyOk(k) && v && typeof v === "object") local[k] = v;
        const edits = Object.values(local).reduce((n, v) => n + Object.keys((v && v.lines) || {}).length, 0);
        return {
            ok: true, sync, local,
            summary: { settings: Object.keys(sync).length, hasKey: typeof sync.geminiApiKey === "string" && !!sync.geminiApiKey,
                videos: Object.keys(local).length, edits, app: String(data.app || ""), exported: String(data.exported || "") }
        };
    }

    function fileName(now) {
        const d = now || new Date();
        const p = n => String(n).padStart(2, "0");
        return `cst-cai-dat-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
    }

    const api = { FORMAT, FORMAT_VERSION, buildBackup, parseBackup, fileName };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_BACKUP = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

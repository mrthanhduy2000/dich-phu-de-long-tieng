// ============================================================
// Settings backup: every setting (chrome.storage.sync) in one JSON file, and back again.
//
// Why it exists: removing the extension and loading it unpacked again makes Chrome create a new
// settings store, and the Gemini API key, voices and glossary lists are gone. Caches (translations,
// audio, cost ledger, model probes) are left out: they rebuild on their own. Files from before 2.5.6
// may hold "local" (hand-corrected lines, a feature removed in 2.5.6): it is ignored.
// Pure functions only; options.js does the file and storage work.
// ============================================================
(function (root) {
    "use strict";

    const FORMAT = "cst-settings-backup";
    const FORMAT_VERSION = 1;
    const SECRET_KEYS = ["geminiApiKey"];
    const MAX_FILE_CHARS = 5 * 1024 * 1024;

    const keyOk = k => typeof k === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(k);

    // sync: what chrome.storage.sync returned. opts.includeKey: keep the Gemini API key.
    function buildBackup(sync, opts = {}) {
        const s = {};
        for (const [k, v] of Object.entries(sync || {})) {
            if (!keyOk(k) || v === undefined) continue;
            if (!opts.includeKey && SECRET_KEYS.includes(k)) continue;
            s[k] = v;
        }
        return {
            format: FORMAT,
            version: FORMAT_VERSION,
            app: opts.appVersion || "",
            exported: opts.now || new Date().toISOString(),
            hasKey: !!(opts.includeKey && s.geminiApiKey),
            sync: s
        };
    }

    // Returns { ok, sync, summary } or { ok: false, error } with a message for the viewer.
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
        return {
            ok: true, sync,
            summary: { settings: Object.keys(sync).length, hasKey: typeof sync.geminiApiKey === "string" && !!sync.geminiApiKey,
                app: String(data.app || ""), exported: String(data.exported || "") }
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

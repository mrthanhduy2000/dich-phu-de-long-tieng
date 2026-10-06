/**
 * chrome-shim.js
 * Comprehensive Chrome Extension API compatibility bridge for web environment.
 * Enables popup.js, options.js, and content scripts to run seamlessly in the browser.
 */

(function () {
    if (typeof window === "undefined") return;

    // CRITICAL FIX: If running inside a REAL Chrome Extension, never overwrite native APIs!
    if (window.chrome && window.chrome.runtime && typeof window.chrome.runtime.id === "string" && window.chrome.runtime.id.length > 0) {
        console.log("[CST] Native Chrome Extension detected. Skipping web shim.");
        return;
    }

    const STORAGE_KEY = "cst_extension_storage_v8";

    // Load initial storage from localStorage
    function loadStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            console.warn("[Shim] Failed to read localStorage:", e);
            return {};
        }
    }

    function saveStorage(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            window.dispatchEvent(new CustomEvent("cst_storage_updated", { detail: data }));
        } catch (e) {
            console.warn("[Shim] Failed to write localStorage:", e);
        }
    }

    // Default values
    const defaultData = {
        dualMode: false,
        perCueMode: false,
        originalFirst: false,
        glossaryEnabled: true,
        userKeep: "",
        userNormalize: "",
        enabledGroups: ["tech", "academic", "cybersecurity", "sustainability", "realestate", "legal"],
        dubVoiceName: "",
        dubDuck: 0.12
    };

    // Ensure storage has defaults
    const current = loadStorage();
    let merged = { ...defaultData, ...current };
    saveStorage(merged);

    const listeners = [];

    const storageSync = {
        get: function (keys) {
            return new Promise((resolve) => {
                const store = loadStorage();
                if (typeof keys === "string") {
                    resolve({ [keys]: store[keys] !== undefined ? store[keys] : defaultData[keys] });
                } else if (Array.isArray(keys)) {
                    const res = {};
                    keys.forEach((k) => {
                        res[k] = store[k] !== undefined ? store[k] : defaultData[k];
                    });
                    resolve(res);
                } else if (typeof keys === "object" && keys !== null) {
                    const res = {};
                    for (const k in keys) {
                        res[k] = store[k] !== undefined ? store[k] : keys[k];
                    }
                    resolve(res);
                } else {
                    resolve({ ...defaultData, ...store });
                }
            });
        },
        set: function (items) {
            return new Promise((resolve) => {
                const store = loadStorage();
                const updated = { ...store, ...items };
                saveStorage(updated);
                resolve();
            });
        },
        // subtitle-edits.js drops a video's record once its last edit is reverted
        remove: function (keys) {
            return new Promise((resolve) => {
                const store = loadStorage();
                (Array.isArray(keys) ? keys : [keys]).forEach(k => { delete store[k]; });
                saveStorage(store);
                resolve();
            });
        },
        clear: function () {
            return new Promise((resolve) => {
                saveStorage({});
                resolve();
            });
        }
    };

    const runtime = {
        lastError: null,
        onMessage: {
            addListener: function (fn) {
                listeners.push(fn);
            },
            removeListener: function (fn) {
                const idx = listeners.indexOf(fn);
                if (idx !== -1) listeners.splice(idx, 1);
            }
        },
        sendMessage: function (message, callback) {
            // Route to in-page listeners
            let handled = false;
            listeners.forEach((fn) => {
                try {
                    const res = fn(message, { id: "cst-web-shim" }, (resp) => {
                        if (callback) callback(resp);
                    });
                    if (res === true) handled = true;
                } catch (e) {
                    console.error("[Shim] Error in onMessage listener:", e);
                }
            });

            if (!handled && callback) {
                setTimeout(() => callback({ ok: true }), 0);
            }
            return true;
        },
        openOptionsPage: function () {
            window.dispatchEvent(new CustomEvent("cst_open_options"));
            const optTab = document.getElementById("tab-btn-options");
            if (optTab) optTab.click();
        }
    };

    const tabs = {
        query: function (queryInfo) {
            return Promise.resolve([
                {
                    id: 1,
                    url: window.location.href,
                    title: document.title,
                    active: true
                }
            ]);
        },
        sendMessage: function (tabId, message, callback) {
            return runtime.sendMessage(message, callback);
        }
    };

    const scripting = {
        executeScript: function () {
            return Promise.resolve([{ result: true }]);
        }
    };

    window.chrome = window.chrome || {};
    window.chrome.storage = window.chrome.storage || {};
    window.chrome.storage.sync = storageSync;
    window.chrome.storage.local = storageSync;
    window.chrome.runtime = runtime;
    window.chrome.tabs = tabs;
    window.chrome.scripting = scripting;

    console.log("[CST Shim] Chrome Extension APIs initialized for Web runtime.");
})();

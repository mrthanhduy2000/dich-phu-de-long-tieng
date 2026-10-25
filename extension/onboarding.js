// First-run page (opened by background.js on install). Own file so popup and options stay untouched.
(function () {
    const $ = id => document.getElementById(id);
    const send = msg => new Promise(resolve => {
        try {
            chrome.runtime.sendMessage(msg, r => resolve(chrome.runtime.lastError ? null : r));
        } catch (e) { resolve(null); }
    });
    const setStatus = (el, kind, text) => { el.className = "status" + (kind ? " " + kind : ""); el.textContent = text; };

    // Progress: a step's card and its stepper dot turn done together; the line counts the two set-up steps
    const STEPS = { key: { card: "stepKey", dot: "dotKey" }, voice: { card: "stepVoice", dot: "dotVoice" } };
    const done = { key: false, voice: false };
    function markDone(name, on) {
        done[name] = on;
        for (const id of [STEPS[name].card, STEPS[name].dot]) {
            const el = $(id);
            if (el) el.classList[on ? "add" : "remove"]("done");
        }
        const bar = $("stepper");
        if (bar) bar.dataset.done = String((done.key ? 1 : 0) + (done.voice ? 1 : 0));
    }

    // Plain Vietnamese reason for a failed key test
    function keyProblem(r) {
        if (!r) return "Không liên lạc được với tiện ích. Hãy bấm Reload ở chrome://extensions rồi thử lại.";
        switch (r.errorType) {
            case "auth": case "payment": case "precondition": return "Google không nhận khóa này. Kiểm tra đã sao chép đủ chuỗi chưa.";
            case "quota": case "rate_limit": return "Khóa hợp lệ nhưng đã hết lượt miễn phí tạm thời. Thử lại sau ít phút.";
            case "network": case "timeout": return "Không kết nối được tới Google. Kiểm tra mạng rồi thử lại.";
            default: return "Chưa dùng được khóa này: " + (r.error || "lỗi không rõ") + ".";
        }
    }

    async function testKey() {
        const key = $("apiKey").value.trim();
        const st = $("keyStatus"), btn = $("btnTest");
        if (!key) { setStatus(st, "err", "Chưa dán khóa."); $("apiKey").focus(); return; }
        btn.disabled = true;
        setStatus(st, "", "Đang kiểm tra...");
        const r = await send({ action: "testKey", key });
        btn.disabled = false;
        if (r && r.ok) {
            try { await chrome.storage.sync.set({ geminiApiKey: key }); } catch (e) { /* storage unavailable */ }
            setStatus(st, "ok", "Khóa hoạt động" + (r.model ? " (model " + r.model + ")" : "") + ", đã lưu.");
            markDone("key", true);
        } else {
            markDone("key", false);
            setStatus(st, "err", keyProblem(r));
        }
    }

    async function checkVoice() {
        const st = $("voiceStatus");
        setStatus(st, "", "Đang kiểm tra...");
        const r = await send({ action: "localTtsStatus" });
        const L = window.CST_COST && window.CST_COST.LOCAL_TTS;
        if (r && r.running) {
            setStatus(st, "ok", "Giọng VieNeu đang chạy trên máy này, sẵn sàng lồng tiếng.");
            $("voiceHelp").hidden = true;
            markDone("voice", true);
        } else {
            setStatus(st, "", "Chưa thấy giọng VieNeu. Không sao nếu bạn chỉ cần phụ đề.");
            if (L && L.startHint) $("voiceCmd").textContent = L.startHint();
            $("voiceHelp").hidden = false;
            markDone("voice", false);
        }
    }

    $("btnTest").addEventListener("click", testKey);
    $("apiKey").addEventListener("keydown", e => { if (e.key === "Enter") testKey(); });
    $("btnVoice").addEventListener("click", checkVoice);
    // A key saved earlier (reopening this page): show the step as done without echoing the key
    try {
        chrome.storage.sync.get({ geminiApiKey: "" }, c => {
            if (c && c.geminiApiKey) {
                markDone("key", true);
                setStatus($("keyStatus"), "ok", "Đã có khóa được lưu. Dán khóa mới nếu muốn đổi.");
            }
        });
    } catch (e) { /* ignore */ }
    checkVoice();
})();

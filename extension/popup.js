document.addEventListener("DOMContentLoaded", async () => {
    // Chrome chưa nạp lại tiện ích sau khi cập nhật file: báo rõ + nút nạp lại
    if (window.CST_VERSION_CHECK) window.CST_VERSION_CHECK.check(document, chrome, ".brand-badge", "body > *:first-child");

    const translateBtn = document.getElementById("translateBtn");
    const btnLabel = document.getElementById("btnLabel");
    const dualModeBox = document.getElementById("dualMode");
    const origFirstBox = document.getElementById("originalFirst");
    const dubbingBox = document.getElementById("dubbingMode");
    const subOptionsWrapper = document.getElementById("subOptionsWrapper");
    const statusContainer = document.getElementById("statusContainer");
    const statusIconWrap = document.getElementById("statusIconWrap");
    const statusEl = document.getElementById("status");
    const liveStatusText = document.getElementById("liveStatusText");
    // What the idle button says: "Dịch lại" once the page is translated (after a click too), so a
    // success or an error no longer puts back "Bắt đầu" on a page that already shows Vietnamese
    let idleLabel = btnLabel ? btnLabel.textContent : "";
    const setIdleLabel = t => { idleLabel = t; if (btnLabel && !translateBtn.classList.contains("is-translating") && !translateBtn.classList.contains("is-success")) btnLabel.textContent = t; };
    // What the page holds: a lecture on Coursera, a video anywhere else (most of what is watched)
    let noun = "video";

    // 1. Load saved settings from Chrome storage
    const saved = await chrome.storage.sync.get({
        dualMode: false,
        perCueMode: false,
        useAi: true,
        originalFirst: false,
        dubEnabled: true
    });

    dualModeBox.checked = Boolean(saved.dualMode);
    origFirstBox.checked = Boolean(saved.originalFirst);
    dubbingBox.checked = saved.dubEnabled !== false;

    // 2. Smooth Accordion Sub-options Transition
    function updateSubOptions(animate = true) {
        const isDual = dualModeBox.checked;
        if (isDual) {
            subOptionsWrapper.classList.add("expanded");
        } else {
            subOptionsWrapper.classList.remove("expanded");
        }
        origFirstBox.disabled = !isDual;
    }
    updateSubOptions(false);

    // 3. Settings Event Listeners with Immediate Storage Sync
    dualModeBox.addEventListener("change", () => {
        chrome.storage.sync.set({ dualMode: dualModeBox.checked });
        updateSubOptions(true);
    });


    origFirstBox.addEventListener("change", () => {
        chrome.storage.sync.set({ originalFirst: origFirstBox.checked });
    });

    dubbingBox.addEventListener("change", () => {
        // Ghi cài đặt là đủ: cả youtube.js lẫn content.js đều nghe storage.onChanged cho khóa này.
        // Trước đây còn gửi thêm tin nhắn "setOptions" mà KHÔNG file nào xử lý (việc thừa).
        chrome.storage.sync.set({ dubEnabled: dubbingBox.checked });
    });

    // 5. Trạng thái THẬT của trang đang xem (dịch tới đâu, đang đọc giọng nào)
    async function docTrangThaiTrang(tab) {
        if (!tab || !tab.id) return null;
        try {
            return await chrome.tabs.sendMessage(tab.id, { method: "getStatus" });
        } catch (e) {
            return null;   // trang chưa nạp tiện ích (chưa mở bài giảng / video)
        }
    }

    // The "Đang xem" card: the video's title, how far the translation is, what the voice is doing
    function veTheDangXem(st) {
        const card = document.getElementById("nowCard");
        if (!card) return false;
        if (!st || !(st.active || st.busy || (st.dub && st.dub.on))) { card.hidden = true; return false; }
        const $ = id => document.getElementById(id);
        $("nowSite").textContent = st.site === "youtube" ? "YouTube" : st.site === "coursera" ? "Coursera" : (st.host || "Trang video");
        $("nowTitle").textContent = st.title || "";
        $("nowTitle").hidden = !st.title;
        const hasProgress = st.tong > 0 && (st.active || st.busy);
        $("nowProgress").hidden = !hasProgress;
        if (hasProgress) {
            const pct = Math.round(st.xong / st.tong * 100);
            $("nowBar").style.width = `${pct}%`;
            $("nowCount").textContent = st.xong >= st.tong ? "Đã dịch xong" : `Đã dịch ${st.xong}/${st.tong} đoạn`;
        }
        const voice = st.dub && st.dub.on ? (st.dub.health || (st.dub.voice ? `Giọng ${st.dub.voice}` : "Đang lồng tiếng")) : "";
        $("nowVoice").textContent = voice;
        $("nowVoice").hidden = !voice;
        $("nowVoice").classList.toggle("warn", !!(st.dub && st.dub.warn));
        card.hidden = false;
        return true;
    }

    function veTrangThai(st) {
        const el = document.getElementById("pageStatus");
        if (!el) return;
        if (!st) { el.hidden = true; return; }
        if (veTheDangXem(st)) {
            el.hidden = true;
            if (st.active) setIdleLabel(`Dịch lại ${noun}`);
            return;
        }
        const phan = [];
        if (st.busy) phan.push("Đang dịch…");
        else if (st.active) phan.push(st.tong ? `Đã dịch ${st.xong}/${st.tong} đoạn` : "Phụ đề tiếng Việt đang bật");
        if (st.dub && st.dub.on) phan.push(st.dub.voice ? `đang đọc bằng giọng ${st.dub.voice}` : "đang lồng tiếng");
        if (!phan.length) { el.hidden = true; return; }
        el.textContent = phan.join(" · ");
        el.hidden = false;
        if (st.active) setIdleLabel(`Dịch lại ${noun}`);
    }

    // 5b. Detect Active Tab for Live Status Indicator
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
            if (tab.url.includes("coursera.org")) noun = "bài giảng";
            setIdleLabel(`Bắt đầu dịch ${noun}`);
            if (tab.url.includes("coursera.org")) {
                liveStatusText.textContent = "Coursera bài giảng";
            } else if (tab.url.includes("youtube.com")) {
                liveStatusText.textContent = "YouTube video";
                const fb = document.getElementById("forgetAudio");
                if (fb) fb.hidden = false;
            } else if (/^https?:/.test(tab.url)) {
                liveStatusText.textContent = "Trang video khác";
            } else {
                liveStatusText.textContent = "Coursera & YouTube";
            }
        }
        const st = await docTrangThaiTrang(tab);
        veTrangThai(st);
        // Read again while the translation is still going: the "Đã dịch x/y đoạn" bar was a snapshot
        // taken when the popup opened and never moved (nor reached "Đã dịch xong"). Not awaited, so
        // the rest of the popup is wired at once; the popup's own lifetime ends the loop.
        const moving = x => !!x && (x.busy || (x.active && x.tong > 0 && x.xong < x.tong));
        (async (cur) => {
            for (let i = 0; i < 300 && moving(cur); i++) {
                await new Promise(r => setTimeout(r, 1000));
                cur = await docTrangThaiTrang(tab);
                veTrangThai(cur);
            }
        })(st);
    } catch (e) {
        // Fallback gracefully
        liveStatusText.textContent = "Coursera & YouTube";
    }

    // 6. SVG Status Icons (NO EMOJIS)
    const STATUS_ICONS = {
        success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
    };

    let statusTimer = null;
    function showStatus(message, type = "info") {
        if (!statusContainer || !statusEl) return;
        clearTimeout(statusTimer);

        statusContainer.className = `status-container visible is-${type}`;
        statusIconWrap.innerHTML = STATUS_ICONS[type] || STATUS_ICONS.info;
        statusEl.textContent = message;

        // Auto hide after 5 seconds if not an error
        if (type !== "error") {
            statusTimer = setTimeout(() => {
                statusContainer.classList.remove("visible");
            }, 5000);
        }
    }


    // 6b. Chi phí ước tính hôm nay (từ service worker, chỉ lưu trên máy)
    const costEl = document.getElementById("costToday");
    function renderCostToday(r) {
        if (!costEl || !r || !r.ok || !r.day || !r.budget) return;
        const d = r.day, b = r.budget;
        const usd = (d.trUsd || 0) + (d.ttsUsd || 0);
        const pct = b.dailyBudget ? Math.min(100, Math.round(usd / b.dailyBudget * 100)) : 0;
        costEl.innerHTML = `<span>Hôm nay: <strong>~${esc(money(usd))}</strong> · ${d.trCalls || 0} lượt dịch Gemini${d.audioSec ? ` · ${(d.audioSec / 60).toFixed(1).replace(".", ",")} phút giọng AI` : ""}${d.localSec ? ` · ${(d.localSec / 60).toFixed(1).replace(".", ",")} phút VieNeu (miễn phí)` : ""} · tránh được ${d.avoided || 0} lượt gọi</span>` +
            (b.dailyBudget ? `<span class="cost-bar" title="${pct}% ngân sách ngày"><i style="width:${pct}%"></i></span>` : "");
        costEl.classList.toggle("warn", b.level === "warn");
        costEl.classList.toggle("over", b.level === "over");
        costEl.hidden = false;
    }
    // The currency chosen in Settings (VND / USD / both), shown by cost-policy.js
    const COST = window.CST_COST;
    const esc = x => String(x).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    let money = x => `${x.toFixed(3).replace(".", ",")} USD`;
    try {
        const mcfg = COST ? await chrome.storage.sync.get(COST.MONEY_DEFAULTS) : null;
        if (mcfg) { const o = COST.moneyOpts(mcfg); money = x => COST.money(x, o).text; }
    } catch (e) { /* ngoài tiện ích */ }
    try { chrome.runtime.sendMessage({ action: "costStats" }, r => { if (!chrome.runtime.lastError) renderCostToday(r); }); } catch (e) { /* ngoài tiện ích */ }

    // 7. Open Options Page (Multi-tier resilient fallback)
    function openOptionsPageSafely() {
        try {
            if (chrome.runtime && chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage(() => {
                    if (chrome.runtime.lastError) {
                        chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
                    }
                });
            } else if (chrome.tabs && chrome.tabs.create) {
                chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
            } else {
                window.open("options.html", "_blank");
            }
        } catch (e) {
            try {
                chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
            } catch (err) {
                window.open("options.html", "_blank");
            }
        }
    }

    if (costEl) costEl.addEventListener("click", () => openOptionsPageSafely());

    const forgetBtn = document.getElementById("forgetAudio");
    if (forgetBtn) forgetBtn.addEventListener("click", async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const r = tab && tab.id ? await chrome.tabs.sendMessage(tab.id, { method: "forgetVideoAudio" }) : null;
            if (r && r.ok) showStatus(`Đã xóa ${r.removed} đoạn audio đã lưu của video này, đang tạo lại.`, "success");
            else showStatus((r && r.error) || "Chưa bật lồng tiếng trên tab này.", "error");
        } catch (e) { showStatus("Chưa bật lồng tiếng trên tab này.", "error"); }
    });

    const headerSettingsBtn = document.getElementById("headerSettingsBtn");
    if (headerSettingsBtn) {
        headerSettingsBtn.addEventListener("click", (e) => {
            e.preventDefault();
            openOptionsPageSafely();
        });
    }

    // Chrome's own wording ("Cannot access contents of the page", "Receiving end does not exist")
    // told the viewer nothing they could act on
    function activationError(error) {
        const m = String(error && error.message || "");
        if (/cannot access|cannot be scripted|extensions gallery|chrome-extension|permission/i.test(m)) {
            return "Trang này không cho tiện ích chạy (trang cửa hàng Chrome, tệp PDF hoặc trang hệ thống). Hãy mở trang video.";
        }
        if (/receiving end|establish connection|message port closed/i.test(m)) {
            return "Trang chưa sẵn sàng. Tải lại trang (F5) rồi bấm lại.";
        }
        return `Không thể kích hoạt: ${m || "lỗi không rõ"}`;
    }

    // 8. Translation Trigger with Multi-Stage Animation
    translateBtn.addEventListener("click", async () => {
        if (translateBtn.classList.contains("is-translating")) return;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            // Any http(s) page: clicking here grants activeTab, which is what lets the scripts be
            // injected into a site the manifest does not list (see injectGenericPage in background.js)
            if (!tab || !/^https?:/.test(tab.url || "")) {
                showStatus("Hãy mở một trang có video (Coursera, YouTube hoặc trang video khác) trước khi dịch.", "error");
                return;
            }

            // Set Translating State (Rotating Star & Label)
            translateBtn.classList.add("is-translating");
            btnLabel.textContent = "Đang kích hoạt dịch...";

            const payload = {
                method: "translate",
                dualMode: dualModeBox.checked,
                perCueMode: Boolean((await chrome.storage.sync.get({ perCueMode: false })).perCueMode),   // chỉnh trong Cài đặt
                originalFirst: origFirstBox.checked,
                dubEnabled: dubbingBox.checked
            };

            try {
                await chrome.tabs.sendMessage(tab.id, payload);
            } catch (err) {
                // Script injection fallback
                if (tab.url.includes("youtube.com")) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            world: "MAIN",
                            files: ["yt-bridge.js"]
                        });
                    } catch (be) {}
                }
                // Nạp ĐỦ các tệp theo đúng thứ tự trong manifest (trước đây chỉ 4 tệp -> thiếu
                // kiểu phụ đề, bộ lập lịch, ... : lỗi CST_STYLE / ytSettings, mất phụ đề và giọng)
                const iso = (chrome.runtime.getManifest().content_scripts || []).find(g => g.world !== "MAIN" && (g.js || []).includes("content.js"));
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: iso ? iso.js : ["glossary.js", "dubbing.js", "content.js", "youtube.js"]
                });
                await chrome.tabs.sendMessage(tab.id, payload);
            }

            // Success Transition
            translateBtn.classList.remove("is-translating");
            translateBtn.classList.add("is-success");
            idleLabel = `Dịch lại ${noun}`;
            btnLabel.textContent = "Đã kích hoạt phụ đề!";
            showStatus("Đang xử lý. Xem thanh tiến trình trên video.", "success");

            setTimeout(() => {
                translateBtn.classList.remove("is-success");
                btnLabel.textContent = idleLabel;
            }, 2600);

        } catch (error) {
            console.error("Lỗi khi kích hoạt:", error);
            translateBtn.classList.remove("is-translating");
            btnLabel.textContent = idleLabel;
            showStatus(activationError(error), "error");
        }
    });
});

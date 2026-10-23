document.addEventListener("DOMContentLoaded", async () => {
    // Chrome chưa nạp lại tiện ích sau khi cập nhật file: báo rõ + nút nạp lại
    if (window.CST_VERSION_CHECK) window.CST_VERSION_CHECK.check(document, chrome, ".header-badge", ".content-area");

    // ========================================================
    // 1. CHUYỂN TAB ĐIỀU HƯỚNG
    // ========================================================
    const navTabs = document.querySelectorAll(".nav-tab");
    const tabPanels = document.querySelectorAll(".tab-panel");

    // WAI-ARIA tabs: the active tab is the only one in the Tab order, arrow keys / Home / End move between tabs
    const selectTab = (tab, focus) => {
        navTabs.forEach(t => {
            const on = t === tab;
            t.classList.toggle("active", on);
            t.setAttribute("aria-selected", on ? "true" : "false");
            t.tabIndex = on ? 0 : -1;
        });
        tabPanels.forEach(p => p.classList.toggle("active", p.id === tab.dataset.tab));
        if (focus) tab.focus();
    };
    navTabs.forEach((tab, i) => {
        tab.addEventListener("click", () => selectTab(tab, false));
        tab.addEventListener("keydown", e => {
            const last = navTabs.length - 1;
            const to = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
            if (to === undefined) return;
            e.preventDefault();
            selectTab(navTabs[to], true);
        });
    });

    // A first install opens options.html#welcome (background.js onInstalled): the card says what is
    // left to do, on the Gemini tab, where the key goes
    const welcome = document.getElementById("welcomeCard");
    if (welcome && location.hash === "#welcome") {
        welcome.hidden = false;
        const geminiTab = document.querySelector('.nav-tab[data-tab="tab-gemini"]');
        if (geminiTab) geminiTab.click();
        const voiceLine = document.getElementById("welcomeVoice");
        const L = window.CST_COST && window.CST_COST.LOCAL_TTS;
        try {
            chrome.runtime.sendMessage({ action: "localTtsStatus" }, r => {
                if (chrome.runtime.lastError || !voiceLine) return;
                voiceLine.textContent = r && r.running
                    ? "đang chạy trên máy này, sẵn sàng lồng tiếng."
                    : `chưa chạy. Bộ cài một lệnh tự bật nó mỗi khi mở máy; chạy tay: ${L && L.startHint ? L.startHint() : "mở ~/VieNeu-TTS/cst-start.command"}.`;
            });
        } catch (e) { if (voiceLine) voiceLine.textContent = "chưa kiểm tra được."; }
        document.getElementById("welcomeDone").addEventListener("click", () => {
            welcome.hidden = true;
            try { history.replaceState(null, "", location.pathname); } catch (e) { /* bỏ qua */ }
        });
    }

    // ========================================================
    // 2. KIỂU PHỤ ĐỀ (dùng chung subtitle-style.js với trang video)
    // ========================================================
    const S = window.CST_STYLE;
    const SEG = window.CST_VI_SEG;
    const defaultSubStyle = { ...S.DEFAULT_STYLE };

    const $ = id => document.getElementById(id);
    const subModeSingle = $("subModeSingle");
    const subModeDual = $("subModeDual");
    const previewBox = $("previewBox");
    const previewOrigLine = $("previewOrigLine");
    const previewViLine = $("previewViLine");

    const subPosition = $("subPosition");
    const subOffset = $("subOffset");
    const subOffsetVal = $("subOffsetVal");
    const subPinBottom = $("subPinBottom");

    const subFontFamily = $("subFontFamily");
    const fontStatus = $("fontStatus");
    const subFontSize = $("subFontSize");
    const subFontWeight = $("subFontWeight");
    const subLineHeight = $("subLineHeight");
    const subStrokeStyle = $("subStrokeStyle");
    const subStrokeColor = $("subStrokeColor");
    const subFontColorPicker = $("subFontColorPicker");
    const fontColorPalette = $("fontColorPalette");
    const fontColorCustom = $("fontColorCustom");
    const subOrigScale = $("subOrigScale");
    const subOrigColor = $("subOrigColor");

    const subBgColor = $("subBgColor");
    const subBgOpacity = $("subBgOpacity");
    const subBgOpacityVal = $("subBgOpacityVal");
    const subBorderRadius = $("subBorderRadius");

    const resetDefaultBtn = $("resetDefaultBtn");

    // Dựng danh sách phông & kiểu viền từ nguồn dùng chung
    if (subFontFamily) {
        const groupsDef = [
            ["Phông web tối ưu tiếng Việt (tự tải)", f => !!f.web && f.kind === "sans"],
            ["Phông có sẵn trên máy", f => !f.web],
            ["Có chân / đơn cách (tự tải)", f => !!f.web && f.kind !== "sans"]
        ];
        for (const [label, test] of groupsDef) {
            const og = document.createElement("optgroup");
            og.label = label;
            for (const f of S.FONTS.filter(test)) {
                const o = document.createElement("option");
                o.value = f.id;
                o.textContent = f.label;
                if (f.local && !S.isLocalFontAvailable(document, f.family)) {
                    o.textContent += " (máy này không có)";
                }
                og.appendChild(o);
            }
            if (og.children.length) subFontFamily.appendChild(og);
        }
    }
    if (subStrokeStyle) {
        for (const k of S.STROKES) {
            const o = document.createElement("option");
            o.value = k.id;
            o.textContent = k.label;
            subStrokeStyle.appendChild(o);
        }
    }

    // Load saved styles (tự chuyển giá trị cũ như "Helvetica Neue" sang mã phông mới)
    let currentStyle = { ...defaultSubStyle };
    try {
        const res = await chrome.storage.sync.get(["subStyle", "dualMode"]);
        currentStyle = S.normalizeStyle(res.subStyle);
        if (res.dualMode !== undefined) {
            currentStyle.mode = res.dualMode ? "dual" : "single";
        }
    } catch (e) {
        console.warn("Chưa đọc được cài đặt kiểu phụ đề:", e);
    }

    const PREVIEW_VI = "Nhưng với cá nhân tôi, điều quan trọng nhất là sự nhất quán.";

    function setLines(el, lines) {
        el.replaceChildren();
        lines.forEach((l, i) => {
            if (i) el.appendChild(document.createElement("br"));
            el.appendChild(document.createTextNode(l));
        });
    }

    // Kiểm tra phông thật sự hiển thị được, báo rõ cho người dùng
    let fontCheckSeq = 0;
    function refreshFontStatus() {
        if (!fontStatus) return;
        const f = S.getFont(currentStyle.fontFamily);
        const seq = ++fontCheckSeq;
        if (f.stack) {
            fontStatus.className = "field-hint ok";
            fontStatus.textContent = "✓ Dùng phông giao diện của hệ điều hành (San Francisco trên macOS, Segoe UI trên Windows).";
            return;
        }
        fontStatus.className = "field-hint";
        fontStatus.textContent = f.web ? "⏳ Đang tải phông kèm bộ dấu tiếng Việt..." : "Đang kiểm tra phông trên máy...";
        S.ensureFont(document, f.id, currentStyle.fontWeight).then(ok => {
            if (seq !== fontCheckSeq) return;
            if (ok) {
                fontStatus.className = "field-hint ok";
                fontStatus.textContent = f.web
                    ? `✓ Đã tải "${f.family}". Phông cũng được tải trên YouTube và Coursera khi phát phụ đề.`
                    : `✓ Máy này có sẵn "${f.family}".`;
            } else {
                fontStatus.className = "field-hint warn";
                fontStatus.textContent = f.web
                    ? `⚠ Không tải được "${f.family}" (mạng hoặc trang chặn). Phụ đề vẫn hiển thị bằng phông dự phòng đủ dấu tiếng Việt.`
                    : `⚠ Máy này không có "${f.family}", phụ đề sẽ dùng phông dự phòng. Nên chọn một phông web ở nhóm trên.`;
            }
            updatePreview();
        });
    }

    // Update Live Interactive Preview
    function updatePreview() {
        if (!previewBox) return;
        const s = S.normalizeStyle(currentStyle);

        // 1. Mode (Single vs Dual)
        const dual = s.mode === "dual";
        subModeDual.classList.toggle("active", dual);
        subModeSingle.classList.toggle("active", !dual);
        previewOrigLine.style.display = dual ? "block" : "none";
        // the original line's own options matter in Song ngữ only
        const origOptions = document.getElementById("origOptions");
        if (origOptions) origOptions.classList.toggle("is-off", !dual);

        const legib = document.getElementById("legibilityHint");
        if (legib) {
            const issue = S.legibilityIssue(s);
            legib.hidden = !issue;
            legib.textContent = issue ? "⚠ " + issue.message : "";
        }

        // 2. Position & Offset
        subOffsetVal.textContent = `${s.offset}%`;
        if (s.position === "top") {
            previewBox.style.top = `calc(${s.offset}% + 38px)`;
            previewBox.style.bottom = "auto";
        } else {
            previewBox.style.bottom = `calc(${s.offset}% + 36px)`;
            previewBox.style.top = "auto";
        }

        // 3. Typography: dùng đúng hàm như trên trang video
        previewBox.style.fontFamily = S.fontStack(s.fontFamily);
        previewBox.style.fontWeight = s.fontWeight;
        previewBox.style.fontSize = `${(15.5 * S.sizeFactor(s.fontSize)).toFixed(1)}px`;
        previewBox.style.lineHeight = String(s.lineHeight);
        previewBox.style.textShadow = S.textShadow(s);
        previewViLine.style.color = s.fontColor;
        previewViLine.style.lineHeight = String(s.lineHeight);
        previewOrigLine.style.color = s.origColor;
        previewOrigLine.style.fontSize = `${(s.origScale / 100).toFixed(2)}em`;
        previewOrigLine.style.order = s.originalFirst ? "0" : "2";

        // Ngắt dòng bằng chính thuật toán tiếng Việt của tiện ích; nếu khung xem
        // trước hẹp hơn dòng thì ngắt lại theo cú pháp (như trên YouTube), không
        // để trình duyệt tự xuống dòng tạo từ mồ côi.
        let lines = SEG ? SEG.breakLines(PREVIEW_VI) : [PREVIEW_VI];
        const container = previewBox.parentElement;
        if (SEG && container) {
            const fontPx = 15.5 * S.sizeFactor(s.fontSize);
            const avail = container.clientWidth * 0.86 - fontPx * 1.6;
            const ctx = (updatePreview._ctx = updatePreview._ctx || document.createElement("canvas").getContext("2d"));
            ctx.font = `${s.fontWeight} ${fontPx}px ${S.fontStack(s.fontFamily)}`;
            let widest = 0, widestLen = 1;
            for (const l of lines) {
                const w = ctx.measureText(l).width;
                if (w > widest) { widest = w; widestLen = l.length; }
            }
            if (widest > avail) {
                const maxChars = Math.max(12, Math.floor(avail / (widest / widestLen)) - 1);
                lines = SEG.breakLines(PREVIEW_VI, { maxLineChars: maxChars, maxLines: 4 });
            }
        }
        previewViLine.style.whiteSpace = "nowrap";
        setLines(previewViLine, lines);

        // 4. Background & Border
        previewBox.style.backgroundColor = S.backgroundColor(s);
        previewBox.style.borderRadius = `${s.borderRadius}px`;
        subBgOpacityVal.textContent = `${s.bgOpacity}%`;
        markFontColor(s.fontColor);
    }

    // Populate inputs from currentStyle
    function populateStyleInputs() {
        const s = currentStyle;
        if (subPosition) subPosition.value = s.position;
        if (subOffset) subOffset.value = s.offset;
        if (subPinBottom) subPinBottom.checked = !!s.pinBottom;
        if (subFontFamily) subFontFamily.value = s.fontFamily;
        if (subFontSize) {
            if (![...subFontSize.options].some(o => Number(o.value) === Number(s.fontSize))) {
                const o = document.createElement("option");
                o.value = s.fontSize;
                o.textContent = `${s.fontSize}%`;
                subFontSize.appendChild(o);
            }
            subFontSize.value = String(s.fontSize);
        }
        if (subFontWeight) subFontWeight.value = s.fontWeight;
        if (subLineHeight) subLineHeight.value = String(s.lineHeight);
        if (subStrokeStyle) subStrokeStyle.value = s.strokeStyle;
        if (subStrokeColor) subStrokeColor.value = s.strokeColor;
        if (subFontColorPicker) subFontColorPicker.value = s.fontColor;
        if (subOrigScale) subOrigScale.value = String(s.origScale);
        if (subOrigColor) subOrigColor.value = s.origColor;

        if (subBgColor) subBgColor.value = s.bgColor;
        if (subBgOpacity) subBgOpacity.value = s.bgOpacity;
        if (subBorderRadius) subBorderRadius.value = s.borderRadius;

        markFontColor(s.fontColor);

        refreshFontStatus();
        updatePreview();
    }

    // Setup events for Subtitle Style Controls
    const bind = (el, evt, key, parse = v => v, after) => {
        if (!el) return;
        el.addEventListener(evt, () => {
            currentStyle[key] = parse(el.value);
            if (after) after();
            updatePreview();
        });
    };

    if (subModeSingle && subModeDual) {
        subModeSingle.addEventListener("click", () => { currentStyle.mode = "single"; updatePreview(); });
        subModeDual.addEventListener("click", () => { currentStyle.mode = "dual"; updatePreview(); });
    }

    bind(subPosition, "change", "position");
    bind(subOffset, "input", "offset", v => parseInt(v, 10));
    if (subPinBottom) subPinBottom.addEventListener("change", () => { currentStyle.pinBottom = subPinBottom.checked; updatePreview(); });
    bind(subFontFamily, "change", "fontFamily", v => v, refreshFontStatus);
    bind(subFontSize, "change", "fontSize", v => parseInt(v, 10));
    bind(subFontWeight, "change", "fontWeight", v => v, refreshFontStatus);
    bind(subLineHeight, "change", "lineHeight", v => parseFloat(v));
    bind(subStrokeStyle, "change", "strokeStyle");
    bind(subStrokeColor, "input", "strokeColor");
    bind(subOrigScale, "change", "origScale", v => parseInt(v, 10));
    bind(subOrigColor, "input", "origColor");
    bind(subBgColor, "change", "bgColor");
    bind(subBgOpacity, "input", "bgOpacity", v => parseInt(v, 10));
    bind(subBorderRadius, "change", "borderRadius", v => parseInt(v, 10));

    // The preset dot of this colour lights up; a colour of the viewer's own lights the wheel instead
    function markFontColor(color) {
        if (!fontColorPalette) return;
        const c = String(color || "").toLowerCase();
        let preset = false;
        fontColorPalette.querySelectorAll(".color-dot").forEach(d => {
            const on = d.dataset.color.toLowerCase() === c;
            d.classList.toggle("active", on);
            preset = preset || on;
        });
        // the wheel wears the viewer's own colour while it is the one in use
        if (fontColorCustom) {
            fontColorCustom.classList.toggle("active", !preset && !!c);
            fontColorCustom.style.background = !preset && c ? c : "";
        }
    }

    if (subFontColorPicker) {
        subFontColorPicker.addEventListener("input", () => {
            currentStyle.fontColor = subFontColorPicker.value;
            markFontColor(currentStyle.fontColor);
            updatePreview();
        });
    }

    if (fontColorPalette) {
        fontColorPalette.querySelectorAll(".color-dot").forEach(dot => {
            dot.addEventListener("click", () => {
                currentStyle.fontColor = dot.dataset.color;
                markFontColor(currentStyle.fontColor);
                if (subFontColorPicker) subFontColorPicker.value = dot.dataset.color;
                updatePreview();
            });
        });
    }

    if (resetDefaultBtn) {
        resetDefaultBtn.addEventListener("click", () => {
            if (confirm("Khôi phục kiểu phụ đề về cấu hình mặc định?")) {
                currentStyle = { ...defaultSubStyle };
                populateStyleInputs();
                flashStatus("✓ Đã khôi phục kiểu phụ đề mặc định!");
            }
        });
    }

    populateStyleInputs();
    window.addEventListener("resize", () => updatePreview());

    // ========================================================
    // 3. GEMINI AI & MODEL SETTINGS
    // ========================================================
    // HTML-escape anything that did not originate in this file (model ids, server replies, error text)
    const esc = x => String(x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const optUseAiBox = document.getElementById("optUseAi");
    const geminiKeyInput = document.getElementById("geminiApiKeyInput");
    const geminiModelSelect = document.getElementById("geminiModelSelect");
    const customModelRow = document.getElementById("customModelRow");
    const customModelInput = document.getElementById("customModelInput");
    const testAiKeyBtn = document.getElementById("testAiKeyBtn");
    const aiKeyStatus = document.getElementById("aiKeyStatus");

    const COST = window.CST_COST;
    const savedAi = await chrome.storage.sync.get({
        useAi: true,
        geminiApiKey: "",
        geminiModel: COST.DEFAULT_MODELS.cheap,
        geminiStrongModel: COST.DEFAULT_MODELS.strong,
        costMode: "balanced",
        autoTranslate: true,
        dubEnabled: true,
        perCueMode: false,
        skipSameLang: true,
        budgetDailyUsd: COST.BUDGET_DEFAULTS.daily,
        budgetVideoUsd: COST.BUDGET_DEFAULTS.video,
        ...COST.MONEY_DEFAULTS
    });
    const autoTranslateBox = document.getElementById("autoTranslate");
    if (autoTranslateBox) autoTranslateBox.checked = savedAi.autoTranslate !== false;
    const autoDubBox = document.getElementById("autoDub");
    if (autoDubBox) autoDubBox.checked = savedAi.dubEnabled !== false;
    const skipSameLangBox = document.getElementById("skipSameLang");
    if (skipSameLangBox) skipSameLangBox.checked = savedAi.skipSameLang !== false;
    const perCueBox = document.getElementById("perCueMode");
    if (perCueBox) perCueBox.checked = !!savedAi.perCueMode;
    const budgetDailyInput = document.getElementById("budgetDailyUsd");
    const budgetVideoInput = document.getElementById("budgetVideoUsd");

    // ---- Money display (VND / USD / both) and budgets ----
    // Budgets are stored in USD (what the service worker compares against). In the VND view the
    // budget fields show and take đồng, converted at the chosen rate; the stored USD is the state.
    const byId = id => document.getElementById(id);
    let moneyO = COST.moneyOpts(savedAi);
    const budgetUsd = { daily: Math.max(0, Number(savedAi.budgetDailyUsd) || 0), video: Math.max(0, Number(savedAi.budgetVideoUsd) || 0) };
    const rateInput = byId("costUsdVnd"), extraInput = byId("costExtraPct");
    if (rateInput) rateInput.value = moneyO.rate;
    if (extraInput) extraInput.value = moneyO.extraPct;
    const BUDGET_FIELDS = [
        { key: "daily", input: budgetDailyInput, label: "budgetDailyLabel", hint: "budgetDailyHint", name: "mỗi ngày", usdStep: "0.1" },
        { key: "video", input: budgetVideoInput, label: "budgetVideoLabel", hint: "budgetVideoHint", name: "mỗi video", usdStep: "0.05" }
    ];
    // Budgets are kept and typed in USD (what Google bills); the hint gives the đồng
    function budgetHint(f) {
        const v = budgetUsd[f.key];
        const el = byId(f.hint);
        if (el) el.textContent = !v ? "Không giới hạn" : `Khoảng ${COST.formatVnd(v * moneyO.rate)}`;
    }
    function renderMoneyControls() {
        for (const f of BUDGET_FIELDS) {
            if (!f.input) continue;
            f.input.step = f.usdStep;
            if (document.activeElement !== f.input) f.input.value = +budgetUsd[f.key].toFixed(4);
            const label = byId(f.label);
            if (label) label.textContent = `Ngân sách ${f.name} (USD)`;
            budgetHint(f);
        }
        const rateHint = byId("costRateHint");
        if (rateHint) rateHint.textContent = `Tham khảo ngày ${COST.FX.asOf.split("-").reverse().join("/")}: ${COST.formatVnd(COST.FX.usdVnd)} (giá giữa thị trường). Thẻ ngân hàng thường tính theo giá bán ra, cao hơn một chút: nhập đúng tỷ giá trên sao kê để khớp số tiền đã trả.`;
    }
    for (const f of BUDGET_FIELDS) f.input && f.input.addEventListener("input", () => {
        const val = Math.max(0, Number(f.input.value) || 0);
        budgetUsd[f.key] = val;
        budgetHint(f);
    });
    function moneyChanged() {
        moneyO = COST.moneyOpts({ costUsdVnd: rateInput && rateInput.value, costExtraPct: extraInput && extraInput.value });
        renderMoneyControls();
        showCostStats(lastCost);
    }
    [rateInput, extraInput].forEach(el => el && el.addEventListener("input", moneyChanged));
    renderMoneyControls();
    const bgSend = msg => new Promise(resolve => {
        try { chrome.runtime.sendMessage(msg, r => resolve(chrome.runtime.lastError ? null : r)); } catch (e) { resolve(null); }
    });

    // ---- Chế độ sử dụng ----
    const costModeSel = document.getElementById("costMode");
    const costModeDesc = document.getElementById("costModeDesc");
    const strongSel = document.getElementById("geminiStrongModel");
    const showModeDesc = () => { if (costModeDesc) costModeDesc.textContent = COST.getMode(costModeSel.value).desc; };
    if (costModeSel) {
        costModeSel.value = COST.MODES[savedAi.costMode] ? savedAi.costMode : "balanced";
        showModeDesc();
        costModeSel.addEventListener("change", showModeDesc);
    }
    // ---- Danh sách model: dựng từ danh mục duy nhất (cost-policy.js) ----
    // Nhãn phản ánh quyền truy cập THẬT của API key hiện tại (theo kết quả gọi API đã ghi nhận).
    const fmtDate = d => d.split("-").reverse().join("/");
    function modelText(m, role, st) {
        const state = st && st.models && st.models[m.id] ? st.models[m.id].state : "unknown";
        const isDefault = m.id === COST.DEFAULT_MODELS[role];
        let note;
        if (state === "unavailable") note = "Không khả dụng với API key hiện tại";
        else if (state === "retry") note = "Google từng từ chối model này với key hiện tại, sẽ thử lại một lần";
        else if (m.shutdown) note = `Google ngừng hỗ trợ ${fmtDate(m.shutdown)}, nên chuyển sang ${COST.modelLabel(m.replacement)}`;
        else if (m.access === "restricted" && state !== "ok") note = "Chỉ dành cho API key có quyền truy cập";
        else note = m.hint + (state === "ok" ? ", dùng được với key này" : "");
        return `${m.label} (${isDefault ? "Mặc định: " : ""}${note})`;
    }
    function fillModelOptions(st) {
        if (geminiModelSelect) {
            const keep = geminiModelSelect.value;
            geminiModelSelect.querySelectorAll("option:not([value=custom])").forEach(o => o.remove());
            const customOp = geminiModelSelect.querySelector('option[value="custom"]');
            const autoOp = document.createElement("option");
            autoOp.value = COST.AUTO;
            autoOp.textContent = "Tự động (khuyên dùng)";
            geminiModelSelect.insertBefore(autoOp, customOp);
            COST.TRANSLATION_MODELS.forEach(m => {
                const op = document.createElement("option");
                op.value = m.id;
                op.textContent = modelText(m, "cheap", st);
                geminiModelSelect.insertBefore(op, customOp);
            });
            if (keep) geminiModelSelect.value = keep;
        }
        if (strongSel) {
            const keep = strongSel.value || savedAi.geminiStrongModel;
            strongSel.innerHTML = "";
            COST.TRANSLATION_MODELS.forEach(m => {
                const op = document.createElement("option");
                op.value = m.id;
                op.textContent = modelText(m, "strong", st);
                strongSel.appendChild(op);
            });
            if (![...strongSel.options].some(op => op.value === keep)) {
                const op = document.createElement("option");
                op.value = keep;
                op.textContent = keep;
                strongSel.appendChild(op);
            }
            strongSel.value = keep;
        }
        const eff = document.getElementById("modelEffective");
        if (eff && st && st.ok && st.hasKey && st.effective) {
            // the paid voice is off (cost-policy PAID_TTS): its model is not named here
            eff.textContent = `Đang dùng: ${COST.modelLabel(st.effective.cheap) || "chưa có model khả dụng"}` +
                (st.effective.cheapRetry ? ` (lượt tới thử lại ${COST.modelLabel(st.effective.cheapRetry)} một lần)` : "") +
                ` · câu khó: ${COST.modelLabel(st.effective.strong) || "không có"}`;
        } else if (eff) eff.textContent = "";
    }
    async function refreshModelStatus(key) {
        const st = await bgSend({ action: "modelStatus", key });
        fillModelOptions(st);
        return st;
    }
    fillModelOptions(null);
    refreshModelStatus();

    // ---- Bộ nhớ đệm ----
    const fmtMB = b => (b / 1048576 < 0.1 ? `${Math.round(b / 1024)} KB` : b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : `${(b / 1048576).toFixed(1)} MB`);
    async function showCacheStats(res) {
        const r = res || await new Promise(rs => chrome.runtime.sendMessage({ action: "cacheStats" }, rs));
        const trEl = document.getElementById("cacheTr"), auEl = document.getElementById("cacheAudio");
        if (!r || !r.ok || !r.tr || !r.audio) { if (trEl) trEl.textContent = "Chưa đọc được (mở trang này từ trong tiện ích)."; if (auEl) auEl.textContent = ""; return; }
        if (trEl) trEl.textContent = `${fmtMB(r.tr.bytes + (r.local ? r.local.bytes : 0))} · ${r.tr.count} đoạn (tối đa ${fmtMB(r.tr.maxBytes)})`;
        // ~61 MB of voice for a 13-minute video (background.js AUDIO_CACHE_MAX_BYTES)
        if (auEl) auEl.textContent = `${fmtMB(r.audio.bytes)} · ${r.audio.count} đoạn audio, khoảng ${Math.round(r.audio.bytes / 64e6)} video (tối đa ${fmtMB(r.audio.maxBytes)})`;
        // Saved videos and how many are new since the last quality review (background.js REVIEW_MARK)
        const v = r.videos, vidEl = document.getElementById("cacheVideos"), revEl = document.getElementById("cacheReview");
        if (!v) return;
        if (vidEl) vidEl.textContent = `${v.count} / ${v.max} video · khoảng ${fmtMB(v.bytes)}. Video thứ ${v.max + 1} sẽ thay video cũ nhất.`;
        if (revEl) {
            const day = new Date(v.until).toLocaleDateString("vi-VN");
            const range = v.fresh > 1 ? ` (số ${v.reviewed + 1} đến ${v.reviewed + v.fresh})` : v.fresh === 1 ? ` (số ${v.reviewed + 1})` : "";
            revEl.textContent = `Đã rà soát video số 1 đến ${v.reviewed}, tới ngày ${day} (còn lưu ${v.count - v.fresh}). Video mới chưa rà soát: ${v.fresh} / ${v.max}${range}.` +
                (v.fresh >= v.max ? " Đã đủ, hãy nhắn Claude rà soát." : "");
        }
    }
    const clearCache = which => async () => {
        const label = { tr: "bản dịch", audio: "audio", all: "toàn bộ bộ nhớ đệm" }[which];
        if (!confirm(`Xóa ${label} đã lưu? Lần xem sau sẽ phải gọi Gemini lại cho những nội dung này.`)) return;
        const r = await new Promise(rs => chrome.runtime.sendMessage({ action: "cacheClear", which }, rs));
        showCacheStats(r);
        flashStatus(`✓ Đã xóa ${label}.`);
    };
    document.getElementById("clearTrCache")?.addEventListener("click", clearCache("tr"));
    document.getElementById("clearAudioCache")?.addEventListener("click", clearCache("audio"));
    document.getElementById("clearAllCache")?.addEventListener("click", clearCache("all"));
    // Only the saved videos the last quality review covered; the new batch stays
    document.getElementById("clearReviewedVideos")?.addEventListener("click", async () => {
        if (!confirm("Xóa bản dịch của những video đã được rà soát? Video mới chưa rà soát được giữ nguyên. Xem lại một video đã xóa sẽ phải dịch lại (tốn phí Gemini).")) return;
        const r = await new Promise(rs => chrome.runtime.sendMessage({ action: "cacheClear", which: "reviewed" }, rs));
        showCacheStats(r);
        flashStatus(`✓ Đã xóa ${(r && r.removed) || 0} video đã rà soát.`);
    });
    try { showCacheStats(); } catch (e) { /* ngoài extension */ }

    if (optUseAiBox) optUseAiBox.checked = savedAi.useAi !== false;
    if (geminiKeyInput) geminiKeyInput.value = savedAi.geminiApiKey || "";

    if (geminiModelSelect) {
        if (savedAi.geminiModel === COST.AUTO || COST.findModel(savedAi.geminiModel)) {
            geminiModelSelect.value = savedAi.geminiModel;
            if (customModelRow) customModelRow.style.display = "none";
        } else if (savedAi.geminiModel) {
            geminiModelSelect.value = "custom";
            if (customModelRow) customModelRow.style.display = "flex";
            if (customModelInput) customModelInput.value = savedAi.geminiModel;
        }

        geminiModelSelect.addEventListener("change", () => {
            if (geminiModelSelect.value === "custom") {
                if (customModelRow) customModelRow.style.display = "flex";
            } else {
                if (customModelRow) customModelRow.style.display = "none";
            }
        });
    }

    function getEffectiveModel() {
        if (!geminiModelSelect) return COST.DEFAULT_MODELS.cheap;
        if (geminiModelSelect.value === "custom") {
            return (customModelInput?.value || "").trim() || COST.DEFAULT_MODELS.cheap;
        }
        return geminiModelSelect.value;
    }

    if (testAiKeyBtn) {
        testAiKeyBtn.addEventListener("click", async () => {
            const key = (geminiKeyInput?.value || "").trim();
            const model = getEffectiveModel();
            if (!key) {
                aiKeyStatus.style.color = "";
                aiKeyStatus.innerHTML = "<strong>✕ Chưa nhập API Key:</strong> Vui lòng dán Google Gemini API Key trước khi kiểm tra.";
                return;
            }

            aiKeyStatus.style.color = "var(--text-sub)";
            aiKeyStatus.innerHTML = `<em>⏳ Đang gửi yêu cầu dịch thử thật tới Gemini API (${COST.modelLabel(model)})...</em>`;
            // Kiểm tra qua service worker: dùng đúng chuỗi model sẽ dùng khi dịch và ghi nhận
            // model nào key này gọi được (nguồn sự thật là kết quả gọi generateContent thật)
            const r = await bgSend({ action: "testKey", key, model });
            const skipped = r && r.skipped && r.skipped.length
                ? `<br>• Không khả dụng với key này nên đã bỏ qua: <b>${r.skipped.map(x => esc(COST.modelLabel(x))).join(", ")}</b>` : "";
            if (r && r.ok) {
                aiKeyStatus.style.color = "";
                aiKeyStatus.innerHTML = `
                    <div class="cst-note ok">
                        <div class="cst-note-title">✓ API Key hoạt động</div>
                        <div class="cst-note-body">
                            • Model trả lời: <b>${esc(COST.modelLabel(r.model))}</b> (${esc(r.model)})<br>
                            • Tốc độ phản hồi: <b>${esc(r.latency)} ms</b>${skipped}<br>
                            • Kết quả dịch mẫu: <i>"${esc(r.sample || "")}"</i>
                        </div>
                    </div>`;
            } else {
                aiKeyStatus.style.color = "";
                aiKeyStatus.innerHTML = `
                    <div class="cst-note err">
                        <div class="cst-note-title">✕ Chưa gọi được Gemini API</div>
                        <div class="cst-note-body">
                            ${esc((r && r.error) || "Không liên lạc được với tiện ích (hãy mở trang này từ biểu tượng tiện ích)")}${skipped}
                        </div>
                    </div>`;
            }
            refreshModelStatus(key);
        });
    }

    // ---- Chi phí ước tính & ngân sách ----
    const toks = n => Math.round(n || 0).toLocaleString("vi-VN");
    const nameOf = id => (COST.findModel(id) || { label: id }).label;
    const mins = sec => `${((sec || 0) / 60).toFixed(1).replace(".", ",")} phút`;
    const ddmm = d => d.slice(8, 10) + "/" + d.slice(5, 7);
    // Money: text for sentences ("28.903 đ (1,11 USD)"), cell for tables (đồng over USD)
    const fm = x => COST.money(x, moneyO).text;
    const cell = x => { const m = COST.money(x, moneyO); return `${m.vnd}<span class="cost-money-sub">${m.usd}</span>`; };
    const table = (caption, head, rows) => `<div class="cost-cap">${caption}</div><div class="cost-scroll"><table class="ver-table">` +
        `<tr>${head.map((h, i) => `<th${i ? ' class="num"' : ""}>${h}</th>`).join("")}</tr>` +
        rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`).join("") + "</table></div>";
    const kpi = (label, usd, sub) => {
        const m = usd == null ? null : COST.money(usd, moneyO);
        const value = !m ? "Chưa đủ dữ liệu" : m.vnd;
        const second = m ? `<div class="cost-kpi-sub">${m.usd}</div>` : "";
        return `<div class="cost-kpi"><div class="cost-kpi-label">${label}</div><div class="cost-kpi-value">${value}</div>${second}${sub ? `<div class="cost-kpi-sub">${sub}</div>` : ""}</div>`;
    };
    // This month by the machine's calendar, from the days the ledger has recorded. The projection is
    // only an extrapolation of the average so far, shown from 3 days of records.
    function monthOf(history, today) {
        if (!today) return null;
        const month = today.slice(0, 7);
        const days = Object.keys(history || {}).filter(k => k.startsWith(month)).sort();
        if (!days.length) return null;
        const usdOf = h => (h.trUsd || 0) + (h.ttsUsd || 0);
        const total = days.reduce((t, k) => t + usdOf(history[k]), 0);
        const [y, mo, d] = today.split("-").map(Number);
        const inMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        const span = d - Number(days[0].slice(8, 10)) + 1;      // days since the first record, idle days included
        return { month: mo, first: days[0], total, span, projected: span >= 3 ? total + total / span * (inMonth - d) : null };
    }
    let lastCost = null;
    async function showCostStats(res) {
        const r = res || await bgSend({ action: "costStats" });
        const sumEl = byId("costSummary"), tabEl = byId("costTables"), kpiEl = byId("costKpis"), meter = byId("costMeter");
        if (!sumEl) return;
        if (!r || !r.ok || !r.day || !r.budget) { sumEl.textContent = "Chưa đọc được (mở trang này từ trong tiện ích)."; return; }
        lastCost = r;
        const d = r.day, b = r.budget, m = r.model;
        const dayUsd = (d.trUsd || 0) + (d.ttsUsd || 0);
        const mon = monthOf(r.history, r.today);
        if (kpiEl) kpiEl.innerHTML = [
            kpi(`Hôm nay (${ddmm(d.day)})`, dayUsd, `${d.trCalls || 0} lượt · ${toks((d.inTok || 0) + (d.outTok || 0))} token`),
            mon ? kpi(`Tháng ${mon.month}`, mon.total, mon.first.endsWith("-01") ? "" : `ghi từ ${ddmm(mon.first)}`) : "",
            mon ? kpi("Dự kiến cả tháng", mon.projected, mon.projected == null ? "cần ít nhất 3 ngày số liệu" : `nếu dùng đều như ${mon.span} ngày qua`) : "",
            d.trCalls ? kpi("Trung bình mỗi lượt dịch", d.trUsd / d.trCalls, m ? esc(m.label) : "") : ""
        ].join("");
        if (meter) {
            meter.hidden = !b.dailyBudget;
            if (b.dailyBudget) {
                const pct = Math.min(100, Math.round(b.spentDay / b.dailyBudget * 100));
                meter.firstElementChild.style.width = `${pct}%`;
                meter.className = `cost-meter ${b.level === "ok" ? "" : b.level}`;
                meter.title = `${pct}% ngân sách ngày`;
            }
        }
        const line = (label, x) => {
            const parts = [`<b>${label}</b>: ${fm((x.trUsd || 0) + (x.ttsUsd || 0))}, ${x.trCalls || 0} lượt gọi Gemini tính tiền`];
            if (x.ttsCalls) parts.push(`giọng Gemini ${fm(x.ttsUsd)} (${x.ttsCalls} lượt)`);
            if (x.localSec) parts.push(`giọng VieNeu trên máy ${mins(x.localSec)} (miễn phí)`);
            if (x.hitsTr || x.hitsAudio) parts.push(`dùng lại bản đã lưu ${(x.hitsTr || 0) + (x.hitsAudio || 0)} lần, không tốn tiền`);
            return parts.join(" · ");
        };
        const notes = [];
        // How much of today's amount rests on Google's own token counts rather than an estimate
        if (d.trUsd > 0 && d.inTok) {
            const real = Math.max(0, Math.min(100, Math.round((1 - (d.estUsd || 0) / d.trUsd) * 100)));
            notes.push(`Độ tin cậy: ${real}% số tiền hôm nay tính từ số token Google báo về${real < 100 ? `, ${100 - real}% là ước lượng` : ""}.`);
        }
        if (d.estCalls) notes.push(`${d.estCalls} lượt hôm nay quá thời gian chờ mà Google chưa trả về: vẫn bị tính tiền. ${d.countedCalls ? `${d.countedCalls} lượt trong đó đã được Google đếm đúng số token vào; ` : ""}phần còn lại ước lượng theo độ dài câu.`);
        // Models whose price is not in the catalog under their own name
        const unsure = Object.keys(d.byModel || {}).map(id => [id, COST.priceOf(id)]).filter(([id, p]) => p.how !== "exact" && !(m && id === m.id && p.how !== "unknown"));
        for (const [id, p] of unsure) notes.push(p.how === "unknown"
            ? `⚠ Chưa có giá của model ${esc(id)} trong tiện ích: số tiền của model này có thể thấp hơn thật. Xem bảng giá Google.`
            : `Model ${esc(id)} được tính theo giá của ${esc(nameOf(p.base))}.`);
        if (d.lateCalls) notes.push(`${d.lateCalls} lượt quá thời gian chờ nhưng Google trả về muộn: đã thay số ước lượng bằng số token thật.`);
        if (d.trCalls && !d.inTok) notes.push("Số token chỉ được đếm từ bản 2.1.0; các lượt trước đó của hôm nay bị đếm thiếu.");
        if (moneyO.extraPct) notes.push(`Mọi số tiền đã cộng ${String(moneyO.extraPct).replace(".", ",")}% thuế và phí.`);
        const price = m && m.how !== "unknown" && m.price;
        const checked = COST.PRICES_CHECKED.split("-").reverse().join("/");
        sumEl.innerHTML = [
            m ? `Model đang dịch: <b>${esc(m.label)}</b>${price ? `. Giá Google cho 1 triệu token: vào ${fm(price.in)}, ra ${fm(price.out)} (token ra gồm cả phần model "suy nghĩ")${m.how && m.how !== "exact" && m.base ? `, lấy theo giá của ${esc(nameOf(m.base))}` : ""}` : ". Chưa có giá của model này trong tiện ích"}${m.retry ? `. Lượt dịch tới sẽ thử lại ${esc(m.retryLabel || m.retry)} một lần: Google từng từ chối model này với key hiện tại, nếu vẫn bị từ chối thì dùng tiếp ${esc(m.label)}, không tốn tiền` : ""}. Bảng giá kiểm tra ngày ${checked}, <a href="${COST.PRICING_URL}" target="_blank" rel="noopener">xem giá mới nhất</a>.` : "Chưa có API key: không gọi Gemini, không tốn tiền.",
            line("Hôm nay, giờ máy", d),
            line("Từ lúc mở trình duyệt", r.session),
            b.dailyBudget ? `Đã dùng ${Math.round(b.spentDay / b.dailyBudget * 100)}% ngân sách ngày (${fm(b.dailyBudget)})${b.level === "over" ? ": đã chạm, thôi dịch lại bằng model mạnh" : b.level === "warn" ? ": sắp chạm" : ""}.` : "Không giới hạn ngân sách ngày.",
            ...notes
        ].map(x => `<div>${x}</div>`).join("");

        let html = "";
        const models = Object.entries(d.byModel || {}).filter(([, x]) => x.calls).sort((a, c) => c[1].usd - a[1].usd);
        if (models.length) html += table("Hôm nay theo model", ["Model", "Lượt", "Token vào", "Token ra", "Chi phí"],
            models.map(([id, x]) => [esc(nameOf(id)), x.calls, toks(x.inTok), toks(x.outTok), cell(x.usd)]));
        // Split by token kind only with a single model: one price applies to every row
        const tokId = models.length ? models[0][0] : m && m.id;
        const p = models.length <= 1 && tokId && COST.priceOf(tokId).how !== "unknown" && COST.priceOf(tokId).price;
        if ((d.inTok || d.outTok) && p) {
            const cached = d.cachedTok || 0, thought = d.thoughtTok || 0;
            const rows = [["Token vào: lời nhắc, ngữ cảnh, câu cần dịch", toks(d.inTok - cached), cell((d.inTok - cached) * p.in / 1e6)]];
            if (cached) rows.push(["Token vào Google lấy từ bộ nhớ đệm (giá rẻ hơn)", toks(cached), cell(cached * (p.cache ?? p.in) / 1e6)]);
            rows.push(["Token ra: bản dịch", toks(d.outTok - thought), cell((d.outTok - thought) * p.out / 1e6)]);
            rows.push(['Token "suy nghĩ" của model (giá như token ra)', toks(thought), cell(thought * p.out / 1e6)]);
            html += table("Hôm nay theo loại token", ["Loại", "Token", "Chi phí"], rows);
        }
        const days = Object.keys(r.history || {}).sort().reverse().slice(0, 7);
        if (days.length) html += table("7 ngày gần nhất",
            ["Ngày", "Lượt", "Token vào", "Token ra", "Chi phí"],
            days.map(k => { const h = r.history[k]; return [k === r.today ? `${ddmm(k)} (hôm nay)` : ddmm(k), h.trCalls || 0, toks(h.inTok), toks(h.outTok), cell((h.trUsd || 0) + (h.ttsUsd || 0))]; }));
        if (html) html += `<div class="field-hint" style="margin-top: 6px;">Đối chiếu: Google AI Studio, mục Usage hoặc Billing. Google chia ngày theo giờ Thái Bình Dương, chậm hơn Việt Nam 14 đến 15 tiếng, nên số từng ngày ở đó lệch nửa ngày so với bảng này; cộng cả tuần hay cả tháng thì khớp. Lệch nhiều thì API key này có thể đang được dùng ở nơi khác.</div>`;
        if (tabEl) tabEl.innerHTML = html;

        renderTopVideos();
    }
    // The videos that cost most today, this week (from Monday), month, quarter or year, by local day
    // (background.js videoSpend). The period picked is remembered on this machine.
    let topPeriod = "day";
    try { topPeriod = localStorage.getItem("cstTopPeriod") || "day"; } catch (e) { /* bỏ qua */ }
    const PERIODS = { day: "hôm nay", week: "tuần này", month: "tháng này", quarter: "quý này", year: "năm nay" };
    function periodStart(today, period) {
        const [y, m, d] = today.split("-").map(Number);
        const iso = x => `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
        if (period === "week") { const t = new Date(Date.UTC(y, m - 1, d)); t.setUTCDate(d - (t.getUTCDay() + 6) % 7); return iso(t); }
        if (period === "month") return `${y}-${String(m).padStart(2, "0")}-01`;
        if (period === "quarter") return `${y}-${String(m - (m - 1) % 3).padStart(2, "0")}-01`;
        if (period === "year") return `${y}-01-01`;
        return today;
    }
    function renderTopVideos() {
        const vidEl = byId("costVideos"), r = lastCost;
        if (!vidEl || !r || !r.today) return;
        if (!PERIODS[topPeriod]) topPeriod = "day";
        document.querySelectorAll(".cost-period .mode-btn").forEach(b => {
            const on = b.dataset.period === topPeriod;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", String(on));
        });
        const from = periodStart(r.today, topPeriod);
        let first = "";
        const rows = Object.entries(r.videos || {}).map(([k, v]) => {
            let usd = 0;
            for (const [day, x] of Object.entries(v.days || {})) {
                if (!first || day < first) first = day;
                if (day >= from && day <= r.today) usd += x;
            }
            return { k, v, usd };
        }).filter(x => x.usd > 0).sort((a, c) => c.usd - a.usd);
        const total = rows.reduce((t, x) => t + x.usd, 0);
        const name = ({ k, v }) => {
            const title = esc(v.title || k);
            const id = k.startsWith("yt:") ? k.slice(3) : "";
            return /^[\w-]{6,20}$/.test(id) ? `<a class="cost-vid" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">${title}</a>` : title;
        };
        let html = rows.length
            ? table(`${rows.length} video ${PERIODS[topPeriod]}, tổng ${fm(total)}`, ["Video", "Video dài", "Chi phí"],
                rows.slice(0, 10).map(x => [name(x), x.v.videoSec ? mins(x.v.videoSec) : "", cell(x.usd)]))
            : `<p class="cost-top-sum">Chưa có video nào tốn tiền ${PERIODS[topPeriod]}.</p>`;
        if (rows.length > 10) html += `<p class="cost-top-sum">Còn ${rows.length - 10} video khác, tổng ${fm(rows.slice(10).reduce((t, x) => t + x.usd, 0))}.</p>`;
        if (first && first > from) html += `<p class="cost-top-sum">Chi phí theo từng video được ghi từ ngày ${ddmm(first)}/${first.slice(0, 4)}.</p>`;
        vidEl.innerHTML = html;
    }
    document.querySelectorAll(".cost-period .mode-btn").forEach(b => b.addEventListener("click", () => {
        topPeriod = b.dataset.period;
        try { localStorage.setItem("cstTopPeriod", topPeriod); } catch (e) { /* bỏ qua */ }
        renderTopVideos();
    }));
    document.getElementById("costRefresh")?.addEventListener("click", () => showCostStats());
    document.getElementById("costReset")?.addEventListener("click", async () => {
        if (!confirm("Xóa thống kê chi phí ước tính của hôm nay và phiên này? Bảng 7 ngày và chi phí theo video được giữ lại để đối chiếu.")) return;
        showCostStats(await bgSend({ action: "costReset" }));
    });
    showCostStats();

    // ========================================================
    // 4. TỪ ĐIỂN THUẬT NGỮ
    // ========================================================
    const keepBox = document.getElementById("userKeep");
    const normBox = document.getElementById("userNormalize");
    const enabledBox = document.getElementById("glossaryEnabled");
    const listEl = document.getElementById("groupList");

    const groups = window.CST_GLOSSARY_GROUPS || {};
    const allKeys = Object.keys(groups);

    const savedGlossary = await chrome.storage.sync.get({
        userKeep: "", userNormalize: "", glossaryEnabled: true,
        enabledGroups: allKeys, knownGroups: null
    });
    // A group added in a later version starts ticked even when an older enabledGroups list is stored
    const enabledGroupKeys = window.CST_resolveEnabledGroups
        ? window.CST_resolveEnabledGroups(savedGlossary) : savedGlossary.enabledGroups;

    if (keepBox) keepBox.value = savedGlossary.userKeep;
    if (normBox) normBox.value = savedGlossary.userNormalize;
    if (enabledBox) enabledBox.checked = savedGlossary.glossaryEnabled;

    if (listEl) {
        listEl.innerHTML = "";
        for (const key of allKeys) {
            const row = document.createElement("label");
            row.className = "group-row";
            const box = document.createElement("input");
            box.type = "checkbox";
            box.dataset.group = key;
            box.checked = enabledGroupKeys.includes(key);
            const name = document.createElement("span");
            name.textContent = groups[key].label;
            const count = document.createElement("span");
            count.className = "group-count";
            const viCount = Object.keys(groups[key].vi || {}).length;
            count.textContent = viCount
                ? `${groups[key].terms.length} từ · ${viCount} dịch sẵn`
                : `${groups[key].terms.length} từ`;
            count.title = "Từ \"dịch sẵn\" luôn hiện theo một cách dịch tiếng Việt chuẩn; các từ còn lại giữ nguyên tiếng Anh";
            row.append(box, name, count);
            listEl.appendChild(row);
        }
    }

    // ========================================================
    // 5. CÀI ĐẶT LỒNG TIẾNG
    // ========================================================
    const voiceSel = document.getElementById("dubVoice");
    const duckSlider = document.getElementById("dubDuck");
    const duckValue = document.getElementById("dubDuckValue");
    const volSlider = document.getElementById("dubVolume");
    const volValue = document.getElementById("dubVolumeValue");
    const providerSel = document.getElementById("dubProvider");
    const localVoiceSel = document.getElementById("dubLocalVoice");
    const localVoice2Sel = document.getElementById("dubLocalVoice2");
    const localStatusEl = document.getElementById("localTtsStatus");
    const gVoiceSel = document.getElementById("dubGeminiVoice");
    const gVoice2Sel = document.getElementById("dubGeminiVoice2");
    const ttsModelInput = document.getElementById("dubTtsModel");
    const testBtn = document.getElementById("testVoice");
    const testStatus = document.getElementById("testVoiceStatus");

    const dubSaved = await chrome.storage.sync.get({
        dubVoiceName: "", dubDuck: 0.2, dubVolume: 1, dubProvider: "vieneu", dubPrepareWait: true, dubSystemFallback: true, dubSpeakers: "auto", dubSpeakerAi: true,
        dubGeminiVoice: "Kore", dubGeminiVoice2: "Charon", dubTtsModel: "", dubMaxRate: 0,
        dubLocalVoice: "", dubLocalVoice2: ""
    });

    // ---- Giọng Việt trên máy (VieNeu): danh sách giọng theo vùng + trạng thái máy chủ ----
    const LOCAL = COST.LOCAL_TTS;
    function fillLocalVoices(sel, current, fallback) {
        if (!sel) return;
        sel.innerHTML = "";
        for (const region of ["Nam", "Bắc", "Trung"]) {
            const group = document.createElement("optgroup");
            group.label = `Giọng miền ${region}`;
            for (const v of LOCAL.voices.filter(x => x.region === region)) {
                const op = document.createElement("option");
                op.value = v.id;
                op.textContent = window.CST_COST && window.CST_COST.voiceLabel ? window.CST_COST.voiceLabel(v) : `${v.id} (${v.gender.toLowerCase()}, ${v.style})`;
                group.appendChild(op);
            }
            sel.appendChild(group);
        }
        sel.value = current || fallback;
    }
    fillLocalVoices(localVoiceSel, dubSaved.dubLocalVoice, LOCAL.defaultVoice);
    fillLocalVoices(localVoice2Sel, dubSaved.dubLocalVoice2, LOCAL.defaultVoice2);
    async function refreshLocalStatus() {
        if (!localStatusEl) return false;
        const r = await bgSend({ action: "localTtsStatus" });
        const running = !!(r && r.running);
        localStatusEl.className = "cst-note " + (running ? "ok" : "err");
        // Tốc độ tạo giọng thật: dưới 0,4 là thoải mái; gần 1 thì giọng sẽ trễ dần
        const rtf = Number(r && r.rtf) || 0;
        // The machine and, when the voice cannot keep up, the video speed it can (dub-hardware.js)
        const HW = window.CST_HW;
        const may = HW ? await HW.readMachine() : null;
        const mayTa = may && HW.describeMachine(may) ? ` Máy: ${HW.describeMachine(may)}.` : "";
        const tocChamLai = HW && HW.sustainableRate(rtf) ? ` Phát video ở tốc độ ${String(HW.sustainableRate(rtf)).replace(".", ",")}× thì giọng theo kịp.` : "";
        const tocDo = rtf ? `<br>Tốc độ tạo giọng đo được: <b>${rtf.toFixed(2)}</b> (tạo 1 giây lời nói mất ${rtf.toFixed(2)} giây).${mayTa} ${rtf < 0.4 ? "Tốt." : rtf < 0.8 ? "Hơi chậm, giọng vẫn kịp." : "Quá chậm, giọng sẽ trễ dần: kiểm tra mục ProcessType trong tệp tự khởi động, phải là Interactive." + tocChamLai}` : "";
        localStatusEl.innerHTML = running
            ? `<div class="cst-note-title">✓ Máy chủ VieNeu đang chạy trên máy này (${r.model === LOCAL.model ? LOCAL.modelLabel : esc(r.model || "không rõ model")})</div><div class="cst-note-body">Lồng tiếng dùng giọng Việt miễn phí, không gửi lời thoại ra ngoài. Nhịp nói tự đều theo từng giọng (giọng chậm được tăng tốc nhẹ, giữ cao độ).${tocDo}</div>`
            : `<div class="cst-note-title">Máy chủ VieNeu chưa sẵn sàng</div><div class="cst-note-body">Cài MỘT LẦN để nó tự chạy mỗi khi bật máy: nhấp đúp tệp <b>tools/vieneu-autostart.command</b> (máy Mac) hoặc <b>tools/vieneu-autostart.cmd</b> (máy Windows) trong thư mục tiện ích. Sau đó máy chủ tự bật khi đăng nhập và tự bật lại nếu bị tắt, không phải làm gì nữa. Trang này và trình phát tự nhận ra khi máy chủ sẵn sàng.</div>`;
        return running;
    }
    // The status updates itself: a server that just came up (autostart installed) shows within 5 s,
    // and once it runs every 30 s is enough. Left open, the page asked every 5 s, two requests each
    // time (health, then the model): 5,082 requests in 6 idle hours of the user's server log (2.3.3)
    // The first check runs even in a background tab, as it always did
    let localRunning = false;
    const pollLocal = async first => {
        if (first === true || !document.hidden) localRunning = await refreshLocalStatus();
        setTimeout(pollLocal, localRunning ? 30000 : 5000);
    };
    if (localStatusEl) pollLocal(true);

    function fillVoices() {
        if (!voiceSel) return;
        const voices = speechSynthesis.getVoices();
        const vi = voices.filter(v => (v.lang || "").toLowerCase().startsWith("vi"));
        voiceSel.innerHTML = "";
        if (vi.length === 0) {
            const opt = document.createElement("option");
            opt.textContent = "Máy chưa có giọng tiếng Việt";
            opt.value = "";
            voiceSel.appendChild(opt);
            return;
        }
        for (const v of vi) {
            const opt = document.createElement("option");
            opt.value = v.name;
            opt.textContent = `${v.name} (${v.lang})`;
            if (v.name === dubSaved.dubVoiceName) opt.selected = true;
            voiceSel.appendChild(opt);
        }
    }
    fillVoices();
    speechSynthesis.addEventListener("voiceschanged", fillVoices);

    if (providerSel) providerSel.value = dubSaved.dubProvider;
    // 1.8.1: only VieNeu is offered while the paid voice is off; an old "gemini" / "auto" shows VieNeu
    if (providerSel && !providerSel.value) providerSel.value = "vieneu";
    const speakersSel = document.getElementById("dubSpeakers");
    if (speakersSel) speakersSel.value = dubSaved.dubSpeakers === "one" ? "one" : "auto";
    const speakerAiBox = document.getElementById("dubSpeakerAi");
    if (speakerAiBox) speakerAiBox.checked = dubSaved.dubSpeakerAi !== false;
    const prepareWaitBox = document.getElementById("dubPrepareWait");
    if (prepareWaitBox) prepareWaitBox.checked = dubSaved.dubPrepareWait !== false;
    const systemFallbackBox = document.getElementById("dubSystemFallback");
    if (systemFallbackBox) systemFallbackBox.checked = dubSaved.dubSystemFallback !== false;
    if (gVoiceSel) gVoiceSel.value = dubSaved.dubGeminiVoice;
    if (gVoice2Sel) gVoice2Sel.value = dubSaved.dubGeminiVoice2;
    const maxRateSel = document.getElementById("dubMaxRate");
    if (maxRateSel) maxRateSel.value = String(Number(dubSaved.dubMaxRate) || 0);
    if (ttsModelInput) {
        ttsModelInput.value = dubSaved.dubTtsModel || "";
        ttsModelInput.placeholder = COST.DEFAULT_MODELS.tts;
    }
    const bindPct = (slider, label, val) => {
        if (!slider || !label) return;
        slider.value = Math.round(val * 100);
        label.textContent = `${slider.value}%`;
        slider.addEventListener("input", () => { label.textContent = `${slider.value}%`; });
    };
    bindPct(duckSlider, duckValue, dubSaved.dubDuck);
    bindPct(volSlider, volValue, dubSaved.dubVolume);

    // Nghe thử: chạy qua đúng pipeline (kế hoạch ngữ điệu -> giọng), không đọc thô
    if (testBtn) {
        // One voice preview at a time: a new one stops the previous, and the blob URL is released when it ends
        let previewAudio = null, previewUrl = "";
        const newPreviewAudio = blob => {
            if (previewAudio) { try { previewAudio.pause(); } catch (e) { /* ignore */ } }
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = URL.createObjectURL(blob);
            const url = previewUrl;
            previewAudio = new Audio(url);
            previewAudio.addEventListener("ended", () => { URL.revokeObjectURL(url); if (previewUrl === url) previewUrl = ""; }, { once: true });
            return previewAudio;
        };
        testBtn.addEventListener("click", async () => {
            const P = window.CST_DUB_PLAN, E = window.CST_DUB_ENGINE, A = window.CST_DUB_AUDIO;
            const sample = [
                { en: "Now... what we need to understand is how the model processes its input.", vi: "Bây giờ, ¦ điều chúng ta cần hiểu là ¦ cách mô hình xử lý dữ liệu đầu vào.", start: 0, end: 3.6, pauses: [{ frac: 0.06, dur: 0.35, opener: true }] },
                { en: "Really?", vi: "Thật sao?", start: 4.2, end: 5, pauses: [] },
                { en: "This is a very important concept, so remember it.", vi: "Đây là một khái niệm rất quan trọng, ¦ các bạn hãy ghi nhớ nhé.", start: 5.6, end: 8.8, pauses: [] }
            ];
            const plans = sample.map((s, i) => P.planSegment({ id: "t" + i, index: i, start: s.start, end: s.end, slotEnd: s.end + 0.4, speaker: "S1", subtitleText: s.vi, speechSource: s.vi, srcText: s.en, sourcePauses: s.pauses, continuesNext: false }));
            const provider = providerSel ? providerSel.value : "vieneu";
            const key = (geminiKeyInput?.value || "").trim();
            const useGemini = !!COST.PAID_TTS && (provider === "gemini" || (provider === "auto" && key && (optUseAiBox ? optUseAiBox.checked : true)));
            speechSynthesis.cancel();
            // VieNeu (giọng Việt trên máy): chọn VieNeu, hoặc Tự động khi máy chủ đang chạy
            if ((provider === "vieneu" || provider === "auto") && await refreshLocalStatus()) {
                testStatus.textContent = "⏳ Đang tạo giọng VieNeu trên máy...";
                const t0 = performance.now();
                const text = plans.map(p => E.plainScript(p)).join(" ");
                const res = await new Promise(r => chrome.runtime.sendMessage({ action: "synthesizeSpeech", engine: LOCAL.id, text, voice: localVoiceSel.value }, r));
                if (!res || !res.ok) { testStatus.textContent = `✕ VieNeu lỗi: ${res ? res.error : "không phản hồi"}`; return; }
                const bytes = A.base64ToBytes(res.audio);
                const clean = A.prepareSpeech(/wav/i.test(res.mimeType || "") ? A.decodeWav(bytes).samples : A.pcm16leToFloat(bytes), res.sampleRate);
                const audio = newPreviewAudio(new Blob([A.encodeWav(clean, res.sampleRate)], { type: "audio/wav" }));
                audio.volume = Number(volSlider.value) / 100;
                // Cùng tốc độ sàn như khi lồng tiếng thật (giọng chậm không dưới ~4 âm tiết/giây nghe
                // được, giữ cao độ); khi lồng tiếng, câu dày chữ còn được nhanh thêm cho khớp phụ đề
                const vmeta = LOCAL.voices.find(v => v.id === localVoiceSel.value);
                const tempo = Math.max(0.95, Math.min(LOCAL.maxFloor || 1.15, (LOCAL.minSps || 4) / (((vmeta && vmeta.sps) || 4.8) * 0.86)));
                audio.preservesPitch = true;
                audio.playbackRate = tempo;
                audio.play();
                testStatus.textContent = `✓ Giọng ${localVoiceSel.value} (VieNeu trên máy, nhịp x${tempo.toFixed(2)}), dài ${(clean.length / res.sampleRate).toFixed(1)} giây, tạo trong ${((performance.now() - t0) / 1000).toFixed(1)} giây, miễn phí.`;
                return;
            }
            if (provider === "vieneu") { testStatus.textContent = "✕ Máy chủ VieNeu chưa chạy (xem hướng dẫn ở trên)."; return; }
            if (useGemini) {
                testStatus.textContent = "⏳ Đang tạo giọng Gemini AI...";
                await chrome.storage.sync.set({ geminiApiKey: key });
                const res = await new Promise(r => chrome.runtime.sendMessage({ action: "synthesizeSpeech", text: E.geminiScript(plans), voice: gVoiceSel.value, model: ttsModelInput.value.trim() }, r));
                if (!res || !res.ok) { testStatus.textContent = `✕ Gemini TTS lỗi: ${res ? res.error : "không phản hồi"}`; return; }
                const bytes = A.base64ToBytes(res.audio);
                const samples = /wav/i.test(res.mimeType || "") ? A.decodeWav(bytes).samples : A.pcm16leToFloat(bytes);
                const clean = A.prepareSpeech(samples, res.sampleRate);
                const audio = newPreviewAudio(new Blob([A.encodeWav(clean, res.sampleRate)], { type: "audio/wav" }));
                audio.volume = Number(volSlider.value) / 100;
                audio.play();
                testStatus.textContent = `✓ Giọng ${gVoiceSel.value} (model ${res.model}), dài ${(clean.length / res.sampleRate).toFixed(1)} giây.`;
                return;
            }
            // Giọng hệ thống: phát từng cụm đúng mốc, giữ khoảng ngừng và ngữ điệu đã lập
            const voice = speechSynthesis.getVoices().find(v => v.name === voiceSel?.value);
            testStatus.textContent = voice ? `▶ Giọng hệ thống ${voice.name}, theo kế hoạch ngữ điệu (nhịp mở đầu, câu hỏi lên giọng, nhấn mạnh).` : "✕ Máy chưa có giọng tiếng Việt.";
            if (!voice) return;
            const t0 = performance.now();
            for (const p of plans) for (const ph of p.phrases) {
                const at = (p.start + ph.offset) * 1000;
                setTimeout(() => {
                    const u = new SpeechSynthesisUtterance(ph.text);
                    u.voice = voice; u.lang = "vi-VN";
                    u.rate = p.rate * ph.rateMul; u.pitch = ph.pitchMul;
                    u.volume = Number(volSlider.value) / 100;
                    speechSynthesis.speak(u);
                }, Math.max(0, at - (performance.now() - t0)));
            }
        });
    }

    // ========================================================
    // 6. LƯU TẤT CẢ CÀI ĐẶT
    // ========================================================
    const statusEl = document.getElementById("saveStatus");

    function flashStatus(msg) {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.classList.add("show");
    }

    // Thu thap toan bo cai dat hien tai tren trang
    function collectSettings() {
        const pickedGroups = listEl
            ? [...listEl.querySelectorAll("input:checked")].map(b => b.dataset.group)
            : allKeys;
        return {
            // Subtitle style
            subStyle: S.normalizeStyle(currentStyle),
            dualMode: currentStyle.mode === "dual",

            // AI
            useAi: optUseAiBox ? optUseAiBox.checked : true,
            geminiApiKey: (geminiKeyInput?.value || "").trim(),
            geminiModel: getEffectiveModel(),
            geminiStrongModel: strongSel ? strongSel.value : COST.DEFAULT_MODELS.strong,
            costMode: costModeSel ? costModeSel.value : "balanced",
            autoTranslate: autoTranslateBox ? autoTranslateBox.checked : true,
            dubEnabled: autoDubBox ? autoDubBox.checked : true,
            perCueMode: perCueBox ? perCueBox.checked : false,
            skipSameLang: skipSameLangBox ? skipSameLangBox.checked : true,
            budgetDailyUsd: budgetUsd.daily,
            budgetVideoUsd: budgetUsd.video,
            costUsdVnd: moneyO.rate,
            costExtraPct: moneyO.extraPct,

            // Glossary
            glossaryEnabled: enabledBox ? enabledBox.checked : true,
            userKeep: keepBox ? keepBox.value : "",
            userNormalize: normBox ? normBox.value : "",
            enabledGroups: pickedGroups,
            knownGroups: allKeys,

            // Lồng tiếng
            dubVoiceName: voiceSel ? voiceSel.value : "",
            dubDuck: duckSlider ? Number(duckSlider.value) / 100 : 0.2,
            dubVolume: volSlider ? Number(volSlider.value) / 100 : 1,
            dubProvider: providerSel ? providerSel.value : "vieneu",
            dubPrepareWait: document.getElementById("dubPrepareWait") ? document.getElementById("dubPrepareWait").checked : true,
            dubSystemFallback: document.getElementById("dubSystemFallback") ? document.getElementById("dubSystemFallback").checked : true,
            dubSpeakers: speakersSel ? speakersSel.value : "auto",
            dubSpeakerAi: speakerAiBox ? speakerAiBox.checked : true,
            dubGeminiVoice: gVoiceSel ? gVoiceSel.value : "Kore",
            dubGeminiVoice2: gVoice2Sel ? gVoice2Sel.value : "Charon",
            dubTtsModel: ttsModelInput ? ttsModelInput.value.trim() : "",
            dubMaxRate: maxRateSel ? Number(maxRateSel.value) || 0 : 0,
            dubLocalVoice: localVoiceSel ? localVoiceSel.value : "",
            dubLocalVoice2: localVoice2Sel ? localVoice2Sel.value : ""
        };
    }

    // ---- TỰ ĐỘNG LƯU & ÁP DỤNG NGAY ----
    // Mọi thay đổi được lưu sau ~0,35 giây (gộp các thao tác kéo thanh trượt,
    // gõ phím) để không vượt hạn mức ghi của chrome.storage.sync. Trang video
    // đang mở lắng nghe thay đổi và cập nhật phụ đề ngay, không cần tải lại.
    let saveTimer = null;
    let lastSaved = "";
    // Set once a backup is imported: the form on screen is stale until the page reloads, and any
    // save from it (a pending one, the pagehide flush) would write the old values over the import
    let saveFrozen = false;
    async function saveNow() {
        clearTimeout(saveTimer);
        saveTimer = null;
        if (saveFrozen) return;
        const data = collectSettings();
        const sig = JSON.stringify(data);
        if (sig === lastSaved) return;
        if (statusEl) {
            statusEl.textContent = "Đang lưu...";
            statusEl.classList.add("show");
        }
        try {
            await chrome.storage.sync.set(data);
            lastSaved = sig;
            const now = new Date();
            const hhmmss = [now.getHours(), now.getMinutes(), now.getSeconds()].map(x => String(x).padStart(2, "0")).join(":");
            if (statusEl) statusEl.textContent = `✓ Đã tự lưu và áp dụng lúc ${hhmmss}`;
        } catch (e) {
            if (statusEl) statusEl.textContent = `⚠ Chưa lưu được: ${e.message}`;
        }
    }
    function scheduleSave() {
        clearTimeout(saveTimer);
        if (saveFrozen) { saveTimer = null; return; }
        saveTimer = setTimeout(saveNow, 350);
    }
    const area = document.querySelector(".content-area") || document.body;
    // backup controls are not settings: ticking "include the key" must not rewrite every key
    const saveUnlessBackup = e => { if (!(e.target && e.target.dataset && e.target.dataset.noSave)) scheduleSave(); };
    area.addEventListener("input", saveUnlessBackup, true);
    area.addEventListener("change", saveUnlessBackup, true);
    document.addEventListener("click", e => {
        if (e.target.closest(".mode-btn, .color-dot, #resetDefaultBtn")) scheduleSave();
    }, true);
    // Đóng tab khi còn thay đổi chưa ghi: ghi ngay
    window.addEventListener("pagehide", () => { if (saveTimer) saveNow(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden && saveTimer) saveNow(); });

    // ---- Khung xem thử: hiện luôn nhãn lồng tiếng như ngoài đời ----
    function veNhanLongTieng() {
        const badge = document.getElementById("previewDubBadge");
        if (!badge) return;
        const on = autoDubBox ? autoDubBox.checked : true;
        const prov = providerSel ? providerSel.value : "vieneu";
        const giong = prov === "gemini" ? (gVoiceSel ? gVoiceSel.value : "Kore")
            : prov === "system" ? ((voiceSel && voiceSel.value) || "giọng hệ thống")
                : ((localVoiceSel && localVoiceSel.value) || COST.LOCAL_TTS.defaultVoice);
        badge.textContent = `Lồng tiếng: ${giong}`;
        badge.hidden = !on;
    }
    [autoDubBox, providerSel, localVoiceSel, gVoiceSel, voiceSel].forEach(el => el && el.addEventListener("change", veNhanLongTieng));
    veNhanLongTieng();

    // ---- Lịch sử phiên bản (dữ liệu ở version-history.js) ----
    // Each version folds; the newest is open. HIST_PAGE versions at first, more on request; a search
    // looks through all of them and opens every match.
    const HIST_PAGE = 15;
    let histShown = HIST_PAGE;
    let installed = "";
    try { installed = chrome.runtime.getManifest().version; } catch (e) { /* ngoài tiện ích */ }
    function veLichSu(loc) {
        const box = document.getElementById("historyList");
        if (!box || !window.CST_HISTORY) return;
        const tu = (loc || "").trim().toLowerCase();
        const khop = m => !tu || (m.v + " " + m.ten + " " + m.y.join(" ") + " " + (m.bang ? JSON.stringify(m.bang) : "")).toLowerCase().includes(tu);
        const ds = window.CST_HISTORY.HISTORY.filter(khop);
        box.textContent = "";
        if (!ds.length) {
            const p = document.createElement("p");
            p.className = "ver-empty";
            p.textContent = "Không có bản nào khớp với từ khóa này.";
            box.appendChild(p);
            return;
        }
        if (tu) {
            const p = document.createElement("p");
            p.className = "ver-count";
            p.textContent = `${ds.length} bản khớp`;
            box.appendChild(p);
        }
        const shown = tu ? ds : ds.slice(0, histShown);
        for (const [i, m] of shown.entries()) {
            const item = document.createElement("details");
            item.className = "ver-item";
            item.open = !!tu || i === 0;
            const head = document.createElement("summary");
            head.className = "ver-head";
            const num = document.createElement("span");
            num.className = "ver-num";
            num.textContent = "v" + m.v;
            const ten = document.createElement("span");
            ten.className = "ver-name";
            ten.textContent = m.ten;
            head.appendChild(num);
            head.appendChild(ten);
            if (m.v === installed) {
                const now = document.createElement("span");
                now.className = "ver-badge";
                now.textContent = "Đang dùng";
                head.appendChild(now);
            }
            if (m.luc) {
                const t = document.createElement("span");
                t.className = "ver-time";
                t.textContent = m.luc;
                head.appendChild(t);
            }
            item.appendChild(head);
            const ul = document.createElement("ul");
            ul.className = "ver-list";
            for (const d of m.y) {
                const li = document.createElement("li");
                li.textContent = d;
                ul.appendChild(li);
            }
            item.appendChild(ul);
            if (m.bang) {
                const tb = document.createElement("table");
                tb.className = "ver-table";
                const thead = document.createElement("thead");
                const trh = document.createElement("tr");
                for (const c of m.bang.cot) {
                    const th = document.createElement("th");
                    th.textContent = c;
                    trh.appendChild(th);
                }
                thead.appendChild(trh);
                tb.appendChild(thead);
                const tbody = document.createElement("tbody");
                for (const h of m.bang.hang) {
                    const tr = document.createElement("tr");
                    for (const o of h) {
                        const td = document.createElement("td");
                        td.textContent = o;
                        tr.appendChild(td);
                    }
                    tbody.appendChild(tr);
                }
                tb.appendChild(tbody);
                item.appendChild(tb);
            }
            box.appendChild(item);
        }
        if (!tu && ds.length > shown.length) {
            const more = document.createElement("button");
            more.type = "button";
            more.className = "btn btn-secondary ver-more";
            more.textContent = `Xem thêm ${Math.min(20, ds.length - shown.length)} bản cũ hơn (còn ${ds.length - shown.length})`;
            more.addEventListener("click", () => { histShown += 20; veLichSu(""); });
            box.appendChild(more);
        }
    }
    const historyFilter = document.getElementById("historyFilter");
    if (historyFilter) historyFilter.addEventListener("input", () => veLichSu(historyFilter.value));
    veLichSu("");
    const historySummary = document.getElementById("historySummary");
    if (historySummary && window.CST_HISTORY) {
        const ds = window.CST_HISTORY.HISTORY;
        historySummary.textContent = `${ds.length} bản, từ bản đầu tiên tới v${ds[0].v}. Bấm vào một bản để xem đã sửa gì; bản có số đo thật kèm bảng so sánh trước và sau.`;
    }

    // ---- Shortcuts (shortcuts.js): none set out of the box; "Tùy chỉnh" records the next combination ----
    const SC = window.CST_SHORTCUTS;
    const scList = document.getElementById("shortcutList");
    const scStatus = document.getElementById("shortcutStatus");
    if (SC && scList) {
        const mac = SC.isMac();
        let scMap = {};
        let recording = null;                // { action, chip, btn }
        const lowerFirst = t => t.charAt(0).toLowerCase() + t.slice(1);
        const say = (msg, warn) => { if (scStatus) { scStatus.textContent = msg; scStatus.style.color = warn ? "var(--primary)" : ""; } };
        const desc = document.getElementById("shortcutDesc");
        if (desc) desc.textContent = mac
            ? "Chưa có phím nào được đặt sẵn. Bấm \"Tùy chỉnh\" rồi nhấn tổ hợp phím bạn muốn, có giữ ⌘ Command, ⌥ Option hoặc ⌃ Control. Dùng được khi đang xem YouTube hoặc Coursera."
            : "Chưa có phím nào được đặt sẵn. Bấm \"Tùy chỉnh\" rồi nhấn tổ hợp phím bạn muốn, có giữ Ctrl hoặc Alt. Dùng được khi đang xem YouTube hoặc Coursera.";
        const save = async map => {
            scMap = SC.clean(map);
            try { await chrome.storage.sync.set({ [SC.KEY]: scMap }); } catch (e) { say(`⚠ Chưa lưu được: ${e.message}`, true); }
            renderShortcuts();
        };
        function stopRecording() {
            if (!recording) return;
            window.removeEventListener("keydown", onRecordKey, true);
            recording = null;
            renderShortcuts();
        }
        function onRecordKey(e) {
            if (!recording) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.code === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) { say("Đã hủy, giữ phím cũ."); stopRecording(); return; }
            const combo = SC.fromEvent(e);
            if (!combo) {
                // only modifiers so far: show them while the viewer looks for the key
                const held = SC.format({ code: "-", ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey }, mac).replace(/\+?-$/, "");
                recording.chip.textContent = held ? held + (mac ? "…" : "+…") : "Nhấn tổ hợp phím…";
                return;
            }
            const why = SC.problem(combo, scMap, recording.action, mac);
            if (why) { say(`⚠ ${why}`, true); return; }
            const action = recording.action;
            window.removeEventListener("keydown", onRecordKey, true);
            recording = null;
            say(`✓ Đã đặt ${SC.format(combo, mac)} cho "${lowerFirst(SC.ACTIONS.find(a => a.id === action).label)}".`);
            save({ ...scMap, [action]: combo });
        }
        function renderShortcuts() {
            scList.textContent = "";
            for (const a of SC.ACTIONS) {
                const row = document.createElement("div");
                row.className = "sc-row";
                const label = document.createElement("span");
                label.className = "sc-label";
                label.textContent = a.label;
                const chip = document.createElement("span");
                const isRec = recording && recording.action === a.id;
                chip.className = "sc-keys" + (isRec ? " recording" : scMap[a.id] ? "" : " empty");
                chip.textContent = isRec ? "Nhấn tổ hợp phím…" : scMap[a.id] ? SC.format(scMap[a.id], mac) : "Chưa đặt";
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "btn btn-secondary";
                btn.textContent = isRec ? "Hủy" : "Tùy chỉnh";
                btn.addEventListener("click", () => {
                    if (isRec) { say("Đã hủy, giữ phím cũ."); stopRecording(); return; }
                    if (recording) stopRecording();
                    recording = { action: a.id, chip, btn };
                    say(mac ? "Nhấn tổ hợp phím, ví dụ ⌥S hoặc ⌃⇧D. Esc để hủy." : "Nhấn tổ hợp phím, ví dụ Alt+S hoặc Ctrl+Shift+D. Esc để hủy.");
                    window.addEventListener("keydown", onRecordKey, true);
                    renderShortcuts();
                });
                row.appendChild(label);
                row.appendChild(chip);
                row.appendChild(btn);
                {
                    // always there, hidden when there is nothing to clear, so the columns line up
                    const del = document.createElement("button");
                    if (!scMap[a.id] || isRec) del.style.visibility = "hidden";
                    del.type = "button";
                    del.className = "btn btn-secondary";
                    del.textContent = "Xóa";
                    del.title = "Bỏ phím tắt này";
                    del.addEventListener("click", () => {
                        const next = { ...scMap };
                        delete next[a.id];
                        say(`Đã bỏ phím tắt "${lowerFirst(a.label)}".`);
                        save(next);
                    });
                    row.appendChild(del);
                }
                scList.appendChild(row);
            }
        }
        renderShortcuts();
        Promise.resolve().then(() => chrome.storage.sync.get({ [SC.KEY]: {} }))
            .then(r => { scMap = SC.clean(r && r[SC.KEY]); renderShortcuts(); }, () => {});
    }

    // ---- Giao diện Sáng / Tối / Theo máy ----
    const themeBtns = [...document.querySelectorAll(".theme-btn")];
    function veTheme() {
        const cur = window.CST_THEME ? window.CST_THEME.get() : "auto";
        themeBtns.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeSet === cur)));
    }
    themeBtns.forEach(b => b.addEventListener("click", () => {
        if (window.CST_THEME) window.CST_THEME.set(b.dataset.themeSet);
        veTheme();
    }));
    veTheme();

    // ---- TỐI GIẢN: chỉ hiện mục thuộc lựa chọn hiện tại ----
    // Giọng VieNeu / Gemini / hệ thống: chỉ hiện ô chọn giọng của nguồn đang dùng; mục Gemini (key,
    // model, ngân sách) chỉ hiện khi bật dịch Gemini hoặc chọn giọng Gemini; model mạnh chỉ ở chế độ Cao cấp
    const groupOf = id => { const el = document.getElementById(id); return el ? (el.closest(".form-group") || el) : null; };
    const showIf = (el, on) => { if (el) el.classList.toggle("is-off", !on); };
    function capNhatHienThi() {
        const prov = providerSel ? providerSel.value : "vieneu";
        const useAi = optUseAiBox ? optUseAiBox.checked : true;
        const local = prov === "vieneu" || prov === "auto";
        const gem = prov === "gemini" || prov === "auto";
        const sys = prov === "system" || prov === "auto";
        const two = !speakersSel || speakersSel.value !== "one";
        ["localTtsStatus", "dubLocalVoice"].forEach(id => showIf(groupOf(id), local));
        showIf(groupOf("dubLocalVoice2"), local && two);
        ["dubGeminiVoice", "dubTtsModel"].forEach(id => showIf(groupOf(id), gem));
        showIf(groupOf("dubGeminiVoice2"), gem && two);
        showIf(groupOf("dubVoice"), sys);
        ["geminiApiKeyInput", "geminiModelSelect", "customModelInput"].forEach(id => showIf(groupOf(id), useAi || gem));
        showIf(groupOf("geminiStrongModel"), useAi && (!costModeSel || costModeSel.value === "premium"));
        const budgetCard = document.getElementById("budgetDailyUsd");
        showIf(budgetCard && budgetCard.closest(".card"), useAi || gem);
    }
    [providerSel, optUseAiBox, costModeSel, speakersSel].forEach(el => el && el.addEventListener("change", capNhatHienThi));
    capNhatHienThi();

    // Giá trị ban đầu coi như đã lưu (tránh ghi thừa khi vừa mở trang)
    lastSaved = JSON.stringify(collectSettings());

    // ---- Backup / restore (settings-backup.js) ----
    const BK = window.CST_BACKUP;
    const backupStatus = document.getElementById("backupStatus");
    const sayBackup = (msg, warn) => {
        if (!backupStatus) return;
        backupStatus.textContent = msg;
        backupStatus.style.color = warn ? "var(--primary)" : "";
    };
    const exportBtn = document.getElementById("backupExport");
    if (BK && exportBtn) exportBtn.addEventListener("click", async () => {
        try {
            await saveNow();                                   // a change still waiting for its 350 ms
            const sync = await chrome.storage.sync.get(null);
            const includeKey = !!(document.getElementById("backupIncludeKey") || {}).checked;
            const data = BK.buildBackup(sync, { includeKey, appVersion: chrome.runtime.getManifest ? chrome.runtime.getManifest().version : "" });
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = BK.fileName();
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            sayBackup(`✓ Đã xuất ${Object.keys(data.sync).length} mục cài đặt${data.hasKey ? ", kèm API Key" : includeKey ? " (chưa có API Key nào để kèm)" : ", không kèm API Key"}. Tệp nằm trong thư mục Tải về.`);
        } catch (e) {
            sayBackup(`⚠ Chưa xuất được: ${e.message}`, true);
        }
    });
    const importBtn = document.getElementById("backupImport");
    const fileInput = document.getElementById("backupFile");
    if (BK && importBtn && fileInput) {
        importBtn.addEventListener("click", () => { fileInput.value = ""; fileInput.click(); });
        fileInput.addEventListener("change", async () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            const parsed = BK.parseBackup(await file.text());
            if (!parsed.ok) { sayBackup(`⚠ ${parsed.error}`, true); return; }
            const sm = parsed.summary;
            const when = sm.exported ? new Date(sm.exported).toLocaleString("vi-VN") : "không rõ";
            const ask = `Nhập tệp sao lưu (tạo lúc ${when}${sm.app ? `, phiên bản ${sm.app}` : ""})?\n\n` +
                `- ${sm.settings} mục cài đặt${sm.hasKey ? ", kèm API Key" : " (không có API Key: giữ khóa đang dùng)"}\n\n` +
                "Cài đặt hiện tại sẽ bị thay bằng nội dung trong tệp.";
            if (!confirm(ask)) { sayBackup("Đã hủy, không đổi gì."); return; }
            let wroteSync = false;
            try {
                saveFrozen = true;                             // the form on screen is about to be stale
                clearTimeout(saveTimer);
                saveTimer = null;
                await chrome.storage.sync.set(parsed.sync);
                wroteSync = true;
                sayBackup("✓ Đã nhập. Đang tải lại trang Cài đặt…");
                setTimeout(() => location.reload(), 600);
            } catch (e) {
                if (!wroteSync) saveFrozen = false;            // nothing was replaced: the form is current
                sayBackup(`⚠ Chưa nhập được: ${e.message}`, true);
            }
        });
    }
    if (statusEl) {
        statusEl.textContent = "Mọi thay đổi được tự lưu và áp dụng ngay";
        statusEl.classList.add("show");
    }
});

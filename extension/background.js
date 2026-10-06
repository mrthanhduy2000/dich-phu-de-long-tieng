// ============================================================
// TIẾN TRÌNH NỀN (service worker)
//
// Thứ tự ưu tiên chi phí:  LOCAL -> CACHE -> MODEL RẺ -> MODEL MẠNH (khi cần) -> TTS (khi cần)
//
// - Dịch theo đoạn có ngữ cảnh (translateUnit), kho bản dịch bền vững (IndexedDB)
// - Gemini TTS: kho audio bền vững, lưu NGAY khi nhận audio (trước khi trả lời),
//   yêu cầu trùng chỉ tạo audio một lần
// - Gọi Gemini: API Key gửi qua header (không nằm trong URL), phân loại lỗi theo
//   tài liệu lỗi của Gemini API, thử lại có giới hạn + chờ tăng dần
// - Dự phòng: Google Translate (không ngữ cảnh) khi Gemini không dùng được
// ============================================================

// Bộ nhớ đệm bền vững (IndexedDB) + chính sách chi phí + xử lý audio dùng chung
// (1.7.6: the pause shaping reads the text's structure: segmenter, syllable count, prosody model)
try { importScripts("cst-cache.js", "cost-policy.js", "vi-segmenter.js", "dub-planner.js", "dub-prosody.js", "dub-speech.js", "dub-audio.js"); } catch (e) { /* chạy ngoài service worker (kiểm thử) */ }

const COST = CST_COST;
const AUDIO = typeof CST_DUB_AUDIO !== "undefined" ? CST_DUB_AUDIO : null;

// ============================================================
// DỰ PHÒNG: GOOGLE TRANSLATE (miễn phí, không ngữ cảnh)
// ============================================================
const ENDPOINTS = [
    (text, sl, tl) => `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`,
    (text, sl, tl) => `https://translate.google.com/translate_a/single?client=at&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`,
    (text, sl, tl) => `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sl}&tl=${tl}&q=${encodeURIComponent(text)}`
];
const MAX_RETRY = 2;
const FAST_TIMEOUT_MS = 3200;

async function fetchSingleEndpoint(url, timeoutMs = FAST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { method: "GET", signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // clients5 (dict-chrome-ex) answers [["bản dịch", "en"]] when sl=auto: text, then the
        // detected language. Read as segments, the language code was glued onto the line ("...xem.en")
        if (Array.isArray(data) && Array.isArray(data[0]) && typeof data[0][0] === "string") {
            if (data[0][0].trim()) return { text: data[0][0], detectedLang: data[0][1] || "en" };
        } else if (Array.isArray(data)) {
            const segments = Array.isArray(data[0]) ? data[0] : [data];
            let translated = "";
            for (const seg of segments) {
                if (seg && typeof seg[0] === "string") translated += seg[0];
                else if (typeof seg === "string") translated += seg;
            }
            if (translated.trim()) return { text: translated, detectedLang: data[2] || "en" };
        } else if (typeof data === "string") {
            return { text: data, detectedLang: "en" };
        }
        throw new Error("Phản hồi không hợp lệ");
    } finally {
        clearTimeout(timer);
    }
}

async function callTranslateApi(text, sourceLang, targetLang) {
    const sl = sourceLang || "auto";
    const tl = targetLang || "vi";
    // 1. Thử endpoint nhanh nhất trước
    try {
        return await fetchSingleEndpoint(ENDPOINTS[0](text, sl, tl), 2500);
    } catch (e) { /* thử các endpoint còn lại */ }
    // 2. Chạy đua các endpoint dự phòng, lấy kết quả về sớm nhất
    try {
        return await Promise.any(ENDPOINTS.slice(1).map(b => fetchSingleEndpoint(b(text, sl, tl), FAST_TIMEOUT_MS)));
    } catch (err) {
        throw new Error("Không thể kết nối máy chủ dịch nhanh");
    }
}

async function callMyMemoryTranslate(text, sourceLang = "en", targetLang = "vi") {
    const sl = sourceLang === "auto" ? "en" : sourceLang;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sl}|${targetLang}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.responseData && data.responseData.translatedText) {
            return { text: data.responseData.translatedText, detectedLang: sl, engine: "mymemory" };
        }
        throw new Error("Invalid MyMemory data");
    } finally {
        clearTimeout(timer);
    }
}

async function translateWithRetry(text, sourceLang, targetLang) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        try {
            return await callTranslateApi(text, sourceLang, targetLang);
        } catch (err) {
            lastError = err;
            if (attempt < MAX_RETRY) await new Promise(r => setTimeout(r, 150 * attempt));
        }
    }
    try {
        return await callMyMemoryTranslate(text, sourceLang, targetLang);
    } catch (memErr) { /* bỏ qua */ }
    throw lastError || new Error("Không thể dịch được câu này");
}

// A whole window in one request, one sentence per line, split back by line. Sent one request per
// sentence, a 16-line Coursera window fired 16 requests at once (48 when the first endpoint
// failed), which is what gets an IP rate-limited. When the line count does not come back intact
// (Google merged or split a line), each sentence is asked alone as before.
const GOOGLE_BATCH_MAX_CHARS = 4000;
async function googleTranslateAll(sentences) {
    const idx = sentences.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
    const out = sentences.map(() => "");
    if (!idx.length) return out;
    const lines = idx.map(i => sentences[i].replace(/\s*\n+\s*/g, " "));
    const joined = lines.join("\n");
    if (idx.length > 1 && joined.length <= GOOGLE_BATCH_MAX_CHARS) {
        try {
            const back = (await callTranslateApi(joined, "auto", "vi")).text.split("\n").map(s => s.trim());
            if (back.length === idx.length && back.every(Boolean)) {
                idx.forEach((i, k) => { out[i] = back[k]; });
                return out;
            }
        } catch (e) { /* asked one by one below */ }
    }
    // One sentence that fails on every endpoint comes back "" (the page leaves that line
    // untranslated and asks again later) instead of failing the window: one bad sentence used to
    // blank all 16, and Coursera then re-sent each line alone, a Gemini call apiece
    const settled = await Promise.allSettled(idx.map(i => translateWithRetry(sentences[i], "auto", "vi")));
    const failed = settled.filter(r => r.status === "rejected");
    if (failed.length === idx.length) throw failed[0].reason;
    idx.forEach((i, k) => { if (settled[k].status === "fulfilled") out[i] = settled[k].value.text; });
    return out;
}

// ============================================================
// GỌI GEMINI API: phân loại lỗi, thử lại có giới hạn, ngắt mạch theo từng model
//
// Theo tài liệu lỗi của Gemini API:
//   400/416 yêu cầu sai, 401/403 khóa sai / thiếu quyền, 402 hết tiền trả trước,
//   404 model không có -> KHÔNG thử lại
//   429 vượt giới hạn tốc độ (theo phút) / hết hạn mức ngày -> chờ, không dồn yêu cầu
//   500/503/504, lỗi mạng -> thử lại có giới hạn, chờ tăng dần (exponential backoff)
// ============================================================
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

class GeminiError extends Error {
    constructor(type, message, extra = {}) {
        super(message);
        this.type = type;
        Object.assign(this, extra);
    }
}

// Hạn mức tính theo từng model: model này bị giới hạn không chặn model khác
const modelCooldown = new Map();    // model -> { until, type, reason }
const missingModels = new Set();    // model không tồn tại / không làm được việc này (trong phiên)
const noThinkingCfg = new Set();    // model không nhận cấu hình mức suy nghĩ
let keyBlock = null;                // { key, until, type, reason }: khóa sai / thiếu quyền / hết tiền

const sleep = (ms, signal) => new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new GeminiError("aborted", "Đã hủy"));
    // the abort listener goes when the wait ends, not only when it fires: a job's signal lives on
    const onAbort = () => { clearTimeout(t); reject(new GeminiError("aborted", "Đã hủy")); };
    const t = setTimeout(() => { if (signal) signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
});

function retryDelayMs(body) {
    const info = (body?.error?.details || []).find(d => /RetryInfo/.test(d["@type"] || ""));
    const m = info && String(info.retryDelay || "").match(/^([\d.]+)s$/);
    return m ? Math.round(parseFloat(m[1]) * 1000) : null;
}

function classifyHttp(status, body) {
    const msg = String(body?.error?.message || "");
    const st = String(body?.error?.status || "");
    if (status === 429 || st === "RESOURCE_EXHAUSTED") {
        return /PerDay|per day|daily/i.test(JSON.stringify(body?.error?.details || []) + msg) ? "quota" : "rate_limit";
    }
    if (status === 401 || status === 403 || st === "UNAUTHENTICATED" || st === "PERMISSION_DENIED" || /api key not valid|api_key_invalid/i.test(msg)) return "auth";
    if (status === 402) return "payment";
    // Model VẪN hoạt động nhưng Google không cấp cho API key / dự án mới (ví dụ 2.5 Flash-Lite
    // từ 07/2026): không phải model đã tắt, không phải lỗi chung -> ghi nhớ theo từng key
    if (/no longer available to new users|not available to new users|not available for new (?:users|projects)/i.test(msg)) return "unavailable_for_key";
    // Tính năng không hỗ trợ (JSON schema, mức suy nghĩ): lỗi yêu cầu, model vẫn dùng được
    if ((status === 400) && /response_?schema|response_?mime|json schema|thinking/i.test(msg)) return "invalid";
    if (status === 404 || st === "NOT_FOUND" || /is not found|not supported for generatecontent|unknown model|response modalit/i.test(msg)) return "not_found";
    if (st === "FAILED_PRECONDITION") return "precondition";
    if (status === 400 || status === 416 || st === "INVALID_ARGUMENT") return "invalid";
    if (status === 408 || status === 500 || status === 502 || status === 503 || status === 504) return "unavailable";
    return "unknown";
}

const ERROR_TEXT = {
    rate_limit: "vượt giới hạn tốc độ (429)",
    quota: "hết hạn mức trong ngày (429)",
    auth: "API Key sai, hết hạn hoặc không đủ quyền",
    payment: "tài khoản hết tiền trả trước (402)",
    precondition: "dự án chưa đủ điều kiện (thanh toán / khu vực)",
    not_found: "model không tồn tại hoặc không hỗ trợ việc này",
    unavailable_for_key: "model không khả dụng với API key hiện tại (Google không cấp cho key/dự án mới)",
    invalid: "yêu cầu không hợp lệ (400)",
    unavailable: "máy chủ Gemini quá tải / lỗi tạm thời",
    timeout: "quá thời gian chờ",
    network: "lỗi mạng"
};

// ---- Quyền truy cập model THEO TỪNG API KEY (nguồn sự thật = kết quả gọi generateContent thật) ----
// models.get / models.list có thể vẫn thấy model mà generateContent vẫn 404 với key mới,
// nên chỉ kết quả gọi thật mới được ghi. Lưu bền vững (chrome.storage.local) theo mã băm
// SHA-256 của key (không lưu key), có thời hạn: tải lại tiện ích vẫn nhớ, không thử lại mỗi phụ đề.
const ACCESS_TTL_MS = 3 * 24 * 3600 * 1000;
// A model refused again right after its mark lapsed is remembered twice as long each time, up to
// 30 days: a key that never gains access stops paying a 404 round trip on a live line every 3 days.
// A lapsed mark is kept (not trusted) for LAPSED_KEEP_MS so the next refusal can see the last span.
const ACCESS_MAX_TTL_MS = 30 * 24 * 3600 * 1000;
const LAPSED_KEEP_MS = 60 * 24 * 3600 * 1000;
let accessMap = {};                 // { [keyHash]: { [model]: { s: "ok"|"unavailable", until, suggested, t } } }
const accessReady = new Promise(resolve => {
    try { chrome.storage.local.get({ modelAccess: {} }, d => { accessMap = (d && d.modelAccess) || {}; resolve(); }); }
    catch (e) { resolve(); }
});
const keyHashMemo = new Map();
async function keyHash(apiKey) {
    if (!keyHashMemo.has(apiKey)) keyHashMemo.set(apiKey, (await CST_CACHE.hashKey(["gemini-key", apiKey])).slice(0, 16));
    return keyHashMemo.get(apiKey);
}
function accessOf(kh, model) {
    const e = accessMap[kh] && accessMap[kh][model];
    return e && e.until > Date.now() ? e : null;
}
function setAccess(kh, model, s, extra = {}) {
    const cur = accessOf(kh, model);
    if (cur && cur.s === s && cur.until - Date.now() > ACCESS_TTL_MS / 2) return;   // không ghi thừa
    const now = Date.now();
    const prev = accessMap[kh] && accessMap[kh][model];
    const ttl = s === "unavailable" && prev && prev.s === "unavailable"
        ? Math.min(ACCESS_MAX_TTL_MS, 2 * (prev.ttl || ACCESS_TTL_MS)) : ACCESS_TTL_MS;
    accessMap[kh] = { ...(accessMap[kh] || {}), [model]: { s, t: now, until: now + ttl, ttl, ...extra } };
    for (const k of Object.keys(accessMap)) {                                         // drop marks lapsed long ago
        for (const m of Object.keys(accessMap[k])) if (accessMap[k][m].until + LAPSED_KEEP_MS <= now) delete accessMap[k][m];
        if (!Object.keys(accessMap[k]).length) delete accessMap[k];
    }
    try { chrome.storage.local.set({ modelAccess: accessMap }); } catch (e) { /* bỏ qua */ }
}
// A refusal mark that has lapsed: the next call retries that model once, but until it does, the
// model actually translating is the next one in the chain (what the Settings cards should name)
async function lapsedFn(apiKey) {
    await accessReady;
    const kh = apiKey ? await keyHash(apiKey) : "";
    const now = Date.now();
    return model => { const e = kh && accessMap[kh] && accessMap[kh][model]; return !!(e && e.s === "unavailable" && e.until <= now); };
}
// The model a new line most likely lands on, and the lapsed one it will retry first ("" if none)
async function likelyModel(tier, cfg, apiKey) {
    const chain = COST.modelChain(tier, cfg, cfg.costMode, await isUnavailableFn(apiKey));
    const lapsed = await lapsedFn(apiKey);
    const id = chain.find(m => !lapsed(m)) || chain[0] || "";
    return { id, retry: chain[0] && chain[0] !== id ? chain[0] : "" };
}
async function isUnavailableFn(apiKey) {
    await accessReady;
    const kh = apiKey ? await keyHash(apiKey) : "";
    return model => missingModels.has(model) || !!(kh && (accessOf(kh, model) || {}).s === "unavailable");
}

// policy: { timeoutMs, retries, backoffMs, signal, timeoutCooldownMs }
// Trả về JSON phản hồi (HTTP 200). Lỗi: ném GeminiError có .type
// How long a timed-out request is still listened to for its bill before it is dropped
const LATE_WAIT_MS = 120000;
// Chrome stops an idle service worker after ~30 s, which would drop a late answer still on its way
// (its bill would stay an estimate and its translation would be lost). While one is awaited, a
// cheap extension call every 20 s counts as activity; it stops with the last one.
let lateOpen = 0, keepAliveTimer = null;
function lateOpened() {
    lateOpen++;
    const rt = typeof chrome !== "undefined" && chrome.runtime;
    if (keepAliveTimer || !rt || typeof rt.getPlatformInfo !== "function" || typeof setInterval !== "function") return;
    keepAliveTimer = setInterval(() => { try { rt.getPlatformInfo(() => {}); } catch (e) { /* bỏ qua */ } }, 20000);
}
function lateClosed() {
    lateOpen = Math.max(0, lateOpen - 1);
    if (!lateOpen && keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
}
// Exact prompt tokens of a request whose answer never came, from Google's token counter (no text
// is generated; the Gemini API lists no price for it). 0 when it cannot say.
async function countPromptTokens(model, apiKey, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    if (timer && timer.unref) timer.unref();
    try {
        const res = await fetch(GEMINI_BASE + encodeURIComponent(model) + ":countTokens", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({ generateContentRequest: { model: `models/${model}`, contents: body.contents, systemInstruction: body.system_instruction } }),
            signal: controller.signal
        });
        if (!res.ok) return 0;
        const d = await res.json().catch(() => null);
        return Math.max(0, Math.round(Number(d && d.totalTokens) || 0));
    } catch (e) {
        return 0;
    } finally {
        clearTimeout(timer);
    }
}
async function geminiCall(model, apiKey, body, policy = {}) {
    if (keyBlock && keyBlock.key === apiKey && keyBlock.until > Date.now()) throw new GeminiError(keyBlock.type, `Gemini: ${keyBlock.reason}`, { blocked: true });
    if (missingModels.has(model)) throw new GeminiError("not_found", `${model}: ${ERROR_TEXT.not_found}`, { blocked: true });
    await accessReady;
    const kh = await keyHash(apiKey);
    if ((accessOf(kh, model) || {}).s === "unavailable") throw new GeminiError("unavailable_for_key", `${model}: ${ERROR_TEXT.unavailable_for_key}`, { blocked: true });
    const cd = modelCooldown.get(model);
    if (cd && cd.until > Date.now()) throw new GeminiError(cd.type, `${model} tạm ngưng ${Math.ceil((cd.until - Date.now()) / 1000)} giây: ${cd.reason}`, { blocked: true });

    const retries = policy.retries == null ? 2 : policy.retries;
    const timeoutMs = policy.timeoutMs || 15000;
    for (let attempt = 0; ; attempt++) {
        if (policy.signal && policy.signal.aborted) throw new GeminiError("aborted", "Đã hủy");
        const controller = new AbortController();
        let timedOut = false;
        // policy.onLate: on our timeout the caller stops waiting, but the request is left running so
        // the answer Google bills for still arrives and its real token counts replace the estimate
        const keepLate = typeof policy.onLate === "function";
        let timer = null;
        const onOuterAbort = () => controller.abort();
        if (policy.signal) policy.signal.addEventListener("abort", onOuterAbort, { once: true });
        const request = fetch(GEMINI_BASE + encodeURIComponent(model) + ":generateContent", {
            method: "POST",
            // Khóa gửi qua header (khuyến nghị của tài liệu): không lộ trong URL, lịch sử, nhật ký mạng
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(body),
            signal: controller.signal
        }).then(async res => ({ res, data: await res.json().catch(() => null) }));
        const expired = new Promise((_, reject) => {
            timer = setTimeout(() => { timedOut = true; if (!keepLate) controller.abort(); reject(new Error("timeout")); }, timeoutMs);
        });
        let err;
        try {
            const { res, data } = await Promise.race([request, expired]);
            // Google bills every answered request, also one whose text is later thrown away
            if (res.ok && policy.onBilled) policy.onBilled(data || {});
            if (res.ok) { setAccess(kh, model, "ok"); return data || {}; }
            const type = classifyHttp(res.status, data);
            const detail = String(data?.error?.message || res.statusText || "").slice(0, 200);
            err = new GeminiError(type, `Gemini ${model} HTTP ${res.status}: ${detail || ERROR_TEXT[type] || ""}`, { status: res.status, retryAfterMs: retryDelayMs(data) });
            if (type === "unavailable_for_key") err.suggested = (detail.match(/use models\/([\w.-]+)/) || [])[1] || "";
        } catch (e) {
            if (timedOut) {
                err = new GeminiError("timeout", `${model}: ${ERROR_TEXT.timeout} (${Math.round(timeoutMs / 1000)} giây)`);
                // A request dropped by our own timer still runs to the end at Google and is billed;
                // the answer never arrives, so the caller estimates its tokens (null data)
                if (policy.onBilled) policy.onBilled(null);
                if (keepLate) {
                    const cap = setTimeout(() => controller.abort(), LATE_WAIT_MS);
                    if (cap && cap.unref) cap.unref();
                    lateOpened();
                    request.then(({ res, data }) => { if (res.ok) policy.onLate(data || {}); }).catch(() => {}).finally(() => { clearTimeout(cap); lateClosed(); });
                }
            }
            else if (e && e.name === "AbortError") err = new GeminiError("aborted", "Đã hủy");
            else err = new GeminiError("network", `${model}: ${ERROR_TEXT.network}`);
        } finally {
            clearTimeout(timer);
            if (policy.signal) policy.signal.removeEventListener("abort", onOuterAbort);
        }

        // Chỉ lỗi TẠM THỜI mới thử lại, có giới hạn, chờ tăng dần + ngẫu nhiên nhẹ
        const transient = err.type === "unavailable" || err.type === "network";
        if (transient && attempt < retries) {
            const base = (policy.backoffMs || 500) * Math.pow(2, attempt);
            await sleep(Math.min(8000, err.retryAfterMs || base * (0.8 + Math.random() * 0.4)), policy.signal);
            continue;
        }

        // Ngắt mạch để không dồn thêm yêu cầu chắc chắn lỗi
        if (err.type === "rate_limit") modelCooldown.set(model, { until: Date.now() + (err.retryAfterMs || 30000), type: err.type, reason: ERROR_TEXT.rate_limit });
        else if (err.type === "quota") modelCooldown.set(model, { until: Date.now() + Math.max(err.retryAfterMs || 0, 15 * 60000), type: err.type, reason: ERROR_TEXT.quota });
        else if (err.type === "auth" || err.type === "payment" || err.type === "precondition") keyBlock = { key: apiKey, until: Date.now() + 10 * 60000, type: err.type, reason: ERROR_TEXT[err.type] };
        else if (err.type === "not_found") missingModels.add(model);
        else if (err.type === "unavailable_for_key") setAccess(kh, model, "unavailable", { suggested: err.suggested || "" });
        else if (err.type === "timeout" && policy.timeoutCooldownMs) modelCooldown.set(model, { until: Date.now() + policy.timeoutCooldownMs, type: err.type, reason: "phản hồi quá chậm" });
        throw err;
    }
}

// Đổi API Key / model trong Cài đặt: gỡ các lệnh chặn cũ
try {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync") return;
        if (changes.geminiApiKey) { keyBlock = null; modelCooldown.clear(); }
        if (changes.geminiApiKey || changes.geminiModel || changes.geminiStrongModel || changes.dubTtsModel) missingModels.clear();
    });
} catch (e) { /* chạy ngoài extension */ }

function responseText(data) {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    return parts.filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join("");
}

// Mức "suy nghĩ" theo danh mục model (cost-policy.js): token suy nghĩ tính tiền như
// token đầu ra. Flash-Lite để mặc định (tắt / tối thiểu), Flash thế hệ 3 hạ xuống thấp.
function thinkingConfigFor(model) {
    const level = noThinkingCfg.has(model) ? null : COST.thinkingLevelFor(model);
    return level ? { thinkingLevel: level } : null;
}

// ============================================================
// DỊCH THEO ĐOẠN CÓ NGỮ CẢNH (translateUnit)
//
// - Kết quả lưu BỀN VỮNG (IndexedDB, cst-cache.js): mở lại video, tải lại
//   extension, service worker bị tắt... đều không phải gọi Gemini lại.
// - Đầu ra tối giản: chỉ các bản dịch. Thuật ngữ chỉ yêu cầu khi content script
//   cần (wantTerms). Ngắt dòng, ngắt nghỉ, gom cụm do engine tiếng Việt cục bộ làm.
// - Model: tier "cheap" (mặc định) hoặc "strong" (câu khó / dịch lại) do content
//   script quyết định bằng bộ định tuyến tất định.
// ============================================================
// Tăng khi đổi prompt / cấu trúc đầu ra / chiến lược ngữ cảnh -> bản dịch cũ tự hết hiệu lực
const TR_PROMPT_VERSION = 4;
const AUDIO_CACHE_VERSION = 1;
const PLACEHOLDER_RE = /\[\[\s*(?:\\?_){2}\s*T\s*(\d+)\s*(?:\\?_){2}\s*\]\]/gi;

// The dubbing audio store: 3 GB (2.4.0, was 200 MB), the user's own ceiling. One second of voice is
// 96 KB (48 kHz, 16 bit, mono) and the voice speaks 0.85 s per second of video (8,353 s over 9,845 s
// on 2026-09-30), so a 13-minute video is ~61 MB: 200 MB held 3 videos, 3 GB holds ~50 (100 would
// need ~6 GB). Least recently used goes first (cst-cache.js evict).
const AUDIO_CACHE_MAX_BYTES = 3 * 1024 * 1024 * 1024;
const caches = (typeof CST_CACHE !== "undefined")
    ? CST_CACHE.createCaches({ trVersion: TR_PROMPT_VERSION, audioVersion: AUDIO_CACHE_VERSION, audioMaxBytes: AUDIO_CACHE_MAX_BYTES })
    : null;

// Làm sạch đầu ra của mô hình nhưng GIỮ các mã giữ chỗ có thật trong đầu vào
// (content script sẽ khôi phục chúng thành thuật ngữ). Mã "bịa" thì xóa.
function sanitizeModelOutput(out, inputTokens) {
    const allowed = new Set((inputTokens || []).map(t => (t.match(/\d+/) || [""])[0]));
    let t = String(out || "").replace(/\r/g, "");
    t = t.replace(PLACEHOLDER_RE, (m, id) => (allowed.has(id) ? `[[__T${id}__]]` : " "));
    t = t.replace(/^\s*(?:bản dịch(?: tiếng việt)?|translation)\s*:\s*/i, "");
    t = t.replace(/\*\*(.+?)\*\*/g, "$1");
    t = t.replace(/\s*\n\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim();
    const m = t.match(/^["“](.*)["”]$/s);
    if (m && !/["“”]/.test(m[1])) t = m[1].trim();
    return t;
}

const UNIT_SYSTEM_PROMPT = [
    "Bạn là biên dịch viên phụ đề Anh sang Việt cho bài giảng và video (Coursera, YouTube).",
    "Làm trong đầu, KHÔNG viết ra: hiểu cả đoạn và quan hệ với câu trước/sau; xác định chủ thể, hành động, đối tượng và mỗi đại từ chỉ vào đâu; chọn nghĩa từ đa nghĩa theo lĩnh vực và câu cụ thể; nhận diện thuật ngữ. Sau đó mới viết câu tiếng Việt tự nhiên như giảng viên người Việt nói.",
    "Quy tắc: dịch theo ý, không dịch từng chữ, không giữ trật tự câu tiếng Anh khi tiếng Việt không nói vậy (tránh 'nó là quan trọng để', 'trong thứ tự để', 'tất cả của các', 'hãy để chúng ta', 'đang đi để', lặp 'một cách', lặp 'của nó'). Cụm động từ, thành ngữ dịch theo nghĩa. Đại từ mơ hồ thì nêu rõ đối tượng, rõ rồi thì lược; không mở câu bằng 'Nó' máy móc. Không thêm, không bớt nội dung. Tên riêng, sản phẩm, viết tắt, mã lệnh giữ nguyên. Dùng đúng thuật ngữ đã thống nhất nếu có.",
    "Các mục trong [CẦN DỊCH] là phụ đề LIÊN TIẾP, có thể là mảnh của cùng một câu: hiểu trọn ý rồi trả mỗi mục một bản dịch, đúng số mục, đúng thứ tự, nối lại thành đoạn liền mạch; được chuyển vài chữ giữa hai mục kề nhau nhưng không mục nào rỗng. Ngữ cảnh trước/sau chỉ để hiểu, không dịch lại.",
    // Measured on a real video: an item that stops mid-sentence ("And we have a mortgage,") came back
    // with the rest of the sentence and the next two context lines translated into it.
    "Mục cuối có thể dừng giữa câu: dịch đúng tới chữ cuối của mục đó rồi dừng, KHÔNG viết tiếp phần nằm trong [NGỮ CẢNH SAU], kể cả để câu tròn ý."
].join("\n");

function unitSchema(wantTerms) {
    const props = { t: { type: "ARRAY", items: { type: "STRING" } } };
    if (wantTerms) {
        props.terms = { type: "ARRAY", items: { type: "OBJECT", properties: { en: { type: "STRING" }, vi: { type: "STRING" } }, required: ["en", "vi"] } };
    }
    return { type: "OBJECT", properties: props, required: ["t"] };
}

function buildUnitPrompt(req) {
    const ctx = req.context || {};
    const sys = [UNIT_SYSTEM_PROMPT];
    const placeholders = req.placeholders || [];
    if (placeholders.length) {
        sys.push(`Mã giữ chỗ thuật ngữ phải giữ nguyên, mỗi mã đúng một lần, đặt đúng vị trí ngữ pháp, không tạo mã khác. Nghĩa (để hiểu, không viết ra): ${placeholders.map(p => `[[__T${p.id}__]] = ${p.term}`).join("; ")}.`);
    }
    sys.push(req.wantTerms
        ? `Trả về DUY NHẤT JSON: {"t": [${req.sentences.length} bản dịch theo thứ tự], "terms": [tối đa 5 thuật ngữ chuyên ngành MỚI trong đoạn, {"en": "...", "vi": "cách đã dịch"}]}.`
        : `Trả về DUY NHẤT JSON: {"t": [${req.sentences.length} bản dịch theo thứ tự]}.`);

    const parts = [];
    if (ctx.topic) parts.push(`[CHỦ ĐỀ] ${ctx.topic}`);
    if (ctx.domain) parts.push(`[LĨNH VỰC] ${ctx.domain}`);
    if (ctx.terms && ctx.terms.length) parts.push(`[THUẬT NGỮ ĐÃ THỐNG NHẤT] ${ctx.terms.map(t => `${t.en} = ${t.vi}`).join("; ")}`);
    if (ctx.senseHints && ctx.senseHints.length) parts.push(`[GỢI Ý NGHĨA] ${ctx.senseHints.join("; ")}`);
    if (ctx.phraseHints && ctx.phraseHints.length) parts.push(`[CỤM TỪ, THÀNH NGỮ] ${ctx.phraseHints.join("; ")}`);
    // Who or what a pronoun / "the company" in the window points to, from further back (1.8.4)
    if (ctx.refSource) parts.push(`[NHẮC LẠI TỪ TRƯỚC, chỉ để hiểu đại từ] ${ctx.refSource}`);
    if (ctx.prevSource) parts.push(`[NGỮ CẢNH TRƯỚC] ${ctx.prevSource}`);
    if (ctx.prevTranslation) parts.push(`[BẢN DỊCH ĐOẠN TRƯỚC] ${ctx.prevTranslation}`);
    parts.push(`[CẦN DỊCH]\n${req.sentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
    if (ctx.nextSource) parts.push(`[NGỮ CẢNH SAU] ${ctx.nextSource}`);
    if (req.refine && req.refine.draft) {
        parts.push(`[BẢN NHÁP CẦN SỬA]\n${req.refine.draft.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
        parts.push(`[VẤN ĐỀ PHÁT HIỆN] ${req.refine.issues.join("; ")}`);
        parts.push("Viết lại bản dịch: sửa các vấn đề trên, tự nhiên như người Việt nói, đúng ngữ cảnh, giữ nguyên nội dung.");
    }
    return { sys: sys.join("\n"), user: parts.join("\n") };
}

function parseUnitJson(raw) {
    let t = String(raw || "").trim();
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a < 0 || b < a) throw new Error("Mô hình không trả JSON");
    return JSON.parse(t.slice(a, b + 1));
}

let unitSchemaUnsupported = false;

// Billed tokens of one request: the server's own counts; when they are missing, or the request
// timed out (data null), estimated from length. The characters-per-token ratios start from what
// this prompt shape measures (mostly Vietnamese instructions, ~3 characters a token) and follow
// the real counts of this session's answered calls, so an estimate tracks the actual prompt.
const tokenRatio = { prompt: 3, outPerSrc: 0.5 };
function usageOf(data, promptChars, srcChars) {
    const u = (data && data.usageMetadata) || {};
    const real = !!u.promptTokenCount;
    const thoughts = u.thoughtsTokenCount || 0;
    const out = data ? (u.candidatesTokenCount != null ? u.candidatesTokenCount : Math.ceil(responseText(data).length / 3)) : 0;
    if (real && promptChars > 200) tokenRatio.prompt = tokenRatio.prompt * 0.8 + (promptChars / u.promptTokenCount) * 0.2;
    if (real && srcChars > 40) tokenRatio.outPerSrc = tokenRatio.outPerSrc * 0.8 + ((out + thoughts) / srcChars) * 0.2;
    return {
        in: u.promptTokenCount || Math.ceil(promptChars / tokenRatio.prompt),
        // promptTokenCount includes the part Google served from its implicit cache (billed lower)
        cached: Math.min(u.cachedContentTokenCount || 0, u.promptTokenCount || 0),
        out: data ? out : Math.ceil(srcChars * tokenRatio.outPerSrc) + 20,
        thoughts,
        estimated: !real
    };
}

// retries: geminiCall's retries for a 5xx / network error. The first model of a chain gets 2; a model
// tried after another one failed gets none, so falling through the chain adds one quick call each.
// The checked translation of one answer; throws a GeminiError when it is unusable (cutOff: the
// answer hit the output cap, worth one more pass with a larger cap)
function readUnitAnswer(data, req, allowed) {
    const cand = data.candidates?.[0] || {};
    let obj;
    try {
        obj = parseUnitJson(responseText(data));
    } catch (e) {
        if (cand.finishReason === "MAX_TOKENS") throw new GeminiError("bad_output", e.message, { cutOff: true });
        if (cand.finishReason && cand.finishReason !== "STOP") throw new GeminiError("blocked", `Gemini dừng sớm (${cand.finishReason})`);
        throw new GeminiError("bad_output", e.message);
    }
    const arr = Array.isArray(obj.t) ? obj.t : (Array.isArray(obj.translations) ? obj.translations : []);
    let translations = arr.map(x => sanitizeModelOutput(x, allowed));
    if (translations.length !== req.sentences.length) {
        if (req.sentences.length === 1 && translations.length > 1) translations = [translations.join(" ")];
        else throw new GeminiError("bad_output", `Số mục không khớp (gửi ${req.sentences.length}, nhận ${translations.length})`);
    }
    if (translations.some(t => !t)) throw new GeminiError("bad_output", "Có mục dịch rỗng");
    return { translations, terms: Array.isArray(obj.terms) ? obj.terms.filter(t => t && t.en && t.vi).slice(0, 5) : [] };
}

// onLateAnswer(answer): a timed-out request's answer that still came and passed readUnitAnswer
// (null when it came but was unusable, so nobody keeps waiting for it).
// It was paid for, so the caller keeps it (cache) instead of letting it go to waste.
async function callGeminiUnit(req, apiKey, model, retries = 2, bill = null, onLateAnswer = null) {
    const { sys, user } = buildUnitPrompt(req);
    const srcChars = req.sentences.join(" ").length;
    const timeoutMs = Math.min(15000, 4500 + srcChars * 6 + (req.refine ? 2000 : 0));
    // Trần đầu ra vừa đủ cho bản dịch (tiếng Việt ~1,3 lần ký tự tiếng Anh) + JSON
    let maxTokens = Math.min(8192, Math.max(512, Math.ceil(srcChars * 1.2) + (req.wantTerms ? 250 : 80)));
    const allowed = (req.placeholders || []).map(p => `[[__T${p.id}__]]`);
    const t0 = Date.now();
    // Every request Google answered or timed out on is charged, not only the pass whose
    // translation is kept: a retry after a cut-off or unparsable answer was billed too
    // A timeout is charged at once with an estimate (the answer may never come); when the answer
    // still arrives, its real counts replace that estimate
    // bill(usage, replaces, late): replaces is a charge this one corrects; late marks an answer that
    // came after the timeout. The prompt of a timed-out request is then counted exactly by Google's
    // token counter, so only its output stays an estimate until (unless) the answer arrives.
    let estimate = null, body = null;
    const onBilled = bill && (data => {
        const u = usageOf(data, sys.length + user.length, srcChars);
        bill(u);
        if (data) return;
        estimate = u;
        const sent = body;
        countPromptTokens(model, apiKey, sent).then(n => {
            if (!n || estimate !== u) return;                   // no count, or the real answer came first
            const counted = { ...u, in: n, promptCounted: true };
            estimate = counted;
            bill(counted, u, false);
        });
    });
    const onLate = (bill || onLateAnswer) && (data => {
        if (bill && estimate) { const was = estimate; estimate = null; bill(usageOf(data, sys.length + user.length, srcChars), was, true); }
        if (onLateAnswer) {
            let answer = null;
            try { answer = readUnitAnswer(data, req, allowed); } catch (e) { /* unusable: nothing to keep */ }
            onLateAnswer(answer);
        }
    });

    // Tối đa 3 lượt gửi: model không nhận JSON schema / cấu hình suy nghĩ (bỏ tính năng đó),
    // hoặc bản dịch bị cắt cụt vì chạm trần token (gửi lại một lần với trần gấp đôi).
    for (let pass = 0; pass < 3; pass++) {
        const generationConfig = { temperature: req.refine ? 0.35 : 0.2, maxOutputTokens: maxTokens };
        if (!unitSchemaUnsupported) {
            generationConfig.responseMimeType = "application/json";
            generationConfig.responseSchema = unitSchema(!!req.wantTerms);
        }
        const thinking = thinkingConfigFor(model);
        if (thinking) generationConfig.thinkingConfig = thinking;
        let data;
        try {
            body = {
                system_instruction: { parts: [{ text: sys }] },
                contents: [{ parts: [{ text: user }] }],
                generationConfig
            };
            data = await geminiCall(model, apiKey, body, { timeoutMs, retries, backoffMs: 500, timeoutCooldownMs: 15000, onBilled, onLate });
        } catch (e) {
            if (e.type === "invalid" && /thinking/i.test(e.message) && thinking) { noThinkingCfg.add(model); continue; }
            if (e.type === "invalid" && /schema|mime/i.test(e.message) && !unitSchemaUnsupported) { unitSchemaUnsupported = true; continue; }
            throw e;
        }
        let answer;
        try {
            answer = readUnitAnswer(data, req, allowed);
        } catch (e) {
            if (e.cutOff && maxTokens < 8192) { maxTokens = Math.min(8192, maxTokens * 2); continue; }
            throw e;
        }
        const usage = usageOf(data, 0, 0);
        return {
            ...answer,
            engine: "gemini",
            model,
            latency: Date.now() - t0,
            usage
        };
    }
    throw new GeminiError("bad_output", "Gemini không trả bản dịch hợp lệ");
}

function getSyncCfg(defaults) {
    return new Promise(resolve => chrome.storage.sync.get(defaults, resolve));
}

// Cài đặt (chrome.storage.sync) -> lựa chọn model. "auto" được giải thành model cụ thể
// trong COST.modelChain theo quyền truy cập thật của API key.
async function modelsFromCfg() {
    const cfg = await getSyncCfg({ useAi: true, geminiApiKey: "", geminiModel: COST.DEFAULT_MODELS.cheap, geminiStrongModel: COST.DEFAULT_MODELS.strong, costMode: "balanced" });
    const pick = (v, d) => { const id = String(v || "").trim() || d; return COST.RETIRED_MODELS[id] || id; };
    return { ...cfg, cheap: pick(cfg.geminiModel, COST.DEFAULT_MODELS.cheap), strong: pick(cfg.geminiStrongModel, COST.DEFAULT_MODELS.strong) };
}

// ============================================================
// CHI PHÍ ƯỚC TÍNH + NGÂN SÁCH (chỉ lưu trên máy, không gửi ra ngoài)
// Không phải hóa đơn chính xác: là hàng rào để API không chạy ngoài ý muốn.
// ============================================================
function localDay() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// inTok: billed prompt tokens, cachedTok the part of them billed at the cache rate; outTok: billed
// output tokens, thinking included (thoughtTok is that part); estCalls: requests whose tokens had
// to be estimated (timed out, no usage in the answer); countedCalls: of those, how many had their
// prompt counted exactly by countTokens. byModel splits calls / tokens / USD.
const emptyStats = () => ({ trUsd: 0, ttsUsd: 0, trCalls: 0, ttsCalls: 0, audioSec: 0, localSec: 0, hitsTr: 0, hitsAudio: 0, avoided: 0, inTok: 0, outTok: 0, thoughtTok: 0, cachedTok: 0, estCalls: 0, estUsd: 0, lateCalls: 0, countedCalls: 0, byModel: {} });
// One billed translation request into the ledger
function usagePatch(model, u) {
    const out = u.out + u.thoughts;
    const usd = COST.estimateTextCost(model, u.in, out, u.cached);
    return { trUsd: usd, trCalls: 1, inTok: u.in, outTok: out, thoughtTok: u.thoughts, cachedTok: u.cached, estCalls: u.estimated ? 1 : 0, estUsd: u.estimated ? usd : 0 };
}
// prev: the estimate charged when this request timed out; its late answer replaces it
// (lateCalls counts those, so the card can say how many estimates became real numbers)
function trackText(meta, model, u, prev, late = true) {
    const patch = usagePatch(model, u);
    if (prev) {
        const was = usagePatch(model, prev);
        for (const k of Object.keys(patch)) patch[k] -= was[k];
        if (late) patch.lateCalls = 1;
        else patch.countedCalls = 1;
    }
    track(meta, patch, model);
}
// Google bills by the day in Pacific time, so a second ledger keyed by that day lines up with
// AI Studio's usage page. Last HISTORY_DAYS days, text calls only (TTS is off, PAID_TTS).
const HISTORY_DAYS = 31;
const HISTORY_KEYS = ["trUsd", "ttsUsd", "trCalls", "inTok", "outTok", "thoughtTok", "cachedTok", "estCalls", "estUsd", "lateCalls"];
function pacificDay(now = new Date()) {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now); }
    catch (e) { return new Date(now.getTime() - 7 * 3600e3).toISOString().slice(0, 10); }
}
let ledger = { day: localDay(), ...emptyStats(), videos: {} };
let sessionStats = emptyStats();
let history = {};
const sessionArea = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) || null;
// Charges that arrive before the load (the first message after the worker wakes) wait for it in
// track(): the load replaces the ledger and would drop them
let ledgerLoaded = false;
const ledgerReady = new Promise(resolve => {
    const done = () => { ledgerLoaded = true; resolve(); };
    try {
        chrome.storage.local.get({ costLedger: null, costHistory: null, costTokenRatio: null }, d => {
            // the measured characters-per-token survive a service-worker restart
            const tr = d && d.costTokenRatio;
            if (tr && tr.prompt > 1 && tr.prompt < 8) tokenRatio.prompt = tr.prompt;
            if (tr && tr.outPerSrc > 0.05 && tr.outPerSrc < 5) tokenRatio.outPerSrc = tr.outPerSrc;
            if (d && d.costLedger && d.costLedger.day === localDay()) ledger = { ...emptyStats(), videos: {}, ...d.costLedger };
            if (d && d.costHistory && typeof d.costHistory === "object") history = d.costHistory;
            if (!sessionArea) return done();
            sessionArea.get({ costSession: null }, x => { if (x && x.costSession) sessionStats = { ...emptyStats(), ...x.costSession }; done(); });
        });
    } catch (e) { done(); }
});
let ledgerTimer = null;
function saveLedgerSoon() {
    if (ledgerTimer) return;
    ledgerTimer = setTimeout(() => {
        ledgerTimer = null;
        try { chrome.storage.local.set({ costLedger: ledger, costHistory: history, costTokenRatio: tokenRatio }); if (sessionArea) sessionArea.set({ costSession: sessionStats }); } catch (e) { /* bỏ qua */ }
    }, 1500);
}
function rollDay() { if (ledger.day !== localDay()) ledger = { day: localDay(), ...emptyStats(), videos: {} }; }
// meta: { videoKey, videoSec, title }
function addByModel(stats, model, patch) {
    const m = (stats.byModel || (stats.byModel = {}))[model] || (stats.byModel[model] = { calls: 0, inTok: 0, outTok: 0, usd: 0 });
    m.calls += patch.trCalls || 0; m.inTok += patch.inTok || 0; m.outTok += patch.outTok || 0; m.usd += patch.trUsd || 0;
}
function track(meta, patch, model) {
    if (!ledgerLoaded) { ledgerReady.then(() => track(meta, patch, model)); return; }
    rollDay();
    for (const [k, v] of Object.entries(patch)) { ledger[k] = (ledger[k] || 0) + v; sessionStats[k] = (sessionStats[k] || 0) + v; }
    if (model) { addByModel(ledger, model, patch); addByModel(sessionStats, model, patch); }
    if (HISTORY_KEYS.some(k => patch[k])) {
        const pd = pacificDay();
        const h = history[pd] || (history[pd] = { byModel: {} });
        for (const k of HISTORY_KEYS) if (patch[k]) h[k] = (h[k] || 0) + patch[k];
        if (model) addByModel(h, model, patch);
        const days = Object.keys(history).sort();
        days.slice(0, Math.max(0, days.length - HISTORY_DAYS)).forEach(k => delete history[k]);
    }
    const vk = meta && meta.videoKey;
    if (vk) {
        const v = ledger.videos[vk] || (ledger.videos[vk] = { usd: 0, audioSec: 0, videoSec: 0, title: "" });
        v.usd += (patch.trUsd || 0) + (patch.ttsUsd || 0);
        v.audioSec += patch.audioSec || 0;
        if (meta.videoSec) v.videoSec = meta.videoSec;
        if (meta.title) v.title = String(meta.title).slice(0, 80);
        v.t = Date.now();
        const keys = Object.keys(ledger.videos);
        if (keys.length > 40) keys.sort((a, b) => ledger.videos[a].t - ledger.videos[b].t).slice(0, keys.length - 40).forEach(k => delete ledger.videos[k]);
    }
    saveLedgerSoon();
}
async function budgetState(meta, estUsd = 0) {
    await ledgerReady;
    rollDay();
    const B = COST.BUDGET_DEFAULTS;
    const cfg = await getSyncCfg({ budgetDailyUsd: B.daily, budgetVideoUsd: B.video });
    const D = Math.max(0, Number(cfg.budgetDailyUsd) || 0), V = Math.max(0, Number(cfg.budgetVideoUsd) || 0);
    const day = ledger.trUsd + ledger.ttsUsd;
    const vid = meta && meta.videoKey && ledger.videos[meta.videoKey] ? ledger.videos[meta.videoKey].usd : 0;
    const ratio = Math.max(D ? (day + estUsd) / D : 0, V ? (vid + estUsd) / V : 0);
    const over = ratio > 1;
    return { allowed: !over, level: over ? "over" : ratio >= B.warnAt ? "warn" : "ok", ratio, spentDay: day, spentVideo: vid, dailyBudget: D, videoBudget: V, runaway: D > 0 && day >= D * 2 };
}
const metaOf = req => ({ videoKey: req.videoKey || "", videoSec: Number(req.videoSec) || 0, title: req.videoTitle || "" });

// Khóa bản dịch: mọi thứ quyết định kết quả, gồm ĐÚNG model tạo ra bản dịch
// (bản của 2.5 và 3.1 không bao giờ dùng lẫn). Không gồm bản dịch câu trước hay
// danh sách thuật ngữ đang học (thay đổi theo phiên) để mở lại video vẫn trúng.
async function unitCacheKey(req, model) {
    const c = req.context || {};
    const N = CST_CACHE.normalizeText;
    return CST_CACHE.hashKey([
        "tr", TR_PROMPT_VERSION, "en", "vi", model,
        (req.sentences || []).map(N),
        (req.placeholders || []).map(p => p.term),
        N(c.domain), N(c.topic).slice(0, 120), N(c.prevSource).slice(-200), N(c.nextSource).slice(0, 120),
        // source text, so deterministic; only when present, so every key without it stays as it was
        ...(c.refSource ? [N(c.refSource).slice(0, 200)] : [])
    ]);
}

// Hai yêu cầu dịch giống hệt nhau cùng lúc (luồng dịch trước + luồng thời gian thực,
// hai tab cùng video) chỉ gọi Gemini MỘT lần.
const unitInFlight = new Map();

async function handleTranslateUnit(request) {
    const sentences = (request.sentences || []).map(s => String(s || "").trim());
    if (!sentences.length || sentences.every(s => !s)) return { ok: true, translations: sentences.map(() => ""), engine: "none" };

    const cfg = await modelsFromCfg();
    const meta = metaOf(request);
    const budget = await budgetState(meta);
    // Vượt ngân sách: không nâng cấp lên model mạnh (vẫn dịch bằng model rẻ)
    const tier = request.tier === "strong" && budget.allowed ? "strong" : "cheap";
    const unavailable = await isUnavailableFn(cfg.geminiApiKey);
    const chain = COST.modelChain(tier, cfg, cfg.costMode, unavailable);
    const req = { ...request, sentences };
    // 1-2. CACHE (RAM -> IndexedDB) theo ĐÚNG model sẽ được gọi (model đầu chuỗi, đã bỏ
    // các model key không gọi được). Lượt dịch lại (refine) thì bỏ qua cache.
    // The later models of the chain are looked up too, but only those priced at or above the first:
    // when the first model was rate-limited, the next one translated and saved under its own key, and
    // a revisit that looked up the first model alone paid Gemini again for the same lines. A cheaper
    // model's translation never answers a request meant for a stronger one (tier "strong").
    if (caches && !request.refine && chain.length) {
        const floor = COST.costRank(chain[0]);
        const models = chain.filter((m, i) => i === 0 || COST.costRank(m) >= floor);
        const keys = await Promise.all(models.map(m => unitCacheKey(req, m).catch(() => null)));
        const key = keys[0];
        if (key) {
            // the first model alone first (the usual hit), then the rest at once: a slow store
            // costs at most two read timeouts before Gemini is asked
            const first = await caches.tr.get(key);
            const rest = first ? [] : await Promise.all(keys.slice(1).map(k => (k ? caches.tr.get(k) : null)));
            const at = first ? 0 : rest.findIndex(Boolean) + 1;
            const hit = first || rest[at - 1];
            if (hit) { track(meta, { hitsTr: 1, avoided: 1 }); return { ok: true, ...hit, fromCache: true, latency: 0, cacheKey: keys[at] }; }
            const late = !request.refine && lateUnits.get(key);
            if (late) {
                const t0 = Date.now();
                const got = await Promise.race([late, sleep(LATE_JOIN_MS).then(() => null)]);
                if (got) { track(meta, { hitsTr: 1, avoided: 1 }); return { ok: true, ...got, fromCache: true, latency: Date.now() - t0, cacheKey: key }; }
            }
            const flightKey = `${key}|${tier}|${!!request.wantTerms}`;
            if (unitInFlight.has(flightKey)) { track(meta, { avoided: 1 }); return unitInFlight.get(flightKey); }
            const p = translateUnitMiss(req, sentences, cfg, tier, meta, budget).finally(() => unitInFlight.delete(flightKey));
            unitInFlight.set(flightKey, p);
            return p;
        }
    }
    return translateUnitMiss(req, sentences, cfg, tier, meta, budget);
}

// ---- Answers that come after our timeout (2.2.0) ----
// A timed-out translation is still running at Google and is billed in full. When its answer
// arrives it goes into the translation cache, so the next request for the same window (a
// revisit, a second tab, a seek back) uses it for free. While it is still on its way, a request
// for the same window waits up to LATE_JOIN_MS for it instead of paying for a second call.
const LATE_JOIN_MS = 4000;
const lateUnits = new Map();                 // cache key -> Promise<cache entry | null>
function lateAnswerKeeper(req, model, tier) {
    let settle = () => {};
    const done = new Promise(r => { settle = r; });
    let key = null;
    const keyP = caches ? unitCacheKey(req, model).then(k => (key = k)).catch(() => null) : Promise.resolve(null);
    return {
        keep(answer) {
            if (!answer) return settle(null);
            const entry = { ...answer, engine: "gemini", model, tier };
            keyP.then(k => { if (k && caches) caches.tr.set(k, entry); settle(entry); });
        },
        // called when the request timed out: from now on a twin request can wait for this answer
        async expect() {
            const k = key || await keyP;
            if (!k) return;
            lateUnits.set(k, done);
            const drop = setTimeout(() => settle(null), LATE_WAIT_MS + 1000);
            if (drop && drop.unref) drop.unref();
            done.then(() => { clearTimeout(drop); if (lateUnits.get(k) === done) lateUnits.delete(k); });
        }
    };
}

const NEXT_MODEL_ON = new Set(["not_found", "unavailable_for_key", "rate_limit", "quota", "unavailable", "bad_output", "blocked"]);

async function translateUnitMiss(request, sentences, cfg, tier, meta, budget) {
    // 3-4. MODEL CHÍNH hoặc MODEL NÂNG CẤP (content script định tuyến).
    // Model không gọi được (404 model không tồn tại / không cấp cho key này) -> ghi nhớ,
    // TÍNH LẠI chuỗi và dùng ngay model Gemini kế tiếp; chỉ khi không còn model Gemini
    // nào gọi được (hoặc lỗi khác) mới dùng Google dự phòng.
    let aiFailedReason = null;
    let firstTried = null;
    // Google by choice (Gemini off, no key) is the translation the viewer asked for: "google", kept
    // by the per-video cache. Google because Gemini failed or the budget ran out: "google_fallback",
    // shown now but not kept, so the next visit asks Gemini again (1.7.3; "google" was unreachable).
    let byChoice = false;
    if (budget.runaway) {
        aiFailedReason = "Đã vượt gấp đôi ngân sách ngày, tạm dùng bản dịch miễn phí";
    } else if (cfg.useAi && cfg.geminiApiKey) {
        const tried = new Set();
        for (let guard = 0; guard < 6; guard++) {
            const unavailable = await isUnavailableFn(cfg.geminiApiKey);
            const model = COST.modelChain(tier, cfg, cfg.costMode, unavailable).find(m => !tried.has(m));
            if (!model) break;
            tried.add(model);
            if (!firstTried) firstTried = model;
            const late = request.refine ? null : lateAnswerKeeper({ ...request, sentences }, model, tier);
            try {
                const r = await callGeminiUnit({ ...request, sentences }, cfg.geminiApiKey, model, model === firstTried ? 2 : 0, (u, prev, isLate) => trackText(meta, model, u, prev, isLate), late && late.keep);
                r.tier = tier;
                if (model !== firstTried) r.fallbackFrom = firstTried;
                // Lưu theo ĐÚNG model đã tạo bản dịch; chỉ lưu kết quả đã kiểm tra hợp lệ.
                // Không chờ ghi xong (RAM có ngay) -> IndexedDB chậm không làm trễ phụ đề.
                let key = null;
                if (caches) {
                    try { key = await unitCacheKey({ ...request, sentences }, model); } catch (e) { key = null; }
                    if (key) caches.tr.set(key, { translations: r.translations, terms: r.terms, engine: r.engine, model: r.model, tier: r.tier });
                }
                return { ok: true, ...r, cacheKey: key, budget: budget.level };
            } catch (e) {
                aiFailedReason = e.message;
                if (e.type === "timeout" && late) late.expect();
                // The next model of the chain is tried when this failure belongs to this model and
                // passes: gone for this key (404), its own rate limit or daily quota, overloaded
                // after geminiCall's retries, or an unusable answer. The chain never goes above the
                // mode's price ceiling (COST.modelChain). Before, all but the first two fell straight
                // to Google Translate (no context), and a YouTube video could keep that version.
                // Not tried again: a timeout (a second one doubles the wait), a key, payment or
                // request problem (every model fails the same), an abort.
                if (!NEXT_MODEL_ON.has(e.type)) break;
            }
        }
    } else {
        aiFailedReason = !cfg.useAi ? "Đã tắt dịch bằng Gemini trong cài đặt" : "Chưa cài đặt API Key Gemini";
        byChoice = true;
    }
    if (request.refine) return { ok: false, error: aiFailedReason || "Không dịch lại được" };

    // Dự phòng: Google Translate (không ngữ cảnh). Không lưu bền vững để lần sau còn thử lại Gemini.
    // One request per sentence, all at once: sent one after another, a 6-sentence window waited
    // for six round trips (each with its own retries) before the viewer saw anything
    // A sentence that fails on every endpoint comes back "" (the page leaves that line untranslated
    // and asks again later) instead of failing the window: one bad sentence used to blank all 16,
    // and Coursera then re-sent each line alone, a Gemini call apiece.
    const tStart = Date.now();
    const translations = await googleTranslateAll(sentences);
    return {
        ok: true, translations, terms: [],
        engine: byChoice ? "google" : "google_fallback",
        fallbackReason: aiFailedReason,
        latency: Date.now() - tStart
    };
}

// Content script đã dịch lại / đưa lên model mạnh: ghi đè bản cuối cùng vào cache
async function handleTranslateUnitStore(req) {
    if (!caches || !req.cacheKey || !Array.isArray(req.translations)) return { ok: false };
    // Bản content gửi về đã khôi phục thuật ngữ -> đánh dấu "restored" để không khôi phục lần nữa
    await caches.tr.set(req.cacheKey, { translations: req.translations, terms: req.terms || [], engine: "gemini", model: req.model || "", tier: req.tier || "cheap", refined: true, restored: true });
    return { ok: true };
}

// ============================================================
// DUBBING: GEMINI TTS + VIENEU (local) + the persistent audio store
// ============================================================
// Danh mục TTS (cost-policy.js), rẻ nhất trước; model sau chỉ dùng khi model trước
// không còn (404). Model Pro TTS không có trong danh mục nên không bao giờ tự động dùng.
const TTS_MODELS = COST.TTS_MODELS.map(m => m.id);
// Một lượt TTS có thể được nhiều yêu cầu giống hệt nhau cùng chờ (hai tab, gửi lại
// sau lỗi): chỉ gọi Gemini MỘT lần. Chỉ hủy thật khi không còn ai chờ.
const ttsInFlight = new Map();      // khóa yêu cầu -> { promise, controller, jobs:Set }
const ttsJobs = new Map();          // jobId -> khóa yêu cầu
// jobId -> stopped? for a request between its arrival and its registration in ttsJobs (the request
// key is hashed first, an await): a stop landing in that gap used to find nothing and be lost, and
// the dropped line was then generated anyway, holding the serial server (1.8.9)
const ttsRegistering = new Map();
let ttsJobSeq = 0;
// Engine batches hold at most SYNC.maxBatchPlans (4) lines; 12 leaves room without letting a bad
// message fan out into hundreds of store reads
const TTS_MAX_PARTS = 12;
const TTS_KEY_MAX = 256;
const ttsAborted = () => ({ ok: false, errorType: "aborted", aborted: true, error: "Đã hủy" });

// Why a synthesizeSpeech message is refused before any store read or request, or null when it is
// fine. Parts go straight into store keys and the split weights, so each one is checked
function ttsRequestProblem(req) {
    if (req.jobId !== undefined && (typeof req.jobId !== "string" || !req.jobId || req.jobId.length > 128)) return "jobId";
    if (req.parts === undefined || req.parts === null) return null;
    if (!Array.isArray(req.parts) || req.parts.length > TTS_MAX_PARTS) return "parts";
    for (const p of req.parts) {
        if (!p || typeof p !== "object") return "part";
        if (typeof p.key !== "string" || !p.key || p.key.length > TTS_KEY_MAX) return "part key";
        if (p.weight !== undefined && !(Number.isFinite(p.weight) && p.weight > 0)) return "part weight";
    }
    return null;
}

function bytesToBase64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
}
function base64ToBytesBg(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// Đọc từ kho: đủ MỌI đoạn thì trả luôn (không gọi TTS), thiếu thì null
// Reads run together (1.8.8): each waits up to 1.5 s on a slow IndexedDB, one after another they
// added up. Order of the reply follows parts.
async function cachedParts(parts) {
    const recs = await Promise.all(parts.map(p => caches.audio.get(p.key).catch(() => null)));
    if (recs.some(rec => !rec || !rec.wav)) return null;
    return parts.map((p, i) => ({ key: p.key, wav: recs[i].wav, duration: recs[i].duration, sampleRate: recs[i].sampleRate }));
}

// Audio nhiều đoạn gộp trong một lượt TTS -> cắt lại theo khoảng lặng, làm sạch từng đoạn
// opts.maxPause: rút ngắn khoảng lặng dài bên trong từng đoạn (giọng VieNeu)
// opts.breath (VieNeu): word indices of the breathing commas in opts.text, kept at a breath's length
// opts.text (VieNeu, one part): pauses follow the text (AUDIO.shapePauses): kept at punctuation and
// at clause openings of long sentences, closed elsewhere; opts.clean (VieNeu): rumble cut at
// opts.hpHz and hiss removal (AUDIO.cleanTake)
function splitTtsAudio(b64OrBytes, mime, sr, parts, opts = {}) {
    const bytes = typeof b64OrBytes === "string" ? base64ToBytesBg(b64OrBytes) : b64OrBytes;
    let samples = /wav/i.test(mime || "") ? AUDIO.decodeWav(bytes).samples : AUDIO.pcm16leToFloat(bytes);
    // Rumble and steady hiss are learnt from the whole take, so before it is cut into pieces.
    // A clean voice is detected and left untouched by the hiss removal
    if (opts.clean && AUDIO.cleanTake) samples = AUDIO.cleanTake(samples, sr, { hpHz: opts.hpHz }).samples;
    const split = AUDIO.splitBySilence(samples, sr, parts.map(p => p.weight || 1));
    if (parts.length > 1 && split.confidence < 0.5) return null;
    return parts.map((p, k) => {
        let piece = AUDIO.slice(samples, sr, split.parts[k].start, split.parts[k].end);
        if (opts.text && parts.length === 1 && AUDIO.shapePauses) piece = AUDIO.shapePauses(piece, sr, opts.text, { maxPause: opts.maxPause, breath: opts.breath }).samples;
        else if (opts.maxPause) piece = AUDIO.compressPauses(piece, sr, { maxPause: opts.maxPause });
        const clean = AUDIO.prepareSpeech(piece, sr);
        return { key: p.key, wav: AUDIO.encodeWav(clean, sr), duration: clean.length / sr, sampleRate: sr };
    });
}

function partsReply(parts, extra) {
    return { ok: true, ...extra, parts: parts.map(p => ({ key: p.key, wav: bytesToBase64(p.wav), duration: p.duration, sampleRate: p.sampleRate })) };
}

// req: { text, voice, model, jobId, parts:[{ key, weight }] }
//   parts có mặt (lồng tiếng): kiểm tra kho trước, lưu kho TRƯỚC khi trả lời
//   không có parts (nghe thử trong Cài đặt): trả audio thô, không lưu
async function handleSynthesizeSpeech(req) {
    const text = String(req.text || "").slice(0, 6000);
    if (!text.trim()) return { ok: false, errorType: "invalid", error: "Không có lời thoại" };
    const problem = ttsRequestProblem(req);
    if (problem) return { ok: false, errorType: "invalid", error: `Yêu cầu tạo giọng không hợp lệ (${problem})` };
    const parts = caches && AUDIO && Array.isArray(req.parts) && req.parts.length ? req.parts : null;
    const engine = req.engine === LOCAL.id ? LOCAL.id : "gemini";
    // Paid voice switched off (cost-policy PAID_TTS): never call Gemini TTS, from any page
    if (engine !== LOCAL.id && !COST.PAID_TTS) return { ok: false, errorType: "disabled", error: "Giọng Gemini trả phí đã tắt, chỉ dùng giọng VieNeu" };
    const jobId = req.jobId || `_bg${++ttsJobSeq}`;
    // Known to handleTtsAbort from the first moment: the hash below is an await
    const earlyOwner = !ttsRegistering.has(jobId);
    if (earlyOwner) ttsRegistering.set(jobId, false);
    let reqKey, stoppedEarly = false;
    try {
        reqKey = await CST_CACHE.hashKey(["ttsreq", AUDIO_CACHE_VERSION, engine, req.model || "", req.voice || "", text, req.speak || "", parts ? parts.map(p => p.key) : null]);
    } finally {
        stoppedEarly = ttsRegistering.get(jobId) === true;
        if (earlyOwner) ttsRegistering.delete(jobId);
    }
    if (stoppedEarly) return ttsAborted();
    // Đăng ký lượt NGAY (trước mọi bước chờ) -> yêu cầu giống hệt đến sau luôn nhập chung
    let flight = ttsInFlight.get(reqKey);
    // A flight every job has dropped is still settling (a queued take answers at once, a take the
    // server has started may be kept running, LOCAL_KEEP_RUNNING_S). Joining it handed the new job an
    // "aborted" reply: a seek away and straight back refused the line. The new flight waits for it
    // and uses its take when it finished, so the line is never made twice either (1.8.9)
    if (!flight || flight.controller.signal.aborted) {
        const prev = flight || null;
        const controller = new AbortController();
        const f = { controller, jobs: new Set() };
        const run = async () => {
            if (prev) {
                const before = await prev.promise.catch(() => null);
                if (before && before.ok) return before;
                if (controller.signal.aborted) return ttsAborted();
            }
            // Kho audio: đủ mọi đoạn thì trả luôn, không gọi TTS
            if (parts) {
                const hit = await cachedParts(parts);
                if (hit) { track(metaOf(req), { hitsAudio: parts.length, avoided: 1 }); return partsReply(hit, { fromCache: true }); }
            }
            return engine === LOCAL.id ? synthesizeLocal(req, text, parts, controller.signal) : synthesize(req, text, parts, controller.signal);
        };
        f.promise = run().finally(() => {
            // only this flight's entry: a newer one may have taken the key over
            if (ttsInFlight.get(reqKey) === f) ttsInFlight.delete(reqKey);
            for (const j of f.jobs) if (ttsJobs.get(j) === reqKey) ttsJobs.delete(j);
        });
        ttsInFlight.set(reqKey, f);
        flight = f;
    }
    flight.jobs.add(jobId);
    ttsJobs.set(jobId, reqKey);
    return flight.promise;
}

function handleTtsAbort(req) {
    if (typeof req.jobId !== "string" || !req.jobId) return { ok: true, aborted: false };
    // arrived while the request is still being registered: it is refused as soon as it is
    if (ttsRegistering.has(req.jobId)) { ttsRegistering.set(req.jobId, true); return { ok: true, aborted: true }; }
    const reqKey = ttsJobs.get(req.jobId);
    const flight = reqKey && ttsInFlight.get(reqKey);
    ttsJobs.delete(req.jobId);
    if (!flight) return { ok: true, aborted: false };
    flight.jobs.delete(req.jobId);
    if (!flight.jobs.size) flight.controller.abort();
    return { ok: true, aborted: !flight.jobs.size };
}

// Chuỗi model TTS cho key này: model chỉ định (nếu có) rồi danh mục rẻ trước; bỏ các model
// đã xác nhận không gọi được với key này (không thử lại 404 cho từng lượt).
async function ttsModelsFor(apiKey, preferred) {
    const unavailable = await isUnavailableFn(apiKey);
    return [...new Set([...preferred, ...TTS_MODELS].filter(Boolean))].filter(m => !unavailable(m));
}

// Thời lượng audio ước tính trước khi tạo (để kiểm tra ngân sách)
function estimateAudioSec(text, parts) {
    if (parts) return parts.reduce((a, p) => a + (Number(p.weight) || 0), 0) / 4.6 + 0.4 * (parts.length - 1);
    return String(text).length / 14;
}

async function synthesize(req, text, parts, signal) {
    const cfg = await getSyncCfg({ geminiApiKey: "", dubTtsModel: "" });
    if (!cfg.geminiApiKey) return { ok: false, errorType: "auth", error: "Chưa cài đặt API Key Gemini" };
    const models = await ttsModelsFor(cfg.geminiApiKey, [req.model, cfg.dubTtsModel]);
    if (!models.length) return { ok: false, errorType: "unavailable_for_key", error: "Không có model Gemini TTS nào khả dụng với API key hiện tại" };
    // Hàng rào ngân sách: không tạo audio AI nếu lượt này làm vượt ngân sách ngày / video
    const meta = metaOf(req);
    const budget = await budgetState(meta, COST.estimateTtsCost(models[0], text.length, estimateAudioSec(text, parts)));
    if (!budget.allowed) return { ok: false, errorType: "budget", error: `Đã chạm ngân sách ước tính (${budget.spentDay.toFixed(3)} USD hôm nay); chuyển sang giọng hệ thống`, budget: budget.level };
    const body = {
        contents: [{ parts: [{ text }] }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voice || "Kore" } } }
        }
    };
    let last = null;
    for (const model of models) {
        // Tài liệu Gemini TTS: đôi khi model trả chữ thay vì audio -> thử lại MỘT lần
        for (let pass = 0; pass < 2; pass++) {
            let data;
            try {
                // Lỗi 500/503 thử lại 1 lần. Quá thời gian thì KHÔNG tự gửi lại (máy chủ có thể
                // đã tạo và tính tiền audio): engine quyết định, và luôn tra kho trước khi gửi lại.
                data = await geminiCall(model, cfg.geminiApiKey, body, { timeoutMs: 60000, retries: 1, backoffMs: 1000, signal });
            } catch (e) {
                last = e;
                // Model không tồn tại / không cấp cho key này: thử model kế (đã ghi nhớ, không thử lại lần sau)
                if (e.type === "not_found" || e.type === "unavailable_for_key") break;
                return { ok: false, errorType: e.type, error: e.message, aborted: e.type === "aborted" };
            }
            const part = (data.candidates?.[0]?.content?.parts || []).find(p => p.inlineData && p.inlineData.data);
            if (!part) { last = new GeminiError("no_audio", "Gemini TTS không trả audio"); continue; }
            const mime = part.inlineData.mimeType || "audio/L16;rate=24000";
            const rate = Number((mime.match(/rate=(\d+)/) || [])[1]) || 24000;
            const audioSec = Math.round(part.inlineData.data.length * 0.75) / 2 / rate;
            track(meta, { ttsUsd: COST.estimateTtsCost(model, text.length, audioSec), ttsCalls: 1, audioSec });
            if (!parts) return { ok: true, audio: part.inlineData.data, mimeType: mime, sampleRate: rate, model };
            const pieces = splitTtsAudio(part.inlineData.data, mime, rate, parts);
            if (!pieces) return { ok: false, errorType: "split", error: "Không cắt được audio theo từng đoạn" };
            // LƯU KHO NGAY: tab đóng, người dùng tua đi, tin nhắn trả lời bị mất...
            // thì audio đã trả tiền vẫn còn, lần sau không phải tạo lại.
            for (const p of pieces) await caches.audio.set(p.key, { wav: p.wav, duration: p.duration, sampleRate: p.sampleRate });
            return partsReply(pieces, { model, budget: budget.level });
        }
        if (last && last.type === "no_audio") break;
    }
    return { ok: false, errorType: (last && last.type) || "not_found", error: (last && last.message) || "Không tìm được model Gemini TTS khả dụng" };
}

// ---- Giọng Việt trên máy: VieNeu-TTS (máy chủ cục bộ tương thích OpenAI, 127.0.0.1) ----
// Không tốn tiền API; audio vẫn vào cùng kho audio và cơ chế chống tạo trùng như Gemini.
const LOCAL = COST.LOCAL_TTS;

// Tốc độ tạo giọng THẬT của máy chủ VieNeu: thời gian tạo / thời lượng audio (RTF) của 5 lượt gần
// nhất. Lồng tiếng phải tạo TRƯỚC khoảng 20 giây audio, nên RTF gần 1 là giọng sẽ trễ. Đo thật
// 23/09/2026: dịch vụ chạy ở mức ưu tiên thấp làm RTF từ 0,23 lên 1,07 mà không có gì báo.
const localSpeed = { gan: [] };
function ghiTocDoTao(giaySinh, giayAudio) {
    if (!(giayAudio > 0.3)) return;
    localSpeed.gan.push(giaySinh / giayAudio);
    while (localSpeed.gan.length > 5) localSpeed.gan.shift();
}
function tocDoTaoGiong() {
    if (!localSpeed.gan.length) return 0;
    return localSpeed.gan.reduce((a, b) => a + b, 0) / localSpeed.gan.length;
}

// Cold server: VieNeu left idle for hours gets its model swapped out by macOS (seen: 24 MB resident
// of 1.2 GB after four days). The first renders then run at ~3.5x real time instead of ~0.23 while
// the weights page back in; with the normal 8 s limit they were cut off and rendered again from
// scratch, and their speed made the page drop sentences. After a long idle the first line gets a long
// limit and stays out of the speed log. No warm-up line: it was removed in 1.2.6 because it delays
// the first sentence on a warm server, and on a cold one it only moves the same page-in earlier.
const LOCAL_COLD_MS = 10 * 60 * 1000;
const LOCAL_COLD_TIMEOUT_MS = 60000;
const LOCAL_LAST_OK_KEY = "localTtsLastOk";
let localLastOk = 0;
async function localIsCold() {
    if (!localLastOk && sessionArea) {
        // The service worker sleeps after 30 s idle and forgets; session storage does not
        try { localLastOk = Number((await sessionArea.get(LOCAL_LAST_OK_KEY))[LOCAL_LAST_OK_KEY]) || 0; } catch (e) { /* keep 0 */ }
    }
    return Date.now() - localLastOk > LOCAL_COLD_MS;
}
function localMarkWarm() {
    localLastOk = Date.now();
    if (sessionArea) { try { sessionArea.set({ [LOCAL_LAST_OK_KEY]: localLastOk }); } catch (e) { /* in-memory is enough */ } }
}
async function handleLocalTtsStatus() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
        const res = await fetch(LOCAL.url + "/health", { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        const running = res.ok && data.status === "ok";
        let model = "";
        if (running) {
            try { const m = await (await fetch(LOCAL.url + "/v1/models", { signal: controller.signal })).json(); model = ((m.data || [])[0] || {}).id || ""; } catch (e) { model = ""; }
        }
        return { ok: true, running, backend: data.backend || "", model, busy: (data.active || 0) + (data.waiting || 0), rtf: Math.round(tocDoTaoGiong() * 100) / 100 };
    } catch (e) {
        return { ok: true, running: false, error: "Máy chủ VieNeu chưa chạy" };
    } finally {
        clearTimeout(timer);
    }
}

// ---- Cold-server warm-up (2.2.6, BACKLOG 20) ----
// macOS pages VieNeu's model out after a long idle; the first real line then waits for the page-in
// and renders at ~3.5x real time. Dubbing starts 1-2 s before its first translated line exists, so
// a tiny take sent at that moment pages the model in while nothing else needs the server. Only
// when cold (localIsCold: no good take for 10 min) and the queue is empty: on a warm server the
// 1.2.6 measurement stands (a warm-up line only delayed the first real one). Same serial queue as
// every take, so a real line arriving meanwhile waits for it instead of competing with it.
let localWarming = null;
async function handleLocalWarm(req) {
    if (localWarming) return localWarming;
    if (!(await localIsCold())) return { ok: true, warmed: false, reason: "warm" };
    if (localBusy || localQueue.length) return { ok: true, warmed: false, reason: "busy" };
    localWarming = localSerial(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), LOCAL_COLD_TIMEOUT_MS);
        const t0 = Date.now();
        try {
            const body = JSON.stringify({ model: LOCAL.model, voice: req.voice || LOCAL.defaultVoice, input: "Xin chào.", response_format: "pcm", sample_rate: LOCAL.sampleRate, temperature: LOCAL.temperature });
            const res = await fetch(LOCAL.url + "/v1/audio/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal });
            await res.arrayBuffer();
            if (!res.ok) return { ok: false, warmed: false, error: `VieNeu HTTP ${res.status}` };
            localMarkWarm();
            return { ok: true, warmed: true, ms: Date.now() - t0 };
        } catch (e) {
            return { ok: false, warmed: false, error: e.message };
        } finally {
            clearTimeout(timer);
        }
    }).finally(() => { localWarming = null; });
    return localWarming;
}

// Máy chủ VieNeu trên CPU chỉ tạo MỘT luồng mỗi lúc: mọi yêu cầu (mọi tab, trang Cài đặt)
// xếp hàng TẠI ĐÂY, gửi lần lượt -> không tự gây lỗi 429 "máy chủ bận". First in, first out (the
// priority lane served only the voice warm-up, removed in 1.7.3).
const localQueue = [];
let localBusy = false;
// A job dropped while it waits leaves the queue and answers at once (1.8.9): before, it answered
// only when the queue reached it, so the flight stayed half-dead behind the take being made
function localSerial(fn, signal) {
    return new Promise(resolve => {
        const job = { fn, signal, resolve, onAbort: null };
        if (signal && !signal.aborted) {
            job.onAbort = () => {
                const i = localQueue.indexOf(job);
                if (i < 0) return;                      // already taken by the pump
                localQueue.splice(i, 1);
                resolve(ttsAborted());
            };
            signal.addEventListener("abort", job.onAbort, { once: true });
        }
        localQueue.push(job);
        localPump();
    });
}
async function localPump() {
    if (localBusy) return;
    localBusy = true;
    try {
        while (localQueue.length) {
            const job = localQueue.shift();
            if (job.onAbort) job.signal.removeEventListener("abort", job.onAbort);
            let r;
            if (job.signal && job.signal.aborted) r = ttsAborted();
            else { try { r = await job.fn(); } catch (e) { r = { ok: false, errorType: "local_error", error: String(e && e.message || e) }; } }
            job.resolve(r);
        }
    } finally {
        localBusy = false;
    }
}

// Thời gian chờ theo độ dài câu: bình thường tạo 1 giây lời mất ~0,25 giây (M3). Một lượt vượt
// xa mức đó là mô hình bị kẹt (log thật: 6 giây audio mất 45 giây, chặn mọi câu khác) ->
// hủy sớm và tạo lại, thay vì chờ 45 giây rồi bỏ câu.
function localTimeoutMs(text) {
    const syl = String(text || "").split(/\s+/).filter(Boolean).length;
    const audioSec = syl / 3.2;
    return Math.round(Math.min(45, Math.max(8, 4 + audioSec * 0.9)) * 1000);
}

async function synthesizeLocal(req, text, parts, signal) {
    let last = null;
    // Kẹt / audio bất thường: thử lại một lần (lấy mẫu ngẫu nhiên nên lần sau thường bình thường)
    for (let attempt = 0; attempt < 2; attempt++) {
        last = await localSerial(() => synthesizeLocalOnce(req, text, parts, signal), signal);
        // a dropped connection mid-body is as passing as a stuck take: free, so tried once more
        if (last.ok || !(last.errorType === "timeout" || last.errorType === "runaway" || last.errorType === "dropped")) return last;
        if (signal && signal.aborted) break;
        console.warn(`[VieNeu] ${last.error}; tạo lại lần ${attempt + 2}`);
    }
    if (last && last.errorType === "runaway") last.errorType = "local_error";
    return last;
}

// Máy chủ đang bận việc khác (tab / ứng dụng khác ngoài hàng đợi này): chờ tới khi rảnh
// (tối đa ~20 giây) rồi mới gửi và bắt đầu tính giờ, để thời gian xếp hàng trên máy chủ
// không bị tính nhầm thành "kẹt". /health không trả lời thì gửi luôn như cũ.
async function waitLocalIdle(signal, maxMs = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
        if (signal && signal.aborted) return;
        // The poll follows the job's signal and its 1.5 s limit covers the body too (1.8.9): a hung
        // /health held a line the viewer had already left for 1.5 s, and a body that never ended
        // held the whole queue
        const controller = new AbortController();
        const stop = () => controller.abort();
        const timer = setTimeout(stop, 1500);
        if (signal) signal.addEventListener("abort", stop, { once: true });
        try {
            const r = await fetch(LOCAL.url + "/health", { signal: controller.signal });
            const h = await r.json();
            if (!h || typeof h.active !== "number" || h.active < (h.max_streams || 1)) return;
        } catch (e) {
            return;
        } finally {
            clearTimeout(timer);
            if (signal) signal.removeEventListener("abort", stop);
        }
        await sleep(250, signal).catch(() => {});
    }
}

// Rumble cut for a VieNeu voice (AUDIO.highPass): higher for a female voice, whose pitch never
// reaches that low, than for a male one
function localHighPass(voice) {
    const v = LOCAL.voices.find(x => x.id === (voice || LOCAL.defaultVoice));
    return v && v.gender === "Nữ" ? LOCAL.highPassHz.female : LOCAL.highPassHz.male;
}

// A request the server has started is let finish when the page drops it (a seek, a pause) unless it
// still needs longer than this. VieNeu keeps its only stream slot ~4-5 s after the client leaves
// (apps/openai_speech.py _Lease: 4 s idle, 1 s watchdog) and the next request waits for it
// (waitLocalIdle): server.log showed 11 of 23 aborts holding the next line, the one the viewer
// seeked to, 3 to 5 s, for a take that needed ~1 s more. A finished take goes to the store.
const LOCAL_KEEP_RUNNING_S = 4;

async function synthesizeLocalOnce(req, text, parts, signal) {
    const controller = new AbortController();
    let timedOut = false;
    // Cold: a long limit, so the page-in is not cut off and started again
    const cold = await localIsCold();
    const limit = cold ? Math.max(localTimeoutMs(text), LOCAL_COLD_TIMEOUT_MS) : localTimeoutMs(text);
    let timer = null;
    let sentAt = 0;                     // the server holds this request (its slot is taken)
    // How far the take got, for the error code (1.8.9): a failure before any reply is a server that
    // is not running (the engine may switch to the system voice), one while the body streams is a
    // dropped connection, one after it is audio this code could not process. All three used to read
    // "server not running"
    let stage = "connect";
    const words = String(text || "").split(/\s+/).filter(Boolean).length;
    const onAbort = () => {
        if (sentAt && !cold) {
            const left = 0.3 + (words / 3.2) * (tocDoTaoGiong() || 0.3) - (Date.now() - sentAt) / 1000;
            if (left <= LOCAL_KEEP_RUNNING_S) return;
        }
        controller.abort();
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    try {
        await waitLocalIdle(signal);
        // req.speak: the same line with its English spans written for VieNeu's front end
        // (dub-speech.js); `text` stays the one the pauses are placed on
        const input = typeof req.speak === "string" && req.speak.trim() ? req.speak.slice(0, 6000) : text;
        const body = JSON.stringify({ model: LOCAL.model, voice: req.voice || LOCAL.defaultVoice, input, response_format: "pcm", sample_rate: LOCAL.sampleRate, temperature: LOCAL.temperature });
        let res;
        // Máy chủ vẫn bận (tab khác ngoài hàng đợi này, máy chủ đang làm việc khác): chờ theo
        // Retry-After rồi thử lại, tổng tối đa ~15 giây. Miễn phí nên thử lại không tốn gì.
        const t0 = Date.now();
        for (let attempt = 0; ; attempt++) {
            clearTimeout(timer);
            timer = setTimeout(() => { timedOut = true; controller.abort(); }, limit);
            if (signal && signal.aborted) return ttsAborted();      // dropped while waiting: never sent
            sentAt = Date.now();
            res = await fetch(LOCAL.url + "/v1/audio/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal });
            if (res.status === 429) sentAt = 0;                      // the server did not take it
            if (res.status !== 429 || Date.now() - t0 > 15000) break;
            clearTimeout(timer);
            const wait = Math.min(3000, (Number(res.headers && res.headers.get && res.headers.get("Retry-After")) || 1) * 1000);
            await sleep(wait, controller.signal);
        }
        if (!res.ok) {
            const detail = (await res.text().catch(() => "")).slice(0, 200);
            return { ok: false, errorType: res.status === 429 ? "rate_limit" : "local_error", error: `VieNeu HTTP ${res.status}: ${detail}` };
        }
        stage = "body";
        const bytes = new Uint8Array(await res.arrayBuffer());
        stage = "process";
        if (bytes.length < 2000) return { ok: false, errorType: "no_audio", error: "VieNeu không trả audio" };
        const sr = LOCAL.sampleRate;
        const audioSec = bytes.length / 2 / sr;
        // Audio dài bất thường so với lời thoại (mô hình lặp / kéo dài âm): không dùng
        const syl = String(text || "").split(/\s+/).filter(Boolean).length;
        if (syl >= 3 && audioSec > 2.5 + syl / 1.6) return { ok: false, errorType: "runaway", error: `audio dài bất thường (${audioSec.toFixed(1)} giây cho ${syl} âm tiết)` };
        if (!cold) ghiTocDoTao((Date.now() - t0) / 1000, audioSec);
        localMarkWarm();
        track(metaOf(req), { localSec: audioSec });
        const mime = `audio/L16;rate=${sr}`;
        if (!parts) {
            // Nghe thử trong Cài đặt: cùng cách xử lý như khi lồng tiếng (rút khoảng lặng dài)
            const one = splitTtsAudio(bytes, mime, sr, [{ key: "_", weight: 1 }], { maxPause: LOCAL.maxPause, text, clean: true, hpHz: localHighPass(req.voice) });
            return { ok: true, audio: bytesToBase64(one[0].wav), mimeType: "audio/wav", sampleRate: sr, model: LOCAL.model };
        }
        // Câu dày chữ: engine xin khoảng nghỉ ngắn hơn (không bỏ chữ); giới hạn trong [0,1 ; mặc định]
        const maxPause = req.maxPause ? Math.max(0.1, Math.min(LOCAL.maxPause, Number(req.maxPause) || LOCAL.maxPause)) : LOCAL.maxPause;
        // (2.1.8) word indices of the breathing commas in text: kept at a breath's length
        const breath = Array.isArray(req.breath) ? req.breath.filter(i => Number.isInteger(i) && i >= 0).slice(0, 64) : undefined;
        const pieces = splitTtsAudio(bytes, mime, sr, parts, { maxPause, text, breath, clean: true, hpHz: localHighPass(req.voice) });
        if (!pieces) return { ok: false, errorType: "split", error: "Không cắt được audio theo từng đoạn" };
        // stored together; a write never throws and is capped (cst-cache WRITE_TIMEOUT_MS)
        await Promise.all(pieces.map(p => caches.audio.set(p.key, { wav: p.wav, duration: p.duration, sampleRate: p.sampleRate })));
        return partsReply(pieces, { model: LOCAL.model });
    } catch (e) {
        if (timedOut) return { ok: false, errorType: "timeout", error: `VieNeu quá ${Math.round(limit / 1000)} giây chưa tạo xong` };
        if (signal && signal.aborted) return ttsAborted();
        if (stage === "body") return { ok: false, errorType: "dropped", error: `VieNeu ngắt kết nối giữa chừng: ${String(e && e.message || e).slice(0, 120)}` };
        if (stage === "process") return { ok: false, errorType: "invalid", error: `Không xử lý được audio VieNeu: ${String(e && e.message || e).slice(0, 120)}` };
        return { ok: false, errorType: "local_unavailable", error: `Máy chủ VieNeu chưa chạy (nhấp đúp ${LOCAL.startScript})` };
    } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
    }
}

// Xóa audio đã lưu của MỘT video (trang gửi danh sách khóa audio của các đoạn trong video đó)
async function handleAudioCacheDelete(req) {
    if (!caches) return { ok: true, removed: 0 };
    // keys checked like the reads (1.9.1): a non-array threw inside the handler, over-long or repeated
    // keys were sent to IndexedDB one by one
    if (!Array.isArray(req.keys)) return { ok: false, errorType: "invalid", error: "Danh sách khóa không hợp lệ", removed: 0 };
    const keys = [...new Set(req.keys.filter(k => typeof k === "string" && k.length > 0 && k.length <= TTS_KEY_MAX))].slice(0, 5000);
    return { ok: true, removed: await caches.audio.remove(keys) };
}

async function handleAudioCacheGet(req) {
    if (!caches) return { ok: true, hits: {} };
    const hits = {};
    // Validated and read together: a page lookup of 8 keys on a wedged store took 8 x 1.5 s
    const keys = [...new Set((Array.isArray(req.keys) ? req.keys : []).filter(k => typeof k === "string" && k.length > 0 && k.length <= 256))].slice(0, 12);
    const recs = await Promise.all(keys.map(k => caches.audio.get(k).catch(() => null)));
    keys.forEach((k, i) => {
        const rec = recs[i];
        if (rec && rec.wav && rec.wav.length) hits[k] = { wav: bytesToBase64(rec.wav), duration: rec.duration, sampleRate: rec.sampleRate };
    });
    const n = Object.keys(hits).length;
    if (n) track(metaOf(req), { hitsAudio: n, avoided: n });
    return { ok: true, hits };
}

// ---- Quản lý bộ nhớ đệm (trang Cài đặt) ----
// The saved-video counter in Settings. The user watches a batch of new videos, then asks for a review
// of the whole batch from the cache; REVIEW_MARK is where the last review stopped. The session that
// finishes a review moves it: `until` = the newest reviewed video's `luc` (node tools/ext-storage.js
// --prefix=ytcache4_), `videos` = how many were reviewed in all. A video saved after `until` is new.
// YT_SAVED_MAX mirrors youtube.js YT_CACHE_TOI_DA (a test keeps the two equal).
const REVIEW_MARK = { until: 1791127534084, videos: 45 };      // 2026-10-05, the 6-video batch (2.4.7)
const YT_SAVED_MAX = 100;
async function localCacheBytes() {
    const all = await new Promise(r => chrome.storage.local.get(null, r));
    let bytes = 0, count = 0;
    const videos = { count: 0, bytes: 0, fresh: 0, max: YT_SAVED_MAX, reviewed: REVIEW_MARK.videos, until: REVIEW_MARK.until };
    for (const [k, v] of Object.entries(all)) {
        if (!/^ytcache|^ctxterms_/.test(k)) continue;
        const chars = JSON.stringify(v).length;
        bytes += chars * 2;
        count++;
        if (!/^ytcache4_/.test(k)) continue;
        videos.count++;
        videos.bytes += Math.round(chars * 1.15);              // UTF-8, as youtube.js ytCacheBytes
        if (((v && v.luc) || 0) > REVIEW_MARK.until) videos.fresh++;
    }
    return { bytes, count, videos, keys: Object.keys(all).filter(k => /^ytcache|^ctxterms_/.test(k)) };
}

async function handleCacheStats() {
    if (!caches) return { ok: false, error: "Không có IndexedDB" };
    const [tr, audio, local] = await Promise.all([caches.tr.info(), caches.audio.info(), localCacheBytes()]);
    return { ok: true, tr, audio, local: { bytes: local.bytes, count: local.count }, videos: local.videos };
}

async function handleCacheClear(req) {
    const which = req.which || "all";
    // "reviewed" (2.4.1): only the saved videos the last review already covered, so that the store
    // holds the new batch alone. Their audio stays (keyed by text, not by video) and ages out.
    if (which === "reviewed") {
        const all = await new Promise(r => chrome.storage.local.get(null, r));
        const keys = Object.keys(all).filter(k => /^ytcache4_/.test(k) && ((all[k] && all[k].luc) || 0) <= REVIEW_MARK.until);
        if (keys.length) await new Promise(r => chrome.storage.local.remove(keys, r));
        return { ...(await handleCacheStats()), removed: keys.length };
    }
    if (caches && (which === "tr" || which === "all")) await caches.tr.clear();
    if (caches && (which === "audio" || which === "all")) await caches.audio.clear();
    if (which === "tr" || which === "all") {
        const local = await localCacheBytes();
        if (local.keys.length) await new Promise(r => chrome.storage.local.remove(local.keys, r));
    }
    return handleCacheStats();
}

// ---- Chuyển đổi cài đặt model cũ (một lần, theo danh mục trong cost-policy.js) ----
try {
    chrome.storage.sync.get({ geminiModel: "", geminiStrongModel: "", costMigration113: false, modelsVersion: 0 }, cfg => {
        const patch = COST.migrateModelSettings(cfg);
        if (Object.keys(patch).length) chrome.storage.sync.set(patch);
    });
} catch (e) { /* chạy ngoài extension */ }

// ---- Trạng thái model theo API key (trang Cài đặt, lồng tiếng) ----
async function handleModelStatus(req) {
    const cfg = await modelsFromCfg();
    const apiKey = String(req.key || cfg.geminiApiKey || "").trim();
    await accessReady;
    const kh = apiKey ? await keyHash(apiKey) : "";
    const unavailable = await isUnavailableFn(apiKey);
    const cheap = apiKey ? await likelyModel("cheap", cfg, apiKey) : { id: COST.modelChain("cheap", cfg, cfg.costMode, unavailable)[0] || "", retry: "" };
    const models = {};
    for (const m of [...COST.TRANSLATION_MODELS, ...COST.TTS_MODELS]) {
        const a = kh ? accessOf(kh, m.id) : null;
        models[m.id] = a ? { state: a.s, suggested: a.suggested || "", until: a.until } : { state: m.id === cheap.retry ? "retry" : "unknown" };
    }
    const tts = (await ttsModelsFor(apiKey, [cfg.dubTtsModel]))[0] || "";
    return {
        ok: true, hasKey: !!apiKey, models,
        effective: {
            cheap: cheap.id,
            cheapRetry: cheap.retry,
            strong: COST.modelChain("strong", cfg, cfg.costMode, unavailable)[0] || "",
            tts
        }
    };
}

// Kiểm tra khóa bằng một lượt generateContent THẬT (nguồn sự thật về quyền truy cập),
// theo đúng chuỗi model sẽ dùng; ghi nhận model nào gọi được / không.
async function handleTestKey(req) {
    await ledgerReady;                     // its call is charged; the ledger must be loaded first
    const apiKey = String(req.key || "").trim();
    if (!apiKey) return { ok: false, error: "Chưa nhập API Key" };
    // The viewer asks for a real check, typically right after fixing billing or permissions in AI
    // Studio: the 10-minute block from the last refusal would answer it without asking Google.
    // A failed test sets it again; a passing one lets translation use the key at once.
    if (keyBlock && keyBlock.key === apiKey) keyBlock = null;
    const cfg = { ...(await modelsFromCfg()), cheap: req.model || COST.DEFAULT_MODELS.cheap };
    const tried = [];
    const t0 = Date.now();
    for (let guard = 0; guard < 6; guard++) {
        const unavailable = await isUnavailableFn(apiKey);
        const model = COST.modelChain("cheap", cfg, "balanced", unavailable).find(m => !tried.includes(m));
        if (!model) break;
        tried.push(model);
        try {
            const data = await geminiCall(model, apiKey, {
                contents: [{ parts: [{ text: "Dịch sang tiếng Việt, chỉ trả bản dịch: 'Artificial Intelligence'" }] }],
                generationConfig: { maxOutputTokens: 40, temperature: 0.1 }
            }, { timeoutMs: 15000, retries: 1, onBilled: data => trackText({}, model, usageOf(data, 80, 25)) });
            return { ok: true, model, sample: responseText(data).trim(), latency: Date.now() - t0, skipped: tried.slice(0, -1) };
        } catch (e) {
            if (e.type !== "not_found" && e.type !== "unavailable_for_key") return { ok: false, model, errorType: e.type, error: e.message, skipped: tried.slice(0, -1) };
        }
    }
    return { ok: false, errorType: "unavailable_for_key", error: "Không model nào trong danh sách gọi được với API key này", skipped: tried };
}

// ---- Mở trang Cài đặt từ content script (trang YouTube/Coursera không được tự mở
// chrome-extension://.../options.html: Chrome chặn với ERR_BLOCKED_BY_CLIENT) ----
async function handleOpenOptions() {
    try {
        await chrome.runtime.openOptionsPage();
        return { ok: true, via: "openOptionsPage" };
    } catch (e) {
        try {
            await chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
            return { ok: true, via: "tabs.create", note: e && e.message };
        } catch (e2) {
            return { ok: false, error: (e2 && e2.message) || String(e2) };
        }
    }
}

async function handleCostStats() {
    await ledgerReady;
    rollDay();
    const budget = await budgetState({});
    // The model a new line goes to now ("auto" resolved for this key) and its price, so the
    // Settings card says which rate the estimate uses
    let model = null;
    try {
        const cfg = await modelsFromCfg();
        const pick = cfg.geminiApiKey ? await likelyModel("cheap", cfg, cfg.geminiApiKey) : { id: null };
        const id = pick.id;
        const p = id && COST.priceOf(id);
        if (id) model = { id, label: COST.modelLabel(id), price: p.price, how: p.how, base: p.base, retry: pick.retry, retryLabel: pick.retry ? COST.modelLabel(pick.retry) : "" };
    } catch (e) { model = null; }
    return { ok: true, day: ledger, session: sessionStats, budget, model, history, pacificToday: pacificDay() };
}

async function handleCostReset() {
    await ledgerReady;                     // a load that finishes after the reset brings the old numbers back
    ledger = { day: localDay(), ...emptyStats(), videos: {} };
    sessionStats = emptyStats();
    saveLedgerSoon();
    return handleCostStats();
}

// ---- Giọng VieNeu mặc định mới (1.1.11): Mỹ Duyên + Thái Sơn (miền Nam). Chỉ đổi khi
// người dùng còn để đúng mặc định cũ (Thùy Dung + Minh Triết) hoặc chưa chọn; một lần.
try {
    chrome.storage.sync.get({ dubLocalVoice: "", dubLocalVoice2: "", localVoices1111: false }, cfg => {
        if (cfg.localVoices1111) return;
        const patch = { localVoices1111: true };
        if (!cfg.dubLocalVoice || cfg.dubLocalVoice === "Thùy Dung") patch.dubLocalVoice = COST.LOCAL_TTS.defaultVoice;
        if (!cfg.dubLocalVoice2 || cfg.dubLocalVoice2 === "Minh Triết") patch.dubLocalVoice2 = COST.LOCAL_TTS.defaultVoice2;
        chrome.storage.sync.set(patch);
    });
} catch (e) { /* chạy ngoài extension */ }

// ---- 1.7.0: the user asked for Mỹ Duyên as THE voice. Set it once, whatever was chosen before
// (they had been trying Thục Đoan); a later choice in Settings is kept, the flag stops a repeat.
try {
    chrome.storage.sync.get({ voiceMyDuyen170: false }, cfg => {
        if (cfg.voiceMyDuyen170) return;
        chrome.storage.sync.set({ voiceMyDuyen170: true, dubLocalVoice: COST.LOCAL_TTS.defaultVoice });
    });
} catch (e) { /* chạy ngoài extension */ }

// ---- Tải lại / cập nhật tiện ích: nạp lại mã vào các tab YouTube / Coursera ĐANG MỞ ----
// Chrome không tự làm việc này: tab mở từ trước giữ mã cũ đã mất kết nối (không dịch, không lồng
// tiếng, phụ đề biến mất) cho tới khi người dùng F5. Mã cũ tự tắt (xem ytTuTatKhiMatKetNoi), mã
// mới được nạp đúng thứ tự như trong manifest.
function pageKind(url) {
    try {
        const h = new URL(url).hostname;
        if (/(^|\.)youtube\.com$/.test(h)) return "youtube";
        if (/(^|\.)coursera\.org$/.test(h)) return "coursera";
    } catch (e) { /* bỏ qua */ }
    return "";
}
// Phím tắt (Alt+S phụ đề, Alt+D lồng tiếng; đổi được ở chrome://extensions/shortcuts).
// Chỉ chuyển tiếp cho tab đang xem; không cần thêm quyền nào.
if (chrome.commands && chrome.commands.onCommand) {
    chrome.commands.onCommand.addListener(async (command, tab) => {
        try {
            const t = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
            if (!t || t.id == null) return;
            try {
                await chrome.tabs.sendMessage(t.id, { method: "phimTat", command });
            } catch (e) {
                // No content script: any other video site. The shortcut grants activeTab, so the
                // scripts can be injected now and the command delivered to them.
                if (!(await injectGenericPage(t))) return;
                await chrome.tabs.sendMessage(t.id, { method: "phimTat", command });
            }
        } catch (e) { /* trang không cho chèn mã (chrome://, cửa hàng tiện ích): bỏ qua */ }
    });
}

// Pages other than YouTube / Coursera get the ISOLATED content-script group on demand only, when
// the viewer clicks Translate in the popup or presses a shortcut (both grant activeTab). No
// broad host permission is requested. Already injected: the page answers the probe, nothing runs.
async function injectGenericPage(tab) {
    if (!tab || tab.id == null || !/^https?:/.test(tab.url || "") || !chrome.scripting) return false;
    const [probe] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => !!(window.CST_UI && window.CST_STYLE) });
    if (probe && probe.result) return true;
    const group = (chrome.runtime.getManifest().content_scripts || []).find(g => g.world !== "MAIN" && (g.js || []).includes("content.js"));
    if (!group) return false;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: group.js });
    return true;
}

async function reinjectOpenTabs() {
    if (!chrome.scripting || !chrome.tabs || !chrome.tabs.query) return 0;
    const groups = (chrome.runtime.getManifest().content_scripts || []);
    const tabs = await chrome.tabs.query({ url: ["*://*.youtube.com/*", "*://*.coursera.org/*"] });
    let n = 0;
    for (const tab of tabs) {
        const kind = pageKind(tab.url || "");
        if (!kind || tab.discarded) continue;
        for (const g of groups) {
            if (!(g.matches || []).some(m => m.includes(kind === "youtube" ? "youtube.com" : "coursera.org"))) continue;
            try {
                await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: g.world === "MAIN" ? "MAIN" : "ISOLATED", files: g.js });
            } catch (e) { /* tab không cho chèn (trang lỗi, đang tải): bỏ qua */ }
        }
        n++;
    }
    return n;
}
try {
    chrome.runtime.onInstalled.addListener(details => {
        if (details && (details.reason === "update" || details.reason === "install")) reinjectOpenTabs().catch(() => {});
    });
} catch (e) { /* chạy ngoài extension */ }

// ---- Nguồn giọng mặc định mới (1.1.13): Giọng Việt trên máy (VieNeu). Chỉ đổi khi người
// dùng còn để "Tự động" (mặc định cũ) hoặc chưa chọn; một lần.
try {
    chrome.storage.sync.get({ dubProvider: "", dubProvider1113: false }, cfg => {
        if (cfg.dubProvider1113) return;
        const patch = { dubProvider1113: true };
        if (!cfg.dubProvider || cfg.dubProvider === "auto") patch.dubProvider = "vieneu";
        chrome.storage.sync.set(patch);
    });
    // 1.8.1: the paid voice is off; a stored "gemini", "auto" or "system" becomes "vieneu", once
    chrome.storage.sync.get({ dubProvider: "", dubProvider181: false }, cfg => {
        if (cfg.dubProvider181 || COST.PAID_TTS) return;
        chrome.storage.sync.set({ dubProvider181: true, dubProvider: "vieneu" });
    });
} catch (e) { /* chạy ngoài extension */ }

// ---- Kiểu phụ đề mặc định mới (1.1.8): cỡ 90%, độ đậm 400, viền quầng mờ, lề 1% ----
// Chỉ đổi những mục NGƯỜI DÙNG CHƯA TỰ CHỈNH (còn đúng giá trị mặc định cũ); một lần.
try {
    chrome.storage.sync.get({ subStyle: null, styleDefaults118: false }, cfg => {
        if (cfg.styleDefaults118) { migrateFontScale170(); return; }
        const s = cfg.subStyle;
        const patch = { styleDefaults118: true };
        if (s && typeof s === "object") {
            const old = { fontSize: 130, fontWeight: "500", strokeStyle: "shadow", offset: 3 };
            const next = { fontSize: 90, fontWeight: "400", strokeStyle: "glow", offset: 1 };
            const ns = { ...s };
            for (const k of Object.keys(old)) if (String(s[k]) === String(old[k])) ns[k] = next[k];
            patch.subStyle = ns;
        }
        chrome.storage.sync.set(patch, () => migrateFontScale170());
    });
} catch (e) { /* chạy ngoài extension */ }

// ---- Subtitle size scale (1.7.0): the old 70% is now called 100% (CST_STYLE.SIZE_UNIT = 0.7) ----
// A stored size keeps its look: new = old / 0.7, rounded to 5 (70 -> 100, 90 -> 130, 130 -> 185).
// Runs after the 1.1.8 migration above (chained), once.
function migrateFontScale170() {
    try {
        chrome.storage.sync.get({ subStyle: null, fontScale170: false }, cfg => {
            if (cfg.fontScale170) return;
            const patch = { fontScale170: true };
            const s = cfg.subStyle;
            if (s && typeof s === "object" && Number(s.fontSize) > 0) {
                patch.subStyle = { ...s, fontSize: Math.max(50, Math.min(300, Math.round(Number(s.fontSize) / 0.7 / 5) * 5)) };
            }
            chrome.storage.sync.set(patch);
        });
    } catch (e) { /* chạy ngoài extension */ }
}

// The only YouTube bridge is yt-bridge.js. When the page predates the extension (reload) and the
// manifest injection never ran, the content script asks for it here: executeScript in the MAIN
// world bypasses the page CSP and Trusted Types, which an inline <script> copy did not.
// yt-bridge.js guards itself (__cst_bridge_v2), so a second injection is a no-op.
async function handleEnsureYtBridge(req, sender) {
    const tabId = sender && sender.tab && sender.tab.id;
    if (tabId == null || !chrome.scripting) return { ok: false, error: "no-tab" };
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [sender.frameId || 0] }, world: "MAIN", files: ["yt-bridge.js"] });
    return { ok: true };
}

const ROUTES = {
    ensureYtBridge: handleEnsureYtBridge,
    translateUnit: handleTranslateUnit,
    translateUnitStore: handleTranslateUnitStore,
    synthesizeSpeech: handleSynthesizeSpeech,
    audioCacheGet: handleAudioCacheGet,
    audioCacheDelete: handleAudioCacheDelete,
    cacheStats: handleCacheStats,
    cacheClear: handleCacheClear,
    modelStatus: handleModelStatus,
    testKey: handleTestKey,
    openOptions: handleOpenOptions,
    costStats: handleCostStats,
    localTtsStatus: handleLocalTtsStatus,
    localWarm: handleLocalWarm,
    costReset: handleCostReset
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ttsAbort") {
        sendResponse(handleTtsAbort(request));
        return false;
    }
    const route = ROUTES[request.action];
    if (!route) return false;
    route(request, sender).then(sendResponse).catch(err => sendResponse({ ok: false, errorType: err.type || "unknown", error: err.message }));
    return true;
});

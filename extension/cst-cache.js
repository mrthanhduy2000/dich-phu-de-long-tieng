// ============================================================
// BỘ NHỚ ĐỆM BỀN VỮNG (L1 RAM -> L2 IndexedDB) CHO BẢN DỊCH & AUDIO
//
// Chạy trong service worker (background.js). Sống qua: tải lại extension,
// khởi động lại trình duyệt, service worker bị Chrome tắt khi rảnh.
//
// - Khóa = SHA-256 của mọi thứ quyết định kết quả (phiên bản prompt/chiến
//   lược, model, giọng, văn bản đã chuẩn hóa, ngữ cảnh...). Không dùng mã
//   video làm khóa -> cùng một câu ở video khác vẫn dùng lại được.
// - Mỗi kho có PHIÊN BẢN riêng: đổi prompt/giọng/kiểu đọc thì tăng số
//   phiên bản, bản ghi cũ tự thành "không khớp" và bị dọn dần.
// - Giới hạn dung lượng, xóa mục ÍT DÙNG GẦN ĐÂY NHẤT (LRU) khi vượt.
// - Dữ liệu và thông tin phụ (kích thước, lần dùng cuối) để ở hai kho
//   riêng: cập nhật "lần dùng cuối" không phải ghi lại cả file audio.
// - AN TOÀN KHI LỖI: IndexedDB hỏng / bị chặn / quá chậm thì coi như "không
//   có trong kho" và tiếp tục gọi API. Kho đệm không bao giờ làm hỏng việc dịch.
// ============================================================
(function (root) {
    "use strict";

    const DB_NAME = "cst-cache";
    const DB_VERSION = 1;
    const READ_TIMEOUT_MS = 1500;     // tra kho chậm hơn mức này: coi như trượt, gọi API luôn
    const WRITE_TIMEOUT_MS = 3000;    // ghi / thống kê / xóa treo quá mức này: bỏ qua

    function withTimeout(p, ms) {
        let timer;
        return Promise.race([
            p,
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Kho đệm phản hồi quá chậm")), ms); })
        ]).finally(() => clearTimeout(timer));
    }

    // ---------------- Tính khóa ----------------
    function normalizeText(s) {
        return String(s == null ? "" : s).normalize("NFC").replace(/\s+/g, " ").trim();
    }

    async function hashKey(parts) {
        const data = new TextEncoder().encode(JSON.stringify(parts));
        const c = (root && root.crypto && root.crypto.subtle) ? root.crypto : (typeof crypto !== "undefined" ? crypto : null);
        const buf = await c.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    function sizeOf(value) {
        if (value == null) return 0;
        if (value instanceof ArrayBuffer) return value.byteLength;
        if (ArrayBuffer.isView(value)) return value.byteLength;
        if (typeof Blob !== "undefined" && value instanceof Blob) return value.size;
        if (typeof value === "string") return value.length * 2;
        let n = 0;
        for (const k of Object.keys(value)) n += k.length * 2 + sizeOf(value[k]);
        return n + 16;
    }

    // ---------------- Backend IndexedDB ----------------
    function openDb(stores) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                for (const s of stores) {
                    if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
                    const m = s + "_meta";
                    if (!db.objectStoreNames.contains(m)) {
                        const ms = db.createObjectStore(m, { keyPath: "k" });
                        ms.createIndex("t", "t");
                    }
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error("IndexedDB đang bị chặn"));
        });
    }

    function idbBackend(storeNames) {
        let dbp = null;
        // Mở thất bại (trình duyệt chặn, hết dung lượng...) hoặc kết nối bị trình
        // duyệt đóng: lần sau mở lại, không kẹt mãi ở một kết nối hỏng
        const db = () => (dbp = dbp || openDb(storeNames).then(d => {
            d.onclose = () => { dbp = null; };
            d.onversionchange = () => { d.close(); dbp = null; };
            return d;
        }, e => { dbp = null; throw e; }));
        const run = async (stores, mode, fn) => {
            const d = await db();
            return new Promise((resolve, reject) => {
                const tx = d.transaction(stores, mode);
                let out;
                Promise.resolve(fn(tx)).then(v => { out = v; });
                tx.oncomplete = () => resolve(out);
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        };
        const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        return {
            async get(store, key) {
                return run([store, store + "_meta"], "readonly", async tx => {
                    const meta = await req(tx.objectStore(store + "_meta").get(key));
                    if (!meta) return null;
                    const value = await req(tx.objectStore(store).get(key));
                    return value === undefined ? null : { meta, value };
                });
            },
            async put(store, key, value, meta) {
                return run([store, store + "_meta"], "readwrite", tx => {
                    tx.objectStore(store).put(value, key);
                    tx.objectStore(store + "_meta").put({ ...meta, k: key });
                });
            },
            async touch(store, key, t) {
                return run([store + "_meta"], "readwrite", async tx => {
                    const ms = tx.objectStore(store + "_meta");
                    const m = await req(ms.get(key));
                    if (m) { m.t = t; ms.put(m); }
                });
            },
            async del(store, keys) {
                return run([store, store + "_meta"], "readwrite", tx => {
                    for (const k of keys) { tx.objectStore(store).delete(k); tx.objectStore(store + "_meta").delete(k); }
                });
            },
            // Liệt kê thông tin phụ theo thứ tự "dùng lâu nhất" trước
            async listMeta(store) {
                return run([store + "_meta"], "readonly", tx => new Promise((resolve, reject) => {
                    const out = [];
                    const c = tx.objectStore(store + "_meta").index("t").openCursor();
                    c.onsuccess = () => { const cur = c.result; if (cur) { out.push(cur.value); cur.continue(); } else resolve(out); };
                    c.onerror = () => reject(c.error);
                }));
            },
            async clear(store) {
                return run([store, store + "_meta"], "readwrite", tx => { tx.objectStore(store).clear(); tx.objectStore(store + "_meta").clear(); });
            }
        };
    }

    // ---------------- Backend bộ nhớ (kiểm thử / dự phòng khi không có IndexedDB) ----------------
    function memoryBackend() {
        const data = new Map();
        const m = s => { if (!data.has(s)) data.set(s, { v: new Map(), meta: new Map() }); return data.get(s); };
        return {
            async get(s, k) { const st = m(s); return st.meta.has(k) ? { meta: { ...st.meta.get(k) }, value: st.v.get(k) } : null; },
            async put(s, k, value, meta) { const st = m(s); st.v.set(k, value); st.meta.set(k, { ...meta, k }); },
            async touch(s, k, t) { const st = m(s); if (st.meta.has(k)) st.meta.get(k).t = t; },
            async del(s, keys) { const st = m(s); for (const k of keys) { st.v.delete(k); st.meta.delete(k); } },
            async listMeta(s) { return [...m(s).meta.values()].map(x => ({ ...x })).sort((a, b) => a.t - b.t); },
            async clear(s) { data.delete(s); }
        };
    }

    // ---------------- Kho đệm 2 tầng ----------------
    // opts: { version, maxBytes, memEntries, now }
    class TieredCache {
        constructor(backend, store, opts = {}) {
            this.b = backend;
            this.store = store;
            this.version = opts.version || 1;
            this.maxBytes = opts.maxBytes || 50 * 1024 * 1024;
            this.memEntries = opts.memEntries || 300;
            this.now = opts.now || (() => Date.now());
            this.mem = new Map();          // L1: LRU theo thứ tự chèn
            this.stats = { l1: 0, l2: 0, miss: 0, writes: 0, evicted: 0, errors: 0 };
            this.totals = null;            // { bytes, count } (tính lười)
            this.touchQueue = new Map();
        }

        l1Get(key) {
            if (!this.mem.has(key)) return undefined;
            const v = this.mem.get(key);
            this.mem.delete(key);
            this.mem.set(key, v);
            return v;
        }

        l1Set(key, value) {
            this.mem.delete(key);
            this.mem.set(key, value);
            while (this.mem.size > this.memEntries) this.mem.delete(this.mem.keys().next().value);
        }

        async get(key) {
            const hit = this.l1Get(key);
            if (hit !== undefined) { this.stats.l1++; this.scheduleTouch(key); return hit; }
            let rec = null;
            try { rec = await withTimeout(this.b.get(this.store, key), READ_TIMEOUT_MS); } catch (e) { rec = null; this.stats.errors++; }
            if (!rec || !rec.meta || rec.meta.v !== this.version) {
                this.stats.miss++;
                // Bản ghi phiên bản cũ: xóa cho gọn (không bắt người gọi chờ)
                if (rec && rec.meta) this.b.del(this.store, [key]).then(() => this.adjust(-rec.meta.size, -1), () => {});
                return null;
            }
            this.stats.l2++;
            this.l1Set(key, rec.value);
            this.scheduleTouch(key);
            return rec.value;
        }

        // Cập nhật "lần dùng cuối" gộp lại, không ghi mỗi lần đọc
        scheduleTouch(key) {
            this.touchQueue.set(key, this.now());
            if (this.touchTimer) return;
            this.touchTimer = setTimeout(() => this.flushTouches(), 2000);
        }

        async flushTouches() {
            this.touchTimer = null;
            const q = [...this.touchQueue];
            this.touchQueue.clear();
            for (const [k, t] of q) { try { await this.b.touch(this.store, k, t); } catch (e) { /* bỏ qua */ } }
        }

        adjust(bytes, count) {
            if (!this.totals) return;
            this.totals.bytes = Math.max(0, this.totals.bytes + bytes);
            this.totals.count = Math.max(0, this.totals.count + count);
        }

        // Ghi: RAM trước (dùng được ngay), IndexedDB sau. Lỗi hay treo khi ghi không
        // bao giờ ném ra ngoài và không giữ người gọi quá WRITE_TIMEOUT_MS.
        async set(key, value, extraMeta = {}) {
            const size = sizeOf(value);
            if (size > this.maxBytes * 0.5) return false;       // một mục quá lớn: không lưu
            this.l1Set(key, value);
            try {
                return await withTimeout(this.write(key, value, size, extraMeta), WRITE_TIMEOUT_MS);
            } catch (e) {
                this.stats.errors++;
                this.totals = null;
                return false;
            }
        }

        async write(key, value, size, extraMeta) {
            const t = this.now();
            let prev = null;
            try { prev = await withTimeout(this.b.get(this.store, key), READ_TIMEOUT_MS); } catch (e) { prev = null; }
            await this.b.put(this.store, key, value, { v: this.version, size, t, c: t, ...extraMeta });
            this.stats.writes++;
            await this.ensureTotals();
            this.adjust(size - (prev && prev.meta ? prev.meta.size : 0), prev ? 0 : 1);
            if (this.totals.bytes > this.maxBytes) await this.evict();
            return true;
        }

        async ensureTotals() {
            if (this.totals) return this.totals;
            const list = await this.b.listMeta(this.store);
            this.totals = { bytes: list.reduce((a, m) => a + (m.size || 0), 0), count: list.length };
            return this.totals;
        }

        // Xóa mục dùng lâu nhất (và mục khác phiên bản) tới khi còn 85% trần
        async evict() {
            const list = await this.b.listMeta(this.store);
            const target = this.maxBytes * 0.85;
            let bytes = list.reduce((a, m) => a + (m.size || 0), 0);
            const victims = [];
            for (const m of list) if (m.v !== this.version) { victims.push(m.k); bytes -= m.size || 0; }
            for (const m of list) {
                if (bytes <= target) break;
                if (m.v !== this.version) continue;
                victims.push(m.k);
                bytes -= m.size || 0;
            }
            if (victims.length) {
                await this.b.del(this.store, victims);
                for (const k of victims) this.mem.delete(k);
                this.stats.evicted += victims.length;
            }
            // The totals follow from the scan above (BACKLOG 12, 1.9.4): a second full scan of the
            // store here only counted what had just been counted
            this.totals = { bytes: Math.max(0, bytes), count: list.length - victims.length };
        }

        async info() {
            this.totals = null;
            let t = { bytes: 0, count: 0 };
            try { t = await withTimeout(this.ensureTotals(), WRITE_TIMEOUT_MS); } catch (e) { this.stats.errors++; this.totals = null; }
            return { bytes: t.bytes, count: t.count, maxBytes: this.maxBytes, version: this.version, ...this.stats };
        }

        // Xóa đúng các khóa cho trước (ví dụ audio của MỘT video); trả về số mục đã xóa khỏi kho bền
        async remove(keys) {
            const want = new Set(keys || []);
            for (const k of want) this.mem.delete(k);
            let n = 0;
            try {
                const list = await withTimeout(this.b.listMeta(this.store), WRITE_TIMEOUT_MS);
                const hit = list.filter(m => want.has(m.k));
                if (hit.length) await withTimeout(this.b.del(this.store, hit.map(m => m.k)), WRITE_TIMEOUT_MS);
                n = hit.length;
                // the scan gave the whole store: totals without another one (BACKLOG 12, 1.9.4)
                const left = list.filter(m => !want.has(m.k));
                this.totals = { bytes: left.reduce((a, m) => a + (m.size || 0), 0), count: left.length };
            } catch (e) { this.stats.errors++; this.totals = null; }
            return n;
        }

        async clear() {
            this.mem.clear();
            try { await withTimeout(this.b.clear(this.store), WRITE_TIMEOUT_MS); } catch (e) { this.stats.errors++; }
            this.totals = null;
        }
    }

    function createCaches(opts = {}) {
        const backend = opts.backend || (typeof indexedDB !== "undefined" ? idbBackend(["tr", "audio"]) : memoryBackend());
        return {
            backend,
            tr: new TieredCache(backend, "tr", { version: opts.trVersion || 1, maxBytes: opts.trMaxBytes || 30 * 1024 * 1024, memEntries: 400, now: opts.now }),
            audio: new TieredCache(backend, "audio", { version: opts.audioVersion || 1, maxBytes: opts.audioMaxBytes || 200 * 1024 * 1024, memEntries: 24, now: opts.now })
        };
    }

    const api = { hashKey, normalizeText, sizeOf, TieredCache, memoryBackend, idbBackend, createCaches };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_CACHE = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

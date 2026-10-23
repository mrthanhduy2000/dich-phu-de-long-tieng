// ============================================================
// ON-SCREEN SUBTITLES (2.6.4)
//
// Some videos have no caption track worth translating: every track YouTube lists transcribes one
// of its own AI dubs, none the original speech (measured 2026-10-19 on qSlxe4hA66g, a Call of Duty
// walkthrough: original audio en-US, 21 ASR tracks all in dubbed languages, no English one; the
// extension translated the Arabic dub's transcript). What the viewer reads is the subtitle burned
// into the picture (game captions, hardsubs). This module watches the bottom of the frame, notices
// when a caption appears or changes, and hands one cropped image per caption to the service worker
// (readScreenText), which reads and translates it with Gemini.
//
// Pure parts (masks, change detection, the per-sample decision) are exported for tests; the
// sampler that touches the <video> and a canvas is `createReader`.
// ============================================================
(function (root) {
    "use strict";

    // Where captions sit: the lower part of the frame (game captions at ~0.91, hardsubs 0.75-0.95)
    const BAND_TOP = 0.66;
    const BAND_BOTTOM = 0.985;
    // Captions are centred; a game's minimap, ammo and button prompts sit in the corners
    const BAND_LEFT = 0.08;
    const BAND_RIGHT = 0.92;
    const MASK_WIDTH = 480;          // the band is measured at this width (text strokes stay >1 px)
    const CELL = 4;                  // change detection compares 4x4 cells, not pixels
    const BRIGHT = 175;              // a caption's letters: light...
    const DARK = 100;                // ...next to dark (its outline, shadow or box)
    const MIN_TEXT_SHARE = 0.003;    // share of the band that must be letter edges to call it text
    const MIN_TEXT_PIXELS = 40;
    const SAME = 0.3;                // cell difference under this: the same caption
    const STABLE = 0.18;             // two samples this close in a row: the caption has settled
    const SAMPLE_MS = 250;
    const SEND_WIDTH = 960;          // the image Gemini reads
    const MAX_IN_FLIGHT = 2;         // reads waiting on Gemini at once; a busy scene waits its turn

    function luminance(r, g, b) { return (r * 299 + g * 587 + b * 114) / 1000; }

    // Letter edges in an RGBA band: a light pixel with a dark pixel 1-2 px away horizontally or
    // vertically. Smooth bright areas (sky, a lit wall) have no dark neighbour and do not count.
    function textMask(rgba, w, h) {
        const lum = new Uint8Array(w * h);
        for (let i = 0, p = 0; i < lum.length; i++, p += 4) lum[i] = luminance(rgba[p], rgba[p + 1], rgba[p + 2]);
        const mask = new Uint8Array(w * h);
        let count = 0, top = h, bottom = -1;
        for (let y = 2; y < h - 2; y++) {
            for (let x = 2; x < w - 2; x++) {
                const i = y * w + x;
                if (lum[i] < BRIGHT) continue;
                if (lum[i - 1] <= DARK || lum[i + 1] <= DARK || lum[i - 2] <= DARK || lum[i + 2] <= DARK ||
                    lum[i - w] <= DARK || lum[i + w] <= DARK || lum[i - 2 * w] <= DARK || lum[i + 2 * w] <= DARK) {
                    mask[i] = 1;
                    count++;
                    if (y < top) top = y;
                    if (y > bottom) bottom = y;
                }
            }
        }
        return { mask, w, h, count, top, bottom };
    }

    function hasText(m) {
        return !!m && m.count >= MIN_TEXT_PIXELS && m.count / (m.w * m.h) >= MIN_TEXT_SHARE;
    }

    // The mask on a grid of CELL x CELL cells: a cell is on when it holds 2+ edge pixels
    function cells(m) {
        const cw = Math.ceil(m.w / CELL), ch = Math.ceil(m.h / CELL);
        const n = new Uint8Array(cw * ch);
        for (let y = 0; y < m.h; y++) {
            for (let x = 0; x < m.w; x++) if (m.mask[y * m.w + x]) n[((y / CELL) | 0) * cw + ((x / CELL) | 0)]++;
        }
        const out = new Uint8Array(cw * ch);
        for (let i = 0; i < n.length; i++) out[i] = n[i] >= 2 ? 1 : 0;
        return out;
    }

    // 0 = the same cells lit, 1 = nothing in common (XOR over OR). A cell lit in one and lit next
    // to it in the other counts as the same: the picture behind the caption moves a little
    function difference(a, b, cw) {
        if (!a || !b || a.length !== b.length) return 1;
        let union = 0, differ = 0;
        const near = (arr, i) => arr[i] || arr[i - 1] || arr[i + 1] || arr[i - cw] || arr[i + cw];
        for (let i = 0; i < a.length; i++) {
            if (!a[i] && !b[i]) continue;
            union++;
            if (a[i] && !near(b, i)) differ++;
            else if (b[i] && !near(a, i)) differ++;
        }
        return union ? differ / union : 0;
    }

    // One sample's decision. st carries: prev (last sample's cells or null), shown (cells of the
    // caption read last, or null when nothing is shown), blank (samples in a row without text).
    // Returns "read" (a new caption has settled: read it), "clear" (the caption is gone), or "".
    function step(st, cur, cw) {
        if (!cur) {
            st.blank = (st.blank || 0) + 1;
            st.prev = null;
            if (st.shown && st.blank >= 2) { st.shown = null; return "clear"; }
            return "";
        }
        st.blank = 0;
        const settled = st.prev && difference(st.prev, cur, cw) < STABLE;
        st.prev = cur;
        if (st.shown && difference(st.shown, cur, cw) < SAME) return "";
        if (!settled) return "";
        st.shown = cur;
        return "read";
    }

    // ---------- The sampler (browser only) ----------
    // opts: { video, read(jpegDataUrl) -> Promise<{ text, vi, speaker }|null>, show(result|null),
    //         skip() -> true while nothing should be sampled (an ad), onFrameError(err) }.
    // Samples while the video plays, and once after a seek while paused.
    function createReader(opts) {
        const video = opts.video;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const st = { prev: null, shown: null, blank: 0 };
        const memo = [];                // [{ cells, result }] captions already read in this video
        let timer = null, lastTime = -1, stopped = false, seq = 0, cw = 0, inFlight = 0;

        function band() {
            const vw = video.videoWidth, vh = video.videoHeight;
            if (!vw || !vh) return null;
            const sy = Math.round(vh * BAND_TOP), sh = Math.round(vh * (BAND_BOTTOM - BAND_TOP));
            const sx = Math.round(vw * BAND_LEFT), sw = Math.round(vw * (BAND_RIGHT - BAND_LEFT));
            return { vw, vh, sx, sw, sy, sh };
        }

        function measure(b) {
            const w = MASK_WIDTH, h = Math.max(8, Math.round(b.sh * MASK_WIDTH / b.sw));
            canvas.width = w; canvas.height = h;
            ctx.drawImage(video, b.sx, b.sy, b.sw, b.sh, 0, 0, w, h);
            const m = textMask(ctx.getImageData(0, 0, w, h).data, w, h);
            cw = Math.ceil(w / CELL);
            return m;
        }

        // The caption's rows (with room above and below) at up to SEND_WIDTH, as a JPEG data URL
        function crop(b, m) {
            const scale = b.sh / m.h;
            const pad = Math.round(10 * scale);
            const y0 = Math.max(0, Math.round(m.top * scale) - pad);
            const y1 = Math.min(b.sh, Math.round((m.bottom + 1) * scale) + pad);
            const outW = Math.min(SEND_WIDTH, b.sw);
            const outH = Math.max(16, Math.round((y1 - y0) * outW / b.sw));
            const c = document.createElement("canvas");
            c.width = outW; c.height = outH;
            c.getContext("2d").drawImage(video, b.sx, b.sy + y0, b.sw, y1 - y0, 0, 0, outW, outH);
            return c.toDataURL("image/jpeg", 0.85);
        }

        async function readNow(b, m, cur) {
            const known = memo.find(x => difference(x.cells, cur, cw) < SAME);
            const my = ++seq;
            if (known) { opts.show(known.result); return; }
            opts.show(null);
            let result = null;
            inFlight++;
            try { result = await opts.read(crop(b, m)); } catch (e) { result = null; } finally { inFlight--; }
            if (stopped) return;
            if (result) {
                memo.push({ cells: cur, result });
                if (memo.length > 300) memo.shift();
            }
            // a newer caption came while this one was read: its answer is not this one's
            if (my !== seq || st.shown !== cur) return;
            opts.show(result && result.text ? result : null);
        }

        function tick() {
            if (stopped) return;
            timer = setTimeout(tick, SAMPLE_MS);
            if (opts.skip && opts.skip()) return;
            const t = video.currentTime;
            if (video.paused && t === lastTime) return;
            lastTime = t;
            const b = band();
            if (!b) return;
            let m;
            try { m = measure(b); } catch (e) {
                stop();
                if (opts.onFrameError) opts.onFrameError(e);
                return;
            }
            const cur = hasText(m) ? cells(m) : null;
            const action = step(st, cur, cw);
            if (action === "clear") { seq++; opts.show(null); }
            else if (action === "read") {
                // too many reads waiting: forget this one, the next sample decides again
                if (inFlight >= MAX_IN_FLIGHT && !memo.some(x => difference(x.cells, cur, cw) < SAME)) st.shown = null;
                else readNow(b, m, cur);
            }
        }

        function stop() {
            stopped = true;
            clearTimeout(timer);
            timer = null;
        }
        // after a seek the caption on screen is another one: decide afresh
        function reset() { st.prev = null; st.shown = null; st.blank = 0; seq++; opts.show(null); }

        tick();
        return { stop, reset };
    }

    // Is every caption track a transcript of an AI dub, none of the original speech? Then the
    // tracks only say what YouTube's dubbing made of the video, and the picture is a better source.
    // audio: { original, tracks: [{ lang, isAutoDubbed }] } from the bridge; chosen: the track
    // ytChonTrack picked.
    function onlyDubTranscripts(tracks, audio, chosen) {
        const LANG = root && root.CST_LANG;
        if (!LANG || !LANG.dubTranscripts || !chosen || chosen.kind !== "asr" || !(tracks || []).length) return false;
        const dubs = LANG.dubTranscripts(tracks, audio);
        return tracks.every(t => dubs.has(t));
    }

    const api = { textMask, hasText, cells, difference, step, createReader, onlyDubTranscripts,
        BAND_TOP, BAND_BOTTOM, MASK_WIDTH, CELL, SAMPLE_MS };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_SCREEN = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

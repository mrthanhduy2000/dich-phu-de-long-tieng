// Site adapters: pages whose captions are not a standard <track> on the <video> (the generic path
// of content.js reads those on its own). An adapter finds the caption files, this core parses them
// and adds them to the <video> as an ordinary TextTrack, so the shared pipeline needs no change.
// Adapter shape: { id, match(loc) -> bool, sources(doc, env) -> [{ lang, label, load() -> cues }] }
// with cues as { start, end, text } in seconds. Nothing here runs unless the viewer asked for a
// translation (generic pages are injected on demand, see SUBTITLE.md "Generic video pages").
(function () {
    "use strict";
    const root = typeof window !== "undefined" ? window : globalThis;
    if (root.CST_SITES) return;

    const adapters = [];
    const TRACK_MARK = "Site: ";   // must not start with "cst": pageTracks() skips those labels

    function parseTime(s) {
        const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(s.trim());
        if (!m) return NaN;
        return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4].padEnd(3, "0")) / 1000;
    }

    // WebVTT text -> cues. Skips the header, NOTE/STYLE/REGION blocks and cue settings.
    function parseVtt(text) {
        const cues = [];
        const blocks = String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
        for (const block of blocks) {
            const lines = block.split("\n");
            const at = lines.findIndex(l => l.includes("-->"));
            if (at < 0 || /^(NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
            const [a, b] = lines[at].split("-->");
            const start = parseTime(a);
            const end = parseTime((b || "").trim().split(/\s+/)[0] || "");
            const body = lines.slice(at + 1).join("\n").replace(/<[^>]+>/g, "").trim();
            if (!isFinite(start) || !isFinite(end) || end <= start || !body) continue;
            cues.push({ start, end, text: body });
        }
        return cues;
    }

    function parseAttrs(s) {
        const out = {};
        const re = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
        let m;
        while ((m = re.exec(s))) out[m[1]] = m[3] !== undefined ? m[3] : m[2];
        return out;
    }

    // HLS master playlist -> subtitle renditions [{ lang, name, uri }] (uri made absolute)
    function parseHlsSubtitles(master, baseUrl) {
        const out = [];
        for (const line of String(master || "").split(/\r?\n/)) {
            if (!line.startsWith("#EXT-X-MEDIA:")) continue;
            const a = parseAttrs(line.slice(13));
            if (a.TYPE !== "SUBTITLES" || !a.URI) continue;
            out.push({ lang: (a.LANGUAGE || "").toLowerCase(), name: a.NAME || a.LANGUAGE || "", uri: new URL(a.URI, baseUrl).href });
        }
        return out;
    }

    // HLS media playlist -> absolute segment URLs
    function parseHlsSegments(playlist, baseUrl) {
        return String(playlist || "").split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"))
            .map(l => new URL(l, baseUrl).href);
    }

    // Segments with the playlist time at which each one starts a timeline period. After an
    // #EXT-X-DISCONTINUITY the segment's own cue times restart from 0, so the time of everything
    // before it (e.g. a 3.5 s ident ahead of the talk) must be added back to land on the video clock.
    function parseHlsTimeline(playlist, baseUrl) {
        const out = [];
        let elapsed = 0, dur = 0, periodStart = 0;
        for (const raw of String(playlist || "").split(/\r?\n/)) {
            const l = raw.trim();
            if (!l) continue;
            if (l.startsWith("#EXTINF:")) { dur = parseFloat(l.slice(8)) || 0; continue; }
            if (l.startsWith("#EXT-X-DISCONTINUITY") && !l.startsWith("#EXT-X-DISCONTINUITY-SEQUENCE")) { periodStart = elapsed; continue; }
            if (l.startsWith("#")) continue;
            out.push({ url: new URL(l, baseUrl).href, offset: periodStart });
            elapsed += dur;
            dur = 0;
        }
        return out;
    }

    // Runs fn over items with at most `limit` in flight; results keep the order of items.
    async function mapLimit(items, limit, fn) {
        const out = new Array(items.length);
        let next = 0;
        const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
        await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
        return out;
    }

    // A talk has ~100 segments; fetched one by one the captions took longer than the 5 s the player is
    // held for, so they are fetched in parallel (order kept, the dedupe below depends on it).
    async function loadHlsVtt(uri, fetchText) {
        const cues = [], seen = new Set();
        const timeline = parseHlsTimeline(await fetchText(uri), uri);
        const parsed = await mapLimit(timeline, 8, async seg => parseVtt(await fetchText(seg.url)));
        timeline.forEach((seg, i) => {
            for (const c of parsed[i]) {
                // a cue crossing a segment boundary is repeated at the start of the next segment
                const key = c.start + "|" + c.end + "|" + c.text;
                if (seen.has(key)) continue;
                seen.add(key);
                cues.push(seg.offset ? { start: c.start + seg.offset, end: c.end + seg.offset, text: c.text } : c);
            }
        });
        return cues;
    }

    function register(adapter) { adapters.push(adapter); }
    function find(loc) { return adapters.find(a => { try { return a.match(loc); } catch (e) { return false; } }) || null; }

    // Which sources to load: English first, then Vietnamese (so content.js can say "already
    // Vietnamese"), else the first one. Loading every language of a site would cost dozens of requests.
    function choose(sources) {
        const by = p => sources.find(s => (s.lang || "").startsWith(p));
        const picked = [];
        const en = by("en"), vi = by("vi");
        if (en) picked.push(en);
        if (vi) picked.push(vi);
        if (!picked.length && sources[0]) picked.push(sources[0]);
        return picked;
    }

    // Adds the site's captions to the <video> as TextTracks. Returns how many were added; 0 means the
    // caller falls back to what the page already offers. Never throws.
    async function prepare(video, env = {}) {
        try {
            const loc = env.loc || root.location;
            const adapter = find(loc);
            if (!adapter || !video || !video.addTextTrack) return 0;
            const doc = env.doc || root.document;
            const fetchText = env.fetchText || (async u => {
                const r = await fetch(u);
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.text();
            });
            const makeCue = env.makeCue || ((s, e, t) => new root.VTTCue(s, e, t));
            // Captions added for another page (the player may survive a client-side move) go stale
            const mine = Array.from(video.textTracks || []).filter(t => (t.label || "").startsWith(TRACK_MARK));
            const have = [];
            for (const t of mine) {
                if (t.cstPath === loc.pathname) have.push(t);
                else { t.cstStale = true; t.mode = "disabled"; }
            }
            if (have.length) return have.length;
            const sources = await adapter.sources(doc, { loc, fetchText });
            let added = 0;
            const picked = choose(sources || []);
            const loaded = await Promise.all(picked.map(s => s.load()));
            for (let i = 0; i < picked.length; i++) {
                const s = picked[i], cues = loaded[i];
                if (!cues.length) continue;
                const tt = video.addTextTrack("subtitles", TRACK_MARK + (s.label || s.lang), s.lang || "");
                tt.mode = "hidden";
                tt.cstPath = loc.pathname;
                for (const c of cues) tt.addCue(makeCue(c.start, c.end, c.text));
                added++;
            }
            return added;
        } catch (e) {
            console.warn("[AI Subtitle] site adapter failed:", e && e.message);
            return 0;
        }
    }

    root.CST_SITES = { register, find, prepare, choose, parseVtt, parseHlsSubtitles, parseHlsSegments, parseHlsTimeline, loadHlsVtt, TRACK_MARK };
})();

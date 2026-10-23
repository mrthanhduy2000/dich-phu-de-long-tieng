// TED adapter (ted.com/talks/...): the talk's captions are WebVTT renditions of its HLS stream.
// The page embeds Next.js data (__NEXT_DATA__) whose videoData holds the HLS master playlist.
// Checked against a live talk page; captions are offset by the HLS timeline (see loadHlsVtt).
(function () {
    "use strict";
    const S = (typeof window !== "undefined" ? window : globalThis).CST_SITES;
    if (!S) return;

    const asObject = v => { if (typeof v === "string") { try { return JSON.parse(v); } catch (e) { return null; } } return v || null; };

    // Live page (checked on a real talk): videoData.videoPlayerData.resources.hls.stream, also
    // videoData.hlsUrl. Older pages carried the same JSON as videoData.playerData.
    function hlsStream(nextData) {
        const data = JSON.parse(nextData);
        const vd = data && data.props && data.props.pageProps && data.props.pageProps.videoData;
        if (!vd) return "";
        for (const key of ["videoPlayerData", "playerData"]) {
            const pd = asObject(vd[key]);
            const stream = pd && pd.resources && pd.resources.hls && pd.resources.hls.stream;
            if (stream) return stream;
        }
        return vd.hlsUrl || "";
    }

    // The page moves between talks without a reload and keeps the first talk's __NEXT_DATA__ in the
    // DOM. It is used only when it mentions this talk's slug; otherwise the talk's own HTML is fetched.
    async function nextDataFor(doc, env) {
        const slug = env.loc.pathname.split("/").filter(Boolean).pop() || "";
        const el = doc.getElementById("__NEXT_DATA__");
        if (el && el.textContent && slug && el.textContent.includes(slug)) return el.textContent;
        const html = await env.fetchText(env.loc.pathname);
        const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
        return m ? m[1] : "";
    }

    S.register({
        id: "ted",
        match: loc => /(^|\.)ted\.com$/.test(loc.hostname) && /^\/talks\//.test(loc.pathname),
        async sources(doc, env) {
            const next = await nextDataFor(doc, env);
            const stream = next ? hlsStream(next) : "";
            if (!stream) return [];
            const subs = S.parseHlsSubtitles(await env.fetchText(stream), stream);
            return subs.map(s => ({ lang: s.lang, label: s.name, load: () => S.loadHlsVtt(s.uri, env.fetchText) }));
        },
    });
})();

// Glossary, the large part (2.5.9): thousands of terms per domain plus the everyday domains of
// YouTube life videos (beauty, food, shopping, money, travel, home, film, sport, gadgets, pets...).
// Pure data plus the merge into glossary.js's groups, loaded right after glossary.js (manifest,
// options.html; Node: require it after glossary.js). Grep it, never read it whole.
//
// One entry per line inside each block:
//   term|bản dịch   a settled Vietnamese rendering (the term comes back in Vietnamese)
//   Term            a name, product or acronym kept as written
//   ~Term           the same, but also an everyday English word ("~Target", "~Headspace"): kept
//                   only mid-sentence, like RISKY_PROPER in glossary.js
//   =term           a lowercase term Vietnamese speakers say in English ("=skincare"); every other
//                   lowercase entry must carry a rendering
//   # comment
// A term a group already has is skipped; a rendering that would contradict another group's is
// dropped (the first one stays), so a term never gets two Vietnamese forms.
(function (root) {
    const base = (root && root.CST_GLOSSARY_GROUPS) ? root : (typeof require === "function" ? require("./glossary.js") : null);
    if (!base || !base.CST_GLOSSARY_GROUPS) return;
    const GROUPS = base.CST_GLOSSARY_GROUPS;
    const RISKY = base.CST_RISKY_PROPER;
    // What the merge saw, for tests/glossary.test.js: per group how many were added, and every line
    // that broke a rule above (must stay empty)
    const report = { added: {}, issues: [], dropped: [] };
    const ALWAYS_CAPITALIZED = new Set(("monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december " +
        "english french german spanish italian chinese japanese korean vietnamese thai russian arabic portuguese dutch greek turkish american british european asian african canadian australian mexican indian " +
        "christmas easter halloween thanksgiving").split(" "));
    const hasUpperLetter = /[\p{Lu}0-9]/u;
    const DASH = /[–—]/;
    let viSeen = null;
    function viIndex() {
        if (viSeen) return viSeen;
        viSeen = new Map();
        for (const g of Object.values(GROUPS)) for (const [en, vi] of Object.entries(g.vi || {})) if (!viSeen.has(en)) viSeen.set(en, vi);
        return viSeen;
    }
    // Lowercased terms per group and the risky names seen so far, kept across blocks: rebuilding the set
    // for every block and scanning RISKY with includes() per line made the merge quadratic
    const haveByGroup = new Map();
    let riskySeen = null;
    function haveOf(g) {
        let h = haveByGroup.get(g);
        if (!h || h.len !== g.terms.length) {
            h = { set: new Set(g.terms.map(t => t.toLowerCase())), len: g.terms.length };
            haveByGroup.set(g, h);
        }
        return h;
    }
    function add(key, label, text) {
        if (!GROUPS[key]) GROUPS[key] = { label: label || key, terms: [], vi: {} };
        const g = GROUPS[key];
        if (!g.vi) g.vi = {};
        const hv = haveOf(g), have = hv.set;
        if (RISKY && (!riskySeen || riskySeen.size !== RISKY.length)) riskySeen = new Set(RISKY);
        const vis = viIndex();
        let n = 0;
        for (const raw of String(text).split("\n")) {
            let line = raw.trim();
            if (!line || line.startsWith("#")) continue;
            let risky = false, keep = false;
            if (line[0] === "~") { risky = true; line = line.slice(1); }
            else if (line[0] === "=") { keep = true; line = line.slice(1); }
            const parts = line.split("|");
            const en = parts[0].trim(), vi = (parts[1] || "").trim();
            if (!en || parts.length > 2 || (parts.length === 2 && !vi)) { report.issues.push(`${key}: "${raw.trim()}" malformed`); continue; }
            if (vi && DASH.test(vi)) { report.issues.push(`${key}: "${en}" long dash`); continue; }
            const k = en.toLowerCase();
            if (!vi && !keep && k === en && !hasUpperLetter.test(en)) { report.issues.push(`${key}: "${en}" lowercase with no rendering and no =`); continue; }
            // (2.7.1) English writes these ordinary words capitalized, so the capital tells nothing:
            // the series "Wednesday" kept every weekday as written ("vào thứ Tư Wednesday", 8 times
            // in 2 of 75 saved videos). They need a rendering, never "kept as written"
            if (!vi && (ALWAYS_CAPITALIZED.has(k) || (k.endsWith("s") && ALWAYS_CAPITALIZED.has(k.slice(0, -1))))) { report.issues.push(`${key}: "${en}" an everyday word English capitalizes, needs a rendering`); continue; }
            if (vi) {
                const prior = vis.get(k);
                if (prior === undefined) { vis.set(k, vi); g.vi[k] = vi; }
                else if (prior === vi) g.vi[k] = vi;
                else report.dropped.push(`${key}: ${en} -> ${vi} (kept ${prior})`);
            }
            if (risky && RISKY && !riskySeen.has(en)) { RISKY.push(en); riskySeen.add(en); }
            if (have.has(k)) continue;
            have.add(k);
            g.terms.push(en);
            n++;
        }
        hv.len = g.terms.length;
        report.added[key] = (report.added[key] || 0) + n;
    }
    const api = { CST_GLOSSARY_EXTRA_ADD: add, CST_GLOSSARY_EXTRA_REPORT: report };
    if (root) Object.assign(root, api);
    if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

// ============================================================
// HARDWARE: what the viewer's machine can sustain for the free local voice (VieNeu on the CPU)
//
// The voice server renders on the same machine that plays the video. `rtf` is the seconds it needs
// for one second of speech: below ~0.6 the voice keeps ahead of the video, near 1 it only just
// keeps up, above 1 it falls behind however far ahead it renders (tools/playback-sim.js, constant
// rtf, 6-minute lecture, rate 1: rtf 1.0 drops 2 lines, 1.3 drops 8, 1.8 drops 16; a look-ahead of
// 15-90 s changed none of it). What does fix it is a slower video: dropped lines at rtf 1.3 go
// 8 -> 1 at rate 0.75, and at rtf 1.8 16 -> 1 at rate 0.6.
//   machineTier(info)      a guess BEFORE any take is measured: "weak" | "standard" | "strong"
//   classifyRtf(rtf)       what a measured rtf means: "ok" | "tight" | "behind"
//   sustainableRate(rtf)   the video speed the voice can keep up with (null when it already can)
//   slowAdvice(opts)       the toast text and rate to suggest, or null
//   describeMachine(info)  one line for the Settings page
// Pure: no DOM, no storage. Runs in the page and in Node.
// ============================================================
(function (root) {
    "use strict";

    const K = {
        tight: 0.6,        // from here the voice has little slack: a busy CPU tips it over
        behind: 0.8,       // the same line the menu and Settings already draw (dubbing.js, options.js); sim: 1 dropped at 0.8, 2 at 1.0
        safety: 0.8,       // the video speed to suggest is safety / rtf (sim: 0.75 at rtf 1.3 left 1 dropped)
        minRate: 0.25,     // YouTube's lowest playback speed
        step: 0.05,
        weakCores: 4,      // logical cores at or under this are shared with the browser's video decoder
        weakMemoryGb: 4
    };

    const round = (x, d) => Math.round(x * d) / d;

    // info: { cores, memoryGb, arch ("arm"|"x86"|""), os ("mac"|"windows"|"linux"|"") }. Any field may be
    // missing: Chrome hides the real memory above 8 GB and reports "x86" on an Intel Mac and on Apple
    // silicon alike unless the high-entropy hints are asked for, so absence never means "weak".
    function machineTier(info) {
        const i = info || {};
        const cores = Number(i.cores) || 0, mem = Number(i.memoryGb) || 0;
        if ((cores && cores <= K.weakCores) || (mem && mem <= K.weakMemoryGb)) return "weak";
        if (i.os === "mac" && i.arch === "x86") return "weak";       // an Intel Mac: no Neural Engine, throttles under load
        if (i.arch === "arm" || (cores >= 8 && (!mem || mem >= 8))) return "strong";
        return "standard";
    }

    function classifyRtf(rtf) {
        const r = Number(rtf);
        if (!(r > 0)) return null;
        return r >= K.behind ? "behind" : r >= K.tight ? "tight" : "ok";
    }

    // The slowest the video should play so that rendering keeps up; null when it already does.
    function sustainableRate(rtf) {
        const r = Number(rtf);
        if (!(r >= K.behind)) return null;
        const raw = Math.floor((K.safety / r) / K.step + 1e-9) * K.step;
        return round(Math.max(K.minRate, Math.min(1, raw)), 100);
    }

    const fmtRate = r => String(round(r, 100)).replace(".", ",");
    const fmtRtf = r => (Math.round(r * 100) / 100).toFixed(2).replace(".", ",");

    // opts: { rtf, tier, playbackRate }. The text is shown to the viewer, so it is Vietnamese.
    function slowAdvice(opts) {
        const o = opts || {};
        const state = classifyRtf(o.rtf);
        if (state !== "behind") return null;
        const rate = sustainableRate(o.rtf);
        const now = Number(o.playbackRate) || 1;
        const cur = `Máy chủ giọng đang chậm: tạo 1 giây lời nói mất ${fmtRtf(o.rtf)} giây`;
        // Below 0.5 the video crawls: say the voice is not a fit for this machine instead
        if (rate < 0.5) {
            return { rate: null, level: "severe", text: `${cur}. Máy này quá yếu để lồng tiếng theo kịp hình: nên dùng giọng Gemini hoặc chỉ xem phụ đề.` };
        }
        if (rate >= now) return { rate: null, level: "behind", text: `${cur}. Giọng Việt có thể trễ dần.` };
        return { rate, level: "behind", text: `${cur}. Phát video ở tốc độ ${fmtRate(rate)}× thì giọng mới theo kịp.` };
    }

    function describeMachine(info) {
        const i = info || {};
        const os = { mac: "Mac", windows: "Windows", linux: "Linux" }[i.os] || "";
        const chip = i.os === "mac" ? (i.arch === "arm" ? "chip Apple" : i.arch === "x86" ? "chip Intel" : "") : "";
        const parts = [os, chip, i.cores ? `${i.cores} nhân` : ""].filter(Boolean);
        return parts.join(", ");
    }

    // Reads the page's hints. Async: the architecture only comes from userAgentData's high-entropy call.
    async function readMachine(nav) {
        const n = nav || (typeof navigator !== "undefined" ? navigator : null);
        if (!n) return {};
        const platform = String((n.userAgentData && n.userAgentData.platform) || n.platform || "");
        const os = /mac/i.test(platform) ? "mac" : /win/i.test(platform) ? "windows" : /linux|cros/i.test(platform) ? "linux" : "";
        let arch = "";
        try {
            if (n.userAgentData && n.userAgentData.getHighEntropyValues) {
                const h = await n.userAgentData.getHighEntropyValues(["architecture"]);
                arch = /arm/i.test(h.architecture || "") ? "arm" : /x86/i.test(h.architecture || "") ? "x86" : "";
            }
        } catch (e) { /* hints blocked: leave the architecture unknown */ }
        return { cores: Number(n.hardwareConcurrency) || 0, memoryGb: Number(n.deviceMemory) || 0, arch, os };
    }

    const api = { machineTier, classifyRtf, sustainableRate, slowAdvice, describeMachine, readMachine, K };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_HW = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

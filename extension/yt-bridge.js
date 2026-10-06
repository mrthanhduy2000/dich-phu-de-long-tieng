// ============================================================
// CAU NOI YOUTUBE
//
// Tep nay chay trong ngu canh cua chinh trang YouTube (MAIN world),
// khac voi cac tep con lai chay trong ngu canh rieng cua tien ich.
// Ly do: danh sach phu de nam trong bien noi bo cua trinh phat YouTube,
// chi doc duoc tu ben trong trang.
//
// Tu 09/2026 YouTube tra phu de RONG (200, 0 byte) cho link co exp=xpe neu thieu
// ma xac thuc "pot" cua trinh phat. Ma nay chi co trong yeu cau phu de do CHINH
// trinh phat gui. Cau noi nghe (khong sua) cac yeu cau /api/timedtext cua trang de:
//   - giu lai noi dung phu de trinh phat da tai (khoi tai lai)
//   - giu ma pot + thong tin trinh phat theo tung video de tai track khac
// Chua co thi bat phu de cua trinh phat trong giay lat de no tu gui, roi tra lai
// trang thai cu. Khong gui du lieu di dau, chi dung trong trang.
// ============================================================

(function () {
    "use strict";
    // Co rieng cho ban cau noi nay; dat ca co cu de ban chen du phong trong youtube.js khong chay trung
    if (window.__cst_bridge_v2) return;
    window.__cst_bridge_v2 = true;
    window.__cst_bridge_listener_ready = true;

    const CLIENT_KEYS = ["pot", "potc", "c", "cver", "cplayer", "cbrand", "cbr", "cbrver", "cos", "cosver", "cplatform", "xorb", "xobt", "xovt"];
    const bodies = new Map();   // "v|lang|kind" -> noi dung phu de goc (khong phai ban dich may cua YouTube)
    const clients = new Map();  // v -> { pot, c, cver, ... }
    const MAX_BODIES = 12;

    function khoa(v, lang, kind) { return `${v}|${lang}|${kind === "asr" ? "asr" : ""}`; }

    function ghiNhan(url, text) {
        let u;
        try { u = new URL(url, location.href); } catch (e) { return; }
        if (!u.pathname.includes("/api/timedtext")) return;
        const v = u.searchParams.get("v");
        if (!v) return;
        if (u.searchParams.get("pot")) {
            const c = {};
            for (const k of CLIENT_KEYS) { const val = u.searchParams.get(k); if (val) c[k] = val; }
            clients.set(v, c);
        }
        if (text && !u.searchParams.get("tlang")) {
            bodies.delete(khoa(v, u.searchParams.get("lang") || "", u.searchParams.get("kind")));
            bodies.set(khoa(v, u.searchParams.get("lang") || "", u.searchParams.get("kind")), text);
            while (bodies.size > MAX_BODIES) bodies.delete(bodies.keys().next().value);
        }
    }

    // Nghe yeu cau phu de cua trinh phat (XHR va fetch); khong doi hanh vi cua trang
    try {
        const open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
            try {
                if (String(url).includes("/api/timedtext")) {
                    this.addEventListener("load", () => {
                        try {
                            const t = this.responseType === "" || this.responseType === "text" ? this.responseText : "";
                            ghiNhan(this.responseURL || String(url), t);
                        } catch (e) { ghiNhan(String(url), ""); }
                    });
                }
            } catch (e) { /* bo qua */ }
            return open.apply(this, arguments);
        };
    } catch (e) { /* bo qua */ }
    try {
        const origFetch = window.fetch;
        window.fetch = function (input) {
            const p = origFetch.apply(this, arguments);
            try {
                const url = typeof input === "string" ? input : (input && input.url) || "";
                if (url.includes("/api/timedtext")) {
                    p.then(r => r.clone().text().then(t => ghiNhan(r.url || url, t))).catch(() => {});
                }
            } catch (e) { /* bo qua */ }
            return p;
        };
    } catch (e) { /* bo qua */ }

    // Which language is actually spoken. YouTube now AI-dubs videos into other languages (measured
    // 2026-09-26 on 3lY0eRQhYkY, a Vietnamese news clip: audio tracks "vi.4" original and
    // "en-US.10" auto-dubbed, and an English ASR track made from the dub, listed FIRST). Returns
    // { original, current, currentDubbed, tracks:[{ lang, isDefault, isAutoDubbed }] } from what
    // the player exposes: the response's audioTracks, and the player's own audio-track objects,
    // read by value shape because their property names are minified.
    function langOfTrackId(id) {
        const m = String(id || "").match(/^([a-z]{2,3}(?:-[A-Za-z]{2,4})?)\.\d+$/);
        return m ? m[1] : "";
    }
    function describeAudioTrack(t) {
        if (!t || typeof t !== "object") return null;
        for (const v of Object.values(t)) {
            if (v && typeof v === "object" && typeof v.id === "string" && langOfTrackId(v.id) && "isAutoDubbed" in v) {
                return { lang: langOfTrackId(v.id), isDefault: !!v.isDefault, isAutoDubbed: !!v.isAutoDubbed };
            }
        }
        return null;
    }
    function docAmThanh(response) {
        const out = { original: "", current: "", currentDubbed: false, tracks: [] };
        try {
            const player = document.querySelector("#movie_player");
            if (player && typeof player.getAvailableAudioTracks === "function") {
                out.tracks = (player.getAvailableAudioTracks() || []).map(describeAudioTrack).filter(Boolean);
            }
            const cur = player && typeof player.getAudioTrack === "function" ? describeAudioTrack(player.getAudioTrack()) : null;
            if (cur) { out.current = cur.lang; out.currentDubbed = cur.isAutoDubbed; }
        } catch (e) { /* player API changed: fall back to the response below */ }
        const orig = out.tracks.find(t => t.isDefault && !t.isAutoDubbed) || out.tracks.find(t => !t.isAutoDubbed);
        if (orig) out.original = orig.lang;
        if (!out.original) {
            try {
                const r = response.captions.playerCaptionsTracklistRenderer;
                const list = r.audioTracks || [];
                const def = list[r.defaultAudioTrackIndex || 0];
                if (def) out.original = langOfTrackId(def.audioTrackId);
            } catch (e) { /* no audio track info: a single-audio video */ }
        }
        return out;
    }

    function layDanhSachPhuDe() {
        let response = null;

        // Cach 1: hoi truc tiep trinh phat (dung ca khi chuyen video khong tai lai trang)
        try {
            const player = document.querySelector("#movie_player");
            if (player && typeof player.getPlayerResponse === "function") {
                response = player.getPlayerResponse();
            }
        } catch (e) { /* thu cach khac */ }

        // Cach 2: bien toan cuc luc trang moi tai
        if (!response && window.ytInitialPlayerResponse) {
            response = window.ytInitialPlayerResponse;
        }

        if (!response) return { error: "Chua doc duoc du lieu trinh phat" };

        const list =
            response.captions &&
            response.captions.playerCaptionsTracklistRenderer &&
            response.captions.playerCaptionsTracklistRenderer.captionTracks;

        if (!list || list.length === 0) {
            return { tracks: [], videoId: (response.videoDetails || {}).videoId || "" };
        }

        return {
            tracks: list.map(t => ({
                baseUrl: t.baseUrl,
                languageCode: t.languageCode || "",
                kind: t.kind || "",                        // "asr" nghia la phu de tu dong
                name: (t.name && (t.name.simpleText ||
                      (t.name.runs && t.name.runs[0] && t.name.runs[0].text))) || ""
            })),
            videoId: (response.videoDetails || {}).videoId || "",
            title: (response.videoDetails || {}).title || "",
            // Ngu canh chu de cho engine dich (ten kenh, mo ta ngan, tu khoa)
            author: (response.videoDetails || {}).author || "",
            channelId: (response.videoDetails || {}).channelId || "",
            description: String((response.videoDetails || {}).shortDescription || "").slice(0, 400),
            keywords: ((response.videoDetails || {}).keywords || []).slice(0, 12),
            audio: docAmThanh(response)
        };
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    async function taiVanBan(url) {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`Máy chủ phụ đề trả về mã ${res.status}`);
        return res.text();
    }

    // Bat phu de cua trinh phat dung track can lay de trinh phat tu gui yeu cau (co pot),
    // cho toi da ~7 giay, roi tra phu de trinh phat ve nhu cu
    async function nhoTrinhPhatTai(v, lang, kind) {
        const player = document.querySelector("#movie_player");
        if (!player || typeof player.setOption !== "function") return false;
        try {
            const cur = player.getVideoData && player.getVideoData();
            if (cur && cur.video_id && cur.video_id !== v) return false;
        } catch (e) { /* bo qua */ }
        let prev = null;
        try { prev = player.getOption("captions", "track"); } catch (e) { /* module chua nap */ }
        const hadTrack = !!(prev && prev.languageCode);
        try {
            if (typeof player.loadModule === "function") player.loadModule("captions");
            let track = { languageCode: lang, kind: kind === "asr" ? "asr" : "" };
            try {
                const list = player.getOption("captions", "tracklist") || [];
                track = list.find(t => t.languageCode === lang && ((t.kind === "asr") === (kind === "asr"))) || track;
            } catch (e) { /* dung track tu dung */ }
            player.setOption("captions", "track", track);
            const k = khoa(v, lang, kind);
            const xong = () => clients.has(v) || bodies.has(k);
            for (let i = 0; i < 25 && !xong(); i++) await sleep(100);
            // Trinh phat da giu san phu de trong bo nho (khong gui lai): nap lai module phu de
            if (!xong() && typeof player.unloadModule === "function") {
                player.unloadModule("captions");
                await sleep(300);
                player.loadModule("captions");
                player.setOption("captions", "track", track);
                for (let i = 0; i < 40 && !xong(); i++) await sleep(100);
            }
        } catch (e) { /* bo qua */ }
        // Tra lai trang thai phu de cua trinh phat
        try {
            if (hadTrack) player.setOption("captions", "track", prev);
            else player.setOption("captions", "track", {});
        } catch (e) { /* bo qua */ }
        return clients.has(v) || bodies.has(khoa(v, lang, kind));
    }

    async function layNoiDungPhuDe(baseUrl) {
        const u = new URL(baseUrl, location.href);
        if (!u.searchParams.get("fmt")) u.searchParams.set("fmt", "json3");
        const v = u.searchParams.get("v") || "";
        const lang = u.searchParams.get("lang") || "";
        const kind = u.searchParams.get("kind") || "";
        const k = khoa(v, lang, kind);
        if (bodies.has(k)) return { text: bodies.get(k), via: "player" };

        // 1. Link goc (video cu / link khong can pot van tra noi dung)
        let text = await taiVanBan(u.toString());
        if (text) return { text, via: "direct" };

        // 2. Can ma pot cua trinh phat
        if (!clients.has(v)) await nhoTrinhPhatTai(v, lang, kind);
        if (bodies.has(k)) return { text: bodies.get(k), via: "player" };
        const c = clients.get(v);
        if (!c) return { text: "", via: "none", reason: "no-pot" };
        for (const [key, val] of Object.entries(c)) u.searchParams.set(key, val);
        text = await taiVanBan(u.toString());
        return { text, via: "pot", reason: text ? "" : "empty-with-pot" };
    }

    // Switch the player back to the original (not AI-dubbed) audio track. Measured on 3lY0eRQhYkY:
    // setAudioTrack(track object from getAvailableAudioTracks()) returns true and takes effect.
    function chonAmThanhGoc() {
        try {
            const player = document.querySelector("#movie_player");
            if (!player || typeof player.getAvailableAudioTracks !== "function" || typeof player.setAudioTrack !== "function") return false;
            const list = player.getAvailableAudioTracks() || [];
            const orig = list.find(t => { const d = describeAudioTrack(t); return d && d.isDefault && !d.isAutoDubbed; }) ||
                list.find(t => { const d = describeAudioTrack(t); return d && !d.isAutoDubbed; });
            return orig ? !!player.setAudioTrack(orig) : false;
        } catch (e) { return false; }
    }

    // Tell the content script when the viewer switches audio track (to or from an AI dub): once a
    // second, a read of the current track, a message only on change. Cheap, and there is no public
    // player event for it.
    let lastAudioKey = null;
    if (typeof setInterval === "function") setInterval(() => {
        try {
            const player = document.querySelector("#movie_player");
            if (!player || typeof player.getAudioTrack !== "function") return;
            const cur = describeAudioTrack(player.getAudioTrack());
            const key = cur ? `${cur.lang}|${cur.isAutoDubbed}` : "";
            if (key === lastAudioKey) return;
            const first = lastAudioKey === null;
            lastAudioKey = key;
            if (first || !cur) return;
            const vid = (typeof player.getVideoData === "function" && player.getVideoData() || {}).video_id || "";
            window.postMessage({ cstType: "AM_THANH_DOI", videoId: vid, audio: docAmThanh(player.getPlayerResponse ? player.getPlayerResponse() : null) }, "*");
        } catch (e) { /* player not ready */ }
    }, 1000);

    window.addEventListener("message", event => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data) return;

        if (data.cstType === "CHON_AM_THANH_GOC") {
            window.postMessage({ cstType: "TRA_LOI_AM_THANH_GOC", requestId: data.requestId, ok: chonAmThanhGoc() }, "*");
            return;
        }

        if (data.cstType === "YEU_CAU_PHU_DE") {
            let ketQua;
            try {
                ketQua = layDanhSachPhuDe();
            } catch (err) {
                ketQua = { error: String(err && err.message ? err.message : err) };
            }
            window.postMessage({ cstType: "TRA_LOI_PHU_DE", requestId: data.requestId, ...ketQua }, "*");
            return;
        }

        if (data.cstType === "YEU_CAU_NOI_DUNG_PHU_DE" && typeof data.baseUrl === "string") {
            layNoiDungPhuDe(data.baseUrl)
                .then(r => window.postMessage({ cstType: "TRA_LOI_NOI_DUNG_PHU_DE", requestId: data.requestId, ...r }, "*"))
                .catch(err => window.postMessage({ cstType: "TRA_LOI_NOI_DUNG_PHU_DE", requestId: data.requestId, error: String(err && err.message ? err.message : err) }, "*"));
        }
    });
})();

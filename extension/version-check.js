// ============================================================
// PHÁT HIỆN TIỆN ÍCH CHƯA ĐƯỢC NẠP LẠI SAU KHI CẬP NHẬT FILE
//
// Với tiện ích cài từ thư mục (unpacked), Chrome chỉ nạp lại service worker,
// manifest và content script khi bấm "Tải lại" trong chrome://extensions.
// Trang Cài đặt và popup thì đọc thẳng file trên đĩa. Hai bên có thể lệch phiên
// bản: trang Cài đặt mới nhưng tab YouTube vẫn chạy mã cũ (ví dụ nút Cài đặt cũ
// còn tự mở chrome-extension:// từ trang web -> ERR_BLOCKED_BY_CLIENT).
// So phiên bản ĐANG CHẠY (manifest trong bộ nhớ Chrome) với phiên bản của FILE
// (nhãn trên trang); lệch thì báo rõ và cho nạp lại bằng một nút.
//
// Feature PRs do not bump the version, so checkBuild() compares commits instead:
// build-stamp.js on disk (written by tools/git-autoupdate.js) against the stamp
// the background loaded at Chrome start (buildStamp route in background.js).
// ============================================================
(function (root) {
    "use strict";

    function diskVersion(doc, selector) {
        const el = doc.querySelector(selector);
        return el ? ((el.textContent.match(/v(\d+(?:\.\d+)+)/) || [])[1] || "") : "";
    }

    function loadedVersion(chromeApi) {
        try { return chromeApi.runtime.getManifest().version || ""; } catch (e) { return ""; }
    }

    // Shows the reload warning above the content. loadedText and diskText complete the sentence.
    function showStale(doc, chromeApi, mountSelector, loadedText, diskText) {
        const mount = doc.querySelector(mountSelector) || doc.body;
        const box = doc.createElement("div");
        box.className = "cst-stale-warning";
        box.setAttribute("role", "alert");
        box.style.cssText = "margin:0 0 14px;padding:12px 14px;border-radius:8px;border:1px solid #d97706;background:rgba(217,119,6,.12);color:inherit;font-size:13px;line-height:1.5";
        const msg = doc.createElement("div");
        msg.textContent = `Trình duyệt vẫn đang chạy ${loadedText} của tiện ích, còn file trên máy đã là ${diskText}. ` +
            "Các tab YouTube / Coursera vẫn dùng mã cũ cho tới khi nạp lại (ví dụ nút Cài đặt cũ bị trình duyệt chặn: ERR_BLOCKED_BY_CLIENT).";
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.textContent = "Nạp lại tiện ích ngay";
        btn.style.cssText = "margin-top:8px;padding:6px 12px;border-radius:6px;border:0;background:#d97706;color:#fff;font-weight:600;cursor:pointer";
        const hint = doc.createElement("div");
        hint.style.cssText = "margin-top:6px;opacity:.8";
        // No F5: background.js reinjectOpenTabs pushes the new code into open YouTube / Coursera tabs
        hint.textContent = "Trang này sẽ tự đóng khi nạp lại. Các tab YouTube / Coursera đang mở tự nhận mã mới, không cần tải lại trang.";
        // Safe on an unpacked install, which always has developer mode on (probe: docs/DANGER.md §3)
        btn.addEventListener("click", () => { try { chromeApi.runtime.reload(); } catch (e) { /* bỏ qua */ } });
        box.append(msg, btn, hint);
        mount.prepend(box);
    }

    // Trả về { stale, loaded, disk } hoặc null khi không chạy trong tiện ích
    function check(doc, chromeApi, badgeSelector, mountSelector) {
        const loaded = loadedVersion(chromeApi);
        if (!loaded) return null;
        const disk = diskVersion(doc, badgeSelector);
        const stale = !!(disk && loaded !== disk);
        if (stale) showStale(doc, chromeApi, mountSelector, `bản ${loaded}`, `bản ${disk}`);
        return { stale, loaded, disk };
    }

    // "2026-10-25T09:14:28+00:00" -> "09:14 25/10/2026" theo giờ của máy
    function stampLabel(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "";
        return d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
    }

    // Commit trên đĩa so với commit mà Chrome đã nạp lúc khởi động. diskStamp mặc định là
    // build-stamp.js mà trang vừa nạp; không có (bản cài không dùng git) thì chỉ so phiên bản.
    async function checkBuild(doc, chromeApi, badgeSelector, mountSelector, diskStamp = root && root.CST_STAMP) {
        if (!diskStamp || !diskStamp.commit) return check(doc, chromeApi, badgeSelector, mountSelector);
        let loadedStamp = null;
        try {
            // Bản tiện ích cũ (chưa có route buildStamp) không trả lời: coi như chưa có dấu commit
            const reply = await chromeApi.runtime.sendMessage({ action: "buildStamp" });
            loadedStamp = (reply && reply.stamp) || null;
        } catch (e) { loadedStamp = null; }
        const version = loadedVersion(chromeApi) || diskVersion(doc, badgeSelector);
        const badge = doc.querySelector(badgeSelector);
        if (badge) {
            const when = stampLabel(diskStamp.committedAt);
            // Trang Cài đặt có nhãn dài "Phiên bản vX · ..."; popup chỉ có "vX" trong thẻ nhỏ
            if ((badge.textContent || "").startsWith("Phiên bản")) badge.textContent = `Phiên bản v${version} · commit ${diskStamp.commit} · cập nhật ${when}`;
            badge.title = `Commit ${diskStamp.commit}, cập nhật ${when}`;
        }
        const loaded = loadedStamp ? loadedStamp.commit : "";
        const stale = loaded !== diskStamp.commit;
        if (stale) {
            const loadedText = loaded ? `commit ${loaded}` : "bản cũ (chưa có dấu commit)";
            showStale(doc, chromeApi, mountSelector, loadedText, `commit ${diskStamp.commit}`);
        }
        return { stale, loaded, disk: diskStamp.commit };
    }

    const api = { diskVersion, loadedVersion, check, checkBuild, stampLabel };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_VERSION_CHECK = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

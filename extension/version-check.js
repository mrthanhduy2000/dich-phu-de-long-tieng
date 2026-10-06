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

    // Trả về { stale, loaded, disk } hoặc null khi không chạy trong tiện ích
    function check(doc, chromeApi, badgeSelector, mountSelector) {
        const loaded = loadedVersion(chromeApi);
        if (!loaded) return null;
        const disk = diskVersion(doc, badgeSelector);
        const stale = !!(disk && loaded !== disk);
        if (!stale) return { stale, loaded, disk };
        const mount = doc.querySelector(mountSelector) || doc.body;
        const box = doc.createElement("div");
        box.className = "cst-stale-warning";
        box.setAttribute("role", "alert");
        box.style.cssText = "margin:0 0 14px;padding:12px 14px;border-radius:8px;border:1px solid #d97706;background:rgba(217,119,6,.12);color:inherit;font-size:13px;line-height:1.5";
        const msg = doc.createElement("div");
        msg.textContent = `Chrome vẫn đang chạy bản ${loaded} của tiện ích, còn file trên máy đã là bản ${disk}. ` +
            "Các tab YouTube / Coursera vẫn dùng mã cũ cho tới khi nạp lại (ví dụ nút Cài đặt cũ bị Chrome chặn: ERR_BLOCKED_BY_CLIENT).";
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.textContent = "Nạp lại tiện ích ngay";
        btn.style.cssText = "margin-top:8px;padding:6px 12px;border-radius:6px;border:0;background:#d97706;color:#fff;font-weight:600;cursor:pointer";
        const hint = doc.createElement("div");
        hint.style.cssText = "margin-top:6px;opacity:.8";
        hint.textContent = "Trang này sẽ tự đóng khi nạp lại. Sau đó tải lại (F5) các tab YouTube / Coursera đang mở.";
        btn.addEventListener("click", () => { try { chromeApi.runtime.reload(); } catch (e) { /* bỏ qua */ } });
        box.append(msg, btn, hint);
        mount.prepend(box);
        return { stale, loaded, disk };
    }

    const api = { diskVersion, loadedVersion, check };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_VERSION_CHECK = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

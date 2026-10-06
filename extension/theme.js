// Giao diện Sáng / Tối cho bảng điều khiển và trang Cài đặt.
//   "auto"  : theo cài đặt của máy (mặc định, giống trước đây)
//   "light" : luôn sáng, kể cả khi máy đang ở chế độ tối
//   "dark"  : luôn tối
// Áp dụng NGAY khi trang mở (đọc từ bộ nhớ của chính trang) để không bị nháy sáng rồi tối;
// sau đó đồng bộ với cài đặt đã lưu để hai trang luôn giống nhau.
(function () {
    const KEY = "cstUiTheme";
    const apply = t => {
        const el = document.documentElement;
        if (t === "light" || t === "dark") el.setAttribute("data-theme", t);
        else el.removeAttribute("data-theme");
    };
    let hienTai = "auto";
    try { hienTai = localStorage.getItem(KEY) || "auto"; } catch (e) { /* bỏ qua */ }
    apply(hienTai);

    function dat(t) {
        hienTai = t;
        try { localStorage.setItem(KEY, t); } catch (e) { /* bỏ qua */ }
        apply(t);
        try { chrome.storage.sync.set({ uiTheme: t }); } catch (e) { /* bỏ qua */ }
    }

    try {
        chrome.storage.sync.get({ uiTheme: "auto" }, r => {
            const t = (r && r.uiTheme) || "auto";
            if (t === hienTai) return;
            hienTai = t;
            try { localStorage.setItem(KEY, t); } catch (e) { /* bỏ qua */ }
            apply(t);
        });
        chrome.storage.onChanged.addListener((c, area) => {
            if (area !== "sync" || !c.uiTheme) return;
            hienTai = c.uiTheme.newValue || "auto";
            try { localStorage.setItem(KEY, hienTai); } catch (e) { /* bỏ qua */ }
            apply(hienTai);
        });
    } catch (e) { /* ngoài tiện ích */ }

    window.CST_THEME = { get: () => hienTai, set: dat, apply };
})();

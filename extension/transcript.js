// Transcript panel: the whole talk as text beside the video, in both languages, with the line that
// is playing highlighted. Click a line to jump there, search inside it, export it as .srt.
// Site-independent: each player hands over an adapter (see csTranscriptAdapter in content.js and
// ytTranscriptAdapter in youtube.js). Styling comes from player-ui.js, so the panel follows the
// same light/dark choice as the quick menu.
(function (root) {
    "use strict";

    const GEN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    let open = null;        // { panel, adapter, rows, key, follow, lastRow, timer }

    function el(tag, cls, txt) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e;
    }

    function shortClock(seconds) {
        const s = Math.max(0, seconds || 0);
        return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    }

    // .srt wants hh:mm:ss,mmm
    function srtClock(seconds) {
        // whole milliseconds first: rounding the fraction alone gave "00:00:01,1000" at 1.9996 s,
        // a stamp players reject (the cue was dropped)
        const total = Math.round(Math.max(0, seconds || 0) * 1000);
        const h = Math.floor(total / 3600000);
        const m = Math.floor((total % 3600000) / 60000);
        const sec = Math.floor((total % 60000) / 1000);
        const ms = total % 1000;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
    }

    // lines: [{ start, end, vi, en }]. keepOriginal puts the source line under the Vietnamese one.
    function buildSrt(lines, { keepOriginal = false } = {}) {
        const out = [];
        let n = 0;
        for (const l of lines || []) {
            const vi = (l.vi || "").trim();
            const en = (l.en || "").trim();
            const text = keepOriginal && en && vi ? `${vi}\n${en}` : (vi || en);
            if (!text) continue;
            n++;
            out.push(`${n}\n${srtClock(l.start)} --> ${srtClock(l.end)}\n${text}\n`);
        }
        return out.join("\n");
    }

    // Both players hold two lists: the Vietnamese cues we built and the source cues. A row is one
    // Vietnamese cue plus whatever source text overlaps it, so the two columns line up even though
    // the two languages are cut into different numbers of cues.
    // The panel asks for the lines every 150 ms, but they only change when a translation lands (the
    // players then build new arrays) or a line is edited (invalidate() bumps rev). Remember the
    // last answer for the same arrays: on a one-hour talk that is ~1.7 ms of main thread a second.
    let memo = null;
    let rev = 0;
    function mergeLines(viCues, srcCues) {
        const key = [viCues, srcCues, viCues ? viCues.length : 0, srcCues ? srcCues.length : 0, rev];
        if (memo && memo.key.every((x, k) => x === key[k])) return memo.out;
        const out = mergeLinesNow(viCues, srcCues);
        memo = { key, out };
        return out;
    }

    // Each source line goes to the one row it overlaps most (a tie: the earlier row). The two languages
    // are cut at different times, so a source line crossing a Vietnamese cue boundary was listed in
    // both rows: 33% of the source lines in the user's 15 videos, 45% more English words in the panel
    // and the bilingual .srt than the video has (2.3.5).
    function mergeLinesNow(viCues, srcCues) {
        const vi = viCues || [];
        const src = (srcCues || []).slice().sort((a, b) => a.start - b.start);
        const own = vi.map(() => []);
        let j = 0;
        for (const s of src) {
            const t = (s.text || "").trim();
            if (!t) continue;
            while (j < vi.length && vi[j].end <= s.start) j++;
            let best = -1, most = 0;
            for (let r = j; r < vi.length && vi[r].start < s.end; r++) {
                const ov = Math.min(vi[r].end, s.end) - Math.max(vi[r].start, s.start);
                if (ov > most) { most = ov; best = r; }
            }
            if (best >= 0) own[best].push(t);
        }
        const out = [];
        vi.forEach((c, r) => {
            const text = (c.text || (c.lines || []).join(" ") || "").trim();
            out.push({
                start: c.start, end: c.end, vi: text, en: own[r].join(" "),
                edited: !!c.cstEdited,
                machine: c.cstOrig ? c.cstOrig.text : text      // what the translator produced
            });
        });
        return out;
    }

    function fileName(title) {
        const base = String(title || "")
            .replace(/đ/g, "d").replace(/Đ/g, "D")          // NFD does not split đ: "Đường" became "uong"
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
        return `${base || "ban-chep-loi"}.srt`;
    }

    function download(name, text) {
        const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
    }

    // Rebuilt only when the line count or the search box changes: translation arrives group by
    // group, and rebuilding every tick would throw away the reader's scroll position.
    function buildRows(panel, adapter) {
        const lines = adapter.lines() || [];
        const search = panel.querySelector(".cst-tr-search");
        const needle = ((search && search.value) || "").trim().toLowerCase();
        const key = `${lines.length}|${lines.length ? lines[lines.length - 1].end : 0}|${needle}`;
        if (key === open.key || open.editing) return;
        open.key = key;
        const list = panel.querySelector(".cst-tr-list");
        const rows = [];
        list.replaceChildren();
        for (const l of lines) {
            const vi = (l.vi || "").trim();
            const en = (l.en || "").trim();
            if (needle && !(vi.toLowerCase().includes(needle) || en.toLowerCase().includes(needle))) continue;
            // A div acting as a button, not a <button>: it holds the edit button, and a button inside a
            // button is invalid HTML that browsers break apart
            const row = el("div", "cst-tr-row");
            row.setAttribute("role", "button");
            row.setAttribute("tabindex", "0");
            row.setAttribute("aria-current", "false");   // a screen reader should hear "not this one" too
            const time = el("span", "cst-tr-time", shortClock(l.start));
            if (l.edited) time.appendChild(el("span", "cst-tr-mark", "đã sửa"));
            row.appendChild(time);
            const body = el("span", "cst-tr-text");
            body.appendChild(el("span", "cst-tr-vi", vi || en));
            if (vi && en) body.appendChild(el("span", "cst-tr-en", en));
            row.appendChild(body);
            const seek = () => {
                if (row.dataset.cstEditing === "1") return;
                const v = adapter.videoEl && adapter.videoEl();
                if (!v) return;
                v.currentTime = Math.max(0, l.start);
                if (v.paused && v.play) v.play().catch(() => {});
            };
            row.addEventListener("click", seek);
            row.addEventListener("keydown", e => {
                if (row.dataset.cstEditing === "1") return;
                if (e.key === "Enter" || e.key === " ") { if (e.preventDefault) e.preventDefault(); seek(); }
            });
            if (vi && adapter.saveEdit) {
                const pen = el("button", "cst-tr-edit");
                pen.type = "button";
                pen.textContent = "✎";
                pen.title = "Sửa dòng này";
                pen.setAttribute("aria-label", `Sửa dòng lúc ${shortClock(l.start)}`);
                pen.addEventListener("click", e => { if (e.stopPropagation) e.stopPropagation(); startEdit(panel, adapter, row, l); });
                row.appendChild(pen);
            }
            row.cstStart = l.start;
            row.cstEnd = l.end;
            list.appendChild(row);
            rows.push(row);
        }
        open.rows = rows;
        open.lastRow = null;
        const meta = panel.querySelector(".cst-tr-meta");
        if (meta) {
            const v = adapter.videoEl && adapter.videoEl();
            const secs = v && isFinite(v.duration) && v.duration > 0 ? v.duration : (lines.length ? lines[lines.length - 1].end : 0);
            const mins = Math.max(1, Math.round(secs / 60));
            const edited = lines.filter(l => l.edited).length;
            meta.textContent = lines.length
                ? [`${lines.length} dòng`, `${mins} phút`, needle ? `${rows.length} dòng khớp` : "", edited ? `${edited} dòng đã sửa` : ""].filter(Boolean).join(" · ")
                : "";
        }
        if (!rows.length) {
            list.appendChild(el("div", "cst-tr-empty", needle
                ? "Không có dòng nào khớp."
                : "Chưa có lời thoại. Bật phụ đề tiếng Việt rồi chờ dịch."));
        }
    }

    // Keys typed into our fields must not reach the page: on YouTube "f", "k", "m" and the arrows
    // are player shortcuts, and Esc would close the panel instead of the edit.
    function keepKeys(input) {
        const stop = e => { if (e.stopPropagation) e.stopPropagation(); };
        input.addEventListener("keydown", stop);
        input.addEventListener("keyup", stop);
        input.addEventListener("keypress", stop);
    }

    // Turn one row into an edit box. The video pauses while the viewer types (a line that scrolls
    // away mid-sentence is hard to fix) and plays on if we were the ones who paused it.
    function startEdit(panel, adapter, row, line) {
        if (!open || open.editing) return;
        const v = adapter.videoEl && adapter.videoEl();
        const pausedByUs = !!(v && !v.paused && v.pause);
        if (pausedByUs) v.pause();
        open.editing = row;
        row.dataset.cstEditing = "1";
        const body = row.querySelector(".cst-tr-text");
        const viSpan = row.querySelector(".cst-tr-vi");
        const form = el("span", "cst-tr-form");
        const input = el("textarea", "cst-tr-input");
        input.value = line.vi;
        input.setAttribute("aria-label", "Nội dung dòng phụ đề");
        input.rows = 2;
        keepKeys(input);
        const acts = el("span", "cst-tr-acts");
        const btnSave = el("button", "cst-tr-save", "Lưu");
        const btnCancel = el("button", "cst-tr-act", "Hủy");
        btnSave.type = btnCancel.type = "button";
        acts.appendChild(btnSave);
        acts.appendChild(btnCancel);
        let btnMachine = null;
        if (line.edited) {
            btnMachine = el("button", "cst-tr-act", "Dùng bản dịch máy");
            btnMachine.type = "button";
            btnMachine.title = line.machine;
            acts.appendChild(btnMachine);
        }
        form.appendChild(input);
        form.appendChild(acts);
        if (viSpan) viSpan.style.display = "none";
        body.insertBefore ? body.insertBefore(form, body.firstChild) : body.appendChild(form);
        const stopClick = e => { if (e.stopPropagation) e.stopPropagation(); };
        form.addEventListener("click", stopClick);

        const finish = async text => {
            if (!open || open.editing !== row) return;
            open.editing = null;
            delete row.dataset.cstEditing;
            try {
                if (text != null) await adapter.saveEdit(line, text);
            } catch (e) {
                if (root.CST_UI && root.CST_UI.toast) root.CST_UI.toast("Chưa lưu được dòng này, thử lại nhé.", { warn: true });
            }
            if (!open) return;
            rev++;                                  // the text changed under the remembered lines
            memo = null;
            open.key = "";                          // redraw with the new text and the "đã sửa" mark
            buildRows(panel, adapter);
            if (pausedByUs && v && v.paused && v.play) v.play().catch(() => {});
        };
        btnSave.addEventListener("click", () => finish(input.value));
        btnCancel.addEventListener("click", () => finish(null));
        if (btnMachine) btnMachine.addEventListener("click", () => finish(line.machine));
        input.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) { if (e.preventDefault) e.preventDefault(); finish(input.value); }
            else if (e.key === "Escape") finish(null);
        });
        try { input.focus(); if (input.select) input.select(); } catch (e) { /* bỏ qua */ }
    }

    // Edits made elsewhere (Settings, another tab) change the text under the panel
    function invalidate() {
        rev++;
        memo = null;
        if (!open || open.editing) return;
        open.key = "";
        buildRows(open.panel, open.adapter);
    }

    function highlightNow(panel, adapter) {
        const v = adapter.videoEl && adapter.videoEl();
        if (!v || !open.rows) return;
        const t = v.currentTime;
        let now = null;
        for (const r of open.rows) {
            const on = t >= r.cstStart && t < r.cstEnd;
            if (on !== (r.dataset.cstNow === "1")) {
                r.dataset.cstNow = on ? "1" : "0";
                r.setAttribute("aria-current", on ? "true" : "false");
            }
            if (on) now = r;
        }
        // Follow the video, but stop following the moment the reader scrolls by hand. Checked on every
        // tick, not only when the line changes: measured on a real page, a smooth scroll interrupted
        // halfway (the tab went to the background) left the list stuck at the top for good.
        // offsetTop is relative to the panel, so the list's own offset is taken off.
        const list = panel.querySelector(".cst-tr-list");
        if (now && open.follow && !open.editing && list && list.scrollTo) {
            const rowTop = (now.offsetTop || 0) - (list.offsetTop || 0);
            const rowH = now.clientHeight || 0;
            const viewH = list.clientHeight || 0;
            const inView = rowTop >= list.scrollTop && rowTop + rowH <= list.scrollTop + viewH;
            if (now !== open.lastRow || !inView) {
                open.lastRow = now;
                const top = Math.max(0, rowTop - viewH / 2 + rowH / 2);
                const far = Math.abs(top - (list.scrollTop || 0)) > viewH * 3;
                list.scrollTo({ top, behavior: far ? "auto" : "smooth" });
            }
        }
    }

    function close() {
        if (!open) return;
        clearInterval(open.timer);
        const adapter = open.adapter;
        const kit = root.CST_PLAYER_UI;
        if (kit && kit.dismiss) kit.dismiss(open.panel); else open.panel.remove();
        open = null;
        // the subtitles get the full width back
        if (adapter && adapter.onPanel) { try { adapter.onPanel(false); } catch (e) { /* bỏ qua */ } }
    }

    // adapter: { box(), videoEl(), lines(), title?(), dual?(), theme?(), onPanel?(on), saveEdit?(line, text) }
    function toggle(adapter) {
        const kit = root.CST_PLAYER_UI;
        const box = adapter && adapter.box && adapter.box();
        if (open) { close(); return null; }
        if (!kit || !box) return null;
        kit.napCss(document);

        const panel = el("div", "cst-tr-panel");
        panel.dataset.cstGen = GEN;
        panel.dataset.cstTheme = adapter.theme ? adapter.theme() : "auto";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Bản chép lời");

        const head = el("div", "cst-tr-head");
        head.appendChild(el("span", "cst-tr-title", "Bản chép lời"));
        const btnSrt = el("button", "cst-tr-act", "Xuất .srt");
        btnSrt.type = "button";
        btnSrt.title = "Tải về tệp phụ đề .srt";
        const btnClose = el("button", "cst-menu-x", "✕");
        btnClose.type = "button";
        btnClose.setAttribute("aria-label", "Đóng bản chép lời");
        head.appendChild(btnSrt);
        head.appendChild(btnClose);
        panel.appendChild(head);

        // One line of front matter under the title: how long the talk is and what has been corrected
        const meta = el("div", "cst-tr-meta", "");
        panel.appendChild(meta);

        const search = el("input", "cst-tr-search");
        search.type = "search";
        search.placeholder = "Tìm trong lời thoại…";
        search.setAttribute("aria-label", "Tìm trong lời thoại");
        keepKeys(search);
        panel.appendChild(search);

        const list = el("div", "cst-tr-list");
        panel.appendChild(list);
        box.appendChild(panel);

        open = { panel, adapter, rows: [], key: "", follow: true, lastRow: null, timer: 0, editing: null };
        buildRows(panel, adapter);

        search.addEventListener("input", () => buildRows(panel, adapter));
        btnClose.addEventListener("click", close);
        btnSrt.addEventListener("click", () => {
            const lines = adapter.lines() || [];
            if (!lines.length) {
                if (root.CST_UI && root.CST_UI.toast) root.CST_UI.toast("Chưa có lời thoại để xuất.", { warn: true });
                return;
            }
            download(fileName(adapter.title ? adapter.title() : ""),
                buildSrt(lines, { keepOriginal: !!(adapter.dual && adapter.dual()) }));
        });
        list.addEventListener("wheel", () => { open.follow = false; }, { passive: true });
        list.addEventListener("touchmove", () => { open.follow = false; }, { passive: true });
        panel.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); close(); } });

        // the subtitle overlay has to step aside, or it runs underneath the panel
        if (adapter.onPanel) { try { adapter.onPanel(true); } catch (e) { /* bỏ qua */ } }

        open.timer = setInterval(() => {
            // the player can tear its own DOM down under us (navigation, theatre mode). A host with
            // no isConnected at all (test harness) reports undefined, which is not "removed".
            if (panel.isConnected === false) { close(); return; }
            buildRows(panel, adapter);
            highlightNow(panel, adapter);
        }, 150);
        return panel;
    }

    root.CST_TRANSCRIPT = { toggle, close, invalidate, isOpen: () => !!open, buildSrt, srtClock, fileName, mergeLines };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) module.exports = globalThis.CST_TRANSCRIPT;

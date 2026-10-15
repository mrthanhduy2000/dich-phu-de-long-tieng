#!/bin/bash
# Cài (hoặc cập nhật) tiện ích "Dịch Phụ Đề & Lồng Tiếng AI" và máy chủ giọng VieNeu trên macOS.
#   curl -fsSL https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-mac.sh | bash
# Chạy lại bất cứ lúc nào để cập nhật: cài đặt và khóa API trong trình duyệt được giữ nguyên.
# Gỡ bỏ:
#   curl -fsSL https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-mac.sh | bash -s -- --uninstall
#
# Must run on macOS's own /bin/bash 3.2. Overrides, for testing only: DPD_SRC (an unpacked share
# tree instead of the download), DPD_REF (a branch, tag or commit of the share repo to download
# instead of main: the install test sets the commit under test), DPD_EXT_DIR, DPD_VIENEU_DIR,
# DPD_NO_AUTOSTART=1, DPD_NO_DESKTOP=1, DPD_NO_OPEN=1.
set -euo pipefail

# The whole body is one function, called on the last line: under `curl | bash` the script is read
# from stdin, and a child that reads stdin would otherwise swallow the rest of it.
main() {
REPO="mrthanhduy2000/dich-phu-de-long-tieng"
# VieNeu is pinned: vieneu/openai_speech.py is a patched copy of this exact commit's file.
VIENEU_COMMIT="d350c63fceb0792d7b2db9a51d61cc040b1f8efa"
EXT_DIR="${DPD_EXT_DIR:-$HOME/DichPhuDe}"
VN_DIR="${DPD_VIENEU_DIR:-$HOME/VieNeu-TTS}"
PORT=8000                                   # the extension calls 127.0.0.1:8000 (cost-policy.js)
MARK=".dichphude-vieneu"
LABEL="com.damduy.vieneu"                   # tools/vieneu-autostart.command
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UPD_LABEL="com.damduy.dichphude.update"     # the background updater (tools/dichphude-update.py)
UPD_PLIST="$HOME/Library/LaunchAgents/$UPD_LABEL.plist"
UPD="$HOME/Desktop/Cập nhật Dịch Phụ Đề.command"
# The pinned voice model lives inside the VieNeu folder; the start scripts read it offline only
# while this marker is there and every file it lists is whole (tools/vieneu-pin.py writes it once
# every file is checked)
PIN_MARK="models/hf/.pinned-ok"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nLỖI: %s\n' "$*" >&2; exit 1; }
# VieNeu answers /health with its sample rate; anything else on the port is another program
is_vieneu() { curl -s -m 3 "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q '"sample_rate"'; }
# The service label is shared with a VieNeu set up by hand (the author's own machine): touch the
# service only when it runs this installer's VieNeu. Learned the hard way: a test uninstall took
# down the author's own voice server.
service_is_ours() { grep -qF "$VN_DIR/.venv/bin/python" "$PLIST" 2>/dev/null; }
updater_is_ours() { grep -qF "$VN_DIR/dichphude-update.py" "$UPD_PLIST" 2>/dev/null; }
# The background updater's LaunchAgent. Under the install test (DPD_REF set) it carries DPD_REF, so
# the updater it starts reads the commit under test, as the installer did; without it, no
# EnvironmentVariables at all (a friend's plist is unchanged).
updater_plist() {
    local env=""
    if [[ -n "${DPD_REF:-}" ]]; then
        env="    <key>EnvironmentVariables</key><dict><key>DPD_REF</key><string>$DPD_REF</string></dict>
"
    fi
    cat <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$UPD_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$VN_DIR/.venv/bin/python</string>
        <string>$VN_DIR/dichphude-update.py</string>
    </array>
    <key>WorkingDirectory</key><string>$VN_DIR</string>
${env}    <key>RunAtLoad</key><true/>
    <key>StartInterval</key><integer>1800</integer>
    <key>ProcessType</key><string>Background</string>
    <key>StandardOutPath</key><string>/dev/null</string>
    <key>StandardErrorPath</key><string>/dev/null</string>
</dict>
</plist>
PLISTEOF
}

# The browser that shows the guide page: the default one when it is Chromium-based, else the first
# Chromium browser installed. Safari and Firefox cannot run the extension (the page says so).
CHROMIUM_IDS="com.google.Chrome com.coccoc.Coccoc com.microsoft.edgemac com.brave.Browser company.thebrowser.Browser com.operasoftware.Opera com.vivaldi.Vivaldi org.chromium.Chromium"
# The https handler's bundle id, lower case, from LaunchServices (no python: on a fresh Mac it is a
# stub that asks to install the developer tools)
default_browser() {
    defaults read com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers 2>/dev/null | awk '
        /^[[:space:]]*},?[[:space:]]*$/ { role = "" }
        /LSHandlerRoleAll = / { r = $0; sub(/.*= *"?/, "", r); sub(/"?;.*/, "", r); role = r }
        /LSHandlerURLScheme = https;/ { print tolower(role); exit }'
}
open_in_chromium() {
    local want id
    want="$(default_browser || true)"
    for id in $CHROMIUM_IDS; do
        if [[ "$(printf '%s' "$id" | tr '[:upper:]' '[:lower:]')" == "$want" ]] && open -b "$id" "$1" 2>/dev/null; then return 0; fi
    done
    for id in $CHROMIUM_IDS; do
        if open -b "$id" "$1" 2>/dev/null; then return 0; fi
    done
    return 1
}

[[ "$(uname -s)" == Darwin ]] || die "Tệp này dành cho macOS. Máy Windows dùng install-windows.ps1."

# ---- Uninstall ----
if [[ "${1:-}" == "--uninstall" ]]; then
    say "Đang gỡ Dịch Phụ Đề và VieNeu..."
    # Only a VieNeu this installer made: someone's own VieNeu (and its service) is left running
    if [[ -f "$VN_DIR/$MARK" ]]; then
        if service_is_ours; then
            launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
            rm -f "$PLIST"
        fi
        if updater_is_ours; then
            launchctl bootout "gui/$(id -u)/$UPD_LABEL" 2>/dev/null || true
            rm -f "$UPD_PLIST"
        fi
        pkill -f "$VN_DIR/.venv/bin/python -m apps.openai_speech" 2>/dev/null || true
        rm -rf "$VN_DIR"                   # the pinned model (models/hf) goes with it
        # Installs made before the pinned model left it in the Hugging Face cache
        rm -rf "$HOME/.cache/huggingface/hub/models--pnnbao-ump--"* \
               "$HOME/.cache/huggingface/hub/models--OpenMOSS-Team--MOSS-Audio-Tokenizer-Nano-ONNX" 2>/dev/null || true
    elif [[ -d "$VN_DIR" ]]; then echo "  Giữ nguyên $VN_DIR (không do bộ cài này tạo)."; fi
    if [[ -f "$EXT_DIR/manifest.json" ]]; then rm -rf "$EXT_DIR"; fi
    rm -f "$UPD"
    echo
    echo " ĐÃ GỠ XONG. Còn một bước: ở trang Tiện ích của trình duyệt (chrome://extensions,"
    echo " Edge: edge://extensions), bấm \"Xóa\" trên thẻ \"Vietnamese Subtitle Translator\"."
    return 0
fi

WITH_VOICE=1
PINNED=0
if [[ "$(uname -m)" != arm64 ]]; then
    WITH_VOICE=0
    say "Máy Mac chip Intel: VieNeu chỉ chạy trên Mac chip Apple (M1 trở lên). Chỉ cài phần dịch phụ đề."
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/dpd.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# 1. Source
if [[ -n "${DPD_SRC:-}" ]]; then
    SRC="$DPD_SRC"
else
    say "Đang tải bản mới nhất..."
    REF="${DPD_REF:-refs/heads/main}"
    curl -fsSL "https://codeload.github.com/$REPO/zip/$REF" -o "$TMP/share.zip"
    ditto -x -k "$TMP/share.zip" "$TMP/share"
    SRC="$(find "$TMP/share" -mindepth 1 -maxdepth 1 -type d | head -1)"
fi
[[ -f "$SRC/extension/manifest.json" ]] || die "Bản tải về không có tiện ích (thiếu extension/manifest.json)."

# 2. Extension. Files are replaced inside the same folder: the browser ties the extension's settings
# and the Gemini key to this exact path, so the folder itself must never move or be recreated elsewhere.
UPDATE=0
if [[ -d "$EXT_DIR" ]] && [[ -n "$(ls -A "$EXT_DIR")" ]]; then
    [[ -f "$EXT_DIR/manifest.json" ]] || die "Thư mục $EXT_DIR đã có tệp khác, không phải tiện ích. Bộ cài không ghi đè nó."
    UPDATE=1
fi
say "Đang chép tiện ích vào $EXT_DIR"
mkdir -p "$EXT_DIR"
find "$EXT_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R "$SRC/extension/." "$EXT_DIR/"
chmod +x "$EXT_DIR"/tools/*.command 2>/dev/null || true
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$EXT_DIR/manifest.json" | head -1)"

# 3. VieNeu
if [[ $WITH_VOICE == 1 ]]; then
    if [[ -d "$VN_DIR" && ! -f "$VN_DIR/$MARK" ]]; then
        die "Thư mục $VN_DIR đã có sẵn nhưng không do bộ cài này tạo. Bộ cài không ghi đè nó: đổi tên thư mục đó rồi chạy lại."
    fi
    if ! is_vieneu; then
        OWNER="$(lsof -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1}' || true)"
        if [[ -n "$OWNER" ]]; then
            die "Cổng $PORT đang bị chương trình khác dùng ($OWNER). Tiện ích cần cổng này cho VieNeu: tắt chương trình đó rồi chạy lại bộ cài."
        fi
    fi

    UV="$(command -v uv || true)"
    if [[ -z "$UV" && -x "$HOME/.local/bin/uv" ]]; then UV="$HOME/.local/bin/uv"; fi
    if [[ -z "$UV" ]]; then
        say "Đang cài uv (trình quản lý Python, không cần quyền quản trị)..."
        curl -LsSf https://astral.sh/uv/install.sh | env UV_NO_MODIFY_PATH=1 sh >/dev/null
        UV="$HOME/.local/bin/uv"
        [[ -x "$UV" ]] || die "Cài uv không thành công."
    fi

    if [[ "$(cat "$VN_DIR/$MARK" 2>/dev/null || true)" != "$VIENEU_COMMIT" ]]; then
        say "Đang tải VieNeu-TTS..."
        curl -fsSL "https://codeload.github.com/pnnbao97/VieNeu-TTS/zip/$VIENEU_COMMIT" -o "$TMP/vieneu.zip"
        # ditto, not unzip: macOS unzip mangles VieNeu's Vietnamese file names ("Bình (nam miền Bắc).pt")
        ditto -x -k "$TMP/vieneu.zip" "$TMP/vieneu"
        mkdir -p "$VN_DIR"
        cp -R "$TMP/vieneu/VieNeu-TTS-$VIENEU_COMMIT/." "$VN_DIR/"
    fi
    # The patch frees a stream slot left behind when the viewer seeks (else every later request 429s)
    cp "$SRC/vieneu/openai_speech.py" "$VN_DIR/apps/openai_speech.py"

    say "Đang cài thư viện cho VieNeu (lần đầu vài phút)..."
    (cd "$VN_DIR" && "$UV" sync --quiet) || die "uv sync không thành công. Xem thông báo ở trên."
    printf '%s' "$VIENEU_COMMIT" > "$VN_DIR/$MARK"

    # The voice model (~600 MB), pinned and checked file by file (size + sha256): from this
    # project's GitHub release, else from Hugging Face at the pinned revision. A failure is not
    # fatal: without the marker the server fetches the model itself, as before, and the background
    # updater tries again.
    say "Đang tải mô hình giọng đã khóa phiên bản (lần đầu khoảng 600 MB, các lần sau chỉ kiểm tra)..."
    if ! "$VN_DIR/.venv/bin/python" "$EXT_DIR/tools/vieneu-pin.py" --install --vieneu "$VN_DIR" </dev/null; then
        if [[ -f "$VN_DIR/$PIN_MARK" ]]; then
            say "CẢNH BÁO: chưa tải được bản mô hình giọng mới. Giọng vẫn dùng bản đã khóa trước đó; bộ tự cập nhật sẽ thử lại sau."
        else
            say "CẢNH BÁO: chưa tải được mô hình giọng. Giọng vẫn chạy: VieNeu tự tải mô hình từ Hugging Face khi khởi động, và bộ tự cập nhật sẽ thử lại sau."
        fi
    fi
    if [[ -f "$VN_DIR/$PIN_MARK" ]]; then PINNED=1; fi

    cat > "$VN_DIR/cst-start.command" <<EOF
#!/bin/zsh
# Chạy tay máy chủ giọng VieNeu (khi chưa cài tự khởi động). Đóng cửa sổ này để tắt.
cd "$VN_DIR" || exit 1
export HOST=127.0.0.1 PORT=$PORT VIENEU_BACKEND=onnx VIENEU_DEVICE=cpu VIENEU_PRECISION=fp32
export VIENEU_QUEUE=4 VIENEU_QUEUE_TIMEOUT=20
# The pinned model, offline, only behind its marker and only while every file it lists is there at
# its size (tools/vieneu-pin.py; the same check as the service plist). POSIX sh, zsh alike.
pinned_ok() { [ -f $PIN_MARK ] || return 1; cat $PIN_MARK | ( n=0; while read -r k a b; do case "\$k" in ref) [ "\$(cat "models/hf/\$b" 2>/dev/null)" = "\$a" ] || exit 1;; size) [ "\$(stat -f%z "models/hf/\$b" 2>/dev/null)" = "\$a" ] || exit 1; n=\$((n+1));; esac; done; [ "\$n" -gt 0 ] ); }
if pinned_ok; then
    export HF_HOME="$VN_DIR/models/hf" HF_HUB_OFFLINE=1
    echo "VieNeu model: pinned copy in models/hf, offline"
elif [ -f $PIN_MARK ]; then
    echo "VieNeu model: pinned copy incomplete, fetched from Hugging Face"
fi
exec .venv/bin/python -m apps.openai_speech
EOF
    chmod +x "$VN_DIR/cst-start.command"

    if [[ -z "${DPD_NO_AUTOSTART:-}" ]]; then
        if [[ -f "$PLIST" ]] && ! service_is_ours; then
            die "Máy đã có một dịch vụ VieNeu khác ($PLIST). Bộ cài không ghi đè nó."
        fi
        say "Đang bật VieNeu tự chạy mỗi khi đăng nhập..."
        VIENEU_DIR="$VN_DIR" "$EXT_DIR/tools/vieneu-autostart.command" </dev/null >/dev/null \
            || die "Không bật được tự khởi động. Thử khởi động lại máy rồi chạy lại bộ cài."
        if [[ $PINNED == 1 ]]; then
            say "Đang đợi VieNeu sẵn sàng..."
        else
            say "Đang đợi VieNeu sẵn sàng (VieNeu phải tự tải mô hình giọng, có thể tới 10 phút)..."
        fi
        ok=0
        for i in $(seq 1 900); do
            if is_vieneu; then ok=1; break; fi
            if (( i % 30 == 0 )); then printf '  ... %s giây\n' "$i"; fi
            sleep 1
        done
        if [[ $ok == 1 ]]; then
            say "VieNeu đã sẵn sàng."
        else
            tail -25 "$VN_DIR/server.log" 2>/dev/null || true
            die "VieNeu chưa phản hồi sau 15 phút. Nhật ký: $VN_DIR/server.log"
        fi

        # Updates by themselves: staged in the background, laid over the extension while no browser
        # that loaded it is open (it reads the folder at its next start). See tools/dichphude-update.py.
        printf '%s' "$EXT_DIR" > "$VN_DIR/.dichphude-ext"
        cp "$EXT_DIR/tools/dichphude-update.py" "$VN_DIR/dichphude-update.py"
        if [[ -f "$UPD_PLIST" ]] && ! updater_is_ours; then
            say "Bỏ qua tự cập nhật: máy đã có $UPD_PLIST của một bản cài khác."
        else
            mkdir -p "$HOME/Library/LaunchAgents"
            updater_plist > "$UPD_PLIST"
            launchctl bootout "gui/$(id -u)/$UPD_LABEL" 2>/dev/null || true
            sleep 1
            launchctl bootstrap "gui/$(id -u)" "$UPD_PLIST" 2>/dev/null \
                || say "Chưa bật được tự cập nhật (sẽ bật ở lần chạy lại bộ cài)."
        fi
    fi
fi

# 4. A desktop launcher that updates by running this installer again: only where nothing updates by
# itself (no VieNeu, so no updater). Elsewhere one left by an older install goes.
if [[ $WITH_VOICE == 1 ]]; then
    rm -f "$UPD"
elif [[ -z "${DPD_NO_DESKTOP:-}" && -d "$HOME/Desktop" ]]; then
    cat > "$UPD" <<EOF
#!/bin/bash
curl -fsSL https://raw.githubusercontent.com/$REPO/main/install-mac.sh | bash
echo
read -n 1 -s -r -p "Xong. Nhấn phím bất kỳ để đóng cửa sổ."
EOF
    chmod +x "$UPD"
fi

# 5. The browser: a first install opens the step-by-step page (tools/huong-dan-cai-dat.html)
GUIDE="$EXT_DIR/tools/huong-dan-cai-dat.html"
NO_CHROMIUM=0
if [[ -z "${DPD_NO_OPEN:-}" && $UPDATE == 0 ]]; then
    printf '%s' "$EXT_DIR" | pbcopy 2>/dev/null || true
    if ! open_in_chromium "$GUIDE"; then
        NO_CHROMIUM=1
        open "$GUIDE" 2>/dev/null || true
    fi
fi

echo
echo "=================================================================="
if [[ $UPDATE == 1 ]]; then
    echo " ĐÃ CẬP NHẬT lên bản $VERSION. Thoát hẳn trình duyệt rồi mở lại là dùng bản mới"
    echo " (hoặc bấm Tải lại trên thẻ \"Vietnamese Subtitle Translator\" ở trang"
    echo " chrome://extensions). Đừng gỡ tiện ích rồi cài lại: sẽ mất cài đặt và khóa API."
else
    echo " ĐÃ CÀI bản $VERSION. Còn một bước làm bằng tay trong trình duyệt: làm theo"
    echo " trang hướng dẫn vừa mở (nếu chưa thấy, mở tệp này bằng Chrome, Cốc Cốc, Edge, Brave...):"
    echo "   $GUIDE"
    echo " Tóm tắt: chrome://extensions > bật Chế độ dành cho nhà phát triển >"
    echo " Tải tiện ích đã giải nén > chọn thư mục $EXT_DIR"
    if [[ $NO_CHROMIUM == 1 ]]; then
        echo " Máy chưa có trình duyệt nhân Chromium: cài Chrome (google.com/chrome) hoặc"
        echo " Cốc Cốc (coccoc.com) rồi mở tệp hướng dẫn ở trên bằng trình duyệt đó."
    fi
fi
if [[ $WITH_VOICE == 1 ]]; then
    echo " Giọng VieNeu tự chạy mỗi khi bật máy. Bản mới tự cài vào lần mở trình duyệt kế tiếp."
    if [[ $PINNED == 1 ]]; then
        echo " Mô hình giọng: bản đã khóa, kiểm từng tệp, chạy không cần mạng."
    else
        echo " Mô hình giọng: tạm tải từ Hugging Face khi chạy (bộ tự cập nhật sẽ thử khóa lại)."
    fi
else
    echo " Cập nhật về sau: nhấp đúp \"Cập nhật Dịch Phụ Đề\" trên màn hình chính."
fi
echo "=================================================================="
}

main "$@"

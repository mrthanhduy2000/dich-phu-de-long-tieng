#!/bin/bash
# Cài (hoặc cập nhật) tiện ích "Dịch Phụ Đề & Lồng Tiếng AI" và máy chủ giọng VieNeu trên macOS.
#   curl -fsSL https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-mac.sh | bash
# Chạy lại bất cứ lúc nào để cập nhật: cài đặt và khóa API trong Chrome được giữ nguyên.
#
# Overrides, for testing only: DPD_SRC (an unpacked share tree instead of the download),
# DPD_EXT_DIR, DPD_VIENEU_DIR, DPD_PORT, DPD_NO_AUTOSTART=1, DPD_NO_DESKTOP=1, DPD_NO_OPEN=1.
set -euo pipefail
# The whole body is one function, called on the last line: under `curl | bash` the script is read
# from stdin, and a child that reads stdin would otherwise swallow the rest of it.
main() {

REPO="mrthanhduy2000/dich-phu-de-long-tieng"
# VieNeu is pinned: vieneu/openai_speech.py is a patched copy of this exact commit's file.
VIENEU_COMMIT="d350c63fceb0792d7b2db9a51d61cc040b1f8efa"
EXT_DIR="${DPD_EXT_DIR:-$HOME/DichPhuDe}"
VN_DIR="${DPD_VIENEU_DIR:-$HOME/VieNeu-TTS}"
PORT="${DPD_PORT:-8000}"
MARK=".dichphude-vieneu"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nLỖI: %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == Darwin ]] || die "Tệp này dành cho macOS. Máy Windows dùng install-windows.ps1."
WITH_VOICE=1
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
    curl -fsSL "https://codeload.github.com/$REPO/zip/refs/heads/main" -o "$TMP/share.zip"
    ditto -x -k "$TMP/share.zip" "$TMP/share"
    SRC="$(find "$TMP/share" -mindepth 1 -maxdepth 1 -type d | head -1)"
fi
[[ -f "$SRC/extension/manifest.json" ]] || die "Bản tải về không có tiện ích (thiếu extension/manifest.json)."

# 2. Extension. Files are replaced inside the same folder: Chrome ties the extension's settings and
# the Gemini key to this exact path, so the folder itself must never move or be recreated elsewhere.
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

    UV="$(command -v uv || true)"
    [[ -z "$UV" && -x "$HOME/.local/bin/uv" ]] && UV="$HOME/.local/bin/uv"
    if [[ -z "$UV" ]]; then
        say "Đang cài uv (trình quản lý Python, không cần quyền quản trị)..."
        curl -LsSf https://astral.sh/uv/install.sh | env UV_NO_MODIFY_PATH=1 sh >/dev/null
        UV="$HOME/.local/bin/uv"
        [[ -x "$UV" ]] || die "Cài uv không thành công."
    fi

    if [[ "$(cat "$VN_DIR/$MARK" 2>/dev/null)" != "$VIENEU_COMMIT" ]]; then
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

    cat > "$VN_DIR/cst-start.command" <<EOF
#!/bin/zsh
# Chạy tay máy chủ giọng VieNeu (khi chưa cài tự khởi động). Đóng cửa sổ này để tắt.
cd "$VN_DIR" || exit 1
export HOST=127.0.0.1 PORT=$PORT VIENEU_BACKEND=onnx VIENEU_DEVICE=cpu VIENEU_PRECISION=fp32
export VIENEU_QUEUE=4 VIENEU_QUEUE_TIMEOUT=20
exec .venv/bin/python -m apps.openai_speech
EOF
    chmod +x "$VN_DIR/cst-start.command"

    if [[ -z "${DPD_NO_AUTOSTART:-}" ]]; then
        say "Đang bật VieNeu tự chạy mỗi khi đăng nhập..."
        VIENEU_DIR="$VN_DIR" "$EXT_DIR/tools/vieneu-autostart.command" >/dev/null || die "Không bật được tự khởi động. Thử khởi động lại máy rồi chạy lại bộ cài."
        say "Đang đợi VieNeu sẵn sàng (lần đầu phải tải mô hình giọng, có thể tới 10 phút)..."
        ok=0
        for i in $(seq 1 900); do
            if curl -s -m 2 "http://127.0.0.1:$PORT/health" >/dev/null; then ok=1; break; fi
            (( i % 30 == 0 )) && printf '  ... %s giây\n' "$i"
            sleep 1
        done
        if [[ $ok == 1 ]]; then
            say "VieNeu đã sẵn sàng."
        else
            tail -20 "$VN_DIR/server.log" 2>/dev/null || true
            die "VieNeu chưa phản hồi sau 15 phút. Nhật ký: $VN_DIR/server.log"
        fi
    fi
fi

# 4. A desktop launcher that updates by running this installer again
if [[ -z "${DPD_NO_DESKTOP:-}" && -d "$HOME/Desktop" ]]; then
    UPD="$HOME/Desktop/Cập nhật Dịch Phụ Đề.command"
    cat > "$UPD" <<EOF
#!/bin/bash
curl -fsSL https://raw.githubusercontent.com/$REPO/main/install-mac.sh | bash
echo
read -n 1 -s -r -p "Xong. Nhấn phím bất kỳ để đóng cửa sổ."
EOF
    chmod +x "$UPD"
fi

# 5. Chrome
if [[ -z "${DPD_NO_OPEN:-}" ]]; then
    printf '%s' "$EXT_DIR" | pbcopy 2>/dev/null || true
    open -a "Google Chrome" "chrome://extensions" 2>/dev/null || true
fi

echo
echo "=================================================================="
if [[ $UPDATE == 1 ]]; then
    echo " ĐÃ CẬP NHẬT lên bản $VERSION. Còn 2 bước:"
    echo "  1. Ở trang chrome://extensions, bấm nút Tải lại (mũi tên tròn) trên"
    echo "     thẻ \"Dịch Phụ Đề & Lồng Tiếng AI\"."
    echo "  2. Tải lại (F5) tab YouTube hay Coursera đang mở."
    echo "  Đừng gỡ tiện ích rồi cài lại: sẽ mất cài đặt và khóa API."
else
    echo " ĐÃ CÀI bản $VERSION. Bước cuối làm bằng tay trong Chrome:"
    echo "  1. Ở trang chrome://extensions (vừa mở), bật \"Chế độ dành cho nhà"
    echo "     phát triển\" ở góc trên bên phải."
    echo "  2. Bấm \"Tải tiện ích đã giải nén\"."
    echo "  3. Nhấn Cmd+Shift+G, dán (Cmd+V) đường dẫn đã chép sẵn, nhấn Enter,"
    echo "     rồi bấm Chọn:"
    echo "       $EXT_DIR"
    echo "  4. Mở Cài đặt của tiện ích và dán khóa Gemini API."
fi
if [[ $WITH_VOICE == 1 ]]; then
    echo " Giọng VieNeu tự chạy mỗi khi bật máy, không cần mở gì thêm."
fi
echo " Cập nhật về sau: nhấp đúp \"Cập nhật Dịch Phụ Đề\" trên màn hình chính."
echo "=================================================================="
}

main "$@"

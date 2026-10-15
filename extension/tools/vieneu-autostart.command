#!/bin/zsh
# Tự động hóa máy chủ giọng VieNeu: chạy ngay khi đăng nhập macOS và tự bật lại nếu bị tắt.
# Nhấp đúp tệp này để CÀI. Muốn gỡ: chạy trong Terminal:  ~/VieNeu-TTS/tools-vieneu-autostart.command --go
# (hoặc: launchctl bootout gui/$UID/com.damduy.vieneu && rm ~/Library/LaunchAgents/com.damduy.vieneu.plist)
set -e
LABEL="com.damduy.vieneu"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP="${VIENEU_DIR:-$HOME/VieNeu-TTS}"  # the share installer may point elsewhere

# --write-only: rewrite the plist and stop there; the running server keeps going and launchd reads
# the new file at the next login (tools/dichphude-update.py uses it to move an older install to the
# start command below without cutting a voice mid-sentence). VIENEU_DIR and HOME are honoured, so
# tests write the plist into a throwaway home.
WRITE_ONLY=0
[[ "$1" == "--write-only" ]] && WRITE_ONLY=1

if [[ "$1" == "--go" || "$1" == "--uninstall" ]]; then
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Đã gỡ tự khởi động VieNeu."
    exit 0
fi

if [[ ! -x "$APP/.venv/bin/python" ]]; then
    echo "Không tìm thấy $APP/.venv/bin/python. Hãy kiểm tra lại thư mục VieNeu-TTS."
    exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <!-- The pinned model (tools/vieneu-pin.py) is used only while its marker exists AND every
         file the marker lists is there at its size, with each refs/main on its revision, decided at
         every start (pinned_ok, about 20 stat and cat calls): HF_HOME + HF_HUB_OFFLINE, nothing
         fetched. A file deleted or cut short sends the server online instead of into a crash
         loop; without the marker VieNeu fetches the model itself, as before. \$0 is the Python
         path (the 4th string), kept whole in the plist so the installer recognises its own
         service. No ampersand or less-than sign in the line (XML), no double hyphen here. -->
    <key>ProgramArguments</key>
    <array>
        <string>/bin/sh</string>
        <string>-c</string>
        <string>pinned_ok() { [ -f models/hf/.pinned-ok ] || return 1; cat models/hf/.pinned-ok | ( n=0; while read -r k a b; do case "\$k" in ref) [ "\$(cat "models/hf/\$b" 2>/dev/null)" = "\$a" ] || exit 1;; size) [ "\$(stat -f%z "models/hf/\$b" 2>/dev/null)" = "\$a" ] || exit 1; n=\$((n+1));; esac; done; [ "\$n" -gt 0 ] ); }; if pinned_ok; then export HF_HOME="\$PWD/models/hf" HF_HUB_OFFLINE=1; echo "VieNeu model: pinned copy in models/hf, offline"; elif [ -f models/hf/.pinned-ok ]; then echo "VieNeu model: pinned copy incomplete, fetched from Hugging Face"; else echo "VieNeu model: no pinned copy, fetched from Hugging Face"; fi; exec "\$0" -m apps.openai_speech</string>
        <string>$APP/.venv/bin/python</string>
    </array>
    <key>WorkingDirectory</key><string>$APP</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOST</key><string>127.0.0.1</string>
        <key>PORT</key><string>8000</string>
        <key>VIENEU_BACKEND</key><string>onnx</string>
        <key>VIENEU_DEVICE</key><string>cpu</string>
        <key>VIENEU_PRECISION</key><string>fp32</string>
        <key>VIENEU_QUEUE</key><string>4</string>
        <key>VIENEU_QUEUE_TIMEOUT</key><string>20</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>10</integer>
    <!-- Interactive, KHÔNG phải Background: người xem đang chờ giọng đọc theo thời gian thực.
         Đo thật 23/09/2026 trên MacBook Air M3: để Background thì macOS hạ ưu tiên (pri 4, đẩy sang
         lõi tiết kiệm điện) và tạo 1 giây lời nói mất 1,07 giây; để Interactive thì khoảng 0,23. -->
    <key>ProcessType</key><string>Interactive</string>
    <key>StandardOutPath</key><string>$APP/server.log</string>
    <key>StandardErrorPath</key><string>$APP/server.log</string>
</dict>
</plist>
PLISTEOF
if [[ $WRITE_ONLY == 1 ]]; then
    echo "Đã ghi $PLIST (dùng từ lần đăng nhập sau)."
    exit 0
fi

# Gỡ bản đang nạp (nếu có) rồi CHỜ launchd gỡ xong hẳn. Chạy bootout và bootstrap liền nhau làm
# launchd trả "Bootstrap failed: 5: Input/output error" và bỏ dịch vụ ở trạng thái đã tắt (đo thật
# 23/09/2026: máy chủ giọng tắt hẳn sau lần cài đó).
if launchctl print "gui/$UID/$LABEL" > /dev/null 2>&1; then
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    for i in {1..15}; do
        launchctl print "gui/$UID/$LABEL" > /dev/null 2>&1 || break
        sleep 1
    done
fi
launchctl enable "gui/$UID/$LABEL" 2>/dev/null || true

nap_duoc=0
for i in {1..5}; do
    if launchctl bootstrap "gui/$UID" "$PLIST" 2>/tmp/vieneu-bootstrap.err; then nap_duoc=1; break; fi
    echo "Lần $i chưa nạp được ($(tr -d '\n' < /tmp/vieneu-bootstrap.err)), thử lại sau 2 giây..."
    sleep 2
done
if [[ $nap_duoc -ne 1 ]]; then
    echo ""
    echo "KHÔNG nạp được dịch vụ. Máy chủ giọng đang TẮT."
    echo "Cách dùng tạm ngay bây giờ: nhấp đúp ~/VieNeu-TTS/cst-start.command"
    echo "Rồi thử lại tệp này sau, hoặc khởi động lại máy."
    exit 1
fi
launchctl kickstart "gui/$UID/$LABEL" 2>/dev/null || true
echo "Đã cài. Máy chủ VieNeu sẽ tự chạy khi đăng nhập và tự bật lại nếu bị tắt."
for i in {1..40}; do
    if curl -s -m 2 http://127.0.0.1:8000/health > /dev/null; then echo "VieNeu đã sẵn sàng."; exit 0; fi
    sleep 1
done
echo "Chưa thấy phản hồi sau 40 giây, xem nhật ký: $APP/server.log"

#!/bin/zsh
# Tự động hóa máy chủ giọng VieNeu: chạy ngay khi đăng nhập macOS và tự bật lại nếu bị tắt.
# Nhấp đúp tệp này để CÀI. Muốn gỡ: chạy trong Terminal:  ~/VieNeu-TTS/tools-vieneu-autostart.command --go
# (hoặc: launchctl bootout gui/$UID/com.damduy.vieneu && rm ~/Library/LaunchAgents/com.damduy.vieneu.plist)
set -e
LABEL="com.damduy.vieneu"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP="${VIENEU_DIR:-$HOME/VieNeu-TTS}"  # the share installer may point elsewhere

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
    <key>ProgramArguments</key>
    <array>
        <string>$APP/.venv/bin/python</string>
        <string>-m</string>
        <string>apps.openai_speech</string>
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

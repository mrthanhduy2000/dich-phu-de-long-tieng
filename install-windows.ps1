# Cai (hoac cap nhat) tien ich "Dich Phu De & Long Tieng AI" va may chu giong VieNeu tren Windows.
#   irm https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-windows.ps1 | iex
# Chay lai bat cu luc nao de cap nhat: cai dat va khoa API trong Chrome duoc giu nguyen.
# Go bo:
#   $env:DPD_UNINSTALL='1'; irm https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-windows.ps1 | iex
#
# ASCII only on purpose: Windows PowerShell 5.1 reads a BOM-less script as ANSI. Everything sits in
# one script block that throws instead of calling exit, because `irm | iex` runs in the user's own
# window and exit would close it. Must stay Windows PowerShell 5.1 compatible (no ??, no ternary).
# The outcome is left in $global:DPD_RESULT ('ok' or the error) for the CI install test.
# Overrides, for testing only: DPD_SRC, DPD_EXT_DIR, DPD_VIENEU_DIR, DPD_NO_AUTOSTART,
# DPD_NO_DESKTOP, DPD_NO_OPEN.
& {
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # the 5.1 progress bar makes downloads many times slower
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$global:DPD_RESULT = 'running'

$Repo = 'mrthanhduy2000/dich-phu-de-long-tieng'
# VieNeu is pinned: vieneu\openai_speech.py is a patched copy of this exact commit's file.
$VieNeuCommit = 'd350c63fceb0792d7b2db9a51d61cc040b1f8efa'
$ExtDir = if ($env:DPD_EXT_DIR) { $env:DPD_EXT_DIR } else { Join-Path $env:USERPROFILE 'DichPhuDe' }
$VnDir = if ($env:DPD_VIENEU_DIR) { $env:DPD_VIENEU_DIR } else { Join-Path $env:USERPROFILE 'VieNeu-TTS' }
$Port = 8000                                # the extension calls 127.0.0.1:8000 (cost-policy.js)
$Mark = '.dichphude-vieneu'
$UpdLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Cap nhat Dich Phu De.lnk'

function Say($m) { Write-Host ''; Write-Host "==> $m" -ForegroundColor Cyan }

# What answers on the port: 'vieneu', 'other' (with a name), or $null
function Test-Port {
    try {
        $h = Invoke-RestMethod -UseBasicParsing "http://127.0.0.1:$Port/health" -TimeoutSec 3
        if ($h.status -eq 'ok' -and $h.sample_rate) { return 'vieneu' }
    } catch {}
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)" -ErrorAction SilentlyContinue
        if ($p -and $p.CommandLine -match 'run-vieneu|apps\.openai_speech') { return 'vieneu' }
        $n = if ($p) { $p.Name } else { "PID $($c.OwningProcess)" }
        return "other:$n"
    }
    return $null
}

function Invoke-Autostart($arg) {
    $env:VIENEU_DIR = $VnDir
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$ExtDir\tools\vieneu-autostart.ps1")
    if ($arg) { $a += $arg }
    & powershell @a | Out-Host
    return $LASTEXITCODE
}

try {
    # ---- Uninstall ----
    if ($env:DPD_UNINSTALL) {
        Say 'Dang go Dich Phu De va VieNeu...'
        # Only a VieNeu this installer made: someone's own VieNeu is left running
        if (Test-Path "$VnDir\$Mark") {
            if (Test-Path "$ExtDir\tools\vieneu-autostart.ps1") { Invoke-Autostart '-Uninstall' | Out-Null }
            Start-Sleep -Seconds 2
            Remove-Item $VnDir -Recurse -Force
            $hf = Join-Path $env:USERPROFILE '.cache\huggingface\hub'
            Get-ChildItem $hf -Directory -Filter 'models--pnnbao-ump--*' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
        } elseif (Test-Path $VnDir) { Write-Host "  Giu nguyen $VnDir (khong do bo cai nay tao)." }
        if (Test-Path "$ExtDir\manifest.json") { Remove-Item $ExtDir -Recurse -Force }
        Remove-Item $UpdLink -ErrorAction SilentlyContinue
        Write-Host ''
        Write-Host ' DA GO XONG. Con mot buoc: o trang chrome://extensions, bam "Xoa" tren the'
        Write-Host ' "Dich Phu De & Long Tieng AI".'
        $global:DPD_RESULT = 'ok'
        return
    }

    $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $withVoice = $arch -eq 'AMD64'
    if (-not $withVoice) { Say 'May chip ARM: VieNeu chi chay tren may Intel/AMD 64-bit. Chi cai phan dich phu de.' }

    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('dpd-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null

    # 1. Source
    if ($env:DPD_SRC) { $src = $env:DPD_SRC }
    else {
        Say 'Dang tai ban moi nhat...'
        Invoke-WebRequest -UseBasicParsing "https://codeload.github.com/$Repo/zip/refs/heads/main" -OutFile "$tmp\share.zip"
        Expand-Archive "$tmp\share.zip" -DestinationPath "$tmp\share"
        $src = (Get-ChildItem "$tmp\share" -Directory | Select-Object -First 1).FullName
    }
    if (-not (Test-Path "$src\extension\manifest.json")) { throw 'Ban tai ve khong co tien ich (thieu extension\manifest.json).' }

    # 2. Extension. Files are replaced inside the same folder: Chrome ties the extension's settings
    # and the Gemini key to this exact path.
    $update = $false
    if ((Test-Path $ExtDir) -and (Get-ChildItem $ExtDir -Force | Select-Object -First 1)) {
        if (-not (Test-Path "$ExtDir\manifest.json")) { throw "Thu muc $ExtDir da co tep khac, khong phai tien ich. Bo cai khong ghi de no." }
        $update = $true
    }
    Say "Dang chep tien ich vao $ExtDir"
    New-Item -ItemType Directory -Path $ExtDir -Force | Out-Null
    Get-ChildItem $ExtDir -Force | Remove-Item -Recurse -Force
    Copy-Item "$src\extension\*" $ExtDir -Recurse -Force
    $version = (Get-Content "$ExtDir\manifest.json" -Raw -Encoding UTF8 | ConvertFrom-Json).version

    # 3. VieNeu
    if ($withVoice) {
        if ((Test-Path $VnDir) -and -not (Test-Path "$VnDir\$Mark")) {
            throw "Thu muc $VnDir da co san nhung khong do bo cai nay tao. Bo cai khong ghi de no: doi ten thu muc do roi chay lai."
        }
        # A running server keeps its .pyd files locked, and uv sync would fail on them
        if (Test-Path "$VnDir\$Mark") { Invoke-Autostart '-Stop' | Out-Null; Start-Sleep -Seconds 2 }
        $busy = Test-Port
        if ($busy -like 'other:*') {
            throw ("Cong $Port dang bi chuong trinh khac dung (" + $busy.Substring(6) + "). Tien ich can cong nay cho VieNeu: " +
                   'tat chuong trinh do (hoac bo no khoi tu khoi dong) roi chay lai bo cai.')
        }

        $uv = (Get-Command uv -ErrorAction SilentlyContinue | Select-Object -First 1).Source
        if (-not $uv) {
            foreach ($c in @("$env:USERPROFILE\.local\bin\uv.exe", "$env:USERPROFILE\.cargo\bin\uv.exe")) { if (Test-Path $c) { $uv = $c; break } }
        }
        if (-not $uv) {
            Say 'Dang cai uv (trinh quan ly Python, khong can quyen quan tri)...'
            $env:UV_NO_MODIFY_PATH = '1'
            & powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex" | Out-Null
            $uv = "$env:USERPROFILE\.local\bin\uv.exe"
            if (-not (Test-Path $uv)) { throw 'Cai uv khong thanh cong.' }
        }

        $have = if (Test-Path "$VnDir\$Mark") { (Get-Content "$VnDir\$Mark" -Raw).Trim() } else { '' }
        if ($have -ne $VieNeuCommit) {
            Say 'Dang tai VieNeu-TTS...'
            Invoke-WebRequest -UseBasicParsing "https://codeload.github.com/pnnbao97/VieNeu-TTS/zip/$VieNeuCommit" -OutFile "$tmp\vieneu.zip"
            Expand-Archive "$tmp\vieneu.zip" -DestinationPath "$tmp\vieneu"
            New-Item -ItemType Directory -Path $VnDir -Force | Out-Null
            Copy-Item "$tmp\vieneu\VieNeu-TTS-$VieNeuCommit\*" $VnDir -Recurse -Force
        }
        # The patch frees a stream slot left behind when the viewer seeks (else every later request 429s)
        Copy-Item "$src\vieneu\openai_speech.py" "$VnDir\apps\openai_speech.py" -Force

        Say 'Dang cai thu vien cho VieNeu (lan dau vai phut)...'
        Push-Location $VnDir
        try { & $uv sync --quiet; $code = $LASTEXITCODE } finally { Pop-Location }
        if ($code -ne 0) { throw 'uv sync khong thanh cong. Xem thong bao o tren.' }

        # onnxruntime needs the Microsoft Visual C++ runtime, absent on some fresh Windows installs.
        # 5.1 turns redirected native stderr into errors, and 'Stop' would make them fatal.
        $testOrt = {
            $ErrorActionPreference = 'Continue'
            & "$VnDir\.venv\Scripts\python.exe" -c "import onnxruntime" 2>$null
            $LASTEXITCODE
        }
        if ((& $testOrt) -ne 0) {
            Say 'Dang cai Microsoft Visual C++ Redistributable (Windows se hoi quyen, bam Yes)...'
            Invoke-WebRequest -UseBasicParsing 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile "$tmp\vc_redist.x64.exe"
            try { Start-Process "$tmp\vc_redist.x64.exe" -ArgumentList '/install', '/passive', '/norestart' -Verb RunAs -Wait } catch {}
            if ((& $testOrt) -ne 0) {
                throw 'Thieu Microsoft Visual C++ Redistributable. Cai tai https://aka.ms/vs/17/release/vc_redist.x64.exe roi chay lai bo cai.'
            }
        }
        Set-Content -Path "$VnDir\$Mark" -Value $VieNeuCommit -NoNewline

        if (-not $env:DPD_NO_AUTOSTART) {
            Say 'Dang bat VieNeu tu chay moi khi dang nhap...'
            if ((Invoke-Autostart $null) -ne 0) { throw 'Khong bat duoc tu khoi dong VieNeu.' }
            Say 'Dang doi VieNeu san sang (lan dau phai tai mo hinh giong, co the toi 10 phut)...'
            $ok = $false
            for ($i = 1; $i -le 900; $i++) {
                if ((Test-Port) -eq 'vieneu') { try { Invoke-RestMethod -UseBasicParsing "http://127.0.0.1:$Port/health" -TimeoutSec 3 | Out-Null; $ok = $true; break } catch {} }
                if ($i % 30 -eq 0) { Write-Host "  ... $i giay" }
                Start-Sleep -Seconds 1
            }
            if (-not $ok) {
                Get-Content "$VnDir\server.log" -Tail 25 -ErrorAction SilentlyContinue | Out-Host
                throw "VieNeu chua phan hoi sau 15 phut. Nhat ky: $VnDir\server.log"
            }
            Say 'VieNeu da san sang.'
        }
    }

    # 4. A desktop shortcut that updates by running this installer again
    if (-not $env:DPD_NO_DESKTOP) {
        $shell = New-Object -ComObject WScript.Shell
        $lnk = $shell.CreateShortcut($UpdLink)
        $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -NoExit -Command `"irm https://raw.githubusercontent.com/$Repo/main/install-windows.ps1 | iex`""
        $lnk.Save()
    }

    # 5. Chrome
    if (-not $env:DPD_NO_OPEN) {
        try { Set-Clipboard -Value $ExtDir } catch {}
        try { Start-Process 'chrome.exe' 'chrome://extensions' } catch {}
    }

    Write-Host ''
    Write-Host '=================================================================='
    if ($update) {
        Write-Host " DA CAP NHAT len ban $version. Con 2 buoc:"
        Write-Host '  1. O trang chrome://extensions, bam nut Tai lai (mui ten tron) tren'
        Write-Host '     the "Dich Phu De & Long Tieng AI".'
        Write-Host '  2. Tai lai (F5) tab YouTube hay Coursera dang mo.'
        Write-Host '  Dung go tien ich roi cai lai: se mat cai dat va khoa API.'
    } else {
        Write-Host " DA CAI ban $version. Buoc cuoi lam bang tay trong Chrome:"
        Write-Host '  1. Mo trang chrome://extensions (neu chua tu mo), bat "Che do danh'
        Write-Host '     cho nha phat trien" o goc tren ben phai.'
        Write-Host '  2. Bam "Tai tien ich da giai nen".'
        Write-Host '  3. Dan (Ctrl+V) duong dan da chep san vao o dia chi cua cua so chon'
        Write-Host '     thu muc, nhan Enter, roi bam "Select Folder":'
        Write-Host "       $ExtDir"
        Write-Host '  4. Mo Cai dat cua tien ich va dan khoa Gemini API.'
    }
    if ($withVoice) { Write-Host ' Giong VieNeu tu chay moi khi bat may, khong can mo gi them.' }
    Write-Host ' Cap nhat ve sau: nhap dup "Cap nhat Dich Phu De" tren man hinh chinh.'
    Write-Host '=================================================================='
    $global:DPD_RESULT = 'ok'
}
catch {
    Write-Host ''
    Write-Host "LOI: $($_.Exception.Message)" -ForegroundColor Red
    $global:DPD_RESULT = "LOI: $($_.Exception.Message)"
}
finally {
    if ($tmp -and (Test-Path $tmp)) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
}

# Cai (hoac cap nhat) tien ich "Dich Phu De & Long Tieng AI" va may chu giong VieNeu tren Windows.
#   irm https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-windows.ps1 | iex
# Chay lai bat cu luc nao de cap nhat: cai dat va khoa API trong trinh duyet duoc giu nguyen.
# Go bo:
#   $env:DPD_UNINSTALL='1'; irm https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-windows.ps1 | iex
#
# ASCII only on purpose: Windows PowerShell 5.1 reads a BOM-less script as ANSI. Everything sits in
# one script block that throws instead of calling exit, because `irm | iex` runs in the user's own
# window and exit would close it. Must stay Windows PowerShell 5.1 compatible (no ??, no ternary).
# The outcome is left in $global:DPD_RESULT ('ok' or the error) for the CI install test.
# Overrides, for testing only: DPD_SRC, DPD_REF (a branch, tag or commit of the share repo to
# download instead of main: the install test sets the commit under test), DPD_EXT_DIR,
# DPD_VIENEU_DIR, DPD_NO_AUTOSTART, DPD_NO_DESKTOP, DPD_NO_OPEN.
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
# A .cmd, not a .lnk: WScript.Shell rejects paths outside the ANSI code page (a Vietnamese user name)
$UpdCmd = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Cap nhat Dich Phu De.cmd'
$OldUpdLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Cap nhat Dich Phu De.lnk'   # 2.4.9 to 2.5.0
# The pinned voice model lives inside the VieNeu folder; run-vieneu.pyw reads it offline only while
# this marker is there and every file it lists is whole (vieneu-pin.py writes it once every file
# is checked)
$PinMark = 'models\hf\.pinned-ok'

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

# The browser that shows the guide page: the default one when it is Chromium-based, else Chrome,
# Coc Coc, Brave, then Edge (always there on Windows 10/11). Firefox cannot run the extension.
function Get-ChromiumBrowser {
    $known = @('chrome.exe', 'msedge.exe', 'brave.exe', 'browser.exe', 'opera.exe', 'launcher.exe', 'vivaldi.exe', 'arc.exe')
    try {
        $prog = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice' -ErrorAction Stop).ProgId
        $cmd = (Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\$prog\shell\open\command" -ErrorAction Stop).'(default)'
        $exe = $null
        if ($cmd -match '^\s*"([^"]+)"') { $exe = $Matches[1] } elseif ($cmd -match '^\s*(\S+)') { $exe = $Matches[1] }
        if ($exe -and (Test-Path $exe) -and ($known -contains ([IO.Path]::GetFileName($exe).ToLower()))) { return $exe }
    } catch {}
    foreach ($n in @('chrome.exe', 'COCCOC', 'brave.exe', 'msedge.exe')) {
        if ($n -eq 'COCCOC') {
            foreach ($d in @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
                if ($d -and (Test-Path "$d\CocCoc\Browser\Application\browser.exe")) { return "$d\CocCoc\Browser\Application\browser.exe" }
            }
            continue
        }
        foreach ($root in @('HKCU:', 'HKLM:')) {
            try {
                $path = (Get-ItemProperty "$root\Software\Microsoft\Windows\CurrentVersion\App Paths\$n" -ErrorAction Stop).'(default)'
                if ($path -and (Test-Path $path)) { return $path }
            } catch {}
        }
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
            Remove-Item $VnDir -Recurse -Force      # the pinned model (models\hf) goes with it
            # Installs made before the pinned model left it in the Hugging Face cache
            $hf = Join-Path $env:USERPROFILE '.cache\huggingface\hub'
            foreach ($f in @('models--pnnbao-ump--*', 'models--OpenMOSS-Team--MOSS-Audio-Tokenizer-Nano-ONNX')) {
                Get-ChildItem $hf -Directory -Filter $f -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
            }
        } elseif (Test-Path $VnDir) { Write-Host "  Giu nguyen $VnDir (khong do bo cai nay tao)." }
        if (Test-Path "$ExtDir\manifest.json") { Remove-Item $ExtDir -Recurse -Force }
        Remove-Item $UpdCmd, $OldUpdLink -ErrorAction SilentlyContinue
        Write-Host ''
        Write-Host ' DA GO XONG. Con mot buoc: o trang Tien ich cua trinh duyet (chrome://extensions,'
        Write-Host ' Edge: edge://extensions), bam "Xoa" tren the "Vietnamese Subtitle Translator".'
        $global:DPD_RESULT = 'ok'
        return
    }

    $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $withVoice = $arch -eq 'AMD64'
    $pinned = $false
    if (-not $withVoice) { Say 'May chip ARM: VieNeu chi chay tren may Intel/AMD 64-bit. Chi cai phan dich phu de.' }

    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('dpd-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null

    # 1. Source
    if ($env:DPD_SRC) { $src = $env:DPD_SRC }
    else {
        Say 'Dang tai ban moi nhat...'
        $ref = if ($env:DPD_REF) { $env:DPD_REF } else { 'refs/heads/main' }
        Invoke-WebRequest -UseBasicParsing "https://codeload.github.com/$Repo/zip/$ref" -OutFile "$tmp\share.zip"
        Expand-Archive "$tmp\share.zip" -DestinationPath "$tmp\share"
        $src = (Get-ChildItem "$tmp\share" -Directory | Select-Object -First 1).FullName
    }
    if (-not (Test-Path "$src\extension\manifest.json")) { throw 'Ban tai ve khong co tien ich (thieu extension\manifest.json).' }

    # 2. Extension. Files are replaced inside the same folder: the browser ties the extension's
    # settings and the Gemini key to this exact path.
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

        # The voice model (~600 MB), pinned and checked file by file (size + sha256): from this
        # project's GitHub release, else from Hugging Face at the pinned revision. A failure is not
        # fatal: without the marker the server fetches the model itself, as before, and the
        # background updater tries again. Python prints everything on stdout; 'Continue' keeps 5.1
        # from turning a stray native stderr line into a fatal error. Write-Host, not Out-Host: the
        # install test captures it (6>&1) to see that a re-run downloads nothing.
        Say 'Dang tai mo hinh giong da khoa phien ban (lan dau khoang 600 MB, cac lan sau chi kiem tra)...'
        $pinCode = & {
            $ErrorActionPreference = 'Continue'
            & "$VnDir\.venv\Scripts\python.exe" "$ExtDir\tools\vieneu-pin.py" --install --vieneu $VnDir | ForEach-Object { Write-Host $_ }
            $LASTEXITCODE
        }
        $pinned = Test-Path (Join-Path $VnDir $PinMark)
        if ($pinCode -ne 0) {
            if ($pinned) { Say 'CANH BAO: chua tai duoc ban mo hinh giong moi. Giong van dung ban da khoa truoc do; bo tu cap nhat se thu lai sau.' }
            else { Say 'CANH BAO: chua tai duoc mo hinh giong. Giong van chay: VieNeu tu tai mo hinh tu Hugging Face khi khoi dong, va bo tu cap nhat se thu lai sau.' }
        }

        if (-not $env:DPD_NO_AUTOSTART) {
            Say 'Dang bat VieNeu tu chay moi khi dang nhap...'
            if ((Invoke-Autostart $null) -ne 0) { throw 'Khong bat duoc tu khoi dong VieNeu.' }
            if ($pinned) { Say 'Dang doi VieNeu san sang...' }
            else { Say 'Dang doi VieNeu san sang (VieNeu phai tu tai mo hinh giong, co the toi 10 phut)...' }
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

        # Updates by themselves: the run-vieneu.pyw supervisor runs dichphude-update.py every 30 min;
        # it stages a new version and lays it over the extension while no browser that loaded it is open.
        [IO.File]::WriteAllText("$VnDir\.dichphude-ext", $ExtDir, (New-Object Text.UTF8Encoding $false))
        Copy-Item "$ExtDir\tools\dichphude-update.py" "$VnDir\dichphude-update.py" -Force
    }

    # 4. A desktop file that updates by running this installer again: only where nothing updates by
    # itself (no VieNeu, so no updater). Elsewhere one left by an older install goes.
    if ($withVoice) { Remove-Item $UpdCmd, $OldUpdLink -ErrorAction SilentlyContinue }
    elseif (-not $env:DPD_NO_DESKTOP) {
        @('@echo off',
          "powershell -NoProfile -ExecutionPolicy Bypass -NoExit -Command `"irm https://raw.githubusercontent.com/$Repo/main/install-windows.ps1 | iex`"") |
            Set-Content -Path $UpdCmd -Encoding ASCII
        Remove-Item $OldUpdLink -ErrorAction SilentlyContinue
    }

    # 5. The browser: a first install opens the step-by-step page (tools\huong-dan-cai-dat.html)
    $guide = "$ExtDir\tools\huong-dan-cai-dat.html"
    $noChromium = $false
    if (-not $env:DPD_NO_OPEN -and -not $update) {
        try { Set-Clipboard -Value $ExtDir } catch {}
        $browser = Get-ChromiumBrowser
        if ($browser) {
            try { Start-Process $browser "`"$guide`"" } catch { try { Start-Process $guide } catch {} }
        } else {
            $noChromium = $true
            try { Start-Process $guide } catch {}
        }
    }

    Write-Host ''
    Write-Host '=================================================================='
    if ($update) {
        Write-Host " DA CAP NHAT len ban $version. Thoat han trinh duyet roi mo lai la dung ban moi"
        Write-Host ' (hoac bam Tai lai tren the "Vietnamese Subtitle Translator" o trang'
        Write-Host ' chrome://extensions). Dung go tien ich roi cai lai: se mat cai dat va khoa API.'
    } else {
        Write-Host " DA CAI ban $version. Con mot buoc lam bang tay trong trinh duyet: lam theo"
        Write-Host ' trang huong dan vua mo (neu chua thay, mo tep nay bang Chrome, Coc Coc, Edge, Brave...):'
        Write-Host "   $guide"
        Write-Host ' Tom tat: chrome://extensions (Edge: edge://extensions) > bat Che do danh cho nha'
        Write-Host " phat trien > Tai tien ich da giai nen > chon thu muc $ExtDir"
        if ($noChromium) {
            Write-Host ' May chua co trinh duyet nhan Chromium: cai Chrome (google.com/chrome) hoac'
            Write-Host ' Coc Coc (coccoc.com) roi mo tep huong dan o tren bang trinh duyet do.'
        }
    }
    if ($withVoice) {
        Write-Host ' Giong VieNeu tu chay moi khi bat may. Ban moi tu cai vao lan mo trinh duyet ke tiep.'
        if ($pinned) { Write-Host ' Mo hinh giong: ban da khoa, kiem tung tep, chay khong can mang.' }
        else { Write-Host ' Mo hinh giong: tam tai tu Hugging Face khi chay (bo tu cap nhat se thu khoa lai).' }
    }
    else { Write-Host ' Cap nhat ve sau: nhap dup "Cap nhat Dich Phu De" tren man hinh chinh.' }
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

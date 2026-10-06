# VieNeu voice server on Windows: start at sign-in, restart if it stops. The Windows twin of
# vieneu-autostart.command. No admin rights: a shortcut in the user's Startup folder runs a hidden
# PowerShell loop (run-vieneu.ps1, written into the VieNeu folder) that keeps the server alive.
# ASCII only on purpose: Windows PowerShell 5.1 reads a BOM-less .ps1 as ANSI and garbles Vietnamese.
#   powershell -ExecutionPolicy Bypass -File vieneu-autostart.ps1            install and start
#   powershell -ExecutionPolicy Bypass -File vieneu-autostart.ps1 -Stop      stop the server now
#   powershell -ExecutionPolicy Bypass -File vieneu-autostart.ps1 -Uninstall stop and remove
param([switch]$Stop, [switch]$Uninstall)
$ErrorActionPreference = 'Stop'

$App = if ($env:VIENEU_DIR) { $env:VIENEU_DIR } else { Join-Path $env:USERPROFILE 'VieNeu-TTS' }
$Port = if ($env:VIENEU_PORT) { $env:VIENEU_PORT } else { '8000' }
$Runner = Join-Path $App 'run-vieneu.ps1'
$Link = Join-Path ([Environment]::GetFolderPath('Startup')) 'VieNeu (Dich Phu De).lnk'

function Stop-VieNeu {
    # The runner first, or it restarts the server it just lost
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
        Where-Object { $_.CommandLine -like '*run-vieneu.ps1*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
        Where-Object { $_.CommandLine -like '*apps.openai_speech*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

if ($Stop -or $Uninstall) {
    Stop-VieNeu
    if ($Uninstall) { Remove-Item $Link -ErrorAction SilentlyContinue; Write-Host 'Da go tu khoi dong VieNeu.' }
    else { Write-Host 'Da tat VieNeu.' }
    return
}

$Py = Join-Path $App '.venv\Scripts\python.exe'
if (-not (Test-Path $Py)) { throw "Khong tim thay $Py. Hay chay lai bo cai." }

# The runner. Each start overwrites the two log files, so they never grow without end.
# AboveNormal priority: a voice that is generated too slowly arrives late on screen.
@"
`$ErrorActionPreference = 'Continue'
`$mutex = New-Object System.Threading.Mutex(`$false, 'Local\DichPhuDeVieNeu')
if (-not `$mutex.WaitOne(0)) { return }
Set-Location '$App'
`$env:HOST = '127.0.0.1'; `$env:PORT = '$Port'
`$env:VIENEU_BACKEND = 'onnx'; `$env:VIENEU_DEVICE = 'cpu'; `$env:VIENEU_PRECISION = 'fp32'
`$env:VIENEU_QUEUE = '4'; `$env:VIENEU_QUEUE_TIMEOUT = '20'
`$env:PYTHONIOENCODING = 'utf-8'
while (`$true) {
    `$p = Start-Process -FilePath '$Py' -ArgumentList '-m', 'apps.openai_speech' -NoNewWindow -PassThru ``
        -RedirectStandardOutput '$App\server.out.log' -RedirectStandardError '$App\server.log'
    try { `$p.PriorityClass = 'AboveNormal' } catch {}
    `$p.WaitForExit()
    Start-Sleep -Seconds 10
}
"@ | Set-Content -Path $Runner -Encoding UTF8  # with a BOM in 5.1: a Vietnamese user name in the path survives

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($Link)
$lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Runner`""
$lnk.WorkingDirectory = $App
$lnk.WindowStyle = 7
$lnk.Save()

# Restart so an update takes effect now, not at the next sign-in
Stop-VieNeu
Start-Sleep -Seconds 1
Start-Process -FilePath $lnk.TargetPath -ArgumentList $lnk.Arguments -WindowStyle Hidden
Write-Host 'Da cai. VieNeu se tu chay moi khi dang nhap Windows va tu bat lai neu bi tat.'

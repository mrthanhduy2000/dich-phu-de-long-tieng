# VieNeu voice server on Windows: start at sign-in, restart if it stops. The Windows twin of
# vieneu-autostart.command. No admin rights: a value under the user's Run key (Task Manager lists it
# under Startup apps) runs .venv\Scripts\pythonw.exe run-vieneu.pyw (copied from vieneu-runner.pyw
# next to this file), which keeps the server alive without any window. Not a Startup-folder shortcut:
# WScript.Shell rejects a target outside the ANSI code page, so a Vietnamese user name ("Dam" with
# its marks) failed there (CI, 2026-10-07); the registry takes any path.
# ASCII only on purpose: Windows PowerShell 5.1 reads a BOM-less .ps1 as ANSI and garbles Vietnamese.
#   powershell -ExecutionPolicy Bypass -File vieneu-autostart.ps1            install and start
#   powershell -ExecutionPolicy Bypass -File vieneu-autostart.ps1 -Stop      stop the server now
#   powershell -ExecutionPolicy Bypass -File vieneu-autostart.ps1 -Uninstall stop and remove
param([switch]$Stop, [switch]$Uninstall)
$ErrorActionPreference = 'Stop'

$App = if ($env:VIENEU_DIR) { $env:VIENEU_DIR } else { Join-Path $env:USERPROFILE 'VieNeu-TTS' }
$Runner = Join-Path $App 'run-vieneu.pyw'
$RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$RunName = 'DichPhuDe VieNeu'
$OldLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'VieNeu (Dich Phu De).lnk'   # 2.4.9 to 2.5.0

function Stop-VieNeu {
    # The supervisor first, or it restarts the server it just lost. Matched on the command line: a
    # venv launcher and the interpreter it starts both carry it. run-vieneu.ps1 is the 2.4.9 runner.
    # Only processes run from this VieNeu folder: someone's other VieNeu keeps running
    $all = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($App, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
    $supervisors = $all | Where-Object { $_.CommandLine -match 'run-vieneu\.ps1|run-vieneu\.pyw' -and $_.CommandLine -notmatch '--serve' }
    $servers = $all | Where-Object { $_.CommandLine -match 'run-vieneu\.pyw.*--serve|apps\.openai_speech' }
    foreach ($p in @($supervisors) + @($servers)) {
        if ($p) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    }
}

if ($Stop -or $Uninstall) {
    Stop-VieNeu
    if ($Uninstall) {
        Remove-ItemProperty -Path $RunKey -Name $RunName -ErrorAction SilentlyContinue
        Remove-Item $OldLink -ErrorAction SilentlyContinue
        Write-Host 'Da go tu khoi dong VieNeu.'
    }
    else { Write-Host 'Da tat VieNeu.' }
    return
}

$Pyw = Join-Path $App '.venv\Scripts\pythonw.exe'
if (-not (Test-Path $Pyw)) { throw "Khong tim thay $Pyw. Hay chay lai bo cai." }
Copy-Item (Join-Path $PSScriptRoot 'vieneu-runner.pyw') $Runner -Force
Remove-Item (Join-Path $App 'run-vieneu.ps1') -ErrorAction SilentlyContinue

if (-not (Test-Path $RunKey)) { New-Item -Path $RunKey -Force | Out-Null }
Set-ItemProperty -Path $RunKey -Name $RunName -Value "`"$Pyw`" `"$Runner`""
Remove-Item $OldLink -ErrorAction SilentlyContinue

# Restart so an update takes effect now, not at the next sign-in
Stop-VieNeu
Start-Sleep -Seconds 1
Start-Process -FilePath $Pyw -ArgumentList "`"$Runner`"" -WorkingDirectory $App
Write-Host 'Da cai. VieNeu se tu chay moi khi dang nhap Windows va tu bat lai neu bi tat.'

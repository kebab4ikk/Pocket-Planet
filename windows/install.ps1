# Pocket Planet for Windows: a new planet wallpaper every time you sign in or
# unlock the PC.
#
#   install.cmd             install (or update) and set a first planet
#   install.cmd -Uninstall  remove the scheduled task (your wallpaper stays)

param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$TaskName = 'Pocket Planet Wallpaper'
$Dir = Join-Path $env:LOCALAPPDATA 'PocketPlanet'

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host 'Pocket Planet removed. Pick a new wallpaper in Settings > Personalization.'
  return
}

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
  # PATH may be incomplete; look where the Node.js installer puts it.
  $node = @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe",
            "$env:LOCALAPPDATA\Programs\nodejs\node.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $node) {
  Write-Host 'Node.js is needed but is not installed.' -ForegroundColor Yellow
  Write-Host 'Install it with this command (or from nodejs.org), then run install.cmd again:'
  Write-Host '  winget install OpenJS.NodeJS.LTS'
  exit 1
}

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$script = Join-Path $Dir 'pocket-planet.cjs'
Copy-Item -Force (Join-Path $PSScriptRoot 'pocket-planet.cjs') $script

# wscript runs node with no window, so nothing flashes on screen at unlock.
$vbs = Join-Path $Dir 'run-hidden.vbs'
Set-Content -Path $vbs -Encoding Unicode -Value ('CreateObject("WScript.Shell").Run """' + $node + '"" ""' + $script + '""", 0, False')

$user = "$env:USERDOMAIN\$env:USERNAME"
$atLogOn = New-ScheduledTaskTrigger -AtLogOn -User $user
$cls = Get-CimClass -Namespace 'ROOT\Microsoft\Windows\TaskScheduler' -ClassName 'MSFT_TaskSessionStateChangeTrigger'
$onUnlock = New-CimInstance -CimClass $cls -ClientOnly
$onUnlock.StateChange = 8   # 8 = session unlock
$onUnlock.UserId = $user

$action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\wscript.exe') -Argument ('"' + $vbs + '"')
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Trigger @($atLogOn, $onUnlock) -Action $action `
  -Principal $principal -Settings $settings -Force `
  -Description 'Sets a new Pocket Planet desktop wallpaper at sign-in and unlock.' | Out-Null

Write-Host 'Making your first planet...'
& $node $script
if ($LASTEXITCODE -ne 0) { Write-Host "Something went wrong; see $Dir\log.txt" -ForegroundColor Yellow; exit 1 }
Write-Host ''
Write-Host 'Done! You get a new planet every time you sign in or unlock (Win+L to try it).' -ForegroundColor Green
Write-Host "Files are in $Dir"

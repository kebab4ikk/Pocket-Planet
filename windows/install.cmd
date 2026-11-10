@echo off
rem Double-click to install Pocket Planet. Add -Uninstall to remove it.
rem Full paths, so this works even when PATH doesn't include PowerShell.
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=pwsh.exe"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
pause

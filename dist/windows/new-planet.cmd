@echo off
rem Double-click for a new planet right now.
if exist "%LOCALAPPDATA%\PocketPlanet\run-hidden.vbs" (
  "%SystemRoot%\System32\wscript.exe" "%LOCALAPPDATA%\PocketPlanet\run-hidden.vbs"
) else (
  echo Run install.cmd first.
  pause
)

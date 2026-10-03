@echo off
rem Run the Windows workflow with either PowerShell 5.1 or a pwsh parent.
setlocal
set "PSModulePath="
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0rstudio.ps1" %*
exit /b %ERRORLEVEL%

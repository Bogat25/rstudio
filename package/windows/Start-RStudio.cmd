@echo off
setlocal DisableDelayedExpansion
set "RSTUDIO_ORIGINAL_TMPDIR=%TMPDIR%"
set "RSTUDIO_ORIGINAL_TMP=%TMP%"
set "RSTUDIO_ORIGINAL_TEMP=%TEMP%"
rem All paths follow the launcher, including when a USB drive letter changes.
set "R_HOME=%~dp0R"
set "RSTUDIO_WHICH_R=%~dp0R\bin\x64\R.exe"
set "PATH=%~dp0R\bin\x64;%PATH%"
set "R_USER=%~dp0work"
set "R_LIBS_USER=%~dp0work\library"
set "R_LIBS="
set "R_LIBS_SITE="
set "R_ENVIRON_USER=%~dp0work\.Renviron"
set "R_PROFILE_USER=%~dp0work\.Rprofile"
set "RSTUDIO_CONFIG_HOME=%~dp0work\config"
set "RSTUDIO_DATA_HOME=%~dp0work\data"
rem R refuses a temp path with spaces when Windows has no 8.3 alias.
rem Prefer portable scratch space; otherwise use a private app subdirectory
rem under an existing user temp location. No machine settings are changed.
set "RSTUDIO_TEMP_DIR="
call :selectTemp "%~dp0work\tmp"
if not defined RSTUDIO_TEMP_DIR if defined RSTUDIO_ORIGINAL_TMPDIR call :selectTemp "%RSTUDIO_ORIGINAL_TMPDIR%\RStudio"
if not defined RSTUDIO_TEMP_DIR if defined RSTUDIO_ORIGINAL_TMP call :selectTemp "%RSTUDIO_ORIGINAL_TMP%\RStudio"
if not defined RSTUDIO_TEMP_DIR if defined RSTUDIO_ORIGINAL_TEMP call :selectTemp "%RSTUDIO_ORIGINAL_TEMP%\RStudio"
if not defined RSTUDIO_TEMP_DIR if defined LOCALAPPDATA call :selectTemp "%LOCALAPPDATA%\Temp\RStudio"
if not defined RSTUDIO_TEMP_DIR (
    echo RStudio could not find a writable temporary folder without spaces. Set TEMP to such a folder and try again. 1>&2
    exit /b 1
)
set "TMPDIR=%RSTUDIO_TEMP_DIR%"
set "TMP=%RSTUDIO_TEMP_DIR%"
set "TEMP=%RSTUDIO_TEMP_DIR%"
set "ELECTRON_RUN_AS_NODE="
set "RSTUDIO_CPP_BUILD_OUTPUT="
for %%D in ("%R_USER%" "%R_LIBS_USER%" "%RSTUDIO_CONFIG_HOME%" "%RSTUDIO_DATA_HOME%" "%TMPDIR%" "%~dp0work\data\local-assistant\context") do if not exist "%%~D" mkdir "%%~D"
cd /d "%R_USER%"
start "" "%~dp0RStudio\rstudio.exe" "--user-data-dir=%~dp0work\data\web-cache" %*
exit /b %ERRORLEVEL%

:selectTemp
if not exist "%~1\." mkdir "%~1" >nul 2>&1
if not exist "%~1\." exit /b 0
for %%D in ("%~1") do set "RSTUDIO_TEMP_CANDIDATE=%%~fsD"
if not "%RSTUDIO_TEMP_CANDIDATE: =%"=="%RSTUDIO_TEMP_CANDIDATE%" exit /b 0
set "RSTUDIO_TEMP_PROBE=%RSTUDIO_TEMP_CANDIDATE%\.rstudio-write-%RANDOM%-%RANDOM%.tmp"
type nul >"%RSTUDIO_TEMP_PROBE%" 2>nul
if errorlevel 1 exit /b 0
del /q "%RSTUDIO_TEMP_PROBE%" >nul 2>&1
set "RSTUDIO_TEMP_DIR=%RSTUDIO_TEMP_CANDIDATE%"
exit /b 0

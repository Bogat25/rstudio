@echo off
setlocal
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
set "TMPDIR=%~dp0work\tmp"
set "TMP=%~dp0work\tmp"
set "TEMP=%~dp0work\tmp"
set "ELECTRON_RUN_AS_NODE="
set "RSTUDIO_CPP_BUILD_OUTPUT="
for %%D in ("%R_USER%" "%R_LIBS_USER%" "%RSTUDIO_CONFIG_HOME%" "%RSTUDIO_DATA_HOME%" "%TMPDIR%" "%~dp0work\data\local-assistant\context") do if not exist "%%~D" mkdir "%%~D"
cd /d "%R_USER%"
start "" "%~dp0RStudio\rstudio.exe" "--user-data-dir=%~dp0work\data\web-cache" %*
exit /b %ERRORLEVEL%

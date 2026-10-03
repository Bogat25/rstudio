; Same per-user Inno Setup workflow as the RGui fork. Built by rstudio installer.
#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif
#ifndef NumericVersion
  #define NumericVersion "0.0.0.0"
#endif
#ifndef StageDir
  #error Pass /DStageDir=<staged portable runtime>
#endif
#ifndef OutputDir
  #define OutputDir "."
#endif

[Setup]
; Stable and distinct from both upstream RStudio and RGui AI.
AppId={{3F51F797-68EC-44F4-9366-F3D5F22B306D}
AppName=RStudio AI
AppVersion={#AppVersion}
AppVerName=RStudio AI {#AppVersion}
AppPublisher=RStudio AI
AppComments=RStudio with a bundled R runtime and offline statistics assistant
VersionInfoVersion={#NumericVersion}
VersionInfoProductName=RStudio AI
PrivilegesRequired=lowest
DefaultDirName={autopf}\RStudio AI
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.18362
OutputDir={#OutputDir}
OutputBaseFilename=RStudio-AI-{#AppVersion}-setup
SetupIconFile=..\..\src\node\desktop\resources\icons\RStudio.ico
UninstallDisplayIcon={app}\RStudio\rstudio.exe
UninstallDisplayName=RStudio AI {#AppVersion}
LicenseFile={#StageDir}\RStudio\resources\app\COPYING
; The runtime includes Electron and Quarto; fast compression keeps local
; rebuilds practical while retaining the same LZMA2 installer format as RGui.
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes

[Tasks]
Name: desktopicon; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Work, settings, history and model files are never installation payloads.
Source: "{#StageDir}\RStudio\*"; DestDir: "{app}\RStudio"; Excludes: "\resources\app\bin\local-assistant\system_prompt.txt,\resources\app\bin\local-assistant\context\*"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\R\*"; DestDir: "{app}\R"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\Start-RStudio.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\RStudio\resources\app\bin\local-assistant\system_prompt.txt"; DestDir: "{app}\RStudio\resources\app\bin\local-assistant"; Flags: onlyifdoesntexist
Source: "{#StageDir}\RStudio\resources\app\bin\local-assistant\context\*"; DestDir: "{app}\RStudio\resources\app\bin\local-assistant\context"; Flags: onlyifdoesntexist recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\work\data\local-assistant\models"
Name: "{app}\work\data\local-assistant\context"

[UninstallDelete]
; Remove first-run downloads and scratch files; preserve coursework and settings.
Type: files; Name: "{app}\work\data\local-assistant\models\*.gguf"
Type: files; Name: "{app}\work\data\local-assistant\models\*.gguf.part"
Type: filesandordirs; Name: "{app}\work\tmp"

[Icons]
Name: "{autoprograms}\RStudio AI"; Filename: "{app}\Start-RStudio.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\RStudio\rstudio.exe"; Flags: runminimized
Name: "{autodesktop}\RStudio AI"; Filename: "{app}\Start-RStudio.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\RStudio\rstudio.exe"; Flags: runminimized; Tasks: desktopicon

[Run]
Filename: "{app}\Start-RStudio.cmd"; WorkingDir: "{app}"; Description: "Start RStudio now"; Flags: postinstall nowait skipifsilent runminimized shellexec

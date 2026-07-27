; Instalador Windows do "Etiquetas de Pedidos" - modo single-PC (sem rede).
; Este script e compilado pelo workflow do GitHub Actions
; (.github/workflows/build-windows-installer.yml), que primeiro baixa/monta
; a pasta build\ com os binarios portateis (Node.js, PostgreSQL, NSSM) e os
; artefatos compilados do backend/frontend. Nao ha nada para "baixar" aqui:
; o iscc.exe so empacota o que ja estiver em build\.

#define MyAppName "Etiquetas de Pedidos"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Etiquetas de Pedidos"

[Setup]
AppId={{4C6E9F2E-2C7B-4C3E-9C36-ETQPEDIDOS01}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\EtiquetasPedidos
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=EtiquetasPedidosSetup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
WizardStyle=modern
UninstallDisplayName={#MyAppName}
ChangesEnvironment=no

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: desktopicon; Description: "Criar atalho na area de trabalho"; GroupDescription: "Atalhos adicionais:"

[Files]
Source: "build\node\*"; DestDir: "{app}\node"; Flags: recursesubdirs ignoreversion
Source: "build\pgsql\*"; DestDir: "{app}\pgsql"; Flags: recursesubdirs ignoreversion
Source: "build\nssm\*"; DestDir: "{app}\nssm"; Flags: recursesubdirs ignoreversion
Source: "build\backend\*"; DestDir: "{app}\backend"; Flags: recursesubdirs ignoreversion
Source: "build\frontend\*"; DestDir: "{app}\frontend"; Flags: recursesubdirs ignoreversion
Source: "scripts\postinstall.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\preuninstall.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\abrir-sistema.cmd"; DestDir: "{app}\scripts"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\scripts\abrir-sistema.cmd"; IconFilename: "{app}\node\node.exe"; WorkingDir: "{app}\scripts"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\scripts\abrir-sistema.cmd"; IconFilename: "{app}\node\node.exe"; WorkingDir: "{app}\scripts"; Tasks: desktopicon

[Run]
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\postinstall.ps1"" -InstallDir ""{app}"""; \
    StatusMsg: "Configurando banco de dados e servicos (pode levar 1-2 minutos)..."; \
    Flags: runhidden waituntilterminated
Filename: "{app}\scripts\abrir-sistema.cmd"; Description: "Abrir {#MyAppName} no navegador"; Flags: postinstall skipifsilent nowait

[UninstallRun]
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\preuninstall.ps1"" -InstallDir ""{app}"""; \
    RunOnceId: "PararServicos"; \
    Flags: runhidden waituntilterminated

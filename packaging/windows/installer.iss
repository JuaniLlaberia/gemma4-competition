; GAFA — Windows Installer Script
; Compiled with Inno Setup 6.x
; Build:  iscc packaging\windows\installer.iss /DAppVersion=1.0.0

#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif

#define AppName      "GAFA"
#define AppPublisher "GAFA"
#define AppURL       "https://github.com/JuaniLlaberia/gemma4-competition"
#define AppExeName   "launcher.py"

[Setup]
AppId={{8F4A1C2E-3B5D-4F6A-9C0E-7D8B2A1F5E3C}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={userdocs}\{#AppName}
DefaultGroupName={#AppName}
OutputDir=Output
OutputBaseFilename=GAFA-Setup
SetupIconFile=..\..\packaging\assets\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=no
; Allow user-level install (no admin required)
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
; Download support
; (DownloadPage requires the itd_downl.dll which ships with Inno Setup 6.1+)

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
; uv binary (downloaded by CI before running iscc)
Source: "uv.exe";                                   DestDir: "{app}\bin";           Flags: ignoreversion
; Application source
Source: "..\..\src\*";                              DestDir: "{app}\app\src";       Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\__main__.py";                        DestDir: "{app}\app";           Flags: ignoreversion
Source: "..\..\server.py";                          DestDir: "{app}\app";           Flags: ignoreversion
; Requirements files
Source: "..\..\requirements-base.txt";              DestDir: "{app}";               Flags: ignoreversion
Source: "..\..\requirements-cpu.txt";               DestDir: "{app}";               Flags: ignoreversion
Source: "..\..\requirements-gpu.txt";               DestDir: "{app}";               Flags: ignoreversion
; Packaging scripts
Source: "..\..\packaging\launcher.py";              DestDir: "{app}";               Flags: ignoreversion
Source: "..\..\packaging\post-install.py";          DestDir: "{app}";               Flags: ignoreversion
; Assets (icon etc.)
Source: "..\..\packaging\assets\*";                 DestDir: "{app}\assets";        Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Start Menu shortcut (no console window — pythonw.exe)
Name: "{group}\{#AppName}";
  Filename: "{app}\.venv\Scripts\pythonw.exe";
  Parameters: """{app}\launcher.py""";
  IconFilename: "{app}\assets\icon.ico";
  WorkingDir: "{app}"
; Desktop shortcut (optional)
Name: "{commondesktop}\{#AppName}";
  Filename: "{app}\.venv\Scripts\pythonw.exe";
  Parameters: """{app}\launcher.py""";
  IconFilename: "{app}\assets\icon.ico";
  WorkingDir: "{app}";
  Tasks: desktopicon

[Run]
; 1. Install portable Python 3.12
Filename: "{app}\bin\uv.exe";
  Parameters: "python install 3.12 --install-dir ""{app}\python""";
  StatusMsg: "Installing Python 3.12...";
  Flags: waituntilterminated

; 2. Create virtual environment
Filename: "{app}\bin\uv.exe";
  Parameters: "venv ""{app}\.venv"" --python ""{app}\python\cpython-3.12*\python.exe""";
  StatusMsg: "Creating virtual environment...";
  Flags: waituntilterminated

; 3. Install Python packages
Filename: "{app}\bin\uv.exe";
  Parameters: "pip install -r ""{app}\requirements-{code:GetVariant}.txt"" --index-strategy unsafe-best-match --python ""{app}\.venv\Scripts\python.exe""";
  StatusMsg: "Installing packages (this may take several minutes)...";
  Flags: waituntilterminated

; 4. Post-install: Ollama check, model pull, docling models, .env
Filename: "{app}\.venv\Scripts\python.exe";
  Parameters: """{app}\post-install.py"" --install-dir ""{app}"" --save-dir ""{code:GetSaveDir}"" --model ""{code:GetModel}"" --variant ""{code:GetVariant}""";
  StatusMsg: "Pulling models and finalizing setup (this may take a while)...";
  Flags: waituntilterminated

[Code]
// ---------------------------------------------------------------------------
// Wizard page variables
// ---------------------------------------------------------------------------
var
  VariantPage: TInputOptionWizardPage;  // CPU vs GPU
  ModelPage: TInputQueryWizardPage;     // LLM model name
  SaveDirPage: TInputDirWizardPage;     // Save files directory

// ---------------------------------------------------------------------------
// Custom wizard pages
// ---------------------------------------------------------------------------
procedure InitializeWizard();
begin
  // Page 1: CPU vs GPU
  VariantPage := CreateInputOptionPage(
    wpSelectDir,
    'Choose Installation Variant',
    'Select whether to use CPU-only or GPU (NVIDIA CUDA) acceleration.',
    'Variant:',
    False,   // exclusive selection
    False    // no list box (radio buttons)
  );
  VariantPage.Add('CPU only (recommended — smaller download, works on any machine)');
  VariantPage.Add('GPU — NVIDIA CUDA 12.1 (larger download, requires NVIDIA GPU)');
  VariantPage.SelectedValueIndex := 0;

  // Page 2: LLM model name
  ModelPage := CreateInputQueryPage(
    VariantPage.ID,
    'LLM Model',
    'Enter the Ollama model name to use for fact-checking.',
    ''
  );
  ModelPage.Add('Model name (e.g. gemma4:e4b):', False);
  ModelPage.Values[0] := 'gemma4:e4b';

  // Page 3: Save files directory
  SaveDirPage := CreateInputDirPage(
    ModelPage.ID,
    'Save Files Directory',
    'Choose where GAFA will store its data files.',
    'Select the folder where GAFA will save your data:',
    False,
    ''
  );
  SaveDirPage.Add('');
  SaveDirPage.Values[0] := ExpandConstant('{app}\data');
end;

// ---------------------------------------------------------------------------
// Code callbacks used in [Run] Parameters
// ---------------------------------------------------------------------------
function GetVariant(Param: String): String;
begin
  if VariantPage.SelectedValueIndex = 1 then
    Result := 'gpu'
  else
    Result := 'cpu';
end;

function GetModel(Param: String): String;
begin
  Result := ModelPage.Values[0];
  if Result = '' then
    Result := 'gemma4:e4b';
end;

function GetSaveDir(Param: String): String;
begin
  Result := SaveDirPage.Values[0];
  if Result = '' then
    Result := ExpandConstant('{app}\data');
end;

// ---------------------------------------------------------------------------
// Ollama detection and install
// ---------------------------------------------------------------------------
function OllamaInstalled(): Boolean;
var
  ResultCode: Integer;
begin
  // Check the well-known install path first (may not be on PATH yet)
  if FileExists(ExpandConstant('{localappdata}\Programs\Ollama\ollama.exe')) then
  begin
    Result := True;
    Exit;
  end;
  // Try PATH-based check
  if Exec('cmd.exe', '/C ollama --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode)
     and (ResultCode = 0) then
  begin
    Result := True;
    Exit;
  end;
  Result := False;
end;

procedure CheckAndInstallOllama();
var
  ResultCode: Integer;
  OllamaSetupPath: String;
begin
  if OllamaInstalled() then
    Exit;

  // Download OllamaSetup.exe to the temp directory
  OllamaSetupPath := ExpandConstant('{tmp}\OllamaSetup.exe');

  if not DownloadTemporaryFile(
    'https://ollama.com/download/OllamaSetup.exe',
    'OllamaSetup.exe',
    '',    // no SHA256 hash check
    nil    // no progress callback needed; Inno shows its own progress bar
  ) then
  begin
    MsgBox(
      'Failed to download the Ollama installer.' + #13#10 +
      'Please install Ollama manually from https://ollama.com and re-run GAFA Setup.',
      mbError, MB_OK
    );
    Exit;
  end;

  MsgBox(
    'Ollama needs to be installed to run GAFA.' + #13#10 + #13#10 +
    'The Ollama installer will open now.' + #13#10 +
    'Please complete the Ollama setup, then click OK to continue.',
    mbInformation, MB_OK
  );

  Exec(OllamaSetupPath, '', '', SW_SHOW, ewWaitUntilTerminated, ResultCode);

  // post-install.py will poll localhost:11434 and wait before pulling models
end;

// Called by Inno Setup before the [Run] section executes
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    CheckAndInstallOllama();
end;

// ---------------------------------------------------------------------------
// Fallback: if pythonw.exe is missing, create a small VBS launcher instead
// ---------------------------------------------------------------------------
procedure CreateVbsFallback();
var
  VbsPath, Content: String;
begin
  VbsPath := ExpandConstant('{app}\launch_gafa.vbs');
  Content :=
    'Set WshShell = CreateObject("WScript.Shell")' + #13#10 +
    'WshShell.Run """' + ExpandConstant('{app}') + '\.venv\Scripts\python.exe"" ' +
    '"""' + ExpandConstant('{app}') + '\launcher.py""", 0, False' + #13#10;
  SaveStringToFile(VbsPath, Content, False);
end;

procedure CurStepChanged_CheckPythonW(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if not FileExists(ExpandConstant('{app}\.venv\Scripts\pythonw.exe')) then
    begin
      CreateVbsFallback();
      // Update shortcuts to use wscript.exe + the vbs instead
      // (Inno shortcuts are already written; nothing to update dynamically here.
      //  The VBS is available as a manual workaround if pythonw.exe is absent.)
    end;
  end;
end;

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
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
OutputDir=Output
OutputBaseFilename=GAFA-Setup
SetupIconFile=..\..\packaging\assets\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
; Start Menu page replaced with a Tasks checkbox (item 3)
DisableProgramGroupPage=yes
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "startmenuicon"; Description: "Create a &Start Menu shortcut"; GroupDescription: "Additional icons:"; Flags: checkedonce
Name: "desktopicon";   Description: "Create a &desktop shortcut";    GroupDescription: "Additional icons:"; Flags: unchecked

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
Name: "{group}\{#AppName}";      Filename: "{app}\.venv\Scripts\pythonw.exe"; Parameters: """{app}\launcher.py"""; IconFilename: "{app}\assets\icon.ico"; WorkingDir: "{app}"; Tasks: startmenuicon
Name: "{commondesktop}\{#AppName}"; Filename: "{app}\.venv\Scripts\pythonw.exe"; Parameters: """{app}\launcher.py"""; IconFilename: "{app}\assets\icon.ico"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
; 1. Install portable Python 3.12
Filename: "{app}\bin\uv.exe"; Parameters: "python install 3.12 --install-dir ""{app}\python"""; StatusMsg: "Installing Python 3.12..."; Flags: waituntilterminated
; 2. Create virtual environment
Filename: "{app}\bin\uv.exe"; Parameters: "venv ""{app}\.venv"" --python 3.12"; StatusMsg: "Creating virtual environment..."; Flags: waituntilterminated
; 3. Install Python packages
Filename: "{app}\bin\uv.exe"; Parameters: "pip install -r ""{app}\requirements-{code:GetVariant}.txt"" --index-strategy unsafe-best-match --python ""{app}\.venv\Scripts\python.exe"""; StatusMsg: "Installing packages (this may take several minutes)..."; Flags: waituntilterminated
; 4. Post-install: Ollama check, model pull, docling models, .env
Filename: "{app}\.venv\Scripts\python.exe"; Parameters: """{app}\post-install.py"" --install-dir ""{app}"" --save-dir ""{code:GetSaveDir}"" --model ""{code:GetModel}"" --variant ""{code:GetVariant}"""; StatusMsg: "Pulling models and finalizing setup (this may take a while)..."; Flags: waituntilterminated

[Code]
// ---------------------------------------------------------------------------
// Wizard page variables
// ---------------------------------------------------------------------------
var
  VariantPage: TInputOptionWizardPage;  // CPU vs GPU
  ModelPage: TInputQueryWizardPage;     // LLM model name
  SaveDirPage: TInputDirWizardPage;     // Save files directory
  LastAutoSaveDir: String;              // tracks the last auto-generated save dir default
  OllamaDownloadPage: TDownloadWizardPage;

// ---------------------------------------------------------------------------
// Custom wizard pages
// ---------------------------------------------------------------------------
procedure InitializeWizard();
begin
  // Page 1: CPU vs GPU — True = exclusive (radio buttons)
  VariantPage := CreateInputOptionPage(
    wpSelectDir,
    'Choose Installation Variant',
    'Select whether to use CPU-only or GPU (NVIDIA CUDA) acceleration.',
    'Variant:',
    True,    // exclusive = radio buttons
    False    // no list box
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
  LastAutoSaveDir := WizardDirValue() + '\data';
  SaveDirPage.Values[0] := LastAutoSaveDir;

  // Download page — used only if Ollama needs to be downloaded
  OllamaDownloadPage := CreateDownloadPage(
    'Downloading Ollama',
    'Ollama is required to run GAFA. Please wait while it downloads (~170 MB).',
    nil
  );
end;

// Update the save dir default when the user navigates to that page,
// but only if they haven't manually changed it from the auto-generated value.
procedure CurPageChanged(CurPageID: Integer);
var NewAutoDir: String;
begin
  if CurPageID = SaveDirPage.ID then
  begin
    NewAutoDir := WizardDirValue() + '\data';
    if SaveDirPage.Values[0] = LastAutoSaveDir then
    begin
      SaveDirPage.Values[0] := NewAutoDir;
      LastAutoSaveDir := NewAutoDir;
    end;
  end;
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
    Result := WizardDirValue() + '\data';
end;

// ---------------------------------------------------------------------------
// Ollama detection and install
// ---------------------------------------------------------------------------
function OllamaInstalled(): Boolean;
var
  ResultCode: Integer;
begin
  if FileExists(ExpandConstant('{localappdata}\Programs\Ollama\ollama.exe')) then
  begin
    Result := True;
    Exit;
  end;
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

  OllamaSetupPath := ExpandConstant('{tmp}\OllamaSetup.exe');

  OllamaDownloadPage.Clear;
  OllamaDownloadPage.Add('https://ollama.com/download/OllamaSetup.exe', 'OllamaSetup.exe', '');
  OllamaDownloadPage.Show;
  try
    try
      OllamaDownloadPage.Download;
    except
      MsgBox(
        'Failed to download the Ollama installer.' + #13#10 +
        'Please install Ollama manually from https://ollama.com and re-run GAFA Setup.',
        mbError, MB_OK
      );
      Exit;
    end;
  finally
    OllamaDownloadPage.Hide;
  end;

  MsgBox(
    'Ollama needs to be installed to run GAFA.' + #13#10 + #13#10 +
    'Click OK to launch the Ollama installer.' + #13#10 +
    'GAFA setup will continue automatically once Ollama is installed.',
    mbInformation, MB_OK
  );

  Exec(OllamaSetupPath, '', '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    CheckAndInstallOllama();
end;

// ---------------------------------------------------------------------------
// Uninstall: offer to remove Ollama and model data
// ---------------------------------------------------------------------------
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode, I: Integer;
  OllamaExe, UninstallerPath, ModelsPath, DisplayName: String;
  KeyNames: TArrayOfString;
begin
  if CurUninstallStep <> usPostUninstall then
    Exit;

  OllamaExe := ExpandConstant('{localappdata}\Programs\Ollama\ollama.exe');

  // Offer to remove downloaded model data
  if MsgBox(
    'Would you like to delete the Ollama model data downloaded by GAFA?' + #13#10 +
    '(This removes the models stored in %USERPROFILE%\.ollama\models)',
    mbConfirmation, MB_YESNO
  ) = IDYES then
  begin
    ModelsPath := ExpandConstant('{userappdata}\..\..\.ollama\models');
    if DirExists(ModelsPath) then
      DelTree(ModelsPath, True, True, True);
  end;

  // Offer to uninstall Ollama itself
  if FileExists(OllamaExe) then
  begin
    if MsgBox(
      'Would you like to uninstall Ollama as well?',
      mbConfirmation, MB_YESNO
    ) = IDYES then
    begin
      // Search HKCU uninstall keys by DisplayName — handles any GUID-based key name
      UninstallerPath := '';
      if RegGetSubkeyNames(HKCU,
        'Software\Microsoft\Windows\CurrentVersion\Uninstall', KeyNames) then
      begin
        for I := 0 to GetArrayLength(KeyNames) - 1 do
        begin
          RegQueryStringValue(HKCU,
            'Software\Microsoft\Windows\CurrentVersion\Uninstall\' + KeyNames[I],
            'DisplayName', DisplayName);
          if Pos('Ollama', DisplayName) > 0 then
          begin
            RegQueryStringValue(HKCU,
              'Software\Microsoft\Windows\CurrentVersion\Uninstall\' + KeyNames[I],
              'UninstallString', UninstallerPath);
            Break;
          end;
        end;
      end;

      // Strip surrounding quotes from the registry value before passing to Exec
      if (Length(UninstallerPath) > 1) and
         (UninstallerPath[1] = '"') and
         (UninstallerPath[Length(UninstallerPath)] = '"') then
        UninstallerPath := Copy(UninstallerPath, 2, Length(UninstallerPath) - 2);

      if (UninstallerPath <> '') and FileExists(UninstallerPath) then
        Exec(UninstallerPath, '/VERYSILENT', '', SW_SHOW, ewWaitUntilTerminated, ResultCode)
      else
        MsgBox(
          'Ollama uninstaller not found.' + #13#10 +
          'Please uninstall Ollama manually via Windows Settings > Apps.',
          mbInformation, MB_OK
        );
    end;
  end;
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

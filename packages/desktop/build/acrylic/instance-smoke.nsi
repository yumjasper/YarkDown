Unicode true
ManifestSupportedOS all
Name "YarkAcrylic repeat lifecycle test"
OutFile "${__FILEDIR__}\out\instance-smoke.exe"
RequestExecutionLevel user
!include "MUI2.nsh"
!include "LogicLib.nsh"
!addplugindir /x86-unicode "${__FILEDIR__}\plugins\x86-unicode"
Var TestWindow
Var Closed
Page custom ConfigPage
!insertmacro MUI_LANGUAGE "English"
Function .onInit
  YarkAcrylic::CheckInstallerInstance "YarkText-Isolated-Repeat-Smoke" "$(^SetupCaption)"
  Pop $0
  ${If} $0 != "1"
    Quit
  ${EndIf}
FunctionEnd
Function ConfigPage
  YarkAcrylic::InitSkinPage "" ""
  Pop $TestWindow
  YarkAcrylic::SetWindowSize $TestWindow 440 404
  YarkAcrylic::ShowPageItem $TestWindow "wizardTab" 0
  GetFunctionAddress $0 OnClose
  YarkAcrylic::BindCallBack $TestWindow "btnCancel" $0
  System::Call 'user32::ShowWindow(p $TestWindow, i 4)'
  System::Alloc 64
  Pop $1
  loop:
  System::Call 'user32::PeekMessage(p r1, p 0, i 0, i 0, i 1) i .r2'
  ${If} $2 != 0
    System::Call 'user32::TranslateMessage(p r1)'
    System::Call 'user32::DispatchMessage(p r1)'
    YarkAcrylic::ProcessCallbacks
    Pop $0
    ${If} $0 != 0
      Call $0
    ${EndIf}
  ${Else}
    Sleep 8
  ${EndIf}
  StrCmp $Closed 1 0 loop
  System::Free $1
  ; Exercise the GUI-unload fallback instead of explicit ExitDUISetup.
  Quit
FunctionEnd
Function OnClose
  StrCpy $Closed 1
FunctionEnd
Section
SectionEnd

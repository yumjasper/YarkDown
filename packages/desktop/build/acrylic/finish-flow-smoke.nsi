Unicode true
ManifestSupportedOS all
Name "YarkAcrylic finish flow test"
OutFile "${__FILEDIR__}\out\finish-flow-smoke.exe"
RequestExecutionLevel user
!include "MUI2.nsh"
!addplugindir /x86-unicode "${__FILEDIR__}\plugins\x86-unicode"
Var TestWindow
!define MUI_PAGE_CUSTOMFUNCTION_SHOW ProgressShow
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE ProgressLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section
  Sleep 2000
SectionEnd
Function ProgressShow
  YarkAcrylic::InitSkinPage "" ""
  Pop $TestWindow
  YarkAcrylic::SetWindowSize $TestWindow 440 300
  YarkAcrylic::ShowPageItem $TestWindow "wizardTab" 1
  System::Call 'user32::ShowWindow(p $TestWindow, i 4)'
  SetAutoClose true
FunctionEnd
Function ProgressLeave
  YarkAcrylic::ShowPageItem $TestWindow "wizardTab" 2
  System::Call 'user32::IsWindowVisible(p $TestWindow) i .r0'
  StrCmp $0 0 failed
  YarkAcrylic::ExitDUISetup $TestWindow
  SetErrorLevel 0
  Quit
  failed:
  YarkAcrylic::ExitDUISetup $TestWindow
  SetErrorLevel 1
  Quit
FunctionEnd

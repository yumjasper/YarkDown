Unicode true
ManifestSupportedOS all
Name "YarkAcrylic interface test"
OutFile "${__FILEDIR__}\out\nsis-smoke.exe"
RequestExecutionLevel user
SilentInstall silent
!addplugindir /x86-unicode "${__FILEDIR__}\plugins\x86-unicode"
Var TestWindow
Var Closed
Section
  YarkAcrylic::InitSkinPage "" ""
  Pop $TestWindow
  StrCmp $TestWindow 0 fail
  YarkAcrylic::SetWindowSize $TestWindow 440 404
  YarkAcrylic::ShowPageItem $TestWindow "wizardTab" 0
  YarkAcrylic::SetControlAttribute $TestWindow "editDir" "text" "D:\YarkText"
  YarkAcrylic::GetControlAttribute $TestWindow "editDir" "text"
  Pop $0
  StrCmp $0 "D:\YarkText" 0 fail
  GetFunctionAddress $0 OnClose
  YarkAcrylic::BindCallBack $TestWindow "btnCancel" $0
  System::Call 'user32::SendMessage(p $TestWindow, i 16, p 0, p 0)'
  StrCmp $Closed 1 fail
  YarkAcrylic::ProcessCallbacks
  Pop $0
  StrCmp $0 0 fail
  Call $0
  StrCmp $Closed 1 0 fail
  YarkAcrylic::ExitDUISetup $TestWindow
  SetErrorLevel 0
  Goto done
  fail:
    YarkAcrylic::ExitDUISetup $TestWindow
    SetErrorLevel 1
  done:
SectionEnd
Function OnClose
  YarkAcrylic::GetControlAttribute $TestWindow "editDir" "text"
  Pop $0
  StrCmp $0 "D:\YarkText" 0 callbackFail
  StrCpy $Closed 1
  Return
  callbackFail:
  StrCpy $Closed 2
FunctionEnd

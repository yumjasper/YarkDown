!macro ALLOW_ONLY_ONE_INSTALLER_INSTANCE
  YarkAcrylic::CheckInstallerInstance "${APP_GUID}" "$(^SetupCaption)"
  Pop $0
  ${If} $0 != "1"
    Quit
  ${EndIf}
!macroend

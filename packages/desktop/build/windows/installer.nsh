; installer.nsh — include via electron-builder's nsis.include

; Windows remembers an "Open with" choice as a UserChoice naming this ProgId,
; and that pin outlives any reinstall, so the name must stay as it is.
!define MT_PROGID "MarkText.Document"
!define YT_PDF_PROGID "YarkText.PDF"
!define YT_TEXT_PROGID "YarkText.Text"

!include nsDialogs.nsh
!include FileFunc.nsh
!ifndef BUILD_UNINSTALLER
Var YtInstallPdf
Var YtPdfCheckbox

!macro customInit
  StrCpy $YtInstallPdf 1
!macroend

!macro customPageAfterChangeDir
  Page custom YtPdfPage YtPdfPageLeave

Function YtPdfPage
  !insertmacro MUI_HEADER_TEXT "选择阅读组件" "Markdown 和 TXT 编辑器始终安装。"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateCheckbox} 0 12u 100% 16u "同时安装 PDF 阅读器（推荐）"
  Pop $YtPdfCheckbox
  ${NSD_SetState} $YtPdfCheckbox $YtInstallPdf
  ${NSD_CreateLabel} 0 36u 100% 42u "包含 PDF 阅读、多色标记、批注、目录和缩略图。取消勾选后，不保留 PDF 阅读组件文件，也不注册 PDF 打开方式。"
  Pop $0
  nsDialogs::Show
FunctionEnd

Function YtPdfPageLeave
  ${NSD_GetState} $YtPdfCheckbox $YtInstallPdf
FunctionEnd
!macroend
!endif

; PDF payloads are unpacked from ASAR so an editor-only installation can remove them without changing ASAR integrity.
!macro ytConfigurePdfComponent
  ${If} ${Silent}
    ClearErrors
    ReadRegDWORD $0 SHELL_CONTEXT "Software\YarkText" "PdfReaderInstalled"
    ${IfNot} ${Errors}
      StrCpy $YtInstallPdf $0
    ${EndIf}
  ${EndIf}
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/NOPDF" $1
  ${IfNot} ${Errors}
    StrCpy $YtInstallPdf 0
  ${EndIf}
  ClearErrors
  ${GetOptions} $0 "/PDF" $1
  ${IfNot} ${Errors}
    StrCpy $YtInstallPdf 1
  ${EndIf}
  WriteRegDWORD SHELL_CONTEXT "Software\YarkText" "PdfReaderInstalled" $YtInstallPdf
  ${If} $YtInstallPdf == 1
    Delete "$INSTDIR\resources\pdf-disabled"
    !insertmacro mtAssociateExtension ".pdf" "${YT_PDF_PROGID}"
    !insertmacro ytRegisterType "${YT_PDF_PROGID}" "YarkText PDF Document" "$INSTDIR\YarkText.exe,0"
  ${Else}
    FileOpen $0 "$INSTDIR\resources\pdf-disabled" w
    FileWrite $0 "PDF reader not installed"
    FileClose $0
    RMDir /r "$INSTDIR\resources\app.asar.unpacked\out\renderer\pdfjs"
    Delete "$INSTDIR\resources\app.asar.unpacked\out\renderer\assets\pdfReader-*"
    Delete "$INSTDIR\resources\app.asar.unpacked\out\renderer\assets\pdf_viewer-*"
    Delete "$INSTDIR\resources\app.asar.unpacked\out\renderer\assets\pdf.worker*"
    Delete "$INSTDIR\resources\app.asar.unpacked\out\main\pdfAnnotations*"
    RMDir /r "$INSTDIR\resources\app.asar.unpacked\node_modules\pdf-lib"
    RMDir /r "$INSTDIR\resources\app.asar.unpacked\node_modules\@pdf-lib"
    RMDir /r "$INSTDIR\resources\app.asar.unpacked\node_modules\pdfjs-dist"
    RMDir /r "$INSTDIR\resources\app.asar.unpacked\node_modules\@napi-rs\canvas"
    RMDir /r "$INSTDIR\resources\app.asar.unpacked\node_modules\@napi-rs\canvas-win32-x64-msvc"
    RMDir /r "$INSTDIR\resources\app.asar.unpacked\node_modules\@napi-rs\canvas-win32-arm64-msvc"
    !insertmacro mtUnassociateExtension ".pdf" "${YT_PDF_PROGID}"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\${YT_PDF_PROGID}"
    DeleteRegValue SHELL_CONTEXT "Software\Classes\Applications\YarkText.exe\SupportedTypes" ".pdf"
    DeleteRegValue SHELL_CONTEXT "Software\YarkText\Capabilities\FileAssociations" ".pdf"
  ${EndIf}
!macroend

;======================================================================
; Document candidates for Windows "Open with" and Default Apps.
;
; These must be written on every install and removed only on a real uninstall.
; electron-builder runs the previous version's uninstaller silently before it
; installs, so unregistering there unconditionally while registering only
; behind a prompt left any update or reinstall answered "No" with a UserChoice
; pointing at a ProgId that no longer existed, and Explorer's double-click did
; nothing at all (#4966).

; Only advertise candidates: Windows owns UserChoice and the existing default.
!macro mtAssociateExtension EXT PROGID
  WriteRegNone SHELL_CONTEXT "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\YarkText.exe\SupportedTypes" "${EXT}" ""
  WriteRegStr SHELL_CONTEXT "Software\YarkText\Capabilities\FileAssociations" "${EXT}" "${PROGID}"
!macroend

; The extension key also carries the OpenWithProgids entries of every other
; Markdown editor the user has installed, so only MarkText's own values go.
!macro mtUnassociateExtension EXT PROGID
  DeleteRegValue SHELL_CONTEXT "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}"
  Push $0
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\${EXT}" ""
  ${if} $0 == "${PROGID}"
    DeleteRegValue SHELL_CONTEXT "Software\Classes\${EXT}" ""
  ${endIf}
  Pop $0
!macroend

!macro ytRegisterType PROGID DESCRIPTION ICON
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PROGID}" "" "${DESCRIPTION}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PROGID}" "FriendlyAppName" "YarkText"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PROGID}\DefaultIcon" "" "${ICON}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PROGID}\shell\open\command" "" '$\"$INSTDIR\YarkText.exe$\" $\"%1$\"'
!macroend

;======================================================================
; customInstall macro is invoked by electron-builder after files are in $INSTDIR
!macro customInstall
  !insertmacro mtAssociateExtension ".md" "${MT_PROGID}"
  !insertmacro mtAssociateExtension ".markdown" "${MT_PROGID}"
  !insertmacro mtAssociateExtension ".mmd" "${MT_PROGID}"
  !insertmacro mtAssociateExtension ".mdown" "${MT_PROGID}"
  !insertmacro mtAssociateExtension ".mdtxt" "${MT_PROGID}"
  !insertmacro mtAssociateExtension ".mdtext" "${MT_PROGID}"
  !insertmacro mtAssociateExtension ".mdx" "${MT_PROGID}"
  !insertmacro ytConfigurePdfComponent
  !insertmacro mtAssociateExtension ".txt" "${YT_TEXT_PROGID}"

  !insertmacro ytRegisterType "${MT_PROGID}" "YarkText Markdown Document" "$INSTDIR\resources\icons\md.ico,0"
  !insertmacro ytRegisterType "${YT_TEXT_PROGID}" "YarkText Text Document" "$INSTDIR\YarkText.exe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\YarkText.exe" "FriendlyAppName" "YarkText"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\YarkText.exe\DefaultIcon" "" "$INSTDIR\YarkText.exe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\YarkText.exe\shell\open\command" "" '$\"$INSTDIR\YarkText.exe$\" $\"%1$\"'
  WriteRegStr SHELL_CONTEXT "Software\YarkText\Capabilities" "ApplicationName" "YarkText"
  ${If} $YtInstallPdf == 1
    WriteRegStr SHELL_CONTEXT "Software\YarkText\Capabilities" "ApplicationDescription" "YarkText Markdown, Text and PDF"
  ${Else}
    WriteRegStr SHELL_CONTEXT "Software\YarkText\Capabilities" "ApplicationDescription" "YarkText Markdown and Text"
  ${EndIf}
  WriteRegStr SHELL_CONTEXT "Software\YarkText\Capabilities" "ApplicationIcon" "$INSTDIR\YarkText.exe,0"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "YarkText" "Software\YarkText\Capabilities"
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\App Paths\YarkText.exe" "" "$INSTDIR\YarkText.exe"
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\App Paths\YarkText.exe" "Path" "$INSTDIR"

  ; Explorer serves file types from a cache that a fresh install otherwise
  ; keeps until the next sign-in.
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

;======================================================================
; customUnInstall macro cleans up on uninstall
!macro customUnInstall
  ; An update reaches here through the old uninstaller, right before the new
  ; version registers the association again.
  ${ifNot} ${isUpdated}
    !insertmacro mtUnassociateExtension ".md" "${MT_PROGID}"
    !insertmacro mtUnassociateExtension ".markdown" "${MT_PROGID}"
    !insertmacro mtUnassociateExtension ".mmd" "${MT_PROGID}"
    !insertmacro mtUnassociateExtension ".mdown" "${MT_PROGID}"
    !insertmacro mtUnassociateExtension ".mdtxt" "${MT_PROGID}"
    !insertmacro mtUnassociateExtension ".mdtext" "${MT_PROGID}"
    !insertmacro mtUnassociateExtension ".mdx" "${MT_PROGID}"
    !insertmacro mtUnassociateExtension ".pdf" "${YT_PDF_PROGID}"
    !insertmacro mtUnassociateExtension ".txt" "${YT_TEXT_PROGID}"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\${MT_PROGID}"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\${YT_PDF_PROGID}"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\${YT_TEXT_PROGID}"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\YarkText.exe"
    DeleteRegKey SHELL_CONTEXT "Software\YarkText\Capabilities"
    DeleteRegValue SHELL_CONTEXT "Software\YarkText" "PdfReaderInstalled"
    DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "YarkText"
    DeleteRegKey SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\App Paths\YarkText.exe"
    System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
  ${endIf}

  MessageBox MB_YESNO "Do you want to delete user settings?" /SD IDNO IDNO SkipRemoval
    SetShellVarContext current
    RMDir /r "$APPDATA\YarkText"
  SkipRemoval:
!macroend

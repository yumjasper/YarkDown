; installer.nsh - include via electron-builder's nsis.include
;
; Two things happen here:
;   1. The wizard's pages come from installer-ui.nsh (branded welcome and
;      uninstall confirmation).
;   2. An upgrade that cannot complete the previous version's uninstaller is
;      recovered instead of aborted. electron-builder's stock handler turns any
;      non-zero exit of the old uninstaller into "uninstall failed" followed by
;      a hard Quit, which is what made an upgrade impossible once a previous
;      install was half-removed: a deleted uninstaller executable, leftovers in
;      HKLM from an older per-machine build, or a folder locked by a crashed
;      process.

; Windows remembers an "Open with" choice as a UserChoice naming this ProgId,
; and that pin outlives any reinstall, so the name must stay as it is.
!define MT_PROGID "MarkText.Document"
!define YT_PDF_PROGID "YarkText.PDF"
!define YT_TEXT_PROGID "YarkText.Text"

!include FileFunc.nsh
!include LogicLib.nsh

; Declared before the page include: NSIS resolves variable references when the
; function body is defined, and those bodies live in installer-ui.nsh. Only the
; installer pass references them, and an unused Var is a warning that
; electron-builder escalates to an error.
!ifndef BUILD_UNINSTALLER
  ; Seeded before the pages are shown, so the welcome page can display the
  ; registered choice without reading the registry itself.
  Var YtInstallPdf

  ; The previous install's folder, used to tell an upgrade-in-place from a
  ; stale registration.
  Var YtPreviousInstallDir

  Var YtRecoveredLeftovers
!endif

; The wizard is drawn by the nsNiuniuSkin Duilib plugin rather than by MUI.
; installer-ui.nsh still ships the restyled stock pages the uninstaller keeps,
; and it drops its own welcome/confirm pages while the flag below is set.
!define YT_SKIN_PAGES

!include "${BUILD_RESOURCES_DIR}\windows\installer-skin.nsh"
!include "${BUILD_RESOURCES_DIR}\windows\installer-ui.nsh"

!macro customHeader
  !macroundef ALLOW_ONLY_ONE_INSTALLER_INSTANCE
  !include "${BUILD_RESOURCES_DIR}\windows\installer-instance.nsh"
!macroend

!macro customInit
  ; Unpacked here rather than on the progress page: extracting a file prints its
  ; own status line, which would overwrite the row that page is showing.
  !insertmacro ytReserveWatermark

  StrCpy $YtInstallPdf 1
  StrCpy $YtPreviousInstallDir ""
  StrCpy $YtRecoveredLeftovers 0

  ClearErrors
  ReadRegDWORD $0 SHELL_CONTEXT "Software\YarkText" "PdfReaderInstalled"
  ${IfNot} ${Errors}
    StrCpy $YtInstallPdf $0
  ${EndIf}

  ReadRegStr $YtPreviousInstallDir HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $YtPreviousInstallDir == ""
    ReadRegStr $YtPreviousInstallDir HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}
!macroend

;======================================================================
; Leftover recovery

/**
 * Removes a registration whose folder no longer holds the executable, i.e. a
 * record the previous uninstaller left behind after it had already deleted the
 * files. Windows keeps showing such an entry in Apps & features, so the user
 * ends up trying to uninstall a program that is not there.
 */
!macro ytPruneStaleUninstallEntry ROOT_KEY
  Push $0
  ReadRegStr $0 ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 != ""
    ${IfNot} ${FileExists} "$0\${APP_EXECUTABLE_FILENAME}"
      DeleteRegKey ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}"
      DeleteRegKey ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}"
      DetailPrint "Cleared stale install record for $0"
    ${EndIf}
  ${EndIf}
  Pop $0
!macroend

/**
 * A per-user install left behind by an older build that installed for all
 * users. The old uninstaller runs elevated and writes to HKLM, so its HKLM
 * record survives while the new install owns HKCU; the duplicate then makes
 * both Apps & features and the next update act on the wrong one.
 */
!macro ytPruneForeignScopeEntry
  ${If} $installMode == "CurrentUser"
  ${AndIf} $YtPreviousInstallDir == ""
    Push $0
    ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $0 != ""
      ${IfNot} ${FileExists} "$0\${APP_EXECUTABLE_FILENAME}"
        DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY}"
        DeleteRegKey HKLM "${INSTALL_REGISTRY_KEY}"
        StrCpy $YtRecoveredLeftovers 1
        DetailPrint "Cleared stale per-machine registration for $0"
      ${EndIf}
    ${EndIf}
    Pop $0
  ${EndIf}
!macroend

/**
 * Deletes a folder whose uninstaller gave up. The folder name is checked
 * against the app's own folder name so a misread registry value cannot point
 * the delete at the user's documents; "$INSTDIR" itself is never touched
 * because the new files are being written there.
 */
!macro ytPurgeOrphanFolder FOLDER
  Push $0
  Push $1
  ${If} "${FOLDER}" != ""
  ${AndIf} "${FOLDER}" != "$INSTDIR"
  ${AndIf} ${FileExists} "${FOLDER}\*.*"
    ${GetFileName} "${FOLDER}" $0
    ${If} $0 == "${APP_FILENAME}"
      ${IfNot} ${FileExists} "${FOLDER}\${APP_EXECUTABLE_FILENAME}"
        DetailPrint "Removing leftovers in ${FOLDER}"
        SetOutPath $TEMP
        RMDir /r "${FOLDER}"
        StrCpy $YtRecoveredLeftovers 1
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Pop $1
  Pop $0
!macroend

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
  ; The payload is unpacked by this point, so the progress page can move past the
  ; file-writing step while the shell registration below runs.
  !insertmacro ytSkinStageRegistering

  !insertmacro ytPruneStaleUninstallEntry SHELL_CONTEXT
  !insertmacro ytPruneForeignScopeEntry
  !insertmacro ytPurgeOrphanFolder "$YtPreviousInstallDir"

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
; Old-version removal that cannot block the install.
;
; installUtil.nsh calls this *instead of* its own error branch, so a previous
; uninstaller that exits non-zero, or that has lost its executable, no longer
; turns into a modal error plus Quit. Whatever the stub managed to remove is
; finished here: the stale record goes, and the leftover folder is only
; deleted when it demonstrably still holds nothing worth keeping.
!macro customUnInstallCheck
  ${If} $R0 != 0
    DetailPrint "Previous uninstaller exited with $R0, recovering."
  ${EndIf}
  !insertmacro ytRecoverPreviousInstall SHELL_CONTEXT
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  ${If} $R0 != 0
    DetailPrint "Previous per-user uninstaller exited with $R0, recovering."
  ${EndIf}
  !insertmacro ytRecoverPreviousInstall HKEY_CURRENT_USER
  ClearErrors
!macroend

/**
 * Drops the registration for the old folder and deals with the folder itself.
 * Only ever runs before the new files are unpacked, so the folder cannot be
 * the one this installer is about to write into.
 */
!macro ytRecoverPreviousInstall ROOT_KEY
  Push $0
  ReadRegStr $0 ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 != ""
  ${AndIf} $0 != "$INSTDIR"
    ${GetFileName} "$0" $1
    ${If} $1 == "${APP_FILENAME}"
      SetOutPath $TEMP
      RMDir /r "$0"
      DetailPrint "Removed leftover folder $0"
      StrCpy $YtRecoveredLeftovers 1
    ${EndIf}
  ${EndIf}
  DeleteRegKey ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}"
  DeleteRegKey ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}"
  Pop $0
!macroend

;======================================================================
; customUnInstall macro cleans up on uninstall
!macro customUnInstall
  ; In the uninstaller pass electron-builder has no hook between the page
  ; declarations and the section, unlike the installer's customPageAfterChangeDir,
  ; so the styling runs from the section itself - the progress page is already on
  ; screen by then.
  Call un.YtStyleProgress

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

  ; The page's checkbox decides this now. A silent uninstall - the mode an
  ; update uses - never shows the page, so $un.YtKeepSettings keeps its
  ; "keep" default there and only an explicit --delete-app-data removes data.
  ${IfNot} ${isUpdated}
    ClearErrors
    ${GetParameters} $0
    ${GetOptions} $0 "--delete-app-data" $1
    ${If} ${Errors}
      ${If} $un.YtKeepSettings == 1
        DetailPrint "Keeping user settings."
      ${Else}
        SetShellVarContext current
        RMDir /r "$APPDATA\YarkText"
        RMDir /r "$APPDATA\marktext"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

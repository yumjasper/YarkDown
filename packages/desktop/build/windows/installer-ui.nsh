; installer-ui.nsh - branded pages of the Windows installer and uninstaller.
;
; Included by installer.nsh before electron-builder's own templates, so MUI has
; to be pulled in here for its header macro to exist; the later !include of
; MUI2.nsh is then a no-op because MUI2 guards itself with MUI_INCLUDED.
;
; MUI's stock pages cannot be restyled beyond bitmaps, and its welcome page
; leads with a wall of licence-style prose. The pages that carry the brand are
; therefore rebuilt on dialog 1044 - the layout MUI itself uses for the welcome
; page - so the dark plate lines up with the stock pages and the wizard does
; not change character between steps. Everything stays inside the logo's
; black/grey range and no GDI+ call is made, so the pages render the same on a
; clean Windows install.

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Artwork from scripts/generateInstallerArt.mjs, addressed through
; BUILD_RESOURCES_DIR so makensis resolves it from any working directory.
!define YT_ART_SIDEBAR "${BUILD_RESOURCES_DIR}\installerSidebar.bmp"
!define YT_ART_UNSIDEBAR "${BUILD_RESOURCES_DIR}\uninstallerSidebar.bmp"
!define YT_ART_HEADER "${BUILD_RESOURCES_DIR}\installerHeader.bmp"

!define YT_INK "0F0F11"
!define YT_MUTED "5B5B62"

; The wizard's own chrome: a white page with ink text. MUI reads these when the
; first page is inserted, which happens after this include.
!define MUI_BGCOLOR "FFFFFF"
!define MUI_TEXTCOLOR "0F0F11"

; electron-builder defines the header/plate paths itself whenever
; build/installerHeader.bmp, installerSidebar.bmp and uninstallerSidebar.bmp
; exist, so redefining them here would collide. These fallbacks only matter for
; an out-of-tree compile such as .tmp-shot/nsis-check/harness.nsi.
!ifndef MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_BITMAP "${YT_ART_HEADER}"
!endif
!ifndef MUI_WELCOMEFINISHPAGE_BITMAP
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${YT_ART_SIDEBAR}"
!endif
!ifndef MUI_UNWELCOMEFINISHPAGE_BITMAP
  !define MUI_UNWELCOMEFINISHPAGE_BITMAP "${YT_ART_UNSIDEBAR}"
!endif

; Finish page: MUI's own layout already matches the rest of the wizard (same
; plate, same spacing), so only the copy changes here. MUI names the finish
; page defines without a UN prefix even in the uninstaller - only the plate and
; the fallback strings it reads are prefixed - so the two passes need separate
; values rather than a MUI_UN* twin.
!ifdef BUILD_UNINSTALLER
  !define MUI_FINISHPAGE_TITLE "卸载完成"
  !define MUI_FINISHPAGE_TEXT "YarkText 已从这台电脑移除。$\r$\n$\r$\n你编辑过的文档仍保持在原位置，未被改动。"
!else
  !define MUI_FINISHPAGE_TITLE "安装完成"
  !define MUI_FINISHPAGE_TEXT "YarkText ${VERSION} 已就绪。$\r$\n$\r$\n双击任意 Markdown 文件即可开始写作；文件、主题与快捷键设置都保存在本机。"
  !define MUI_FINISHPAGE_RUN_TEXT "运行 YarkText"
!endif

; Stretches a plate into the page's 109x193 image control. Loading it unscaled
; would letterbox it against a white strip. The handle is handed back so the
; page can free it once the dialog is gone, as MUI does for its own plate.
!macro ytLoadPlate CONTROL HANDLE ART
  InitPluginsDir
  ${IfNot} ${FileExists} "$PLUGINSDIR\yarktext-plate.bmp"
    File /oname=$PLUGINSDIR\yarktext-plate.bmp "${ART}"
  ${EndIf}
  ${NSD_CreateBitmap} 0u 0u 109u 193u ""
  Pop ${CONTROL}
  ${NSD_SetStretchedImage} ${CONTROL} "$PLUGINSDIR\yarktext-plate.bmp" ${HANDLE}
!macroend

!ifndef BUILD_UNINSTALLER
Var YtPdfCheckbox
Var YtPlate
Var YtPlateImage

; $YtInstallPdf is seeded by customInit in installer.nsh, before any page runs.
!macro customWelcomePage
  Page custom YtWelcomePageCreate YtWelcomePageLeave
!macroend

Function YtWelcomePageCreate
  ; An update runs this installer with /S --updated, so the page is skipped.
  ; Detecting it from the command line keeps this include free of
  ; electron-builder's StdUtils plugin macros, which resolve at compile time
  ; against a plugin directory this script does not control.
  ${If} ${Silent}
    Abort
  ${EndIf}
  ClearErrors
  ${GetParameters} $R8
  ${GetOptions} $R8 "--updated" $R9
  ${IfNot} ${Errors}
    Abort
  ${EndIf}

  ; Dialog 1044 is MUI's full-window layout: it reaches over the header strip
  ; and the branding text, so both are hidden first, exactly as MUI does for
  ; its own welcome page.
  LockWindow on
  ShowWindow $mui.Branding.Background ${SW_HIDE}
  ShowWindow $mui.Branding.Text ${SW_HIDE}
  ShowWindow $mui.Header.Text ${SW_HIDE}
  ShowWindow $mui.Header.SubText ${SW_HIDE}
  ShowWindow $mui.Header.Image ${SW_HIDE}
  ShowWindow $mui.Line.Standard ${SW_HIDE}
  ShowWindow $mui.Line.FullWindow ${SW_NORMAL}
  LockWindow off

  nsDialogs::Create 1044
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  SetCtlColors $0 "" "${MUI_BGCOLOR}"

  !insertmacro ytLoadPlate $YtPlate $YtPlateImage "${YT_ART_SIDEBAR}"

  ; Title and version: the two things a welcome screen has to state.
  ${NSD_CreateLabel} 120u 10u 195u 18u "YarkText"
  Pop $0
  CreateFont $1 "$(^Font)" 15 700
  SendMessage $0 ${WM_SETFONT} $1 1
  SetCtlColors $0 "${YT_INK}" "${MUI_BGCOLOR}"

  ${NSD_CreateLabel} 120u 30u 195u 10u "版本 ${VERSION} · 免费开源"
  Pop $0
  CreateFont $1 "$(^Font)" 8 400
  SendMessage $0 ${WM_SETFONT} $1 1
  SetCtlColors $0 "${YT_MUTED}" "${MUI_BGCOLOR}"

  ${NSD_CreateLabel} 120u 50u 195u 30u "安装会注册 Markdown、TXT 与 PDF 的打开方式，并创建开始菜单快捷方式。现有文档与偏好设置不会被修改。"
  Pop $0
  SetCtlColors $0 "${YT_INK}" "${MUI_BGCOLOR}"

  ${NSD_CreateCheckbox} 120u 88u 195u 12u "同时安装 PDF 阅读器（推荐）"
  Pop $YtPdfCheckbox
  ${NSD_SetState} $YtPdfCheckbox $YtInstallPdf
  SetCtlColors $YtPdfCheckbox "${YT_INK}" "${MUI_BGCOLOR}"

  ${NSD_CreateLabel} 127u 100u 188u 26u "含多色标记、批注、目录与缩略图。取消勾选后只保留 Markdown 与 TXT 编辑，不占用 PDF 组件空间。"
  Pop $0
  CreateFont $1 "$(^Font)" 8 400
  SendMessage $0 ${WM_SETFONT} $1 1
  SetCtlColors $0 "${YT_MUTED}" "${MUI_BGCOLOR}"

  ${NSD_CreateLabel} 120u 134u 195u 10u "安装位置"
  Pop $0
  CreateFont $1 "$(^Font)" 8 700
  SendMessage $0 ${WM_SETFONT} $1 1
  SetCtlColors $0 "${YT_INK}" "${MUI_BGCOLOR}"

  ${NSD_CreateLabel} 120u 146u 195u 26u "$INSTDIR"
  Pop $0
  CreateFont $1 "$(^Font)" 8 400
  SendMessage $0 ${WM_SETFONT} $1 1
  SetCtlColors $0 "${YT_MUTED}" "${MUI_BGCOLOR}"

  ${NSD_CreateLabel} 120u 176u 195u 10u "下一步可以改用其他目录。"
  Pop $0
  CreateFont $1 "$(^Font)" 8 400
  SendMessage $0 ${WM_SETFONT} $1 1
  SetCtlColors $0 "${YT_MUTED}" "${MUI_BGCOLOR}"

  nsDialogs::Show

  LockWindow on
  ShowWindow $mui.Branding.Background ${SW_NORMAL}
  ShowWindow $mui.Branding.Text ${SW_NORMAL}
  ShowWindow $mui.Header.Text ${SW_NORMAL}
  ShowWindow $mui.Header.SubText ${SW_NORMAL}
  ShowWindow $mui.Header.Image ${SW_NORMAL}
  ShowWindow $mui.Line.Standard ${SW_NORMAL}
  ShowWindow $mui.Line.FullWindow ${SW_HIDE}
  LockWindow off

  ${NSD_FreeImage} $YtPlateImage
FunctionEnd

Function YtWelcomePageLeave
  ${NSD_GetState} $YtPdfCheckbox $YtInstallPdf
FunctionEnd
!endif

;======================================================================
; Uninstaller

!ifdef BUILD_UNINSTALLER
Var un.YtPlate
Var un.YtPlateImage
Var un.YtKeepSettings
Var un.YtKeepCheckbox

; A silent uninstall is what an update runs, and it never reaches the page, so
; the default must be the safe one: keep the user's settings.
!macro customUnInit
  StrCpy $un.YtKeepSettings 1
!macroend

; Replaces the stock "are you sure" dialog. The settings question moves from a
; modal raised during the file loop into this page, so nothing can block the
; uninstall half-way and the wording matches the installer.
!macro customUnWelcomePage
  UninstPage custom un.YtUnWelcomeCreate un.YtUnWelcomeLeave
!macroend

Function un.YtUnWelcomeCreate
  ; Dialog 1044 covers the header strip and branding text, so both are hidden
  ; first, exactly as MUI does for its own uninstall welcome page.
  LockWindow on
  ShowWindow $mui.Branding.Background ${SW_HIDE}
  ShowWindow $mui.Branding.Text ${SW_HIDE}
  ShowWindow $mui.Header.Text ${SW_HIDE}
  ShowWindow $mui.Header.SubText ${SW_HIDE}
  ShowWindow $mui.Header.Image ${SW_HIDE}
  ShowWindow $mui.Line.Standard ${SW_HIDE}
  ShowWindow $mui.Line.FullWindow ${SW_NORMAL}
  LockWindow off

  nsDialogs::Create 1044
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  SetCtlColors $0 "" "${MUI_BGCOLOR}"

  !insertmacro ytLoadPlate $un.YtPlate $un.YtPlateImage "${YT_ART_UNSIDEBAR}"

  ${NSD_CreateLabel} 120u 10u 195u 18u "确认卸载"
  Pop $0
  CreateFont $1 "$(^Font)" 15 700
  SendMessage $0 ${WM_SETFONT} $1 1
  SetCtlColors $0 "${YT_INK}" "${MUI_BGCOLOR}"

  ${NSD_CreateLabel} 120u 30u 195u 10u "YarkText ${VERSION}"
  Pop $0
  CreateFont $1 "$(^Font)" 8 400
  SendMessage $0 ${WM_SETFONT} $1 1
  SetCtlColors $0 "${YT_MUTED}" "${MUI_BGCOLOR}"

  ${NSD_CreateLabel} 120u 50u 195u 30u "将移除程序文件、开始菜单与桌面快捷方式，以及已注册的文件打开方式。你的文档不会被触碰。"
  Pop $0
  SetCtlColors $0 "${YT_INK}" "${MUI_BGCOLOR}"

  ${NSD_CreateCheckbox} 120u 88u 195u 12u "保留设置与最近编辑记录"
  Pop $un.YtKeepCheckbox
  ${NSD_SetState} $un.YtKeepCheckbox $un.YtKeepSettings
  SetCtlColors $un.YtKeepCheckbox "${YT_INK}" "${MUI_BGCOLOR}"

  ${NSD_CreateLabel} 127u 100u 188u 26u "取消勾选会同时删除用户配置目录，主题、快捷键与会话记录将无法恢复。"
  Pop $0
  CreateFont $1 "$(^Font)" 8 400
  SendMessage $0 ${WM_SETFONT} $1 1
  SetCtlColors $0 "${YT_MUTED}" "${MUI_BGCOLOR}"

  ${NSD_CreateLabel} 120u 134u 195u 10u "配置目录"
  Pop $0
  CreateFont $1 "$(^Font)" 8 700
  SendMessage $0 ${WM_SETFONT} $1 1
  SetCtlColors $0 "${YT_INK}" "${MUI_BGCOLOR}"

  ${NSD_CreateLabel} 120u 146u 195u 26u "$APPDATA\YarkText"
  Pop $0
  CreateFont $1 "$(^Font)" 8 400
  SendMessage $0 ${WM_SETFONT} $1 1
  SetCtlColors $0 "${YT_MUTED}" "${MUI_BGCOLOR}"

  nsDialogs::Show

  LockWindow on
  ShowWindow $mui.Branding.Background ${SW_NORMAL}
  ShowWindow $mui.Branding.Text ${SW_NORMAL}
  ShowWindow $mui.Header.Text ${SW_NORMAL}
  ShowWindow $mui.Header.SubText ${SW_NORMAL}
  ShowWindow $mui.Header.Image ${SW_NORMAL}
  ShowWindow $mui.Line.Standard ${SW_NORMAL}
  ShowWindow $mui.Line.FullWindow ${SW_HIDE}
  LockWindow off

  ${NSD_FreeImage} $un.YtPlateImage
FunctionEnd

Function un.YtUnWelcomeLeave
  ; Stored as 1/0 so customUnInstall can test it without depending on the
  ; BST_ constants of the control it came from.
  ${NSD_GetState} $un.YtKeepCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $un.YtKeepSettings 1
  ${Else}
    StrCpy $un.YtKeepSettings 0
  ${EndIf}
FunctionEnd
!endif

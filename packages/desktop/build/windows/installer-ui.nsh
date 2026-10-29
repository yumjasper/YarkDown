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
!define YT_ART_WATERMARK "${BUILD_RESOURCES_DIR}\installerWatermark.bmp"

!define YT_INK "0F0F11"
!define YT_MUTED "5B5B62"

; The body of every stock page is filled with the brush stored in the shared
; #32770 window class, which NSIS cannot swap without disturbing the wizard's own
; layout. The header is matched to that same face instead of being left white: a
; white strip over a grey body was the seam that made the wizard look unjoined.
; scripts/generateInstallerArt.mjs paints the header bitmap with the same value.
!define MUI_BGCOLOR "F0F0F0"
!define MUI_TEXTCOLOR "0F0F11"

; COLORREF is 0x00BBGGRR, the reverse of the hex above. Written with an explicit
; 0x prefix because NSIS parses bare numbers as decimal, which would turn the
; value into an unrelated colour.
!define YT_INK_REF 0x00110F0F
!define YT_TRACK_REF 0x00E4E4E4

; Height of the restyled progress bar, in pixels, and the SetWindowPos flags
; that move and resize it without touching the z-order MUI assigned or stealing
; focus from the page. The classic renderer needs room for its own frame, so a
; 6px bar collapsed into an empty outline with no visible fill; a hairline has
; to be a little thicker than the frame it is drawn inside.
!ifndef YT_BAR_HEIGHT
  !define YT_BAR_HEIGHT 9
!endif
!define YT_SWP_KEEP 0x0014

; Watermark placed on the stock pages, sized in pixels to match the bitmap so a
; static control can blit it without scaling. WS_CHILD | WS_VISIBLE | SS_BITMAP.
!define YT_WATERMARK_SIZE 150
!define YT_WATERMARK_INSET 14
!define YT_WATERMARK_STYLE 0x5000000E

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

;======================================================================
; Progress page

/**
 * Unpacks the watermark once, during .onInit. It cannot happen later: the pages
 * greyscale their status line through DetailPrint, and the File instruction
 * prints its own extraction line, which would replace the "输出目录:" row the
 * user is looking at while the install runs.
 */
!macro ytReserveWatermark
  InitPluginsDir
  ${IfNot} ${FileExists} "$PLUGINSDIR\yt-mark.bmp"
    File /oname=$PLUGINSDIR\yt-mark.bmp "${YT_ART_WATERMARK}"
  ${EndIf}
!macroend

/**
 * Drops the watermark bitmap onto a stock page as a static image control.
 * A static control with SS_BITMAP needs LoadImage, because NSIS's own image
 * plugin would scale and centre the picture over the whole page instead of
 * anchoring it. The parent's client rect is read so the mark sits a fixed
 * distance from the bottom-right corner whatever the DPI scaling did to the
 * dialog's nominal size.
 */
!macro ytStampWatermark PAGE
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6

  System::Alloc 16
  Pop $6
  System::Call 'user32::GetClientRect(p ${PAGE}, p r6)'
  System::Call '*$6(i .r2, i .r3, i .r4, i .r5)'
  System::Free $6

  ; Bottom-right, inset from the page edges. The mark is 150px wide and the page
  ; is 313x193 logical pixels at 100%, so the offsets are taken from the far
  ; corner and cannot collide with the progress text at the top.
  IntOp $4 $4 - ${YT_WATERMARK_SIZE}
  IntOp $5 $5 - ${YT_WATERMARK_SIZE}
  IntOp $4 $4 - ${YT_WATERMARK_INSET}
  IntOp $5 $5 - ${YT_WATERMARK_INSET}

  ; WS_CHILD (0x40000000) | WS_VISIBLE (0x10000000) | SS_BITMAP (0x0E).
  System::Call 'user32::CreateWindowEx(i 0, w "Static", w "", i ${YT_WATERMARK_STYLE}, i r4, i r5, i ${YT_WATERMARK_SIZE}, i ${YT_WATERMARK_SIZE}, p ${PAGE}, p 0, p 0, p 0) p .r3'
  ${If} $3 != 0
    System::Call 'user32::LoadImage(p 0, t "$PLUGINSDIR\yt-mark.bmp", i ${IMAGE_BITMAP}, i 0, i 0, i ${LR_LOADFROMFILE}) p .r1'
    ${If} $1 != 0
      SendMessage $3 ${STM_SETIMAGE} ${IMAGE_BITMAP} $1
    ${EndIf}
  ${EndIf}

  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

; The stock bar is painted by the OS theme, which on Vista and later is the
; green accent that clashed with the black-and-grey plate. Dropping the theme
; from that one control reverts it to the classic renderer, the only state where
; PBM_SETBARCOLOR has any effect, and the bar is then flattened to a hairline.
;
; MUI declares its $mui.InstFilesPage* variables when the page macro expands,
; which is after this include, so the control is looked up at run time.
!macro ytStyleProgressBody
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $8
  Push $9

  FindWindow $0 "#32770" "" $HWNDPARENT
  ${If} $0 == 0
    Goto ytProgressDone
  ${EndIf}

  ; MUI's stock wording for this page repeats itself ("正在安装" above
  ; "YarkText 正在安装，请等候"), which reads as filler next to the branded
  ; header. Rewriting it here, from the page's own show callback, keeps the
  ; language-file strings untouched and works the same in both passes; MUI's
  ; later "finish" header still replaces this once the section ends.
  !ifdef BUILD_UNINSTALLER
    !insertmacro MUI_HEADER_TEXT "正在卸载 YarkText" "正在移除程序文件、快捷方式与文件关联，请稍候。"
  !else
    !insertmacro MUI_HEADER_TEXT "正在安装 YarkText ${VERSION}" "正在写入程序文件并注册文件关联，只需几秒。"
  !endif

  ; MUI_BGCOLOR does not reach the page body, so it is aligned here as well; a
  ; progress page in a different grey from the header would reintroduce the seam.
  SetCtlColors $0 "${YT_INK}" "${MUI_BGCOLOR}"
  GetDlgItem $2 $0 1006
  ${If} $2 != 0
    ; The status line is supporting copy, not a heading; at full ink it competed
    ; with the header's actual title.
    SetCtlColors $2 "${YT_MUTED}" "${MUI_BGCOLOR}"
  ${EndIf}

  ; The stock "show details" button is a dialog-era affordance that turns the
  ; page into a scrolling log. Nothing in this wizard needs it, and it is the one
  ; control that cannot be given any of the brand's styling.
  GetDlgItem $2 $0 1027
  ${If} $2 != 0
    ShowWindow $2 ${SW_HIDE}
  ${EndIf}

  ; The etched rule MUI draws under the header is two hard system colours
  ; (a grey line over a white one). Once the header and the body share a face
  ; that rule is the only thing still drawing a box around the top strip, and it
  ; reads as a leftover from the dialog era, so it goes and the two regions join.
  GetDlgItem $2 $HWNDPARENT 1035
  ${If} $2 != 0
    ShowWindow $2 ${SW_HIDE}
  ${EndIf}

  GetDlgItem $1 $0 1004
  ${If} $1 == 0
    Goto ytProgressDone
  ${EndIf}

  ; MUI gives the bar the full 15px of a stock dialog control, which reads as a
  ; slab next to 12px text. Only the height changes: the flag set keeps the
  ; z-order MUI computed, while the top edge is nudged down by half the removed
  ; band so the thinner bar stays centred in the slot it came from.
  ; GetWindowRect answers in screen coordinates and SetWindowPos expects the
  ; parent's client area, so the origin is mapped across before being reused.
  System::Alloc 16
  Pop $9
  System::Call 'user32::GetWindowRect(p r1, p r9)'
  System::Call '*$9(i .r2, i .r3, i .r4, i .r5)'
  System::Free $9
  IntOp $4 $4 - $2
  IntOp $9 $5 - $3

  System::Alloc 8
  Pop $8
  System::Call '*$8(i r2, i r3)'
  System::Call 'user32::MapWindowPoints(p 0, p r0, p r8, i 1)'
  System::Call '*$8(i .r2, i .r3)'
  System::Free $8

  IntOp $9 $9 - ${YT_BAR_HEIGHT}
  ${If} $9 > 1
    IntOp $9 $9 / 2
    IntOp $3 $3 + $9
  ${EndIf}

  System::Call 'uxtheme::SetWindowTheme(p r1, w "", w "") i'
  SendMessage $1 ${PBM_SETBKCOLOR} 0 ${YT_TRACK_REF}
  SendMessage $1 ${PBM_SETBARCOLOR} 0 ${YT_INK_REF}
  System::Call 'user32::SetWindowPos(p r1, p 0, i r2, i r3, i r4, i ${YT_BAR_HEIGHT}, i ${YT_SWP_KEEP})'

  ; The pages that carry a plate get their translucency from the bitmap, but
  ; this page has no plate: without it the brand dissolves into a bare grey
  ; dialog exactly where the user spends the longest. A still image is used
  ; rather than a painted gradient because NSIS cannot blend at run time.
  !insertmacro ytStampWatermark $0

  ytProgressDone:

  Pop $9
  Pop $8
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

; YtStyleProgress restyles the stock progress page. Both passes call it in the
; default build, but with the skin enabled only the uninstaller still shows that
; page, and NSIS escalates an unreferenced function to an error, so each pass gets
; exactly the entry point it uses.
!ifdef BUILD_UNINSTALLER
Function un.YtStyleProgress
  !insertmacro ytStyleProgressBody
FunctionEnd
!else
!ifndef YT_SKIN_PAGES
Function YtStyleProgress
  !insertmacro ytStyleProgressBody
FunctionEnd
!endif
!endif

; electron-builder expands this macro immediately before MUI_PAGE_INSTFILES, so
; the define is consumed by that page and by nothing else.
;
; YT_SKIN_PAGES hands the same slot to installer-skin.nsh, whose progress page
; replaces this one; YtStyleProgress stays because the uninstaller still runs on
; the stock progress page.
!ifndef BUILD_UNINSTALLER
!ifndef YT_SKIN_PAGES
  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW YtProgressPageShow
  !macroend

  Function YtProgressPageShow
    Call YtStyleProgress
  FunctionEnd
!endif
!endif

; YT_SKIN_PAGES is defined by installer.nsh before this file is included: the
; Duilib front end in installer-skin.nsh owns the welcome page and the uninstall
; confirmation, so the nsDialogs versions below are compiled out. Everything else
; here still applies in both modes - the header text, the plate bitmaps and the
; restyled stock progress page that the uninstaller keeps.
!ifndef BUILD_UNINSTALLER
!ifndef YT_SKIN_PAGES
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
!endif

;======================================================================
; Uninstaller

!ifdef BUILD_UNINSTALLER
; A silent uninstall is what an update runs, and it never reaches the page, so
; the default must be the safe one: keep the user's settings.
;
; $un.YtKeepSettings is declared by installer-skin.nsh, which is included before
; this file: NSIS resolves a $variable where a function body is parsed, and the
; skin page reads it long before this macro runs.
!macro customUnInit
  !insertmacro ytReserveWatermark
  StrCpy $un.YtKeepSettings 1
!macroend

; Replaces the stock "are you sure" dialog. The settings question moves from a
; modal raised during the file loop into this page, so nothing can block the
; uninstall half-way and the wording matches the installer.
;
; The variable and customUnInit stay unconditional: installer.nsh reads
; $un.YtKeepSettings from the uninstall section, and a silent run - the mode an
; update uses - never reaches either page, so its "keep" default has to be seeded
; without a page in the picture.
!ifndef YT_SKIN_PAGES
Var un.YtPlate
Var un.YtPlateImage
Var un.YtKeepCheckbox

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
!endif

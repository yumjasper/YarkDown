; installer-skin.nsh - nsNiuniuSkin (Duilib) front end for the Windows installer.
;
; The plugin owns one window whose pages are switched with ShowPageItem, and its
; ShowPage entry point runs a message loop that only ends by killing the process.
; That makes ShowPage unusable here: electron-builder's install section has to run
; between the last wizard page and the finish page, and killing the process would
; skip the registry work, the file associations and the uninstaller that the
; updater depends on.
;
; What is used instead is the plugin's non-blocking half: InitSkinPage returns a
; window, the caller shows it with ShowWindow, and every control is driven from
; NSIS with SetControlAttribute/GetControlAttribute. Clicking a button only fires
; a bound callback while a message loop is dispatching messages, so a page that
; waits for the user runs a small PeekMessage pump of its own.
;
; Repainting. SetControlAttribute only updates the plugin's own model; the window
; shows the new value the next time it lays out its page. Measured behaviour:
;
;   - ShowPageItem applies every pending write, so re-selecting the tab that is
;     already current is a complete refresh.
;   - A write made while the window is hidden is applied by ShowPageItem before
;     the window comes back, which is the only order that also works for the
;     progress page; re-selecting the current tab while it is visible does not
;     repaint there at all.
;   - No InvalidateRect/RedrawWindow/SetWindowPos combination substitutes for it,
;     and the plugin runs no internal timer that would pick the write up later.
;
; Hence ytSkinCommit below: hide, write, switch, show. Every dynamic change goes
; through it, which keeps one rule instead of a per-page special case. The price
; is that a value cannot be animated: each commit is a visible hide/show, so the
; progress page is stepped rather than smooth. The install spends most of its time
; inside one blocking Nsis7z::Extract call that exposes no progress callback, so
; there would be nothing to animate against anyway.
;
; Page model. The skin window is a full wizard in itself, so none of the stock
; MUI pages are ever shown. The skin's configuration page replaces the welcome
; page, the licence page and the directory page - the path is edited inside the
; skin, so allowToChangeInstallationDirectory is off and the folder name is
; appended here instead. The stock progress page is hidden behind the skin's own,
; and the skin's finish page replaces MUI's. The uninstaller uses the skin for the
; confirmation only: its progress and finish pages are already driven by the
; section, and the branded stock pages from installer-ui.nsh are good enough there.
;
; Colour scheme follows the app icons: ink #0F0F11, muted #5B5B62, paper #FFFFFF,
; with translucency baked into the hero bitmap, as the skin engine composites
; nothing at run time.

!include "LogicLib.nsh"
!include "FileFunc.nsh"

; electron-builder registers its own cached plugin directory and build/x86-unicode,
; neither of which is where this plugin lives, so the arch-named folder has to be
; declared here. The declaration must precede the first nsNiuniuSkin:: call, and
; this file is included from the generated script's header, before any page.
!addplugindir /x86-unicode "${BUILD_RESOURCES_DIR}\nsniuniu\plugins\x86-unicode"

; The licence text lives under nsniuniu/ rather than in build/: electron-builder
; looks for build/license.txt and would insert its own MUI licence page, which the
; skin already replaces.
;
; Encoding matters. InitSkinPage reads this file with the process ANSI code page
; (936 on a Chinese Windows) and hands the bytes straight to a RichEdit, with no
; UTF-8 detection in between, so the file has to be GBK. Stored as UTF-8, the
; Chinese prose arrives as "杞欢..." while the ASCII lines look fine, which is easy
; to misread as a font problem.
!define YT_SKIN_DIR "${BUILD_RESOURCES_DIR}\nsniuniu"
!define YT_SKIN_ZIP "${YT_SKIN_DIR}\skin.zip"
!define YT_SKIN_LICENSE "${YT_SKIN_DIR}\license.txt"
!define YT_SKIN_ICON "${YT_SKIN_DIR}\logo.ico"

; Tab order inside wizardTab. The uninstall pages follow the install ones because
; both passes share one install.xml.
!define YT_PAGE_CONFIG 0
!define YT_PAGE_INSTALLING 1
!define YT_PAGE_FINISH 2
!define YT_PAGE_UNCONFIG 3
!define YT_PAGE_UNINSTALLING 4
!define YT_PAGE_UNFINISH 5
; License is last so the six existing indices keep their meaning; adding it in the
; middle would renumber the uninstall pages and show the wrong one.
!define YT_PAGE_LICENSE 6

; Window size per page. The configuration page carries the version, the path, the
; PDF option and the licence row; the progress and finish pages need less, and
; shrinking them removes a band of empty white under the last control.
;
; These must equal the <Window size> in install.xml and the sum of the rows in the
; matching page file, because the plugin lays the page out at this size and the
; flexible <Control /> rows absorb the difference. Changing one without the others
; leaves either a clipped button or a band of blank plate at the bottom.
!define YT_SIZE_CONFIG_W 480
!define YT_SIZE_CONFIG_H 536
!define YT_SIZE_BRIEF_W 480
!define YT_SIZE_BRIEF_H 400

; SetWindowPos flags: move nothing, resize nothing, show the window. The insert
; position is HWND_TOP, not HWND_TOPMOST - a topmost installer would stay above
; every other window for the rest of the install.
!define YT_SWP_SHOW 0x0043

; The installer and the uninstaller are compiled separately, so one set of
; variables serves both; the un. functions read the same globals.
Var YtSkinHwnd
Var YtSkinMsg
Var YtSkinPumpTicks
Var YtSkinLeave

; Set by a cancel callback and acted on after the pump returns.
;
; Quit cannot run inside the callback itself: the plugin invokes the bound function
; from its own window procedure, and terminating the process from inside a message
; handler leaves the window on screen with the process still alive, which reads as
; a dead button. Setting the flag and quitting on the way out of the loop is the
; only arrangement that actually closes the installer.
Var YtSkinQuit

!ifndef BUILD_UNINSTALLER
Var YtSkinLaunchApp

; The path the user chose, kept out of $INSTDIR until the section runs:
; electron-builder's install-mode page rewrites $INSTDIR from the registry after
; this page has already returned.
Var YtChosenDir

; The licence page is a second view over the configuration page, so the view has
; to be restored when the user comes back from it. These carry the values across
; the page switch, because a page laid out from XML comes back blank.
Var YtPendingDir
Var YtPendingPdf
!endif

;======================================================================
; Shared helpers

/**
 * Unpacks the skin once per process. InitSkinPage reads the zip from this
 * directory, and the licence text is loaded from the same place, so both have to
 * be present before the window is created.
 *
 * The icon is renamed to logo.ico on purpose: the plugin looks that name up for
 * the taskbar and window icon and ignores anything else in the folder.
 */
!macro ytSkinPrepare
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  ${IfNot} ${FileExists} "$PLUGINSDIR\skin.zip"
    File /oname=$PLUGINSDIR\skin.zip "${YT_SKIN_ZIP}"
  ${EndIf}
  ${IfNot} ${FileExists} "$PLUGINSDIR\logo.ico"
    File /oname=$PLUGINSDIR\logo.ico "${YT_SKIN_ICON}"
  ${EndIf}
  ${IfNot} ${FileExists} "$PLUGINSDIR\license.txt"
    File /oname=$PLUGINSDIR\license.txt "${YT_SKIN_LICENSE}"
  ${EndIf}
!macroend

/**
 * Creates the plugin window and hides it; nothing is painted until the first commit.
 *
 * The glass pass and the icon both run once here rather than per page: they belong
 * to the HWND, not to any page, and re-applying them on every commit would make
 * the compositor rebuild the backdrop on each hide/show, which reads as a flicker.
 */
!macro ytSkinCreate HWND TITLE
  nsNiuniuSkin::InitSkinPage "$PLUGINSDIR\" "license.txt"
  Pop ${HWND}
  ${If} ${HWND} == 0
    Abort
  ${EndIf}
  nsNiuniuSkin::SetWindowTile ${HWND} "${TITLE}"
  !insertmacro ytSkinGlass ${HWND}
  !insertmacro ytSkinSetIcon ${HWND}
!macroend

/**
 * Applies every pending control write and puts the window back on screen.
 *
 * The hide/show pair is what makes a write take effect: the plugin lays a page
 * out on ShowPageItem and on show, and only a layout reads the model. The
 * foreground and z-order calls are needed because the window is a plain
 * top-level one - it has no owner to inherit activation from, so without them
 * the installer runs behind whatever the user had focused.
 *
 * SetWindowSize must not be used for a mid-run resize while the window is
 * visible: it lays out immediately and leaves the previous page's pixels behind.
 * Here it is always preceded by the hide, so the resize is invisible.
 */
!macro ytSkinCommit HWND PAGE WIDTH HEIGHT
  !insertmacro ytSkinLayout ${HWND} ${PAGE} ${WIDTH} ${HEIGHT}
  !insertmacro ytSkinPresent ${HWND}
!macroend

/**
 * The first half of a commit: hide, resize, and lay the page out from its XML.
 *
 * Split from ytSkinPresent because a page rebuilt from XML loses every value the
 * user already typed or ticked. Returning to the configuration page therefore has
 * to lay it out, write the saved values, and only then show it - a write issued
 * after the window is visible would not reach the screen until the next round trip.
 */
!macro ytSkinLayout HWND PAGE WIDTH HEIGHT
  System::Call 'user32::ShowWindow(p ${HWND}, i 0)'
  nsNiuniuSkin::SetWindowSize ${HWND} ${WIDTH} ${HEIGHT}
  nsNiuniuSkin::ShowPageItem ${HWND} "wizardTab" ${PAGE}
!macroend

/** The second half of a commit: put the laid-out window back on screen. */
!macro ytSkinPresent HWND
  System::Call 'user32::ShowWindow(p ${HWND}, i 5)'
  System::Call 'user32::SetForegroundWindow(p ${HWND})'
  System::Call 'user32::SetWindowPos(p ${HWND}, p 0, i 0, i 0, i 0, i 0, i ${YT_SWP_SHOW})'
!macroend

/**
 * Waits for the user while dispatching to the skin window.
 *
 * PeekMessage with PM_REMOVE (1) is what lets the plugin see the mouse messages
 * that drive its hover/press states and its bound callbacks; without the dispatch
 * the window paints but never reacts. Messages for other windows are translated
 * and dispatched too, so the wizard underneath keeps working.
 *
 * $YtSkinLeave is set by whichever callback means "this page is finished", which
 * is the only way out of the loop. Two safety nets end an otherwise hung run: a
 * closed window (the user pressed Alt+F4 instead of the close button) quits at
 * once, and the tick limit covers a page whose controls failed to bind.
 */
!macro ytSkinPump HWND LEAVE SUFFIX
  System::Alloc 64
  Pop $YtSkinMsg
  StrCpy $YtSkinPumpTicks 0
  StrCpy ${LEAVE} 0
  ; Must be initialised: an NSIS variable starts as an empty string, and an empty
  ; string compared against 0 is false, so an uninitialised flag would end the loop
  ; on the first tick and skip the page entirely.
  StrCpy $YtSkinQuit 0

  ytSkinPump${SUFFIX}:
    System::Call 'user32::PeekMessage(p $YtSkinMsg, p 0, i 0, i 0, i 1) i .r5'
    ${If} $5 != 0
      System::Call 'user32::TranslateMessage(p $YtSkinMsg)'
      System::Call 'user32::DispatchMessage(p $YtSkinMsg)'
    ${Else}
      System::Call 'user32::IsWindow(p ${HWND}) i .r6'
      ${If} $6 == 0
        System::Free $YtSkinMsg
        Quit
      ${EndIf}
      Sleep 8
    ${EndIf}

    ; Roughly ten minutes at an 8ms tick: long enough for a user to read the page,
    ; short enough that an unbound control still ends the installer.
    IntOp $YtSkinPumpTicks $YtSkinPumpTicks + 1
    ${If} $YtSkinPumpTicks > 75000
      MessageBox MB_OK|MB_ICONEXCLAMATION "界面无响应，安装已中止。"
      Quit
    ${EndIf}

    ${If} ${LEAVE} == 0
    ${AndIf} $YtSkinQuit == 0
      Goto ytSkinPump${SUFFIX}
    ${EndIf}
  System::Free $YtSkinMsg
!macroend

/**
 * Clears the remaining messages for the skin window after its callbacks have run.
 * Without this the queued WM_LBUTTONUP of the button just pressed is still
 * pending when the next page shows, and it lands on whatever control happens to
 * be under the cursor.
 */
!macro ytSkinFlush HWND SUFFIX
  System::Alloc 64
  Pop $YtSkinMsg
  ytSkinFlush${SUFFIX}:
    System::Call 'user32::PeekMessage(p $YtSkinMsg, p ${HWND}, i 0, i 0, i 1) i .r5'
    ${If} $5 != 0
      Goto ytSkinFlush${SUFFIX}
    ${EndIf}
  System::Free $YtSkinMsg
!macroend

/** Hides the skin window; the wizard takes over from here. */
!macro ytSkinHide HWND
  System::Call 'user32::ShowWindow(p ${HWND}, i 0)'
!macroend

/**
 * Hides the wizard the skin window is standing in for.
 *
 * NSIS shows its own wizard before the first page callback runs, so leaving it
 * visible would put an empty grey dialog behind the skin. It is hidden again on
 * every page change, because MUI re-shows it each time it activates a page.
 */
!macro ytSkinHideWizard
  System::Call 'user32::ShowWindow(p $HWNDPARENT, i 0)'
!macroend

/** Paints one progress step on the installing page. */
!macro ytSkinProgress HWND PERCENT TIP
  nsNiuniuSkin::SetControlAttribute ${HWND} "slrProgress" "value" "${PERCENT}"
  nsNiuniuSkin::SetControlAttribute ${HWND} "progress_pos" "text" "${PERCENT}%"
  nsNiuniuSkin::SetControlAttribute ${HWND} "progress_tip" "text" "${TIP}"
!macroend

/**
 * Makes the window translucent and rounds its corners.
 *
 * The plugin paints with GDI and every page background it draws is opaque, so
 * nothing inside its own rendering can be transparent: a `bkcolor` with an alpha
 * channel is flattened before it reaches the screen. The translucency therefore has
 * to come from the window style.
 *
 * WS_EX_LAYERED plus SetLayeredWindowAttributes applies a single alpha to the
 * composed window, which is the only mechanism that works on a GDI-painted surface:
 * UpdateLayeredWindow needs per-pixel premultiplied bitmaps the plugin never
 * produces.
 *
 * The alpha is deliberately high. Measured on this window, 242/255 gave a body-text
 * cell that composites to 243 against a bright desktop while the text itself lost
 * enough contrast to be hard to read, because the plugin anti-aliases its text into
 * the page fill rather than over a transparent surface - every extra percent of
 * transparency costs glyph edge contrast. 250 keeps the plate visibly tinted by the
 * desktop without thinning the text.
 *
 * ACCENT_ENABLE_ACRYLICBLURBEHIND is deliberately *not* used. Combined with a layered
 * window the accent policy and the window alpha compose twice, and the measured
 * result was body text at roughly half its intended contrast.
 *
 * DWMWA_WINDOW_CORNER_PREFERENCE (33) rounds the corners on Windows 11 and is
 * ignored earlier, which is fine - those systems get square corners as before.
 */
!macro ytSkinGlass HWND
  Push $7

  System::Call 'user32::GetWindowLong(p ${HWND}, i -20) i .r7'
  IntOp $7 $7 | 0x00080000
  System::Call 'user32::SetWindowLong(p ${HWND}, i -20, i r7)'
  ; LWA_ALPHA (2) with a zero colour key: the key only matters with LWA_COLORKEY,
  ; and enabling that would punch a hole wherever the page ink matches the key.
  System::Call 'user32::SetLayeredWindowAttributes(p ${HWND}, i 0, i 250, i 2)'

  System::Call 'dwmapi::DwmSetWindowAttribute(p ${HWND}, i 33, *i 2, i 4)'

  Pop $7
!macroend

/**
 * Replaces the taskbar and title-bar icon with the brand mark.
 *
 * The plugin looks for logo.ico in the plugin directory and picks it up on its
 * own, but the window class icon it installs is the generic one until a WM_SETICON
 * arrives, so the icon is set explicitly here as well.
 */
!macro ytSkinSetIcon HWND
  Push $7

  System::Call 'user32::LoadImage(p 0, t "$PLUGINSDIR\logo.ico", i 1, i 0, i 0, i 0x10) p .r7'
  ${If} $7 != 0
    System::Call 'user32::SendMessage(p ${HWND}, i 0x80, p 1, p r7)'
    System::Call 'user32::SendMessage(p ${HWND}, i 0x80, p 0, p r7)'
  ${EndIf}

  Pop $7
!macroend

/** Drops trailing backslashes so a hand-typed path never reads "$DIR\\". */
!macro ytSkinTrimSlash VAR
  Push $R4
  Push $R5
  ${Do}
    StrLen $R5 ${VAR}
    ${If} $R5 == 0
      ${ExitDo}
    ${EndIf}
    IntOp $R4 $R5 - 1
    StrCpy $R4 ${VAR} 1 $R4
    ${If} $R4 != "\"
      ${ExitDo}
    ${EndIf}
    StrCpy ${VAR} ${VAR} -1
  ${Loop}
  Pop $R5
  Pop $R4
!macroend

/**
 * Appends the app's own folder when the user picked a plain parent directory.
 *
 * The stock installer does this from instFilesPre, but that function only exists
 * while allowToChangeInstallationDirectory is on, and it is off here: MUI's
 * directory page is replaced by the path row inside the skin. Matching the stock
 * behaviour keeps an upgrade landing in the same folder as the previous version
 * even when the user typed the parent.
 */
!macro ytSkinEnsureAppFolder VAR
  Push $R4
  ${GetFileName} "${VAR}" $R4
  ${If} $R4 != "${APP_FILENAME}"
    StrCpy ${VAR} "${VAR}\${APP_FILENAME}"
  ${EndIf}
  Pop $R4
!macroend

;======================================================================
; Installer

!ifndef BUILD_UNINSTALLER

/**
 * Binds every control the configuration page reacts to.
 *
 * Each button needs its own function address: BindCallBack stores the address per
 * control, and the handlers differ in what they do to the page.
 *
 * Declared before the page function that inserts it: makensis expands a macro
 * only once its definition has been read.
 */
!macro ytSkinBindInstall
  GetFunctionAddress $0 YtSkinOnSelectDir
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnSelectDir" $0

  GetFunctionAddress $0 YtSkinOnShowLicense
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnAgreement" $0

  GetFunctionAddress $0 YtSkinOnInstall
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnInstall" $0

  GetFunctionAddress $0 YtSkinOnPathEdited
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "editDir" $0

  GetFunctionAddress $0 YtSkinOnMinimize
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnMin" $0

  GetFunctionAddress $0 YtSkinOnQuit
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnClose" $0

  GetFunctionAddress $0 YtSkinOnQuit
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "syscommandclose" $0
!macroend

/**
 * Keeps the "free space" row truthful while the user edits the path. Quota is
 * read from the volume the path names; a path on a volume that does not exist yet
 * reports nothing rather than a wrong number.
 *
 * DriveSpace answers in kilobytes, which for a modern volume is a nine-digit
 * number no one can read at a glance, so it is converted here: gigabytes with one
 * decimal above 1 GB, whole megabytes below. NSIS has no floating point, hence the
 * integer division plus the remainder for the tenth.
 *
 * The row is written but not committed: this runs from a RichEdit change
 * callback, which fires on every keystroke, and a hide/show pair per keystroke
 * would make the window flicker. The value rides along on the next commit.
 */
!macro ytSkinSpaceHint
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  nsNiuniuSkin::GetControlAttribute $YtSkinHwnd "editDir" "text"
  Pop $0
  ${If} $0 == ""
    StrCpy $0 $INSTDIR
  ${EndIf}

  ${GetRoot} "$0" $2
  ${If} $2 != ""
    ${DriveSpace} "$2\" "/D=F /S=K" $3
    ${If} $3 != ""
      ${If} $3 >= 1048576
        ; Gigabytes, one decimal: $4 holds the tenth.
        IntOp $4 $3 % 1048576
        IntOp $4 $4 * 10
        IntOp $4 $4 / 1048576
        IntOp $1 $3 / 1048576
        StrCpy $3 "$1.$4 GB"
      ${Else}
        IntOp $3 $3 / 1024
        StrCpy $3 "$3 MB"
      ${EndIf}
      StrCpy $1 "目标磁盘剩余 $3"
      nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "local_space" "text" "$1"
    ${EndIf}
  ${EndIf}
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

/**
 * The only page before the section. electron-builder inserts this macro before
 * its licence and directory pages; because the skin replaces both, that position
 * is simply where the skin window is created.
 *
 * A silent run is an update driven by electron-builder (or by the updater) and
 * must not create any window; Abort moves straight to the next page, which those
 * runs also skip, so the section runs unattended.
 */
!macro customWelcomePage
  Page custom YtSkinPageCreate YtSkinPageLeave
!macroend

Function YtSkinPageCreate
  ${If} ${Silent}
    Abort
  ${EndIf}
  ClearErrors
  ${GetParameters} $R8
  ${GetOptions} $R8 "--updated" $R9
  ${IfNot} ${Errors}
    Abort
  ${EndIf}

  StrCpy $YtSkinLaunchApp 1

  !insertmacro ytSkinPrepare
  !insertmacro ytSkinCreate $YtSkinHwnd "YarkText ${VERSION} 安装程序"

  ; The version string drives both the label and the window title, so an upgrade
  ; is identifiable before anything is written.
  nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "lblVersionConfig" "text" "版本 ${VERSION}"
  nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "editDir" "text" "$INSTDIR"
  ; Writes take true/false but reads answer 1/0, so the getters below compare
  ; against "1" rather than mirroring the literals used here. Measured with the
  ; plugin directly: after ticking the box, GetControlAttribute "selected" gives
  ; "1" for a checked box and "0" for an unchecked one.
  ${If} $YtInstallPdf == 1
    nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "chkPdf" "selected" "true"
  ${Else}
    nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "chkPdf" "selected" "false"
  ${EndIf}
  nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "chkAgree" "selected" "false"

  !insertmacro ytSkinSpaceHint

  !insertmacro ytSkinCommit $YtSkinHwnd ${YT_PAGE_CONFIG} ${YT_SIZE_CONFIG_W} ${YT_SIZE_CONFIG_H}
  !insertmacro ytSkinHideWizard

  ; Bound after the first commit: the bindings are stored per control on the page
  ; the window laid out, and a later ShowPageItem rebuilds that page.
  !insertmacro ytSkinBindInstall

  !insertmacro ytSkinPump $YtSkinHwnd $YtSkinLeave Config
  !insertmacro ytSkinFlush $YtSkinHwnd Config

  ${If} $YtSkinQuit == 1
    Quit
  ${EndIf}

  ; $INSTDIR was written by the install callback; the getter runs here as well so
  ; a page left by some other route still carries the user's choice.
  nsNiuniuSkin::GetControlAttribute $YtSkinHwnd "editDir" "text"
  Pop $0
  ${If} $0 != ""
    StrCpy $INSTDIR $0
  ${EndIf}
  !insertmacro ytSkinTrimSlash $INSTDIR
  !insertmacro ytSkinEnsureAppFolder $INSTDIR
  StrCpy $YtChosenDir $INSTDIR

  nsNiuniuSkin::GetControlAttribute $YtSkinHwnd "chkPdf" "selected"
  Pop $0
  ${If} $0 == "1"
    StrCpy $YtInstallPdf 1
  ${Else}
    StrCpy $YtInstallPdf 0
  ${EndIf}

  !insertmacro ytSkinHide $YtSkinHwnd
FunctionEnd

; The leave function runs after the pump returned control, so nothing is left to
; decide here; the callback already stored the values. Kept explicit because
; Page custom requires both callbacks.
Function YtSkinPageLeave
FunctionEnd

Function YtSkinOnSelectDir
  nsNiuniuSkin::SelectInstallDirEx $YtSkinHwnd "选择 YarkText 的安装位置"
  Pop $0
  ${If} $0 != ""
    !insertmacro ytSkinTrimSlash $0
    nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "editDir" "text" "$0"
    !insertmacro ytSkinSpaceHint
  ${EndIf}
FunctionEnd

Function YtSkinOnPathEdited
  !insertmacro ytSkinSpaceHint
FunctionEnd

/**
 * The licence is a tab page, so showing it is a page switch rather than a
 * visibility write.
 *
 * The configuration values are copied out first: a page laid out from XML comes
 * back with the defaults, so anything the user typed or ticked has to be carried
 * across the switch and written back before the window is shown again. Binding is
 * redone after every switch for the same reason - BindCallBack stores addresses
 * per control on the page that was just laid out.
 */
Function YtSkinOnShowLicense
  nsNiuniuSkin::GetControlAttribute $YtSkinHwnd "editDir" "text"
  Pop $YtPendingDir
  nsNiuniuSkin::GetControlAttribute $YtSkinHwnd "chkPdf" "selected"
  Pop $YtPendingPdf

  !insertmacro ytSkinLayout $YtSkinHwnd ${YT_PAGE_LICENSE} ${YT_SIZE_CONFIG_W} ${YT_SIZE_CONFIG_H}

  GetFunctionAddress $0 YtSkinOnCloseLicense
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnAgree" $0
  GetFunctionAddress $0 YtSkinOnQuit
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnClose" $0
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "syscommandclose" $0
  GetFunctionAddress $0 YtSkinOnMinimize
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnMin" $0

  !insertmacro ytSkinPresent $YtSkinHwnd
FunctionEnd

/**
 * Returns to the configuration view with the values from before the switch.
 *
 * The writes are issued between the layout and the show, because a write made
 * while the window is already visible only reaches the screen on the next round
 * trip - which here would be the commit that leaves the page.
 */
Function YtSkinOnCloseLicense
  !insertmacro ytSkinLayout $YtSkinHwnd ${YT_PAGE_CONFIG} ${YT_SIZE_CONFIG_W} ${YT_SIZE_CONFIG_H}

  nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "lblVersionConfig" "text" "版本 ${VERSION}"
  nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "editDir" "text" "$YtPendingDir"
  ${If} $YtPendingPdf == "1"
    nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "chkPdf" "selected" "true"
  ${Else}
    nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "chkPdf" "selected" "false"
  ${EndIf}
  nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "chkAgree" "selected" "false"
  !insertmacro ytSkinSpaceHint

  !insertmacro ytSkinBindInstall
  !insertmacro ytSkinPresent $YtSkinHwnd
FunctionEnd

Function YtSkinOnMinimize
  System::Call 'user32::ShowWindow(p $YtSkinHwnd, i 6)'
FunctionEnd

/**
 * The close button cancels the whole run, which is what a cancel should do. It
 * has to leave the process instead of letting the page return: returning would
 * continue to the next page and start writing files.
 *
 * Quit is not called here. The bound function runs inside the plugin's window
 * procedure, and terminating from a message handler leaves the window painted on
 * screen while the process lingers, so the button looks dead. The flag ends the
 * pump, and the pump's callers quit once they are back in ordinary script.
 */
Function YtSkinOnQuit
  StrCpy $YtSkinQuit 1
FunctionEnd

/**
 * The one gate on this page: the licence has to be accepted before the installer
 * writes anything.
 *
 * The path is validated first because $INSTDIR is about to receive a few hundred
 * files; an empty or relative value would scatter them into whatever directory
 * happens to be current.
 */
Function YtSkinOnInstall
  nsNiuniuSkin::GetControlAttribute $YtSkinHwnd "editDir" "text"
  Pop $0
  !insertmacro ytSkinTrimSlash $0
  ${If} $0 == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "请先选择安装位置。"
    Return
  ${EndIf}

  !insertmacro ytSkinEnsureAppFolder $0
  ClearErrors
  CreateDirectory "$0"
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "无法创建目录：$\r$\n$0$\r$\n请换一个位置。"
    Return
  ${EndIf}

  nsNiuniuSkin::GetControlAttribute $YtSkinHwnd "chkAgree" "selected"
  Pop $1
  ${If} $1 != "1"
    MessageBox MB_OK|MB_ICONEXCLAMATION "请先阅读并勾选同意许可协议。"
    Return
  ${EndIf}

  StrCpy $INSTDIR $0
  StrCpy $YtChosenDir $0
  StrCpy $YtSkinLeave 1
FunctionEnd

/**
 * electron-builder expands this macro immediately before MUI_PAGE_INSTFILES. The
 * define is consumed by that page alone, and installer-ui.nsh leaves the slot
 * free while YT_SKIN_PAGES is set.
 *
 * The skin's own progress page is what the user sees; the stock page behind it is
 * hidden as soon as MUI activates it, and its section still runs normally, which
 * is exactly what is wanted: NSIS keeps driving the section and the skin only
 * mirrors the state.
 */
!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW YtSkinInstFilesShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE YtSkinInstFilesLeave
!macroend

/**
 * Skips the stock "install for all users / just me" page.
 *
 * electron-builder inserts that page whenever perMachine is not forced, and its
 * PRE callback aborts straight away only when the run already carries an explicit
 * scope flag. Without this macro the page would appear between the skin page and
 * the progress page, and confirming it would call setInstallModePerUser, which
 * overwrites $INSTDIR from the registry - silently discarding the path the user
 * typed into the skin. Forcing the current-user scope matches perMachine: false
 * and makes the page abort itself.
 *
 * Not defined for the uninstaller: its own registry check decides the scope there,
 * and forcing per-user would misreport a per-machine install.
 */
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

Function YtSkinInstFilesShow
  ${If} $YtSkinHwnd == 0
    Return
  ${EndIf}
  !insertmacro ytSkinHideWizard

  ; The install-mode page ran between the skin page and this one, and its
  ; setInstallModePerUser resets $INSTDIR from the registry or from the per-user
  ; default. The path the user typed in the skin is the authoritative one.
  ${If} $YtChosenDir != ""
    StrCpy $INSTDIR $YtChosenDir
  ${EndIf}

  ; There is no per-file progress callback: the payload is unpacked by one
  ; blocking Nsis7z::Extract, so this commit describes the whole phase and the
  ; next one is made once the section reaches the registry work.
  nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "lblVersionInstalling" "text" "版本 ${VERSION}"
  nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "slrProgress" "min" "0"
  nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "slrProgress" "max" "100"
  !insertmacro ytSkinProgress $YtSkinHwnd 45 "正在写入程序文件"
  !insertmacro ytSkinCommit $YtSkinHwnd ${YT_PAGE_INSTALLING} ${YT_SIZE_BRIEF_W} ${YT_SIZE_BRIEF_H}
FunctionEnd

/**
 * Called from customInstall in installer.nsh, i.e. after the payload is unpacked
 * and the shell is about to be registered. A silent run has no window, so the
 * guard skips the paint instead of jumping over a label - the macro is inserted
 * from a shared header and a label would collide if it ever grew a second site.
 */
!macro ytSkinStageRegistering
  ${If} $YtSkinHwnd != 0
    !insertmacro ytSkinProgress $YtSkinHwnd 92 "正在注册文件关联"
    !insertmacro ytSkinCommit $YtSkinHwnd ${YT_PAGE_INSTALLING} ${YT_SIZE_BRIEF_W} ${YT_SIZE_BRIEF_H}
  ${EndIf}
!macroend

/**
 * Keeps MUI's stock finish page out of the flow.
 *
 * electron-builder swaps its own MUI_PAGE_FINISH for this macro whenever the
 * macro exists, so an empty body leaves the progress page as the last page of the
 * wizard. That is the arrangement the skin needs: MUI's finish page is a separate
 * #32770 window that none of the plugin's controls can reach, while the progress
 * page's leave callback is a point the skin already owns.
 *
 * Measured, not assumed. With a `Page custom` inserted here the page was
 * registered and compiled, but never created: the section finished, the progress
 * page's leave callback ran, and the wizard then sat on its own "installation
 * complete" state with no finish page in between. Owning the leave callback
 * instead needs no extra page at all.
 */
!macro customFinishPage
!macroend

/**
 * Shows the skin's finish page, then closes the wizard.
 *
 * Runs as the progress page leaves, which is after every file, shortcut and
 * registry entry is in place and before the wizard disappears. The pump blocks
 * here for as long as the user keeps the page open.
 *
 * A cancelled run leaves the page through the same callback and must not be shown
 * a success page, so it returns immediately.
 */
Function YtSkinInstFilesLeave
  IfAbort ytSkinInstFilesLeaveCancelled

  ${If} $YtSkinHwnd == 0
    Return
  ${EndIf}

  !insertmacro ytSkinHideWizard

  nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "lblVersionFinish" "text" "版本 ${VERSION}"
  nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "chkRun" "selected" "true"

  !insertmacro ytSkinCommit $YtSkinHwnd ${YT_PAGE_FINISH} ${YT_SIZE_BRIEF_W} ${YT_SIZE_BRIEF_H}

  GetFunctionAddress $0 YtSkinOnFinishRun
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnRun" $0

  GetFunctionAddress $0 YtSkinOnFinishClose
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "syscommandclose" $0

  GetFunctionAddress $0 YtSkinOnFinishClose
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnClose" $0

  GetFunctionAddress $0 YtSkinOnMinimize
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnMin" $0

  !insertmacro ytSkinPump $YtSkinHwnd $YtSkinLeave Finish
  !insertmacro ytSkinFlush $YtSkinHwnd Finish

  !insertmacro ytSkinHide $YtSkinHwnd
  Call YtSkinLaunchSelected

  ; Quit rather than Return. This page replaced MUI's finish page with an empty
  ; customFinishPage, so there is no stock page left to close the wizard: returning
  ; here hands control back to the page loop with nothing to advance to, and the
  ; process stays alive with no window - measured at 120s and still running, holding
  ; its own install directory open. Quitting is what the absent finish page would
  ; have done. The uninstaller's Quit works from here because the pump has already
  ; returned, so this is ordinary script context, not a message handler.
  Quit

  ytSkinInstFilesLeaveCancelled:
  !insertmacro ytSkinHide $YtSkinHwnd
FunctionEnd

/**
 * Starts the app when the run option was left ticked.
 *
 * The executable name comes from the App Paths value customInstall writes, not
 * from ${APP_EXECUTABLE_FILENAME}: that constant lives in electron-builder's
 * common.nsh, which is included after this file, so it is not defined yet when
 * this function body is parsed.
 */
Function YtSkinLaunchSelected
  ${If} $YtSkinLaunchApp != 1
    Return
  ${EndIf}

  ReadRegStr $0 SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\App Paths\YarkText.exe" ""
  ${If} $0 == ""
    Return
  ${EndIf}
  ${IfNot} ${FileExists} "$0"
    Return
  ${EndIf}

  ; ExecShell rather than StdUtils::ExecShellAsUser: the per-user installer already
  ; runs with the user's own token, and that helper only exists for the StartApp
  ; function of the stock finish page, which this installer does not use.
  HideWindow
  ExecShell "open" "$0"
FunctionEnd

Function YtSkinOnFinishRun
  nsNiuniuSkin::GetControlAttribute $YtSkinHwnd "chkRun" "selected"
  Pop $0
  ${If} $0 == "1"
    StrCpy $YtSkinLaunchApp 1
  ${Else}
    StrCpy $YtSkinLaunchApp 0
  ${EndIf}
  StrCpy $YtSkinLeave 1
FunctionEnd

Function YtSkinOnFinishClose
  StrCpy $YtSkinLaunchApp 0
  StrCpy $YtSkinLeave 1
FunctionEnd

!endif

;======================================================================
; Uninstaller

!ifdef BUILD_UNINSTALLER

; The uninstall settings flag. installer-ui.nsh seeds it from customUnInit and
; installer.nsh reads it from the section, but both files are included after this
; one, so the declaration has to live here - NSIS resolves a $variable at the point
; the function body that mentions it is parsed.
Var un.YtKeepSettings

/**
 * The uninstall confirmation. electron-builder reaches this through
 * customUnWelcomePage, which replaces the stock "are you sure" dialog, so the
 * settings question that used to be a separate MessageBox lives here.
 *
 * The stock uninstaller keeps its own progress and finish pages; the progress page
 * is restyled by installer-ui.nsh, so only the confirmation comes from the skin.
 */
!macro customUnWelcomePage
  UninstPage custom un.YtSkinPageCreate un.YtSkinPageLeave
!macroend

Function un.YtSkinPageCreate
  ${If} ${Silent}
    Abort
  ${EndIf}

  !insertmacro ytSkinPrepare
  !insertmacro ytSkinCreate $YtSkinHwnd "YarkText ${VERSION} 卸载程序"

  nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "lblVersionUninstall" "text" "版本 ${VERSION}"
  ; The default is "keep": a silent uninstall never reaches this page, and the
  ; quiet path has to stay the safe one.
  ${If} $un.YtKeepSettings == 1
    nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "chkbox_userdata" "selected" "false"
  ${Else}
    nsNiuniuSkin::SetControlAttribute $YtSkinHwnd "chkbox_userdata" "selected" "true"
  ${EndIf}

  !insertmacro ytSkinCommit $YtSkinHwnd ${YT_PAGE_UNCONFIG} ${YT_SIZE_CONFIG_W} ${YT_SIZE_CONFIG_H}
  !insertmacro ytSkinHideWizard

  GetFunctionAddress $0 un.YtSkinOnUninstall
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnUnInstall" $0

  GetFunctionAddress $0 un.YtSkinOnQuit
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnUnCancel" $0

  GetFunctionAddress $0 un.YtSkinOnQuit
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnClose" $0

  GetFunctionAddress $0 un.YtSkinOnQuit
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "syscommandclose" $0

  GetFunctionAddress $0 un.YtSkinOnMinimize
  nsNiuniuSkin::BindCallBack $YtSkinHwnd "btnMin" $0

  !insertmacro ytSkinPump $YtSkinHwnd $YtSkinLeave Un
  !insertmacro ytSkinFlush $YtSkinHwnd Un

  ${If} $YtSkinQuit == 1
    Quit
  ${EndIf}

  nsNiuniuSkin::GetControlAttribute $YtSkinHwnd "chkbox_userdata" "selected"
  Pop $0
  ${If} $0 == "1"
    StrCpy $un.YtKeepSettings 0
  ${Else}
    StrCpy $un.YtKeepSettings 1
  ${EndIf}

  !insertmacro ytSkinHide $YtSkinHwnd
  ; The stock progress page becomes visible again for the file loop.
  System::Call 'user32::ShowWindow(p $HWNDPARENT, i 5)'
FunctionEnd

Function un.YtSkinPageLeave
FunctionEnd

Function un.YtSkinOnMinimize
  System::Call 'user32::ShowWindow(p $YtSkinHwnd, i 6)'
FunctionEnd

Function un.YtSkinOnQuit
  StrCpy $YtSkinQuit 1
FunctionEnd

Function un.YtSkinOnUninstall
  StrCpy $YtSkinLeave 1
FunctionEnd

!endif

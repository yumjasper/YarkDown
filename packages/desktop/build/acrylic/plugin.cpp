#include <windows.h>
#include <d2d1.h>
#include <dwrite.h>
#include <dwmapi.h>
#include <shlobj.h>
#include <commctrl.h>
#include <map>
#include <string>
#include <vector>
#include <deque>
#include <thread>
#include <mutex>
#include <atomic>
#include <functional>
#include <memory>
#include "instance.h"

// NSIS supplies a Unicode linked stack and executes callbacks on its UI thread.
struct Stack { Stack* next; wchar_t text[1]; };
struct Extra {
  void* executionFlags;
  int (__stdcall* ExecuteCodeSegment)(int, HWND);
  void* validate;
  int (__stdcall* registerCallback)(HMODULE, UINT_PTR (__cdecl*)(int));
};
static void cleanupSkin();
static UINT_PTR __cdecl pluginCallback(int) {
  cleanupSkin();
  releaseInstallerMutex();
  return 0;
}
static Stack** stack;
static int stringSize;
static Extra* extra;
static HINSTANCE instance;
static HWND window, edit, host;
static HFONT editFont;
static HBRUSH editBrush;
static LRESULT CALLBACK hostProcedure(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp,
                                      UINT_PTR id, DWORD_PTR) {
  if (msg == WM_WINDOWPOSCHANGING && window) {
    auto position = reinterpret_cast<WINDOWPOS*>(lp);
    position->flags &= ~SWP_SHOWWINDOW;
  }
  if (msg == WM_NCDESTROY) { RemoveWindowSubclass(hwnd, hostProcedure, id); host = nullptr; }
  return DefSubclassProc(hwnd, msg, wp, lp);
}
static ID2D1Factory* factory;
static IDWriteFactory* writeFactory;
static ID2D1HwndRenderTarget* target;
static std::map<std::wstring, std::wstring> values;
static std::map<std::wstring, int> callbacks;
static std::atomic<int> page{0};
static std::atomic<int> width{440};
static std::atomic<int> height{404};
static float scale = 1;
/**
 * Guards the maps NSIS writes from its script thread while the window thread reads
 * them.
 *
 * Nothing else is protected: hits, hovered and the D2D target belong to the window
 * thread alone, which is also the only thread allowed to draw.
 */
static std::mutex stateMutex;
static DWORD windowThread;
/** Reads one control attribute under the state lock. */
static std::wstring valueOf(const std::wstring& key) {
  std::lock_guard<std::mutex> lock(stateMutex);
  auto found = values.find(key);
  return found == values.end() ? std::wstring() : found->second;
}
/**
 * Performs window work on the thread that owns the skin window.
 *
 * NSIS runs the install section on a worker thread, and every plugin export can be
 * called from there. Touching a window from that thread means a synchronous message
 * to the window thread, and the window thread is inside the skin's message pump,
 * which calls back into these same exports. Calling window APIs directly therefore
 * deadlocked the two threads: the symptom was an installer that had written every
 * file and then answered no clicks at all. Work is queued here instead and run by
 * the timer the window thread already owns.
 */
static std::deque<std::function<void()>> windowTasks;
static std::mutex taskMutex;
static void drainWindowTasks() {
  std::deque<std::function<void()>> pending;
  {
    std::lock_guard<std::mutex> lock(taskMutex);
    pending.swap(windowTasks);
  }
  for (auto& task : pending) task();
}
static void onWindowThread(std::function<void()> work) {
  if (GetCurrentThreadId() == windowThread) { work(); return; }
  struct Task { std::function<void()> work; HANDLE done; };
  auto task = std::make_shared<Task>();
  task->work = std::move(work);
  task->done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  {
    std::lock_guard<std::mutex> lock(taskMutex);
    windowTasks.push_back([task] { task->work(); SetEvent(task->done); });
  }
  PostMessageW(window, WM_APP, 0, 0);
  if (task->done) {
    WaitForSingleObject(task->done, 5000);
    CloseHandle(task->done);
  }
}
/**
 * Appends one line to the file named by YARK_SKIN_LOG.
 *
 * A hang inside the installer leaves no trace of its own, and rebuilding with a
 * compile-time flag means the shipping binary and the diagnosed binary differ.
 * Gating on an environment variable keeps the code path in every build while a
 * normal run writes nothing at all.
 */
static void trace(const std::wstring& text) {
  static int enabled = -1;
  if (enabled < 0) enabled = GetEnvironmentVariableW(L"YARK_SKIN_LOG", nullptr, 0) > 0 ? 1 : 0;
  if (!enabled) return;
  wchar_t path[MAX_PATH];
  if (!GetEnvironmentVariableW(L"YARK_SKIN_LOG", path, MAX_PATH)) return;
  HANDLE file = CreateFileW(path, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE,
                            nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) return;
  wchar_t line[512];
  int length = swprintf_s(line, L"%llu t%lu %s\r\n",
                          static_cast<unsigned long long>(GetTickCount64()),
                          GetCurrentThreadId(), text.c_str());
  DWORD written = 0;
  if (length > 0) WriteFile(file, line, static_cast<DWORD>(length) * sizeof(wchar_t), &written, nullptr);
  CloseHandle(file);
}
static std::atomic<unsigned long> animationFrames{0};
static constexpr UINT_PTR sweepTimer = 1;
static ULONGLONG progressAnimationStart;
/**
 * Left edge of the travelling segment, looping over the track.
 *
 * Kept as a pure function of the clock so the animation needs no per-frame state
 * and cannot drift when a frame is skipped.
 */
static float progressSegmentLeft(ULONGLONG now) {
  return 24.f - 96.f + 488.f * ((now - progressAnimationStart) % 1600) / 1600.f;
}

struct Hit { D2D1_RECT_F rect; std::wstring name; bool check; };
static std::vector<Hit> hits;
static bool preview;
static bool acrylicEnabled;
static std::deque<std::wstring> pendingCallbacks;
static std::wstring hovered, pressed;
static std::wstring pop() {
  if (!*stack) return L"";
  Stack* item = *stack;
  std::wstring result = item->text;
  *stack = item->next;
  GlobalFree(item);
  return result;
}
static void push(const std::wstring& text) {
  auto item = static_cast<Stack*>(GlobalAlloc(GPTR, sizeof(Stack) + stringSize * sizeof(wchar_t)));
  lstrcpynW(item->text, text.c_str(), stringSize);
  item->next = *stack;
  *stack = item;
}
static void invoke(const std::wstring& name) {
  // NSIS callbacks may call plugins; defer them until DispatchMessage has returned.
  std::lock_guard<std::mutex> lock(stateMutex);
  if (callbacks.count(name)) pendingCallbacks.push_back(name);
}
static D2D1_COLOR_F ink = D2D1::ColorF(0x20202a);
static void fill(D2D1_RECT_F rect, D2D1_COLOR_F color, float radius = 0) {
  ID2D1SolidColorBrush* brush = nullptr;
  if (FAILED(target->CreateSolidColorBrush(color, &brush))) return;
  if (radius) target->FillRoundedRectangle(D2D1::RoundedRect(rect, radius, radius), brush);
  else target->FillRectangle(rect, brush);
  brush->Release();
}
static void text(const std::wstring& value, D2D1_RECT_F rect, float size = 14,
                 D2D1_COLOR_F color = ink, bool centered = false) {
  IDWriteTextFormat* format = nullptr;
  if (FAILED(writeFactory->CreateTextFormat(L"Segoe UI", nullptr, DWRITE_FONT_WEIGHT_NORMAL,
      DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_STRETCH_NORMAL, size, L"zh-CN", &format))) return;
  format->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);
  format->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
  if (centered) format->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER);
  ID2D1SolidColorBrush* brush = nullptr;
  if (SUCCEEDED(target->CreateSolidColorBrush(color, &brush))) {
    target->DrawTextW(value.c_str(), static_cast<UINT32>(value.size()), format, rect, brush,
                      D2D1_DRAW_TEXT_OPTIONS_CLIP);
    brush->Release();
  }
  format->Release();
}
static void button(const wchar_t* name, const wchar_t* label, D2D1_RECT_F rect, bool primary = false) {
  bool over = hovered == name;
  bool down = over && pressed == name;
  auto color = primary ? D2D1::ColorF(down ? 0x101016 : over ? 0x41414f : 0x20202a)
                       : D2D1::ColorF(down ? 0xd6d6df : over ? 0xffffff : 0xf4f4f6);
  fill(rect, color, 7);
  text(label, rect, 14, primary ? D2D1::ColorF(0xffffff) : ink, true);
  hits.push_back({rect, name, false});
}
static void checkbox(const wchar_t* name, const wchar_t* label, float y) {
  D2D1_RECT_F rect = D2D1::RectF(24, y, 416, y + 32);
  if (hovered == name) fill(rect, D2D1::ColorF(1, 1, 1, pressed == name ? .65f : .35f), 5);
  bool checked = valueOf(std::wstring(name) + L":selected") == L"true";
  fill(D2D1::RectF(24, y + 8, 40, y + 24), checked ? ink : D2D1::ColorF(1, 1, 1, .85f), 3);
  if (checked) text(L"✓", D2D1::RectF(24, y + 6, 40, y + 26), 14, D2D1::ColorF(0xffffff), true);
  text(label, D2D1::RectF(50, y, 416, y + 32));
  hits.push_back({rect, name, true});
}
static void paint() {
  if (!factory || !writeFactory) return;
  if (!target) {
    RECT r; GetClientRect(window, &r);
    auto props = D2D1::RenderTargetProperties(D2D1_RENDER_TARGET_TYPE_DEFAULT,
      D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED));
    if (FAILED(factory->CreateHwndRenderTarget(props,
        D2D1::HwndRenderTargetProperties(window, D2D1::SizeU(r.right, r.bottom)), &target))) return;
    target->SetDpi(96 * scale, 96 * scale);
    target->SetTextAntialiasMode(D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE);
  }
  target->BeginDraw();
  target->Clear(acrylicEnabled ? D2D1::ColorF(0, 0, 0, 0) : D2D1::ColorF(0xf5f5f5));
  hits.clear();
  const int currentPage = page.load();
  const int currentHeight = height.load();
  text(L"YarkText", D2D1::RectF(24, 24, 390, 65), 30);
  text(L"专注写作，轻松阅读", D2D1::RectF(24, 67, 400, 92), 14);
  const wchar_t* versions[] = {L"lblVersionConfig", L"lblVersionInstalling", L"lblVersionFinish", L"lblVersionUninstall"};
  text(valueOf(std::wstring(versions[currentPage < 4 ? currentPage : 3]) + L":text"), D2D1::RectF(24, 96, 416, 120), 12);
  float bottom = static_cast<float>(currentHeight - 56);
  if (currentPage == 0) {
    text(L"安装 YarkText", D2D1::RectF(24, 144, 416, 168), 18);
    text(L"选择安装位置后即可开始", D2D1::RectF(24, 172, 416, 194), 12);
    fill(D2D1::RectF(24, 216, 356, 256), D2D1::ColorF(1, 1, 1, .9f), 6);
    button(L"btnSelectDir", L"浏览", D2D1::RectF(366, 216, 416, 256));
    text(valueOf(L"local_space:text"), D2D1::RectF(24, 263, 416, 285), 12);
    checkbox(L"chkPdf", L"同时安装 PDF 阅读器", 302);
    button(L"btnCancel", L"取消", D2D1::RectF(24, bottom, 112, bottom + 36));
    button(L"btnInstall", L"一键安装", D2D1::RectF(304, bottom, 416, bottom + 36), true);
  } else if (currentPage == 1) {
    text(L"正在安装", D2D1::RectF(24, 144, 416, 174), 18);
    text(valueOf(L"progress_tip:text"), D2D1::RectF(24, 180, 416, 206));
    // The track and the travelling segment are drawn together on this surface,
    // which is why the animation needs nothing but a timer on this thread.
    fill(D2D1::RectF(24, 224, 416, 230), D2D1::ColorF(1, 1, 1, .6f), 3);
    {
      const float left = progressSegmentLeft(GetTickCount64());
      const float trackLeft = 24.f, trackRight = 416.f;
      const float start = left < trackLeft ? trackLeft : left;
      const float end = (left + 96.f) > trackRight ? trackRight : (left + 96.f);
      if (end > start)
        fill(D2D1::RectF(start, 224, end, 230), D2D1::ColorF(0x20202a), 3);
    }
    text(valueOf(L"progress_pos:text"), D2D1::RectF(24, 240, 416, 264));
  } else if (currentPage == 2) {
    text(L"安装完成", D2D1::RectF(24, 144, 416, 176), 18);
    checkbox(L"chkRun", L"启动 YarkText", 208);
    button(L"btnFinishClose", L"关闭", D2D1::RectF(24, bottom, 112, bottom + 36));
    button(L"btnRun", L"完成", D2D1::RectF(304, bottom, 416, bottom + 36), true);
  } else {
    text(L"卸载 YarkText", D2D1::RectF(24, 144, 416, 176), 18);
    checkbox(L"chkbox_userdata", L"同时删除个人设置", 208);
    button(L"btnUnCancel", L"取消", D2D1::RectF(24, bottom, 112, bottom + 36));
    button(L"btnUnInstall", L"卸载", D2D1::RectF(304, bottom, 416, bottom + 36), true);
  }
  if (target->EndDraw() == D2DERR_RECREATE_TARGET) { target->Release(); target = nullptr; }
}
static LRESULT CALLBACK procedure(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  if (msg == WM_TIMER && wp == sweepTimer) {
    if (page == 1) {
      ++animationFrames;
      InvalidateRect(hwnd, nullptr, FALSE);
    } else {
      KillTimer(hwnd, sweepTimer);
    }
    return 0;
  }
  if (msg == WM_APP) { drainWindowTasks(); return 0; }
  switch (msg) {
    case WM_PAINT: { PAINTSTRUCT ps; BeginPaint(hwnd, &ps); paint(); EndPaint(hwnd, &ps); return 0; }
    case WM_ERASEBKGND: return 1;
    case WM_SIZE:
      if (target) target->Resize(D2D1::SizeU(LOWORD(lp), HIWORD(lp)));
      InvalidateRect(hwnd, nullptr, FALSE); return 0;
    case WM_NCHITTEST: {
      POINT p{static_cast<short>(LOWORD(lp)), static_cast<short>(HIWORD(lp))}; ScreenToClient(hwnd, &p);
      if (p.y < 120 * scale) return HTCAPTION;
      return HTCLIENT;
    }
    case WM_MOUSEMOVE: {
      float x = static_cast<short>(LOWORD(lp)) / scale, y = static_cast<short>(HIWORD(lp)) / scale;
      std::wstring next;
      for (const auto& hit : hits)
        if (x >= hit.rect.left && x <= hit.rect.right && y >= hit.rect.top && y <= hit.rect.bottom) { next = hit.name; break; }
      if (next != hovered) { hovered = next; InvalidateRect(hwnd, nullptr, FALSE); }
      TRACKMOUSEEVENT tracking{sizeof(TRACKMOUSEEVENT), TME_LEAVE, hwnd, 0}; TrackMouseEvent(&tracking);
      SetCursor(LoadCursor(nullptr, hovered.empty() ? IDC_ARROW : IDC_HAND));
      return 0;
    }
    case WM_MOUSELEAVE: hovered.clear(); InvalidateRect(hwnd, nullptr, FALSE); return 0;
    case WM_LBUTTONDOWN:
      SendMessageW(hwnd, WM_MOUSEMOVE, wp, lp);
      pressed = hovered;
      if (!pressed.empty()) SetCapture(hwnd);
      InvalidateRect(hwnd, nullptr, FALSE); return 0;
    case WM_LBUTTONUP: {
      auto clicked = pressed;
      SendMessageW(hwnd, WM_MOUSEMOVE, wp, lp);
      pressed.clear();
      if (GetCapture() == hwnd) ReleaseCapture();
      if (!clicked.empty() && clicked == hovered) {
        for (const auto& hit : hits) if (hit.name == clicked) {
          if (hit.check) {
            std::lock_guard<std::mutex> guard(stateMutex);
            auto& v = values[clicked + L":selected"];
            v = v == L"true" ? L"false" : L"true";
          }
          else invoke(clicked);
          break;
        }
      }
      InvalidateRect(hwnd, nullptr, FALSE); return 0;
    }
    case WM_CAPTURECHANGED: pressed.clear(); InvalidateRect(hwnd, nullptr, FALSE); return 0;
    case WM_CTLCOLOREDIT:
      SetTextColor(reinterpret_cast<HDC>(wp), RGB(32, 32, 42));
      SetBkColor(reinterpret_cast<HDC>(wp), RGB(255, 255, 255));
      return reinterpret_cast<LRESULT>(editBrush ? editBrush : GetStockObject(WHITE_BRUSH));
    case WM_COMMAND: if (reinterpret_cast<HWND>(lp) == edit && HIWORD(wp) == EN_CHANGE) invoke(L"editDir"); return 0;
    case WM_CLOSE: invoke(page == 3 ? L"btnUnCancel" : page == 2 ? L"btnFinishClose" : L"btnCancel"); return 0;
    case WM_DESTROY: KillTimer(hwnd, sweepTimer); window = nullptr; return 0;
  }
  return DefWindowProc(hwnd, msg, wp, lp);
}
#define ENTRY(name) extern "C" void __cdecl name(HWND parent, int length, wchar_t*, Stack** top, Extra* api) { stack = top; stringSize = length; extra = api;
#define END }
ENTRY(CheckInstallerInstance)
  if (api && api->registerCallback) api->registerCallback(instance, pluginCallback);
  auto guid = pop();
  auto caption = pop();
  push(acquireInstallerInstance(guid, caption) ? L"1" : L"0");
END
ENTRY(InitSkinPage)
    if (api && api->registerCallback) api->registerCallback(instance, pluginCallback);
  pop(); pop();
  preview = wcsstr(GetCommandLineW(), L"--acrylic-preview") != nullptr;
  D2D1CreateFactory(D2D1_FACTORY_TYPE_MULTI_THREADED, &factory);
  DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory), reinterpret_cast<IUnknown**>(&writeFactory));
  WNDCLASSW wc{}; wc.lpfnWndProc = procedure; wc.hInstance = instance; wc.lpszClassName = L"YarkAcrylicInstaller"; wc.hCursor = LoadCursor(nullptr, IDC_ARROW); RegisterClassW(&wc);
  window = CreateWindowExW(WS_EX_APPWINDOW, wc.lpszClassName, L"YarkText", WS_POPUP | WS_CLIPCHILDREN,
      preview ? -4000 : (GetSystemMetrics(SM_CXSCREEN) - width) / 2,
      preview ? -4000 : (GetSystemMetrics(SM_CYSCREEN) - height) / 2, width, height, nullptr, nullptr, instance, nullptr);
  host = parent;
  windowThread = GetCurrentThreadId();
  if (host && host != window) {
    SetWindowSubclass(host, hostProcedure, 1, 0);
    ShowWindow(host, SW_HIDE);
  }
  // Accent supplies the desktop blur; the D2D surface remains transparent, not globally faded.
  struct Accent { int state, flags; DWORD tint; int animation; } accent{4, 2, 0x99f5f5f5, 0};
  struct Composition { int attribute; void* data; SIZE_T bytes; } data{19, &accent, sizeof(accent)};
  using SetComposition = BOOL(WINAPI*)(HWND, Composition*);
  auto set = reinterpret_cast<SetComposition>(GetProcAddress(GetModuleHandleW(L"user32.dll"), "SetWindowCompositionAttribute"));
  acrylicEnabled = set && set(window, &data);
  MARGINS margins{-1, -1, -1, -1}; DwmExtendFrameIntoClientArea(window, &margins);
  int corners = 2; DwmSetWindowAttribute(window, 33, &corners, sizeof(corners));
  // An opaque child layer prevents DWM from treating black GDI glyphs as transparent.
  edit = CreateWindowExW(0, L"EDIT", L"", WS_CHILD | ES_AUTOHSCROLL | WS_TABSTOP,
      36, 224, 308, 24, window, nullptr, instance, nullptr);
  SetWindowLongW(edit, GWL_EXSTYLE, GetWindowLongW(edit, GWL_EXSTYLE) | WS_EX_LAYERED);
  SetLayeredWindowAttributes(edit, 0, 255, LWA_ALPHA);
  // The stock GUI font renders the path too thin to read on a light row, so the
  // control gets an explicit face and a fixed white brush of its own. 13px keeps
  // one more character of the path visible than 14px while staying darker.
  editFont = CreateFontW(-13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
      OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE,
      L"Segoe UI");
  editBrush = CreateSolidBrush(RGB(255, 255, 255));
  SendMessageW(edit, WM_SETFONT, reinterpret_cast<WPARAM>(editFont ? editFont : GetStockObject(DEFAULT_GUI_FONT)), TRUE);
  push(std::to_wstring(reinterpret_cast<INT_PTR>(window)));
END
ENTRY(ProcessCallbacks)
  // Return the NSIS function address; the host must Call it after this export returns.
  int code = 0;
  {
    std::lock_guard<std::mutex> lock(stateMutex);
    if (!pendingCallbacks.empty()) {
      auto name = pendingCallbacks.front(); pendingCallbacks.pop_front();
      auto found = callbacks.find(name);
      if (found != callbacks.end()) code = found->second;
    }
  }
  push(std::to_wstring(code));
END
ENTRY(SetWindowTile) auto hwnd = reinterpret_cast<HWND>(_wcstoi64(pop().c_str(), nullptr, 10)); auto title = pop(); SetWindowTextW(hwnd, title.c_str()); END
ENTRY(SetWindowSize) pop(); width = _wtoi(pop().c_str()); height = _wtoi(pop().c_str()); trace(L"SetWindowSize begin");
  auto target = width.load(), tall = height.load();
  onWindowThread([target, tall] { SetWindowPos(window, nullptr, 0, 0, target, tall, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE); });
  trace(L"SetWindowSize end"); END
ENTRY(ShowPageItem) pop(); pop(); page = _wtoi(pop().c_str()); trace(L"ShowPageItem begin page=" + std::to_wstring(page.load()));
  const int shown = page.load();
  onWindowThread([shown] {
    // Everything here runs on the thread that owns the skin, so painting and the
    // timer never cross a thread boundary.
    KillTimer(window, sweepTimer);
    if (shown == 1) {
      progressAnimationStart = GetTickCount64();
      paint();
      SetTimer(window, sweepTimer, 16, nullptr);
    }
    hovered.clear(); pressed.clear();
    ShowWindow(edit, shown == 0 ? SW_SHOWNOACTIVATE : SW_HIDE);
    InvalidateRect(window, nullptr, FALSE);
  });
  trace(L"ShowPageItem end"); END
ENTRY(SetControlAttribute) pop(); auto name = pop(); auto attr = pop(); auto value = pop();
  { std::lock_guard<std::mutex> lock(stateMutex); values[name + L":" + attr] = value; }
  if (name == L"editDir" && attr == L"text") {
    onWindowThread([value] { SetWindowTextW(edit, value.c_str()); });
  }
  onWindowThread([] { InvalidateRect(window, nullptr, FALSE); }); END
ENTRY(GetControlAttribute) pop(); auto name = pop(); auto attr = pop();
  if (name == L"editDir" && attr == L"text") {
    std::wstring path;
    onWindowThread([&path] { wchar_t buffer[32768]; GetWindowTextW(edit, buffer, 32768); path = buffer; });
    push(path);
  } else {
    auto v = valueOf(name + L":" + attr);
    push(attr == L"selected" ? (v == L"true" ? L"1" : L"0") : v);
  } END
ENTRY(BindCallBack) pop(); auto name = pop(); auto address = _wtoi(pop().c_str());
  { std::lock_guard<std::mutex> lock(stateMutex); callbacks[name] = address; } END
ENTRY(SelectInstallDirEx) pop(); auto title = pop(); std::wstring chosen;
  onWindowThread([&chosen, title] {
    BROWSEINFOW info{}; info.hwndOwner = window; info.lpszTitle = title.c_str();
    info.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE;
    PIDLIST_ABSOLUTE item = SHBrowseForFolderW(&info);
    wchar_t path[MAX_PATH]{};
    if (item) { SHGetPathFromIDListW(item, path); CoTaskMemFree(item); }
    chosen = path;
  });
  push(chosen); END
/**
 * Tears the skin down.
 *
 * The window is destroyed on its own thread because DestroyWindow from another
 * thread is a synchronous message into that thread, which is exactly the wait that
 * used to freeze the wizard. The plugin's own state is cleared here afterwards.
 */
static void cleanupSkin() {
  trace(L"cleanupSkin begin");
  onWindowThread([] {
    KillTimer(window, sweepTimer);
    if (editFont) { DeleteObject(editFont); editFont = nullptr; }
    if (editBrush) { DeleteObject(editBrush); editBrush = nullptr; }
    if (host) { RemoveWindowSubclass(host, hostProcedure, 1); host = nullptr; }
    if (window) { DestroyWindow(window); window = nullptr; }
    if (target) { target->Release(); target = nullptr; }
    if (writeFactory) { writeFactory->Release(); writeFactory = nullptr; }
    if (factory) { factory->Release(); factory = nullptr; }
  });
  {
    std::lock_guard<std::mutex> lock(stateMutex);
    callbacks.clear();
    pendingCallbacks.clear();
    values.clear();
  }
  trace(L"cleanupSkin end");
}
ENTRY(ExitDUISetup) pop(); cleanupSkin(); END
BOOL WINAPI DllMain(HINSTANCE module, DWORD reason, LPVOID) { if (reason == DLL_PROCESS_ATTACH) instance = module; return TRUE; }

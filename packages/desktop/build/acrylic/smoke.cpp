#include "plugin.cpp"
#include <iostream>
#include <stdexcept>
static int called;
static int __stdcall callback(int code, HWND) { called = code; return 0; }
static void require(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
int wmain() {
  Stack* top = nullptr;
  stack = &top; stringSize = 1024;
  Extra api{nullptr, callback, nullptr, nullptr};
  instance = GetModuleHandleW(nullptr);
  HWND foreground = GetForegroundWindow();
  HWND wizard = CreateWindowExW(0, L"STATIC", L"NSIS host test", WS_POPUP,
                                -5000, -5000, 500, 360, nullptr, nullptr, instance, nullptr);
  try {
    push(L"license.txt"); push(L"");
    InitSkinPage(wizard, 1024, nullptr, &top, &api);
    auto hwnd = reinterpret_cast<HWND>(_wcstoi64(pop().c_str(), nullptr, 10));
    require(IsWindow(hwnd), "window creation failed");
    ShowWindow(wizard, SW_SHOWNOACTIVATE);
    require(!IsWindowVisible(wizard), "stock wizard became visible");
    SetWindowPos(wizard, nullptr, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    require(!IsWindowVisible(wizard), "stock wizard reappeared through SetWindowPos");
    SetWindowPos(hwnd, nullptr, -4000, -4000, 440, 404, SWP_NOZORDER | SWP_NOACTIVATE);
    ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    require(GetForegroundWindow() == foreground, "foreground stolen");
    for (int p = 0; p < 4; ++p) {
      push(std::to_wstring(p)); push(L"wizardTab"); push(std::to_wstring(reinterpret_cast<INT_PTR>(hwnd)));
      ShowPageItem(nullptr, 1024, nullptr, &top, &api);
      paint(); require(target != nullptr, "transparent D2D target failed");
      require(!hits.empty() || p == 1, "page has no actions");
      if (p == 1) {
        {
          std::lock_guard<std::recursive_mutex> lock(renderMutex);
          values[L"progress_pos:text"] = L"45%";
          values[L"slrProgress:value"] = L"45";
        }
        auto start = progressAnimationStart;
        require(progressSegmentLeft(start + 800) > progressSegmentLeft(start + 400), "animation did not advance");
        require(progressSegmentLeft(start + 1600) == progressSegmentLeft(start), "animation did not loop");
        auto frames = animationFrames.load();
        Sleep(2000);
        require(animationFrames.load() >= frames + 20, "animation froze with blocked NSIS message pump");
        {
          std::lock_guard<std::recursive_mutex> lock(renderMutex);
          require(values[L"progress_pos:text"] == L"45%" && values[L"slrProgress:value"] == L"45", "animation changed progress");
        }
      } else if (p == 2) {
        auto frames = animationFrames.load();
        Sleep(80);
        require(animationFrames.load() == frames && !animationThread.joinable(), "animation survived page change");
      }
    }
    push(L"D:\\YarkText"); push(L"text"); push(L"editDir"); push(L"0");
    SetControlAttribute(nullptr, 1024, nullptr, &top, &api);
    push(L"text"); push(L"editDir"); push(L"0");
    GetControlAttribute(nullptr, 1024, nullptr, &top, &api);
    require(pop() == L"D:\\YarkText", "path roundtrip failed");
    push(L"8"); push(L"btnUnCancel"); push(L"0");
    BindCallBack(nullptr, 1024, nullptr, &top, &api);
    SendMessageW(hwnd, WM_CLOSE, 0, 0);
    require(called == 0, "callback ran inside window procedure");
    ProcessCallbacks(nullptr, 1024, nullptr, &top, &api);
    require(pop() == L"8" && called == 0, "close event polling failed");
    for (int p : {0, 2, 3}) {
      page = p; paint();
      auto controls = hits;
      for (const auto& hit : controls) {
        called = 0;
        callbacks[hit.name] = 9;
        auto before = values[hit.name + L":selected"];
        auto x = static_cast<int>((hit.rect.left + hit.rect.right) / 2);
        auto y = static_cast<int>((hit.rect.top + hit.rect.bottom) / 2);
        SendMessageW(hwnd, WM_MOUSEMOVE, 0, MAKELPARAM(x, y));
        require(hovered == hit.name, "hover tracking failed");
        paint();
        SendMessageW(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, MAKELPARAM(x, y));
        require(pressed == hit.name, "press tracking failed");
        SendMessageW(hwnd, WM_LBUTTONUP, 0, MAKELPARAM(x, y));
        require(called == 0, "click callback was not deferred");
        ProcessCallbacks(nullptr, 1024, nullptr, &top, &api);
        require(hit.check ? (pop() == L"0" && values[hit.name + L":selected"] != before) : pop() == L"9",
                "control click failed");
      }
    }
    SendMessageW(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, MAKELPARAM(50, height - 40));
    SendMessageW(hwnd, WM_LBUTTONUP, 0, MAKELPARAM(200, 140));
    ProcessCallbacks(nullptr, 1024, nullptr, &top, &api);
    require(pop() == L"0", "drag out triggered action");
    SendMessageW(hwnd, WM_MOUSELEAVE, 0, 0);
    require(hovered.empty() && pressed.empty(), "mouse state not cleared");
    auto dc = GetDC(edit);
    auto brush = SendMessageW(hwnd, WM_CTLCOLOREDIT, reinterpret_cast<WPARAM>(dc), reinterpret_cast<LPARAM>(edit));
    require(GetTextColor(dc) == RGB(32, 32, 42) && GetBkColor(dc) == RGB(255, 255, 255), "path contrast failed");
    require(brush != 0 && (GetWindowLongW(edit, GWL_EXSTYLE) & WS_EX_LAYERED), "opaque path surface missing");
    ReleaseDC(edit, dc);
    require(IsWindow(hwnd), "close bypassed NSIS cleanup");
    push(L"0"); ExitDUISetup(nullptr, 1024, nullptr, &top, &api);
    require(!IsWindow(hwnd), "window survived cleanup");
    DestroyWindow(wizard);
    require(GetForegroundWindow() == foreground, "focus changed");
    std::cout << "PASS: four pages, transparent D2D target, path, close callback, cleanup, no activation. Accent API: " << acrylicEnabled << '\n';
    return 0;
  } catch (const std::exception& error) {
    stopAnimation();
    if (window) DestroyWindow(window);
    DestroyWindow(wizard);
    std::cerr << error.what() << '\n'; return 1;
  }
}

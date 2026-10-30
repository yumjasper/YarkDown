#pragma once

#include <tlhelp32.h>

static HANDLE installerMutex;
struct InstallerWindows {
  std::wstring caption;
  std::wstring exePath;
  DWORD pid = 0;
  HWND skin = nullptr;
  HWND wizard = nullptr;
};
// A lock holder may be another YarkText version, so the window is matched by
// caption, by full path, or by the setup executable's name.
static bool isInstallerProcess(DWORD pid, const InstallerWindows& found) {
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!process) return false;
  wchar_t path[32768];
  DWORD size = 32768;
  const bool known = QueryFullProcessImageNameW(process, 0, path, &size) != FALSE;
  CloseHandle(process);
  if (!known) return false;
  if (_wcsicmp(path, found.exePath.c_str()) == 0) return true;
  std::wstring name = path;
  const size_t slash = name.find_last_of(L"\\/");
  if (slash != std::wstring::npos) name.erase(0, slash + 1);
  for (auto& character : name) character = static_cast<wchar_t>(towlower(character));
  return name.find(L"yarktext") != std::wstring::npos &&
    name.find(L"setup") != std::wstring::npos;
}
static BOOL CALLBACK findInstallerHost(HWND hwnd, LPARAM data) {
  auto& found = *reinterpret_cast<InstallerWindows*>(data);
  DWORD pid = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  if (pid == GetCurrentProcessId()) return TRUE;
  wchar_t name[64], title[512];
  GetClassNameW(hwnd, name, 64);
  GetWindowTextW(hwnd, title, 512);
  if (wcscmp(name, L"#32770") != 0) return TRUE;
  if (!isInstallerProcess(pid, found) && found.caption != title) return TRUE;
  found.wizard = hwnd;
  found.pid = pid;
  return FALSE;
}
static BOOL CALLBACK findInstallerSkin(HWND hwnd, LPARAM data) {
  auto& found = *reinterpret_cast<InstallerWindows*>(data);
  DWORD pid = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  wchar_t name[64];
  GetClassNameW(hwnd, name, 64);
  if (pid == found.pid && wcscmp(name, L"YarkAcrylicInstaller") == 0) {
    found.skin = hwnd;
    return FALSE;
  }
  return TRUE;
}
static void releaseInstallerMutex() {
  if (installerMutex) { CloseHandle(installerMutex); installerMutex = nullptr; }
}
// The windowless case still needs a target: the lock holder is a YarkText setup
// process, so the process name identifies it without killing unrelated software.
static DWORD findWindowlessInstaller() {
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) return 0;
  PROCESSENTRY32W entry{};
  entry.dwSize = sizeof(entry);
  DWORD found = 0;
  InstallerWindows probe;
  for (BOOL more = Process32FirstW(snapshot, &entry); more; more = Process32NextW(snapshot, &entry)) {
    if (entry.th32ProcessID == GetCurrentProcessId()) continue;
    std::wstring name = entry.szExeFile;
    for (auto& character : name) character = static_cast<wchar_t>(towlower(character));
    if (name.find(L"yarktext") == std::wstring::npos || name.find(L"setup") == std::wstring::npos) continue;
    if (isInstallerProcess(entry.th32ProcessID, probe)) { found = entry.th32ProcessID; break; }
  }
  CloseHandle(snapshot);
  return found;
}
// Keep the upstream GUID so installers of any version cannot run concurrently.
static bool acquireInstallerInstance(const std::wstring& guid, const std::wstring& caption) {
  const bool offscreen = wcsstr(GetCommandLineW(), L"--acrylic-preview") != nullptr;
  wchar_t self[32768];
  DWORD selfSize = 32768;
  InstallerWindows found;
  found.caption = caption;
  if (GetModuleFileNameW(nullptr, self, selfSize)) found.exePath = self;
  for (;;) {
    SetLastError(ERROR_SUCCESS);
    installerMutex = CreateMutexW(nullptr, FALSE, guid.c_str());
    const DWORD error = GetLastError();
    if (!installerMutex) {
      if (!offscreen) MessageBoxW(nullptr, L"无法创建安装器锁，请检查系统权限后重试。", L"YarkText 安装程序", MB_OK | MB_ICONERROR);
      return false;
    }
    if (error != ERROR_ALREADY_EXISTS) return true;
    found.pid = 0;
    found.skin = nullptr;
    found.wizard = nullptr;
    // The first process can hold the lock before its window has been created.
    for (int attempt = 0; attempt < 30; ++attempt) {
      EnumWindows(findInstallerHost, reinterpret_cast<LPARAM>(&found));
      if (found.pid) {
        EnumWindows(findInstallerSkin, reinterpret_cast<LPARAM>(&found));
        if (found.skin || IsWindowVisible(found.wizard)) break;
      }
      Sleep(100);
    }
    HWND visible = found.skin ? found.skin : IsWindowVisible(found.wizard) ? found.wizard : nullptr;
    DWORD_PTR response = 0;
    const bool responsive = visible && SendMessageTimeoutW(visible, WM_NULL, 0, 0,
      SMTO_ABORTIFHUNG | SMTO_BLOCK, 1500, &response);
    if (responsive) {
      if (!offscreen) {
        ShowWindowAsync(visible, IsIconic(visible) ? SW_RESTORE : SW_SHOW);
        SetForegroundWindow(visible);
      }
      releaseInstallerMutex();
      return false;
    }
    if (offscreen) { releaseInstallerMutex(); return false; }
    // No usable UI is not proof of a dead process; terminating it needs consent.
    int answer = MessageBoxW(nullptr, L"检测到另一个 YarkText 安装器仍在后台运行，但没有可用界面，或暂时无法响应（也可能正在解压文件）。是否结束它并重新打开？选择“否”可等待原安装继续；结束后需要重新安装。", L"YarkText 安装程序", MB_YESNO | MB_DEFBUTTON2 | MB_ICONWARNING);
    if (answer != IDYES) { releaseInstallerMutex(); return false; }
    DWORD targetPid = found.pid ? found.pid : findWindowlessInstaller();
    if (!targetPid) {
      MessageBoxW(nullptr, L"无法定位正在运行的安装器进程。请在任务管理器中结束 YarkText 安装程序后重试。", L"YarkText 安装程序", MB_OK | MB_ICONERROR);
      releaseInstallerMutex();
      return false;
    }
    HANDLE process = OpenProcess(PROCESS_TERMINATE | SYNCHRONIZE, FALSE, targetPid);
    // Re-check the window before terminating so a recycled PID is never killed.
    bool stopped = process && (!found.wizard || (IsWindow(found.wizard) &&
      [&] { DWORD pid = 0; GetWindowThreadProcessId(found.wizard, &pid); return pid == targetPid; }())) &&
      TerminateProcess(process, ERROR_CANCELLED) &&
      WaitForSingleObject(process, 5000) == WAIT_OBJECT_0;
    if (process) CloseHandle(process);
    releaseInstallerMutex();
    if (!stopped) {
      MessageBoxW(nullptr, L"无法结束旧安装器。请在任务管理器中关闭该安装器后重试。", L"YarkText 安装程序", MB_OK | MB_ICONERROR);
      return false;
    }
  }
}

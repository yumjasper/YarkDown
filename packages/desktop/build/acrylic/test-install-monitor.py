"""Watches one real install and reports what the installer is actually doing.

The skin sizes the window per page (404 config, 296 installing, 318 finish), so
the client height names the page. Alongside that this prints the process CPU
time and the number of files under the default install root, which separates
"unpacking is still running" from "unpacking finished but the page never
advanced" - the two failure modes that look identical from a screenshot.
"""
import ctypes as c
from ctypes import wintypes as w
import os
import subprocess
import sys
import time

u = c.WinDLL('user32', use_last_error=True)
k = c.WinDLL('kernel32', use_last_error=True)
callback_type = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
u.EnumWindows.argtypes = [callback_type, w.LPARAM]
u.GetWindowThreadProcessId.argtypes = [w.HWND, c.POINTER(w.DWORD)]
u.GetClassNameW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
u.GetWindowRect.argtypes = [w.HWND, c.POINTER(w.RECT)]
u.ClientToScreen.argtypes = [w.HWND, c.POINTER(w.POINT)]
u.SetCursorPos.argtypes = [c.c_int, c.c_int]
u.GetCursorPos.argtypes = [c.POINTER(w.POINT)]
u.SendInput.argtypes = [w.UINT, c.c_void_p, c.c_int]
u.SendMessageTimeoutW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM, w.UINT, w.UINT, c.POINTER(c.c_size_t)]
u.SendMessageTimeoutW.restype = c.c_ssize_t
u.SetWindowPos.argtypes = [w.HWND, w.HWND, c.c_int, c.c_int, c.c_int, c.c_int, w.UINT]
u.SetForegroundWindow.argtypes = [w.HWND]
u.BringWindowToTop.argtypes = [w.HWND]
u.GetForegroundWindow.restype = w.HWND
u.keybd_event.argtypes = [w.BYTE, w.BYTE, w.DWORD, c.c_size_t]
u.IsWindow.argtypes = [w.HWND]
u.GetWindowLongW.argtypes = [w.HWND, c.c_int]
k.CreateToolhelp32Snapshot.argtypes = [w.DWORD, w.DWORD]
k.CreateToolhelp32Snapshot.restype = w.HANDLE
k.CloseHandle.argtypes = [w.HANDLE]
k.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
k.OpenProcess.restype = w.HANDLE
k.GetProcessTimes.argtypes = [w.HANDLE, c.POINTER(w.FILETIME), c.POINTER(w.FILETIME),
                              c.POINTER(w.FILETIME), c.POINTER(w.FILETIME)]

PAGES = {404: 'config', 296: 'installing', 318: 'finish'}


class ProcessEntry(c.Structure):
    _fields_ = [('size', w.DWORD), ('usage', w.DWORD), ('pid', w.DWORD),
                ('heap', c.c_size_t), ('module', w.DWORD), ('threads', w.DWORD),
                ('parent', w.DWORD), ('priority', w.LONG), ('flags', w.DWORD),
                ('exe', w.WCHAR * 260)]


class MouseInput(c.Structure):
    _fields_ = [('dx', w.LONG), ('dy', w.LONG), ('data', w.DWORD), ('flags', w.DWORD),
                ('time', w.DWORD), ('extra', c.c_size_t)]


class Input(c.Structure):
    _fields_ = [('type', w.DWORD), ('mouse', MouseInput)]


k.Process32FirstW.argtypes = [w.HANDLE, c.POINTER(ProcessEntry)]
k.Process32NextW.argtypes = [w.HANDLE, c.POINTER(ProcessEntry)]


def processes():
    handle = k.CreateToolhelp32Snapshot(2, 0)
    entry = ProcessEntry()
    entry.size = c.sizeof(entry)
    result = {}
    ok = k.Process32FirstW(handle, c.byref(entry))
    while ok:
        result[entry.pid] = entry.parent
        ok = k.Process32NextW(handle, c.byref(entry))
    k.CloseHandle(handle)
    return result


def cpu_seconds(pid):
    handle = k.OpenProcess(0x0400, False, pid)
    if not handle:
        return -1.0
    try:
        creation, exit_t, kernel, user = w.FILETIME(), w.FILETIME(), w.FILETIME(), w.FILETIME()
        if not k.GetProcessTimes(handle, c.byref(creation), c.byref(exit_t), c.byref(kernel), c.byref(user)):
            return -1.0
        ticks = (kernel.dwHighDateTime << 32 | kernel.dwLowDateTime) + \
                (user.dwHighDateTime << 32 | user.dwLowDateTime)
        return ticks / 1e7
    finally:
        k.CloseHandle(handle)


def responsive(hwnd):
    result = c.c_size_t(0)
    return u.SendMessageTimeoutW(hwnd, 0, 0, 0, 0x0002, 800, c.byref(result)) != 0


def page_of(hwnd):
    rect = w.RECT()
    u.GetWindowRect(hwnd, c.byref(rect))
    return rect.bottom - rect.top


def click(client_x, client_y, hwnd):
    point = w.POINT(client_x, client_y)
    u.ClientToScreen(hwnd, c.byref(point))
    u.SetCursorPos(point.x, point.y)
    time.sleep(.2)
    for flag in (0x0002, 0x0004):
        event = Input(0, MouseInput(0, 0, 0, flag, 0, 0))
        u.SendInput(1, c.byref(event), c.sizeof(event))
        time.sleep(.12)


def tree(root):
    count = 0
    total = 0
    for base, _, names in os.walk(root):
        for entry in names:
            count += 1
            try:
                total += os.path.getsize(os.path.join(base, entry))
            except OSError:
                pass
    return count, total / 1048576


target, limit = sys.argv[1], int(sys.argv[2])
default_root = os.path.join(os.environ['LOCALAPPDATA'], 'Programs', 'YarkText')
extra = [a for a in sys.argv[3:] if not a.startswith('--')]
root = extra[0] if extra else default_root
topmost = '--no-topmost' not in sys.argv
saved = w.POINT()
u.GetCursorPos(c.byref(saved))
p = subprocess.Popen([target])
owned = {p.pid}
window = None
try:
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        current = processes()
        for _ in range(5):
            owned.update(pid for pid, parent in current.items() if parent in owned)
        found = []

        @callback_type
        def visit(hwnd, unused):
            pid = w.DWORD()
            u.GetWindowThreadProcessId(hwnd, c.byref(pid))
            name = c.create_unicode_buffer(100)
            u.GetClassNameW(hwnd, name, 100)
            if pid.value in owned and name.value == 'YarkAcrylicInstaller':
                found.append(hwnd)
            return True

        u.EnumWindows(visit, 0)
        if found:
            window = found[0]
            break
        time.sleep(.1)
    if not window:
        raise RuntimeError('installer window not found')

    if topmost:
        u.SetWindowPos(window, w.HWND(-1), 240, 120, 0, 0, 0x0001 | 0x0002)
    else:
        u.SetWindowPos(window, w.HWND(0), 240, 120, 0, 0, 0x0001 | 0x0002)
    # Windows only lets the foreground change for a process that already owns it, so
    # a synthetic Alt tap lifts the restriction before asking for activation.
    for flag in (0x0001, 0x0002):
        u.keybd_event(0x12, 0, flag, 0)
    u.SetForegroundWindow(window)
    u.BringWindowToTop(window)
    time.sleep(1.5)
    print('foreground matches:', u.GetForegroundWindow() == window)
    if u.GetForegroundWindow() != window:
        raise RuntimeError('installer window could not be activated; a real click would land elsewhere')
    print('install root:', root)
    print('page before click:', page_of(window), PAGES.get(page_of(window), '?'))
    click(360, page_of(window) - 38, window)
    print('clicked install')

    last = None
    for tick in range(limit):
        time.sleep(1)
        alive = bool(owned & processes().keys())
        files, size = tree(root)
        cpu = cpu_seconds(p.pid)
        if not alive or not u.IsWindow(window):
            print('t=%3ds installer exited after installing; files=%d size=%.1fMB' % (tick, files, size))
            break
        height = page_of(window)
        name = PAGES.get(height, str(height))
        if (name, responsive(window)) != last:
            print('t=%3ds page=%-10s responsive=%s cpu=%.1fs files=%d size=%.1fMB'
                  % (tick, name, responsive(window), cpu, files, size))
            last = (name, responsive(window))
        elif tick % 5 == 0:
            print('t=%3ds page=%-10s responsive=%s cpu=%.1fs files=%d size=%.1fMB'
                  % (tick, name, responsive(window), cpu, files, size))
        if name == 'finish':
            print('reached finish page at t=%ds; files=%d size=%.1fMB' % (tick, files, size))
            click(360, height - 38, window)
            time.sleep(1.5)
            print('after confirm: alive=%s' % bool(owned & processes().keys()))
            break
    else:
        print('timeout after %ds; last page=%s files=%d size=%.1fMB'
              % (limit, PAGES.get(page_of(window), page_of(window)), files, size))
finally:
    for pid in owned & processes().keys():
        subprocess.run(['taskkill', '/PID', str(pid), '/F'], capture_output=True)
    u.SetCursorPos(saved.x, saved.y)

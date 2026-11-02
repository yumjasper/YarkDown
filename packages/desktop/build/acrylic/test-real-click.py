"""Clicks a real installer button with real mouse input and reports whether it reacts.

PostMessage bypasses the activation and capture rules that apply to a real click,
so a button can pass the posted-message test and still look dead to a user. This
harness moves the pointer, presses and releases for real, then measures whether
the installer window stays responsive and whether the process exits.
"""
import ctypes as c
from ctypes import wintypes as w
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
u.SendInput.restype = w.UINT
u.SendMessageTimeoutW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM, w.UINT, w.UINT, c.POINTER(c.c_size_t)]
u.SendMessageTimeoutW.restype = c.c_ssize_t
u.GetWindowLongW.argtypes = [w.HWND, c.c_int]
u.IsWindowEnabled.argtypes = [w.HWND]
u.SetWindowPos.argtypes = [w.HWND, w.HWND, c.c_int, c.c_int, c.c_int, c.c_int, w.UINT]
u.SetForegroundWindow.argtypes = [w.HWND]
u.BringWindowToTop.argtypes = [w.HWND]
u.GetForegroundWindow.restype = w.HWND
k.CreateToolhelp32Snapshot.argtypes = [w.DWORD, w.DWORD]
k.CreateToolhelp32Snapshot.restype = w.HANDLE
k.CloseHandle.argtypes = [w.HANDLE]


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


def responsive(hwnd):
    result = c.c_size_t(0)
    code = u.SendMessageTimeoutW(hwnd, 0, 0, 0, 0x0002, 1500, c.byref(result))
    return code != 0


def click(screen_x, screen_y):
    u.SetCursorPos(screen_x, screen_y)
    time.sleep(.15)
    for flag in (0x0002, 0x0004):
        event = Input(0, MouseInput(0, 0, 0, flag, 0, 0))
        if not u.SendInput(1, c.byref(event), c.sizeof(event)):
            raise RuntimeError('SendInput failed: %d' % c.get_last_error())
        time.sleep(.12)


target = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else 'cancel'
offset = (68, 366) if label == 'cancel' else (360, 366)

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
    u.SetWindowPos(window, w.HWND(-1), 200, 100, 0, 0, 0x0001 | 0x0002 | 0x0040)
    u.SetForegroundWindow(window)
    u.BringWindowToTop(window)
    time.sleep(1.5)
    point = w.POINT(offset[0], offset[1])
    u.ClientToScreen(window, c.byref(point))
    print('window responsive before click:', responsive(window))
    print('foreground window matches:', u.GetForegroundWindow() == window)
    print('clicking %s at screen %d,%d' % (label, point.x, point.y))
    click(point.x, point.y)
    time.sleep(1)
    alive = owned & processes().keys()
    print('owned processes alive after 1s:', sorted(alive))
    if window and alive:
        print('window responsive after click:', responsive(window))
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if not (owned & processes().keys()):
            print('RESULT: installer exited after %s click' % label)
            break
        time.sleep(.2)
    else:
        print('RESULT: installer STILL ALIVE 20s after %s click' % label)
        for pid in owned & processes().keys():
            subprocess.run(['taskkill', '/PID', str(pid), '/F'], capture_output=True)
finally:
    for pid in owned & processes().keys():
        subprocess.run(['taskkill', '/PID', str(pid), '/F'], capture_output=True)
    u.SetCursorPos(saved.x, saved.y)

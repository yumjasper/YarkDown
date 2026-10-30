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
u.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
u.GetForegroundWindow.restype = w.HWND
k.CreateToolhelp32Snapshot.argtypes = [w.DWORD, w.DWORD]
k.CreateToolhelp32Snapshot.restype = w.HANDLE
k.CloseHandle.argtypes = [w.HANDLE]

class ProcessEntry(c.Structure):
    _fields_ = [('size', w.DWORD), ('usage', w.DWORD), ('pid', w.DWORD),
                ('heap', c.c_size_t), ('module', w.DWORD), ('threads', w.DWORD),
                ('parent', w.DWORD), ('priority', w.LONG), ('flags', w.DWORD),
                ('exe', w.WCHAR * 260)]

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

foreground = u.GetForegroundWindow()


def owns_foreground():
    current = u.GetForegroundWindow()
    if not current:
        return False
    pid = w.DWORD()
    u.GetWindowThreadProcessId(current, c.byref(pid))
    return pid.value in owned


p = subprocess.Popen([sys.argv[1], '--acrylic-preview'])
owned = {p.pid}
window = None
try:
    deadline = time.monotonic() + 20
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
        raise RuntimeError(f'Packaged Acrylic window not found; parent exit={p.poll()}, owned={owned}, live={owned & current.keys()}')
    rect = w.RECT()
    u.GetWindowRect(window, c.byref(rect))
    if rect.left > -1000 or rect.top > -1000:
        raise RuntimeError('Preview window was not offscreen')
    if '--duplicate' in sys.argv[2:]:
        duplicate = subprocess.Popen([sys.argv[1], '--acrylic-preview'])
        owned.add(duplicate.pid)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            current = processes()
            for _ in range(5):
                owned.update(pid for pid, parent in current.items() if parent in owned)
            if duplicate.poll() is not None:
                break
            time.sleep(.1)
        else:
            raise RuntimeError('Duplicate installer did not exit')
        if p.poll() is not None:
            raise RuntimeError('Duplicate launch terminated the first installer')
        print('PASS: duplicate launch exits while original remains alive')
    point = 68 | ((rect.bottom - rect.top - 38) << 16)

    u.PostMessageW(window, 0xF, 0, 0)
    time.sleep(1)
    for message, flags in [(0x200, 0), (0x201, 1), (0x202, 0)]:
        if not u.PostMessageW(window, message, flags, point):
            raise RuntimeError('Cannot post cancel input')
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        current = processes()
        if not (owned & current.keys()):
            if owns_foreground():
                raise RuntimeError('Installer stole the foreground during test')
            print('PASS: packaged installer cancel exits all owned processes, no activation')
            break
        time.sleep(.1)
    else:
        raise RuntimeError('Packaged cancel hung for 10 seconds')
finally:
    current = processes()
    for pid in owned & current.keys():
        subprocess.run(['taskkill', '/PID', str(pid), '/F'], capture_output=True)

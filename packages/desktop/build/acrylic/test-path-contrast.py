"""Measures the composited path row of a real installer build.

The path text only exists as DWM composite output, so this captures the screen
region instead of asking the window to render itself.
"""
import ctypes as c
from ctypes import wintypes as w
import subprocess
import sys
import time

try:
    from PIL import ImageGrab
except ImportError:
    raise SystemExit('Pillow is required: pip install pillow')

u = c.WinDLL('user32', use_last_error=True)
k = c.WinDLL('kernel32', use_last_error=True)
callback_type = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
u.EnumWindows.argtypes = [callback_type, w.LPARAM]
u.GetWindowThreadProcessId.argtypes = [w.HWND, c.POINTER(w.DWORD)]
u.GetClassNameW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
u.SetWindowPos.argtypes = [w.HWND, w.HWND, c.c_int, c.c_int, c.c_int, c.c_int, w.UINT]
u.ShowWindow.argtypes = [w.HWND, c.c_int]
u.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
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


def measure(image, box):
    crop = image.crop(box).convert('RGB')
    pixels = list(crop.getdata())
    dark = min(int(.299 * r + .587 * g + .114 * b) for r, g, b in pixels)
    ink = sum(1 for r, g, b in pixels if int(.299 * r + .587 * g + .114 * b) < 200)
    return dark, round(ink * 100 / len(pixels), 2)


p = subprocess.Popen([sys.argv[1], '--acrylic-preview'])
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
        raise RuntimeError('packaged Acrylic window not found')
    left, top = 240, 240
    u.SetWindowPos(window, w.HWND(-1), left, top, 440, 404, 0x0040 | 0x0010)
    u.PostMessageW(window, 0xF, 0, 0)
    time.sleep(1.2)
    u.PostMessageW(window, 0xF, 0, 0)
    time.sleep(.6)
    shot = ImageGrab.grab(bbox=(left, top, left + 440, top + 404), all_screens=True)
    print('path', measure(shot, (36, 226, 318, 248)))
    print('hint', measure(shot, (24, 175, 300, 192)))
    print('title', measure(shot, (24, 30, 200, 60)))
    print('button', measure(shot, (330, 220, 410, 250)))
    shot.save(sys.argv[2] if len(sys.argv) > 2 else 'path-shot.png')
finally:
    current = processes()
    for pid in owned & current.keys():
        subprocess.run(['taskkill', '/PID', str(pid), '/F'], capture_output=True)

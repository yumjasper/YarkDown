"""Samples the progress strip during a real install and reports whether it moves.

The user's complaint is not "the install is slow" but "the bar does not move", so
this measures the only thing that answers it: the horizontal centre of the dark
segment inside the track, sampled several times a second while the installer is
actually writing files. A frozen bar produces one repeated value; a running bar
produces many.
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
u.GetWindowRect.argtypes = [w.HWND, c.POINTER(w.RECT)]
u.ClientToScreen.argtypes = [w.HWND, c.POINTER(w.POINT)]
u.SetCursorPos.argtypes = [c.c_int, c.c_int]
u.GetCursorPos.argtypes = [c.POINTER(w.POINT)]
u.SendInput.argtypes = [w.UINT, c.c_void_p, c.c_int]
u.SetWindowPos.argtypes = [w.HWND, w.HWND, c.c_int, c.c_int, c.c_int, c.c_int, w.UINT]
u.SetForegroundWindow.argtypes = [w.HWND]
u.IsWindow.argtypes = [w.HWND]
k.CreateToolhelp32Snapshot.argtypes = [w.DWORD, w.DWORD]
k.CreateToolhelp32Snapshot.restype = w.HANDLE
k.CloseHandle.argtypes = [w.HANDLE]
k.Process32FirstW.argtypes = [w.HANDLE, c.POINTER(type('P', (c.Structure,), {'_fields_': [
    ('size', w.DWORD), ('usage', w.DWORD), ('pid', w.DWORD), ('heap', c.c_size_t),
    ('module', w.DWORD), ('threads', w.DWORD), ('parent', w.DWORD), ('priority', w.LONG),
    ('flags', w.DWORD), ('exe', w.WCHAR * 260)]}))]


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


def click(client_x, client_y, hwnd):
    point = w.POINT(client_x, client_y)
    u.ClientToScreen(hwnd, c.byref(point))
    u.SetCursorPos(point.x, point.y)
    time.sleep(.2)
    for flag in (0x0002, 0x0004):
        event = Input(0, MouseInput(0, 0, 0, flag, 0, 0))
        u.SendInput(1, c.byref(event), c.sizeof(event))
        time.sleep(.12)


def segment_centre(hwnd):
    """Returns the centre of the dark pixels in the progress strip, or None."""
    origin = w.POINT(24, 224)
    u.ClientToScreen(hwnd, c.byref(origin))
    box = (origin.x, origin.y, origin.x + 392, origin.y + 6)
    image = ImageGrab.grab(box, all_screens=True).convert('L')
    width, height = image.size
    pixels = image.load()
    total = 0
    weight = 0
    for y in range(height):
        for x in range(width):
            if pixels[x, y] < 110:
                total += 1
                weight += x
    return None if not total else weight / total


target, limit = sys.argv[1], int(sys.argv[2])
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

    u.SetWindowPos(window, w.HWND(-1), 200, 100, 0, 0, 0x0001 | 0x0002)
    u.SetForegroundWindow(window)
    time.sleep(1.2)
    click(360, 366, window)
    print('clicked install; sampling the strip')

    samples = []
    deadline = time.monotonic() + limit
    while time.monotonic() < deadline:
        if not u.IsWindow(window):
            break
        centre = segment_centre(window)
        if centre is not None:
            samples.append((round(time.monotonic() - (deadline - limit), 1), round(centre, 1)))
        time.sleep(.25)

    values = [v for _, v in samples]
    distinct = len(set(values))
    print('samples:', len(values))
    print('first ten:', samples[:10])
    print('distinct positions:', distinct)
    print('RESULT:', 'MOVING' if distinct >= 5 else 'FROZEN')
finally:
    for pid in owned & processes().keys():
        subprocess.run(['taskkill', '/PID', str(pid), '/F'], capture_output=True)
    u.SetCursorPos(saved.x, saved.y)

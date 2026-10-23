# VieNeu voice server on Windows, started at sign-in by the HKCU Run value that
# vieneu-autostart.ps1 writes (.venv\Scripts\pythonw.exe run-vieneu.pyw). pythonw has no console, so
# nothing flashes at sign-in, and no hidden "powershell -ExecutionPolicy Bypass" sits in Startup for
# an antivirus to flag.
#   run-vieneu.pyw            supervisor: one per user (mutex), restarts the server 10 s after it stops,
#                             and runs dichphude-update.py every 30 min (the macOS twin is a LaunchAgent)
#   run-vieneu.pyw --serve    the server itself, in this process; it reads the pinned model in
#                             models\hf, offline, whenever vieneu-pin.py has marked that copy and
#                             every file the marker lists is still there at its size
# ASCII only, like the other Windows helpers.
import ctypes
import os
import subprocess
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = os.environ.get("VIENEU_PORT", "8000")
ABOVE_NORMAL_PRIORITY_CLASS = 0x8000
CREATE_NO_WINDOW = 0x08000000
ERROR_ALREADY_EXISTS = 183


class _Throttling(ctypes.Structure):
    _fields_ = [("Version", ctypes.c_ulong), ("ControlMask", ctypes.c_ulong), ("StateMask", ctypes.c_ulong)]


def _keep_full_speed(k):
    # A voice made too slowly arrives late on screen. AboveNormal priority, and out of Windows 11
    # power throttling (EcoQoS), which otherwise may slow a process that has no window.
    me = k.GetCurrentProcess()
    k.SetPriorityClass(me, ABOVE_NORMAL_PRIORITY_CLASS)
    try:
        st = _Throttling(1, 0x1 | 0x4, 0)   # EXECUTION_SPEED | IGNORE_TIMER_RESOLUTION, both off
        k.SetProcessInformation(me, 4, ctypes.byref(st), ctypes.sizeof(st))   # 4 = ProcessPowerThrottling
    except Exception:
        pass                                 # Windows older than 10 1709: nothing to switch off


def pinned_copy_ok(hf):
    # The marker lists what vieneu-pin.py checked: "ref <revision> <path>" and "size <bytes> <path>",
    # paths relative to models\hf with "/". Stat only, so a start costs a few milliseconds; a file
    # deleted or cut short since then fails it. The same check as the macOS start line.
    try:
        with open(os.path.join(hf, ".pinned-ok"), encoding="utf-8") as f:
            lines = f.read().splitlines()
    except (OSError, ValueError):
        return False
    sizes = 0
    for line in lines:
        parts = line.split(" ", 2)
        if len(parts) != 3 or parts[0] not in ("ref", "size"):
            continue
        path = os.path.join(hf, *parts[2].split("/"))
        try:
            if parts[0] == "ref":
                with open(path, encoding="utf-8") as f:
                    if f.read().strip() != parts[1]:
                        return False
            elif os.path.getsize(path) != int(parts[1]):
                return False
            else:
                sizes += 1
        except (OSError, ValueError):
            return False
    return sizes > 0


def use_pinned_model():
    # The pinned model (vieneu-pin.py --install) is read only while its marker exists and every
    # file it lists is whole, decided at every start, before huggingface_hub is imported (it reads
    # these at import). Otherwise VieNeu fetches the model itself, as before: online, but talking.
    # Returns "offline", "incomplete" (a marker over a damaged copy) or "online".
    hf = os.path.join(HERE, "models", "hf")
    if pinned_copy_ok(hf):
        os.environ.update(HF_HOME=hf, HF_HUB_OFFLINE="1")
        return "offline"
    return "incomplete" if os.path.isfile(os.path.join(hf, ".pinned-ok")) else "online"


def serve():
    k = ctypes.WinDLL("kernel32", use_last_error=True)
    k.GetCurrentProcess.restype = ctypes.c_void_p
    k.SetPriorityClass.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    k.SetProcessInformation.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_ulong]
    _keep_full_speed(k)
    # CPU by default. A user environment variable (setx VIENEU_BACKEND pytorch, setx VIENEU_DEVICE
    # cuda, see docs/WINDOWS.md) wins, so an NVIDIA machine can opt in without editing this file.
    for k, v in (("VIENEU_BACKEND", "onnx"), ("VIENEU_DEVICE", "cpu"), ("VIENEU_PRECISION", "fp32")):
        os.environ.setdefault(k, v)
    os.environ.update(HOST="127.0.0.1", PORT=PORT, VIENEU_QUEUE="4", VIENEU_QUEUE_TIMEOUT="20",
                      PYTHONIOENCODING="utf-8")
    pinned = use_pinned_model()
    os.chdir(HERE)
    sys.path.insert(0, HERE)
    # pythonw has no stdout/stderr; logging and uvicorn need one. Overwritten at each start, so the
    # log never grows without end.
    log = open(os.path.join(HERE, "server.log"), "w", encoding="utf-8", buffering=1)
    sys.stdout = sys.stderr = log
    print({"offline": "VieNeu model: pinned copy in models/hf, offline",
           "incomplete": "VieNeu model: pinned copy incomplete, fetched from Hugging Face"}.get(
        pinned, "VieNeu model: no pinned copy, fetched from Hugging Face"))
    import runpy
    sys.argv = ["apps.openai_speech"]
    runpy.run_module("apps.openai_speech", run_name="__main__", alter_sys=True)


def update_loop():
    updater = os.path.join(HERE, "dichphude-update.py")
    time.sleep(5)                            # at sign-in, before Chrome opens: a staged update lands now
    while True:
        if os.path.exists(updater):
            try:
                # Hours, not minutes: a first pinned-model download (600 MB) on a slow line
                subprocess.run([sys.executable, updater], cwd=HERE, creationflags=CREATE_NO_WINDOW, timeout=4 * 3600)
            except Exception:
                pass
        time.sleep(1800)


def supervise():
    k = ctypes.WinDLL("kernel32", use_last_error=True)
    k.CreateMutexW.restype = ctypes.c_void_p
    k.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
    mutex = k.CreateMutexW(None, 0, "Local\\DichPhuDeVieNeu")
    if not mutex or ctypes.get_last_error() == ERROR_ALREADY_EXISTS:
        return                               # already running for this user
    threading.Thread(target=update_loop, daemon=True).start()
    while True:
        p = subprocess.Popen([sys.executable, os.path.abspath(__file__), "--serve"], cwd=HERE,
                             creationflags=CREATE_NO_WINDOW)
        p.wait()
        time.sleep(10)


if __name__ == "__main__":
    serve() if "--serve" in sys.argv else supervise()

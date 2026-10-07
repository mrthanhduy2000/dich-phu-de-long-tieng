# Background updater for a friend's install (put in place by install-mac.sh / install-windows.ps1 as
# <VieNeu>/dichphude-update.py, run with VieNeu's own Python: every 30 min by a LaunchAgent on macOS,
# by the run-vieneu.pyw supervisor on Windows).
#
# Every 6 hours it asks GitHub for the version; a newer one is downloaded into <VieNeu>/.dpd-staged.
# The staged copy goes over the extension folder only while Chrome is NOT running (at sign-in, or
# after the user quits Chrome): Chrome reads an unpacked extension from disk when it starts, so the
# next start runs the new version, and a running Chrome never mixes old and new files. Not
# chrome.runtime.reload(): in every headless test it left the extension blocked (2026-10-08), and
# that loses the user's settings and API key; the restart path is the one Chrome guarantees.
# The extension folder keeps its path (Chrome keys settings to it); only its files change.
#   python dichphude-update.py          normal run
#   python dichphude-update.py --now    ask GitHub now, whatever the 6-hour gap (tests)
# Standard library only, ASCII only (the Windows helpers' rule).
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile

REPO = "mrthanhduy2000/dich-phu-de-long-tieng"
HERE = os.path.dirname(os.path.abspath(__file__))           # the VieNeu folder
STAGE = os.path.join(HERE, ".dpd-staged")
STATE = os.path.join(HERE, ".dpd-update.json")
LOG = os.path.join(HERE, "update.log")
CHECK_EVERY_S = 6 * 3600
WINDOWS = sys.platform == "win32"


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    try:
        old = open(LOG, encoding="utf-8").read().splitlines()[-199:] if os.path.exists(LOG) else []
        with open(LOG, "w", encoding="utf-8") as f:
            f.write("\n".join(old + [line]) + "\n")
    except OSError:
        pass


def vtuple(v):
    return tuple(int(x) for x in str(v).split(".") if x.isdigit())


def manifest_version(folder):
    try:
        with open(os.path.join(folder, "manifest.json"), encoding="utf-8") as f:
            return json.load(f)["version"]
    except (OSError, ValueError, KeyError):
        return "0"


def ext_dir():
    with open(os.path.join(HERE, ".dichphude-ext"), encoding="utf-8-sig") as f:
        return f.read().strip()


def chrome_running():
    try:
        if WINDOWS:
            out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq chrome.exe", "/NH"], capture_output=True,
                                 text=True, creationflags=0x08000000).stdout   # no console window
            return "chrome.exe" in out.lower()
        return subprocess.run(["pgrep", "-x", "Google Chrome"], capture_output=True).returncode == 0
    except OSError:
        return True                          # cannot tell: do not touch the files


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "dichphude-update"})
    return urllib.request.urlopen(req, timeout=timeout)


def stage(remote):
    tmp = tempfile.mkdtemp(prefix="dpd-")
    try:
        zpath = os.path.join(tmp, "share.zip")
        with fetch("https://codeload.github.com/%s/zip/refs/heads/main" % REPO, 300) as r, open(zpath, "wb") as f:
            shutil.copyfileobj(r, f)
        with zipfile.ZipFile(zpath) as z:
            z.extractall(tmp)
        top = next(os.path.join(tmp, d) for d in os.listdir(tmp) if os.path.isdir(os.path.join(tmp, d)))
        got = manifest_version(os.path.join(top, "extension"))
        if vtuple(got) != vtuple(remote):
            log("zip holds %s, expected %s: GitHub still updating, next time" % (got, remote))
            return False
        shutil.rmtree(STAGE, ignore_errors=True)
        shutil.copytree(os.path.join(top, "extension"), STAGE)
        shutil.copy2(os.path.join(top, "vieneu", "openai_speech.py"), os.path.join(STAGE, ".openai_speech.py"))
        log("staged %s" % remote)
        return True
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def same(a, b):
    try:
        with open(a, "rb") as fa, open(b, "rb") as fb:
            return fa.read() == fb.read()
    except OSError:
        return False


def apply(ext):
    staged = manifest_version(STAGE)
    patch = os.path.join(STAGE, ".openai_speech.py")
    keep = set()
    for root, _dirs, files in os.walk(STAGE):
        rel = os.path.relpath(root, STAGE)
        os.makedirs(os.path.join(ext, rel), exist_ok=True)
        for name in files:
            if rel == "." and name == ".openai_speech.py":
                continue
            src, dst = os.path.join(root, name), os.path.join(ext, rel, name)
            keep.add(os.path.normcase(os.path.normpath(dst)))
            shutil.copy2(src, dst)
    for root, _dirs, files in os.walk(ext, topdown=False):
        for name in files:
            p = os.path.join(root, name)
            if os.path.normcase(os.path.normpath(p)) not in keep:
                os.remove(p)
        if root != ext and not os.listdir(root):
            os.rmdir(root)
    # VieNeu's patched server file and the Windows runner take effect at the next server start
    if os.path.exists(patch) and not same(patch, os.path.join(HERE, "apps", "openai_speech.py")):
        shutil.copy2(patch, os.path.join(HERE, "apps", "openai_speech.py"))
    runner = os.path.join(ext, "tools", "vieneu-runner.pyw")
    if WINDOWS and os.path.exists(runner) and not same(runner, os.path.join(HERE, "run-vieneu.pyw")):
        shutil.copy2(runner, os.path.join(HERE, "run-vieneu.pyw"))
    me = os.path.join(ext, "tools", "dichphude-update.py")
    if os.path.exists(me) and not same(me, os.path.abspath(__file__)):
        shutil.copy2(me, os.path.abspath(__file__))
    shutil.rmtree(STAGE, ignore_errors=True)
    log("applied %s (Chrome was closed; its next start runs it)" % staged)


def main():
    now = "--now" in sys.argv
    ext = ext_dir()
    local = manifest_version(ext)
    try:
        state = json.load(open(STATE, encoding="utf-8"))
    except (OSError, ValueError):
        state = {}
    if now or time.time() - state.get("checked", 0) > CHECK_EVERY_S:
        with fetch("https://raw.githubusercontent.com/%s/main/extension/manifest.json" % REPO, 30) as r:
            remote = json.load(r)["version"]
        state["checked"] = time.time()
        json.dump(state, open(STATE, "w", encoding="utf-8"))
        best = max(vtuple(local), vtuple(manifest_version(STAGE)))
        if vtuple(remote) > best:
            stage(remote)
    if os.path.isdir(STAGE):
        if vtuple(manifest_version(STAGE)) <= vtuple(local):
            shutil.rmtree(STAGE, ignore_errors=True)
        elif chrome_running():
            pass                                  # wait for Chrome to close
        else:
            apply(ext)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:                        # offline, GitHub down: try again next run
        log("error: %s: %s" % (type(e).__name__, e))

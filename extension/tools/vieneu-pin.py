# Check, install or rebuild the pinned VieNeu model that the voice server reads offline.
#
# The pin is vieneu-model.json (next to this file in the share build, tools/share/ in the repo):
# every model file the server loads, at a fixed Hugging Face revision, with its size and sha256, the
# GitHub release that mirrors those files, and the voices file that lives in the VieNeu code. The
# server reads the copy through HF_HOME=<VieNeu>/models/hf and HF_HUB_OFFLINE=1 whenever the marker
# <VieNeu>/models/hf/.pinned-ok exists and every file it lists is there at its size (docs/DUBBING.md
# "Pinned model"), so nothing is fetched at start and nothing sits in ~/.cache, which disk cleaners
# empty.
#
#   python vieneu-pin.py                verify the local copy and the voices file (offline, hashes)
#   python vieneu-pin.py --quick        the same in a few stat calls (exit 0 = marker current, every
#                                       file at its pinned size, refs/main on the pinned revision)
#   python vieneu-pin.py --install      download what is missing or wrong, check every byte, mark it
#   python vieneu-pin.py --fetch        the author's rebuild through huggingface_hub, then verify
# Options: --vieneu DIR (default ~/VieNeu-TTS), --hf-home DIR (default <vieneu>/models/hf),
#   --pin FILE, and for --install: --base-url URL (the release mirror, file:// or http(s); tests;
#   the environment variable DPD_MODEL_URL does the same where the updater runs it),
#   --no-hf (never fall back to Hugging Face; DPD_MODEL_NO_HF=1 does the same, for tests),
#   --if-changed (stop at once when the quick check passes: what the background updater ran).
#
# --install uses the standard library only: it runs with the Python of a fresh VieNeu install on
# macOS and Windows (the installers, tools/dichphude-update.py). Each file comes from the project's
# GitHub release, else from Hugging Face at the pinned revision (never "main"); it is streamed to
# <file>.part, resumed after a cut, checked for size and sha256, then moved into place. refs/main and
# the marker are written only once every file matches. Exit 0 = every file matches, 1 = it does not,
# 2 = another install holds the lock.
# The marker is the receipt of that check: the pin's identity, a blank line, then one line per
# refs/main ("ref <revision> <path>") and per file ("size <bytes> <path>"), paths relative to HF_HOME
# with "/". The start scripts (vieneu-autostart.command, the installer's cst-start.command,
# vieneu-runner.pyw) read those lines and stat each file, so a deleted or truncated file sends the
# server online instead of into a crash loop; they need neither this file nor the pin.
# --fetch needs huggingface_hub: run it with ~/VieNeu-TTS/.venv/bin/python.
# The installer output is read by Vietnamese users, so --install talks Vietnamese, without marks:
# this file stays ASCII only, like every helper the Windows installer runs.
import argparse
import hashlib
import json
import os
import shutil
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
# Share build: extension/tools/vieneu-model.json. Private repo: tools/share/vieneu-model.json.
PIN_PLACES = [os.path.join(HERE, "vieneu-model.json"), os.path.join(HERE, "share", "vieneu-model.json")]
MARKER = ".pinned-ok"          # in HF_HOME; the server start scripts look for it
LOCK = ".pin-lock"             # in HF_HOME; one install at a time (installer vs background updater)
LOCK_STALE_S = 600             # a live install touches the lock at least every 30 s
UA = "dichphude-vieneu-pin"
TRIES = 3                      # per source and file: attempts in a row that received no byte
FILE_WALL_S = 2 * 3600         # per source and file, however much each attempt received
RETRY_AFTER_CAP_S = 30         # the longest a server's Retry-After is honoured
BLOCK = 1 << 20
FREE_MARGIN = 200 * 1000 * 1000
SNAPSHOT_NAME_LEN = 40         # a Hugging Face commit hash


def say(msg=""):
    print(msg, flush=True)


# ---- pin and layout ----

def find_pin(explicit=None):
    for p in ([explicit] if explicit else PIN_PLACES):
        if p and os.path.isfile(p):
            return p
    return None


def load_pin(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def repo_rel(repo):
    # A repo's folder relative to HF_HOME, with "/" (the marker's paths)
    return "hub/models--" + repo.replace("/", "--")


def repo_dir(hf_home, repo):
    return os.path.join(hf_home, *repo_rel(repo).split("/"))


def snapshot_dir(hf_home, repo, revision):
    return os.path.join(repo_dir(hf_home, repo), "snapshots", revision)


def ref_path(hf_home, repo):
    return os.path.join(repo_dir(hf_home, repo), "refs", "main")


def file_path(hf_home, r, f):
    return os.path.join(snapshot_dir(hf_home, r["repo"], r["revision"]), *f["path"].split("/"))


def asset_name(repo, path):
    # Release assets cannot hold folders: <repo name>__<path with / as __>, deterministic
    return repo.split("/")[-1] + "__" + path.replace("/", "__")


def release_tag(pin):
    # Both revisions: a change to either repo alone must not overwrite the assets an older pin names
    return "vieneu-model-" + "-".join(r["revision"][:7] for r in pin["repos"])


def voices_commit(pin):
    return (pin.get("voices") or {}).get("commit")


def pin_id(pin):
    # What the marker starts with: every revision, the VieNeu commit the voices come from, plus a
    # digest of the file list, so any change to what is pinned (a revision, the VieNeu code, a file
    # added or rehashed) reads as a different pin.
    h = hashlib.sha256()
    lines = []
    for r in pin["repos"]:
        lines.append("%s@%s" % (r["repo"], r["revision"]))
        for f in r["files"]:
            h.update(("%s/%s %d %s\n" % (r["repo"], f["path"], f["size"], f["sha256"])).encode("ascii"))
    if voices_commit(pin):
        lines.append("voices " + voices_commit(pin))
    lines.append("files " + h.hexdigest()[:16])
    return "\n".join(lines) + "\n"


def marker_text(pin):
    # The pin's identity, a blank line, then what the start scripts stat (see the top of this file)
    body = []
    for r in pin["repos"]:
        rel = repo_rel(r["repo"])
        body.append("ref %s %s/refs/main" % (r["revision"], rel))
        for f in r["files"]:
            body.append("size %d %s/snapshots/%s/%s" % (f["size"], rel, r["revision"], f["path"]))
    return pin_id(pin) + "\n" + "\n".join(body) + "\n"


def marker_header(text):
    return text.split("\n\n", 1)[0] + "\n"


def read_text(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except (OSError, ValueError):
        return None


def marker_current(pin, hf_home):
    text = read_text(os.path.join(hf_home, MARKER))
    return text is not None and marker_header(text) == pin_id(pin)


def quick_ok(pin, hf_home):
    # Stat only, no hashing (the updater runs it every 30 min): the marker names this pin, every
    # pinned file is there at its pinned size, and each refs/main names its pinned revision. A file
    # deleted or cut short since the install fails it; a same-size corruption needs the full verify.
    if not marker_current(pin, hf_home):
        return False
    for r in pin["repos"]:
        if (read_text(ref_path(hf_home, r["repo"])) or "").strip() != r["revision"]:
            return False
        for f in r["files"]:
            try:
                if os.path.getsize(file_path(hf_home, r, f)) != f["size"]:
                    return False
            except OSError:
                return False
    return True


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(BLOCK), b""):
            h.update(block)
    return h.hexdigest()


def problem(path, size, digest):
    # None when the file is there with the pinned bytes, else what is wrong
    if not os.path.isfile(path):
        return "MISSING"
    if os.path.getsize(path) != size:
        return "SIZE"
    if sha256(path) != digest:
        return "SHA256"
    return None


# ---- verify (the author's check, and CI) ----

def check(label, path, size, digest):
    p = problem(path, size, digest)
    if p == "SIZE":
        print("SIZE     %s (%d, want %d)" % (label, os.path.getsize(path), size))
    elif p:
        print("%-8s %s" % (p, label))
    else:
        print("ok       %8.1f MB  %s" % (size / 1e6, label))
    return p is None


def verify(pin, hf_home, vieneu):
    good = True
    for r in pin["repos"]:
        for f in r["files"]:
            good &= check(r["repo"].split("/")[1] + "/" + f["path"], file_path(hf_home, r, f), f["size"], f["sha256"])
        # Offline lookups resolve "main" through refs/main; a copy without it fails at server start.
        ref = read_text(ref_path(hf_home, r["repo"]))
        if ref is None or ref.strip() != r["revision"]:
            print("REF      %s refs/main is not %s" % (r["repo"], r["revision"][:7]))
            good = False
    v = pin["voices"]
    good &= check("VieNeu code/" + v["path"], os.path.join(vieneu, v["path"]), v["size"], v["sha256"])
    if good and not marker_current(pin, hf_home):
        # The start scripts go offline only behind the marker: without it the copy is not used
        print("note     no %s for this pin: the start scripts run online; --install writes it (no download)" % MARKER)
    return good


# ---- fetch (the author's rebuild) ----

def remote_main(repo):
    # Where "main" is on Hugging Face now, only to say so: it never decides what is downloaded
    try:
        from huggingface_hub import HfApi
        return HfApi().model_info(repo, revision="main").sha
    except Exception as e:
        print("note     could not ask Hugging Face where %s main is (%s: %s)" % (repo, type(e).__name__, e))
        return None


def fetch(pin, hf_home):
    from huggingface_hub import snapshot_download
    for r in pin["repos"]:
        # The pinned commit, never "main": a moved main can neither write files nor move refs/main.
        # A download by commit hash writes no ref, so refs/main (needed offline) is written here.
        snapshot_download(r["repo"], revision=r["revision"], cache_dir=os.path.join(hf_home, "hub"),
                          allow_patterns=[f["path"] for f in r["files"]])
        write_atomic(ref_path(hf_home, r["repo"]), r["revision"])
        main = remote_main(r["repo"])
        if main and main != r["revision"]:
            print("note     %s main is now %s, the pin is %s: the copy stays on the pin; review that change "
                  "before moving the pin" % (r["repo"], main[:7], r["revision"][:7]))


# ---- install (friends' machines; standard library only) ----

class BadBytes(Exception):
    """The source served other bytes than the pin names (or refused the file): do not retry it."""


class CorruptPrefix(BadBytes):
    """A resumed .part did not hash: its earlier bytes were wrong. Removed; worth one try from zero."""


class Gone(Exception):
    """The source does not have the file (404, 410): do not retry it."""


class Blocked(Exception):
    """401/403/407: a network, firewall or proxy refuses the source; not a missing release."""


class Retry(Exception):
    """408/425/429/5xx: the server asks to come back; delay is its Retry-After in seconds, or None."""

    def __init__(self, msg, delay=None):
        Exception.__init__(self, msg)
        self.delay = delay


_certifi_ctx = []


def urlopen(req):
    ctx = _certifi_ctx[0] if _certifi_ctx else None
    try:
        return urllib.request.urlopen(req, timeout=60, context=ctx)
    except urllib.error.URLError as e:
        # A Python without the system certificates: VieNeu's own HTTP stack trusts certifi's bundle
        if ctx is None and isinstance(getattr(e, "reason", None), ssl.SSLCertVerificationError):
            try:
                import certifi
            except ImportError:
                raise e
            _certifi_ctx.append(ssl.create_default_context(cafile=certifi.where()))
            return urllib.request.urlopen(req, timeout=60, context=_certifi_ctx[0])
        raise


def retry_after(headers):
    # Seconds, or an HTTP date; None when absent or unreadable
    v = headers.get("Retry-After") if headers is not None else None
    if not v:
        return None
    v = v.strip()
    if v.isdigit():
        return int(v)
    try:
        from email.utils import parsedate_to_datetime
        return max(0.0, parsedate_to_datetime(v).timestamp() - time.time())
    except Exception:
        return None


def http_error(e):
    # What an HTTP error status means for this source
    code = e.code
    if code in (404, 410):
        return Gone("HTTP %d" % code)
    if code in (401, 403, 407):
        return Blocked("HTTP %d" % code)
    if code in (408, 425, 429) or code >= 500:
        return Retry("HTTP %d" % code, retry_after(e.headers))
    return BadBytes("HTTP %d" % code)


class Lock(object):
    def __init__(self, hf_home):
        self.path = os.path.join(hf_home, LOCK)
        self.held = False
        self.touched = 0

    def _create(self):
        fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode("ascii"))
        os.close(fd)
        self.held = True
        self.touched = time.time()

    def _stale(self, path):
        return time.time() - os.path.getmtime(path) >= LOCK_STALE_S

    def take(self):
        # Two runs may both find the same stale lock: each moves it away under a name of its own
        # (os.replace is atomic, so only one of them gets it), then creates a fresh one with O_EXCL.
        # The other finds nothing to move, or a fresh lock: it loses (exit 2).
        for _ in range(2):
            try:
                self._create()
                return True
            except FileExistsError:
                pass
            try:
                if not self._stale(self.path):
                    return False
            except OSError:
                continue                      # gone meanwhile: try to create it
            moved = "%s.stale-%d-%s" % (self.path, os.getpid(), os.urandom(4).hex())
            try:
                os.replace(self.path, moved)
            except OSError:
                return False                  # another run moved it first: that run takes over
            try:
                fresh = not self._stale(moved)
            except OSError:
                fresh = False
            if fresh:
                # Between our look and our move another run took over and made a fresh lock: put it
                # back (a hard link never replaces an existing file) and let that run go on
                try:
                    os.link(moved, self.path)
                except OSError:
                    pass
                try:
                    os.remove(moved)
                except OSError:
                    pass
                return False
            try:
                os.remove(moved)              # the dead run's lock
            except OSError:
                pass
        return False

    def touch(self):
        if self.held and time.time() - self.touched > 30:
            self.touched = time.time()
            try:
                os.utime(self.path, None)
            except OSError:
                pass

    def release(self):
        if self.held:
            try:
                os.remove(self.path)
            except OSError:
                pass
            self.held = False


def mb(n):
    return "%.1f MB" % (n / 1e6)


def _remove(path):
    try:
        os.remove(path)
    except OSError:
        pass


def download(url, part, f, lock, got=None):
    """Stream url into part, resuming a partial file. Returns when part holds exactly the pinned
    bytes. got[0] counts the bytes this attempt received (the caller's stall counter). Raises
    BadBytes, CorruptPrefix (part removed), Gone, Blocked, Retry, or a network error (part kept)."""
    got = got if got is not None else [0]
    size = f["size"]
    have = os.path.getsize(part) if os.path.exists(part) else 0
    h = hashlib.sha256()
    if have:
        with open(part, "rb") as fp:
            for block in iter(lambda: fp.read(BLOCK), b""):
                h.update(block)
        if have == size and h.hexdigest() == f["sha256"]:
            return                             # a run killed between the last byte and the move
        if have >= size:                       # full size (or more) and wrong: never kept
            os.remove(part)
            have = 0
            h = hashlib.sha256()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    if have:
        req.add_header("Range", "bytes=%d-" % have)
    try:
        r = urlopen(req)
    except urllib.error.HTTPError as e:
        if e.code == 416:                      # the partial file does not fit the source: start over
            _remove(part)
            raise CorruptPrefix("HTTP 416")
        raise http_error(e)
    except urllib.error.URLError as e:
        if url.startswith("file:") and isinstance(e.reason, OSError):
            raise Gone("khong co tep")         # a local mirror without this asset
        raise
    with r:
        code = r.getcode()                     # None for file:// URLs
        # A server that ignores the range sends the whole file: it goes to a fresh file, and the
        # partial one stays untouched until those bytes are proven (the hash below)
        fresh = bool(have) and code != 206
        resumed = bool(have) and not fresh
        target = part + ".new" if fresh else part
        pos = have if resumed else 0
        if fresh:
            h = hashlib.sha256()
        length = r.headers.get("Content-Length") if r.headers is not None else None
        if length and int(length) != size - pos:
            raise BadBytes("nguon co %s, ban da khoa la %s" % (mb(int(length) + pos), mb(size)))
        step = size // 10 if size >= 32 * 1000 * 1000 else 0
        next_mark = (pos // step + 1) * step if step else size + 1
        try:
            with open(target, "ab" if resumed else "wb") as out:
                while True:
                    block = r.read(BLOCK)
                    if not block:
                        break
                    if pos + len(block) > size:
                        raise BadBytes("lon hon ban da khoa")
                    out.write(block)
                    h.update(block)
                    pos += len(block)
                    got[0] += len(block)
                    lock.touch()
                    if pos >= next_mark and pos < size:
                        say("    ... %d%% (%s / %s)" % (pos * 100 // size, mb(pos), mb(size)))
                        next_mark += step
        except BadBytes:
            _remove(target)
            raise
        except BaseException:
            if fresh:
                _remove(target)                # unproven: the partial file it would replace stays
            raise
    if pos < size:
        if fresh:
            _remove(target)                    # unproven: the partial file it would replace stays
        raise IOError("ket noi dung o %s / %s" % (mb(pos), mb(size)))
    if h.hexdigest() != f["sha256"]:
        _remove(target)
        if resumed:
            raise CorruptPrefix("ma sha256 khac ban da khoa (phan tai do truoc do bi hong)")
        raise BadBytes("ma sha256 khac ban da khoa")
    if fresh:
        os.replace(target, part)


def sources(r, f, base_url, use_hf):
    out = []
    if base_url:
        out.append(("GitHub", base_url.rstrip("/") + "/" + (f.get("asset") or asset_name(r["repo"], f["path"]))))
    if use_hf:
        out.append(("Hugging Face", "https://huggingface.co/%s/resolve/%s/%s"
                    % (r["repo"], r["revision"], urllib.parse.quote(f["path"]))))
    return out


def prune(pin, hf_home):
    # Snapshots of revisions the pin no longer names: the server loads every file at start, so a
    # running one keeps what it has open. Best effort (Windows refuses files still in use).
    for r in pin["repos"]:
        snaps = os.path.join(repo_dir(hf_home, r["repo"]), "snapshots")
        try:
            names = os.listdir(snaps)
        except OSError:
            continue
        for name in names:
            if len(name) == SNAPSHOT_NAME_LEN and name != r["revision"] and all(c in "0123456789abcdef" for c in name):
                shutil.rmtree(os.path.join(snaps, name), ignore_errors=True)


def write_atomic(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    os.replace(tmp, path)


def install(pin, hf_home, vieneu, base_url, use_hf, if_changed):
    if if_changed and quick_ok(pin, hf_home):
        prune(pin, hf_home)
        say("Mo hinh giong da dung ban da khoa, khong can tai.")
        return 0
    os.makedirs(hf_home, exist_ok=True)
    lock = Lock(hf_home)
    if not lock.take():
        say("Mot lan tai mo hinh giong khac dang chay (bo tu cap nhat?). Lan nay bo qua, thu lai sau.")
        return 2
    try:
        return _install(pin, hf_home, vieneu, base_url, use_hf, lock)
    finally:
        lock.release()


def fetch_one(name, url, part, dest, f, lock, dead, use_hf):
    """One file from one source. True once dest holds the pinned bytes. Retries while the source
    keeps sending bytes: a source is given up after TRIES attempts in a row that received nothing,
    or after FILE_WALL_S on this file."""
    t0 = time.time()
    stalls = 0
    restarted = False
    while True:
        got = [0]
        try:
            download(url, part, f, lock, got)
            os.replace(part, dest)
            return True
        except Gone as e:
            say("    %s khong co tep nay (%s)." % (name, e))
            if name == "GitHub":
                dead.add(name)                 # the release is not published (yet): skip it
                if use_hf:
                    say("    Chua co ban phat hanh tren GitHub: tai tu Hugging Face, dung ban da khoa.")
            return False
        except Blocked as e:
            say("    Mang hoac proxy chan ket noi toi %s (%s): kiem tra tuong lua/proxy, roi chay lai." % (name, e))
            dead.add(name)                     # the same block holds for every file
            return False
        except CorruptPrefix as e:
            if not restarted:
                restarted = True
                say("    Phan da tai do bi hong: tai lai tu dau.")
                continue
            say("    Tu choi: %s." % e)
            return False
        except BadBytes as e:
            say("    Tu choi: %s." % e)
            return False
        except Exception as e:                 # network, Retry, a file held by an antivirus
            stalls = 0 if got[0] else stalls + 1
            if got[0]:
                say("    Ket noi dut sau %s, tai tiep: %s" % (mb(got[0]), e))
            else:
                say("    Loi tai (%d/%d lan lien khong nhan duoc gi): %s" % (stalls, TRIES, e))
            if stalls >= TRIES:
                dead.add(name)                 # unreachable: do not wait on it for every file
                return False
            if time.time() - t0 > FILE_WALL_S:
                say("    Qua %d gio cho tep nay tu %s: bo nguon nay." % (FILE_WALL_S // 3600, name))
                return False
            delay = e.delay if isinstance(e, Retry) and e.delay is not None else 3 * max(stalls, 1)
            time.sleep(min(delay, RETRY_AFTER_CAP_S))


def _install(pin, hf_home, vieneu, base_url, use_hf, lock):
    started = time.time()
    rel = pin.get("release") or {}
    base_url = base_url or os.environ.get("DPD_MODEL_URL") or None   # a mirror (tests)
    if base_url is None and rel.get("repo") and rel.get("tag"):
        base_url = "https://github.com/%s/releases/download/%s" % (rel["repo"], rel["tag"])
    files = [(r, f) for r in pin["repos"] for f in r["files"]]
    total = sum(f["size"] for _, f in files)
    say("Kiem tra mo hinh giong (%d tep, %s)..." % (len(files), mb(total)))
    todo = [(r, f) for r, f in files if problem(file_path(hf_home, r, f), f["size"], f["sha256"])]
    if todo:
        partial = sum(os.path.getsize(file_path(hf_home, r, f) + ".part")
                      for r, f in todo if os.path.isfile(file_path(hf_home, r, f) + ".part"))
        need = sum(f["size"] for _, f in todo) - partial
        free = shutil.disk_usage(hf_home).free
        if need + FREE_MARGIN > free:
            say("LOI: khong du cho trong tren o dia: can %s, con %s. Don bot roi chay lai." % (mb(need + FREE_MARGIN), mb(free)))
            return _failed(pin, hf_home)
        say("Can tai %d tep, %s%s." % (len(todo), mb(need), " (tiep tuc phan da tai do)" if partial else ""))
    fetched = 0
    missing = []
    used = {}
    dead = set()                               # sources not worth asking again: release 404, blocked, unreachable
    for i, (r, f) in enumerate(todo, 1):
        dest = file_path(hf_home, r, f)
        part = dest + ".part"
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        label = "%s/%s" % (r["repo"].split("/")[-1], f["path"])
        done = False
        for name, url in sources(r, f, base_url, use_hf):
            if name in dead:
                continue
            say("  [%d/%d] %s (%s) tu %s" % (i, len(todo), label, mb(f["size"]), name))
            t0 = time.time()
            if fetch_one(name, url, part, dest, f, lock, dead, use_hf):
                if f["size"] >= 1000 * 1000:
                    say("    xong, %s/giay" % mb(f["size"] / max(time.time() - t0, 0.001)))
                fetched += f["size"]
                used[name] = used.get(name, 0) + 1
                done = True
                break
        if not done:
            # Keep going: whatever else arrives is kept, so the next run has less to fetch
            say("LOI: khong tai duoc %s tu nguon nao." % label)
            missing.append(label)
    if missing:
        return _failed(pin, hf_home)
    # Every file was hashed above or while it streamed in: point "main" at the pinned revisions, then
    # write the marker. A size check catches a file that went away meanwhile, without hashing again.
    for r, f in files:
        p = file_path(hf_home, r, f)
        if not os.path.isfile(p) or os.path.getsize(p) != f["size"]:
            say("LOI: %s/%s bien mat sau khi tai." % (r["repo"], f["path"]))
            return _failed(pin, hf_home)
    for r in pin["repos"]:
        write_atomic(ref_path(hf_home, r["repo"]), r["revision"])
    write_atomic(os.path.join(hf_home, MARKER), marker_text(pin))
    prune(pin, hf_home)
    v = pin.get("voices")
    if v and os.path.isdir(os.path.join(vieneu, "src", "vieneu")) and problem(os.path.join(vieneu, v["path"]), v["size"], v["sha256"]):
        say("Chu y: tep giong trong ma VieNeu khac ban da khoa (giong van chay).")
    src = ", ".join("%s %d tep" % (k, n) for k, n in sorted(used.items()))
    say("Mo hinh giong da khoa: %d tep, %s, tai moi %s%s, %d giay." % (
        len(files), mb(total), mb(fetched), " (" + src + ")" if src else "", round(time.time() - started)))
    return 0


def marker_voices(text):
    for line in marker_header(text).splitlines():
        if line.startswith("voices "):
            return line[len("voices "):].strip()
    return None


def _failed(pin, hf_home):
    # A marker naming this very pin now lies (its files are wrong), and one naming another VieNeu
    # commit vouches for a model that code may not load: remove it, so the server starts online and
    # still talks. A marker for an older pin on the same code stays: refs/main still names those files.
    path = os.path.join(hf_home, MARKER)
    text = read_text(path)
    if text is not None:
        other_code = marker_voices(text) not in (None, voices_commit(pin)) and voices_commit(pin) is not None
        if marker_header(text) == pin_id(pin) or other_code:
            _remove(path)
    say("Chua tai duoc mo hinh giong.")
    return 1


def main():
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(errors="replace")    # a non-ASCII path on a cp1252 pipe must not crash
        except Exception:
            pass
    ap = argparse.ArgumentParser(description="Check, install or rebuild the pinned VieNeu model.")
    ap.add_argument("--vieneu", default=os.path.expanduser("~/VieNeu-TTS"))
    ap.add_argument("--hf-home", help="default <vieneu>/models/hf")
    ap.add_argument("--pin", help="default vieneu-model.json next to this file, else share/")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--quick", action="store_true", help="stat only: marker, file sizes, refs/main")
    ap.add_argument("--base-url", help="install: where the release assets are (file:// or http)")
    ap.add_argument("--no-hf", action="store_true", help="install: no Hugging Face fallback")
    ap.add_argument("--if-changed", action="store_true", help="install: nothing to do when the quick check passes")
    a = ap.parse_args()
    hf_home = os.path.abspath(a.hf_home or os.path.join(a.vieneu, "models", "hf"))
    pin_file = find_pin(a.pin)
    if not pin_file:
        print("LOI: khong tim thay vieneu-model.json")
        return 1
    pin = load_pin(pin_file)
    if a.quick:
        ok = quick_ok(pin, hf_home)
        print("quick check: the marked copy matches the pin (sizes)" if ok else "quick check: NO current marked copy")
        return 0 if ok else 1
    if a.install:
        use_hf = not a.no_hf and not os.environ.get("DPD_MODEL_NO_HF")
        try:
            return install(pin, hf_home, a.vieneu, a.base_url, use_hf, a.if_changed)
        except KeyboardInterrupt:
            raise
        except Exception as e:                 # never a traceback in the installer output
            print("LOI: %s: %s" % (type(e).__name__, e))
            return _failed(pin, hf_home)
    if a.fetch:
        fetch(pin, hf_home)
    ok = verify(pin, hf_home, a.vieneu)
    print("all files match the pin" if ok else "the local copy does NOT match the pin")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

"""Store screenshots (1280x800 PNG) with headless Chrome and a throwaway profile: the demo video translated by a
real endpoint (store/shot-player.html), and the popup beside the feature list (store/shot-popup.html).

    python tools/make_store_assets.py                     # demo video first
    python tools/screenshots.py --endpoint http://host:8000/v1 --model hymt [--key ...]

The endpoint is only passed on the command line, never stored. Serves the repository on 127.0.0.1:8094 meanwhile.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "test"))
from serve import RangeHandler  # noqa: E402

CHROME = [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
          r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "google-chrome", "chromium"]


def browser():
    for c in CHROME:
        if os.path.exists(c) or shutil.which(c):
            return c
    raise SystemExit("Chrome / Edge not found")


def shoot(exe, url, out, budget_ms):
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run([exe, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--mute-audio",
                        "--autoplay-policy=no-user-gesture-required", f"--user-data-dir={profile}",
                        "--window-size=1280,800", f"--virtual-time-budget={budget_ms}", f"--screenshot={out}", url],
                       check=True, capture_output=True, timeout=180)
    print("wrote", out)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--endpoint", required=True)
    p.add_argument("--model", required=True)
    p.add_argument("--key", default="")
    p.add_argument("--port", type=int, default=8094)
    a = p.parse_args()
    httpd = ThreadingHTTPServer(("127.0.0.1", a.port), partial(RangeHandler, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    exe, base, out = browser(), f"http://127.0.0.1:{a.port}", ROOT / "store" / "screenshots"
    out.mkdir(parents=True, exist_ok=True)
    q = urlencode({"endpoint": a.endpoint, "model": a.model, "key": a.key, "t": "11"})
    shoot(exe, f"{base}/store/shot-player.html?{q}", out / "1-player.png", 40000)
    shoot(exe, f"{base}/store/shot-popup.html", out / "2-popup.png", 8000)
    httpd.shutdown()


if __name__ == "__main__":
    main()

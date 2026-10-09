"""Package the extension for the Chrome Web Store: dist/livesub-<version>.zip with the manifest, src/ and icons/ only
(no tests, tools or store assets). Runs the core tests first when node is available.

    python tools/build.py
"""
import json
import shutil
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INCLUDE = ["manifest.json", "src", "icons"]


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    for f in ["src/" + Path(p).name for p in ("background.js", "core.js", "content.js", "page.js", "popup.js", "words.js")]:
        if not (ROOT / f).exists():
            raise SystemExit(f"missing {f}")
    if shutil.which("node"):
        for f in sorted((ROOT / "src").glob("*.js")):
            subprocess.run(["node", "--check", str(f)], check=True)
        subprocess.run(["node", str(ROOT / "test" / "core.test.js")], check=True)
    out = ROOT / "dist" / f"livesub-{manifest['version']}.zip"
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for item in INCLUDE:
            p = ROOT / item
            for f in ([p] if p.is_file() else sorted(x for x in p.rglob("*") if x.is_file())):
                z.write(f, f.relative_to(ROOT).as_posix())
    print(f"wrote {out} ({out.stat().st_size // 1024} KB, version {manifest['version']})")


if __name__ == "__main__":
    main()

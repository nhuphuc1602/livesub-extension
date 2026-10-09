"""Static files for test/harness.html, with HTTP Range (python -m http.server has none, so a video cannot seek).

    python test/serve.py [port] [folder]        (default 8091, the repository folder)
"""
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class RangeHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        m = re.match(r"bytes=(\d*)-(\d*)$", self.headers.get("Range", ""))
        path = self.translate_path(self.path)
        if not m or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        a, b = m.groups()
        start = int(a) if a else max(0, size - int(b or 0))
        end = min(int(b), size - 1) if a and b else size - 1
        if start >= size:
            self.send_error(416)
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self._left = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        left = getattr(self, "_left", None)
        if left is None:
            return super().copyfile(source, outputfile)
        try:
            while left > 0:
                buf = source.read(min(1 << 16, left))
                if not buf:
                    break
                outputfile.write(buf)
                left -= len(buf)
        except (ConnectionResetError, BrokenPipeError):     # the player stopped reading after a seek
            pass

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8091
    root = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "..")
    print(f"http://localhost:{port}/test/harness.html", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), partial(RangeHandler, directory=os.path.abspath(root))).serve_forever()

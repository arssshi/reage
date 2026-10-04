"""Launch the built Reage app on localhost with a single Python process."""
import argparse
from pathlib import Path
import sys
import threading
import webbrowser


def main():
    parser = argparse.ArgumentParser(description="Reage — a local-first PDF editor")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if not (Path(__file__).resolve().parent / "dist" / "index.html").is_file():
        sys.exit("Build the interface first: npm install && npm run build")
    try:
        import uvicorn
        import pymupdf  # noqa: F401
        import fastapi  # noqa: F401
        import fontTools  # noqa: F401
        import PIL  # noqa: F401
        import pymupdf_fonts  # noqa: F401
    except ImportError:
        sys.exit("Install Python dependencies first: python -m pip install -r requirements.txt")
    url = f"http://127.0.0.1:{args.port}"
    print(f"\n  Reage — your local PDF workspace\n  Open {url}\n  Press Ctrl+C to stop.\n", flush=True)
    if not args.no_browser:
        timer = threading.Timer(1.5, lambda: webbrowser.open(url))
        timer.daemon = True
        timer.start()
    # One process: the document store is local, and MuPDF calls are serialized.
    uvicorn.run("server.app:app", host="127.0.0.1", port=args.port, workers=1)


if __name__ == "__main__":
    main()

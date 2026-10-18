"""Profile the installed gallery in a separate process without modifying media.

Run with /app/venv/bin/python inside the container. The test request uses an
in-process admin session, and never prints or changes credentials.
"""
import argparse
import cProfile
import json
from pathlib import Path
import pstats
import time

import smartgallery as gallery
from flask import session


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    runs = []
    with gallery.app.test_request_context("/galleryout/view/_root_?recursive=true"):
        session.update(user_id="1", role="ADMIN", username="admin")
        for iteration in range(4):
            profile = cProfile.Profile()
            start = time.perf_counter()
            profile.enable()
            response = gallery.gallery_view("_root_")
            profile.disable()
            elapsed = (time.perf_counter() - start) * 1000
            stats = pstats.Stats(profile).stats
            top = []
            for (filename, line, function), (primitive, calls, own, cumulative, callers) in sorted(stats.items(), key=lambda item: item[1][3], reverse=True)[:25]:
                top.append({"file": Path(filename).name, "line": line, "function": function, "calls": calls, "own_ms": round(own*1000, 2), "cumulative_ms": round(cumulative*1000, 2)})
            runs.append({"phase": "cold" if iteration == 0 else "warm", "elapsed_ms": round(elapsed, 2), "html_bytes": len(response.encode()), "top": top})
    result = {"version": gallery.APP_VERSION, "runs": runs}
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"version": gallery.APP_VERSION, "request_ms": [r["elapsed_ms"] for r in runs]}))


if __name__ == "__main__":
    main()

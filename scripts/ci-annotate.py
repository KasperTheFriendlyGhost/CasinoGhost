#!/usr/bin/env python3
"""Turn compiler errors in build logs into GitHub Actions annotations.

Usage: ci-annotate.py LOG [LOG ...]
Prints ::error lines for Swift/Clang/linker/Rust errors (file and line when known) and a
::notice with the tail of each log, so failures can be read from the run's annotations.
"""
import os
import re
import sys

ROOT = os.environ.get("GITHUB_WORKSPACE", os.getcwd())
FILE_ERR = re.compile(r"^(/[^:]+):(\d+):(?:(\d+):)? (?:fatal )?error: (.*)$")
RUST_ERR = re.compile(r"^error(\[E\d+\])?: (.*)$")
RUST_LOC = re.compile(r"^\s+--> ([^:]+):(\d+):(\d+)")
OTHER = re.compile(r"(error:|Undefined symbols|ld: |\*\* BUILD FAILED|\*\* TEST FAILED|Testing failed|failed\b.*\(|XCTAssert)")


def esc(s: str) -> str:
    return s.replace("%", "%25").replace("\r", "").replace("\n", "%0A")


def main() -> None:
    seen = set()
    count = 0
    for path in sys.argv[1:]:
        if not os.path.exists(path):
            continue
        lines = open(path, errors="replace").read().splitlines()
        pending_rust = None
        for line in lines:
            m = FILE_ERR.match(line)
            if m:
                f, ln, col, msg = m.groups()
                rel = os.path.relpath(f, ROOT) if f.startswith(ROOT) else f
                key = (rel, ln, msg)
                if key not in seen and count < 45:
                    seen.add(key)
                    count += 1
                    print(f"::error file={rel},line={ln},col={col or 1}::{esc(msg)}")
                continue
            m = RUST_ERR.match(line)
            if m:
                pending_rust = m.group(2)
                continue
            m = RUST_LOC.match(line)
            if m and pending_rust:
                key = (m.group(1), m.group(2), pending_rust)
                if key not in seen and count < 45:
                    seen.add(key)
                    count += 1
                    print(f"::error file=engine/{m.group(1)},line={m.group(2)}::{esc(pending_rust)}")
                pending_rust = None
        interesting = [l for l in lines if OTHER.search(l)][-40:]
        tail = lines[-25:]
        body = "\n".join(["[matches]"] + interesting + ["[tail]"] + tail)
        print(f"::notice title={os.path.basename(path)}::{esc(body[-60000:])}")


if __name__ == "__main__":
    main()

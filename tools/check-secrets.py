#!/usr/bin/env python3
"""Reject credential-shaped content without printing any matched secret."""
from pathlib import PurePosixPath
import re
import subprocess
import sys

RULES = {
    "API token": re.compile(rb"(?:sk-|gh[pousr]_)[A-Za-z0-9_-]{16,}"),
    "private key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "credential assignment": re.compile(rb'''(?im)(?:bearer_token|api[_-]?key|password)\s*[=:]\s*["'][A-Za-z0-9_+/=-]{20,}["']'''),
}

def git(*args):
    return subprocess.check_output(["git", *args])

def forbidden(name):
    path = PurePosixPath(name)
    return (any(part in {".signing", "private", "secrets", "build", "dist"} for part in path.parts)
            or path.suffix.lower() in {".jks", ".keystore", ".pem", ".p12", ".pfx", ".apk", ".idsig"}
            or path.name in {".env", "credentials.json", "id_rsa", "id_ed25519"}
            or (path.name.startswith(".env.") and path.name != ".env.example"))

def scan(history=False):
    findings = []
    seen = set()
    trees = git("rev-list", "--all").decode().split() if history else [None]
    for tree in trees:
        entries = git("ls-tree", "-r", "-z", tree) if tree else git("ls-files", "--stage", "-z")
        for entry in entries.split(b"\0"):
            if not entry:
                continue
            metadata, raw = entry.split(b"\t", 1)
            name = raw.decode("utf-8", errors="replace")
            blob = metadata.split()[2 if tree else 1].decode()
            if forbidden(name):
                findings.append((name, "private artifact path"))
            if blob in seen:
                continue
            seen.add(blob)
            content = git("cat-file", "blob", blob)
            for label, pattern in RULES.items():
                if pattern.search(content):
                    findings.append((name, label))
    for name, label in sorted(set(findings)):
        print("BLOCKED: {} ({})".format(name, label), file=sys.stderr)
    if findings:
        print("Secret values suppressed. Remove private material before committing or pushing.", file=sys.stderr)
        return 1
    print("PASS: {} unique Git blobs checked; no configured secret patterns or private artifact paths detected.".format(len(seen)))
    return 0

if __name__ == "__main__":
    raise SystemExit(scan("--history" in sys.argv))

#!/usr/bin/env python3
"""Build a dependency-free, locally signed Android APK using Android SDK 35."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import zipfile
from signing import prepare

ROOT = Path(__file__).resolve().parents[1]
SDK = Path(os.environ.get("ANDROID_HOME", str(Path.home() / "Library/Android/sdk")))
JAVA = Path(os.environ.get("JAVA_HOME", "/Applications/IntelliJ IDEA.app/Contents/jbr/Contents/Home"))
BT = SDK / "build-tools/35.0.0"
ANDROID = SDK / "platforms/android-35/android.jar"
BUILD = ROOT / "build"
OUT = ROOT / "dist"
ENV = dict(os.environ, JAVA_HOME=str(JAVA))

def run(*args):
    subprocess.run([str(a) for a in args], check=True, cwd=ROOT, env=ENV)

def main():
    for p in [JAVA / "bin/javac", ANDROID, BT / "aapt2"]:
        if not p.exists():
            raise SystemExit(f"Missing build dependency: {p}")
    if BUILD.exists():
        shutil.rmtree(BUILD)
    for p in [BUILD / "classes", BUILD / "dex", OUT]:
        p.mkdir(parents=True, exist_ok=True)
    src = ROOT / "app/src/main"
    run(BT / "aapt2", "compile", "--dir", src / "res", "-o", BUILD / "resources.zip")
    run(BT / "aapt2", "link", "-o", BUILD / "resources.apk", "-I", ANDROID,
        "--manifest", src / "AndroidManifest.xml", "-A", src / "assets", BUILD / "resources.zip")
    run(JAVA / "bin/javac", "--release", "8", "-encoding", "UTF-8", "-classpath", ANDROID,
        "-d", BUILD / "classes", *sorted((src / "java").rglob("*.java")))
    run(BT / "d8", "--release", "--min-api", "26", "--lib", ANDROID,
        "--output", BUILD / "dex", *sorted((BUILD / "classes").rglob("*.class")))
    shutil.copyfile(BUILD / "resources.apk", BUILD / "unsigned.apk")
    with zipfile.ZipFile(BUILD / "unsigned.apk", "a", zipfile.ZIP_DEFLATED) as z:
        z.write(BUILD / "dex/classes.dex", "classes.dex")
    run(BT / "zipalign", "-f", "-p", "4", BUILD / "unsigned.apk", BUILD / "aligned.apk")
    keystore, password = prepare(ROOT, JAVA)
    ENV["GOLD_APK_SIGNING_PASSWORD"] = password
    apk = OUT / "GoldRadar-1.3.1.apk"
    run(BT / "apksigner", "sign", "--ks", keystore, "--ks-key-alias", "goldradar",
        "--ks-pass", "env:GOLD_APK_SIGNING_PASSWORD", "--key-pass", "env:GOLD_APK_SIGNING_PASSWORD",
        "--out", apk, BUILD / "aligned.apk")
    run(BT / "apksigner", "verify", "--verbose", apk)
    run(BT / "aapt", "dump", "badging", apk)
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    (OUT / "SHA256SUMS").write_text(f"{digest}  {apk.name}\n")
    print(f"\nBuilt: {apk}\nSize: {apk.stat().st_size:,} bytes\nSHA256: {digest}")

if __name__ == "__main__":
    main()

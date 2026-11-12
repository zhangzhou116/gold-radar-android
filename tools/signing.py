"""Keep Android signing material outside checkouts; use macOS Keychain for passwords."""
import hashlib
import os
from pathlib import Path
import secrets
import subprocess
import sys

SERVICE = "cn.local.goldradar.apk-signing"
ACCOUNT = "gold-radar-android"

def directory():
    override = os.environ.get("GOLD_RADAR_SIGNING_DIR")
    if override:
        return Path(override).expanduser().resolve()
    if sys.platform == "darwin":
        return Path.home() / "Library/Application Support/GoldRadar/private/signing"
    return Path.home() / ".local/share/gold-radar/private/signing"

def command(*args, env=None):
    result = subprocess.run(args, capture_output=True, env=env)
    if result.returncode:
        raise RuntimeError("Signing credential operation failed; no secret was printed.")
    return result.stdout.decode().strip()

def stored_password():
    if sys.platform != "darwin":
        return os.environ.get("GOLD_APK_SIGNING_PASSWORD", "")
    result = subprocess.run(["/usr/bin/security", "find-generic-password", "-s", SERVICE,
                             "-a", ACCOUNT, "-w"], capture_output=True)
    if result.returncode == 44:
        return ""
    if result.returncode:
        raise RuntimeError("Unlock the macOS login Keychain to read the signing password.")
    return result.stdout.decode().strip()

def store_password(password):
    existing = stored_password()
    if existing:
        if existing != password:
            raise RuntimeError("Keychain already contains a different password; nothing was overwritten.")
        return
    if sys.platform != "darwin":
        raise RuntimeError("Set GOLD_APK_SIGNING_PASSWORD through your secret manager.")
    command("/usr/bin/security", "add-generic-password", "-s", SERVICE, "-a", ACCOUNT,
            "-w", password)
    if stored_password() != password:
        raise RuntimeError("Keychain verification failed; original files were kept.")

def private_directory():
    dest = directory()
    root = Path(__file__).resolve().parents[1]
    if dest == root or root in dest.parents:
        raise RuntimeError("Signing directory must be outside the project checkout.")
    dest.mkdir(parents=True, mode=0o700, exist_ok=True)
    dest.chmod(0o700)
    if not os.environ.get("GOLD_RADAR_SIGNING_DIR"):
        for folder in [dest.parent, dest.parent.parent]:
            folder.chmod(0o700)
    return dest

def check_key(java, keystore, password):
    env = dict(os.environ, GOLD_APK_SIGNING_PASSWORD=password)
    command(str(java / "bin/keytool"), "-list", "-alias", "goldradar", "-keystore",
            str(keystore), "-storepass:env", "GOLD_APK_SIGNING_PASSWORD", env=env)

def prepare(root, java):
    dest = private_directory()
    if dest == root or root in dest.parents:
        raise RuntimeError("Signing directory must be outside the project checkout.")
    keystore = dest / "goldradar.jks"
    if (root / ".signing/goldradar.jks").exists():
        raise RuntimeError("Run python3 tools/signing.py migrate .signing before building.")
    password = stored_password()
    if keystore.exists():
        if not password:
            raise RuntimeError("Signing password is missing; refusing to replace the existing key.")
        check_key(java, keystore, password)
    else:
        if not password:
            password = secrets.token_urlsafe(32)
            store_password(password)
        env = dict(os.environ, GOLD_APK_SIGNING_PASSWORD=password)
        command(str(java / "bin/keytool"), "-genkeypair", "-keystore", str(keystore),
                "-alias", "goldradar", "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000",
                "-dname", "CN=Gold Radar Personal, O=Personal Research, C=CN",
                "-storepass:env", "GOLD_APK_SIGNING_PASSWORD", "-keypass:env", "GOLD_APK_SIGNING_PASSWORD", env=env)
    keystore.chmod(0o600)
    return keystore, password

def migrate(sources, java):
    dest = private_directory() / "goldradar.jks"
    candidates = [Path(s).expanduser().resolve() for s in sources]
    existing = [s for s in candidates if (s / "goldradar.jks").exists()]
    if not existing:
        raise RuntimeError("No legacy signing key found; nothing was changed.")
    first = existing[0]
    data = (first / "goldradar.jks").read_bytes()
    password = (first / "password").read_text().strip()
    for source in existing:
        if (source / "goldradar.jks").read_bytes() != data or (source / "password").read_text().strip() != password:
            raise RuntimeError("Legacy signing copies differ; originals were kept.")
    if dest.exists() and dest.read_bytes() != data:
        raise RuntimeError("Destination contains a different signing key; originals were kept.")
    check_key(java, first / "goldradar.jks", password)
    store_password(password)
    if not dest.exists():
        with dest.open("xb") as out:
            out.write(data)
    dest.chmod(0o600)
    check_key(java, dest, stored_password())
    if hashlib.sha256(dest.read_bytes()).digest() != hashlib.sha256(data).digest():
        raise RuntimeError("Copy verification failed; originals were kept.")
    for source in existing:
        (source / "password").unlink()
        (source / "goldradar.jks").unlink()
        if not any(source.iterdir()):
            source.rmdir()
    print("Signing key migrated and verified; password stored in macOS Keychain. Legacy copies removed.")

if __name__ == "__main__":
    java = Path(os.environ.get("JAVA_HOME", "/Applications/IntelliJ IDEA.app/Contents/jbr/Contents/Home"))
    if len(sys.argv) < 3 or sys.argv[1] != "migrate":
        raise SystemExit("Usage: python3 tools/signing.py migrate <legacy-signing-directory> [...]")
    migrate(sys.argv[2:], java)

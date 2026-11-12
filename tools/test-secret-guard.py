"""Exercise the Git credential guard in a disposable, never-pushed repository."""
from pathlib import Path
import subprocess
import sys
import tempfile

guard = Path(__file__).with_name("check-secrets.py").resolve()
with tempfile.TemporaryDirectory(prefix="gold-secret-guard-") as temp:
    root = Path(temp)
    def git(*args):
        subprocess.run(["git", *args], cwd=root, check=True, capture_output=True)
    def check(history=False):
        return subprocess.run([sys.executable, str(guard)] + (["--history"] if history else []),
                              cwd=root, capture_output=True, text=True)
    git("init", "-b", "main")
    git("config", "user.name", "Secret Guard Test")
    git("config", "user.email", "test@example.invalid")
    file = root / "settings.py"
    file.write_text("import os\napi_key = os.environ.get('MODEL_KEY')\n")
    git("add", ".")
    assert check().returncode == 0
    fake = "sk-" + "a" * 40
    file.write_text("api_key = '" + fake + "'\n")
    git("add", ".")
    result = check()
    assert result.returncode != 0 and fake not in result.stdout + result.stderr
    git("commit", "-m", "Synthetic credential fixture; never push")
    file.write_text("import os\n")
    git("add", ".")
    assert check().returncode == 0
    assert check(True).returncode != 0, "history must catch removed credentials"
    private = root / ".signing/password"
    private.parent.mkdir()
    private.write_text("synthetic")
    git("add", ".")
    assert check().returncode != 0, "private paths must be blocked even without token syntax"
print("PASS: clean staged code, credential rejection, secret suppression, historical leaks and private paths.")

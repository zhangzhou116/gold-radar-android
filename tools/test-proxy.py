#!/usr/bin/env python3
"""Run pure-Java protocol checks; org.json is test-only, Android supplies it at runtime."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.request

root=Path(__file__).resolve().parents[1]
java=Path(os.environ.get("JAVA_HOME","/Applications/IntelliJ IDEA.app/Contents/jbr/Contents/Home"))/"bin"
jar=Path.home()/".cache/gold-radar-tests/json-20250517.jar"
jar.parent.mkdir(parents=True,exist_ok=True)
if not jar.exists():
    jar.write_bytes(urllib.request.urlopen("https://repo.maven.apache.org/maven2/org/json/json/20250517/json-20250517.jar").read())
if hashlib.sha256(jar.read_bytes()).hexdigest()!="3ea61b2a06e31edf1c91134fe9106b0ebb16628be169f3db75bc7a2b06b45796":
    raise SystemExit("test-only org.json artifact hash mismatch")
with tempfile.TemporaryDirectory(prefix="gold-proxy-tests-") as directory:
    subprocess.run([str(java/"javac"),"--release","8","-encoding","UTF-8","-cp",str(jar),"-d",directory,str(root/"app/src/main/java/cn/local/goldradar/ProxyClient.java"),str(root/"tools/ProxyClientTest.java")],check=True)
    subprocess.run([str(java/"java"),"-cp",directory+os.pathsep+str(jar),"cn.local.goldradar.ProxyClientTest"],check=True)

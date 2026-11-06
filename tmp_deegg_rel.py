import json, os, subprocess, urllib.request, urllib.error

TOKEN = open(os.path.join(os.path.expanduser("~"), "Desktop", "github.txt"), encoding="utf-8").read().strip()
OWNER, NAME, TAG = "CHET-LI", "pixel-workshop", "v1.4.0"
REPO = r"C:\DevWorkspaces\projects\pixel-workshop"


def api(path, method="GET", body=None):
    req = urllib.request.Request("https://api.github.com" + path,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 method=method,
                                 headers={"Authorization": "Bearer " + TOKEN,
                                          "Accept": "application/vnd.github+json",
                                          "Content-Type": "application/json",
                                          "User-Agent": "qwenpaw-qa-agent"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8", "ignore") or "{}")


code, rel = api(f"/repos/{OWNER}/{NAME}/releases/tags/{TAG}")
print("取 release:", code)
body = rel.get("body", "")
new_lines = [l for l in body.splitlines() if ("彩蛋" not in l) and ("Easter egg" not in l)]
new_body = "\n".join(new_lines)
code2, r2 = api(f"/repos/{OWNER}/{NAME}/releases/{rel['id']}", "PATCH",
                {"body": new_body, "name": rel.get("name")})
print("改 release:", code2, "| 删了", len(body.splitlines()) - len(new_lines), "行")

# 同时把 commit 推上去
env = dict(os.environ, GIT_TERMINAL_PROMPT="0", HTTPS_PROXY="http://127.0.0.1:7897",
           HTTP_PROXY="http://127.0.0.1:7897", GIT_SSL_BACKEND="openssl")
url = f"https://x-access-token:{TOKEN}@github.com/{OWNER}/{NAME}.git"
r = subprocess.run(["git", "-c", "credential.helper=", "push", url, "main:main"], cwd=REPO, env=env,
                   capture_output=True, text=True, encoding="utf-8", errors="replace")
print("push:", r.returncode, ((r.stdout or "") + (r.stderr or "")).replace(TOKEN, "***")[-200:])

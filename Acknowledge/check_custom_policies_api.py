#!/usr/bin/env python3
"""Check if the backend exposes GET /leaves/custom-policies/list (fixes 404/405 on Custom Leave Policies)."""
import os
import sys
import urllib.request
import urllib.error

def main():
    base = os.environ.get("API_BASE", "https://acknowledge.panscience.ai/api")
    if not base.endswith("/"):
        base += "/"
    url = base + "leaves/custom-policies/list"
    token = os.environ.get("ACCESS_TOKEN", "")
    print("GET", url)
    req = urllib.request.Request(url, method="GET")
    req.add_header("Accept", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        r = urllib.request.urlopen(req, timeout=10)
        print("OK", r.getcode(), "— backend has the route. Custom policies should load.")
        return 0
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print("401 Unauthorized — route exists but token missing/invalid. Set ACCESS_TOKEN=your_jwt to test with auth.")
        elif e.code == 404:
            print("404 Not Found — deploy the latest backend (with GET /leaves/custom-policies/list in app/routes/leaves.py).")
        elif e.code == 405:
            print("405 Method Not Allowed — backend has the path but not GET. Deploy the latest backend.")
        else:
            print(e.code, "—", e.reason)
        return 1
    except Exception as e:
        print("Error:", e)
        return 1

if __name__ == "__main__":
    sys.exit(main())

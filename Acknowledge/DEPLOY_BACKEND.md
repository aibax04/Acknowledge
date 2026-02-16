# Deploy Backend (fix Custom Leave Policies error)

If you see **"Custom policies need the latest backend"**, the server that handles your app (e.g. **acknowledge.panscience.ai**) is still running an **old** backend. Deploy the backend from this repo as below.

---

## 1. Verify what’s running

From your machine (replace with your API base URL if different):

```bash
# Should return 200 and JSON with "custom_policies_list": true if the NEW backend is deployed
curl -s -o /dev/null -w "%{http_code}" https://acknowledge.panscience.ai/api/health
```

- **200** and body like `{"status":"ok","custom_policies_list":true,...}` → new backend is deployed; if the app still shows the error, hard-refresh the page (Ctrl+Shift+R) and click **Retry**.
- **404** or no `custom_policies_list` → old backend; follow the steps below.

---

## 2. Deploy with Docker (recommended for production)

On the **server** where the app is hosted (where Docker / docker-compose run):

```bash
cd /path/to/Acknowledge   # repo root (parent of Acknowledge/backend, Acknowledge/nginx)

# Rebuild backend image and restart (use the file that matches your setup)
docker compose -f Acknowledge/docker-compose.prod.yml build backend --no-cache
docker compose -f Acknowledge/docker-compose.prod.yml up -d backend

# Optional: restart nginx so it picks up config changes
docker compose -f Acknowledge/docker-compose.prod.yml restart nginx
```

If your repo path is different, adjust `cd` and the path to `docker-compose.prod.yml`.  
After deploy, run the `curl` from step 1 again; you should get 200 and `custom_policies_list: true`.

---

## 3. Deploy without Docker (uvicorn on the server)

On the **server** where the backend should run:

```bash
cd /path/to/Acknowledge/Acknowledge/backend

# Use venv if you have one
source .venv/bin/activate   # or: . .venv/bin/activate
pip install -r requirements.txt   # in case dependencies changed

# Stop any existing process on port 8000 (adjust if you use another port)
pkill -f "uvicorn app.main:app" || true
sleep 2

# Start backend (runs in foreground; use systemd/supervisor/nohup for production)
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

For production, run this under systemd or supervisor so it restarts on failure.  
Your **reverse proxy** (e.g. nginx) must forward `/api/` to `http://127.0.0.1:8000/` (strip `/api` so the backend sees paths like `/leaves/custom-policies/list`).

After starting, run:

```bash
curl -s http://127.0.0.1:8000/health
```

You should see `"custom_policies_list": true`.

---

## 4. After deploy

1. Run the **health** check again (step 1).
2. In the browser: **hard refresh** (Ctrl+Shift+R or Cmd+Shift+R) on the Leave Approvals page.
3. Click **Retry** in the Custom Leave Policies section if the message is still there.

The Custom Leave Policies section should then load (or show “No custom policies yet” if the list is empty).

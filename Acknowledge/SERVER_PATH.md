# Server path: /home/ubuntu/Acknowledge/Acknowledge

Use this directory as the project root on the server.

## Deploy (production)

```bash
cd /home/ubuntu/Acknowledge/Acknowledge
git pull
sudo ./deploy-production.sh
```

If the script fails (e.g. Docker not installed), run manually:

```bash
cd /home/ubuntu/Acknowledge/Acknowledge
sudo docker compose -f docker-compose.prod.yml build backend --no-cache
sudo docker compose -f docker-compose.prod.yml up -d db
sleep 3
sudo docker compose -f docker-compose.prod.yml up -d backend
sudo docker compose -f docker-compose.prod.yml restart nginx
```

## Env

- Docker Compose uses `.env` in this directory for `SECRET_KEY`, `DB_USER`, etc.
- If you only have `backend/.env`, the deploy script copies it to `.env` once.

## Check

```bash
curl -s http://localhost:8001/health
# or from outside: curl -s https://acknowledge.panscience.ai/api/health
# Expect: {"status":"ok","custom_policies_list":true,...}
```

Nginx listens on port **8001** (host). Point your domain (e.g. acknowledge.panscience.ai) to this server and proxy or expose 8001.

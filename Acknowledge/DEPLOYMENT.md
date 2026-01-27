## AWS EC2 Deployment

### 1. Launch Instance
- Use **Ubuntu 22.04 LTS**.
- Choose at least **t3.small** (2GB RAM recommended for Docker + Postgres).
- **CRITICAL**: In Security Groups, add an Inbound Rule for **Custom TCP - Port 8001** and set Source to `0.0.0.0/0`.

### 2. Connect and Transfer Code
SSH into your instance and clone your repository or SCP your files:
```bash
git clone <your-repo-url>
cd Acknowledge
```

### 3. Run Automation Script
I have provided a `setup_aws.sh` script that installs Docker and launches everything:
```bash
chmod +x setup_aws.sh
./setup_aws.sh
```

---

## Manual Deployment Steps
(If not using the automation script)

### 1. Configure Environment Variables
Copy `.env.prod.example` to a new file named `.env.prod` and update the values:
```bash
cp .env.prod.example .env.prod
# Edit .env.prod with your production credentials
```

### 2. Update Database Connection
Ensure your `DATABASE_URL` in `.env.prod` uses the `postgresql+asyncpg://` driver.

### 3. Deploy with Docker Compose
Run the following command on your server:
```bash
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## Architecture Details
- **Nginx**: Listens on port 80 inside the container, exposed as **8001** on your host. Routes `/api/*` to the backend and serves static files from `/frontend`.
- **Backend (FastAPI)**: Runs inside a Docker container, accessible to Nginx via internal network.
- **PostgreSQL**: Runs inside a Docker container with persistent volumes.
- **Frontend**: Standard HTML/JS files served by Nginx.

## Port Map
- **Frontend/Nginx**: `http://<your-server-ip>:8001/` (redirects to login)
- **Backend API**: `http://<your-server-ip>:8001/api/docs` (Swagger UI)

## Troubleshooting
- **Database Connection**: Ensure your server's IP is allowlisted in your remote PostgreSQL provider's firewall.
- **Logs**: Check container logs using `docker-compose -f docker-compose.prod.yml logs -f`.

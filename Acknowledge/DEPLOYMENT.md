# Production Deployment Guide

This application is configured for production using **Docker**, **Nginx**, and **PostgreSQL**.

## Prerequisites
- Docker and Docker Compose installed on your server.
- A remote PostgreSQL database (managed or self-hosted).

## Deployment Steps

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
- **Nginx**: Listens on port 80. Routes `/api/*` to the backend and serves static files from `/frontend`.
- **Backend (FastAPI)**: Runs inside a Docker container, accessible to Nginx via internal network.
- **Frontend**: Standard HTML/JS files served by Nginx.

## Port Map
- **Frontend/Nginx**: `http://<your-server-ip>/` (redirects to login)
- **Backend API**: `http://<your-server-ip>/api/docs` (Swagger UI)

## Troubleshooting
- **Database Connection**: Ensure your server's IP is allowlisted in your remote PostgreSQL provider's firewall.
- **Logs**: Check container logs using `docker-compose -f docker-compose.prod.yml logs -f`.

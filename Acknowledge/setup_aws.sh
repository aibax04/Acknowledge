#!/bash/bin

# 🚀 Acknowledge Platform - AWS EC2 Setup Script
# This script installs Docker, Docker Compose, and starts the application.

echo "--- 🛠️ Updating System ---"
sudo apt-get update -y
sudo apt-get upgrade -y

echo "--- 🐳 Installing Docker ---"
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Enable and start docker
sudo systemctl enable docker
sudo systemctl start docker

# Add current user to docker group (requires logout to take effect, but we use sudo for now)
sudo usermod -aG docker $USER

echo "--- ✅ Docker Installed ---"

# Single .env lives in backend/
if [ ! -f "backend/.env" ]; then
    echo "--- ⚠️ Creating backend/.env from example ---"
    cp backend/.env.example backend/.env
    echo "PLEASE EDIT backend/.env WITH SECURE CREDENTIALS!"
fi

echo "--- 🚀 Launching Application ---"
sudo docker compose -f docker-compose.prod.yml --env-file backend/.env up -d --build

echo "--- 🌱 Seeding Database ---"
# Wait a few seconds for DB to be ready
sleep 10
sudo docker exec acknowledge-backend-1 python seed_db.py

echo "--- 🎉 PLATFORM IS READY ---"
echo "Access at: http://$(curl -s ifconfig.me):8001/pages/login.html"
echo "NOTE: Make sure to open Port 8001 in your AWS EC2 Security Group!"

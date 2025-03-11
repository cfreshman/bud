#!/bin/bash
set -e

SERVER="root@204.48.20.134"
DOMAIN="bud-ga.me"

echo "Deploying backend..."

# Create remote directory
ssh $SERVER "mkdir -p /var/www/$DOMAIN/server"

# Copy server files (excluding data directory)
cd server
scp -r package*.json models routes services middleware index.js .env* $SERVER:/var/www/$DOMAIN/server/

# Install dependencies and start server
ssh $SERVER "
    cd /var/www/$DOMAIN/server
    npm install
    # Restart the server
    pm2 delete bud-backend || true
    pm2 start index.js --name bud-backend
    pm2 save
"

echo "Backend deployment complete!" 
#!/bin/bash
set -e

SERVER="root@204.48.20.134"
DOMAIN="bud-ga.me"

echo "Deploying backend..."

# Create remote directory
ssh $SERVER "mkdir -p /var/www/$DOMAIN/server"

# First enter server directory
cd server

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'bud-backend',
    script: 'index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      MONGODB_URI: 'mongodb://localhost:28000/bud'
    }
  }]
}
EOF

# Copy server files and ecosystem config
scp -r package*.json models routes services middleware index.js ecosystem.config.js $SERVER:/var/www/$DOMAIN/server/

# Install dependencies and start server
ssh $SERVER "
    cd /var/www/$DOMAIN/server
    npm install --production
    # Restart the server with ecosystem file
    pm2 delete bud-backend || true
    pm2 start ecosystem.config.js
    pm2 save
"

echo "Backend deployment complete!" 
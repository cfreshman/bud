#!/bin/bash
set -e

SERVER="root@204.48.20.134"
DOMAIN="bud-ga.me"

echo "Configuring MongoDB..."

# Create data directory in server directory
ssh $SERVER "mkdir -p /var/www/$DOMAIN/server/data/db"

# Create MongoDB config
ssh $SERVER "cat > /etc/mongod.conf << 'EOF'
storage:
  dbPath: /var/www/$DOMAIN/server/data/db

net:
  port: 28000
  bindIp: 127.0.0.1
EOF"

# Set proper permissions
ssh $SERVER "
    chown -R mongodb:mongodb /var/www/$DOMAIN/server/data/db
"

# Restart MongoDB with new config
ssh $SERVER "
    systemctl daemon-reload
    systemctl restart mongod
    systemctl enable mongod
"

echo "MongoDB configuration complete!" 
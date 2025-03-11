#!/bin/bash
set -e

SERVER="root@204.48.20.134"
DOMAIN="bud-ga.me"

echo "Configuring MongoDB..."

# Create data directory in server directory
ssh $SERVER "
    mkdir -p /var/www/$DOMAIN/server/data/db
    chown -R mongodb:mongodb /var/www/$DOMAIN/server/data/db
"

# Create MongoDB config
ssh $SERVER "cat > /etc/mongod.conf << 'EOF'
storage:
  dbPath: /var/www/$DOMAIN/server/data/db
  journal:
    enabled: true

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 28000
  bindIp: 127.0.0.1
EOF"

# Restart MongoDB with new config
ssh $SERVER "
    systemctl restart mongod
    systemctl enable mongod
"

echo "MongoDB configuration complete!" 
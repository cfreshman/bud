#!/bin/bash
set -e

SERVER="root@204.48.20.134"
echo "Setting up server dependencies..."

ssh $SERVER "
    # Update system
    apt update && apt upgrade -y

    # Install Node.js and npm
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs

    # Add MongoDB 8.0 repo and install
    apt install -y gnupg curl
    curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | \
        gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg \
        --dearmor
    echo 'deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse' | \
        tee /etc/apt/sources.list.d/mongodb-org-8.0.list
    apt update
    apt install -y mongodb-org

    # Configure MongoDB security
    mkdir -p /var/lib/mongodb
    chown -R mongodb:mongodb /var/lib/mongodb
    chmod 755 /var/lib/mongodb
    
    # Ensure MongoDB data directory has correct permissions
    systemctl stop mongod || true
    chown -R mongodb:mongodb /var/lib/mongodb
    chown mongodb:mongodb /tmp/mongodb-27017.sock || true

    # Install other required packages
    apt install -y nginx certbot python3-certbot-nginx ufw

    # Configure firewall
    ufw allow ssh
    ufw allow http
    ufw allow https
    ufw deny 28000  # Block external MongoDB access
    ufw --force enable

    # Start and enable MongoDB
    systemctl daemon-reload
    systemctl start mongod
    systemctl enable mongod

    # Install PM2 globally
    npm install -g pm2
"

echo "Server setup complete!" 
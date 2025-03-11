#!/bin/bash
set -e

SERVER="root@204.48.20.134"
DOMAIN="bud-ga.me"

echo "Building and deploying client..."

# Build client locally
cd client
npm install
# Build in production mode
NODE_ENV=production npx vite build

# Create remote directories and clean old files
ssh $SERVER "
    mkdir -p /var/www/$DOMAIN/client/dist
    rm -rf /var/www/$DOMAIN/client/dist/*
"

# Copy build
scp -r dist/* $SERVER:/var/www/$DOMAIN/client/dist/

echo "Client deployment complete!" 
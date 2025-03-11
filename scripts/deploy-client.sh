#!/bin/bash
set -e

SERVER="root@204.48.20.134"
DOMAIN="bud-ga.me"

echo "Building and deploying client..."

# Build client locally
cd client
npm install
# Skip TypeScript build and just run vite build
npx vite build

# Create remote directory and copy build
ssh $SERVER "mkdir -p /var/www/$DOMAIN/client"
scp -r dist/* $SERVER:/var/www/$DOMAIN/client/dist/

echo "Client deployment complete!" 
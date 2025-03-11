#!/bin/bash
set -e

echo "Starting deployment..."

# Deploy infrastructure
./scripts/deploy-mongodb.sh
./scripts/deploy-nginx.sh

# Deploy application
./scripts/deploy-client.sh
./scripts/deploy-backend.sh

echo "Deployment complete! Site should be live at https://bud-ga.me" 
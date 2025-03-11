#!/bin/bash
set -e

SERVER="root@204.48.20.134"
DOMAIN="bud-ga.me"
EMAIL="cyrus@freshman.dev"

echo "Configuring Nginx..."

# Create web root
ssh $SERVER "mkdir -p /var/www/$DOMAIN"

# First create a basic HTTP config to get SSL cert
ssh $SERVER "cat > /etc/nginx/sites-available/$DOMAIN << 'EOF'
server {
    listen 80;
    server_name $DOMAIN;
    root /var/www/$DOMAIN/client/dist;
    index index.html;
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF"

# Enable site
ssh $SERVER "
    ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl restart nginx
"

# Get SSL certificate
ssh $SERVER "certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email $EMAIL"

# Now update with full HTTPS config
ssh $SERVER "cat > /etc/nginx/sites-available/$DOMAIN << 'EOF'
server {
    server_name $DOMAIN;

    # Client files
    root /var/www/$DOMAIN/client/dist;
    index index.html;

    # API endpoints
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # Serve static files for client
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Enable gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml;
    gzip_disable \"MSIE [1-6]\.\";

    # Security headers
    add_header X-Frame-Options \"SAMEORIGIN\";
    add_header X-XSS-Protection \"1; mode=block\";
    add_header X-Content-Type-Options \"nosniff\";
    add_header Referrer-Policy \"no-referrer-when-downgrade\";
}
EOF"

# Reload nginx with new config
ssh $SERVER "nginx -t && systemctl reload nginx"

echo "Nginx configuration complete!" 
#!/bin/bash
set -e

SERVER="root@204.48.20.134"
DOMAIN="bud-ga.me"
EMAIL="cyrus@freshman.dev"

echo "Configuring Nginx..."

# Create web root
ssh $SERVER "mkdir -p /var/www/$DOMAIN"

# First create basic HTTP config for SSL verification
echo "Setting up initial HTTP config..."
ssh $SERVER "cat > /etc/nginx/sites-available/$DOMAIN << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    
    root /var/www/$DOMAIN/client/dist;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF"

# Enable site and remove default
ssh $SERVER "
    ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl restart nginx
"

# Get SSL certificate
echo "Getting SSL certificate..."
ssh $SERVER "certbot certonly --nginx -d $DOMAIN --non-interactive --agree-tos --email $EMAIL --force-renewal"

# Now configure full HTTPS setup
echo "Configuring HTTPS..."
ssh $SERVER "cat > /etc/nginx/sites-available/$DOMAIN << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/$DOMAIN/chain.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_stapling on;
    ssl_stapling_verify on;
    add_header Strict-Transport-Security 'max-age=31536000; includeSubDomains' always;

    # Client files
    root /var/www/$DOMAIN/client/dist;
    index index.html;

    # API endpoints
    location /api {
        proxy_pass http://localhost:3001;
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

# Final nginx restart with new config
echo "Applying final configuration..."
ssh $SERVER "nginx -t && systemctl restart nginx"

echo "Nginx configuration complete!" 
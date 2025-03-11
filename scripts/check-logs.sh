#!/bin/bash
set -e

SERVER="root@204.48.20.134"

echo "Checking backend logs..."
ssh $SERVER "journalctl -u mongod -n 50 | cat && echo '---' && pm2 logs --lines 50 | cat" 
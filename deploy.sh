#!/bin/bash
# deploy.sh
# Usage: ./deploy.sh /opt/kuma_instances/<username>

USER_DIR="$1"

if [ -z "$USER_DIR" ]; then
  echo "Usage: $0 /opt/kuma_instances/<username>"
  exit 1
fi

if [ ! -d "$USER_DIR" ]; then
  echo "Error: directory $USER_DIR does not exist"
  exit 1
fi

if [ ! -f "$USER_DIR/docker-compose.yml" ]; then
  echo "Error: docker-compose.yml not found in $USER_DIR"
  exit 1
fi

echo "Deploying instance in $USER_DIR..."
cd "$USER_DIR" || exit
docker compose up -d
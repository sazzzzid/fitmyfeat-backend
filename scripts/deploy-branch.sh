#!/bin/bash
set -euo pipefail

BRANCH="${1:-}"

case "$BRANCH" in
  main)
    DIR=/home/ssm-user/fitmyfeat-backend
    SERVICE=fitmyfeat-api
    ENV_FILE=.env
    ;;
  staging)
    DIR=/home/ssm-user/fitmyfeat-backend-staging
    SERVICE=fitmyfeat-stage-api
    ENV_FILE=.env.staging
    ;;
  *)
    echo "Use: deploy-branch.sh main|staging" >&2
    exit 1
    ;;
esac

cd "$DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
pnpm install
pnpm exec prisma generate
NODE_OPTIONS=--max-old-space-size=768 pnpm run build
node --env-file="$ENV_FILE" node_modules/prisma/build/index.js migrate deploy
sudo systemctl restart "$SERVICE"
echo "Deployed $BRANCH to $SERVICE"

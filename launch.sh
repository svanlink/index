#!/bin/bash
# Launch Catalog dev build
# Run this from any directory to start the app

cd "$(dirname "$0")" || exit 1

echo "Starting Catalog..."
corepack pnpm --filter @drive-project-catalog/desktop dev

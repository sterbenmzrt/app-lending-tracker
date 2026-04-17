#!/usr/bin/env bash
set -euo pipefail

echo "==> Generating firebase-config.js from Netlify environment variables"

cat > firebase-config.js <<EOF
export const firebaseConfig = {
  apiKey: "${FIREBASE_API_KEY:-}",
  authDomain: "${FIREBASE_AUTH_DOMAIN:-}",
  databaseURL: "${FIREBASE_DATABASE_URL:-}",
  projectId: "${FIREBASE_PROJECT_ID:-}",
  storageBucket: "${FIREBASE_STORAGE_BUCKET:-}",
  messagingSenderId: "${FIREBASE_MESSAGING_SENDER_ID:-}",
  appId: "${FIREBASE_APP_ID:-}"
};
EOF

echo "==> Build complete"

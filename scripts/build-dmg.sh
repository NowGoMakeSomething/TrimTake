#!/bin/bash
set -e

# TrimTake — Build DMG installer for macOS
# Output: dist/TrimTake-backend.dmg

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_DIR/dist"
APP_BUNDLE="$DIST_DIR/TrimTake Backend.app"
DMG_OUTPUT="$DIST_DIR/TrimTake-backend.dmg"
DMG_TEMP="$DIST_DIR/dmg-staging"
VOLUME_NAME="TrimTake Backend"

echo "=== TrimTake DMG Builder ==="
echo ""

# --- Build the .app first if it doesn't exist ---
if [ ! -d "$APP_BUNDLE" ]; then
    echo "[info] App bundle not found — building it first..."
    bash "$SCRIPT_DIR/build-mac-app.sh"
    echo ""
    echo "--- Continuing DMG build ---"
    echo ""
fi

# --- Prepare DMG staging area ---
echo "[1/3] Preparing DMG contents..."

rm -rf "$DMG_TEMP"
mkdir -p "$DMG_TEMP"

# Copy the .app bundle
cp -r "$APP_BUNDLE" "$DMG_TEMP/"

# Create symlink to Applications folder (for drag-to-install)
ln -s /Applications "$DMG_TEMP/Applications"

# Add a README
cat > "$DMG_TEMP/README.txt" << 'README'
TrimTake Backend
================

Installation:
  Drag "TrimTake Backend.app" to the Applications folder.

Then open it from Applications — the backend server will start
on localhost:3333 and show a notification when ready.

Auto-Start on Login:
  The app includes a LaunchAgent. To enable auto-start:
  1. Open Terminal
  2. Run: cp "/Applications/TrimTake Backend.app/../com.trimtake.backend.plist" ~/Library/LaunchAgents/ 2>/dev/null

  Or simply add "TrimTake Backend" to your Login Items in
  System Preferences > Users & Groups > Login Items.

Logs:
  ~/Library/Logs/TrimTake/backend.log

Uninstall:
  Delete "TrimTake Backend.app" from Applications.
  Remove ~/Library/LaunchAgents/com.trimtake.backend.plist if present.
README

# --- Create DMG ---
echo "[2/3] Creating DMG image..."

rm -f "$DMG_OUTPUT"

# Create DMG with drag-to-Applications layout
hdiutil create \
    -volname "$VOLUME_NAME" \
    -srcfolder "$DMG_TEMP" \
    -ov \
    -format UDZO \
    -imagekey zlib-level=9 \
    "$DMG_OUTPUT"

# --- Cleanup ---
echo "[3/3] Cleaning up..."
rm -rf "$DMG_TEMP"

echo ""
echo "Done! DMG created at: $DMG_OUTPUT"
echo ""
echo "Users can open the DMG and drag TrimTake Backend to Applications."

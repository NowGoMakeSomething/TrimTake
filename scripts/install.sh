#!/bin/bash
# TrimTake — Install CEP extension into Adobe Premiere Pro

set -e

EXTENSION_ID="com.trimtake.panel"
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)/$EXTENSION_ID"

# Determine OS-specific extensions folder
if [[ "$OSTYPE" == "darwin"* ]]; then
  DEST_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/$EXTENSION_ID"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  DEST_DIR="$APPDATA/Adobe/CEP/extensions/$EXTENSION_ID"
else
  echo "Unsupported OS: $OSTYPE"
  exit 1
fi

echo "TrimTake Installer"
echo "=================="
echo ""
echo "Source:      $SOURCE_DIR"
echo "Destination: $DEST_DIR"
echo ""

# Check source exists
if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: Extension source not found at $SOURCE_DIR"
  exit 1
fi

# Create destination directory
mkdir -p "$DEST_DIR"

# Copy extension files
cp -R "$SOURCE_DIR/"* "$DEST_DIR/"
echo "Extension files copied."

# Enable unsigned extensions (development mode)
if [[ "$OSTYPE" == "darwin"* ]]; then
  defaults write com.adobe.CSXS.11 PlayerDebugMode 1 2>/dev/null || true
  defaults write com.adobe.CSXS.10 PlayerDebugMode 1 2>/dev/null || true
  defaults write com.adobe.CSXS.9 PlayerDebugMode 1 2>/dev/null || true
  defaults write com.adobe.CSXS.8 PlayerDebugMode 1 2>/dev/null || true
  echo "Debug mode enabled for CEP (unsigned extensions allowed)."
fi

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Start the backend:  cd backend && npm install && npm start"
echo "  2. Restart Adobe Premiere Pro"
echo "  3. Go to Window > Extensions > TrimTake"

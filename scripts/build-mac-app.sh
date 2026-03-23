#!/bin/bash
set -e

# TrimTake — Build macOS .app bundle with standalone Node.js backend
# Output: dist/TrimTake Backend.app

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_DIR/dist"
BACKEND_DIR="$PROJECT_DIR/backend"
APP_NAME="TrimTake Backend"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
BUNDLE_ID="com.trimtake.backend"
VERSION="1.0.0"

echo "=== TrimTake macOS App Builder ==="
echo ""

# --- Check for pkg (preferred) or fall back to raw bundle ---
USE_PKG=false
if command -v pkg &> /dev/null; then
    USE_PKG=true
    echo "[info] Found 'pkg' — will create standalone binary (no Node.js required)"
elif command -v npx &> /dev/null; then
    echo "[info] 'pkg' not installed globally — will try via npx"
    USE_PKG=true
else
    echo "[info] Neither pkg nor npx found — will bundle with system Node.js"
fi

# --- Ensure backend dependencies are installed ---
echo "[1/5] Installing backend dependencies..."
cd "$BACKEND_DIR"
npm install --production --silent 2>/dev/null || npm install --production

# --- Build standalone binary ---
echo "[2/5] Building standalone executable..."
mkdir -p "$DIST_DIR/build-tmp"

if [ "$USE_PKG" = true ]; then
    # Use pkg to create a standalone binary
    if command -v pkg &> /dev/null; then
        pkg server.js \
            --target node18-macos-x64 \
            --output "$DIST_DIR/build-tmp/trimtake-backend" \
            2>/dev/null || true
    fi

    # If pkg failed or produced nothing, try npx
    if [ ! -f "$DIST_DIR/build-tmp/trimtake-backend" ]; then
        npx --yes pkg server.js \
            --target node18-macos-x64 \
            --output "$DIST_DIR/build-tmp/trimtake-backend" \
            2>/dev/null || true
    fi
fi

# Fallback: bundle Node.js source with a launcher script
if [ ! -f "$DIST_DIR/build-tmp/trimtake-backend" ]; then
    echo "      pkg unavailable — bundling source with launcher script"

    mkdir -p "$DIST_DIR/build-tmp/backend-bundle"
    cp -r "$BACKEND_DIR/server.js" "$BACKEND_DIR/analyzer.js" "$BACKEND_DIR/package.json" "$DIST_DIR/build-tmp/backend-bundle/"
    cp -r "$BACKEND_DIR/node_modules" "$DIST_DIR/build-tmp/backend-bundle/" 2>/dev/null || true
    mkdir -p "$DIST_DIR/build-tmp/backend-bundle/uploads"

    # Create launcher script
    cat > "$DIST_DIR/build-tmp/trimtake-backend" << 'LAUNCHER'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$DIR/../Resources/backend"

# Find Node.js
NODE=""
for candidate in /usr/local/bin/node /opt/homebrew/bin/node "$HOME/.nvm/versions/node"/*/bin/node; do
    if [ -x "$candidate" ]; then
        NODE="$candidate"
        break
    fi
done

if [ -z "$NODE" ]; then
    osascript -e 'display dialog "TrimTake requires Node.js 18+.\n\nPlease install from https://nodejs.org" with title "TrimTake Backend" buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi

export TRIMTAKE_APP_MODE=1
cd "$BACKEND_DIR"
exec "$NODE" server.js
LAUNCHER
    chmod +x "$DIST_DIR/build-tmp/trimtake-backend"
fi

# --- Create .app bundle ---
echo "[3/5] Creating .app bundle..."

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

# Copy executable
cp "$DIST_DIR/build-tmp/trimtake-backend" "$APP_BUNDLE/Contents/MacOS/TrimTakeBackend"
chmod +x "$APP_BUNDLE/Contents/MacOS/TrimTakeBackend"

# Copy backend source if using launcher mode
if [ -d "$DIST_DIR/build-tmp/backend-bundle" ]; then
    cp -r "$DIST_DIR/build-tmp/backend-bundle" "$APP_BUNDLE/Contents/Resources/backend"
fi

# Create wrapper script that runs in background and shows menubar status
cat > "$APP_BUNDLE/Contents/MacOS/TrimTake Backend" << 'WRAPPER'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$HOME/Library/Logs/TrimTake/backend.log"
PID_FILE="$HOME/Library/Application Support/TrimTake/backend.pid"

mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$(dirname "$PID_FILE")"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        osascript -e 'display dialog "TrimTake Backend is already running.\n\nCheck the menubar for status." with title "TrimTake" buttons {"OK"} default button "OK"'
        exit 0
    fi
fi

# Start backend
"$DIR/TrimTakeBackend" >> "$LOG_FILE" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$PID_FILE"

# Wait a moment for server to start
sleep 1

# Check if it started successfully
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    osascript -e "display dialog \"TrimTake Backend failed to start.\n\nCheck logs at:\n$LOG_FILE\" with title \"TrimTake\" buttons {\"OK\"} default button \"OK\" with icon stop"
    exit 1
fi

# Show menubar notification
osascript << EOF
display notification "Backend running on localhost:3333" with title "TrimTake" subtitle "Server started successfully"
EOF

# Keep the app "running" — monitor the backend process
while kill -0 "$BACKEND_PID" 2>/dev/null; do
    sleep 5
done

rm -f "$PID_FILE"
WRAPPER
chmod +x "$APP_BUNDLE/Contents/MacOS/TrimTake Backend"

# --- Info.plist ---
echo "[4/5] Writing Info.plist..."

cat > "$APP_BUNDLE/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>TrimTake Backend</string>
    <key>CFBundleDisplayName</key>
    <string>TrimTake Backend</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleExecutable</key>
    <string>TrimTake Backend</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>TMTK</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.video</string>
</dict>
</plist>
PLIST

# --- Create placeholder icon ---
# Generate a simple icon using sips if no icon exists
ICON_DIR="$APP_BUNDLE/Contents/Resources/AppIcon.iconset"
mkdir -p "$ICON_DIR"

# Create a simple colored square as placeholder icon
for size in 16 32 64 128 256 512; do
    sips -z $size $size /System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns \
        --out "$ICON_DIR/icon_${size}x${size}.png" 2>/dev/null || true
done

# Try to generate .icns from iconset
if ls "$ICON_DIR"/*.png 1> /dev/null 2>&1; then
    iconutil -c icns "$ICON_DIR" -o "$APP_BUNDLE/Contents/Resources/AppIcon.icns" 2>/dev/null || true
fi
rm -rf "$ICON_DIR"

# --- Create LaunchAgent plist for auto-start ---
echo "[5/5] Creating auto-start launch agent..."

LAUNCH_AGENT_DIR="$PROJECT_DIR/dist"
cat > "$LAUNCH_AGENT_DIR/com.trimtake.backend.plist" << LAUNCHAGENT
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.trimtake.backend</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Applications/TrimTake Backend.app/Contents/MacOS/TrimTake Backend</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/tmp/trimtake-backend.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/trimtake-backend.log</string>
</dict>
</plist>
LAUNCHAGENT

# Cleanup build artifacts
rm -rf "$DIST_DIR/build-tmp"

echo ""
echo "Done! App bundle created at: $APP_BUNDLE"
echo ""
echo "To enable auto-start on login:"
echo "  cp dist/com.trimtake.backend.plist ~/Library/LaunchAgents/"
echo "  launchctl load ~/Library/LaunchAgents/com.trimtake.backend.plist"

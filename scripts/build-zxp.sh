#!/bin/bash
set -e

# TrimTake — Build ZXP package for Adobe Extension Installer
# Output: dist/TrimTake-panel.zxp

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_DIR/dist"
PANEL_DIR="$PROJECT_DIR/com.trimtake.panel"
ZXP_OUTPUT="$DIST_DIR/TrimTake-panel.zxp"
CERT_DIR="$DIST_DIR/.certs"
CERT_FILE="$CERT_DIR/trimtake-self-signed.p12"
CERT_PASSWORD="trimtake-dev"

mkdir -p "$DIST_DIR"

echo "=== TrimTake ZXP Builder ==="
echo ""

# --- Method 1: Use ZXPSignCmd if available ---
if command -v ZXPSignCmd &> /dev/null; then
    echo "[1/3] Found ZXPSignCmd — using official Adobe signing tool"

    # Generate self-signed certificate if missing
    if [ ! -f "$CERT_FILE" ]; then
        echo "[2/3] Generating self-signed certificate..."
        mkdir -p "$CERT_DIR"
        ZXPSignCmd -selfSignedCert US CA "TrimTake" "TrimTake" "$CERT_PASSWORD" "$CERT_FILE"
    else
        echo "[2/3] Using existing certificate"
    fi

    # Remove old ZXP if present
    rm -f "$ZXP_OUTPUT"

    echo "[3/3] Packaging ZXP..."
    ZXPSignCmd -sign "$PANEL_DIR" "$ZXP_OUTPUT" "$CERT_FILE" "$CERT_PASSWORD" -tsa http://timestamp.digicert.com

    echo ""
    echo "Done! ZXP created at: $ZXP_OUTPUT"
    exit 0
fi

# --- Method 2: Manual zip+rename with self-signed cert via openssl ---
echo "[1/3] ZXPSignCmd not found — using manual zip method"
echo "      (Install ZXPSignCmd for official Adobe signing)"
echo "      https://github.com/nicbarker/aescripts-zxp-packager"
echo ""

# Generate self-signed certificate for metadata
if [ ! -f "$CERT_FILE" ]; then
    echo "[2/3] Generating self-signed certificate..."
    mkdir -p "$CERT_DIR"

    # Create a self-signed PKCS12 cert
    openssl req -x509 -newkey rsa:2048 -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
        -days 3650 -nodes -subj "/C=US/ST=CA/O=TrimTake/CN=TrimTake Dev" 2>/dev/null

    openssl pkcs12 -export -out "$CERT_FILE" \
        -inkey "$CERT_DIR/key.pem" -in "$CERT_DIR/cert.pem" \
        -passout "pass:$CERT_PASSWORD" 2>/dev/null

    # Clean up PEM files
    rm -f "$CERT_DIR/key.pem" "$CERT_DIR/cert.pem"
else
    echo "[2/3] Using existing certificate"
fi

echo "[3/3] Packaging ZXP (zip method)..."

# Remove old output
rm -f "$ZXP_OUTPUT"

# Create ZXP (which is just a signed ZIP)
cd "$PANEL_DIR"
zip -r "$ZXP_OUTPUT" . \
    -x "*.DS_Store" \
    -x "__MACOSX/*" \
    -x "*.git*" \
    > /dev/null

echo ""
echo "Done! ZXP created at: $ZXP_OUTPUT"
echo ""
echo "Note: This ZXP is self-signed. Users need ZXPInstaller to install it."
echo "      For production distribution, sign with an official Adobe certificate."

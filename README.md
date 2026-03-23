# TrimTake

Adobe Premiere Pro extension that uses AI to automatically detect and remove filler words (ums, ahs, you know, like, etc.) from video/audio tracks.

## For Users — Quick Install

### Step 1: Install the Backend

Download `TrimTake-backend.dmg`, open it, and drag **TrimTake Backend** to your Applications folder. Open it — you'll see a notification when the server is running.

### Step 2: Install the Premiere Pro Extension

Download [ZXPInstaller](https://zxpinstaller.com) (free). Open it and drag `TrimTake-panel.zxp` onto the ZXPInstaller window.

### Step 3: Open in Premiere Pro

Launch (or restart) Premiere Pro. Go to **Window > Extensions > TrimTake**.

### Step 4: Configure

Click the Settings icon in the TrimTake panel and enter your [Anthropic API key](https://console.anthropic.com). Adjust sensitivity and padding to your preference, then start editing.

---

## For Developers

### How It Works

1. Open the TrimTake panel inside Premiere Pro
2. Click **Use Current Sequence** or upload an audio file
3. The backend analyzes the audio for filler words using Claude AI
4. Review the detected fillers with timestamps and confidence scores
5. Select which ones to remove, then click **Apply Cuts**

### Project Structure

```
trimtake/
  com.trimtake.panel/          CEP extension
    CSXS/manifest.xml          CEP manifest
    index.html                 Panel UI
    js/main.js                 Panel logic
    js/csi.js                  CSInterface bridge
    css/style.css              Dark theme (Premiere-matched)
    jsx/trimtake.jsx           ExtendScript for Premiere
  backend/
    server.js                  Express server (port 3333)
    analyzer.js                Claude AI filler detection
    package.json
  scripts/
    install.sh                 Install extension to Premiere
    setup.js                   First-run setup
    build-zxp.sh               Package ZXP extension
    build-mac-app.sh           Build macOS .app bundle
    build-dmg.sh               Package .app into DMG
  dist/
    TrimTake-panel.zxp         Adobe extension (install with ZXPInstaller)
    TrimTake-backend.dmg       Mac app (drag to Applications)
    README-install.txt         Simple install guide
```

### Prerequisites

- Adobe Premiere Pro CC 2018+ (CEP 8+)
- Node.js 18+
- Anthropic API key (for Claude-powered analysis)

### Dev Installation

```bash
node scripts/setup.js                # Install dependencies
export ANTHROPIC_API_KEY=your-key    # Set API key
bash scripts/install.sh              # Install extension to Premiere
cd backend && npm start              # Start backend on localhost:3333
```

### Building Distribution Packages

```bash
cd backend
npm run build:zxp    # Build ZXP extension package
npm run build:app    # Build macOS .app bundle
npm run build:dmg    # Package .app into DMG installer
npm run build:all    # Build everything
```

### API Endpoints

| Method | Path       | Description                          |
|--------|-----------|--------------------------------------|
| GET    | /health   | Health check                         |
| POST   | /analyze  | Analyze audio for filler words       |
| POST   | /apply    | Generate ExtendScript to apply cuts  |

### Settings

- **Sensitivity** — Minimum confidence threshold (0-100%)
- **Padding** — Milliseconds of padding before/after each cut
- **Filler words** — Comma-separated list of words to detect

### Development

Run the backend in watch mode:

```bash
cd backend
npm run dev
```

To test the panel outside Premiere, open `com.trimtake.panel/index.html` in a browser. The CSInterface will use mock mode automatically.

## License

MIT

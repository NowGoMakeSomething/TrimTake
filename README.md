# TrimTake

Adobe Premiere Pro CEP panel plugin that uses AI to automatically detect and remove filler words (ums, ahs, you know, like, etc.) from video/audio tracks.

## How It Works

1. Open the TrimTake panel inside Premiere Pro
2. Click **Use Current Sequence** or upload an audio file
3. The backend analyzes the audio for filler words using Claude AI
4. Review the detected fillers with timestamps and confidence scores
5. Select which ones to remove, then click **Apply Cuts**

## Project Structure

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
```

## Prerequisites

- Adobe Premiere Pro CC 2018+ (CEP 8+)
- Node.js 18+
- Anthropic API key (for Claude-powered analysis)

## Installation

### 1. Run setup

```bash
node scripts/setup.js
```

This installs backend dependencies and validates your environment.

### 2. Set your API key

```bash
export ANTHROPIC_API_KEY=your-key-here
```

Without this, the backend will use mock filler data for testing.

### 3. Install the extension

```bash
bash scripts/install.sh
```

This copies the panel to Premiere's extensions folder and enables debug mode for unsigned extensions.

### 4. Start the backend

```bash
cd backend
npm start
```

The server runs on `http://localhost:3333`.

### 5. Open in Premiere Pro

Restart Premiere Pro, then go to **Window > Extensions > TrimTake**.

## API Endpoints

| Method | Path       | Description                          |
|--------|-----------|--------------------------------------|
| GET    | /health   | Health check                         |
| POST   | /analyze  | Analyze audio for filler words       |
| POST   | /apply    | Generate ExtendScript to apply cuts  |

## Settings

- **Sensitivity** — Minimum confidence threshold (0-100%)
- **Padding** — Milliseconds of padding before/after each cut
- **Filler words** — Comma-separated list of words to detect

## Development

Run the backend in watch mode:

```bash
cd backend
npm run dev
```

To test the panel outside Premiere, open `com.trimtake.panel/index.html` in a browser. The CSInterface will use mock mode automatically.

## License

MIT

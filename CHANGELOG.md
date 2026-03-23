# Changelog

## v1.1.0 — Overnight Polish (2026-03-22)

### UI/UX (Loop 1)
- **Dark theme overhaul**: Updated all colors to match Premiere Pro exactly (`#1a1a1a`, `#2d2d2d`, `#3c3c3c`, accent `#00a8ff`)
- **Toast notifications**: Replaced all `alert()` calls with non-blocking toast system (success/error/warning)
- **Confidence color-coding**: Green (>80%), yellow (50-80%), red (<50%) badges on each result
- **Summary bar**: Shows total detected, selected count, and total filler duration at a glance
- **Smooth animations**: Settings panel slides open/closed; toasts animate in/out; progress bar has indeterminate mode
- **Responsive layout**: Body uses flexbox column with scrollable content area — works on any panel size
- **Confirmation dialog**: "Apply Cuts" now shows a modal confirmation before destructive edits
- **Keyboard shortcuts**: `A` to analyze, `S` to toggle settings, `Esc` to close settings
- **Keyboard hint display**: Empty state shows available shortcuts

### Functionality (Loops 2-3)
- **API key management**: Input field in settings, saved to `localStorage`, sent to backend at runtime
- **Settings persistence**: Sensitivity, padding, and filler words saved to `localStorage` automatically
- **Export CSV**: One-click CSV download of selected fillers (word, start, end, duration, confidence)
- **Export JSON**: One-click JSON download with export timestamp
- **Backend status**: "Connecting..." state with animated dot on startup; version shown in status bar
- **Guard against double-analysis**: Analyze button disabled while already running
- **File size validation**: Client-side 500MB check before uploading
- **Better empty state**: Shows actionable message when no fillers found ("try lowering sensitivity")
- **Mock CSI responses**: Realistic mock data when running outside Premiere Pro (for development)

### Backend (Loop 4)
- **Input validation**: All endpoints validate request body shape, types, and ranges
- **File type filtering**: Multer only accepts audio/* and video/* MIME types
- **File size limit**: 500MB max enforced at multer level with clear error message
- **Analysis timeout**: 2-minute timeout prevents hung requests
- **Cuts validation**: Validates each cut has valid start/end numbers; max 1000 cuts per request
- **Padding validation**: paddingBefore/paddingAfter must be 0-5000ms
- **`POST /config` endpoint**: Accepts API key at runtime from the panel
- **Upload cleanup**: Uploaded files are deleted after processing
- **Uploads directory**: Auto-created on server start
- **Error handler middleware**: Multer errors return proper JSON responses
- **Health check**: Now returns uptime and maxFileSize

### Code Quality (Loop 5)
- **Removed all `console.log`** from production code paths (analyzer, CSI bridge)
- **CSI bridge**: Added request timeouts (AbortController), better error extraction from API responses
- **ExtendScript**: All functions wrapped in try/catch, return JSON error objects instead of throwing
- **ExtendScript**: Added input validation for cuts data (type checks, range validation)
- **ExtendScript**: Guard against missing media path with nested try/catch
- **Analyzer**: Validates parsed Claude response structure (types, ranges) before returning
- **Analyzer**: Switched model from opus to sonnet for faster analysis
- **Analyzer**: Lazy client initialization; `setApiKey()` forces client re-creation
- **Mock data**: Added varied confidence scores (0.42–0.97) to exercise all confidence tiers

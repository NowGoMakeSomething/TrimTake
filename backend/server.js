const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const { analyzeTranscript, generateMockTranscript, generateMockFillers, buildCutScript } = require("./analyzer");

const app = express();
const PORT = 3333;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: path.join(__dirname, "uploads") });

// --- Health check ---
app.get("/health", (req, res) => {
  res.json({ status: "ok", version: "1.0.0" });
});

// --- Analyze audio/sequence ---
app.post("/analyze", upload.single("audio"), async (req, res) => {
  try {
    let fillers;

    if (req.file) {
      // A file was uploaded — in production, run Whisper here to get transcript
      // For now, generate mock fillers
      console.log(`Received file: ${req.file.originalname} (${req.file.size} bytes)`);
      fillers = generateMockFillers();
    } else if (req.body) {
      const { sequenceName, videoPath, settings } = req.body;
      console.log(`Analyzing sequence: ${sequenceName || "unknown"}`);

      if (videoPath) {
        // In production: extract audio, run Whisper, then analyze with Claude
        // For now: generate mock transcript and try Claude analysis
        const transcript = generateMockTranscript(sequenceName);

        try {
          fillers = await analyzeTranscript(transcript, settings);
        } catch (err) {
          console.warn("Claude API call failed, using mock data:", err.message);
          fillers = generateMockFillers();
        }
      } else {
        fillers = generateMockFillers();
      }

      // Filter by sensitivity if provided
      if (settings && settings.sensitivity) {
        fillers = fillers.filter((f) => f.confidence >= settings.sensitivity);
      }
    } else {
      return res.status(400).json({ error: "No audio file or sequence info provided" });
    }

    res.json({
      fillers,
      count: fillers.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
});

// --- Apply cuts ---
app.post("/apply", (req, res) => {
  try {
    const { cuts, paddingBefore, paddingAfter } = req.body;

    if (!cuts || !cuts.length) {
      return res.status(400).json({ error: "No cuts provided" });
    }

    const script = buildCutScript(cuts, paddingBefore, paddingAfter);

    res.json({
      script,
      cutsCount: cuts.length,
      message: `Generated ExtendScript for ${cuts.length} cuts`,
    });
  } catch (err) {
    console.error("Apply error:", err);
    res.status(500).json({ error: "Failed to generate cut script: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`TrimTake backend running on http://localhost:${PORT}`);
  console.log("Endpoints:");
  console.log("  GET  /health   — Health check");
  console.log("  POST /analyze  — Analyze audio for filler words");
  console.log("  POST /apply    — Generate ExtendScript for cuts");
});

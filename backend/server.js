const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { analyzeTranscript, transcribeAndAnalyze, generateMockTranscript, generateMockFillers, buildCutScript, setApiKey } = require("./analyzer");

const app = express();
const PORT = process.env.PORT || 3333;
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ANALYSIS_TIMEOUT = 120000; // 2 minutes

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: function (req, file, cb) {
    var allowed = /^(audio|video)\//;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only audio and video files are accepted"));
    }
  },
});

// Track server start time for uptime
var startTime = Date.now();

// --- Health check ---
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "1.1.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    maxFileSize: MAX_FILE_SIZE,
  });
});

// --- Usage stats (mock data for now) ---
app.get("/usage", (req, res) => {
  var minutesUsed = 24;
  var minutesLimit = 30;
  res.json({
    plan: "free",
    minutesUsed,
    minutesLimit,
    resetDate: "2026-04-01",
    percentUsed: Math.round((minutesUsed / minutesLimit) * 100),
  });
});

// --- Config (receive API key from panel) ---
app.post("/config", (req, res) => {
  var apiKey = req.body && req.body.apiKey;
  if (apiKey && typeof apiKey === "string" && apiKey.startsWith("sk-")) {
    setApiKey(apiKey);
    res.json({ status: "ok" });
  } else {
    res.status(400).json({ error: "Invalid API key format" });
  }
});

// --- Analyze audio/sequence ---
app.post("/analyze", upload.single("audio"), async (req, res) => {
  // Set a timeout for the entire analysis
  var timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: "Analysis timed out. Try a shorter clip." });
    }
  }, ANALYSIS_TIMEOUT);

  try {
    let fillers;

    if (req.file) {
      fillers = generateMockFillers();

      // Clean up uploaded file after processing
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    } else if (req.body && (req.body.sequenceName || req.body.videoPath)) {
      var sequenceName = req.body.sequenceName || "unknown";
      var videoPath = req.body.videoPath || "";
      var settings = req.body.settings || {};

      if (typeof sequenceName !== "string" || sequenceName.length > 500) {
        clearTimeout(timer);
        return res.status(400).json({ error: "Invalid sequence name" });
      }

      if (videoPath) {
        try {
          // Real transcription pipeline: ffmpeg -> Whisper -> Claude
          var result = await transcribeAndAnalyze(videoPath, settings);
          fillers = result.fillers;
          // Include extra info in response
          res._transcriptMeta = {
            transcript: result.transcript,
            language: result.language,
            duration: result.duration,
            mock: false,
          };
        } catch (err) {
          console.error("Transcription failed, falling back to mock:", err.message);
          fillers = generateMockFillers();
          res._transcriptMeta = {
            mock: true,
            warning: "Real transcription failed: " + err.message,
          };
        }
      } else {
        fillers = generateMockFillers();
        res._transcriptMeta = {
          mock: true,
          warning: "No video path provided — using mock data for demo",
        };
      }

      // Filter by sensitivity if provided
      if (settings && typeof settings.sensitivity === "number" && settings.sensitivity > 0 && settings.sensitivity <= 1) {
        fillers = fillers.filter((f) => f.confidence >= settings.sensitivity);
      }
    } else {
      clearTimeout(timer);
      return res.status(400).json({ error: "No audio file or sequence info provided" });
    }

    clearTimeout(timer);
    if (!res.headersSent) {
      var response = {
        fillers,
        count: fillers.length,
        timestamp: new Date().toISOString(),
      };
      // Attach transcript metadata if available
      if (res._transcriptMeta) {
        Object.assign(response, res._transcriptMeta);
      }
      res.json(response);
    }
  } catch (err) {
    clearTimeout(timer);
    if (!res.headersSent) {
      res.status(500).json({ error: "Analysis failed: " + err.message });
    }
  }
});

// --- Apply cuts ---
app.post("/apply", (req, res) => {
  try {
    var cuts = req.body && req.body.cuts;
    var paddingBefore = req.body && req.body.paddingBefore;
    var paddingAfter = req.body && req.body.paddingAfter;

    if (!Array.isArray(cuts) || cuts.length === 0) {
      return res.status(400).json({ error: "No cuts provided" });
    }

    if (cuts.length > 1000) {
      return res.status(400).json({ error: "Too many cuts (max 1000)" });
    }

    // Validate each cut has start and end
    for (var i = 0; i < cuts.length; i++) {
      var c = cuts[i];
      if (typeof c.start !== "number" || typeof c.end !== "number" || c.start < 0 || c.end <= c.start) {
        return res.status(400).json({ error: "Invalid cut at index " + i + ": start and end must be valid numbers" });
      }
    }

    if (paddingBefore !== undefined && (typeof paddingBefore !== "number" || paddingBefore < 0 || paddingBefore > 5000)) {
      return res.status(400).json({ error: "paddingBefore must be 0-5000ms" });
    }

    if (paddingAfter !== undefined && (typeof paddingAfter !== "number" || paddingAfter < 0 || paddingAfter > 5000)) {
      return res.status(400).json({ error: "paddingAfter must be 0-5000ms" });
    }

    var script = buildCutScript(cuts, paddingBefore, paddingAfter);

    res.json({
      script,
      cutsCount: cuts.length,
      message: "Generated ExtendScript for " + cuts.length + " cuts",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate cut script: " + err.message });
  }
});

// --- Multer error handler ---
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File too large (max " + Math.round(MAX_FILE_SIZE / 1024 / 1024) + "MB)" });
    }
    return res.status(400).json({ error: "Upload error: " + err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

app.listen(PORT, () => {
  console.log("TrimTake backend running on http://localhost:" + PORT);
});

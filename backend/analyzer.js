const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

let client = null;
let runtimeApiKey = null;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function getClient() {
  var key = runtimeApiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!client || runtimeApiKey) {
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

function setApiKey(key) {
  runtimeApiKey = key;
  client = null; // force re-creation
}

const DEFAULT_FILLER_WORDS = [
  "um", "uh", "ah", "er", "like", "you know", "I mean",
  "basically", "actually", "literally", "right", "so yeah",
  "kind of", "sort of",
  // Spanish
  "este", "eh", "mmm", "o sea", "bueno", "básicamente",
  "literalmente", "¿no?", "¿verdad?", "no?", "verdad?",
];

/**
 * Check if ffmpeg is available on the system.
 */
function checkFfmpeg() {
  return new Promise(function (resolve) {
    execFile("ffmpeg", ["-version"], function (err) {
      resolve(!err);
    });
  });
}

/**
 * Extract audio from a video file using ffmpeg.
 * Returns the path to a temporary 16kHz mono WAV file.
 */
function extractAudio(videoPath) {
  return new Promise(function (resolve, reject) {
    var tmpFile = path.join(os.tmpdir(), "trimtake_audio_" + Date.now() + ".wav");
    execFile("ffmpeg", [
      "-i", videoPath,
      "-vn",
      "-acodec", "pcm_s16le",
      "-ar", "16000",
      "-ac", "1",
      "-y",
      tmpFile,
    ], { timeout: 120000 }, function (err, stdout, stderr) {
      if (err) {
        reject(new Error("ffmpeg failed: " + (err.message || stderr)));
      } else {
        resolve(tmpFile);
      }
    });
  });
}

/**
 * Transcribe audio using OpenAI Whisper API.
 * Returns verbose JSON with word-level timestamps.
 */
async function transcribeAudio(audioPath) {
  var fileStream = fs.createReadStream(audioPath);
  var response = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: fileStream,
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });
  return response;
}

/**
 * Full pipeline: extract audio from video, transcribe with Whisper,
 * then analyze with Claude for filler detection.
 */
async function transcribeAndAnalyze(videoPath, settings) {
  var hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    throw new Error("ffmpeg is not installed. Please install ffmpeg to analyze real audio.");
  }

  // Verify video file exists
  if (!fs.existsSync(videoPath)) {
    throw new Error("Video file not found: " + videoPath);
  }

  var audioPath = null;
  try {
    // Step 1: Extract audio
    audioPath = await extractAudio(videoPath);

    // Step 2: Transcribe with Whisper
    var whisperResult = await transcribeAudio(audioPath);

    // Step 3: Build transcript with word timestamps for Claude
    var words = whisperResult.words || [];
    var transcriptText = whisperResult.text || "";

    // Build a timestamped transcript string from Whisper words
    var timestampedLines = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      timestampedLines.push("[" + w.start.toFixed(2) + "-" + w.end.toFixed(2) + "] " + w.word);
    }
    var timestampedTranscript = timestampedLines.join("\n");

    // Step 4: Use Claude to detect fillers from the real transcript
    var fillers = await analyzeTranscriptWithTimestamps(transcriptText, timestampedTranscript, words, settings);

    return {
      fillers: fillers,
      transcript: transcriptText,
      language: whisperResult.language || "unknown",
      duration: whisperResult.duration || 0,
      mock: false,
    };
  } finally {
    // Clean up temp audio file
    if (audioPath) {
      try { fs.unlinkSync(audioPath); } catch (e) { /* ignore */ }
    }
  }
}

/**
 * Analyze a real Whisper transcript for fillers using Claude.
 * Uses the word-level timestamps from Whisper for accurate timing.
 */
async function analyzeTranscriptWithTimestamps(fullText, timestampedTranscript, words, settings) {
  var anthropic = getClient();
  if (!anthropic) {
    throw new Error("No API key configured. Set ANTHROPIC_API_KEY or provide one in Settings.");
  }

  var fillerWords = (settings && settings.fillerWords) || DEFAULT_FILLER_WORDS;
  var sensitivity = (settings && settings.sensitivity) || 0.7;

  var prompt = "You are a precise audio transcript analyzer. You have a transcript from Whisper with exact word-level timestamps.\n\n" +
    "Filler words to detect: " + fillerWords.join(", ") + "\n\n" +
    "Full transcript:\n" + fullText + "\n\n" +
    "Word-level timestamps:\n" + timestampedTranscript + "\n\n" +
    "Instructions:\n" +
    "1. Identify all filler words and verbal hesitations from the list above.\n" +
    "2. For multi-word fillers (like 'you know', 'I mean', 'o sea'), combine the timestamps of the component words.\n" +
    "3. Use the EXACT start/end timestamps from the Whisper data — do NOT invent times.\n" +
    "4. Assign a confidence score based on how likely the word is used as a filler vs. meaningful speech.\n\n" +
    "Only include fillers with confidence >= " + sensitivity + ".\n\n" +
    "Respond ONLY with a JSON array of objects: [{\"word\": string, \"start\": number, \"end\": number, \"confidence\": number}]\n" +
    "If no fillers found, respond with [].";

  var response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  var textBlock = response.content.find(function (b) { return b.type === "text"; });
  if (!textBlock) return [];

  try {
    var jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    var parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function (item) {
      return item &&
        typeof item.word === "string" &&
        typeof item.start === "number" &&
        typeof item.end === "number" &&
        typeof item.confidence === "number" &&
        item.start >= 0 &&
        item.end > item.start &&
        item.confidence >= 0 &&
        item.confidence <= 1;
    });
  } catch (e) {
    return [];
  }
}

/**
 * Analyze a transcript for filler words using Claude.
 * Returns an array of { word, start, end, confidence }.
 */
async function analyzeTranscript(transcript, settings = {}) {
  var anthropic = getClient();
  if (!anthropic) {
    throw new Error("No API key configured. Set ANTHROPIC_API_KEY or provide one in Settings.");
  }

  var fillerWords = settings.fillerWords || DEFAULT_FILLER_WORDS;
  var sensitivity = settings.sensitivity || 0.7;

  var prompt = "You are a precise audio transcript analyzer. Analyze the following transcript and identify all filler words and verbal hesitations.\n\n" +
    "Filler words to detect: " + fillerWords.join(", ") + "\n\n" +
    "Transcript:\n" + transcript + "\n\n" +
    "For each detected filler word, output a JSON array of objects with these fields:\n" +
    '- "word": the filler word detected (lowercase)\n' +
    '- "start": start time in seconds (decimal)\n' +
    '- "end": end time in seconds (decimal)\n' +
    '- "confidence": confidence score between 0.0 and 1.0\n\n' +
    "Only include fillers with confidence >= " + sensitivity + ".\n\n" +
    "Respond ONLY with the JSON array, no other text. If no fillers found, respond with [].";

  var response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  var textBlock = response.content.find(function (b) { return b.type === "text"; });
  if (!textBlock) return [];

  try {
    var jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    var parsed = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function (item) {
      return item &&
        typeof item.word === "string" &&
        typeof item.start === "number" &&
        typeof item.end === "number" &&
        typeof item.confidence === "number" &&
        item.start >= 0 &&
        item.end > item.start &&
        item.confidence >= 0 &&
        item.confidence <= 1;
    });
  } catch (e) {
    return [];
  }
}

/**
 * Generate a mock transcript with timestamps for demo/testing.
 */
function generateMockTranscript(sequenceName) {
  return "[0.00] So, um, today I wanted to talk about, you know, the new features.\n" +
    "[3.50] We've been, uh, working really hard on, like, improving the performance.\n" +
    "[7.20] And basically, the results are, um, actually pretty amazing.\n" +
    "[10.80] I mean, we literally saw a, you know, fifty percent improvement.\n" +
    "[14.50] So yeah, um, kind of exciting stuff, right?\n" +
    "[17.30] The team has, uh, sort of figured out the main bottlenecks.\n" +
    "[20.10] And, like, we're now, um, you know, optimizing everything.\n" +
    "[23.50] So basically, that's, uh, the update for this week.";
}

/**
 * Generate mock filler detections for demo/testing.
 */
function generateMockFillers() {
  return [
    { word: "um", start: 0.85, end: 1.10, confidence: 0.95 },
    { word: "you know", start: 1.95, end: 2.40, confidence: 0.92 },
    { word: "uh", start: 4.10, end: 4.35, confidence: 0.94 },
    { word: "like", start: 5.20, end: 5.45, confidence: 0.78 },
    { word: "basically", start: 7.30, end: 7.85, confidence: 0.91 },
    { word: "um", start: 8.50, end: 8.75, confidence: 0.96 },
    { word: "actually", start: 9.10, end: 9.55, confidence: 0.67 },
    { word: "I mean", start: 10.80, end: 11.15, confidence: 0.90 },
    { word: "literally", start: 11.50, end: 12.00, confidence: 0.55 },
    { word: "you know", start: 12.20, end: 12.65, confidence: 0.93 },
    { word: "so yeah", start: 14.50, end: 14.95, confidence: 0.89 },
    { word: "um", start: 15.10, end: 15.35, confidence: 0.97 },
    { word: "kind of", start: 15.70, end: 16.05, confidence: 0.46 },
    { word: "right", start: 16.80, end: 17.05, confidence: 0.42 },
    { word: "uh", start: 17.60, end: 17.85, confidence: 0.93 },
    { word: "sort of", start: 18.00, end: 18.40, confidence: 0.88 },
    { word: "like", start: 20.30, end: 20.55, confidence: 0.90 },
    { word: "um", start: 20.90, end: 21.15, confidence: 0.95 },
    { word: "you know", start: 21.40, end: 21.85, confidence: 0.91 },
    { word: "basically", start: 23.50, end: 24.00, confidence: 0.92 },
    { word: "uh", start: 24.30, end: 24.55, confidence: 0.94 },
  ];
}

/**
 * Build an ExtendScript command string to apply cuts in Premiere.
 */
function buildCutScript(cuts, paddingBefore, paddingAfter) {
  var paddedCuts = cuts.map(function (c) {
    return {
      start: Math.max(0, c.start - (paddingBefore || 0) / 1000),
      end: c.end + (paddingAfter || 0) / 1000,
    };
  });

  // Use double-escaping for the JSON string inside ExtendScript
  var jsonStr = JSON.stringify(paddedCuts).replace(/'/g, "\\'");
  return "trimtake_applyCuts('" + jsonStr + "')";
}

module.exports = {
  analyzeTranscript,
  analyzeTranscriptWithTimestamps,
  transcribeAndAnalyze,
  checkFfmpeg,
  generateMockTranscript,
  generateMockFillers,
  buildCutScript,
  setApiKey,
};

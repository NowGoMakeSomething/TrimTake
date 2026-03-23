const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

const DEFAULT_FILLER_WORDS = [
  "um", "uh", "ah", "er", "like", "you know", "I mean",
  "basically", "actually", "literally", "right", "so yeah",
  "kind of", "sort of",
];

/**
 * Analyze a transcript for filler words using Claude.
 * Returns an array of { word, start, end, confidence }.
 */
async function analyzeTranscript(transcript, settings = {}) {
  const fillerWords = settings.fillerWords || DEFAULT_FILLER_WORDS;
  const sensitivity = settings.sensitivity || 0.7;

  const prompt = `You are a precise audio transcript analyzer. Analyze the following transcript and identify all filler words and verbal hesitations.

Filler words to detect: ${fillerWords.join(", ")}

Transcript:
${transcript}

For each detected filler word, output a JSON array of objects with these fields:
- "word": the filler word detected (lowercase)
- "start": start time in seconds (decimal)
- "end": end time in seconds (decimal)
- "confidence": confidence score between 0.0 and 1.0

Only include fillers with confidence >= ${sensitivity}.

Respond ONLY with the JSON array, no other text. If no fillers found, respond with [].`;

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) return [];

  try {
    const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("Failed to parse Claude response:", e.message);
    return [];
  }
}

/**
 * Generate a mock transcript with timestamps for demo/testing purposes.
 * In production this would use Whisper or another ASR service.
 */
function generateMockTranscript(sequenceName) {
  return `[0.00] So, um, today I wanted to talk about, you know, the new features.
[3.50] We've been, uh, working really hard on, like, improving the performance.
[7.20] And basically, the results are, um, actually pretty amazing.
[10.80] I mean, we literally saw a, you know, fifty percent improvement.
[14.50] So yeah, um, kind of exciting stuff, right?
[17.30] The team has, uh, sort of figured out the main bottlenecks.
[20.10] And, like, we're now, um, you know, optimizing everything.
[23.50] So basically, that's, uh, the update for this week.`;
}

/**
 * Generate mock filler detections for demo/testing.
 * Used when no real audio file is provided.
 */
function generateMockFillers() {
  return [
    { word: "um", start: 0.85, end: 1.10, confidence: 0.95 },
    { word: "you know", start: 1.95, end: 2.40, confidence: 0.92 },
    { word: "uh", start: 4.10, end: 4.35, confidence: 0.94 },
    { word: "like", start: 5.20, end: 5.45, confidence: 0.88 },
    { word: "basically", start: 7.30, end: 7.85, confidence: 0.91 },
    { word: "um", start: 8.50, end: 8.75, confidence: 0.96 },
    { word: "actually", start: 9.10, end: 9.55, confidence: 0.87 },
    { word: "I mean", start: 10.80, end: 11.15, confidence: 0.90 },
    { word: "literally", start: 11.50, end: 12.00, confidence: 0.85 },
    { word: "you know", start: 12.20, end: 12.65, confidence: 0.93 },
    { word: "so yeah", start: 14.50, end: 14.95, confidence: 0.89 },
    { word: "um", start: 15.10, end: 15.35, confidence: 0.97 },
    { word: "kind of", start: 15.70, end: 16.05, confidence: 0.86 },
    { word: "right", start: 16.80, end: 17.05, confidence: 0.82 },
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
  const paddedCuts = cuts.map((c) => ({
    start: Math.max(0, c.start - (paddingBefore || 0) / 1000),
    end: c.end + (paddingAfter || 0) / 1000,
  }));

  return `trimtake_applyCuts('${JSON.stringify(paddedCuts)}')`;
}

module.exports = {
  analyzeTranscript,
  generateMockTranscript,
  generateMockFillers,
  buildCutScript,
};

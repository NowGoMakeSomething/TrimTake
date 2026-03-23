#!/usr/bin/env node
/**
 * TrimTake — First-run setup script.
 * Installs backend dependencies and validates environment.
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const BACKEND = path.join(ROOT, "backend");

console.log("TrimTake Setup");
console.log("==============\n");

// 1. Check Node.js version
const nodeVersion = process.version;
const major = parseInt(nodeVersion.slice(1).split(".")[0], 10);
if (major < 18) {
  console.error(`Error: Node.js 18+ required (found ${nodeVersion})`);
  process.exit(1);
}
console.log(`Node.js ${nodeVersion} — OK`);

// 2. Install backend dependencies
console.log("\nInstalling backend dependencies...");
try {
  execSync("npm install", { cwd: BACKEND, stdio: "inherit" });
  console.log("Dependencies installed.");
} catch (e) {
  console.error("Failed to install dependencies:", e.message);
  process.exit(1);
}

// 3. Check for ANTHROPIC_API_KEY
if (process.env.ANTHROPIC_API_KEY) {
  console.log("\nANTHROPIC_API_KEY — found");
} else {
  console.warn("\nWarning: ANTHROPIC_API_KEY not set.");
  console.warn("The backend will use mock data for filler detection.");
  console.warn("Set it with: export ANTHROPIC_API_KEY=your-key-here\n");
}

// 4. Check for uploads directory
const uploadsDir = path.join(BACKEND, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("Created uploads directory.");
}

console.log("\nSetup complete!");
console.log("\nTo start:");
console.log("  1. Run the install script:  bash scripts/install.sh");
console.log("  2. Start the backend:       cd backend && npm start");
console.log("  3. Open Premiere Pro and find TrimTake under Window > Extensions");

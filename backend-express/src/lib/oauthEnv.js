const fs = require('fs');
const path = require('path');

function resolvePath(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

/** Load OAuth JSON from env var (plain or base64) or file — for Render deploy. */
function loadJsonFromEnvOrFile(envVar, filePath) {
  const raw = process.env[envVar]?.trim();
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      try {
        return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      } catch {
        console.warn(`[oauth] Invalid ${envVar} — must be JSON or base64 JSON`);
      }
    }
  }
  const resolved = resolvePath(filePath);
  if (resolved && fs.existsSync(resolved)) {
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  }
  return null;
}

module.exports = { loadJsonFromEnvOrFile, resolvePath };

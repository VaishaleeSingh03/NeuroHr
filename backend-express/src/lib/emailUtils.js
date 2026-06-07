function normalizeEmail(raw) {
  if (!raw) return null;
  const match = String(raw).trim().toLowerCase().match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/);
  return match ? match[0] : null;
}

module.exports = { normalizeEmail };

const fs = require('fs');
const path = require('path');

function getResumeBuffer(app) {
  if (!app) return null;
  if (app.resumeData?.length) {
    return Buffer.isBuffer(app.resumeData) ? app.resumeData : Buffer.from(app.resumeData);
  }
  if (app.resumePath && fs.existsSync(app.resumePath)) {
    return fs.readFileSync(app.resumePath);
  }
  return null;
}

function getResumeAttachment(app) {
  const buffer = getResumeBuffer(app);
  if (!buffer?.length) return null;
  const filename = app.resumeFileName || 'candidate-resume.pdf';
  const contentType = app.resumeMimeType || 'application/pdf';
  return {
    filename,
    content: buffer,
    contentType,
  };
}

module.exports = { getResumeBuffer, getResumeAttachment };

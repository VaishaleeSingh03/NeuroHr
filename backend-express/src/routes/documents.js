const express = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const { Document, getNextSeq } = require('../models');
const ml = require('../services/mlClient');
const config = require('../config');

const upload = multer({ dest: config.uploadDir });
const router = express.Router();

router.post('/analyze', auth(), upload.single('file'), async (req, res) => {
  const result = await ml.analyzeDocument(req.file.path, req.body.document_type || 'resume');
  const id = await getNextSeq('documents');
  const doc = await Document.create({
    id,
    candidateId: req.body.candidate_id ? parseInt(req.body.candidate_id) : undefined,
    documentType: req.body.document_type || 'resume',
    filePath: req.file.path,
    extractedText: result.extracted_text,
    extractedFields: result.extracted_fields,
    verificationScore: result.verification_score,
    ocrConfidence: result.ocr_confidence,
  });
  res.json({ ...result, id: doc.id });
});

router.get('/', auth(), async (req, res) => {
  res.json(await Document.find().sort({ createdAt: -1 }).limit(50).lean());
});

module.exports = router;

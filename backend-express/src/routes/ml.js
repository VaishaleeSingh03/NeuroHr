const express = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const { AIModel, getNextSeq } = require('../models');
const ml = require('../services/mlClient');
const config = require('../config');

const upload = multer({ dest: config.uploadDir });
const router = express.Router();

router.post('/upload-dataset', auth(['management_admin', 'hr_recruiter']), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ dataset_path: req.file.path, filename: req.file.originalname });
});

router.post('/train', auth(['management_admin', 'hr_recruiter']), upload.single('file'), async (req, res) => {
  const filePath = req.file?.path || req.body.dataset_path;
  if (!filePath) return res.status(400).json({ error: 'Upload CSV dataset first' });
  const result = await ml.trainModel(filePath, {
    model_name: req.body.model_name || 'custom_model',
    target_column: req.body.target_column || 'label',
    algorithm: req.body.algorithm || 'random_forest',
    hyperparameter_tuning: req.body.hyperparameter_tuning || req.body.tuning || 'grid_search',
  }, req.file?.originalname || 'dataset.csv');
  const id = await getNextSeq('ai_models');
  const model = await AIModel.create({
    id, modelName: req.body.model_name || result.model_name || 'custom_model',
    algorithm: result.algorithm, accuracy: result.accuracy,
    precision: result.precision, recall: result.recall, f1Score: result.f1_score,
    confusionMatrix: result.confusion_matrix, version: result.version || '1.0',
    modelPath: result.model_path,
  });
  res.json({
    ...result,
    id: model.id,
    model_name: model.modelName,
    f1_score: model.f1Score,
    status: 'trained',
    model,
  });
});

router.get('/models', auth(['management_admin', 'hr_recruiter']), async (req, res) => {
  res.json(await AIModel.find().sort({ createdAt: -1 }).lean());
});

router.get('/models/:id', auth(['management_admin', 'hr_recruiter']), async (req, res) => {
  const m = await AIModel.findOne({ id: parseInt(req.params.id) }).lean();
  if (!m) return res.status(404).json({ error: 'Not found' });
  res.json(m);
});

module.exports = router;

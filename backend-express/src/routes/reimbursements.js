const express = require('express');
const multer = require('multer');
const path = require('path');
const config = require('../config');
const { auth } = require('../middleware/auth');
const { Reimbursement, Employee, getNextSeq } = require('../models');
const { buildFallbackEmail } = require('../lib/groqEmailService');
const { sendNotifyHrEmail } = require('../lib/emailService');
const { runEmailInBackground } = require('../lib/emailAsync');

const upload = multer({ dest: config.uploadDir });
const router = express.Router();

async function resolveEmployee(req) {
  return Employee.findOne({
    $or: [
      { 'personalDetails.email': req.user.email },
      { userId: req.user.id },
    ],
  }).lean();
}

router.post('/', auth(['employee']), upload.single('receipt'), async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'Employee profile not found' });

  const amount = Number(req.body.amount);
  const category = String(req.body.category || 'general').trim();
  const description = String(req.body.description || '').trim();
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
  if (!description) return res.status(400).json({ error: 'Description required' });

  const id = await getNextSeq('reimbursements');
  const claim = await Reimbursement.create({
    id,
    employeeId: emp.id,
    employeeName: emp.personalDetails?.name,
    employeeEmail: emp.personalDetails?.email,
    category,
    amount,
    currency: 'INR',
    description,
    receiptPath: req.file ? req.file.path : undefined,
    status: 'pending',
  });

  const hrEmail = config.hrEmail;
  if (hrEmail) {
    const { buildReimbursementContext } = require('../lib/emailContext');
    const ctx = buildReimbursementContext(emp, claim.toObject());
    runEmailInBackground(async () => {
      const mail = buildFallbackEmail('reimbursement_request', ctx);
      return sendNotifyHrEmail(hrEmail, mail.subject, mail.html);
    }, `reimbursement-${claim.id}`);
  }

  res.status(201).json({
    ...claim.toObject(),
    email_queued: Boolean(hrEmail),
    message: hrEmail
      ? 'Reimbursement submitted — HR notification email sending'
      : 'Reimbursement submitted — HR email not configured',
  });
});

router.get('/my', auth(['employee']), async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.json([]);
  const rows = await Reimbursement.find({ employeeId: emp.id }).sort({ createdAt: -1 }).lean();
  res.json(rows);
});

router.get('/', auth(['management_admin', 'hr_recruiter']), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const rows = await Reimbursement.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  res.json(rows);
});

router.patch('/:id/status', auth(['management_admin', 'hr_recruiter']), async (req, res) => {
  const status = String(req.body.status || '').trim();
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved, rejected, or pending' });
  }
  const row = await Reimbursement.findOneAndUpdate(
    { id: parseInt(req.params.id, 10) },
    {
      $set: {
        status,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        hrNote: String(req.body.note || '').trim(),
      },
    },
    { new: true },
  );
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

module.exports = router;

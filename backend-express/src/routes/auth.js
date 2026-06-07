const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { User, Candidate, getNextSeq } = require('../models');
const config = require('../config');
const { auth } = require('../middleware/auth');

const router = express.Router();

const SIGNUP_ROLES = [
  'candidate',
  'employee',
  'hr_recruiter',
  'senior_manager',
  'management_admin',
];

router.post('/register', [
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty(),
  body('role').optional().isIn(SIGNUP_ROLES),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { name, email, password } = req.body;
  const role = SIGNUP_ROLES.includes(req.body.role) ? req.body.role : 'candidate';
  if (await User.findOne({ email })) return res.status(400).json({ error: 'Email already registered' });

  const id = await getNextSeq('users');
  const user = await User.create({
    id,
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    permissions: [],
  });

  if (role === 'candidate') {
    const existing = await Candidate.findOne({ $or: [{ email }, { userId: id }] });
    if (!existing) {
      const candidateId = await getNextSeq('candidates');
      await Candidate.create({
        id: candidateId,
        userId: id,
        name,
        email,
        status: 'applied',
        source: 'signup',
      });
    } else if (!existing.userId) {
      existing.userId = id;
      existing.email = email;
      await existing.save();
    }
  }

  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpires });
  res.json({
    access_token: token,
    user: { id: user.id, name, email, role: user.role, is_active: true },
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpires });
  res.json({
    access_token: token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, is_active: user.isActive },
  });
});

router.get('/me', auth(), (req, res) => {
  res.json({
    id: req.user.id, name: req.user.name, email: req.user.email,
    role: req.user.role, is_active: req.user.isActive, department: req.user.department,
  });
});

module.exports = router;

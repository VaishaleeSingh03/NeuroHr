const express = require('express');
const bcrypt = require('bcryptjs');
const { auth } = require('../middleware/auth');
const { User, getNextSeq } = require('../models');

const router = express.Router();

router.get('/users', auth(['management_admin']), async (req, res) => {
  const users = await User.find().select('-passwordHash').sort({ createdAt: -1 }).lean();
  res.json(users);
});

router.post('/users', auth(['management_admin']), async (req, res) => {
  const { name, email, password, role } = req.body;
  if (await User.findOne({ email })) return res.status(400).json({ error: 'Email exists' });
  const id = await getNextSeq('users');
  const user = await User.create({
    id, name, email, passwordHash: await bcrypt.hash(password, 10), role,
    permissions: req.body.permissions || [],
  });
  res.status(201).json({ id: user.id, name, email, role });
});

router.patch('/users/:id', auth(['management_admin']), async (req, res) => {
  const update = { ...req.body };
  if (update.password) {
    update.passwordHash = await bcrypt.hash(update.password, 10);
    delete update.password;
  }
  const user = await User.findOneAndUpdate({ id: parseInt(req.params.id) }, { $set: update }, { new: true }).select('-passwordHash');
  res.json(user);
});

router.delete('/users/:id', auth(['management_admin']), async (req, res) => {
  await User.deleteOne({ id: parseInt(req.params.id) });
  res.json({ ok: true });
});

module.exports = router;

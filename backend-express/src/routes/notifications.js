const express = require('express');
const { auth } = require('../middleware/auth');
const { Notification } = require('../models');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
  const items = await Notification.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  const unread = await Notification.countDocuments({ userId: req.user.id, read: false });
  res.json({ items, unread });
});

router.patch('/:id/read', auth(), async (req, res) => {
  await Notification.updateOne(
    { id: parseInt(req.params.id, 10), userId: req.user.id },
    { $set: { read: true } }
  );
  res.json({ ok: true });
});

router.post('/read-all', auth(), async (req, res) => {
  await Notification.updateMany({ userId: req.user.id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
});

module.exports = router;

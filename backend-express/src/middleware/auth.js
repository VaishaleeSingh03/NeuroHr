const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models');

function auth(requiredRoles = []) {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
      const token = header.split(' ')[1];
      const payload = jwt.verify(token, config.jwtSecret);
      const user = await User.findOne({ id: payload.sub }).select('-passwordHash');
      if (!user || user.isActive === false) return res.status(401).json({ error: 'User not found' });
      if (requiredRoles.length && !requiredRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

module.exports = { auth };

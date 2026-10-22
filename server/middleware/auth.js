import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function authMiddleware(req, res, next) {
  try {
    let token = null;

    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
    }

    const secret = process.env.JWT_SECRET || 'life-skill-default-secret-change-in-prod';
    const decoded = jwt.verify(token, secret);

    if (!decoded || !decoded.userId) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session. Please log in again.' });
    }

    const user = await User.findById(decoded.userId).populate('teamId', 'name isActive');

    if (!user) {
      return res.status(401).json({ success: false, error: 'User account not found.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, error: 'Your account has been deactivated. Contact an administrator.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, error: 'Authentication failed.' });
  }
}

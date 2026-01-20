const jwt = require('jsonwebtoken');
const Admin = require('../Models/User/admin.model.js');

const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.id);
    if (!admin || admin.isActive === false) {
      return res.status(403).json({ message: 'Admin access denied' });
    }

    req.adminId = admin._id;
    req.admin = admin;
    req.adminRole = admin.role;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const requireRole = (roles = []) => {
  const roleList = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!roleList.length || roleList.includes(req.adminRole)) {
      return next();
    }
    return res.status(403).json({ message: 'Insufficient permissions' });
  };
};

module.exports = { authenticateAdmin, requireRole };


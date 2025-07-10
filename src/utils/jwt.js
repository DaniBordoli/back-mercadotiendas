const jwt = require('jsonwebtoken');
const { config } = require('../config');

const generateToken = (payload) => {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '1d' });
};

const generateAccessToken = (payload) => {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '15m' });
};

const generateRefreshToken = (payload) => {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateToken,
  verifyToken,
  generateAccessToken,
  generateRefreshToken
};

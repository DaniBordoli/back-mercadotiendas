require('dotenv').config();

const isDevelopment = process.env.NODE_ENV !== 'production';

const config = {
  port: process.env.PORT || 3001,
  mongoUri: isDevelopment
    ? process.env.MONGO_URI_DEV
    : process.env.MONGO_URI,
  jwtSecret: isDevelopment
    ? process.env.JWT_SECRET_DEV
    : process.env.JWT_SECRET,
  googleClientId: isDevelopment
    ? process.env.GOOGLE_CLIENT_ID_DEV
    : process.env.GOOGLE_CLIENT_ID,
  emailService: {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  openaiApiKey: process.env.OPENAI_API_KEY,
  isDevelopment
};

module.exports = { config };


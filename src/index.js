const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { config } = require('./config');
const fs = require('fs');
const https = require('https');
const path = require('path');
const connectDB = require('./config/database');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middlewares/error');
const { setupStaticMiddleware } = require('./middlewares/static.middleware');

const app = express();

// Root health check endpoint
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// Conectar a MongoDB
connectDB();

// Middlewares
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Configurar middleware para archivos estáticos
setupStaticMiddleware(app);

// Routes
app.use('/api', routes);

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

// Start HTTP server
const server = app.listen(config.port, () => {
  console.log(`HTTP server running on port ${config.port}`);
});

// Optional HTTPS server
if (process.env.ENABLE_HTTPS === 'true') {
  try {
    const keyPath = path.resolve(__dirname, '..', process.env.SSL_KEY_FILE || 'cert/local.key');
    const certPath = path.resolve(__dirname, '..', process.env.SSL_CERT_FILE || 'cert/local.crt');

    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };

    const httpsPort = process.env.HTTPS_PORT || 3003;

    https.createServer(httpsOptions, app).listen(httpsPort, () => {
      console.log(`HTTPS server running on port ${httpsPort}`);
    });
  } catch (err) {
    console.error('Failed to start HTTPS server:', err.message);
  }
}

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  // Cerrar servidor y salir
  server.close(() => {
    process.exit(1);
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Cerrar servidor y salir
  server.close(() => {
    process.exit(1);
  });
});

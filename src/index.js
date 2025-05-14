const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { config } = require('./config');
const connectDB = require('./config/database');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middlewares/error');

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

// Routes
app.use('/api', routes);

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

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

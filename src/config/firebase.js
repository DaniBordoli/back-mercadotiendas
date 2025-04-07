const admin = require('firebase-admin');
// Inicializar Firebase Admin
let serviceAccount;

// En producción, usar variables de entorno
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // En desarrollo, usar archivo local según el ambiente
  const env = process.env.NODE_ENV || 'development';
  const serviceAccountFile = env === 'production' 
    ? './firebase-service-account-prod.json'
    : './firebase-service-account-dev.json';
  
  serviceAccount = require(serviceAccountFile);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

module.exports = admin;

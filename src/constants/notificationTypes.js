// Centralización de los tipos de notificación para evitar "magic strings" y
// mantener consistencia entre distintos módulos del backend.
// NOTA: si se modifica este objeto, asegúrate de reflejar los cambios en el
// archivo equivalente del frontend (src/types/notificationTypes.ts).

const NotificationTypes = {
  // E-commerce
  ORDER: 'order',
  PAYMENT: 'payment',
  PRODUCT_REVIEW: 'product_review',
  QUESTION: 'question',
  CLAIM: 'claim',
  DISPUTE: 'dispute',

  // Campañas e Influencers
  CAMPAIGN: 'campaign',
  OFFER: 'offer',
  MILESTONE: 'milestone',
  INFLUENCER_REVIEW: 'influencer_review',

  // Live Events / Streaming
  LIVE_START: 'live_start',
  LIVE_HIGHLIGHT: 'live_highlight',
  LIVE_METRICS: 'live_metrics',

  // Sistema
  SYSTEM: 'system',
  CONTACT_MESSAGE: 'contact_message'
};

module.exports = { NotificationTypes };

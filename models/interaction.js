const mongoose = require('mongoose');

const InteractionSchema = new mongoose.Schema({
  websiteId: {
    type: String,
    required: true,
    index: true
  },
  x: Number,
  y: Number,
  value: Number,
  timestamp: {
    type: Number,
    default: () => Date.now()
  },
  type: {
    type: String,
    enum: ['click', 'movement', 'scroll', 'pageload', 'pageexit', 'custom'],
    default: 'click'
  },
  sessionId: String,
  userAgent: String,
  referrer: String,
  viewportWidth: Number,
  viewportHeight: Number,
  scrollDepth: Number,
  scrollPercentage: Number,
  timeSpent: Number,
  path: String,
  elementText: String
});

module.exports = mongoose.model('Interaction', InteractionSchema);

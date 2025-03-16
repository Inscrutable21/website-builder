const mongoose = require('mongoose');

const WebsiteSchema = new mongoose.Schema({
  websiteId: {
    type: String,
    required: true,
    unique: true
  },
  html: String,
  css: String,
  js: String,
  previewHtml: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastAccessed: Date,
  viewCount: {
    type: Number,
    default: 0
  }
});

module.exports = mongoose.model('Website', WebsiteSchema);

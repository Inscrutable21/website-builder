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
  imagePaths: [String], // Store image paths
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastAccessed: Date,
  viewCount: {
    type: Number,
    default: 0
  },
  originalWebsiteId: String, // For optimized versions
  isOptimized: {
    type: Boolean,
    default: false
  },
  clickCount: {
    type: Number,
    default: 0
  }
});

// Check if the model already exists before creating it
module.exports = mongoose.models.Website || mongoose.model('Website', WebsiteSchema);

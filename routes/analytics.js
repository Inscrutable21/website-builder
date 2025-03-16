const express = require('express');
const router = express.Router();

module.exports = function(websiteService, analyticsService) {
  router.get('/website/:websiteId', async (req, res) => {
    try {
      const { websiteId } = req.params;
      const website = await websiteService.getWebsite(websiteId);
      res.json(website);
    } catch (error) {
      console.error('Error fetching website:', error);
      res.status(404).json({ error: 'Website not found' });
    }
  });
  
  router.get('/website-stats/:websiteId', async (req, res) => {
    try {
      const { websiteId } = req.params;
      const stats = await analyticsService.getWebsiteStats(websiteId);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching website stats:', error);
      res.status(500).json({ error: 'Failed to fetch website stats' });
    }
  });
  
  return router;
};

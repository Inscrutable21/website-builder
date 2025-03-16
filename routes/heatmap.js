const express = require('express');
const router = express.Router();

module.exports = function(analyticsService) {
  router.post('/track-interaction', async (req, res) => {
    try {
      await analyticsService.trackInteraction(req.body);
      res.status(200).send('Interaction recorded');
    } catch (error) {
      console.error('Error saving interaction:', error);
      res.status(500).send('Error recording interaction');
    }
  });
  
  router.get('/get-heatmap-data/:websiteId', async (req, res) => {
    try {
      const { websiteId } = req.params;
      const heatmapData = await analyticsService.getHeatmapData(websiteId);
      res.json(heatmapData);
    } catch (error) {
      console.error('Error retrieving heatmap data:', error);
      res.status(500).send('Error retrieving heatmap data');
    }
  });
  
  router.post('/reset-heatmap-data/:websiteId', async (req, res) => {
    try {
      const { websiteId } = req.params;
      await analyticsService.resetHeatmapData(websiteId);
      res.status(200).send('Heatmap data reset');
    } catch (error) {
      console.error('Error resetting heatmap data:', error);
      res.status(500).send('Error resetting heatmap data');
    }
  });
  
  return router;
};

const express = require('express');
const router = express.Router();

module.exports = function(websiteService) {
  router.post('/enhance-prompt', async (req, res) => {
    try {
      const { rawPrompt } = req.body;
      
      if (!rawPrompt) {
        return res.status(400).json({ error: 'Raw prompt is required' });
      }
      
      const enhancedPrompt = await websiteService.enhancePrompt(rawPrompt);
      res.json({ enhancedPrompt });
    } catch (error) {
      console.error('Error in enhance-prompt endpoint:', error);
      res.status(500).json({ error: 'Failed to enhance prompt', details: error.message });
    }
  });
  
  router.post('/generate-website', async (req, res) => {
    try {
      const { enhancedPrompt } = req.body;
      
      if (!enhancedPrompt) {
        return res.status(400).json({ error: 'Enhanced prompt is required' });
      }
      
      const website = await websiteService.generateWebsite(enhancedPrompt);
      res.json(website);
    } catch (error) {
      console.error('Error in generate-website endpoint:', error);
      res.status(500).json({ error: 'Failed to generate website', details: error.message });
    }
  });
  
  return router;
};

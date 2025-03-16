const Interaction = require('../models/interaction');

class AnalyticsService {
  async trackInteraction(interactionData) {
    const interaction = new Interaction(interactionData);
    await interaction.save();
    return interaction;
  }
  
  async getHeatmapData(websiteId) {
    return await Interaction.aggregate([
      { $match: { type: 'click', websiteId } },
      { $group: {
          _id: { x: "$x", y: "$y" },
          count: { $sum: 1 }
        }
      },
      { $project: {
          x: "$_id.x",
          y: "$_id.y",
          count: 1,
          _id: 0
        }
      }
    ]);
  }
  
  async resetHeatmapData(websiteId) {
    return await Interaction.deleteMany({ websiteId });
  }
  
  async getWebsiteStats(websiteId) {
    const uniqueVisitors = await Interaction.distinct('userAgent', { websiteId }).then(agents => agents.length);
    const lastActivity = await Interaction.findOne({ websiteId }).sort({ timestamp: -1 }).then(doc => doc?.timestamp || null);
    const totalClicks = await Interaction.countDocuments({ websiteId, type: 'click' });
    
    return {
      uniqueVisitors,
      lastActivity,
      totalClicks
    };
  }
}

module.exports = AnalyticsService;

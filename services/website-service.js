const { v4: uuidv4 } = require('uuid');
const Website = require('../models/website');

class WebsiteService {
  constructor(aiService) {
    this.aiService = aiService;
  }
  
  async enhancePrompt(rawPrompt) {
    return await this.aiService.enhancePrompt(rawPrompt);
  }
  
  async generateWebsite(enhancedPrompt) {
    const generatedContent = await this.aiService.generateWebsite(enhancedPrompt);
    
    const htmlMatch = generatedContent.match(/```html\s*([\s\S]*?)\s*```/);
    const cssMatch = generatedContent.match(/```css\s*([\s\S]*?)\s*```/);
    const jsMatch = generatedContent.match(/```javascript\s*([\s\S]*?)\s*```/) || 
                    generatedContent.match(/```js\s*([\s\S]*?)\s*```/);
    
    if (!htmlMatch) {
      throw new Error('Could not extract HTML from the generated content');
    }
    
    const html = htmlMatch[1];
    const css = cssMatch ? cssMatch[1] : '';
    const js = jsMatch ? jsMatch[1] : '';
    
    const websiteId = uuidv4();
    
    // Create the preview HTML with heatmap integration
    const previewHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${css}</style>
        <title>Generated Website</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/heatmap.js/2.0.2/heatmap.min.js"></script>
      </head>
      <body>
        <div id="heatmapContainer" style="width:100%; height:100%; position:absolute; top:0; left:0; z-index:9999; pointer-events:none; display:none;"></div>
        ${html}
        <script>${js}</script>
        <script src="/heatmap-tracker.js"></script>
        <script>
          // Initialize heatmap with the website ID
          initializeHeatmap('${websiteId}');
        </script>
      </body>
      </html>
    `;
    
    // Save the website to the database
    const website = new Website({
      websiteId,
      html,
      css,
      js,
      previewHtml,
      createdAt: new Date()
    });
    
    await website.save();
    
    return {
      websiteId,
      html,
      css,
      js,
      previewHtml
    };
  }
  
  async getWebsite(websiteId) {
    const website = await Website.findOne({ websiteId });
    
    if (!website) {
      throw new Error('Website not found');
    }
    
    // Update last accessed time and view count
    website.lastAccessed = new Date();
    website.viewCount += 1;
    await website.save();
    
    return website;
  }
}

module.exports = WebsiteService;

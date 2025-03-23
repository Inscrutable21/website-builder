const { v4: uuidv4 } = require('uuid');
const Website = require('../models/website');


// Rest of your code...

class WebsiteService {
  constructor(aiService, imageService) {
    this.aiService = aiService;
    this.imageService = imageService;
    this.dbConnected = false; // Will be set to true when database is connected
  }
  
  setDatabaseConnection(isConnected) {
    this.dbConnected = isConnected;
  }
  
  async enhancePrompt(rawPrompt) {
    try {
      return await this.aiService.enhancePrompt(rawPrompt);
    } catch (error) {
      console.error('Error enhancing prompt:', error);
      throw new Error(`Failed to enhance prompt: ${error.message}`);
    }
  }
  
  async generateWebsite(enhancedPrompt) {
    try {
      // First, generate images based on the content if image service is available
      let imagePaths = [];
      
      if (this.imageService) {
        try {
          console.log('Generating images for website...');
          imagePaths = await this.imageService.generateWebsiteImages(enhancedPrompt, 3);
          console.log('Generated images:', imagePaths);
        } catch (error) {
          console.error('Error generating images:', error);
          // Use placeholder images if image generation fails
          imagePaths = [
            '/placeholder-images/placeholder1.png',
            '/placeholder-images/placeholder2.png',
            '/placeholder-images/placeholder3.png'
          ];
        }
      } else {
        console.log('Image service not available, using placeholder images');
        imagePaths = [
          '/placeholder-images/placeholder1.png',
          '/placeholder-images/placeholder2.png',
          '/placeholder-images/placeholder3.png'
        ];
      }
      
      // Add image information to the prompt for the AI
      const promptWithImages = `
        ${enhancedPrompt}
        
        Please incorporate the following images into the website:
        1. Hero Image: ${imagePaths[0]} - Use this as the main banner/hero image
        2. Section Image 1: ${imagePaths[1]} - Use this in a content section or feature area
        3. Section Image 2: ${imagePaths[2]} - Use this in another content section or testimonial area
        
        Make sure to use the exact image paths as provided above.
      `;
      
      // Generate the website content with image references
      const generatedContent = await this.aiService.generateWebsite(promptWithImages);
      
      // Extract code blocks
      const { html, css, js } = this.extractCodeFromResponse(generatedContent);
      
      // Generate a unique ID for the website
      const websiteId = uuidv4();
      
      // Create the preview HTML
      const previewHtml = this.createCompleteHtml(html, css, js, websiteId);
      
      // Save to database if connected
      if (this.dbConnected) {
        try {
          const website = new Website({
            websiteId,
            html,
            css,
            js,
            previewHtml,
            imagePaths,
            createdAt: new Date(),
            clickCount: 0
          });
          
          await website.save();
          console.log(`Website saved to database with ID: ${websiteId}`);
        } catch (dbError) {
          console.error('Error saving website to database:', dbError);
        }
      }
      
      return {
        websiteId,
        html,
        css,
        js,
        previewHtml,
        imagePaths
      };
    } catch (error) {
      console.error('Error generating website:', error);
      throw new Error(`Failed to generate website: ${error.message}`);
    }
  }
  
  extractCodeFromResponse(responseText) {
    const htmlMatch = responseText.match(/```html\s*([\s\S]*?)\s*```/);
    const cssMatch = responseText.match(/```css\s*([\s\S]*?)\s*```/);
    const jsMatch = responseText.match(/```javascript\s*([\s\S]*?)\s*```/) || 
                  responseText.match(/```js\s*([\s\S]*?)\s*```/);
    
    if (!htmlMatch) {
      throw new Error('Could not extract HTML from the generated content');
    }
    
    return {
      html: htmlMatch[1],
      css: cssMatch ? cssMatch[1] : '',
      js: jsMatch ? jsMatch[1] : ''
    };
  }
  
  createCompleteHtml(html, css, js, websiteId) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Generated Website</title>
        <style>${css}</style>
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
  }
  
  async getWebsite(websiteId) {
    if (!this.dbConnected) {
      throw new Error('Database not connected');
    }
    
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
  
  async optimizeWebsite(websiteId, heatmapData, clickElements) {
    try {
      // Get the original website
      let website;
      if (this.dbConnected) {
        website = await Website.findOne({ websiteId });
      }
      
      if (!website) {
        throw new Error('Website not found');
      }
      
      // Extract the HTML, CSS, and JS from the website
      const html = website.html || '';
      const css = website.css || '';
      const js = website.js || '';
      
      // Format the heatmap data for the AI
      const formattedHeatmapData = heatmapData.map(point => 
        `Coordinates (${point.x}, ${point.y}): ${point.count} clicks`
      ).join('\n');
      
      // Format the click elements data for the AI
      const formattedClickElements = clickElements.map(element => 
        `- ${element.path}${element.text ? ` (Text: "${element.text}")` : ''}: ${element.count} clicks`
      ).join('\n');
      
      // Create the prompt for the AI
      const prompt = `
        I need you to optimize a website's UI based on user interaction data. 
        
        Here's the current website code:
        
        HTML:
        \`\`\`html
        ${html}
        \`\`\`
        
        CSS:
        \`\`\`css
        ${css}
        \`\`\`
        
        JavaScript:
        \`\`\`javascript
        ${js}
        \`\`\`
        
        User interaction data:
        
        Most clicked elements (from most to least clicked):
        ${formattedClickElements || 'No element-specific click data available.'}
        
        Heatmap data (coordinates and click counts):
        ${formattedHeatmapData || 'No heatmap data available.'}
        
        Please optimize the website UI with the following guidelines:
        1. Make the most frequently clicked elements more prominent (larger, better positioned, more visible)
        2. Adjust layouts to prioritize high-interaction areas
        3. Improve visibility of important elements that aren't getting enough attention
        4. Maintain the overall design aesthetic and functionality
        5. Ensure the website remains responsive and works on all screen sizes
        6. Don't remove any functionality, just optimize the UI
        7. Keep all the images from the original design
        
        Return only the optimized HTML, CSS, and JavaScript code as separate code blocks with appropriate language identifiers.
      `;
      
      // Generate the optimized website
      const optimizedContent = await this.aiService.generateWebsite(prompt);
      
      // Extract code blocks
      const optimizedCode = this.extractCodeFromResponse(optimizedContent);
      
      // Create a new website ID for the optimized version
      const optimizedWebsiteId = `${websiteId}-optimized-${Date.now()}`;
      
      // Create the optimized preview HTML
      const optimizedPreviewHtml = this.createCompleteHtml(
        optimizedCode.html, 
        optimizedCode.css, 
        optimizedCode.js, 
        optimizedWebsiteId
      );
      
      // Save the optimized website
      if (this.dbConnected) {
        const optimizedWebsite = new Website({
          websiteId: optimizedWebsiteId,
          html: optimizedCode.html,
          css: optimizedCode.css,
          js: optimizedCode.js,
          previewHtml: optimizedPreviewHtml,
          imagePaths: website.imagePaths || [],
          createdAt: new Date(),
          originalWebsiteId: websiteId,
          isOptimized: true,
          clickCount: 0
        });
        
        await optimizedWebsite.save();
      }
      
      return {
        originalWebsiteId: websiteId,
        optimizedWebsiteId: optimizedWebsiteId,
        html: optimizedCode.html,
        css: optimizedCode.css,
        js: optimizedCode.js,
        previewHtml: optimizedPreviewHtml
      };
    } catch (error) {
      console.error('Error optimizing website:', error);
      throw new Error(`Failed to optimize website: ${error.message}`);
    }
  }
  
  async getLatestOptimizedVersion(websiteId) {
    if (!this.dbConnected) {
      return null;
    }
    
    // Find the latest optimized version of this website
    const optimizedWebsite = await Website.findOne({ 
      originalWebsiteId: websiteId,
      isOptimized: true
    }).sort({ createdAt: -1 });
    
    return optimizedWebsite;
  }
  
  async getWebsiteStats(websiteId, timeRange = 'week') {
    if (!this.dbConnected) {
      throw new Error('Database not connected');
    }
    
    // Get website info
    const website = await Website.findOne({ websiteId });
    if (!website) {
      throw new Error('Website not found');
    }
    
    // Create mock stats for now - in a real implementation, you would calculate these from actual interaction data
    const stats = {
      uniqueVisitors: Math.floor(Math.random() * 100) + 20,
      totalClicks: Math.floor(Math.random() * 500) + 50,
      averageTimeOnPage: Math.floor(Math.random() * 180) + 60, // in seconds
      averageScrollDepth: Math.floor(Math.random() * 40) + 60, // percentage
      visitorsTrend: Math.floor(Math.random() * 30) - 15, // random between -15 and 15
      clicksTrend: Math.floor(Math.random() * 30) - 10,
      timeTrend: Math.floor(Math.random() * 20) - 10,
      scrollTrend: Math.floor(Math.random() * 25) - 10,
      lastActivity: Date.now(),
      clickCount: website.clickCount || 0,
      optimizationStatus: {
        isOptimized: false,
        optimizedVersions: 0,
        nextOptimizationAt: 0
      }
    };
    
    // Calculate next optimization threshold
    const nextOptimizationThreshold = Math.ceil(stats.clickCount / 50) * 50;
    stats.optimizationStatus.nextOptimizationAt = nextOptimizationThreshold;
    
    // Check if optimized versions exist
    const optimizedVersionsCount = await Website.countDocuments({
      originalWebsiteId: websiteId,
      isOptimized: true
    });
    
    stats.optimizationStatus.optimizedVersions = optimizedVersionsCount;
    stats.optimizationStatus.isOptimized = optimizedVersionsCount > 0;
    
    // Generate mock click elements data
    stats.clickElements = [
      { path: 'button.btn', text: 'Click Me', count: Math.floor(Math.random() * 30) + 10 },
      { path: 'div.container', text: '', count: Math.floor(Math.random() * 20) + 5 },
      { path: 'button.btn:nth-child(2)', text: 'Another Button', count: Math.floor(Math.random() * 15) + 5 },
      { path: 'h1', text: 'Demo Website', count: Math.floor(Math.random() * 10) + 3 }
    ];
    
    return stats;
  }
}

module.exports = WebsiteService;
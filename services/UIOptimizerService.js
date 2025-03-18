// services/UIOptimizerService.js
const OpenAI = require('openai');

class UIOptimizerService {
  constructor(apiKey) {
    this.openai = new OpenAI({
      apiKey: apiKey
    });
    this.model = "gpt-4o-mini";
    this.optimizationThreshold = 50; // Minimum number of interactions before optimization
    this.optimizationInterval = 60 * 60 * 1000; // 1 hour in milliseconds
    this.lastOptimizationTimes = {}; // Track last optimization time for each website
  }
  
  async shouldOptimizeWebsite(websiteId, interactionsCount) {
    // Check if we have enough interactions
    if (interactionsCount < this.optimizationThreshold) {
      return false;
    }
    
    // Check if enough time has passed since last optimization
    const lastOptimized = this.lastOptimizationTimes[websiteId] || 0;
    const now = Date.now();
    
    if (now - lastOptimized < this.optimizationInterval) {
      return false;
    }
    
    return true;
  }
  
  async optimizeUI(websiteId, websiteData, heatmapData, clickElements) {
    try {
      console.log(`Starting UI optimization for website: ${websiteId}`);
      
      // Extract the HTML, CSS, and JS from the website data
      const { html, css, js } = websiteData;
      
      // Format the heatmap data for the AI
      const formattedHeatmapData = this._formatHeatmapData(heatmapData);
      
      // Format the click elements data for the AI
      const formattedClickElements = this._formatClickElements(clickElements);
      
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
        ${formattedClickElements}
        
        Heatmap data (coordinates and click counts):
        ${formattedHeatmapData}
        
        Please optimize the website UI with the following guidelines:
        1. Make the most frequently clicked elements more prominent (larger, better positioned, more visible)
        2. Adjust layouts to prioritize high-interaction areas
        3. Improve visibility of important elements that aren't getting enough attention
        4. Maintain the overall design aesthetic and functionality
        5. Ensure the website remains responsive and works on all screen sizes
        6. Don't remove any functionality, just optimize the UI
        
        Return only the optimized HTML, CSS, and JavaScript code as separate code blocks with appropriate language identifiers.
      `;
      
      // Call the OpenAI API
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { 
            role: "system", 
            content: "You are an expert UI/UX designer and front-end developer. Your task is to analyze user interaction data and optimize website interfaces to improve user experience and conversion rates."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      });
      
      // Extract the optimized code
      const optimizedCode = this._extractCodeFromResponse(completion.choices[0].message.content);
      
      // Update the last optimization time
      this.lastOptimizationTimes[websiteId] = Date.now();
      
      console.log(`UI optimization completed for website: ${websiteId}`);
      
      return optimizedCode;
    } catch (error) {
      console.error('Error optimizing UI:', error);
      throw new Error(`Failed to optimize UI: ${error.message}`);
    }
  }
  
  _formatHeatmapData(heatmapData) {
    if (!heatmapData || !heatmapData.length) {
      return "No heatmap data available.";
    }
    
    // Sort by click count (descending)
    const sortedData = [...heatmapData].sort((a, b) => b.count - a.count);
    
    // Take top 20 for brevity
    const topData = sortedData.slice(0, 20);
    
    return topData.map(point => 
      `Coordinates (${point.x}, ${point.y}): ${point.count} clicks`
    ).join('\n');
  }
  
  _formatClickElements(clickElements) {
    if (!clickElements || !clickElements.length) {
      return "No element-specific click data available.";
    }
    
    return clickElements.map(element => 
      `- ${element.path}${element.text ? ` (Text: "${element.text}")` : ''}: ${element.count} clicks`
    ).join('\n');
  }
  
  _extractCodeFromResponse(responseText) {
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
}

module.exports = UIOptimizerService;

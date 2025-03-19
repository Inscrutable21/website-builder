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
I need you to *dynamically reposition website elements* based on real-time user interaction data.  
Use the given heatmap data to rearrange the most clicked elements for *better visibility and usability*.


### Website Code:
*HTML:*
\\\`html
${html}
\\\`
*CSS:*
\\\`css
${css}
\\\`
*JavaScript:*
\\\`javascript
${js}
\\\`

User interaction data:
Most clicked elements (ranked):
${formattedClickElements || 'No element-specific click data available.'}
Heatmap data (coordinates and intensity):
${formattedHeatmapData || 'No heatmap data available.'}
Requirements:

Intelligently reposition frequently clicked elements to prime locations:

Move top-clicked elements to the header/top navigation
Use fixed positioning for consistently accessed elements


Transform the layout based on heatmap insights:

Redesign page sections to prioritize high-interaction areas
Cluster related high-value elements together
Create clear visual pathways to important content


Enhance visibility through strategic design:

Apply appropriate visual hierarchy (size, color, contrast)
Implement subtle attention-drawing animations
Use whitespace to isolate and emphasize key elements


Streamline user journeys:

Reduce clicks needed to reach popular destinations
Create shortcuts to frequently accessed content
Consider adding a persistent navigation element for top interactions


Technical requirements:

Maintain responsive design across all screen sizes
Preserve all existing functionality
Keep brand identity consistent
Ensure accessibility standards are met



Your response should include ONLY the restructured code with no explanations:

HTML code block
CSS code block
JavaScript code block
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

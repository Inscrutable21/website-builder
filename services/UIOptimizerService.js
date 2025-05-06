// services/UIOptimizerService.js
const OpenAI = require('openai');

class UIOptimizerService {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey: apiKey });
    this.model = "gpt-4o-mini";
    this.optimizationThreshold = 50; // Minimum number of interactions before optimization
    this.optimizationInterval = 60 * 60 * 1000; // 1 hour in milliseconds
    this.lastOptimizationTimes = {}; // Track last optimization time for each website
    
    // Define protected sections that should not be moved
    this.protectedSections = [
      {
        name: 'Navigation Bar',
        selectors: ['nav', 'header nav', '.navbar', '.navigation', '.nav-container', '#navbar', 'header .nav'],
        description: 'The main navigation menu should remain at the top of the page'
      },
      {
        name: 'Hero Section',
        selectors: ['.hero', '.hero-section', '.jumbotron', '.banner', '#hero', 'header .hero', 'main > section:first-child'],
        description: 'The hero/banner section should remain at the top of the content area'
      },
      {
        name: 'Footer',
        selectors: ['footer', '.footer', '#footer', '.site-footer'],
        description: 'The footer must remain at the bottom of the page'
      },
      {
        name: 'Contact Form',
        selectors: ['.contact-form', '#contact-form', 'form[action*="contact"]', '.contact-us form', '#contactForm', 'section.contact form'],
        description: 'Contact forms should remain in their original sections, though can be enhanced visually'
      }
    ];
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

      // Identify protected sections in the HTML
      const protectedSectionsFound = this._identifyProtectedSections(html);
      console.log('Protected sections found:', protectedSectionsFound.map(s => s.name));

      // Analyze user behavior patterns
      const userPatterns = this._analyzeUserBehavior(heatmapData, clickElements);
      
      // Format the heatmap data for the AI
      const formattedHeatmapData = this._formatHeatmapData(heatmapData);

      // Format the click elements data for the AI
      const formattedClickElements = this._formatClickElements(clickElements);

      // Create the prompt for the AI with protection instructions
      const prompt = this._createEnhancedOptimizationPrompt(
        html, 
        css, 
        js, 
        formattedClickElements, 
        formattedHeatmapData, 
        protectedSectionsFound,
        userPatterns
      );

      // Call the OpenAI API with improved parameters
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are an expert UI/UX designer and front-end developer specializing in conversion rate optimization. Your task is to analyze user interaction data and optimize website interfaces to improve user experience, engagement metrics, and conversion rates, while respecting structural constraints."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.5, // Lower temperature for more consistent results
        max_tokens: 4000,
      });

      // Extract the optimized code
      const optimizedCode = this._extractCodeFromResponse(completion.choices[0].message.content);

      // Verify that protected sections are still intact
      const verificationResult = this._verifyProtectedSections(
        optimizedCode.html, 
        protectedSectionsFound
      );

      // If verification fails, attempt to fix the code
      if (!verificationResult.success) {
        console.warn('Protected section verification failed:', verificationResult.message);
        
        // Attempt to fix the HTML by preserving protected sections
        optimizedCode.html = this._repairProtectedSections(
          html, 
          optimizedCode.html, 
          protectedSectionsFound
        );
      }

      // Update the last optimization time
      this.lastOptimizationTimes[websiteId] = Date.now();

      console.log(`UI optimization completed for website: ${websiteId}`);

      return optimizedCode;
    } catch (error) {
      console.error('Error optimizing UI:', error);
      throw new Error(`Failed to optimize UI: ${error.message}`);
    }
  }

  _identifyProtectedSections(html) {
    const foundSections = [];

    // Create a temporary DOM to search for selectors
    const tempDiv = new (require('jsdom').JSDOM)(`<!DOCTYPE html>${html}`).window.document.body;

    // Check for each protected section type
    for (const section of this.protectedSections) {
      // Try each selector until we find a match
      for (const selector of section.selectors) {
        try {
          const elements = tempDiv.querySelectorAll(selector);
          if (elements && elements.length > 0) {
            // For each matching element, store its outerHTML and selector
            Array.from(elements).forEach((element, index) => {
              foundSections.push({
                name: `${section.name}${elements.length > 1 ? ` ${index + 1}` : ''}`,
                selector: selector,
                description: section.description,
                originalHtml: element.outerHTML,
                // Generate a unique marker for this section
                marker: `<!-- PROTECTED_SECTION_${section.name.replace(/\s+/g, '_').toUpperCase()}_${index} -->`
              });
            });
            // If we found elements with this selector, move to the next section
            break;
          }
        } catch (e) {
          console.warn(`Error checking selector ${selector}:`, e);
        }
      }
    }

    return foundSections;
  }

  _analyzeUserBehavior(heatmapData, clickElements) {
    const patterns = {
      focusAreas: [],
      ignoredAreas: [],
      scrollDepth: 0,
      commonPathways: []
    };
    
    // Identify focus areas (high click density)
    if (heatmapData && heatmapData.length > 0) {
      // Group clicks by proximity
      const clusters = this._clusterClicksByProximity(heatmapData);
      
      // Sort clusters by total clicks
      const sortedClusters = clusters.sort((a, b) => b.totalClicks - a.totalClicks);
      
      // Top 3 clusters are focus areas
      patterns.focusAreas = sortedClusters.slice(0, 3).map(cluster => ({
        x: cluster.centerX,
        y: cluster.centerY,
        intensity: cluster.totalClicks
      }));
      
      // Areas with very few clicks are ignored areas
      patterns.ignoredAreas = this._identifyIgnoredAreas(heatmapData);
      
      // Estimate scroll depth from click positions
      if (heatmapData.length > 0) {
        const maxY = Math.max(...heatmapData.map(point => point.y));
        patterns.scrollDepth = maxY;
      }
    }
    
    // Analyze click elements for common pathways
    if (clickElements && clickElements.length > 0) {
      patterns.commonPathways = this._identifyCommonPathways(clickElements);
    }
    
    return patterns;
  }

  _clusterClicksByProximity(heatmapData) {
    const clusters = [];
    const proximityThreshold = 100; // pixels
    
    for (const point of heatmapData) {
      let addedToCluster = false;
      
      // Try to add to existing cluster
      for (const cluster of clusters) {
        const distance = Math.sqrt(
          Math.pow(point.x - cluster.centerX, 2) + 
          Math.pow(point.y - cluster.centerY, 2)
        );
        
        if (distance < proximityThreshold) {
          // Add to this cluster
          cluster.points.push(point);
          cluster.totalClicks += point.count || 1;
          
          // Recalculate center
          cluster.centerX = cluster.points.reduce((sum, p) => sum + p.x, 0) / cluster.points.length;
          cluster.centerY = cluster.points.reduce((sum, p) => sum + p.y, 0) / cluster.points.length;
          
          addedToCluster = true;
          break;
        }
      }
      
      // If not added to any cluster, create new one
      if (!addedToCluster) {
        clusters.push({
          points: [point],
          centerX: point.x,
          centerY: point.y,
          totalClicks: point.count || 1
        });
      }
    }
    
    return clusters;
  }

  _identifyIgnoredAreas(heatmapData) {
    // Implementation depends on your page structure
    // This is a simplified version
    return [];
  }

  _identifyCommonPathways(clickElements) {
    // Simplified implementation
    return clickElements.slice(0, 5).map(el => el.selector || el.path);
  }

  _createEnhancedOptimizationPrompt(html, css, js, clickElements, heatmapData, protectedSections, userPatterns) {
    // Create a list of protection instructions
    const protectionInstructions = protectedSections.map(section => 
      `- ${section.name} (${section.selector}): ${section.description}`
    ).join('\n');

    // Format user behavior patterns
    const patternInsights = `
USER BEHAVIOR INSIGHTS:
- Focus Areas: Users concentrate clicks at ${userPatterns.focusAreas.length} main areas of the page
- Scroll Depth: Users typically scroll to ${userPatterns.scrollDepth}px down the page
- Common Pathways: Users frequently interact with: ${userPatterns.commonPathways.join(', ')}
`;

    return `
I need you to optimize a website's UI based on real user interaction data while respecting structural constraints.

CURRENT WEBSITE CODE:

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

USER INTERACTION DATA:

Most clicked elements (from most to least clicked):
${clickElements || 'No element-specific click data available.'}

Heatmap data (coordinates and click counts):
${heatmapData || 'No heatmap data available.'}

${patternInsights}

IMPORTANT STRUCTURAL CONSTRAINTS:
The following sections MUST remain in their original structural position (though their internal components can be optimized):
${protectionInstructions}

OPTIMIZATION REQUIREMENTS:

1. PROTECTED SECTIONS:
   - DO NOT move or restructure the protected sections listed above
   - You MAY enhance elements WITHIN these sections (colors, sizes, etc.)
   - You MAY add visual emphasis to elements within protected sections
   - You MUST keep all functionality of protected sections intact

2. AGGRESSIVE CONTENT RESHUFFLING:
   - PRIORITIZE reshuffling content blocks based on user engagement
   - Move high-engagement blocks to the top of their parent containers
   - If a block in position 3 gets more clicks than blocks 1 and 2, move it to position 1
   - Group related elements that receive high engagement together

3. Make the most frequently clicked elements more prominent by:
   - Increasing their size by 10-20%
   - Using more vibrant colors with higher contrast
   - Improving their positioning for better visibility
   - Adding subtle animations or visual cues to draw attention
   - Adding borders or shadows to create visual emphasis

4. Layout optimization:
   - Move important content above the fold (except protected sections)
   - Increase whitespace around high-engagement elements
   - Reduce prominence of low-engagement elements (make smaller or less vibrant)
   - Create a clearer visual hierarchy emphasizing popular elements
   - Add visual cues to guide users to important content
   - Implement progressive disclosure for less-used content

5. Technical requirements:
   - Maintain responsive design (must work on mobile and desktop)
   - Keep all functionality intact (don't remove features)
   - Preserve all images but resize/reposition based on engagement
   - Ensure accessibility (maintain proper contrast, focus states, etc.)
   - Add subtle micro-interactions for frequently used elements
   - Optimize load order to prioritize visible and interactive elements

IMPORTANT: Return ONLY the optimized code blocks with NO explanations or comments outside the code blocks. Use exactly these formats:

\`\`\`html
(optimized HTML here)
\`\`\`

\`\`\`css
(optimized CSS here)
\`\`\`

\`\`\`javascript
(optimized JavaScript here)
\`\`\`
`;
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

    // Sort by click count (descending)
    const sortedElements = [...clickElements].sort((a, b) => b.count - a.count);
  
    // Calculate engagement score (relative to highest clicks)
    const maxClicks = sortedElements[0].count;
  
    return sortedElements.map((element, index) => {
      const engagementScore = Math.round((element.count / maxClicks) * 100);
      const priority = index < 3 ? "HIGH PRIORITY" : index < 6 ? "MEDIUM PRIORITY" : "LOW PRIORITY";
      
      return `- ${element.path}${element.text ? ` (Text: "${element.text}")` : ''}: ${element.count} clicks, ${engagementScore}% engagement, ${priority}`;
    }).join('\n');
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

  _verifyProtectedSections(optimizedHtml, protectedSections) {
    if (!protectedSections || protectedSections.length === 0) {
      return { success: true };
    }

    // Create a temporary DOM for the optimized HTML
    const tempDiv = new (require('jsdom').JSDOM)(`<!DOCTYPE html>${optimizedHtml}`).window.document.body;

    // Check each protected section
    for (const section of protectedSections) {
      try {
        const elements = tempDiv.querySelectorAll(section.selector);
        
        // If the section is missing, that's a problem
        if (!elements || elements.length === 0) {
          return {
            success: false,
            message: `Protected section "${section.name}" (${section.selector}) is missing in the optimized HTML`
          };
        }
      } catch (e) {
        console.warn(`Error verifying section ${section.name}:`, e);
      }
    }

    return { success: true };
  }

  _repairProtectedSections(originalHtml, optimizedHtml, protectedSections) {
    let repairedHtml = optimizedHtml;

    // If there are no protected sections, return the optimized HTML as is
    if (!protectedSections || protectedSections.length === 0) {
      return optimizedHtml;
    }

    try {
      // Create DOM parsers for both original and optimized HTML
      const originalDOM = new (require('jsdom').JSDOM)(`<!DOCTYPE html>${originalHtml}`).window.document;
      const optimizedDOM = new (require('jsdom').JSDOM)(`<!DOCTYPE html>${repairedHtml}`).window.document;
      
      // For each protected section
      for (const section of protectedSections) {
        // Find the section in the original HTML
        const originalElements = originalDOM.querySelectorAll(section.selector);
        
        if (originalElements && originalElements.length > 0) {
          // Check if the section exists in the optimized HTML
          const optimizedElements = optimizedDOM.querySelectorAll(section.selector);
          
          // If the section is missing in the optimized HTML
          if (!optimizedElements || optimizedElements.length === 0) {
            console.log(`Repairing missing section: ${section.name}`);
            
            // Determine where to insert the original section
            if (section.name.includes('Navigation') || section.name.includes('Hero')) {
              // Navigation and Hero sections go at the top
              const body = optimizedDOM.querySelector('body');
              if (body && body.firstChild) {
                body.insertBefore(originalElements[0].cloneNode(true), body.firstChild);
              }
            } else if (section.name.includes('Footer')) {
              // Footer goes at the bottom
              const body = optimizedDOM.querySelector('body');
              if (body) {
                body.appendChild(originalElements[0].cloneNode(true));
              }
            } else if (section.name.includes('Contact')) {
              // Contact form can go before the footer or at the end
              const footer = optimizedDOM.querySelector('footer, .footer, #footer');
              const body = optimizedDOM.querySelector('body');
              
              if (footer && footer.parentNode) {
                footer.parentNode.insertBefore(originalElements[0].cloneNode(true), footer);
              } else if (body) {
                body.appendChild(originalElements[0].cloneNode(true));
              }
            }
          }
        }
      }
      
      // Get the repaired HTML
      repairedHtml = optimizedDOM.querySelector('html').innerHTML;
      
      // If the repair removed the DOCTYPE, add it back
      if (!repairedHtml.includes('<!DOCTYPE html>')) {
        repairedHtml = `<!DOCTYPE html>${repairedHtml}`;
      }
      
    } catch (error) {
      console.error('Error repairing protected sections:', error);
      // If repair fails, fall back to the original HTML to be safe
      return originalHtml;
    }
    
    return repairedHtml;
  }
}

module.exports = UIOptimizerService;

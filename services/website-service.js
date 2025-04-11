const { v4: uuidv4 } = require('uuid');
const Website = require('../models/website');
const path = require('path');
const fs = require('fs');

class WebsiteService {
  constructor(aiService, imageService) {
    this.aiService = aiService;
    this.imageService = imageService;
    this.dbConnected = false;
    this.inMemoryDatabase = {
      websites: [],
      getWebsite(websiteId) {
        return this.websites.find(site => site.websiteId === websiteId);
      },
      addWebsite(website) {
        this.websites.push(website);
        return website;
      }
    };
    
    // Define protected sections that should not be moved during optimization
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

Additionally, please include the following structural elements in your design:
1. A responsive navigation bar at the top of the page (with class="navbar" or tag <nav>)
2. A hero section below the navigation (with class="hero" or class="hero-section")
3. A footer at the bottom of the page (with tag <footer> or class="footer")
4. If appropriate for the content, include a contact form (with class="contact-form" or id="contact-form")

These structural elements are important for the website's organization and future optimization.
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
          // Save to in-memory as fallback
          this.inMemoryDatabase.addWebsite({
            websiteId,
            html,
            css,
            js,
            previewHtml,
            imagePaths,
            createdAt: new Date(),
            lastAccessed: new Date(),
            viewCount: 0,
            clickCount: 0
          });
        }
      } else {
        // Save to in-memory database
        this.inMemoryDatabase.addWebsite({
          websiteId,
          html,
          css,
          js,
          previewHtml,
          imagePaths,
          createdAt: new Date(),
          lastAccessed: new Date(),
          viewCount: 0,
          clickCount: 0
        });
      }

      return { websiteId, html, css, js, previewHtml, imagePaths };
    } catch (error) {
      console.error('Error generating website:', error);
      throw new Error(`Failed to generate website: ${error.message}`);
    }
  }

  extractCodeFromResponse(responseText) {
    const htmlMatch = responseText.match(/```html\s*([\s\S]*?)\s*```/i);
    const cssMatch = responseText.match(/```css\s*([\s\S]*?)\s*```/i);
    const jsMatch = responseText.match(/```javascript\s*([\s\S]*?)\s*```/i) ||
                   responseText.match(/```js\s*([\s\S]*?)\s*```/i);

    if (!htmlMatch) {
      throw new Error('Could not extract HTML from the generated content');
    }

    return {
      html: htmlMatch[1].trim(),
      css: cssMatch ? cssMatch[1].trim() : '',
      js: jsMatch ? jsMatch[1].trim() : ''
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
    let website;

    if (this.dbConnected) {
      try {
        website = await Website.findOne({ websiteId });

        if (website) {
          // Update last accessed time and view count
          website.lastAccessed = new Date();
          website.viewCount = (website.viewCount || 0) + 1;
          await website.save();
        }
      } catch (error) {
        console.error(`Database error getting website ${websiteId}:`, error);
      }
    }

    if (!website) {
      website = this.inMemoryDatabase.getWebsite(websiteId);
      if (website) {
        website.lastAccessed = new Date();
        website.viewCount = (website.viewCount || 0) + 1;
      }
    }

    if (!website) {
      throw new Error('Website not found');
    }

    return website;
  }

  async optimizeWebsite(websiteId, heatmapData, clickElements) {
    try {
      // Validate inputs
      if (!websiteId) throw new Error('Website ID is required');
      if (!Array.isArray(heatmapData)) heatmapData = [];
      if (!Array.isArray(clickElements)) clickElements = [];

      // Get the original website
      let website;
      if (this.dbConnected) {
        try {
          website = await Website.findOne({ websiteId });
        } catch (error) {
          console.error(`Database error getting website ${websiteId} for optimization:`, error);
        }
      }

      if (!website) {
        website = this.inMemoryDatabase.getWebsite(websiteId);
      }

      if (!website) {
        throw new Error(`Website not found: ${websiteId}`);
      }

      // Extract website content
      const html = website.html || '';
      const css = website.css || '';
      const js = website.js || '';

      // Identify protected sections in the HTML
      const protectedSectionsFound = this._identifyProtectedSections(html);
      console.log('Protected sections found for optimization:', 
        protectedSectionsFound.map(s => s.name).join(', '));

      // Format data for the AI
      const formattedHeatmapData = heatmapData.length > 0 
        ? heatmapData.map(point => 
            `Coordinates (${(point.x * 100).toFixed(1)}%, ${(point.y * 100).toFixed(1)}%): ${point.count} clicks`
          ).join('\n') 
        : 'No heatmap data available.';

      const formattedClickElements = clickElements.length > 0 
        ? clickElements.map(element => 
            `- ${element.path}${element.text ? ` (Text: "${element.text}")` : ''}: ${element.count} clicks`
          ).join('\n') 
        : 'No element-specific click data available.';

      // Create a list of protection instructions
      const protectionInstructions = protectedSectionsFound.map(section => 
        `- ${section.name} (${section.selector}): Must remain in its original structural position`
      ).join('\n');

      // Create a detailed optimization prompt
      const prompt = `
I need you to optimize a website's UI based on real user interaction data while preserving certain structural elements.

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
${formattedClickElements}

Heatmap data (coordinates and click counts):
${formattedHeatmapData}

IMPORTANT STRUCTURAL CONSTRAINTS:
The following sections MUST remain in their original structural position (though their internal components can be optimized):
${protectionInstructions || '- No specific constraints provided'}

OPTIMIZATION REQUIREMENTS:

1. PROTECTED SECTIONS:
   - DO NOT move or restructure the protected sections listed above
   - You MAY enhance elements WITHIN these sections (colors, sizes, etc.)
   - You MAY add visual emphasis to elements within protected sections
   - You MUST keep all functionality of protected sections intact

2. Make the most frequently clicked elements more prominent by:
   - Increasing their size
   - Using more vibrant colors
   - Improving their positioning (within their parent container)
   - Adding subtle animations to draw attention

3. Adjust the layout to prioritize high-interaction areas:
   - Move important content above the fold (except protected sections)
   - Group related elements that receive high engagement
   - Create clearer visual hierarchy

4. Technical requirements:
   - Maintain responsive design (must work on mobile and desktop)
   - Keep all functionality intact (don't remove features)
   - Preserve all images and their positions
   - Ensure accessibility (maintain proper contrast, focus states, etc.)

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

      // Call the AI service with a timeout for reliability
      const optimizedContent = await Promise.race([
        this.aiService.generateWebsite(prompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI optimization timed out')), 60000))
      ]);

      // Extract code blocks
      const optimizedCode = this.extractCodeFromResponse(optimizedContent);

      // Validate extracted code
      if (!optimizedCode.html || optimizedCode.html.length < 50) {
        throw new Error('Generated HTML is too short or empty');
      }

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
        try {
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
          console.log(`Optimized website saved with ID: ${optimizedWebsiteId}`);
        } catch (dbError) {
          console.error('Error saving optimized website to database:', dbError);
          // Continue with in-memory storage as fallback
        }
      }

      // Always save to in-memory database as backup
      this.inMemoryDatabase.addWebsite({
        websiteId: optimizedWebsiteId,
        html: optimizedCode.html,
        css: optimizedCode.css,
        js: optimizedCode.js,
        previewHtml: optimizedPreviewHtml,
        imagePaths: website.imagePaths || [],
        createdAt: new Date(),
        lastAccessed: new Date(),
        viewCount: 0,
        originalWebsiteId: websiteId,
        isOptimized: true,
        clickCount: 0
      });

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
    letoptimizedWebsite = null;

    if (this.dbConnected) {
      try {
        // Find the latest optimized version of this website
        optimizedWebsite = await Website.findOne({ 
          originalWebsiteId: websiteId, 
          isOptimized: true 
        }).sort({ createdAt: -1 });
      } catch (error) {
        console.error(`Database error getting optimized version for ${websiteId}:`, error);
      }
    }

    if (!optimizedWebsite) {
      // Check in-memory database
      const optimizedVersions = this.inMemoryDatabase.websites
        .filter(site => site.originalWebsiteId === websiteId && site.isOptimized)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      optimizedWebsite = optimizedVersions[0] || null;
    }

    return optimizedWebsite;
  }

  // Helper methods for protected sections
  _identifyProtectedSections(html) {
    const foundSections = [];
    
    try {
      // Create a temporary DOM to search for selectors
      const jsdom = require('jsdom');
      const { JSDOM } = jsdom;
      const dom = new JSDOM(`<!DOCTYPE html>${html}`);
      const document = dom.window.document;

      // Check for each protected section type
      for (const section of this.protectedSections) {
        // Try each selector until we find a match
        for (const selector of section.selectors) {
          try {
            const elements = document.querySelectorAll(selector);
            if (elements && elements.length > 0) {
              // For each matching element, store its information
              Array.from(elements).forEach((element, index) => {
                foundSections.push({
                  name: `${section.name}${elements.length > 1 ? ` ${index + 1}` : ''}`,
                  selector: selector,
                  description: section.description,
                  originalHtml: element.outerHTML
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
    } catch (error) {
      console.error('Error identifying protected sections:', error);
    }

    return foundSections;
  }

  _verifyProtectedSections(optimizedHtml, protectedSections) {
    if (!protectedSections || protectedSections.length === 0) {
      return { success: true };
    }

    try {
      // Create a temporary DOM for the optimized HTML
      const jsdom = require('jsdom');
      const { JSDOM } = jsdom;
      const dom = new JSDOM(`<!DOCTYPE html>${optimizedHtml}`);
      const document = dom.window.document;

      // Check each protected section
      for (const section of protectedSections) {
        try {
          const elements = document.querySelectorAll(section.selector);
          
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
    } catch (error) {
      console.error('Error verifying protected sections:', error);
      return { 
        success: false, 
        message: `Error during verification: ${error.message}` 
      };
    }
  }

  _repairProtectedSections(originalHtml, optimizedHtml, protectedSections) {
    if (!protectedSections || protectedSections.length === 0) {
      return optimizedHtml;
    }

    try {
      // Create DOM parsers for both original and optimized HTML
      const jsdom = require('jsdom');
      const { JSDOM } = jsdom;
      const originalDom = new JSDOM(`<!DOCTYPE html>${originalHtml}`);
      const optimizedDom = new JSDOM(`<!DOCTYPE html>${optimizedHtml}`);
      
      const originalDocument = originalDom.window.document;
      const optimizedDocument = optimizedDom.window.document;
      
      // For each protected section
      for (const section of protectedSections) {
        // Find the section in the original HTML
        const originalElements = originalDocument.querySelectorAll(section.selector);
        
        if (originalElements && originalElements.length > 0) {
          // Check if the section exists in the optimized HTML
          const optimizedElements = optimizedDocument.querySelectorAll(section.selector);
          
          // If the section is missing in the optimized HTML
          if (!optimizedElements || optimizedElements.length === 0) {
            console.log(`Repairing missing section: ${section.name}`);
            
            // Determine where to insert the original section
            if (section.name.includes('Navigation') || section.name.includes('Nav')) {
              // Navigation goes at the top of the body
              const body = optimizedDocument.querySelector('body');
              if (body && body.firstChild) {
                body.insertBefore(
                  originalElements[0].cloneNode(true), 
                  body.firstChild
                );
              }
            } else if (section.name.includes('Hero')) {
              // Hero section goes after the nav but before other content
              const nav = optimizedDocument.querySelector('nav, .navbar, .navigation, #navbar');
              const body = optimizedDocument.querySelector('body');
              
              if (nav && nav.nextSibling) {
                nav.parentNode.insertBefore(
                  originalElements[0].cloneNode(true), 
                  nav.nextSibling
                );
              } else if (body && body.firstChild) {
                body.insertBefore(
                  originalElements[0].cloneNode(true), 
                  body.firstChild
                );
              }
            } else if (section.name.includes('Footer')) {
              // Footer goes at the end of the body
              const body = optimizedDocument.querySelector('body');
              if (body) {
                body.appendChild(originalElements[0].cloneNode(true));
              }
            } else if (section.name.includes('Contact')) {
              // Contact form goes before the footer if present, or at the end
              const footer = optimizedDocument.querySelector('footer, .footer, #footer');
              const body = optimizedDocument.querySelector('body');
              
              if (footer && footer.parentNode) {
                footer.parentNode.insertBefore(
                  originalElements[0].cloneNode(true), 
                  footer
                );
              } else if (body) {
                body.appendChild(originalElements[0].cloneNode(true));
              }
            }
          }
        }
      }
      
      // Get the repaired HTML
      const repairedHtml = optimizedDocument.querySelector('html').innerHTML;
      return repairedHtml;
      
    } catch (error) {
      console.error('Error repairing protected sections:', error);
      // If repair fails, return the original optimized HTML
      return optimizedHtml;
    }
  }
}

module.exports = WebsiteService;
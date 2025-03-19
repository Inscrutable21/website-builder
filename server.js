const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
const fetch = require('node-fetch');


dotenv.config();


const mongoose = require('mongoose');


const app = express();
const port = process.env.PORT || 3002;


app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Add fallback for missing static files
app.use((req, res, next) => {
  if (req.method === 'GET' && req.url.includes('.') && !req.url.includes('favicon.ico')) {
    // This is likely a static file request
    const filePath = path.join(__dirname, 'public', req.url);
    
    // Check if the file exists
    try {
      require('fs').accessSync(filePath, require('fs').constants.F_OK);
      // If we get here, the file exists, so continue
      next();
    } catch (err) {
      // File doesn't exist
      console.log(`Static file not found: ${req.url}`);
      
      // Handle common missing files
      if (req.url === '/style.css') {
        // Return an empty CSS file instead of 404
        res.setHeader('Content-Type', 'text/css');
        res.send('/* Fallback empty CSS */');
        return;
      }
      
      // For other files, continue to 404
      next();
    }
  } else {
    next();
  }
});

// Simple in-memory database for testing without MongoDB
const inMemoryDatabase = {
  websites: [],
  interactions: [],
  
  addWebsite(website) {
    this.websites.push(website);
    return website;
  },
  
  getWebsite(websiteId) {
    return this.websites.find(site => site.websiteId === websiteId);
  },
  
  addInteraction(interaction) {
    this.interactions.push(interaction);
    return interaction;
  },
  
  getInteractions(websiteId) {
    return this.interactions.filter(interaction => interaction.websiteId === websiteId);
  },
  
  getHeatmapData(websiteId) {
    // Get all click interactions for this website
    const clicks = this.interactions.filter(
      interaction => interaction.websiteId === websiteId && interaction.type === 'click'
    );
    
    // Group by x,y coordinates
    const heatmapData = {};
    clicks.forEach(click => {
      const key = `${click.x},${click.y}`;
      if (!heatmapData[key]) {
        heatmapData[key] = {
          x: click.x,
          y: click.y,
          count: 0
        };
      }
      heatmapData[key].count++;
    });
    
    // Convert to array
    return Object.values(heatmapData);
  },
  
  clearInteractions(websiteId) {
    this.interactions = this.interactions.filter(interaction => interaction.websiteId !== websiteId);
    return true;
  }
};

// UI Optimization Cache
const optimizationCache = new Map(); // Cache to store optimization status by websiteId

// Check if we have an OpenAI API key
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.warn('WARNING: OPENAI_API_KEY is not set. The AI generation endpoints will not work.');
}

// Initialize OpenAI client if API key is available
let openai = null;
if (apiKey) {
  try {
    openai = new OpenAI({
      apiKey: apiKey
    });
  } catch (error) {
    console.error('Error initializing OpenAI client:', error);
  }
}

// Connect to MongoDB if DATABASE_URL is provided
let dbConnected = false;
if (process.env.DATABASE_URL) {
  mongoose.connect(process.env.DATABASE_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => {
    console.log('Connected to MongoDB');
    dbConnected = true;
  })
  .catch(err => {
    console.error('Could not connect to MongoDB', err);
    console.warn('Running with in-memory database instead');
  });
} else {
  console.warn('DATABASE_URL not set. Running with in-memory database.');
}

// Define schema for tracking user interactions
const InteractionSchema = new mongoose.Schema({
  websiteId: {
    type: String,
    required: true,
    index: true
  },
  x: Number,
  y: Number,
  value: Number,
  timestamp: {
    type: Number,
    default: () => Date.now()
  },
  type: {
    type: String,
    enum: ['click', 'movement', 'scroll', 'pageload', 'pageexit', 'custom'],
    default: 'click'
  },
  sessionId: String,
  userAgent: String,
  referrer: String,
  viewportWidth: Number,
  viewportHeight: Number,
  scrollDepth: Number,
  scrollPercentage: Number,
  timeSpent: Number,
  path: String,
  elementText: String
});

// Define schema for storing generated websites
const WebsiteSchema = new mongoose.Schema({
  websiteId: {
    type: String,
    required: true,
    unique: true
  },
  html: String,
  css: String,
  js: String,
  previewHtml: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastAccessed: Date,
  viewCount: {
    type: Number,
    default: 0
  },
  originalWebsiteId: String, // For optimized versions, reference to the original website
  isOptimized: {
    type: Boolean,
    default: false
  },
  clickCount: {
    type: Number,
    default: 0
  }
});

// Create models
const Interaction = mongoose.model('Interaction', InteractionSchema);
const Website = mongoose.model('Website', WebsiteSchema);

// Helper function to format markdown to HTML
function formatMarkdown(text) {
  if (!text) return '';
  
  return text
    // Headers
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Lists
    .replace(/^\s*[-*]\s+(.*?)$/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>')
    // Line breaks
    .replace(/\n/g, '<br>');
}

// Helper function to create a complete HTML document with heatmap integration
function createCompleteHtml(html, css, js, websiteId) {
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

// Helper function to extract code blocks from AI response
function extractCodeFromResponse(responseText) {
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

// AI Content Enhancement endpoint
app.post('/enhance-prompt', async (req, res) => {
  try {
    console.log('Enhance prompt request received');

    // Check if OpenAI client is initialized
    if (!openai) {
      return res.status(500).json({ error: 'OpenAI API key not configured. Please set the OPENAI_API_KEY environment variable.' });
    }

    const { rawPrompt } = req.body;

    if (!rawPrompt) {
      return res.status(400).json({ error: 'Raw prompt is required' });
    }

    console.log('Processing prompt enhancement request');

    // Create the instruction for the model
    const instruction = `
      Transform the following raw text into a well-structured, professionally formatted document with:
      1. Clear headings and subheadings (using markdown format with ** for headings)
      2. Organized paragraphs
      3. Proper bullet points where appropriate
      4. Maintain all the original information but enhance the presentation

      Raw text: ${rawPrompt}

      Return only the enhanced formatted text, without any explanations or additional notes.
    `;

    // Call the OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant that formats and structures content professionally." },
        { role: "user", content: instruction }
      ],
      temperature: 0.7,
    });

    const enhancedPrompt = completion.choices[0].message.content;
    
    console.log('Successfully enhanced prompt');
    
    if (!enhancedPrompt) {
      throw new Error('Invalid response from OpenAI API');
    }
    
    res.json({ enhancedPrompt });
  } catch (error) {
    console.error('Error in enhance-prompt endpoint:', error);
    res.status(500).json({ error: 'Failed to enhance prompt', details: error.message });
  }
});

// Website Generation endpoint
app.post('/generate-website', async (req, res) => {
  try {
    console.log('Generate website request received');
    
    if (!openai) {
      return res.status(500).json({ error: 'OpenAI API key not configured. Please set the OPENAI_API_KEY environment variable.' });
    }
    
    const { enhancedPrompt } = req.body;
    
    if (!enhancedPrompt) {
      return res.status(400).json({ error: 'Enhanced prompt is required' });
    }
    
    console.log('Processing website generation');
    
    const instruction = `
      Create a complete and professional website with a beautiful interface using HTML, CSS, and JavaScript based on the following enhanced prompt:
      ${enhancedPrompt}
      
      The website should include the following key features:
      1. A visually appealing layout that is suitable for the type of website being created (e.g., blog, portfolio, e-commerce).
      2. Responsive design to ensure the website functions well on all devices and screen sizes.
      3. Use modern CSS techniques for styling, including flexbox or grid for layout, and appropriate use of colors and typography.
      4. Implement navigation elements that allow users to easily explore different sections of the site.
      5. Include interactive features that enhance user engagement, such as forms, buttons, or animations.
      6. Ensure clean, organized, and well-commented code for all HTML, CSS, and JavaScript files.
      7. Optimize the website for performance and ensure compatibility across different browsers.
      
      Please provide the complete code as separate HTML, CSS, and JavaScript files. Present each file as a separate code block with the appropriate language identifier.
    `;
    
    // Call the OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a skilled web developer who creates beautiful, responsive websites with clean code." },
        { role: "user", content: instruction }
      ],
      temperature: 0.7,
      max_tokens: 4000, // Adjust based on your needs
    });
    
    const generatedContent = completion.choices[0].message.content;
    
    if (!generatedContent) {
      throw new Error('Invalid response from OpenAI API');
    }
    
    console.log('Successfully generated website content');
    
    // Extract code blocks
    const { html, css, js } = extractCodeFromResponse(generatedContent);
    
    // Generate a unique ID for the website
    const websiteId = uuidv4();
    
    // Create the preview HTML
    const previewHtml = createCompleteHtml(html, css, js, websiteId);
    
    // Save to database if connected
    if (dbConnected) {
      try {
        const website = new Website({
          websiteId,
          html,
          css,
          js,
          previewHtml,
          createdAt: new Date(),
          clickCount: 0
        });
        
        await website.save();
        console.log(`Website saved to database with ID: ${websiteId}`);
      } catch (dbError) {
        console.error('Error saving website to database:', dbError);
      }
    } else {
      // Save to in-memory database
      inMemoryDatabase.addWebsite({
        websiteId,
        html,
        css,
        js,
        previewHtml,
        createdAt: new Date(),
        lastAccessed: new Date(),
        viewCount: 0,
        clickCount: 0
      });
    }
    
    res.json({
      websiteId,
      html,
      css,
      js,
      previewHtml
    });
  } catch (error) {
    console.error('Error in generate-website endpoint:', error);
    res.status(500).json({ error: 'Failed to generate website', details: error.message });
  }
});

// Track user interactions
app.post('/track-interaction', async (req, res) => {
  try {
    const interactionData = {
      ...req.body,
      userAgent: req.headers['user-agent'] || 'unknown'
    };
    
    const { websiteId, type } = interactionData;
    
    // Save to database if connected
    if (dbConnected) {
      try {
        const interaction = new Interaction(interactionData);
        await interaction.save();
        
        // If this is a click, increment the click counter for the website
        if (type === 'click') {
          const website = await Website.findOne({ websiteId });
          if (website) {
            website.clickCount = (website.clickCount || 0) + 1;
            await website.save();
            
            // Check if we need to optimize the UI (every 50 clicks)
            if (website.clickCount % 50 === 0 && !website.isOptimized) {
              console.log(`Optimization threshold reached (${website.clickCount} clicks) for website: ${websiteId}`);
              
              // Trigger optimization in the background
              fetch(`http://localhost:${port}/optimize-ui/${websiteId}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                }
              }).catch(error => {
                console.error('Error triggering optimization:', error);
              });
            }
          }
        }
      } catch (dbError) {
        console.error('Error saving interaction to database:', dbError);
        // Fall back to in-memory storage
        inMemoryDatabase.addInteraction(interactionData);
      }
    } else {
      // Save to in-memory database
      inMemoryDatabase.addInteraction(interactionData);
      
      // Update click count for the website
      if (type === 'click') {
        const website = inMemoryDatabase.getWebsite(websiteId);
        if (website) {
          website.clickCount = (website.clickCount || 0) + 1;
          
          // Check if we need to optimize the UI (every 50 clicks)
          if (website.clickCount % 50 === 0 && !website.isOptimized) {
            console.log(`Optimization threshold reached (${website.clickCount} clicks) for website: ${websiteId}`);
            
            // Trigger optimization in the background
            fetch(`http://localhost:${port}/optimize-ui/${websiteId}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              }
            }).catch(error => {
              console.error('Error triggering optimization:', error);
            });
          }
        }
      }
    }
    
    res.status(200).send('Interaction recorded');
  } catch (error) {
    console.error('Error saving interaction:', error);
    res.status(500).send('Error recording interaction');
  }
});

// Get heatmap data for a website
app.get('/get-heatmap-data/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    
    let heatmapData = [];
    
    // Get from database if connected
    if (dbConnected) {
      try {
        heatmapData = await Interaction.aggregate([
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
      } catch (dbError) {
        console.error('Error retrieving heatmap data from database:', dbError);
        // Fall back to in-memory storage
        heatmapData = inMemoryDatabase.getHeatmapData(websiteId);
      }
    } else {
      // Get from in-memory database
      heatmapData = inMemoryDatabase.getHeatmapData(websiteId);
    }
    
    res.json(heatmapData);
  } catch (error) {
    console.error('Error retrieving heatmap data:', error);
    res.status(500).send('Error retrieving heatmap data');
  }
});

// Reset heatmap data for a website
app.post('/reset-heatmap-data/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    
    // Reset in database if connected
    if (dbConnected) {
      try {
        await Interaction.deleteMany({ websiteId });
        
        // Reset click count
        const website = await Website.findOne({ websiteId });
        if (website) {
          website.clickCount = 0;
          await website.save();
        }
      } catch (dbError) {
        console.error('Error resetting heatmap data in database:', dbError);
        // Fall back to in-memory storage
        inMemoryDatabase.clearInteractions(websiteId);
      }
    } else {
      // Reset in in-memory database
      inMemoryDatabase.clearInteractions(websiteId);
      
      // Reset click count
      const website = inMemoryDatabase.getWebsite(websiteId);
      if (website) {
        website.clickCount = 0;
      }
    }
    
    res.status(200).send('Heatmap data reset');
  } catch (error) {
    console.error('Error resetting heatmap data:', error);
    res.status(500).send('Error resetting heatmap data');
  }
});

// UI Optimization endpoint
app.post('/optimize-ui/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    const { forceOptimize } = req.query;
    
    // Check if we've recently optimized this website (prevent duplicate optimizations)
    const lastOptimized = optimizationCache.get(websiteId);
    const now = Date.now();
    if (!forceOptimize && lastOptimized && now - lastOptimized < 60 * 60 * 1000) { // 1 hour cooldown
      return res.json({
        message: 'This website was recently optimized. Please wait before optimizing again.',
        alreadyOptimized: true
      });
    }
    
    console.log(`Starting UI optimization for website: ${websiteId}`);
    
    // Get the website data
    let website;
    if (dbConnected) {
      website = await Website.findOne({ websiteId });
    } else {
      website = inMemoryDatabase.getWebsite(websiteId);
    }
    
    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }
    
    // Get heatmap data
    let heatmapData;
    if (dbConnected) {
      heatmapData = await Interaction.aggregate([
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
    } else {
      heatmapData = inMemoryDatabase.getHeatmapData(websiteId);
    }
    
    // Get click elements data
    let clickElements;
    if (dbConnected) {
      clickElements = await Interaction.aggregate([
        { $match: { websiteId, type: 'click', path: { $exists: true, $ne: null } } },
        { $group: {
            _id: "$path",
            count: { $sum: 1 },
            text: { $first: "$elementText" }
          }
        },
        { $project: {
            path: "$_id",
            count: 1,
            text: 1,
            _id: 0
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);
    } else {
      // For in-memory DB, we need to generate this from raw interactions
      const clickInteractions = inMemoryDatabase.getInteractions(websiteId)
        .filter(interaction => interaction.type === 'click' && interaction.path);
      
      // Group by path
      const pathGroups = {};
      clickInteractions.forEach(interaction => {
        const { path, elementText } = interaction;
        if (!pathGroups[path]) {
          pathGroups[path] = {
            path,
            count: 0,
            text: elementText
          };
        }
        pathGroups[path].count++;
      });
      
      // Convert to array and sort
      clickElements = Object.values(pathGroups)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    }
    
    // Check if we have enough data to optimize
    if (heatmapData.length < 10 && !forceOptimize) {
      return res.json({
        message: 'Not enough interaction data to optimize UI. Need at least 10 unique click positions.',
        sufficientData: false
      });
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
     I need you to restructure a website's UI based on user interaction data to optimize user experience.

      
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
Please restructure and optimize the website UI with the following guidelines:

Completely reposition frequently clicked elements to prime locations (e.g., top of page, center, or fixed navigation) based on their importance
Redesign the layout to prioritize high-interaction areas revealed by the heatmap data
Use hierarchy principles to emphasize important elements through:

Strategic positioning (top, center, or fixed elements)
Visual prominence (size, color contrast, whitespace)
Subtle animations to draw attention (hover effects, gentle pulsing)


Simplify user journeys by reducing clicks needed to reach popular destinations
Maintain the overall brand aesthetic while reorganizing elements
Ensure the restructured website remains responsive and works on all screen sizes
Preserve all existing functionality, just optimize the UI and layout

Return the restructured HTML, CSS, and JavaScript code as separate code blocks with appropriate language identifiers.

    `;
    
    // Check if OpenAI client is initialized
    if (!openai) {
      return res.status(500).json({ error: 'OpenAI API key not configured. Please set the OPENAI_API_KEY environment variable.' });
    }
    
    // Call the OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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
    const responseText = completion.choices[0].message.content;
    const htmlMatch = responseText.match(/```html\s*([\s\S]*?)\s*```/);
    const cssMatch = responseText.match(/```css\s*([\s\S]*?)\s*```/);
    const jsMatch = responseText.match(/```javascript\s*([\s\S]*?)\s*```/) || 
                  responseText.match(/```js\s*([\s\S]*?)\s*```/);
    
    if (!htmlMatch) {
      throw new Error('Could not extract HTML from the generated content');
    }
    
    const optimizedHtml = htmlMatch[1];
    const optimizedCss = cssMatch ? cssMatch[1] : '';
    const optimizedJs = jsMatch ? jsMatch[1] : '';
    
    // Create the optimized preview HTML
    const optimizedWebsiteId = `${websiteId}-optimized-${Date.now()}`;
    const optimizedPreviewHtml = createCompleteHtml(
      optimizedHtml, 
      optimizedCss, 
      optimizedJs, 
      optimizedWebsiteId
    );
    
    // Save the optimized website
    if (dbConnected) {
      const optimizedWebsite = new Website({
        websiteId: optimizedWebsiteId,
        html: optimizedHtml,
        css: optimizedCss,
        js: optimizedJs,
        previewHtml: optimizedPreviewHtml,
        createdAt: new Date(),
        originalWebsiteId: websiteId,
        isOptimized: true,
        clickCount: 0
      });
      
      await optimizedWebsite.save();
    } else {
      inMemoryDatabase.addWebsite({
        websiteId: optimizedWebsiteId,
        html: optimizedHtml,
        css: optimizedCss,
        js: optimizedJs,
        previewHtml: optimizedPreviewHtml,
        createdAt: new Date(),
        lastAccessed: new Date(),
        viewCount: 0,
        originalWebsiteId: websiteId,
        isOptimized: true,
        clickCount: 0
      });
    }
    
    // Update optimization cache
    optimizationCache.set(websiteId, now);
    
    console.log(`UI optimization completed for website: ${websiteId}`);
    
    res.json({
      message: 'UI successfully optimized',
      originalWebsiteId: websiteId,
      optimizedWebsiteId: optimizedWebsiteId
    });
  } catch (error) {
    console.error('Error in optimize-ui endpoint:', error);
    res.status(500).json({ error: 'Failed to optimize UI', details: error.message });
  }
});

// API endpoint for getting website data (for analytics dashboard)
app.get('/api/website/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    
    // Get the website data
    let website;
    if (dbConnected) {
      website = await Website.findOne({ websiteId });
    } else {
      website = inMemoryDatabase.getWebsite(websiteId);
    }
    
    // If website not found, check if there's an optimized version
    if (!website && !websiteId.includes('-optimized-')) {
      let optimizedWebsite;
      
      if (dbConnected) {
        // Find the latest optimized version
        optimizedWebsite = await Website.findOne({ 
          originalWebsiteId: websiteId,
          isOptimized: true
        }).sort({ createdAt: -1 });
      } else {
        // For in-memory DB
        const optimizedVersions = inMemoryDatabase.websites
          .filter(site => site.originalWebsiteId === websiteId && site.isOptimized)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        optimizedWebsite = optimizedVersions[0];
      }
      
      if (optimizedWebsite) {
        return res.json(optimizedWebsite);
      }
    }
    
    // If still not found, create a mock website for testing
    if (!website) {
      console.log(`Website not found for analytics, creating mock for ID: ${websiteId}`);
      
      const mockHtml = `
        <!DOCTYPE html>
          <html>
          <head>
            <title>Demo Website</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                padding: 20px;
                margin: 0;
                line-height: 1.6;
              }
              h1 { 
                color: #4361ee; 
                margin-bottom: 1rem;
              }
              .container { 
                max-width: 800px; 
                margin: 0 auto;
                padding: 20px;
              }
              .btn { 
                display: inline-block; 
                padding: 10px 20px; 
                background: #4361ee; 
                color: white; 
                border-radius: 5px;
                cursor: pointer;
                margin: 10px 5px;
                border: none;
                font-size: 16px;
              }
              .content { 
                margin: 20px 0; 
                line-height: 1.6;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Demo Website</h1>
              <div class="content">
                <p>This is a sample website for ID: ${websiteId}</p>
                <p>The actual website content is not available, but you can still see how the heatmap tracking works.</p>
                <p>Try clicking on different parts of this page to generate heatmap data.</p>
              </div>
              <div class="buttons">
                <button class="btn">Click Me</button>
                <button class="btn">Another Button</button>
                <button class="btn">Third Button</button>
              </div>
            </div>
            <script src="/heatmap-tracker.js"></script>
            <script>
              // Initialize heatmap with the website ID
              initializeHeatmap('${websiteId}');
            </script>
          </body>
          </html>
        `;
        
        website = {
          websiteId,
          html: '',
          css: '',
          js: '',
          previewHtml: mockHtml,
          createdAt: new Date(),
          lastAccessed: new Date(),
          viewCount: 1,
          clickCount: 0
        };
        
        // Save the mock website to in-memory database
        inMemoryDatabase.addWebsite(website);
      }
      
      res.json(website);
  } catch (error) {
    console.error('Error fetching website for analytics:', error);
    res.status(500).json({ error: 'Failed to fetch website', details: error.message });
  }
});
// Get the latest optimized version of a website
app.get('/optimized-website/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    
    // Find the latest optimized version of this website
    let optimizedWebsite;
    
    if (dbConnected) {
      // Query for websites that have this websiteId as their originalWebsiteId
      // Sort by createdAt in descending order to get the most recent
      optimizedWebsite = await Website.findOne({ 
        originalWebsiteId: websiteId,
        isOptimized: true
      }).sort({ createdAt: -1 });
    } else {
      // For in-memory DB
      const optimizedVersions = inMemoryDatabase.websites
        .filter(site => site.originalWebsiteId === websiteId && site.isOptimized)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      optimizedWebsite = optimizedVersions[0];
    }
    
    if (!optimizedWebsite) {
      return res.status(404).json({ 
        message: 'No optimized version found',
        originalWebsiteId: websiteId
      });
    }
    
    res.json(optimizedWebsite);
  } catch (error) {
    console.error('Error fetching optimized website:', error);
    res.status(500).json({ error: 'Failed to fetch optimized website', details: error.message });
  }
});

// Serve website by ID (with automatic redirection to optimized version)
app.get('/website/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    const { original, format } = req.query; // Added format parameter
    
    // Check if this is an API request (wants JSON) or a direct website view
    const wantsJson = format === 'json' || req.headers.accept?.includes('application/json');
    
    // Check if this is an optimized website ID
    let website;
    if (dbConnected) {
      website = await Website.findOne({ websiteId });
      
      if (website) {
        // Update last accessed time and view count
        website.lastAccessed = new Date();
        website.viewCount += 1;
        await website.save();
      }
    } else {
      website = inMemoryDatabase.getWebsite(websiteId);
      if (website) {
        website.lastAccessed = new Date();
        website.viewCount = (website.viewCount || 0) + 1;
      }
    }
    
    // If website not found or if original parameter is not set, check if there's an optimized version
    if ((!website || original !== 'true') && !websiteId.includes('-optimized-')) {
      let optimizedWebsite;
      
      if (dbConnected) {
        // Find the latest optimized version
        optimizedWebsite = await Website.findOne({ 
          originalWebsiteId: websiteId,
          isOptimized: true
        }).sort({ createdAt: -1 });
      } else {
        // For in-memory DB
        const optimizedVersions = inMemoryDatabase.websites
          .filter(site => site.originalWebsiteId === websiteId && site.isOptimized)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        optimizedWebsite = optimizedVersions[0];
      }
      
      if (optimizedWebsite) {
        // If JSON is requested, return the optimized website data
        if (wantsJson) {
          return res.json(optimizedWebsite);
        }
        
        // Otherwise redirect to the optimized version if it exists and original is not forced
        if (original !== 'true') {
          console.log(`Redirecting to optimized version: ${optimizedWebsite.websiteId}`);
          return res.redirect(`/website/${optimizedWebsite.websiteId}`);
        }
      }
    }
    
    // If still not found, create a mock website for testing
    if (!website) {
      console.log(`Website not found, creating mock for ID: ${websiteId}`);
      
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Demo Website</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px;
              margin: 0;
              line-height: 1.6;
            }
            h1 { 
              color: #4361ee; 
              margin-bottom: 1rem;
            }
            .container { 
              max-width: 800px; 
              margin: 0 auto;
              padding: 20px;
            }
            .btn { 
              display: inline-block; 
              padding: 10px 20px; 
              background: #4361ee; 
              color: white; 
              border-radius: 5px;
              cursor: pointer;
              margin: 10px 5px;
              border: none;
              font-size: 16px;
            }
            .btn:hover {
              background: #3a56d4;
            }
            .content { 
              margin: 20px 0; 
              line-height: 1.6;
            }
            p {
              margin-bottom: 1rem;
            }
            .optimization-badge {
              position: fixed;
              top: 10px;
              right: 10px;
              background: rgba(67, 97, 238, 0.9);
              color: white;
              padding: 5px 10px;
              border-radius: 20px;
              font-size: 12px;
              z-index: 1000;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Demo Website</h1>
            <div class="content">
              <p>This is a sample website for ID: ${websiteId}</p>
              <p>The actual website content is not available, but you can still see how the heatmap tracking works.</p>
              <p>Try clicking on different parts of this page to generate heatmap data.</p>
              <p>After 50 clicks, the system will automatically optimize the UI based on user interactions.</p>
            </div>
            <div class="buttons">
              <button class="btn">Click Me</button>
              <button class="btn">Another Button</button>
              <button class="btn">Third Button</button>
            </div>
          </div>
          <script src="/heatmap-tracker.js"></script>
          <script>
            // Initialize heatmap with the website ID
            initializeHeatmap('${websiteId}');
          </script>
        </body>
        </html>
      `;
      
      website = {
        websiteId,
        html: mockHtml,
        css: '',
        js: '',
        previewHtml: mockHtml,
        createdAt: new Date(),
        lastAccessed: new Date(),
        viewCount: 1,
        clickCount: 0
      };
      
      // Save the mock website to in-memory database
      inMemoryDatabase.addWebsite(website);
    }
    
    // If JSON is requested, return the website data as JSON
    if (wantsJson) {
      return res.json(website);
    }
    
    // Add optimization badge if this is an optimized version
    let htmlToSend = website.previewHtml;
    if (website.isOptimized && !htmlToSend.includes('optimization-badge')) {
      htmlToSend = htmlToSend.replace('</body>', `
        <div class="optimization-badge">
          <span>✨ Optimized UI</span>
        </div>
        </body>
      `);
    }
    
    // Send the website HTML directly for browser viewing
    res.send(htmlToSend);
  } catch (error) {
    console.error('Error serving website:', error);
    
    // Return JSON error if JSON was requested
    if (req.query.format === 'json' || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ error: 'Failed to fetch website', details: error.message });
    }
    
    // Otherwise send HTML error page
    res.status(500).send(`
      <html>
        <head>
          <title>Error</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
            .error-container { max-width: 600px; margin: 50px auto; }
            h1 { color: #ef476f; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>Error Loading Website</h1>
            <p>There was a problem loading the website. Please try again later.</p>
            <p>Error details: ${error.message}</p>
          </div>
        </body>
      </html>
    `);
  }
});

// Get website statistics
app.get('/website-stats/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    const timeRange = req.query.timeRange || 'week';
    
    // Default mock stats
    let stats = {
      uniqueVisitors: 0,
      totalClicks: 0,
      averageTimeOnPage: 0,
      averageScrollDepth: 0,
      visitorsTrend: 5,  // Default mock trend values
      clicksTrend: 8,
      timeTrend: -3,
      scrollTrend: 12,
      lastActivity: Date.now(),
      clickElements: [],
      clickCount: 0,
      optimizationStatus: {
        isOptimized: false,
        optimizedVersions: 0,
        nextOptimizationAt: 0
      }
    };
    
    // Try to get real stats from database if connected
    if (dbConnected) {
      try {
        // Get website info
        const website = await Website.findOne({ websiteId });
        if (website) {
          stats.clickCount = website.clickCount || 0;
          
          // Calculate next optimization threshold
          const nextOptimizationThreshold = Math.ceil(stats.clickCount / 50) * 50;
          stats.optimizationStatus.nextOptimizationAt = nextOptimizationThreshold;
        }
        
        // Check if optimized versions exist
        const optimizedVersionsCount = await Website.countDocuments({
          originalWebsiteId: websiteId,
          isOptimized: true
        });
        
        stats.optimizationStatus.optimizedVersions = optimizedVersionsCount;
        stats.optimizationStatus.isOptimized = optimizedVersionsCount > 0;
        
        // Get unique visitors (unique session IDs)
        const uniqueVisitors = await Interaction.distinct('sessionId', { 
          websiteId,
          sessionId: { $exists: true, $ne: null }
        }).then(sessions => sessions.length);
        
        // Get total clicks
        const totalClicks = await Interaction.countDocuments({ 
          websiteId, 
          type: 'click' 
        });
        
        // Get last activity timestamp
        const lastActivity = await Interaction.findOne({ 
          websiteId 
        }).sort({ timestamp: -1 }).then(doc => doc?.timestamp || null);
        
        // Get average time on page
        const timeData = await Interaction.find({ 
          websiteId, 
          type: 'pageexit',
          timeSpent: { $exists: true, $ne: null }
        }).then(docs => docs.map(doc => doc.timeSpent || 0));
        
        const averageTimeOnPage = timeData.length > 0 
          ? timeData.reduce((sum, time) => sum + time, 0) / timeData.length / 1000 // convert to seconds
          : 0;
        
        // Get average scroll depth
        const scrollData = await Interaction.find({ 
          websiteId, 
          type: 'scroll',
          scrollPercentage: { $exists: true, $ne: null }
        }).then(docs => docs.map(doc => doc.scrollPercentage || 0));
        
        const averageScrollDepth = scrollData.length > 0 
          ? scrollData.reduce((sum, depth) => sum + depth, 0) / scrollData.length
          : 0;
        
        // Get most clicked elements
        const clickElements = await Interaction.aggregate([
          { $match: { websiteId, type: 'click', path: { $exists: true, $ne: null } } },
          { $group: {
              _id: "$path",
              count: { $sum: 1 },
              text: { $first: "$elementText" }
            }
          },
          { $project: {
              path: "$_id",
              count: 1,
              text: 1,
              _id: 0
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]);
        
        // Update stats with real data
        stats = {
          ...stats,
          uniqueVisitors: uniqueVisitors || 0,
          totalClicks: totalClicks || 0,
          averageTimeOnPage: averageTimeOnPage || 0,
          averageScrollDepth: averageScrollDepth || 0,
          lastActivity: lastActivity || Date.now(),
          clickElements: clickElements || []
        };
      } catch (dbError) {
        console.error('Error retrieving website stats from database:', dbError);
      }
    } else {
      // For in-memory database
      const website = inMemoryDatabase.getWebsite(websiteId);
      if (website) {
        stats.clickCount = website.clickCount || 0;
        
        // Calculate next optimization threshold
        const nextOptimizationThreshold = Math.ceil(stats.clickCount / 50) * 50;
        stats.optimizationStatus.nextOptimizationAt = nextOptimizationThreshold;
      }
      
      // Check if optimized versions exist
      const optimizedVersions = inMemoryDatabase.websites
        .filter(site => site.originalWebsiteId === websiteId && site.isOptimized);
      
      stats.optimizationStatus.optimizedVersions = optimizedVersions.length;
      stats.optimizationStatus.isOptimized = optimizedVersions.length > 0;
      
      // Get interaction data
      const interactions = inMemoryDatabase.getInteractions(websiteId);
      
      // Count unique session IDs
      const uniqueSessions = new Set();
      interactions.forEach(interaction => {
        if (interaction.sessionId) {
          uniqueSessions.add(interaction.sessionId);
        }
      });
      
      // Count clicks
      const clicks = interactions.filter(interaction => interaction.type === 'click');
      
      // Get last activity
      const sortedByTime = [...interactions].sort((a, b) => b.timestamp - a.timestamp);
      const lastActivity = sortedByTime.length > 0 ? sortedByTime[0].timestamp : Date.now();
      
      // Get click elements data
      const clickInteractions = interactions.filter(interaction => interaction.type === 'click' && interaction.path);
      
      // Group by path
      const pathGroups = {};
      clickInteractions.forEach(interaction => {
        const { path, elementText } = interaction;
        if (!pathGroups[path]) {
          pathGroups[path] = {
            path,
            count: 0,
            text: elementText
          };
        }
        pathGroups[path].count++;
      });
      
      // Convert to array and sort
      const clickElements = Object.values(pathGroups)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      // Update stats with in-memory data
      stats = {
        ...stats,
        uniqueVisitors: uniqueSessions.size,
        totalClicks: clicks.length,
        lastActivity: lastActivity,
        clickElements: clickElements
      };
    }
    
    // If no click elements data, generate mock data
    if (!stats.clickElements || stats.clickElements.length === 0) {
      stats.clickElements = [
        { path: 'button.btn', text: 'Click Me', count: 12 },
        { path: 'div.container', text: '', count: 8 },
        { path: 'button.btn:nth-child(2)', text: 'Another Button', count: 5 },
        { path: 'h1', text: 'Demo Website', count: 3 }
      ];
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching website stats:', error);
    res.status(500).json({ error: 'Failed to fetch website stats' });
  }
});

// Compare original and optimized websites
app.get('/compare-websites/:originalId/:optimizedId', (req, res) => {
  const { originalId, optimizedId } = req.params;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Website Comparison</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .comparison-container {
          display: flex;
          height: 100vh;
        }
        .website-frame {
          flex: 1;
          border: none;
          height: 100%;
          border-right: 1px solid #ccc;
        }
        .comparison-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: rgba(0,0,0,0.8);
          color: white;
          padding: 10px;
          display: flex;
          justify-content: space-between;
          z-index: 1000;
        }
        .header-section {
          text-align: center;
          flex: 1;
        }
        .header-title {
          font-weight: bold;
          margin-bottom: 5px;
        }
        .toggle-btn {
          background: #4361ee;
          color: white;
          border: none;
          padding: 8px 15px;
          border-radius: 4px;
          cursor: pointer;
          margin: 0 10px;
        }
      </style>
    </head>
    <body>
      <div class="comparison-header">
        <div class="header-section">
          <div class="header-title">Original Version</div>
          <div id="original-id">${originalId}</div>
        </div>
        <div class="header-section">
          <button id="toggleHeatmapBtn" class="toggle-btn">
            Show Heatmap
          </button>
          <button id="switchViewBtn" class="toggle-btn">
            View Full Screen
          </button>
        </div>
        <div class="header-section">
          <div class="header-title">Optimized Version</div>
          <div id="optimized-id">${optimizedId}</div>
        </div>
      </div>
      
      <div class="comparison-container">
        <iframe id="originalFrame" class="website-frame" src="/website/${originalId}?original=true"></iframe>
        <iframe id="optimizedFrame" class="website-frame" src="/website/${optimizedId}"></iframe>
      </div>
      
      <script>
        document.getElementById('toggleHeatmapBtn').addEventListener('click', function() {
          const frames = [
            document.getElementById('originalFrame').contentWindow,
            document.getElementById('optimizedFrame').contentWindow
          ];
          
          frames.forEach(frame => {
            try {
              // Try to toggle heatmap in each iframe
              const heatmapContainer = frame.document.getElementById('heatmapContainer');
              if (heatmapContainer) {
                const isVisible = heatmapContainer.style.display !== 'none';
                heatmapContainer.style.display = isVisible ? 'none' : 'block';
              }
            } catch (e) {
              console.error('Error toggling heatmap:', e);
            }
          });
          
          this.textContent = this.textContent === 'Show Heatmap' ? 'Hide Heatmap' : 'Show Heatmap';
        });
        
        document.getElementById('switchViewBtn').addEventListener('click', function() {
          const container = document.querySelector('.comparison-container');
          const frames = document.querySelectorAll('.website-frame');
          
          if (frames[0].style.display === 'none') {
            // Show both frames
            frames.forEach(frame => {
              frame.style.display = 'block';
              frame.style.flex = '1';
            });
            this.textContent = 'View Full Screen';
          } else if (frames[1].style.flex === '0') {
            // Show only optimized
            frames[0].style.display = 'none';
            frames[1].style.display = 'block';
            frames[1].style.flex = '1';
            this.textContent = 'View Original';
          } else {
            // Show only original
            frames[1].style.flex = '0';
            frames[1].style.display = 'none';
            frames[0].style.display = 'block';
            this.textContent = 'View Optimized';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Test analytics page
app.get('/test-analytics', (req, res) => {
  const testId = 'test-' + Math.random().toString(36).substring(2, 10);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Analytics & Auto-Optimization Test</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        .card {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #4361ee; }
        .btn {
          display: inline-block;
          padding: 10px 20px;
          background: #4361ee;
          color: white;
          text-decoration: none;
          border-radius: 5px;
          margin-top: 20px;
        }
        .click-counter {
          font-size: 24px;
          font-weight: bold;
          margin: 20px 0;
        }
        .progress-container {
          width: 100%;
          background-color: #e0e0e0;
          border-radius: 4px;
          margin: 10px 0 20px;
        }
        .progress-bar {
          height: 20px;
          background-color: #4361ee;
          border-radius: 4px;
          width: 0%;
          transition: width 0.3s ease;
        }
        .action-buttons {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }
        .optimize-btn {
          background: #7209b7;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>Analytics & Auto-Optimization Test</h1>
          <p>This page demonstrates the automatic UI optimization after 50 clicks.</p>
          <p>Generated test ID: <strong id="websiteId">${testId}</strong></p>
          
          <div class="click-counter">
            Clicks: <span id="clickCount">0</span> / 50
          </div>
          
          <div class="progress-container">
            <div class="progress-bar" id="progressBar"></div>
          </div>
          
          <p>Click anywhere on this page to generate interaction data. After 50 clicks, the system will automatically optimize the UI.</p>
          
          <div class="action-buttons">
            <a href="/analytics?websiteId=${testId}" class="btn" target="_blank">View Analytics</a>
            <button id="optimizeBtn" class="btn optimize-btn">Force Optimize Now</button>
          </div>
        </div>
        
        <div class="card">
          <h2>Click Test Area</h2>
          <p>Click on different elements below to generate varied interaction data:</p>
          
          <div style="display: flex; justify-content: space-between; margin: 30px 0;">
            <button class="btn" style="background: #f72585;">Button 1</button>
            <button class="btn" style="background: #7209b7;">Button 2</button>
            <button class="btn" style="background: #3a0ca3;">Button 3</button>
          </div>
          
          <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam euismod, nisi vel consectetur interdum, nisl nisi consectetur nisl, eget consectetur nisl nisi vel nisl.</p>
          
          <h3>Subheading Example</h3>
          <p>Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Donec velit neque, auctor sit amet aliquam vel, ullamcorper sit amet ligula.</p>
        </div>
      </div>
      
      <script src="/heatmap-tracker.js"></script>
      <script>
        // Initialize heatmap with the test ID
        initializeHeatmap('${testId}');
        
        // Track clicks
        let clickCount = 0;
        const clickCountElement = document.getElementById('clickCount');
        const progressBar = document.getElementById('progressBar');
        const websiteId = '${testId}';
        
        document.addEventListener('click', function() {
          clickCount++;
          clickCountElement.textContent = clickCount;
          
          // Update progress bar
          const progress = (clickCount / 50) * 100;
          progressBar.style.width = Math.min(progress, 100) + '%';
          
          // Check if we've reached 50 clicks
          if (clickCount === 50) {
            alert('50 clicks reached! The system will now optimize the UI based on your interactions.');
          }
        });
        
        // Force optimize button
        document.getElementById('optimizeBtn').addEventListener('click', function() {
          this.disabled = true;
          this.textContent = 'Optimizing...';
          
          fetch('/optimize-ui/' + websiteId + '?forceOptimize=true', {
            method: 'POST'
          })
          .then(response => response.json())
          .then(data => {
            if (data.optimizedWebsiteId) {
              alert('UI successfully optimized! Click OK to view the optimized version.');
              window.open('/website/' + data.optimizedWebsiteId, '_blank');
            } else {
              alert('Optimization response: ' + data.message);
            }
            this.textContent = 'Optimization Complete';
          })
          .catch(error => {
            console.error('Error optimizing:', error);
            alert('Error optimizing: ' + error.message);
            this.textContent = 'Optimization Failed';
            this.disabled = false;
          });
        });
      </script>
    </body>
    </html>
  `);
});

// Main routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/analytics', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

app.get('/api-test', (req, res) => {
  res.json({
    message: 'Server is working properly',
    apiKeyConfigured: !!apiKey,
    databaseConnected: dbConnected,
    memoryStats: {
      websites: inMemoryDatabase.websites.length,
      interactions: inMemoryDatabase.interactions.length
    }
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`OpenAI API Key configured: ${!!apiKey}`);
  console.log(`Database connection: ${dbConnected ? 'connected' : 'using in-memory database'}`);
  console.log(`Analytics dashboard available at: http://localhost:${port}/analytics`);
  console.log(`Test page available at: http://localhost:${port}/test-analytics`);
});
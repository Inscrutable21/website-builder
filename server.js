/**
 * Main server file for AI Website Generator with Heatmap Analytics
 * Using OpenAI GPT-4o Mini
 */

// Import dependencies
const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');

// Load environment variables
dotenv.config();

// Import database connection utilities
const mongoose = require('mongoose');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3002;

// Middleware
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
          createdAt: new Date()
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
        viewCount: 0
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
    
    // Save to database if connected
    if (dbConnected) {
      try {
        const interaction = new Interaction(interactionData);
        await interaction.save();
      } catch (dbError) {
        console.error('Error saving interaction to database:', dbError);
        // Fall back to in-memory storage
        inMemoryDatabase.addInteraction(interactionData);
      }
    } else {
      // Save to in-memory database
      inMemoryDatabase.addInteraction(interactionData);
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
      } catch (dbError) {
        console.error('Error resetting heatmap data in database:', dbError);
        // Fall back to in-memory storage
        inMemoryDatabase.clearInteractions(websiteId);
      }
    } else {
      // Reset in in-memory database
      inMemoryDatabase.clearInteractions(websiteId);
    }
    
    res.status(200).send('Heatmap data reset');
  } catch (error) {
    console.error('Error resetting heatmap data:', error);
    res.status(500).send('Error resetting heatmap data');
  }
});

// Get website by ID
app.get('/website/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    
    // Try to get from database if connected
    let website = null;
    if (dbConnected) {
      try {
        website = await Website.findOne({ websiteId });
        
        if (website) {
          // Update last accessed time and view count
          website.lastAccessed = new Date();
          website.viewCount += 1;
          await website.save();
        }
      } catch (dbError) {
        console.error('Error retrieving website from database:', dbError);
      }
    }
    
    // If not in database, check in-memory storage
    if (!website) {
      website = inMemoryDatabase.getWebsite(websiteId);
    }
    
    // If still not found, create a mock website for testing
    if (!website) {
      console.log(`Website not found, creating mock for ID: ${websiteId}`);
      website = {
        websiteId,
        previewHtml: `
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
        `,
        createdAt: new Date(),
        lastAccessed: new Date(),
        viewCount: 1
      };
      
      // Save the mock website to in-memory database
      inMemoryDatabase.addWebsite(website);
    }
    
    res.json(website);
  } catch (error) {
    console.error('Error fetching website:', error);
    res.status(500).json({ error: 'Failed to fetch website' });
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
      clickElements: []
    };
    
    // Try to get real stats from database if connected
    if (dbConnected) {
      try {
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
          uniqueVisitors: uniqueVisitors || 0,
          totalClicks: totalClicks || 0,
          averageTimeOnPage: averageTimeOnPage || 0,
          averageScrollDepth: averageScrollDepth || 0,
          visitorsTrend: 5,  // Mock trend values for now
          clicksTrend: 8,
          timeTrend: -3,
          scrollTrend: 12,
          lastActivity: lastActivity || Date.now(),
          clickElements: clickElements || []
        };
      } catch (dbError) {
        console.error('Error retrieving website stats from database:', dbError);
      }
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

// Test analytics page
app.get('/test-analytics', (req, res) => {
  const testId = 'test-' + Math.random().toString(36).substring(2, 10);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Analytics Test Page</title>
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
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>Analytics Test Page</h1>
          <p>This is a test page to verify the analytics system is working correctly.</p>
          <p>Generated test ID: <strong>${testId}</strong></p>
          <p>Click the button below to view analytics for this test page:</p>
          <a href="/analytics?websiteId=${testId}" class="btn" target="_blank">View Analytics</a>
        </div>
      </div>
      <script src="/heatmap-tracker.js"></script>
      <script>
        // Initialize heatmap with the test ID
        initializeHeatmap('${testId}');
        
        // Log that tracking is active
        console.log('Heatmap tracking initialized with ID:', '${testId}');
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

const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
const fs = require('fs');

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

// Configure CORS and middleware
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => { 
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`); 
  next(); 
});

// Fallback for missing static files
app.use((req, res, next) => {
  if (req.method === 'GET' && req.url.includes('.') && !req.url.includes('favicon.ico')) {
    const filePath = path.join(__dirname, 'public', req.url);
    try {
      fs.accessSync(filePath, fs.constants.F_OK);
      next();
    } catch (err) {
      console.log(`Static file not found: ${req.url}`);
      if (req.url === '/style.css') {
        res.setHeader('Content-Type', 'text/css');
        res.send('/* Fallback empty CSS */');
        return;
      }
      next();
    }
  } else {
    next();
  }
});

// Ensure directories exist
const generatedImagesDir = path.join(__dirname, 'public', 'generated-images');
const placeholderImagesDir = path.join(__dirname, 'public', 'placeholder-images');

if (!fs.existsSync(generatedImagesDir)) {
  fs.mkdirSync(generatedImagesDir, { recursive: true });
  console.log('Created directory for generated images');
}

if (!fs.existsSync(placeholderImagesDir)) {
  fs.mkdirSync(placeholderImagesDir, { recursive: true });
  console.log('Created directory for placeholder images');

  // Create simple placeholder files if needed
  const placeholderPath = path.join(placeholderImagesDir, 'placeholder.png');
  if (!fs.existsSync(placeholderPath)) {
    fs.writeFileSync(placeholderPath, 'This is a placeholder image. ');
    fs.writeFileSync(path.join(placeholderImagesDir, 'placeholder1.png'), 'Placeholder 1');
    fs.writeFileSync(path.join(placeholderImagesDir, 'placeholder2.png'), 'Placeholder 2');
    fs.writeFileSync(path.join(placeholderImagesDir, 'placeholder3.png'), 'Placeholder 3');
  }
}

// In-memory database for fallback
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
    const clicks = this.interactions.filter(
      interaction => interaction.websiteId === websiteId && interaction.type === 'click'
    );

    const heatmapData = {};
    clicks.forEach(click => {
      const key = `${click.x},${click.y}`;
      if (!heatmapData[key]) {
        heatmapData[key] = { x: click.x, y: click.y, count: 0 };
      }
      heatmapData[key].count++;
    });

    return Object.values(heatmapData);
  },
  clearInteractions(websiteId) {
    this.interactions = this.interactions.filter(interaction => interaction.websiteId !== websiteId);
    return true;
  }
};

// Optimization cache to prevent frequent optimizations
const optimizationCache = new Map();

// Database connection
let dbConnected = false;

// Connect to MongoDB if DATABASE_URL is provided
async function connectToDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set. Running with in-memory database. ');
    return false;
  }

  try {
    await mongoose.connect(process.env.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    });

    console.log('Connected to MongoDB');
    return true;
  } catch (err) {
    console.error('Could not connect to MongoDB:', err);
    console.warn('Running with in-memory database instead');
    return false;
  }
}

// Initialize database connection
if (process.env.DATABASE_URL) {
  connectToDatabase()
    .then(connected => {
      dbConnected = connected;
      if (dbConnected && websiteService) {
        websiteService.setDatabaseConnection(true);
      }
    })
    .catch(err => {
      console.error('Database connection error:', err);
    });
} else {
  console.warn('DATABASE_URL not set. Running with in-memory database. ');
}

// Import models
const Website = require('./models/website');
const Interaction = require('./models/interaction');

// Fallback (mock) AI service
let mockAIService = {
  enhancePrompt: async (text) => text,
  generateWebsite: async (text) => `
\`\`\`html
<html><body><h1>Sample Website</h1><p>${text}</p></body></html>
\`\`\`

\`\`\`css
body { font-family: Arial, sans-serif; }
\`\`\`

\`\`\`javascript
console.log('Sample website');
\`\`\`
`
};

// Fallback (mock) image service
let mockImageService = {
  generateImage: async () => '/placeholder-images/placeholder.png',
  generateWebsiteImages: async () => [
    '/placeholder-images/placeholder1.png',
    '/placeholder-images/placeholder2.png',
    '/placeholder-images/placeholder3.png'
  ]
};

// Initialize OpenAI
const openaiApiKey = process.env.OPENAI_API_KEY;
let openai = null;
let aiService = mockAIService;

if (openaiApiKey) {
  try {
    openai = new OpenAI({ apiKey: openaiApiKey });
    const AIService = require('./services/ai-service');
    aiService = new AIService(openai);
    console.log('OpenAI API initialized successfully');
  } catch (error) {
    console.error('Error initializing OpenAI:', error);
    console.log('Using mock AI service as fallback');
  }
} else {
  console.warn('OPENAI_API_KEY not set. Using mock AI service. ');
}

// Initialize Hugging Face Image Generation Service
const huggingFaceApiKey = process.env.HUGGING_FACE_API_KEY;
let imageService = mockImageService;

if (huggingFaceApiKey) {
  try {
    const ImageGenerationService = require('./services/ImageGenerationService');
    imageService = new ImageGenerationService(huggingFaceApiKey);
    console.log('Hugging Face Image Generation API initialized');
  } catch (error) {
    console.error('Error initializing Image Generation service:', error);
    console.log('Using mock image service as fallback');
  }
}

// Initialize Website Service
const WebsiteService = require('./services/website-service');
const websiteService = new WebsiteService(aiService, imageService);

if (dbConnected) {
  websiteService.setDatabaseConnection(true);
}

// Helper function: Format markdown to HTML
function formatMarkdown(text) {
  if (!text) return '';

  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\s*[-*]\s+(.*?)$/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n/g, '<br>');
}

// Helper function: Create a complete HTML document with heatmap integration
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
    initializeHeatmap('${websiteId}');
  </script>
</body>
</html>
`;
}

// Helper function: Extract code blocks from an AI response
function extractCodeFromResponse(responseText) {
  const htmlMatch = responseText.match(/```html\s*([\s\S]*?)\s*```/i);
  const cssMatch = responseText.match(/```css\s*([\s\S]*?)\s*```/i);
  const jsMatch = responseText.match(/```javascript\s*([\s\S]*?)\s*```/i) || responseText.match(/```js\s*([\s\S]*?)\s*```/i);

  if (!htmlMatch) {
    throw new Error('Could not extract HTML from the generated content');
  }

  return {
    html: htmlMatch[1].trim(),
    css: cssMatch ? cssMatch[1].trim() : '',
    js: jsMatch ? jsMatch[1].trim() : ''
  };
}

// Helper function: Database operation with retry logic
async function withDatabaseRetry(operation, fallback, maxRetries = 3) {
  if (!dbConnected) {
    return fallback();
  }

  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      console.warn(`Database operation failed (attempt ${attempt + 1}/${maxRetries}):`, err);
      lastError = err;
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, attempt)));
    }
  }

  console.error(`Database operation failed after ${maxRetries} attempts:`, lastError);
  return fallback();
}

// ROUTES

// Enhance Prompt Endpoint
app.post('/enhance-prompt', async (req, res) => {
  try {
    console.log('Received /enhance-prompt request');
    const { rawPrompt } = req.body;

    if (!rawPrompt) {
      return res.status(400).json({ error: 'Raw prompt is required' });
    }

    console.log(`Raw prompt: ${rawPrompt.substring(0, 50)}...`);

    // Call the AI service to enhance the prompt
    const enhancedPrompt = await aiService.enhancePrompt(rawPrompt);
    console.log('Enhanced prompt generated successfully');

    if (!enhancedPrompt) {
      throw new Error('Empty enhanced prompt received from OpenAI');
    }

    res.json({ enhancedPrompt });
  } catch (error) {
    console.error('Error in /enhance-prompt endpoint:', error);
    res.status(500).json({ error: `Failed to enhance prompt: ${error.message}` });
  }
});

// Generate Website Endpoint
app.post('/generate-website', async (req, res) => {
  try {
    console.log('Generate website request received');
    const { enhancedPrompt } = req.body;

    if (!enhancedPrompt) {
      return res.status(400).json({ error: 'Enhanced prompt is required' });
    }

    console.log('Processing website generation');
    const websiteData = await websiteService.generateWebsite(enhancedPrompt);
    console.log(`Website generated with ID: ${websiteData.websiteId}`);

    res.json(websiteData);
  } catch (error) {
    console.error('Error in generate-website endpoint:', error);
    res.status(500).json({ error: 'Failed to generate website', details: error.message });
  }
});

// Track Interaction Endpoint
app.post('/track-interaction', async (req, res) => {
  try {
    const interactionData = { ...req.body, userAgent: req.headers['user-agent'] || 'unknown' };

    const { websiteId, type } = interactionData;

    if (dbConnected) {
      try {
        const interaction = new Interaction(interactionData);
        await interaction.save();

        if (type === 'click') {
          const site = await Website.findOne({ websiteId });
          if (site) {
            site.clickCount = (site.clickCount || 0) + 1;
            await site.save();

            if (site.clickCount % 50 === 0 && !site.isOptimized) {
              console.log(`Optimization threshold reached (${site.clickCount} clicks) for website: ${websiteId}`);

              // Trigger optimization asynchronously
              fetch(`http://localhost:${port}/optimize-ui/${websiteId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              }).catch(error => {
                console.error('Error triggering optimization:', error);
              });
            }
          }
        }
      } catch (dbError) {
        console.error('Error saving interaction to database:', dbError);
        inMemoryDatabase.addInteraction(interactionData);
      }
    } else {
      inMemoryDatabase.addInteraction(interactionData);

      if (type === 'click') {
        const site = inMemoryDatabase.getWebsite(websiteId);
        if (site) {
          site.clickCount = (site.clickCount || 0) + 1;

          if (site.clickCount % 50 === 0 && !site.isOptimized) {
            console.log(`Optimization threshold reached (${site.clickCount} clicks) for website: ${websiteId}`);

            // Trigger optimization asynchronously
            fetch(`http://localhost:${port}/optimize-ui/${websiteId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
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

// Get Heatmap Data Endpoint
app.get('/get-heatmap-data/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    let heatmapData = [];

    if (dbConnected) {
      try {
        heatmapData = await Interaction.aggregate([
          { $match: { type: 'click', websiteId } },
          { $group: { _id: { x: "$x", y: "$y" }, count: { $sum: 1 } } },
          { $project: { x: "$_id.x", y: "$_id.y", count: 1, _id: 0 } }
        ]);
      } catch (dbError) {
        console.error('Error retrieving heatmap data from database:', dbError);
        heatmapData = inMemoryDatabase.getHeatmapData(websiteId);
      }
    } else {
      heatmapData = inMemoryDatabase.getHeatmapData(websiteId);
    }

    res.json(heatmapData);
  } catch (error) {
    console.error('Error retrieving heatmap data:', error);
    res.status(500).send('Error retrieving heatmap data');
  }
});

// Reset Heatmap Data Endpoint
app.post('/reset-heatmap-data/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;

    if (dbConnected) {
      try {
        await Interaction.deleteMany({ websiteId });

        const site = await Website.findOne({ websiteId });
        if (site) {
          site.clickCount = 0;
          await site.save();
        }
      } catch (dbError) {
        console.error('Error resetting heatmap data in database:', dbError);
        inMemoryDatabase.clearInteractions(websiteId);
      }
    } else {
      inMemoryDatabase.clearInteractions(websiteId);

      const site = inMemoryDatabase.getWebsite(websiteId);
      if (site) { site.clickCount = 0; }
    }

    res.status(200).send('Heatmap data reset');
  } catch (error) {
    console.error('Error resetting heatmap data:', error);
    res.status(500).send('Error resetting heatmap data');
  }
});

// UI Optimization Endpoint
app.post('/optimize-ui/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    const { forceOptimize } = req.query;

    // Check optimization cooldown
    const lastOptimized = optimizationCache.get(websiteId);
    const now = Date.now();
    const cooldownPeriod = 30 * 60 * 1000; // 30 minutes cooldown

    if (!forceOptimize && lastOptimized && now - lastOptimized < cooldownPeriod) {
      return res.json({
        message: 'This website was recently optimized. Please wait before optimizing again.',
        alreadyOptimized: true,
        timeRemaining: cooldownPeriod - (now - lastOptimized)
      });
    }

    console.log(`Starting UI optimization for website: ${websiteId}`);

    // Get website data
    let website;
    if (dbConnected) {
      try {
        website = await Website.findOne({ websiteId });
      } catch (dbError) {
        console.error('Database error retrieving website:', dbError);
        website = inMemoryDatabase.getWebsite(websiteId);
      }
    } else {
      website = inMemoryDatabase.getWebsite(websiteId);
    }

    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }

    // Get heatmap data
    let heatmapData = [];
    if (dbConnected) {
      try {
        heatmapData = await Interaction.aggregate([
          { $match: { type: 'click', websiteId } },
          { $group: { _id: { x: "$x", y: "$y" }, count: { $sum: 1 } } },
          { $project: { x: "$_id.x", y: "$_id.y", count: 1, _id: 0 } }
        ]);
      } catch (dbError) {
        console.error('Database error retrieving heatmap data:', dbError);
        heatmapData = inMemoryDatabase.getHeatmapData(websiteId);
      }
    } else {
      heatmapData = inMemoryDatabase.getHeatmapData(websiteId);
    }

    // Get click elements data
    let clickElements = [];
    if (dbConnected) {
      try {
        clickElements = await Interaction.aggregate([
          { $match: { websiteId, type: 'click', path: { $exists: true, $ne: null } } },
          { $group: { _id: "$path", count: { $sum: 1 }, text: { $first: "$elementText" } } },
          { $project: { path: "$_id", count: 1, text: 1, _id: 0 } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]);
      } catch (dbError) {
        console.error('Database error retrieving click elements:', dbError);
        // Get from in-memory database instead
        const clickInteractions = inMemoryDatabase.getInteractions(websiteId)
          .filter(interaction => interaction.type === 'click' && interaction.path);
        
        const pathGroups = {};
        clickInteractions.forEach(interaction => {
          const { path, elementText } = interaction;
          if (!pathGroups[path]) {
            pathGroups[path] = { path, count: 0, text: elementText };
          }
          pathGroups[path].count++;
        });
        
        clickElements = Object.values(pathGroups)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      }
    } else {
      const clickInteractions = inMemoryDatabase.getInteractions(websiteId)
        .filter(interaction => interaction.type === 'click' && interaction.path);
      
      const pathGroups = {};
      clickInteractions.forEach(interaction => {
        const { path, elementText } = interaction;
        if (!pathGroups[path]) {
          pathGroups[path] = { path, count: 0, text: elementText };
        }
        pathGroups[path].count++;
      });
      
      clickElements = Object.values(pathGroups)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    }

    // Validate sufficient data
    if (heatmapData.length < 5 && clickElements.length < 3 && !forceOptimize) {
      return res.json({
        message: 'Not enough interaction data to optimize UI. Need more clicks on different elements.',
        sufficientData: false
      });
    }

    // Use the websiteService to optimize the website
    // This handles all the logic for protected sections
    const optimizationResult = await websiteService.optimizeWebsite(
      websiteId,
      heatmapData,
      clickElements
    );

    // Update the optimization cache
    optimizationCache.set(websiteId, now);

    console.log(`UI optimization completed for website: ${websiteId}`);

    res.json({
      message: 'UI successfully optimized',
      originalWebsiteId: websiteId,
      optimizedWebsiteId: optimizationResult.optimizedWebsiteId
    });
  } catch (error) {
    console.error('Error in optimize-ui endpoint:', error);
    res.status(500).json({
      error: 'Failed to optimize UI',
      details: error.message
    });
  }
});

// API endpoint for getting website data (for analytics dashboard)
app.get('/api/website/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    let website;

    if (dbConnected) {
      website = await Website.findOne({ websiteId });
    } else {
      website = inMemoryDatabase.getWebsite(websiteId);
    }

    if (!website && !websiteId.includes('-optimized-')) {
      let optimizedWebsite;

      if (dbConnected) {
        optimizedWebsite = await Website.findOne({ originalWebsiteId: websiteId, isOptimized: true }).sort({ createdAt: -1 });
      } else {
        const optimizedVersions = inMemoryDatabase.websites
          .filter(site => site.originalWebsiteId === websiteId && site.isOptimized)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        optimizedWebsite = optimizedVersions[0];
      }

      if (optimizedWebsite) {
        return res.json(optimizedWebsite);
      }
    }

    if (!website) {
      console.log(`Website not found for analytics, creating mock for ID: ${websiteId}`);

      const mockHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Demo Website</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; margin: 0; line-height: 1.6; }
    h1 { color: #4361ee; margin-bottom: 1rem; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .btn { display: inline-block; padding: 10px 20px; background: #4361ee; color: white; border-radius: 5px; cursor: pointer; margin: 10px 5px; border: none; font-size: 16px; }
    .content { margin: 20px 0; line-height: 1.6; }
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
    let optimizedWebsite;

    if (dbConnected) {
      optimizedWebsite = await Website.findOne({ originalWebsiteId: websiteId, isOptimized: true }).sort({ createdAt: -1 });
    } else {
      const optimizedVersions = inMemoryDatabase.websites
        .filter(site => site.originalWebsiteId === websiteId && site.isOptimized)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      optimizedWebsite = optimizedVersions[0];
    }

    if (!optimizedWebsite) {
      return res.status(404).json({ message: 'No optimized version found', originalWebsiteId: websiteId });
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
    const { original, format } = req.query; // Optional: original version or JSON format

    const wantsJson = format === 'json' || (req.headers.accept && req.headers.accept.includes('application/json'));

    let website;

    // Try to get the website from database or memory
    if (dbConnected) {
      try {
        website = await Website.findOne({ websiteId });

        if (website) {
          website.lastAccessed = new Date();
          website.viewCount = (website.viewCount || 0) + 1;
          await website.save();
        }
      } catch (dbError) {
        console.error('Database error getting website:', dbError);
      }
    }

    if (!website) {
      website = inMemoryDatabase.getWebsite(websiteId);
      if (website) {
        website.lastAccessed = new Date();
        website.viewCount = (website.viewCount || 0) + 1;
      }
    }

    // Check if we should redirect to optimized version
    if ((!website || original !== 'true') && !websiteId.includes('-optimized-')) {
      let optimizedWebsite;

      if (dbConnected) {
        try {
          optimizedWebsite = await Website.findOne({ originalWebsiteId: websiteId, isOptimized: true }).sort({ createdAt: -1 });
        } catch (dbError) {
          console.error('Database error getting optimized website:', dbError);
        }
      }

      if (!optimizedWebsite) {
        const optimizedVersions = inMemoryDatabase.websites
          .filter(site => site.originalWebsiteId === websiteId && site.isOptimized)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        optimizedWebsite = optimizedVersions[0];
      }

      if (optimizedWebsite) {
        if (wantsJson) {
          return res.json(optimizedWebsite);
        }

        if (original !== 'true') {
          console.log(`Redirecting to optimized version: ${optimizedWebsite.websiteId}`);
          return res.redirect(`/website/${optimizedWebsite.websiteId}`);
        }
      }
    }

    // If website still not found, create a mock
    if (!website) {
      console.log(`Website not found, creating mock for ID: ${websiteId}`);

      const mockHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Demo Website</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; margin: 0; line-height: 1.6; }
    h1 { color: #4361ee; margin-bottom: 1rem; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .btn { display: inline-block; padding: 10px 20px; background: #4361ee; color: white; 
    border-radius: 5px; cursor: pointer; margin: 10px 5px; border: none; font-size: 16px; }
    .btn:hover { background: #3a56d4; }
    .content { margin: 20px 0; line-height: 1.6; }
    p { margin-bottom: 1rem; }
    .optimization-badge { position: fixed; top: 10px; right: 10px; background: rgba(67, 97, 238, 0.9); color: white; padding: 5px 10px; border-radius: 20px; font-size: 12px; z-index: 1000; }
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

      inMemoryDatabase.addWebsite(website);
    }

    if (wantsJson) {
      return res.json(website);
    }

    // Add optimization badge if needed
    let htmlToSend = website.previewHtml;

    if (website.isOptimized && !htmlToSend.includes('optimization-badge')) {
      htmlToSend = htmlToSend.replace('</body>', `
  <div class="optimization-badge">
    <span>✨ Optimized UI</span>
  </div>
</body>
`);
    }

    res.send(htmlToSend);
  } catch (error) {
    console.error('Error serving website:', error);
    if (req.query.format === 'json' || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ error: 'Failed to fetch website', details: error.message });
    }

    // Send a formatted error page
    res.status(500).send(`
<html>
<head>
  <title>Error</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
    .error-container { max-width: 600px; margin: 50px auto; }
    h1 { color: #ef476f; }
    .error-id { font-family: monospace; background: #f0f0f0; padding: 5px; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="error-container">
    <h1>Error Loading Website</h1>
    <p>There was a problem loading the website. Please try again later.</p>
    <p>Error ID: <span class="error-id">${uuidv4().substring(0, 8)}</span></p>
    <p>Error details: ${error.message}</p>
  </div>
</body>
</html>
`);
  }
});

// Get website statistics endpoint
app.get('/website-stats/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    const timeRange = req.query.timeRange || 'week';

    // Default stats structure
    let stats = {
      uniqueVisitors: 0,
      totalClicks: 0,
      averageTimeOnPage: 0,
      averageScrollDepth: 0,
      visitorsTrend: 5,
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

    // Get stats from database if connected
    if (dbConnected) {
      try {
        // Get website info
        const website = await Website.findOne({ websiteId });

        if (website) {
          stats.clickCount = website.clickCount || 0;
          const nextOptimizationThreshold = Math.ceil(stats.clickCount / 50) * 50;
          stats.optimizationStatus.nextOptimizationAt = nextOptimizationThreshold;
        }

        // Count optimized versions
        const optimizedVersionsCount = await Website.countDocuments({ originalWebsiteId: websiteId, isOptimized: true });

        stats.optimizationStatus.optimizedVersions = optimizedVersionsCount;
        stats.optimizationStatus.isOptimized = optimizedVersionsCount > 0;

        // Get unique visitors
        const uniqueVisitors = await Interaction.distinct('sessionId', { websiteId, sessionId: { $exists: true, $ne: null } }).then(sessions => sessions.length);

        // Get total clicks
        const totalClicks = await Interaction.countDocuments({ websiteId, type: 'click' });

        // Get last activity
        const lastActivity = await Interaction.findOne({ websiteId })
          .sort({ timestamp: -1 })
          .then(doc => doc?.timestamp || null);

        // Get time on page data
        const timeData = await Interaction.find({ websiteId, type: 'pageexit', timeSpent: { $exists: true, $ne: null } }).then(docs => docs.map(doc => doc.timeSpent || 0));

        const averageTimeOnPage = timeData.length > 0 ? timeData.reduce((sum, time) => sum + time, 0) / timeData.length / 1000 : 0;

        // Get scroll depth data
        const scrollData = await Interaction.find({ websiteId, type: 'scroll', scrollPercentage: { $exists: true, $ne: null } }).then(docs => docs.map(doc => doc.scrollPercentage || 0));

        const averageScrollDepth = scrollData.length > 0 ? scrollData.reduce((sum, depth) => sum + depth, 0) / scrollData.length : 0;

        // Get most clicked elements
        const clickElements = await Interaction.aggregate([
          { $match: { websiteId, type: 'click', path: { $exists: true, $ne: null } } },
          { $group: { _id: "$path", count: { $sum: 1 }, text: { $first: "$elementText" } } },
          { $project: { path: "$_id", count: 1, text: 1, _id: 0 } },
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
        // Continue with in-memory stats as fallback
      }
    } else {
      // Get stats from in-memory database
      const website = inMemoryDatabase.getWebsite(websiteId);

      if (website) {
        stats.clickCount = website.clickCount || 0;
        const nextOptimizationThreshold = Math.ceil(stats.clickCount / 50) * 50;
        stats.optimizationStatus.nextOptimizationAt = nextOptimizationThreshold;
      }

      // Count optimized versions
      const optimizedVersions = inMemoryDatabase.websites
        .filter(site => site.originalWebsiteId === websiteId && site.isOptimized);

      stats.optimizationStatus.optimizedVersions = optimizedVersions.length;
      stats.optimizationStatus.isOptimized = optimizedVersions.length > 0;

      // Get interactions
      const interactions = inMemoryDatabase.getInteractions(websiteId);

      // Count unique sessions
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

      // Get most clicked elements
      const clickInteractions = interactions.filter(interaction => interaction.type === 'click' && interaction.path);

      const pathGroups = {};
      clickInteractions.forEach(interaction => {
        const { path, elementText } = interaction;
        if (!pathGroups[path]) {
          pathGroups[path] = { path, count: 0, text: elementText };
        }
        pathGroups[path].count++;
      });

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

    // Generate mock click elements if none exist
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

// Compare Websites Endpoint
app.get('/compare-websites/:originalId/:optimizedId', (req, res) => {
  const { originalId, optimizedId } = req.params;

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Website Comparison</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
    .comparison-container { display: flex; height: 100vh; }
    .website-frame { flex: 1; border: none; height: 100%; border-right: 1px solid #ccc; }
    .comparison-header { position: fixed; top: 0; left: 0; right: 0; background: rgba(0,0,0,0.8); color: white; padding: 10px; display: flex; justify-content: space-between; z-index: 1000; }
    .header-section { text-align: center; flex: 1; }
    .header-title { font-weight: bold; margin-bottom: 5px; }
    .toggle-btn { background: #4361ee; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; margin: 0 10px; }
  </style>
</head>
<body>
  <div class="comparison-header">
    <div class="header-section">
      <div class="header-title">Original Version</div>
      <div id="original-id">${originalId}</div>
    </div>
    <div class="header-section">
      <button id="toggleHeatmapBtn" class="toggle-btn">Show Heatmap</button>
      <button id="switchViewBtn" class="toggle-btn">View Full Screen</button>
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
        frames.forEach(frame => {
          frame.style.display = 'block';
          frame.style.flex = '1';
        });
        this.textContent = 'View Full Screen';
      } else if (frames[1].style.flex === '0') {
        frames[0].style.display = 'none';
        frames[1].style.display = 'block';
        frames[1].style.flex = '1';
        this.textContent = 'View Original';
      } else {
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

// Test Analytics Page Endpoint
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
    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #4361ee; }
    .btn { display: inline-block; padding: 10px 20px; background: #4361ee; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
    .click-counter { font-size: 24px; font-weight: bold; margin: 20px 0; }
    .progress-container { width: 100%; background-color: #e0e0e0; border-radius: 4px; margin: 10px 0 20px; }
    .progress-bar { height: 20px; background-color: #4361ee; border-radius: 4px; width: 0%; transition: width 0.3s ease; }
    .action-buttons { display: flex; gap: 10px; margin-top: 20px; }
    .optimize-btn { background: #7209b7; }
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
      <p>Click anywhere on this page to generate interaction data.
After 50 clicks, the system will automatically optimize the UI.</p>
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

    let clickCount = 0;
    const clickCountEl = document.getElementById('clickCount');
    const progressBar = document.getElementById('progressBar');
    const websiteId = '${testId}';

    document.addEventListener('click', function() {
      clickCount++;
      clickCountEl.textContent = clickCount;
      const progress = (clickCount / 50) * 100;
      progressBar.style.width = Math.min(progress, 100) + '%';

      if (clickCount === 50) {
        alert('50 clicks reached! The system will now optimize the UI based on your interactions.');
      }
    });

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
    apiKeyConfigured: !!process.env.OPENAI_API_KEY,
    databaseConnected: dbConnected,
    memoryStats: {
      websites: inMemoryDatabase.websites.length,
      interactions: inMemoryDatabase.interactions.length
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Error handler
app.use((err, req, res, next) => {
  // Generate a unique error ID for tracking
  const errorId = uuidv4().substring(0, 8);

  // Log detailed error information
  console.error(`[Error ${errorId}] Unhandled error:`, {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Determine if we should show detailed errors
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(500).json({
    error: 'Server error',
    errorId: errorId,
    message: isDevelopment ? err.message : 'An unexpected error occurred'
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`OpenAI API Key configured: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`Database connection: ${dbConnected ? 'connected' : 'using in-memory database'}`);
  console.log(`Analytics dashboard available at: http://localhost:${port}/analytics`);
  console.log(`Test page available at: http://localhost:${port}/test-analytics`);
});
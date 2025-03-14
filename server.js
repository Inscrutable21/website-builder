// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3002;

// Enhanced CORS settings for Vercel
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Check if API key is available
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('WARNING: GEMINI_API_KEY is not set. The API endpoints will not work.');
}

// Initialize Gemini client
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

app.post('/enhance-prompt', async (req, res) => {
  try {
    console.log('Enhance prompt request received');
    
    // Check if Gemini client is initialized
    if (!genAI) {
      return res.status(500).json({ error: 'Gemini API key not configured. Please set the GEMINI_API_KEY environment variable.' });
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

    // Get the Gemini model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    // Call the Gemini model
    const result = await model.generateContent(instruction);
    const response = await result.response;
    const enhancedPrompt = response.text();

    console.log('Successfully enhanced prompt');

    if (!enhancedPrompt) {
      throw new Error('Invalid response from Gemini API');
    }

    res.json({ enhancedPrompt });
  } catch (error) {
    console.error('Error in enhance-prompt endpoint:', error);
    res.status(500).json({ error: 'Failed to enhance prompt', details: error.message });
  }
});

app.post('/generate-website', async (req, res) => {
  try {
    console.log('Generate website request received');
    
    // Check if Gemini client is initialized
    if (!genAI) {
      return res.status(500).json({ error: 'Gemini API key not configured. Please set the GEMINI_API_KEY environment variable.' });
    }

    const { enhancedPrompt } = req.body;

    if (!enhancedPrompt) {
      return res.status(400).json({ error: 'Enhanced prompt is required' });
    }

    console.log('Processing website generation');

    // Enhanced instruction for generating visually appealing websites
    const instruction = `
    Create a complete and professional website using HTML, CSS, and JavaScript based on the following enhanced prompt:

    ${enhancedPrompt}

    The website should include the following key features:

    1. A visually appealing layout that is suitable for the type of website being created (e.g., blog, portfolio, e-commerce).
    2. Responsive design to ensure the website functions well on all devices and screen sizes.
    3. Use modern CSS techniques for styling, including flexbox or grid for layout, and appropriate use of colors and typography.
    4. Implement navigation elements that allow users to easily explore different sections of the site.
    5. Include interactive features that enhance user engagement, such as forms, buttons, or animations.
    6. Ensure clean, organized, and well-commented code for all HTML, CSS, and JavaScript files.
    7. Optimize the website for performance and ensure compatibility across different browsers.

    Please provide the complete code as separate HTML, CSS, and JavaScript files.
    Present each file as a separate code block with the appropriate language identifier.
`;


    // Get the Gemini model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    // Call the Gemini model
    const result = await model.generateContent(instruction);
    const response = await result.response;
    const generatedContent = response.text();

    if (!generatedContent) {
      throw new Error('Invalid response from Gemini API');
    }

    console.log('Successfully generated website content');

    // Parse the response to extract HTML, CSS, and JavaScript
    const htmlMatch = generatedContent.match(/```html\s*([\s\S]*?)\s*```/);
    const cssMatch = generatedContent.match(/```css\s*([\s\S]*?)\s*```/);
    const jsMatch = generatedContent.match(/```javascript\s*([\s\S]*?)\s*```/) || generatedContent.match(/```js\s*([\s\S]*?)\s*```/);

    if (!htmlMatch) {
      throw new Error('Could not extract HTML from the generated content');
    }

    // Get the content
    let html = htmlMatch[1];
    const css = cssMatch ? cssMatch[1] : '';
    const js = jsMatch ? jsMatch[1] : '';

    // Create a unique ID for this website (for Vercel we'll just use it for the response)
    const websiteId = uuidv4();
    
    // In Vercel, we'll return the generated code directly instead of saving files
    // Create an HTML file with embedded CSS and JS for preview
    const previewHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${css}</style>
        <title>Generated Website</title>
    </head>
    <body>
        ${html}
        <script>${js}</script>
    </body>
    </html>
    `;

    // Return the generated code
    res.json({
      previewHtml,
      html,
      css,
      js,
      websiteId
    });

  } catch (error) {
    console.error('Error in generate-website endpoint:', error);
    res.status(500).json({ error: 'Failed to generate website', details: error.message });
  }
});


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No content response
});

// Add a test endpoint
app.get('/api-test', (req, res) => {
  res.json({ message: 'Server is working properly', apiKeyConfigured: !!apiKey });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Gemini API Key configured: ${!!apiKey}`);
});

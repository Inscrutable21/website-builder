// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = 3002;

// Create directories for generated websites
const websitesDir = path.join(__dirname, 'generated_websites');
if (!fs.existsSync(websitesDir)) {
  fs.mkdirSync(websitesDir);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/sites', express.static(websitesDir));

// Check if API key is available
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('WARNING: GEMINI_API_KEY is not set. The enhance-prompt endpoint will not work.');
}

// Initialize Gemini client
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

app.post('/enhance-prompt', async (req, res) => {
  try {
    // Check if Gemini client is initialized
    if (!genAI) {
      return res.status(500).json({ error: 'Gemini API key not configured. Please set the GEMINI_API_KEY environment variable.' });
    }

    const { rawPrompt } = req.body;

    if (!rawPrompt) {
      return res.status(400).json({ error: 'Raw prompt is required' });
    }

    console.log('Received prompt:', rawPrompt);

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

    console.log('Sending request to Gemini...');

    // Get the Gemini model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    // Call the Gemini model
    const result = await model.generateContent(instruction);
    const response = await result.response;
    const enhancedPrompt = response.text();

    console.log('Received response from Gemini');

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
    // Check if Gemini client is initialized
    if (!genAI) {
      return res.status(500).json({ error: 'Gemini API key not configured. Please set the GEMINI_API_KEY environment variable.' });
    }

    const { enhancedPrompt } = req.body;

    if (!enhancedPrompt) {
      return res.status(400).json({ error: 'Enhanced prompt is required' });
    }

    console.log('Generating website from enhanced prompt...');

    // Enhanced instruction for the model to create a visually appealing website with animations
    const instruction = `
      Generate a complete, professional static website based on the following content:

      ${enhancedPrompt}

      Create a visually stunning, modern responsive design with these specific requirements:
      1. Use an attractive color scheme with gradients and subtle shadows
      2. Include smooth animations for page elements (fade-ins, slide effects, hover states)
      3. Add micro-interactions to improve user experience
      4. Implement modern CSS features (flexbox/grid layouts, CSS variables, transitions)
      5. Create a visually hierarchical layout with proper whitespace
      6. Add subtle background patterns or shapes for visual interest
      7. Ensure mobile responsiveness with elegant breakpoints
      8. Use modern typography with good readability

      Please provide:
      1. Complete HTML (index.html) - with proper structure, metadata, and content organization
      2. CSS (styles.css) - with all styling including animations, transitions, and responsive design
      3. JavaScript (script.js) - for interactive elements and animation control

      Present each file as a separate code block with the appropriate language identifier.
      The website should be fully functional as a standalone static site with a professional, modern aesthetic.
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

    // Parse the response to extract HTML, CSS, and JavaScript
    const htmlMatch = generatedContent.match(/```html\s*([\s\S]*?)\s*```/);
    const cssMatch = generatedContent.match(/```css\s*([\s\S]*?)\s*```/);
    const jsMatch = generatedContent.match(/```javascript\s*([\s\S]*?)\s*```/) || generatedContent.match(/```js\s*([\s\S]*?)\s*```/);

    if (!htmlMatch) {
      throw new Error('Could not extract HTML from the generated content');
    }

    // Animation library link to include in the head section
    const animateCSSLink = '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css"/>';
    
    // Default animations to add to CSS
    const defaultAnimations = `
/* Default animations and enhancements */
:root {
  --primary-color: #4361ee;
  --secondary-color: #3a0ca3;
  --accent-color: #f72585;
  --text-color: #2b2d42;
  --light-color: #f8f9fa;
  --bg-color: #ffffff;
  --transition-slow: 0.5s ease;
  --transition-medium: 0.3s ease;
  --transition-fast: 0.2s ease;
  --shadow-sm: 0 2px 10px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 5px 20px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 30px rgba(0, 0, 0, 0.1);
}

/* Smooth scrolling for the entire page */
html {
  scroll-behavior: smooth;
}

/* Base animation classes */
.fade-in {
  opacity: 0;
  animation: fadeIn 0.8s ease forwards;
  visibility: hidden;
}

.slide-in-left {
  transform: translateX(-50px);
  opacity: 0;
  animation: slideInLeft 0.8s ease forwards;
  visibility: hidden;
}

.slide-in-right {
  transform: translateX(50px);
  opacity: 0;
  animation: slideInRight 0.8s ease forwards;
  visibility: hidden;
}

.zoom-in {
  transform: scale(0.9);
  opacity: 0;
  animation: zoomIn 0.8s ease forwards;
  visibility: hidden;
}

/* Animation delay classes */
.delay-1 { animation-delay: 0.1s; }
.delay-2 { animation-delay: 0.3s; }
.delay-3 { animation-delay: 0.5s; }
.delay-4 { animation-delay: 0.7s; }

/* Keyframes definitions */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); visibility: visible; }
}

@keyframes slideInLeft {
  to { transform: translateX(0); opacity: 1; visibility: visible; }
}

@keyframes slideInRight {
  to { transform: translateX(0); opacity: 1; visibility: visible; }
}

@keyframes zoomIn {
  to { transform: scale(1); opacity: 1; visibility: visible; }
}

/* Hover effects */
.hover-lift {
  transition: transform var(--transition-medium);
}

.hover-lift:hover {
  transform: translateY(-5px);
}

.hover-shadow {
  transition: box-shadow var(--transition-medium);
}

.hover-shadow:hover {
  box-shadow: var(--shadow-md);
}

/* Button animations */
button, .button {
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
}

button:after, .button:after {
  content: '';
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: -100%;
  background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%);
  transition: left 0.5s ease;
}

button:hover:after, .button:hover:after {
  left: 100%;
}
`;

    // Default JavaScript for animations
    const defaultJS = `
// Animation initialization script
document.addEventListener('DOMContentLoaded', () => {
  // Initialize animations for common elements
  const animateElements = () => {
    // Headers and text elements
    document.querySelectorAll('h1, h2, h3').forEach((el, i) => {
      el.classList.add('fade-in', \`delay-\${i % 4 + 1}\`);
    });
    
    document.querySelectorAll('p, .content-block').forEach((el, i) => {
      el.classList.add('fade-in', \`delay-\${i % 4 + 1}\`);
    });
    
    // Left-side elements
    document.querySelectorAll('.left-content, .image-left, .col-left').forEach((el, i) => {
      el.classList.add('slide-in-left', \`delay-\${i % 4 + 1}\`);
    });
    
    // Right-side elements
    document.querySelectorAll('.right-content, .image-right, .col-right').forEach((el, i) => {
      el.classList.add('slide-in-right', \`delay-\${i % 4 + 1}\`);
    });
    
    // Cards, buttons and interactive elements
    document.querySelectorAll('.card, .feature, .box').forEach((el, i) => {
      el.classList.add('zoom-in', \`delay-\${i % 4 + 1}\`);
      el.classList.add('hover-lift', 'hover-shadow');
    });
    
    document.querySelectorAll('button, .button, .btn').forEach((el) => {
      el.classList.add('hover-lift');
    });
  };
  
  // Initialize intersection observer for revealing animations
  const initObserver = () => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.visibility = 'visible';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    
    // Observe all elements with animation classes
    document.querySelectorAll('.fade-in, .slide-in-left, .slide-in-right, .zoom-in').forEach(el => {
      observer.observe(el);
    });
  };
  
  // Add smooth scrolling to anchor links
  const initSmoothScroll = () => {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        const targetElement = document.querySelector(targetId);
        
        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });
  };
  
  // Initialize everything
  animateElements();
  initObserver();
  initSmoothScroll();
  
  // Add a class to body when page is fully loaded
  window.addEventListener('load', () => {
    document.body.classList.add('page-loaded');
  });
});
`;

    // Process the HTML to add animation library
    let html = htmlMatch[1];
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${animateCSSLink}\n</head>`);
    } else {
      // If no head tag, add a basic one with the animation library
      html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Website</title>
    ${animateCSSLink}
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    ${html}
    <script src="script.js"></script>
</body>
</html>`;
    }

    // Combine generated CSS with default animations
    const css = cssMatch ? cssMatch[1] + defaultAnimations : defaultAnimations;
    
    // Combine generated JS with default animation script
    const js = jsMatch ? jsMatch[1] + '\n' + defaultJS : defaultJS;

    // Create a unique ID for this website
    const websiteId = uuidv4();
    const websiteDir = path.join(websitesDir, websiteId);

    if (!fs.existsSync(websiteDir)) {
      fs.mkdirSync(websiteDir, { recursive: true });
    }

    // Write the files
    fs.writeFileSync(path.join(websiteDir, 'index.html'), html);
    fs.writeFileSync(path.join(websiteDir, 'styles.css'), css);
    fs.writeFileSync(path.join(websiteDir, 'script.js'), js);

    // Create a zip file
    const zipPath = `${websiteDir}.zip`;
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`Website zip created: ${zipPath}`);
    });

    archive.pipe(output);
    archive.directory(websiteDir, false);
    await archive.finalize();

    // URLs for download and view
    const downloadUrl = `/download/${websiteId}`;
    const viewUrl = `/sites/${websiteId}/index.html`;

    // Make the zip file available for download
    app.get(`/download/${websiteId}`, (req, res) => {
      res.download(zipPath, 'website.zip', (err) => {
        if (err) {
          console.error('Download error:', err);
        }
      });
    });

    // Return preview HTML and URLs
    res.json({ previewHtml: html, downloadUrl: downloadUrl, viewUrl: viewUrl });

  } catch (error) {
    console.error('Error in generate-website endpoint:', error);
    res.status(500).json({ error: 'Failed to generate website', details: error.message });
  }
});

// Add a specific route for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add a route for favicon.ico to prevent 404 errors
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

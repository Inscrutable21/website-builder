// services/ImageGenerationService.js
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const { v4: uuidv4 } = require('uuid');

class ImageGenerationService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api-inference.huggingface.co/models';
    this.defaultModel = 'ZB-Tech/Text-to-Image'; // Using the same model as your example
    this.imageSavePath = path.join(process.cwd(), 'public', 'generated-images');
    
    // Create directory for generated images if it doesn't exist
    if (!fs.existsSync(this.imageSavePath)) {
      fs.mkdirSync(this.imageSavePath, { recursive: true });
    }
  }
  
  /**
   * Generate an image based on a prompt
   * @param {string} prompt - The text prompt to generate an image from
   * @param {string} model - Optional model to use
   * @returns {Promise<string>} - Path to the generated image
   */
  async generateImage(prompt, model = this.defaultModel) {
    try {
      console.log(`Generating image for prompt: "${prompt.substring(0, 50)}..."`);
      
      const response = await fetch(`${this.baseUrl}/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: prompt })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to generate image: ${response.status} - ${response.statusText} - ${error}`);
      }
      
      // Get the image data as a blob/buffer
      const imageBuffer = await response.buffer();
      
      // Generate a unique filename
      const filename = `img_${uuidv4()}.png`;
      const imagePath = path.join(this.imageSavePath, filename);
      
      // Save the image to disk
      await writeFile(imagePath, imageBuffer);
      
      // Return the public URL path to the image
      const publicPath = `/generated-images/${filename}`;
      console.log(`Image generated successfully: ${publicPath}`);
      
      return publicPath;
    } catch (error) {
      console.error('Error generating image:', error);
      throw error;
    }
  }
  
  /**
   * Generate multiple images for a website based on content sections
   * @param {string} enhancedPrompt - The enhanced content prompt
   * @param {number} count - Number of images to generate
   * @returns {Promise<string[]>} - Array of image paths
   */
  async generateWebsiteImages(enhancedPrompt, count = 3) {
    try {
      // Extract key themes from the enhanced prompt
      const themes = this.extractThemes(enhancedPrompt);
      
      // Generate specific prompts for each image
      const imagePrompts = this.createImagePrompts(themes, count);
      
      console.log(`Generating ${count} images for website with prompts:`, imagePrompts);
      
      // Generate images sequentially to avoid rate limits
      const imagePaths = [];
      for (const prompt of imagePrompts) {
        try {
          const imagePath = await this.generateImage(prompt);
          imagePaths.push(imagePath);
          
          // Add a small delay between requests to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error generating image for prompt "${prompt}":`, error);
          // Use a placeholder if individual image generation fails
          imagePaths.push('/placeholder-images/placeholder.png');
        }
      }
      
      return imagePaths;
    } catch (error) {
      console.error('Error generating website images:', error);
      // Return placeholder images in case of error
      return Array(count).fill('/placeholder-images/placeholder.png');
    }
  }
  
  /**
   * Extract key themes from the enhanced prompt
   * @param {string} enhancedPrompt - The enhanced content prompt
   * @returns {string[]} - Array of key themes
   */
  extractThemes(enhancedPrompt) {
    // Split by common delimiters and extract potential topics
    const lines = enhancedPrompt.split(/\n|\*\*|\./).filter(line => line.trim().length > 10);
    
    // Take the first few lines as themes (these are likely titles or important sections)
    let themes = lines.slice(0, 5).map(theme => theme.trim());
    
    // If we don't have enough themes, add some generic ones based on the content
    if (themes.length < 3) {
      const fullText = enhancedPrompt.toLowerCase();
      
      // Check for common website types and add appropriate themes
      if (fullText.includes('portfolio') || fullText.includes('resume')) {
        themes.push('professional portfolio showcase');
      }
      if (fullText.includes('product') || fullText.includes('service')) {
        themes.push('product showcase in professional setting');
      }
      if (fullText.includes('blog') || fullText.includes('article')) {
        themes.push('blog content illustration');
      }
      if (fullText.includes('contact') || fullText.includes('about us')) {
        themes.push('business team in modern office');
      }
    }
    
    return themes;
  }
  
  /**
   * Create specific image prompts based on themes
   * @param {string[]} themes - Array of key themes
   * @param {number} count - Number of prompts to create
   * @returns {string[]} - Array of specific image prompts
   */
  createImagePrompts(themes, count) {
    // Style modifiers to create high-quality images
    const styleModifiers = [
      'high quality, detailed, photorealistic',
      'professional photography, 4K, detailed',
      'digital art, vibrant colors, detailed illustration',
      'minimalist design, clean lines, modern aesthetic'
    ];
    
    // Create specific prompts for each image
    const imagePrompts = [];
    
    // Hero image - always use the first theme with enhancements
    if (themes.length > 0) {
      imagePrompts.push(`${themes[0]}, hero image, ${styleModifiers[0]}, website banner, wide format`);
    } else {
      imagePrompts.push('modern business website hero image, professional, ${styleModifiers[0]}');
    }
    
    // Feature/section images
    for (let i = 1; i < count && i < themes.length; i++) {
      const styleIndex = i % styleModifiers.length;
      imagePrompts.push(`${themes[i]}, ${styleModifiers[styleIndex]}`);
    }
    
    // Fill remaining slots with generic website images if needed
    const genericPrompts = [
      'business team collaboration in modern office, professional photography',
      'product showcase in minimalist setting, professional photography',
      'customer service representative helping client, friendly interaction',
      'modern technology devices on clean desk, professional workspace'
    ];
    
    while (imagePrompts.length < count) {
      const index = imagePrompts.length % genericPrompts.length;
      imagePrompts.push(genericPrompts[index]);
    }
    
    return imagePrompts;
  }
}

module.exports = ImageGenerationService;

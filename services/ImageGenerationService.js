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
    
    // Using a more reliable model for image generation
    this.defaultModel = 'stabilityai/stable-diffusion-2';
    
    // Alternative models to try if the default fails
    this.fallbackModels = [
      'runwayml/stable-diffusion-v1-5',
      'CompVis/stable-diffusion-v1-4',
      'prompthero/openjourney'
    ];
    
    this.imageSavePath = path.join(process.cwd(), 'public', 'generated-images');

    // Create directory for generated images if it doesn't exist
    if (!fs.existsSync(this.imageSavePath)) {
      fs.mkdirSync(this.imageSavePath, { recursive: true });
      console.log(`Created directory for generated images: ${this.imageSavePath}`);
    }
    
    // Validate API key
    if (!this.apiKey) {
      console.warn('WARNING: No Hugging Face API key provided. Image generation will not work.');
    } else {
      console.log('Hugging Face API key configured successfully');
    }
  }

  /**
   * Generate an image based on a prompt
   * @param {string} prompt - The text prompt to generate an image from
   * @param {string} model - Optional model to use
   * @returns {Promise<string>} - Path to the generated image
   */
  async generateImage(prompt, model = this.defaultModel) {
    if (!this.apiKey) {
      console.error('No API key provided for image generation');
      return '/placeholder-images/placeholder.png';
    }

    console.log(`Attempting to generate image with model: ${model}`);
    console.log(`Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);

    try {
      // Enhanced prompt for better image quality
      const enhancedPrompt = `${prompt}, high quality, detailed, 4k resolution, professional photography`;
      
      const response = await fetch(`${this.baseUrl}/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          inputs: enhancedPrompt,
          options: {
            wait_for_model: true
          }
        }),
        timeout: 60000 // 60 second timeout
      });

      // Log response status
      console.log(`Image generation API response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error response: ${errorText}`);
        
        if (response.status === 503) {
          console.log('Model is loading. Waiting and trying again...');
          // Wait for 5 seconds and try again
          await new Promise(resolve => setTimeout(resolve, 5000));
          return this.generateImage(prompt, model);
        }
        
        throw new Error(`Failed to generate image: ${response.status} - ${response.statusText}`);
      }

      // Get the image data as a buffer
      const imageBuffer = await response.buffer();
      
      // Check if we actually got an image (should be a decent size)
      if (!imageBuffer || imageBuffer.length < 1000) {
        console.error('Received invalid or empty image data');
        throw new Error('Invalid image data received from API');
      }
      
      console.log(`Received image data: ${imageBuffer.length} bytes`);

      // Generate a unique filename
      const filename = `img_${uuidv4()}.png`;
      const imagePath = path.join(this.imageSavePath, filename);

      // Save the image to disk
      await writeFile(imagePath, imageBuffer);
      console.log(`Image saved to: ${imagePath}`);

      // Return the public URL path to the image
      const publicPath = `/generated-images/${filename}`;
      console.log(`Image generated successfully: ${publicPath}`);

      return publicPath;
    } catch (error) {
      console.error(`Error generating image with model ${model}:`, error);
      
      // Try a fallback model if this one failed
      const fallbackIndex = this.fallbackModels.indexOf(model);
      
      // If we already tried this model or it's not in our fallback list,
      // try the first fallback model
      if (model !== this.defaultModel && fallbackIndex === -1) {
        console.log(`Trying default model instead: ${this.defaultModel}`);
        return this.generateImage(prompt, this.defaultModel);
      }
      
      // Try the next fallback model
      const nextModelIndex = fallbackIndex + 1;
      if (nextModelIndex < this.fallbackModels.length) {
        const nextModel = this.fallbackModels[nextModelIndex];
        console.log(`Trying fallback model: ${nextModel}`);
        return this.generateImage(prompt, nextModel);
      }

      // If all models failed, return a placeholder
      console.error('All image generation models failed. Using placeholder image.');
      return '/placeholder-images/placeholder.png';
    }
  }

  /**
   * Generate multiple images for a website based on content sections
   * @param {string} enhancedPrompt - The enhanced content prompt
   * @param {number} count - Number of images to generate
   * @returns {Promise<string[]>} - Array of image paths
   */
  async generateWebsiteImages(enhancedPrompt, count = 3) {
    console.log(`Generating ${count} images for website based on prompt`);
    
    try {
      // Extract key themes from the enhanced prompt
      const themes = this.extractThemes(enhancedPrompt);
      console.log('Extracted themes:', themes);

      // Create specific prompts for each image
      const imagePrompts = this.createImagePrompts(themes, count);
      console.log('Created image prompts:', imagePrompts);

      // Generate images sequentially to avoid rate limits
      const imagePaths = [];
      let successCount = 0;
      
      for (let i = 0; i < imagePrompts.length; i++) {
        const prompt = imagePrompts[i];
        try {
          console.log(`Generating image ${i+1}/${imagePrompts.length}: "${prompt.substring(0, 50)}..."`);
          
          const imagePath = await this.generateImage(prompt);
          imagePaths.push(imagePath);
          successCount++;
          
          console.log(`Successfully generated image ${i+1}: ${imagePath}`);
          
          // Add a small delay between requests to avoid rate limits
          if (i < imagePrompts.length - 1) {
            console.log('Waiting 2 seconds before next image generation...');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          console.error(`Error generating image ${i+1}:`, error);
          // Use a placeholder if individual image generation fails
          imagePaths.push('/placeholder-images/placeholder.png');
        }
      }

      console.log(`Image generation complete. Success: ${successCount}/${count}`);
      return imagePaths;
    } catch (error) {
      console.error('Error in generateWebsiteImages:', error);
      // Return placeholder images in case of error
      console.log('Using placeholder images due to error');
      return Array(count).fill('/placeholder-images/placeholder.png');
    }
  }

  /**
   * Extract key themes from the enhanced prompt
   * @param {string} enhancedPrompt - The enhanced content prompt
   * @returns {string[]} - Array of key themes
   */
  extractThemes(enhancedPrompt) {
    try {
      // Split by common delimiters and extract potential topics
      const lines = enhancedPrompt.split(/\n|\*\*|\.|:/).filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 8 && trimmed.length < 80;
      });

      // Take the first few lines as themes (these are likely titles or important sections)
      let themes = lines.slice(0, 5)
        .map(theme => theme.trim())
        .filter(theme => !theme.startsWith('http') && !theme.match(/^\d+$/));

      // If we don't have enough themes, add some generic ones based on the content
      if (themes.length < 3) {
        const fullText = enhancedPrompt.toLowerCase();

        const websiteTypes = [
          { keyword: 'portfolio', theme: 'professional portfolio showcase' },
          { keyword: 'resume', theme: 'professional resume design' },
          { keyword: 'product', theme: 'product showcase in professional setting' },
          { keyword: 'service', theme: 'service illustration in business context' },
          { keyword: 'blog', theme: 'blog content illustration' },
          { keyword: 'article', theme: 'article header image' },
          { keyword: 'contact', theme: 'business team in modern office' },
          { keyword: 'about us', theme: 'company team collaboration' },
          { keyword: 'restaurant', theme: 'delicious food photography' },
          { keyword: 'travel', theme: 'scenic landscape photography' },
          { keyword: 'tech', theme: 'modern technology devices' },
          { keyword: 'fashion', theme: 'stylish fashion photography' },
          { keyword: 'health', theme: 'healthy lifestyle imagery' },
          { keyword: 'fitness', theme: 'fitness and workout imagery' },
          { keyword: 'education', theme: 'education and learning environment' }
        ];

        // Add themes based on detected website type
        for (const type of websiteTypes) {
          if (fullText.includes(type.keyword) && !themes.includes(type.theme)) {
            themes.push(type.theme);
            if (themes.length >= 3) break;
          }
        }

        // If still not enough themes, add generic ones
        if (themes.length < 3) {
          const genericThemes = [
            'professional business website hero image',
            'modern website design illustration',
            'digital marketing concept image'
          ];
          
          for (const theme of genericThemes) {
            if (!themes.includes(theme)) {
              themes.push(theme);
              if (themes.length >= 3) break;
            }
          }
        }
      }

      return themes;
    } catch (error) {
      console.error('Error extracting themes:', error);
      return [
        'professional website banner',
        'business concept illustration',
        'digital marketing image'
      ];
    }
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
      'high quality, detailed, photorealistic, professional photography',
      'professional photography, 4K, detailed, sharp focus',
      'digital art, vibrant colors, detailed illustration, professional design',
      'minimalist design, clean lines, modern aesthetic, professional look'
    ];

    // Create specific prompts for each image
    const imagePrompts = [];

    // Hero image - always use the first theme with enhancements
    if (themes.length > 0) {
      imagePrompts.push(`${themes[0]}, hero image, ${styleModifiers[0]}, website banner, wide format, web design`);
    } else {
      imagePrompts.push('modern business website hero image, professional, wide format, web design');
    }

    // Feature/section images
    for (let i = 1; i < count && i < themes.length; i++) {
      const styleIndex = i % styleModifiers.length;
      imagePrompts.push(`${themes[i]}, ${styleModifiers[styleIndex]}, suitable for website`);
    }

    // Fill remaining slots with generic website images if needed
    const genericPrompts = [
      'business team collaboration in modern office, professional photography',
      'product showcase in minimalist setting, professional photography',
      'customer service representative helping client, friendly interaction',
      'modern technology devices on clean desk, professional workspace',
      'creative professional working on computer, side view, office setting',
      'minimalist business concept illustration, clean design',
      'data visualization concept, digital marketing illustration'
    ];

    while (imagePrompts.length < count) {
      const index = imagePrompts.length % genericPrompts.length;
      imagePrompts.push(genericPrompts[index]);
    }

    return imagePrompts;
  }

  /**
   * Check if the API is available
   * @returns {Promise<boolean>} - Whether the API is available
   */
  async checkApiAvailability() {
    if (!this.apiKey) {
      return false;
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/${this.defaultModel}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          inputs: "test",
          options: { wait_for_model: false }
        })
      });
      
      // Even a 503 (model loading) means the API is available
      return response.status !== 401 && response.status !== 403;
    } catch (error) {
      console.error('Error checking API availability:', error);
      return false;
    }
  }
}

module.exports = ImageGenerationService;

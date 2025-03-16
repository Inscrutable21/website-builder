const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
  constructor(apiKey) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  }
  
  async enhancePrompt(rawPrompt) {
    const instruction = `
      Transform the following raw text into a well-structured, professionally formatted document with:
      1. Clear headings and subheadings (using markdown format with ** for headings)
      2. Organized paragraphs
      3. Proper bullet points where appropriate
      4. Maintain all the original information but enhance the presentation
      
      Raw text: ${rawPrompt}
      
      Return only the enhanced formatted text, without any explanations or additional notes.
    `;
    
    const result = await this.model.generateContent(instruction);
    const response = await result.response;
    return response.text();
  }
  
  async generateWebsite(enhancedPrompt) {
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
    
    const result = await this.model.generateContent(instruction);
    const response = await result.response;
    return response.text();
  }
}

module.exports = AIService;

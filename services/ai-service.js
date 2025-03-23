const OpenAI = require('openai');

class AIService {
  constructor(openai) {
    // The openai instance should be passed in, already initialized with your API key.
    this.openai = openai;
    this.model = "gpt-4o-mini";
  }
  
  /**
   * Enhance a raw prompt by formatting it into a well-structured document.
   * @param {string} rawPrompt - The raw text input from the user.
   * @returns {Promise<string>} - Enhanced formatted text.
   */
  async enhancePrompt(rawPrompt) {
    try {
      const instruction = `
Transform the following raw text into a well-structured, professionally formatted document with:
1. Clear headings and subheadings (using markdown format with ** for headings)
2. Organized paragraphs
3. Proper bullet points where appropriate
4. Maintain all the original information but enhance presentation.

Raw text: ${rawPrompt}

Return only the enhanced formatted text, without any explanations or additional notes.
      `;
      console.log("Enhancing prompt. Raw prompt (first 50 chars):", rawPrompt.substring(0, 50));
      
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: "You are a helpful assistant that formats content professionally." },
          { role: "user", content: instruction }
        ],
        temperature: 0.7,
      });
      
      const enhancedText = completion.choices[0].message.content;
      console.log("Enhanced prompt received:", enhancedText.substring(0, 50));
      
      if (!enhancedText) {
        throw new Error("No enhanced text returned from OpenAI");
      }
      return enhancedText;
    } catch (error) {
      console.error("Error in enhancePrompt:", error);
      throw error;
    }
  }
  
  /**
   * Generate a complete website based on the enhanced prompt.
   * @param {string} enhancedPrompt - The enhanced prompt returned by the enhancePrompt function.
   * @returns {Promise<string>} - The generated website content containing code blocks.
   */
  async generateWebsite(enhancedPrompt) {
    try {
      const instruction = `
Create a complete and professional website with a beautiful interface using HTML, CSS, and JavaScript based on the following enhanced prompt:
${enhancedPrompt}

The website should include the following key features:
1. A visually appealing layout that suits the website type (i.e., blog, portfolio, e-commerce).
2. Responsive design that works on all devices.
3. Modern CSS techniques for styling (e.g., flexbox or grid).
4. Navigation elements that facilitate easy exploration.
5. Interactive elements (e.g., forms, buttons, or animations).
6. Clean, organized, and well-commented code.
7. Performance optimization and cross-browser compatibility.

IMPORTANT: If image paths are provided in the prompt, integrate them into appropriate sections such as the hero area, cards, or featured sections.
Return only the optimized HTML, CSS, and JavaScript code as separate code blocks with appropriate language identifiers.
      `;
      
      console.log("Generating website. Enhanced prompt (first 50 chars):", enhancedPrompt.substring(0, 50));
      
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: "You are a skilled web developer who creates beautiful, responsive websites with clean code." },
          { role: "user", content: instruction }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      });
      
      const websiteContent = completion.choices[0].message.content;
      
      console.log("Generated website content received. (first 50 chars):", websiteContent.substring(0, 50));
      
      if (!websiteContent) {
        throw new Error("No website content returned from OpenAI");
      }
      return websiteContent;
    } catch (error) {
      console.error("Error in generateWebsite:", error);
      throw error;
    }
  }
}

module.exports = AIService;

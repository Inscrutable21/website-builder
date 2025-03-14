document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const rawPromptTextarea = document.getElementById('rawPrompt');
  const enhancedPromptDiv = document.getElementById('enhancedPrompt');
  const enhanceBtn = document.getElementById('enhanceBtn');
  const copyBtn = document.getElementById('copyBtn');
  const clearBtn = document.getElementById('clearBtn');
  const loadingIndicator = document.getElementById('loadingIndicator');
  const generateWebsiteBtn = document.getElementById('generateWebsiteBtn');
  const websiteOutput = document.getElementById('websiteOutput');
  const websitePreview = document.getElementById('websitePreview');
  const websiteLoadingIndicator = document.getElementById('websiteLoadingIndicator');
  const downloadWebsiteBtn = document.getElementById('downloadWebsiteBtn');
  const viewWebsiteBtn = document.getElementById('viewWebsiteBtn');
  const closePreviewBtn = document.getElementById('closePreviewBtn');

  // Workflow steps
  const steps = document.querySelectorAll('.step');

  // Get the base API URL (works both locally and on Vercel)
  const API_URL = window.location.origin;

  // Function to update workflow steps
  const updateWorkflowSteps = (activeStep) => {
    steps.forEach(step => {
      const stepNum = parseInt(step.dataset.step);
      step.classList.remove('active', 'completed');

      if (stepNum === activeStep) {
        step.classList.add('active');
      } else if (stepNum < activeStep) {
        step.classList.add('completed');
      }
    });
  };

  // Function to show loading indicator with animation
  const showLoading = (indicator, message) => {
    if (indicator) {
      const messageElement = indicator.querySelector('p');
      if (messageElement && message) {
        messageElement.textContent = message;
      }
      indicator.classList.remove('hidden');

      // Add entrance animation
      indicator.style.animation = 'fadeIn 0.3s ease-out';
    }
  };

  // Function to hide loading indicator with animation
  const hideLoading = (indicator) => {
    if (indicator) {
      // Add exit animation
      indicator.style.animation = 'fadeOut 0.3s ease-out';

      // After animation completes, hide the element
      setTimeout(() => {
        indicator.classList.add('hidden');
      }, 300);
    }
  };

  // Format markdown to HTML
  const formatMarkdown = (text) => {
    return text
      // Headers
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Lists
      .replace(/^\s*[-*]\s+(.*?)$/gm, '<li>$1</li>')
      .replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>')
      // Line breaks
      .replace(/\n/g, '<br>');
  };

  // Clear button functionality
  clearBtn.addEventListener('click', () => {
    rawPromptTextarea.value = '';
    rawPromptTextarea.focus();
  });

  // Enhance button functionality
  enhanceBtn.addEventListener('click', async () => {
    const rawPrompt = rawPromptTextarea.value.trim();

    if (!rawPrompt) {
      // Shake animation for empty input
      rawPromptTextarea.classList.add('shake');
      setTimeout(() => rawPromptTextarea.classList.remove('shake'), 500);
      return;
    }

    // Update workflow step
    updateWorkflowSteps(2);

    // Show loading indicator
    showLoading(loadingIndicator, 'Enhancing your content...');

    // Clear previous content and hide buttons
    enhancedPromptDiv.innerHTML = '';
    copyBtn.classList.add('hidden');
    generateWebsiteBtn.classList.add('hidden');

    try {
      const response = await fetch(`${API_URL}/enhance-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ rawPrompt })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to enhance content');
      }

      const data = await response.json();

      if (!data.enhancedPrompt) {
        throw new Error('No enhanced content received from server');
      }

      // Apply formatting
      const formattedText = formatMarkdown(data.enhancedPrompt);

      // Add entrance animation to the result
      enhancedPromptDiv.style.opacity = '0';
      enhancedPromptDiv.innerHTML = formattedText;

      // Fade in the content
      setTimeout(() => {
        enhancedPromptDiv.style.transition = 'opacity 0.5s ease';
        enhancedPromptDiv.style.opacity = '1';
      }, 100);

      // Show buttons
      copyBtn.classList.remove('hidden');
      generateWebsiteBtn.classList.remove('hidden');

    } catch (error) {
      console.error('Error:', error);
      enhancedPromptDiv.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>Error: ${error.message || 'Failed to enhance content. Please try again.'}</p>
        </div>
      `;
    } finally {
      // Hide loading indicator
      hideLoading(loadingIndicator);
    }
  });

  // Copy button functionality
  copyBtn.addEventListener('click', () => {
    const textToCopy = enhancedPromptDiv.innerText;

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        // Visual feedback
        copyBtn.innerHTML = '<i class="fas fa-check"></i>';
        copyBtn.style.color = 'var(--success-color)';

        setTimeout(() => {
          copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
          copyBtn.style.color = '';
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy:', err);

        // Error feedback
        copyBtn.innerHTML = '<i class="fas fa-times"></i>';
        copyBtn.style.color = 'var(--danger-color)';

        setTimeout(() => {
          copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
          copyBtn.style.color = '';
        }, 2000);
      });
  });

  // Generate website functionality
  generateWebsiteBtn.addEventListener('click', async () => {
    // Update workflow step
    updateWorkflowSteps(3);

    // Show loading indicator
    showLoading(websiteLoadingIndicator, 'Crafting your beautiful website...');

    // Make sure website output is visible but show loading state
    websiteOutput.classList.remove('hidden');
    websitePreview.innerHTML = '';

    try {
      const enhancedPrompt = enhancedPromptDiv.innerText;

      const response = await fetch(`${API_URL}/generate-website`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enhancedPrompt })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate website');
      }

      const data = await response.json();

      // If there's a preview HTML, display it in an iframe
      if (data.previewHtml) {
        // Create iframe with fade-in effect
        websitePreview.innerHTML = `<iframe srcdoc="${data.previewHtml.replace(/"/g, '&quot;')}" style="width:100%;height:100%;border:none;opacity:0;transition:opacity 0.5s ease;"></iframe>`;

        // Fade in the iframe once loaded
        const iframe = websitePreview.querySelector('iframe');
        iframe.onload = () => {
          iframe.style.opacity = '1';
        };
      }

      // Set up download functionality for generated code
      if (data.html && data.css && data.js) {
        downloadWebsiteBtn.onclick = () => {
          // Create a zip file in the browser using JSZip
          const JSZip = window.JSZip;
          if (typeof JSZip !== 'undefined') {
            const zip = new JSZip();
            
            // Add files to the zip
            zip.file("index.html", data.html);
            zip.file("styles.css", data.css);
            zip.file("script.js", data.js);
            
            // Generate the zip file
            zip.generateAsync({type:"blob"})
              .then(function(content) {
                // Create a download link
                const downloadLink = document.createElement('a');
                downloadLink.href = URL.createObjectURL(content);
                downloadLink.download = "website.zip";
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
              });
          } else {
            alert("JSZip library not loaded. Please try again later.");
          }
        };
        
        // Enable download button
        downloadWebsiteBtn.disabled = false;
      }

      // Set up view button if there's a direct URL available
      if (data.viewUrl) {
        viewWebsiteBtn.onclick = () => {
          window.open(data.viewUrl, '_blank');
        };
        viewWebsiteBtn.disabled = false;
      } else {
        // If no direct URL, disable the view button
        viewWebsiteBtn.disabled = true;
      }

    } catch (error) {
      console.error('Error:', error);
      websitePreview.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Error: ${error.message || 'Failed to generate website. Please try again.'}</p>
        </div>
      `;
      
      // Disable buttons on error
      downloadWebsiteBtn.disabled = true;
      viewWebsiteBtn.disabled = true;
    } finally {
      // Hide loading indicator
      hideLoading(websiteLoadingIndicator);
    }
  });

  // Close preview button
  closePreviewBtn.addEventListener('click', () => {
    websiteOutput.classList.add('hidden');
  });

  // Add placeholder text animation
  const placeholderText = "Enter your content here... We'll transform it into a structured, beautiful website.";
  let currentPlaceholder = "";
  let placeholderIndex = 0;

  function animatePlaceholder() {
    if (placeholderIndex <= placeholderText.length) {
      currentPlaceholder = placeholderText.substring(0, placeholderIndex);
      rawPromptTextarea.setAttribute('placeholder', currentPlaceholder);
      placeholderIndex++;
      setTimeout(animatePlaceholder, 50);
    } else {
      // Reset after a delay
      setTimeout(() => {
        placeholderIndex = 0;
        animatePlaceholder();
      }, 5000);
    }
  }

  // Start the placeholder animation
  animatePlaceholder();

  // Focus the input textarea on load
  rawPromptTextarea.focus();
  
  // Load JSZip library for client-side zip generation
  if (typeof JSZip === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    document.head.appendChild(script);
  }
});

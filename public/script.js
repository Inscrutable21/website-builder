document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements with null checks
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
  const viewAnalyticsBtn = document.getElementById('viewAnalyticsBtn');
  const closePreviewBtn = document.getElementById('closePreviewBtn');

  // Store the current website ID
  let currentWebsiteId = null;
  let optimizedWebsiteId = null;

  // Workflow steps
  const steps = document.querySelectorAll('.step');

  // Function to update workflow steps
  const updateWorkflowSteps = (activeStep) => {
    if (!steps || steps.length === 0) return;
    
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
    if (!indicator) return;
    
    const messageElement = indicator.querySelector('p');
    if (messageElement && message) {
      messageElement.textContent = message;
    }
    indicator.classList.remove('hidden');
    
    // Add entrance animation
    indicator.style.animation = 'fadeIn 0.3s ease-out';
  };

  // Function to hide loading indicator with animation
  const hideLoading = (indicator) => {
    if (!indicator) return;
    
    // Add exit animation
    indicator.style.animation = 'fadeOut 0.3s ease-out';
    
    // After animation completes, hide the element
    setTimeout(() => {
      indicator.classList.add('hidden');
    }, 300);
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
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (rawPromptTextarea) {
        rawPromptTextarea.value = '';
        rawPromptTextarea.focus();
      }
    });
  }

  // Enhance button functionality
  if (enhanceBtn) {
    enhanceBtn.addEventListener('click', async () => {
      if (!rawPromptTextarea || !enhancedPromptDiv) return;
      
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
      if (loadingIndicator) {
        showLoading(loadingIndicator, 'Enhancing your content...');
      }

      // Clear previous content and hide buttons
      enhancedPromptDiv.innerHTML = '';
      if (copyBtn) copyBtn.classList.add('hidden');
      if (generateWebsiteBtn) generateWebsiteBtn.classList.add('hidden');

      try {
        const response = await fetch('/enhance-prompt', {
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
        if (copyBtn) copyBtn.classList.remove('hidden');
        if (generateWebsiteBtn) generateWebsiteBtn.classList.remove('hidden');

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
        if (loadingIndicator) {
          hideLoading(loadingIndicator);
        }
      }
    });
  }

  // Copy button functionality
  if (copyBtn && enhancedPromptDiv) {
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
  }

  // Generate website functionality
  if (generateWebsiteBtn && enhancedPromptDiv) {
    generateWebsiteBtn.addEventListener('click', async () => {
      // Update workflow step
      updateWorkflowSteps(3);

      // Show loading indicator
      if (websiteLoadingIndicator) {
        showLoading(websiteLoadingIndicator, 'Crafting your beautiful website...');
      }

      // Make sure website output is visible but show loading state
      if (websiteOutput) websiteOutput.classList.remove('hidden');
      if (websitePreview) websitePreview.innerHTML = '';

      try {
        const enhancedPrompt = enhancedPromptDiv.innerText;

        const response = await fetch('/generate-website', {
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
        
        // Store the website ID for later use
        currentWebsiteId = data.websiteId;

        // If there's a preview HTML, display it in an iframe
        if (data.previewHtml && websitePreview) {
          // Create iframe with fade-in effect
          websitePreview.innerHTML = `<iframe srcdoc="${data.previewHtml.replace(/"/g, '&quot;')}" style="width:100%;height:100%;border:none;opacity:0;transition:opacity 0.5s ease;"></iframe>`;

          // Fade in the iframe once loaded
          const iframe = websitePreview.querySelector('iframe');
          if (iframe) {
            iframe.onload = () => {
              iframe.style.opacity = '1';
            };
          }
        }

        // Setup download button functionality
        if (downloadWebsiteBtn) {
          downloadWebsiteBtn.onclick = () => {
            // Create a Blob with the HTML content
            const htmlBlob = new Blob([data.html], { type: 'text/html' });
            const cssBlob = new Blob([data.css], { type: 'text/css' });
            const jsBlob = new Blob([data.js], { type: 'text/javascript' });

            // Create download links for each file
            const htmlUrl = URL.createObjectURL(htmlBlob);
            const cssUrl = URL.createObjectURL(cssBlob);
            const jsUrl = URL.createObjectURL(jsBlob);

            // Create temporary anchor element to trigger download
            const downloadLink = document.createElement('a');

            // Download HTML file
            downloadLink.href = htmlUrl;
            downloadLink.download = 'index.html';
            document.body.appendChild(downloadLink);
            downloadLink.click();

            // Download CSS file (if exists)
            if (data.css) {
              setTimeout(() => {
                downloadLink.href = cssUrl;
                downloadLink.download = 'styles.css';
                downloadLink.click();
              }, 100);
            }

            // Download JS file (if exists)
            if (data.js) {
              setTimeout(() => {
                downloadLink.href = jsUrl;
                downloadLink.download = 'script.js';
                downloadLink.click();
              }, 200);
            }

            // Clean up
            setTimeout(() => {
              document.body.removeChild(downloadLink);
              URL.revokeObjectURL(htmlUrl);
              URL.revokeObjectURL(cssUrl);
              URL.revokeObjectURL(jsUrl);
            }, 300);
          };
        }

        // Setup view button functionality
        if (viewWebsiteBtn) {
          viewWebsiteBtn.onclick = () => {
            const newTab = window.open('', '_blank');
            if (newTab) {
              newTab.document.write(data.previewHtml);
              newTab.document.close();
            }
          };
        }
        
        // Setup analytics button functionality
        if (viewAnalyticsBtn) {
          viewAnalyticsBtn.onclick = () => {
            if (currentWebsiteId) {
              window.open(`/analytics?websiteId=${currentWebsiteId}`, '_blank');
            } else {
              alert('Website ID not available. Please regenerate the website.');
            }
          };
        }
        
        // Add optimization controls after website is generated
        setTimeout(() => {
          addOptimizationControls();
        }, 500);

      } catch (error) {
        console.error('Error:', error);
        if (websitePreview) {
          websitePreview.innerHTML = `
            <div class="error-message">
              <i class="fas fa-exclamation-triangle"></i>
              <p>Error: ${error.message || 'Failed to generate website. Please try again.'}</p>
            </div>
          `;
        }
      } finally {
        // Hide loading indicator
        if (websiteLoadingIndicator) {
          hideLoading(websiteLoadingIndicator);
        }
      }
    });
  }

  // Close preview button
  if (closePreviewBtn && websiteOutput) {
    closePreviewBtn.addEventListener('click', () => {
      websiteOutput.classList.add('hidden');
    });
  }

  // Add placeholder text animation
  if (rawPromptTextarea) {
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
  }
  
  // UI Optimization Functions
  function addOptimizationControls() {
    // Check if preview footer exists
    const previewFooter = document.querySelector('.preview-footer');
    if (!previewFooter) {
      console.warn('Preview footer not found, cannot add optimization controls');
      return;
    }
    
    // Create optimization controls container
    const optimizationControls = document.createElement('div');
    optimizationControls.className = 'optimization-controls';
    optimizationControls.innerHTML = `
      <h3><i class="fas fa-magic"></i> UI Optimization</h3>
      <p class="optimization-status">Analyzing user interactions to improve UI...</p>
      <div class="optimization-actions">
        <button id="checkOptimizationBtn" class="action-btn">
          <i class="fas fa-sync"></i> Check for Optimizations
        </button>
        <button id="forceOptimizeBtn" class="action-btn" style="display: none;">
          <i class="fas fa-bolt"></i> Force Optimize Now
        </button>
        <button id="viewOptimizedBtn" class="action-btn" style="display: none;">
          <i class="fas fa-eye"></i> View Optimized Version
        </button>
        <button id="compareVersionsBtn" class="action-btn" style="display: none;">
          <i class="fas fa-columns"></i> Compare Versions
        </button>
      </div>
      <div id="optimizationMessage" class="optimization-message"></div>
    `;
    
    // Add to website preview footer
    previewFooter.appendChild(optimizationControls);
    
    // Add event listeners with null checks
    const checkOptimizationBtn = document.getElementById('checkOptimizationBtn');
    if (checkOptimizationBtn) {
      checkOptimizationBtn.addEventListener('click', checkForOptimizations);
    }
    
    const forceOptimizeBtn = document.getElementById('forceOptimizeBtn');
    if (forceOptimizeBtn) {
      forceOptimizeBtn.addEventListener('click', forceOptimizeUI);
    }
    
    const viewOptimizedBtn = document.getElementById('viewOptimizedBtn');
    if (viewOptimizedBtn) {
      viewOptimizedBtn.addEventListener('click', viewOptimizedVersion);
    }
    
    const compareVersionsBtn = document.getElementById('compareVersionsBtn');
    if (compareVersionsBtn) {
      compareVersionsBtn.addEventListener('click', compareVersions);
    }
  }

  async function checkForOptimizations() {
    if (!currentWebsiteId) {
      showOptimizationMessage('No website generated yet. Please generate a website first.', 'error');
      return;
    }
    
    showOptimizationMessage('Checking for optimization opportunities...', 'info');
    
    try {
      // Check if an optimized version exists
      const response = await fetch(`/optimized-website/${currentWebsiteId}`);
      
      if (response.ok) {
        // Optimized version exists
        const data = await response.json();
        
        showOptimizationMessage(
          `An optimized version of this website is available! It was created based on user interaction data.`,
          'success'
        );
        
        // Show buttons to view and compare
        const viewOptimizedBtn = document.getElementById('viewOptimizedBtn');
        const compareVersionsBtn = document.getElementById('compareVersionsBtn');
        
        if (viewOptimizedBtn) viewOptimizedBtn.style.display = 'inline-block';
        if (compareVersionsBtn) compareVersionsBtn.style.display = 'inline-block';
        
        // Store the optimized website ID
        optimizedWebsiteId = data.websiteId;
      } else if (response.status === 404) {
        // No optimized version yet
        showOptimizationMessage(
          `No optimized version available yet. The system will automatically optimize the UI once enough user interaction data is collected.`,
          'info'
        );
        
        // Show force optimize button
        const forceOptimizeBtn = document.getElementById('forceOptimizeBtn');
        if (forceOptimizeBtn) forceOptimizeBtn.style.display = 'inline-block';
      } else {
        throw new Error('Failed to check for optimizations');
      }
    } catch (error) {
      console.error('Error checking for optimizations:', error);
      showOptimizationMessage(`Error: ${error.message}`, 'error');
    }
  }

  async function forceOptimizeUI() {
    if (!currentWebsiteId) {
      showOptimizationMessage('No website generated yet. Please generate a website first.', 'error');
      return;
    }
    
    showOptimizationMessage('Optimizing UI based on user interactions... This may take a minute.', 'info');
    
    try {
      const response = await fetch(`/optimize-ui/${currentWebsiteId}?forceOptimize=true`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to optimize UI');
      }
      
      const data = await response.json();
      
      if (data.optimizedWebsiteId) {
        showOptimizationMessage(
          `UI successfully optimized! The new version prioritizes elements that users interact with most.`,
          'success'
        );
        
        // Store the optimized website ID
        optimizedWebsiteId = data.optimizedWebsiteId;
        
        // Show buttons to view and compare
        const viewOptimizedBtn = document.getElementById('viewOptimizedBtn');
        const compareVersionsBtn = document.getElementById('compareVersionsBtn');
        const forceOptimizeBtn = document.getElementById('forceOptimizeBtn');
        
        if (viewOptimizedBtn) viewOptimizedBtn.style.display = 'inline-block';
        if (compareVersionsBtn) compareVersionsBtn.style.display = 'inline-block';
        if (forceOptimizeBtn) forceOptimizeBtn.style.display = 'none';
      } else {
        showOptimizationMessage(data.message, 'info');
      }
    } catch (error) {
      console.error('Error optimizing UI:', error);
      showOptimizationMessage(`Error: ${error.message}`, 'error');
    }
  }

  function viewOptimizedVersion() {
    if (!optimizedWebsiteId) {
      showOptimizationMessage('No optimized version available', 'error');
      return;
    }
    
    // Open the optimized version in a new tab
    window.open(`/website/${optimizedWebsiteId}`, '_blank');
  }

  function compareVersions() {
    if (!currentWebsiteId || !optimizedWebsiteId) {
      showOptimizationMessage('Both original and optimized versions are required for comparison', 'error');
      return;
    }
    
    // Open the comparison page in a new tab
    window.open(`/compare-websites/${currentWebsiteId}/${optimizedWebsiteId}`, '_blank');
  }

  function showOptimizationMessage(message, type) {
    const messageElement = document.getElementById('optimizationMessage');
    if (messageElement) {
      messageElement.textContent = message;
      messageElement.className = `optimization-message ${type}`;
    }
  }
});

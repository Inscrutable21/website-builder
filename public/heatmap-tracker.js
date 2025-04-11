// heatmap-tracker.js - Complete implementation
function initializeHeatmap(siteId) {
  if (!siteId) {
    console.error('Website ID is required for heatmap tracking');
    return;
  }
  
  const websiteId = siteId;
  const sessionId = getOrCreateSessionId();
  let heatmapInstance = null;
  let isHeatmapVisible = false;
  const pageLoadTime = Date.now();
  
  // Track page load
  trackEvent('pageview');
  
  // Set up event listeners
  document.addEventListener('click', handleClick, true);
  document.addEventListener('scroll', throttle(handleScroll, 500), { passive: true });
  window.addEventListener('beforeunload', handlePageExit);
  
  // Add heatmap toggle shortcut (Ctrl+Shift+H)
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'H') {
      toggleHeatmap();
      e.preventDefault();
    }
  });
  
  // Initialize heatmap visualization
  function initHeatmapVisualization() {
    if (typeof h337 === 'undefined') {
      console.error('Heatmap.js library not loaded');
      return;
    }
    
    const container = document.getElementById('heatmapContainer');
    if (!container) {
      console.error('Heatmap container not found');
      return;
    }
    
    heatmapInstance = h337.create({
      container: container,
      radius: 30,
      maxOpacity: 0.6,
      minOpacity: 0,
      blur: 0.8
    });
    
    // Load existing heatmap data
    loadHeatmapData();
  }
  
  // Load heatmap data from server
  function loadHeatmapData() {
    fetch(`/get-heatmap-data/${websiteId}`)
      .then(response => response.json())
      .then(data => {
        if (data && data.length) {
          // Convert to heatmap.js format
          const points = data.map(point => ({
            x: Math.round(point.x * window.innerWidth),
            y: Math.round(point.y * window.innerHeight),
            value: point.count
          }));
          
          heatmapInstance.setData({
            max: Math.max(...data.map(p => p.count)),
            data: points
          });
        }
      })
      .catch(error => console.error('Error loading heatmap data:', error));
  }
  
  // Toggle heatmap visibility
  function toggleHeatmap() {
    if (!heatmapInstance) {
      initHeatmapVisualization();
    }
    
    const container = document.getElementById('heatmapContainer');
    if (container) {
      isHeatmapVisible = !isHeatmapVisible;
      container.style.display = isHeatmapVisible ? 'block' : 'none';
    }
  }
  
  // Handle click events
  function handleClick(event) {
    // Get viewport-relative coordinates (normalized between 0-1)
    const x = event.clientX / window.innerWidth;
    const y = event.clientY / window.innerHeight;
    
    // Get element path
    const path = event.composedPath();
    const targetElement = path[0];
    const elementPath = generateElementPath(targetElement);
    const elementText = (targetElement.innerText || targetElement.textContent || '').trim().substring(0, 100);
    
    // Track the click
    trackEvent('click', {
      x,
      y,
      path: elementPath,
      elementText,
      pageX: event.pageX,
      pageY: event.pageY
    });
    
    // Update the heatmap visualization if visible
    if (isHeatmapVisible && heatmapInstance) {
      heatmapInstance.addData({
        x: event.clientX,
        y: event.clientY,
        value: 1
      });
    }
  }
  
  // Generate a unique CSS selector path for an element
  function generateElementPath(element) {
    if (!element || element === document.body) return 'body';
    
    let path = element.tagName.toLowerCase();
    
    // Add id if it exists
    if (element.id) {
      return `${path}#${element.id}`;
    }
    
    // Add classes
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).join('.');
      if (classes) {
        path += `.${classes}`;
      }
    }
    
    // Add position among siblings for better specificity
    const parent = element.parentNode;
    if (parent && parent.children.length > 1) {
      const siblings = Array.from(parent.children).filter(el => 
        el.tagName === element.tagName
      );
      
      if (siblings.length > 1) {
        const index = siblings.indexOf(element) + 1;
        path += `:nth-of-type(${index})`;
      }
    }
    
    // Limit the path depth to avoid overly complex selectors
    if (element.parentNode && element.parentNode !== document.body && element.parentNode !== document.documentElement) {
      const parentPath = generateElementPath(element.parentNode);
      if (parentPath.split('>').length < 4) { // Limit to 3 levels deep
        return `${parentPath} > ${path}`;
      }
    }
    
    return path;
  }
  
  // Handle scroll events
  function handleScroll() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    const scrollPercentage = (scrollTop / (scrollHeight - clientHeight)) * 100;
    
    trackEvent('scroll', {
      scrollTop,
      scrollPercentage: Math.min(100, Math.max(0, scrollPercentage))
    });
  }
  
  // Handle page exit
  function handlePageExit() {
    const timeSpent = Date.now() - pageLoadTime;
    trackEvent('pageexit', { timeSpent });
  }
  
  // Generic event tracking function
  function trackEvent(type, data = {}) {
    fetch('/track-interaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        websiteId,
        sessionId,
        type,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        ...data
      }),
      // Use keepalive for beforeunload events
      keepalive: type === 'pageexit'
    }).catch(error => console.error(`Error tracking ${type}:`, error));
  }
  
  // Helper function to throttle events
  function throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
  
  // Session management
  function getOrCreateSessionId() {
    let sessionId = localStorage.getItem(`heatmap_session_${websiteId}`);
    if (!sessionId) {
      sessionId = generateUUID();
      localStorage.setItem(`heatmap_session_${websiteId}`, sessionId);
    }
    return sessionId;
  }
  
  // Generate UUID for session tracking
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  // Add heatmap toggle button
  const toggleButton = document.createElement('button');
  toggleButton.textContent = 'Toggle Heatmap';
  toggleButton.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:10000;background:#4361ee;color:white;border:none;padding:8px 12px;border-radius:4px;cursor:pointer;opacity:0.7;';
  toggleButton.addEventListener('click', toggleHeatmap);
  document.body.appendChild(toggleButton);
  
  // Initialize if heatmap.js is available
  if (typeof h337 !== 'undefined') {
    // Wait for DOM to be fully loaded
    if (document.readyState === 'complete') {
      initHeatmapVisualization();
    } else {
      window.addEventListener('load', initHeatmapVisualization);
    }
  } else {
    console.warn('Heatmap.js not available, visualization disabled');
  }
  
  // Expose API
  window.heatmapAPI = {
    toggle: toggleHeatmap,
    reset: function() {
      fetch(`/reset-heatmap-data/${websiteId}`, { method: 'POST' })
        .then(() => {
          if (heatmapInstance) {
            heatmapInstance.setData({ max: 0, data: [] });
          }
          console.log('Heatmap data reset');
        })
        .catch(error => console.error('Error resetting heatmap data:', error));
    }
  };
}

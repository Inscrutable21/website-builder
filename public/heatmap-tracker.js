function initializeHeatmap(websiteId) {
    // Wait for heatmap.js to load
    if (typeof h337 === 'undefined') {
      console.error('Heatmap.js library not loaded! Attempting to load it now...');
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/heatmap.js/2.0.2/heatmap.min.js';
      script.onload = () => initializeHeatmapCore(websiteId);
      script.onerror = () => {
        console.error('Failed to load heatmap.js library.');
      };
      document.head.appendChild(script);
      return;
    }
    
    initializeHeatmapCore(websiteId);
  }
  
  function initializeHeatmapCore(websiteId) {
    // Optimize canvas performance
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attributes) {
      if (type === '2d') {
        attributes = attributes || {};
        attributes.willReadFrequently = true;
      }
      return originalGetContext.call(this, type, attributes);
    };
  
    // Get or create heatmap container
    let heatmapContainer = document.getElementById('heatmapContainer');
    if (!heatmapContainer) {
      heatmapContainer = document.createElement('div');
      heatmapContainer.id = 'heatmapContainer';
      heatmapContainer.style.width = '100%';
      heatmapContainer.style.height = '100%';
      heatmapContainer.style.position = 'absolute';
      heatmapContainer.style.top = '0';
      heatmapContainer.style.left = '0';
      heatmapContainer.style.zIndex = '9999';
      heatmapContainer.style.pointerEvents = 'none';
      heatmapContainer.style.display = 'none';
      document.body.appendChild(heatmapContainer);
    }
    
    // Initialize heatmap instance
    const heatmapInstance = h337.create({
      container: heatmapContainer,
      radius: 30,
      maxOpacity: 0.6,
      minOpacity: 0,
      blur: 0.75
    });
    
    // Create a session ID for this visit
    const sessionId = generateSessionId();
    
    // Local storage for clicks when offline
    let interactionData = [];
    
    // Throttle function to limit how often a function can be called
    function throttle(callback, delay) {
      let lastCall = 0;
      return function(...args) {
        const now = Date.now();
        if (now - lastCall >= delay) {
          lastCall = now;
          callback(...args);
        }
      };
    }
    
    // Function to record clicks
    function recordClick(event) {
      const clickPoint = {
        websiteId: websiteId,
        x: event.pageX,
        y: event.pageY,
        value: 1, // Default heat value
        timestamp: Date.now(),
        type: 'click',
        sessionId: sessionId,
        path: getElementPath(event.target),
        elementText: getElementText(event.target)
      };
      
      // Add to local storage
      interactionData.push(clickPoint);
      
      // Send to server
      sendToServer(clickPoint);
      
      // Update local heatmap visualization
      heatmapInstance.addData({
        x: clickPoint.x,
        y: clickPoint.y,
        value: clickPoint.value
      });
    }
    
    // Function to record mouse movements (throttled)
    const recordMouseMove = throttle(function(event) {
      const movePoint = {
        websiteId: websiteId,
        x: event.pageX,
        y: event.pageY,
        value: 0.2, // Lower heat value for movements
        timestamp: Date.now(),
        type: 'movement',
        sessionId: sessionId
      };
      
      // Only add to local storage occasionally (1 in 10)
      if (Math.random() < 0.1) {
        interactionData.push(movePoint);
        sendToServer(movePoint);
      }
      
      // Update local heatmap visualization
      heatmapInstance.addData({
        x: movePoint.x,
        y: movePoint.y,
        value: movePoint.value
      });
    }, 100); // Throttle to once every 100ms
    
    // Function to record scroll depth
    const recordScroll = throttle(function() {
      const scrollDepth = window.scrollY + window.innerHeight;
      const scrollPercentage = (scrollDepth / document.body.scrollHeight) * 100;
      
      const scrollPoint = {
        websiteId: websiteId,
        scrollDepth: scrollDepth,
        scrollPercentage: scrollPercentage,
        timestamp: Date.now(),
        type: 'scroll',
        sessionId: sessionId
      };
      
      // Only record significant scroll changes (every 10%)
      const roundedPercentage = Math.round(scrollPercentage / 10) * 10;
      
      // Use a Set to avoid duplicate scroll percentages
      if (!window.recordedScrollPercentages) {
        window.recordedScrollPercentages = new Set();
      }
      
      if (!window.recordedScrollPercentages.has(roundedPercentage)) {
        window.recordedScrollPercentages.add(roundedPercentage);
        sendToServer(scrollPoint);
      }
    }, 200); // Throttle to once every 200ms
    
    // Function to send data to server
    function sendToServer(data) {
      fetch('/track-interaction', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json'
        }
      }).catch(error => {
        console.error('Error sending data to server:', error);
      });
    }
    
    // Function to get element path for better analytics
    function getElementPath(element) {
      if (!element || !element.tagName) return '';
      
      let path = element.tagName.toLowerCase();
      
      if (element.id) {
        path += `#${element.id}`;
      } else if (element.className && typeof element.className === 'string') {
        path += `.${element.className.split(' ').join('.')}`;
      }
      
      return path;
    }
    
    // Function to get element text content (truncated)
    function getElementText(element) {
      if (!element) return '';
      
      const text = element.textContent || element.innerText || '';
      return text.trim().substring(0, 50);
    }
    
    // Function to generate a session ID
    function generateSessionId() {
      return 'xxxx-xxxx-xxxx-xxxx'.replace(/x/g, function() {
        return Math.floor(Math.random() * 16).toString(16);
      });
    }
    
    // Add event listeners
    document.addEventListener('click', recordClick);
    document.addEventListener('mousemove', recordMouseMove);
    document.addEventListener('scroll', recordScroll);
    
    // Add keyboard shortcut to toggle heatmap (Ctrl+Alt+H)
    document.addEventListener('keydown', function(event) {
      if (event.ctrlKey && event.altKey && event.key === 'h') {
        toggleHeatmap();
      }
    });
    
    // Function to toggle heatmap visibility
    function toggleHeatmap() {
      if (heatmapContainer.style.display === 'none') {
        heatmapContainer.style.display = 'block';
        loadDataFromServer();
        showToast('Heatmap visible. Press Ctrl+Alt+H to hide.');
      } else {
        heatmapContainer.style.display = 'none';
        showToast('Heatmap hidden. Press Ctrl+Alt+H to show.');
      }
    }
    
    // Function to show toast message
    function showToast(message) {
      let toast = document.getElementById('heatmap-toast');
      
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'heatmap-toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        toast.style.color = 'white';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '5px';
        toast.style.zIndex = '10000';
        toast.style.fontSize = '14px';
        document.body.appendChild(toast);
      }
      
      toast.textContent = message;
      toast.style.display = 'block';
      
      setTimeout(function() {
        toast.style.display = 'none';
      }, 3000);
    }
    
    // Function to load data from server
    function loadDataFromServer() {
      fetch(`/get-heatmap-data/${websiteId}`)
        .then(response => response.json())
        .then(data => {
          if (data && data.length > 0) {
            // Find the maximum count value for proper scaling
            const maxValue = Math.max(...data.map(item => item.count || 1));
            
            // Format data for heatmap.js
            const formattedData = {
              max: maxValue,
              data: data.map(item => ({
                x: item.x,
                y: item.y,
                value: item.count || 1
              }))
            };
            
            // Set data to heatmap in one batch operation
            heatmapInstance.setData(formattedData);
          }
        })
        .catch(error => {
          console.error('Error fetching heatmap data:', error);
          // If server fetch fails, use local data
          heatmapInstance.setData({
            max: 10,
            data: interactionData
              .filter(item => item.type === 'click')
              .map(item => ({
                x: item.x,
                y: item.y,
                value: item.value
              }))
          });
        });
    }
    
    // Record page load event
    const pageLoadEvent = {
      websiteId: websiteId,
      timestamp: Date.now(),
      type: 'pageload',
      sessionId: sessionId,
      referrer: document.referrer,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
    
    sendToServer(pageLoadEvent);
    
    // Record page unload/exit event
    window.addEventListener('beforeunload', function() {
      const pageExitEvent = {
        websiteId: websiteId,
        timestamp: Date.now(),
        type: 'pageexit',
        sessionId: sessionId,
        timeSpent: Date.now() - pageLoadEvent.timestamp
      };
      
      // Use sendBeacon for more reliable tracking on page exit
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/track-interaction', JSON.stringify(pageExitEvent));
      } else {
        sendToServer(pageExitEvent);
      }
    });
    
    console.log(`Heatmap initialized for website ID: ${websiteId}`);
    console.log('Press Ctrl+Alt+H to toggle heatmap visibility');
  }
  // Add this to your heatmap-tracker.js file

// Track click count and trigger optimization
let clickCount = 0;
const OPTIMIZATION_THRESHOLD = 50; // Number of clicks before optimization

// Modify the recordClick function to count clicks and trigger optimization
function recordClick(event) {
  const clickPoint = {
    websiteId: websiteId,
    x: event.pageX,
    y: event.pageY,
    value: 1,
    timestamp: Date.now(),
    type: 'click',
    sessionId: sessionId,
    path: getElementPath(event.target),
    elementText: getElementText(event.target)
  };
  
  // Add to local storage
  interactionData.push(clickPoint);
  
  // Send to server
  sendToServer(clickPoint);
  
  // Update local heatmap visualization
  heatmapInstance.addData({
    x: clickPoint.x,
    y: clickPoint.y,
    value: clickPoint.value
  });
  
  // Increment click counter
  clickCount++;
  
  // Check if we should trigger optimization
  if (clickCount % OPTIMIZATION_THRESHOLD === 0) {
    triggerOptimization();
  }
}

// Function to trigger UI optimization
function triggerOptimization() {
  console.log(`Optimization threshold reached (${clickCount} clicks). Triggering UI optimization...`);
  
  // Send optimization request to server
  fetch(`/optimize-ui/${websiteId}`, {
    method: 'POST'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Failed to optimize UI');
    }
    return response.json();
  })
  .then(data => {
    if (data.optimizedWebsiteId) {
      console.log('UI successfully optimized!', data.optimizedWebsiteId);
      
      // Show notification to user
      showOptimizationNotification(data.optimizedWebsiteId);
    } else {
      console.log('Optimization response:', data.message);
    }
  })
  .catch(error => {
    console.error('Error optimizing UI:', error);
  });
}

// Function to show optimization notification
function showOptimizationNotification(optimizedId) {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'optimization-notification';
  notification.innerHTML = `
    <div class="notification-content">
      <h3>UI Optimized!</h3>
      <p>Based on user interactions, we've created an optimized version of this page.</p>
      <div class="notification-actions">
        <button class="view-optimized-btn">View Optimized Version</button>
        <button class="dismiss-btn">Continue with Current Version</button>
      </div>
    </div>
  `;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .optimization-notification {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      max-width: 350px;
      animation: slideIn 0.3s ease-out;
    }
    
    @keyframes slideIn {
      from {
        transform: translateY(100px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    
    .notification-content {
      padding: 15px;
    }
    
    .notification-content h3 {
      margin: 0 0 10px;
      color: #4361ee;
    }
    
    .notification-content p {
      margin: 0 0 15px;
      font-size: 14px;
    }
    
    .notification-actions {
      display: flex;
      gap: 10px;
    }
    
    .view-optimized-btn, .dismiss-btn {
      padding: 8px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    
    .view-optimized-btn {
      background: #4361ee;
      color: white;
    }
    
    .dismiss-btn {
      background: #e9ecef;
      color: #495057;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(notification);
  
  // Add event listeners
  const viewBtn = notification.querySelector('.view-optimized-btn');
  const dismissBtn = notification.querySelector('.dismiss-btn');
  
  viewBtn.addEventListener('click', () => {
    window.location.href = `/website/${optimizedId}`;
  });
  
  dismissBtn.addEventListener('click', () => {
    notification.remove();
  });
  
  // Auto-dismiss after 20 seconds
  setTimeout(() => {
    if (document.body.contains(notification)) {
      notification.remove();
    }
  }, 20000);
}

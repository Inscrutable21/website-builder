
function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  function calculatePercentageChange(current, previous) {
    if (!previous || previous === 0) return 0;
    
    const change = ((current - previous) / previous) * 100;
    return Math.round(change);
  }
  function generateId(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    
    for (let i = 0; i < length; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return id;
  }
  function extractCodeFromResponse(responseText) {
    const htmlMatch = responseText.match(/```html\s*([\s\S]*?)\s*```/);
    const cssMatch = responseText.match(/```css\s*([\s\S]*?)\s*```/);
    const jsMatch = responseText.match(/```javascript\s*([\s\S]*?)\s*```/) || 
                  responseText.match(/```js\s*([\s\S]*?)\s*```/);
    
    if (!htmlMatch) {
      throw new Error('Could not extract HTML from the generated content');
    }
    
    return {
      html: htmlMatch[1],
      css: cssMatch ? cssMatch[1] : '',
      js: jsMatch ? jsMatch[1] : ''
    };
  }
  function createCompleteHtml(html, css, js, websiteId) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Generated Website</title>
        <style>${css}</style>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/heatmap.js/2.0.2/heatmap.min.js"></script>
      </head>
      <body>
        <div id="heatmapContainer" style="width:100%; height:100%; position:absolute; top:0; left:0; z-index:9999; pointer-events:none; display:none;"></div>
        ${html}
        <script>${js}</script>
        <script src="/heatmap-tracker.js"></script>
        <script>
          // Initialize heatmap with the website ID
          initializeHeatmap('${websiteId}');
        </script>
      </body>
      </html>
    `;
  }
  function formatMarkdown(text) {
    if (!text) return '';
    
    return text
      // Headers
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Lists
      .replace(/^\s*[-*]\s+(.*?)$/gm, '<li>$1</li>')
      .replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>')
      // Line breaks
      .replace(/\n/g, '<br>');
  }
  function sanitizeText(text) {
    if (!text) return '';
    
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function groupInteractionsByDate(interactions, timeRange = 'week') {
    if (!interactions || !interactions.length) return [];
    
    const now = new Date();
    let startDate;
    
    switch (timeRange) {
      case 'day':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'all':
        startDate = new Date(0); // Beginning of time
        break;
      default:
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
    }
  const filteredInteractions = interactions.filter(interaction => {
    const interactionDate = new Date(interaction.timestamp);
    return interactionDate >= startDate && interactionDate <= now;
  });
  const groupedByDate = {};
  
  filteredInteractions.forEach(interaction => {
    const date = new Date(interaction.timestamp);
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    if (!groupedByDate[dateKey]) {
      groupedByDate[dateKey] = {
        date: dateKey,
        count: 0,
        clicks: 0,
        pageloads: 0,
        totalTimeSpent: 0,
        visitors: new Set()
      };
    }
    
    groupedByDate[dateKey].count++;
    
    if (interaction.type === 'click') {
      groupedByDate[dateKey].clicks++;
    }
    
    if (interaction.type === 'pageload') {
      groupedByDate[dateKey].pageloads++;
    }
    
    if (interaction.timeSpent) {
      groupedByDate[dateKey].totalTimeSpent += interaction.timeSpent;
    }
    
    if (interaction.sessionId) {
      groupedByDate[dateKey].visitors.add(interaction.sessionId);
    }
  });
  return Object.values(groupedByDate).map(day => {
    return {
      date: day.date,
      count: day.count,
      clicks: day.clicks,
      pageloads: day.pageloads,
      avgTimeSpent: day.pageloads > 0 ? day.totalTimeSpent / day.pageloads : 0,
      visitors: day.visitors.size
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}
function calculateTrends(currentPeriod, previousPeriod) {
  if (!currentPeriod || !previousPeriod) return {};
  const current = {
    visitors: currentPeriod.reduce((sum, day) => sum + day.visitors, 0),
    clicks: currentPeriod.reduce((sum, day) => sum + day.clicks, 0),
    avgTime: currentPeriod.reduce((sum, day) => sum + day.avgTimeSpent, 0) / currentPeriod.length || 0
  };
  
  const previous = {
    visitors: previousPeriod.reduce((sum, day) => sum + day.visitors, 0),
    clicks: previousPeriod.reduce((sum, day) => sum + day.clicks, 0),
    avgTime: previousPeriod.reduce((sum, day) => sum + day.avgTimeSpent, 0) / previousPeriod.length || 0
  };
  return {
    visitorsTrend: calculatePercentageChange(current.visitors, previous.visitors),
    clicksTrend: calculatePercentageChange(current.clicks, previous.clicks),
    timeTrend: calculatePercentageChange(current.avgTime, previous.avgTime)
  };
}
function groupClicksByElement(interactions) {
  if (!interactions || !interactions.length) return [];
  
  const elementCounts = {};
  
  interactions.filter(interaction => interaction.type === 'click' && interaction.path).forEach(click => {
    const path = click.path;
    
    if (!elementCounts[path]) {
      elementCounts[path] = {
        path: path,
        count: 0,
        text: click.elementText || ''
      };
    }
    
    elementCounts[path].count++;
  });
  return Object.values(elementCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Return top 10 elements
}
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
function debounce(callback, delay) {
  let timeoutId;
  
  return function(...args) {
    clearTimeout(timeoutId);
    
    timeoutId = setTimeout(() => {
      callback(...args);
    }, delay);
  };
}
module.exports = {
  formatDate,
  formatDuration,
  calculatePercentageChange,
  generateId,
  extractCodeFromResponse,
  createCompleteHtml,
  formatMarkdown,
  sanitizeText,
  groupInteractionsByDate,
  calculateTrends,
  groupClicksByElement,
  throttle,
  debounce
};

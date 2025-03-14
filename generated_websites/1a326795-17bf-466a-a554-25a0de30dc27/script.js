// script.js

// Animation for sections to fade in as they scroll into view
const sections = document.querySelectorAll('section');

const observer = new IntersectionObserver(
    (entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('show');
                observer.unobserve(entry.target);
            }
        });
    },
    {
        threshold: 0.2, // Adjust the threshold as needed
    }
);


sections.forEach((section) => {
    observer.observe(section);
});


// Optional: Micro-interaction example (e.g., button hover effect)
// const buttons = document.querySelectorAll('button'); 
// buttons.forEach(button => {
//     button.addEventListener('mouseover', () => {
//         button.style.transform = 'scale(1.05)';
//     });
//     button.addEventListener('mouseout', () => {
//         button.style.transform = 'scale(1)';
//     });
// });

// Animation initialization script
document.addEventListener('DOMContentLoaded', () => {
  // Initialize animations for common elements
  const animateElements = () => {
    // Headers and text elements
    document.querySelectorAll('h1, h2, h3').forEach((el, i) => {
      el.classList.add('fade-in', `delay-${i % 4 + 1}`);
    });
    
    document.querySelectorAll('p, .content-block').forEach((el, i) => {
      el.classList.add('fade-in', `delay-${i % 4 + 1}`);
    });
    
    // Left-side elements
    document.querySelectorAll('.left-content, .image-left, .col-left').forEach((el, i) => {
      el.classList.add('slide-in-left', `delay-${i % 4 + 1}`);
    });
    
    // Right-side elements
    document.querySelectorAll('.right-content, .image-right, .col-right').forEach((el, i) => {
      el.classList.add('slide-in-right', `delay-${i % 4 + 1}`);
    });
    
    // Cards, buttons and interactive elements
    document.querySelectorAll('.card, .feature, .box').forEach((el, i) => {
      el.classList.add('zoom-in', `delay-${i % 4 + 1}`);
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

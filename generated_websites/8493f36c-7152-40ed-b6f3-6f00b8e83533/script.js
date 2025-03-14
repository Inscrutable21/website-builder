// script.js
window.addEventListener('load', () => {
    const sections = document.querySelectorAll('main section');

    // Function to animate sections into view
    const animateSections = () => {
        sections.forEach((section, index) => {
            setTimeout(() => {
                section.style.opacity = 1;
                section.style.transform = 'translateY(0)';
            }, index * 200); // Stagger the animations
        });
    };

    animateSections();


    // Micro-interaction: Smooth scroll to sections on click
    document.querySelectorAll('nav a').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
  
        document.querySelector(this.getAttribute('href')).scrollIntoView({
          behavior: 'smooth'
        });
      });
    });




});

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

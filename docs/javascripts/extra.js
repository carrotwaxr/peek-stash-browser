// Custom JavaScript for Peek documentation

// Add smooth scrolling for anchor links
document.addEventListener('DOMContentLoaded', function() {
  // Smooth scroll for all anchor links
  const anchorLinks = document.querySelectorAll('a[href^="#"]');
  anchorLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href !== '#') {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  // Add copy button feedback
  const copyButtons = document.querySelectorAll('.md-clipboard');
  copyButtons.forEach(button => {
    button.addEventListener('click', function() {
      const icon = this.querySelector('svg');
      if (icon) {
        icon.style.color = '#6D2CE3';
        setTimeout(() => {
          icon.style.color = '';
        }, 1000);
      }
    });
  });

  // Enhance external links (open in new tab)
  const externalLinks = document.querySelectorAll('a[href^="http"]');
  externalLinks.forEach(link => {
    const isInternal = link.hostname.includes('carrotwaxr.github.io') ||
                       link.hostname === 'localhost' ||
                       link.hostname === '127.0.0.1';
    if (!isInternal) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });
});

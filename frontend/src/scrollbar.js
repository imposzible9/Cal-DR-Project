// Scrollbar Dark Mode Handler
class ScrollbarDarkMode {
  constructor() {
    this.init();
  }

  init() {
    // Check initial dark mode
    this.updateScrollbar();
    
    // Listen for dark mode changes
    this.observeDarkMode();
    
    // Also listen for system theme changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        this.updateScrollbar();
      });
    }
  }

  isDarkMode() {
    // Only check explicit 'dark' class on html/body, ignore system preference
    const hasDarkClass = document.documentElement.classList.contains('dark') ||
                         document.body.classList.contains('dark');
    
    // Debug logging
    console.log('Dark mode check:', {
      htmlClass: document.documentElement.classList.contains('dark'),
      bodyClass: document.body.classList.contains('dark'),
      systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      isDark: hasDarkClass
    });
    
    return hasDarkClass;
  }

  updateScrollbar() {
    const isDark = this.isDarkMode();
    
    console.log('Updating scrollbar - isDark:', isDark);
    
    // Remove existing scrollbar styles
    const existingStyle = document.getElementById('dark-scrollbar-styles');
    if (existingStyle) {
      existingStyle.remove();
      console.log('Removed existing scrollbar styles');
    }
    
    // If light mode, don't add any styles (use OS default)
    if (!isDark) {
      console.log('Light mode detected - using OS default scrollbar');
      return;
    }

    // Create style element only for dark mode
    const style = document.createElement('style');
    style.id = 'dark-scrollbar-styles';
    style.textContent = `
      /* Dark Mode Scrollbar */
      ::-webkit-scrollbar {
        width: 12px;
        height: 12px;
      }
      
      ::-webkit-scrollbar-track {
        background: #1a202c;
      }
      
      ::-webkit-scrollbar-thumb {
        background: #4a5568;
        border-radius: 6px;
      }
      
      ::-webkit-scrollbar-thumb:hover {
        background: #718096;
      }
      
      ::-webkit-scrollbar-corner {
        background: #1a202c;
      }
      
      /* Firefox scrollbar */
      * {
        scrollbar-color: #4a5568 #1a202c;
        scrollbar-width: auto;
      }
    `;
    
    document.head.appendChild(style);
    console.log('Added dark mode scrollbar styles');
  }

  observeDarkMode() {
    // Create a MutationObserver to watch for class changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && 
            (mutation.attributeName === 'class')) {
          this.updateScrollbar();
        }
      });
    });

    // Observe both html and body elements
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ScrollbarDarkMode();
  });
} else {
  new ScrollbarDarkMode();
}

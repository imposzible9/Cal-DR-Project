import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(false);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    
    if (newTheme) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="relative w-8.5 h-4.5 md:w-7 md:h-3.5 lg:w-7 lg:h-3.5 xl:w-7 xl:h-3.5 sm:w-7 sm:h-3.5 rounded-full transition-all duration-300 focus:outline-none"
      style={{
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.1)',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.8)' : '1px solid rgba(0, 0, 0, 0.8)',
      }}
    >
      {/* Sliding Circle */}
      <motion.div
        className="absolute w-[14px] h-[14px] top-[1px] left-[1.6px] lg:w-2.5 lg:h-2.5 lg:left-[0.5px] rounded-full transition-colors duration-300"
        style={{
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.8)' : '1px solid rgba(0, 0, 0, 0.8)',
        }}
        animate={{
          x: isDark ? 1 : 15
        }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 30
        }}
      />

      {/* Sun Icon (Light Mode) */}
      <motion.div
        className="absolute top-1/2 left-0.5 lg:left-0.5 transform -translate-y-1/2"
        animate={{
          opacity: isDark ? 0 : 1,
          scale: isDark ? 0.8 : 1,
        }}
        transition={{
          duration: 0.2,
          ease: "easeInOut"
        }}
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          style={{
            stroke: isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.8)',
            strokeWidth: 2,
          }}
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      </motion.div>

      {/* Moon Icon (Dark Mode) */}
      <motion.div
        className="absolute top-1/2 right-0.5 lg:right-0.5 transform -translate-y-1/2"
        animate={{
          opacity: isDark ? 1 : 0,
          scale: isDark ? 1 : 0.8,
        }}
        transition={{
          duration: 0.2,
          ease: "easeInOut"
        }}
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          style={{
            stroke: isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.8)',
            strokeWidth: 2,
          }}
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </motion.div>

      {/* Small Stars (Dark Mode) */}
      <motion.div
        className="absolute top-1/2 right-1 lg:right-1 transform -translate-y-1/2"
        animate={{
          opacity: isDark ? 1 : 0,
        }}
        transition={{
          duration: 0.3,
          delay: 0.1
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{
            color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.6)',
          }}
        >
          <circle cx="2" cy="2" r="1" />
          <circle cx="6" cy="6" r="1" />
          <circle cx="2" cy="10" r="1" />
        </svg>
      </motion.div>
    </button>
  );
};

export default ThemeToggle;

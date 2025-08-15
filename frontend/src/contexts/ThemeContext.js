import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(false);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('wki-theme');
    if (savedTheme) {
      setIsDark(savedTheme === 'dark');
    } else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(prefersDark);
    }
  }, []);

  // Update document class and localStorage when theme changes
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('wki-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      // Only auto-switch if user hasn't manually set a preference
      const savedTheme = localStorage.getItem('wki-theme');
      if (!savedTheme) {
        setIsDark(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = () => {
    setIsDark(prev => !prev);
  };

  const theme = {
    isDark,
    toggleTheme,
    colors: {
      // Light theme colors
      light: {
        bg: {
          primary: 'bg-gray-100',
          secondary: 'bg-white',
          tertiary: 'bg-gray-50',
          header: 'bg-red-700',
          modal: 'bg-white',
          card: 'bg-white',
          input: 'bg-white',
        },
        text: {
          primary: 'text-gray-900',
          secondary: 'text-gray-600',
          tertiary: 'text-gray-500',
          inverse: 'text-white',
          accent: 'text-red-600',
        },
        border: {
          primary: 'border-gray-200',
          secondary: 'border-gray-300',
          accent: 'border-red-500',
        },
        shadow: 'shadow-md',
        hover: {
          bg: 'hover:bg-gray-50',
          border: 'hover:border-red-500',
        }
      },
      // Dark theme colors
      dark: {
        bg: {
          primary: 'dark:bg-gray-900',
          secondary: 'dark:bg-gray-800',
          tertiary: 'dark:bg-gray-700',
          header: 'dark:bg-red-800',
          modal: 'dark:bg-gray-800',
          card: 'dark:bg-gray-800',
          input: 'dark:bg-gray-700',
        },
        text: {
          primary: 'dark:text-gray-100',
          secondary: 'dark:text-gray-300',
          tertiary: 'dark:text-gray-400',
          inverse: 'dark:text-gray-900',
          accent: 'dark:text-red-400',
        },
        border: {
          primary: 'dark:border-gray-600',
          secondary: 'dark:border-gray-500',
          accent: 'dark:border-red-400',
        },
        shadow: 'dark:shadow-lg dark:shadow-gray-900/50',
        hover: {
          bg: 'dark:hover:bg-gray-700',
          border: 'dark:hover:border-red-400',
        }
      }
    }
  };

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};

// Utility function to get theme-aware classes
export const getThemeClasses = (lightClass, darkClass = null) => {
  if (!darkClass) {
    // Auto-generate dark class from light class
    darkClass = lightClass.replace(/bg-gray-(\d+)/g, (match, num) => {
      const lightNum = parseInt(num);
      const darkNum = lightNum < 500 ? 900 - lightNum : 1000 - lightNum;
      return `dark:bg-gray-${Math.max(100, Math.min(900, darkNum))}`;
    });
    
    darkClass = darkClass.replace(/text-gray-(\d+)/g, (match, num) => {
      const lightNum = parseInt(num);
      const darkNum = lightNum < 500 ? 900 - lightNum : 1000 - lightNum;
      return `dark:text-gray-${Math.max(100, Math.min(900, darkNum))}`;
    });
  }
  
  return `${lightClass} ${darkClass}`;
};

export default ThemeContext;

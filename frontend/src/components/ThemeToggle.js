import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle = ({ className = "", size = "md" }) => {
  const { isDark, toggleTheme } = useTheme();

  const sizeClasses = {
    sm: "w-8 h-8 p-1.5",
    md: "w-10 h-10 p-2",
    lg: "w-12 h-12 p-2.5"
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4", 
    lg: "w-5 h-5"
  };

  return (
    <button
      onClick={toggleTheme}
      className={`
        ${sizeClasses[size]}
        bg-white/10 hover:bg-white/20 dark:bg-gray-700 dark:hover:bg-gray-600
        backdrop-blur-sm rounded-lg transition-all duration-300
        flex items-center justify-center
        border border-white/20 dark:border-gray-600
        ${className}
      `}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? (
        <Sun className={`${iconSizes[size]} text-yellow-400 transition-transform duration-300 rotate-0 hover:rotate-180`} />
      ) : (
        <Moon className={`${iconSizes[size]} text-blue-200 transition-transform duration-300 rotate-0 hover:-rotate-12`} />
      )}
    </button>
  );
};

export default ThemeToggle;

import React, { createContext, useContext, useEffect, useState } from 'react';

export const THEMES = [
  { id: 'midnight-plum', label: 'Midnight Plum', description: 'DevFlow’s original dark purple palette.', swatch: '#8b5cf6' },
  { id: 'light', label: 'Light', description: 'Bright surfaces with a soft violet accent.', swatch: '#7047c8' },
  { id: 'github', label: 'GitHub Dark', description: 'GitHub-inspired charcoal surfaces and blue accents.', swatch: '#2f81f7' },
  { id: 'monochrome', label: 'Monochrome', description: 'Neutral grayscale with a crisp silver accent.', swatch: '#b8b8b8' },
  { id: 'neon', label: 'Neon', description: 'Deep charcoal with a vivid lime accent.', swatch: '#b7f34a' },
  { id: 'midnight-blue', label: 'Midnight Blue', description: 'Navy surfaces with a bright blue accent.', swatch: '#42a5f5' },
];

const defaultContext = { theme: 'midnight-plum', setTheme: () => {} };
const ThemeContext = createContext(defaultContext);

function readSavedTheme() {
  try {
    const saved = window.localStorage.getItem('devflow.theme');
    return THEMES.some((theme) => theme.id === saved) ? saved : 'midnight-plum';
  } catch {
    return 'midnight-plum';
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readSavedTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('devflow.theme', theme);
    } catch {
      // The theme still applies for this session if storage is unavailable.
    }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

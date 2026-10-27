import React, { useEffect, useRef } from 'react';
import { ChevronDown, Palette } from 'lucide-react';
import { THEMES, useTheme } from '../contexts/ThemeContext';

export default function ThemePicker({ variant = 'header' }) {
  const detailsRef = useRef(null);
  const { theme, setTheme } = useTheme();
  const currentTheme = THEMES.find((option) => option.id === theme) || THEMES[0];
  const isSettingsPicker = variant === 'settings';

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target)) detailsRef.current.open = false;
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false;
        detailsRef.current.querySelector('summary')?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <details className={`theme-picker theme-picker-${variant}`} ref={detailsRef}>
      <summary className={isSettingsPicker ? 'button button-secondary theme-picker-summary' : 'theme-picker-summary'} aria-label={isSettingsPicker ? undefined : `Choose theme. Current theme: ${currentTheme.label}`} title={isSettingsPicker ? undefined : `Theme: ${currentTheme.label}`}>
        <Palette size={isSettingsPicker ? 15 : 17} aria-hidden="true" />
        {isSettingsPicker ? <><span>Appearance</span><strong>{currentTheme.label}</strong></> : <span className="sr-only">Theme</span>}
        <ChevronDown size={13} className="theme-picker-chevron" aria-hidden="true" />
      </summary>
      <div className="theme-picker-menu" role="group" aria-label="Website themes">
        <div className="theme-picker-menu-heading"><strong>Choose a theme</strong><span>Applies across DevFlow</span></div>
        {THEMES.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`theme-picker-option ${option.id === theme ? 'theme-picker-option-active' : ''}`}
            aria-pressed={option.id === theme}
            onClick={() => {
              setTheme(option.id);
              if (detailsRef.current) detailsRef.current.open = false;
            }}
          >
            <span className="theme-picker-swatch" style={{ '--theme-swatch': option.swatch }} />
            <span className="theme-picker-option-copy"><strong>{option.label}</strong><small>{option.description}</small></span>
            {option.id === theme && <span className="theme-picker-current">Current</span>}
          </button>
        ))}
      </div>
    </details>
  );
}

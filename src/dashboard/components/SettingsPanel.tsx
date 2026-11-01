import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { getMotionTransition } from '../../motion/presets';
import { SettingsIcon, svgIcons, SunIcon, MoonIcon, SystemIcon } from '../icons';
import { categoryColors, formatBytes, calculateBookmarksStorageSize } from '../helpers';
import { applyAccentVariables } from '../../shared/colors';
import { SaveConfigCard } from './SaveConfigCard';
import { AICard } from './AICard';
import { BackupCard } from './BackupCard';
import { InfoTooltip } from './InfoTooltip';
import { useThemeMode, type ThemeMode } from '../hooks/useThemeMode';
import { type CardDensity } from '../hooks/useCardDensity';
import { HexColorPicker } from 'react-colorful';

interface SettingsPanelProps {
  bookmarks?: any[];
  settingsExpanded: boolean;
  setSettingsExpanded: (val: boolean) => void;
  mobileSettingsOpen?: boolean;
  setMobileSettingsOpen?: (val: boolean) => void;
  saveMode: 'injected' | 'native-override';
  setSaveMode: (val: 'injected' | 'native-override') => void;
  injectedPosition: 'leftmost' | 'after-reply' | 'after-retweet' | 'after-like' | 'after-views' | 'rightmost' | 'next-to-bookmark';
  setInjectedPosition: (pos: 'leftmost' | 'after-reply' | 'after-retweet' | 'after-like' | 'after-views' | 'next-to-bookmark' | 'rightmost') => void;
  nativeOverrideAction: 'replace' | 'arrow';
  setNativeOverrideAction: (val: 'replace' | 'arrow') => void;
  buttonAlignment: 'left' | 'center' | 'right';
  setButtonAlignment: (val: 'left' | 'center' | 'right') => void;
  alsoSaveNative: boolean;
  setAlsoSaveNative: (val: boolean) => void;
  accentColor: string;
  setAccentColor: (c: string) => void;
  cardDensity?: CardDensity;
  setCardDensity?: (d: CardDensity) => void;
  autoCategorize: boolean;
  toggleAutoCategorize: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isModelLoaded: boolean;
  modelProgress: number | null;
  isClassifying: boolean;
  classifyProgress: { current: number; total: number } | null;
  runAutoCategorizeJobs: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  bookmarks,
  settingsExpanded, setSettingsExpanded,
  mobileSettingsOpen, setMobileSettingsOpen,
  saveMode, setSaveMode,
  injectedPosition, setInjectedPosition,
  nativeOverrideAction, setNativeOverrideAction,
  buttonAlignment, setButtonAlignment,
  alsoSaveNative, setAlsoSaveNative,
  accentColor, setAccentColor,
  cardDensity = 'compact', setCardDensity = () => {},
  autoCategorize, toggleAutoCategorize,
  isModelLoaded, modelProgress,
  isClassifying, classifyProgress, runAutoCategorizeJobs,
}) => {
  const [themeMode, setThemeMode] = useThemeMode();
  const reducedMotion = useReducedMotion();
  const panelTransition = getMotionTransition(Boolean(reducedMotion));
  const [isMobileViewport, setIsMobileViewport] = React.useState(false);

  const storageSize = useMemo(() => {
    return calculateBookmarksStorageSize(bookmarks);
  }, [bookmarks]);

  const [experimentalColors, setExperimentalColors] = useState<boolean>(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chrome.storage?.sync?.get(['experimentalColors'], (res) => {
      if (res && res.experimentalColors !== undefined) {
        setExperimentalColors(Boolean(res.experimentalColors));
      }
    });
  }, []);

  const handleToggleExperimental = (val: boolean) => {
    setExperimentalColors(val);
    if (!val) setColorPickerOpen(false);
    chrome.storage?.sync?.set({ experimentalColors: val });
  };

  // Close color picker when clicking outside
  useEffect(() => {
    if (!colorPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorPickerOpen]);

  // draftColorRef tracks color during drag — no React state update while dragging
  const draftColorRef = useRef<string>(accentColor);

  // Called on every HexColorPicker drag frame — ONLY mutates CSS var, zero re-renders
  const handleColorChange = useCallback((color: string) => {
    draftColorRef.current = color;
    applyAccentVariables(color);
  }, []);

  // Called once when drag ends (pointerUp) or on direct hex text input
  const handleColorCommit = useCallback((color?: string) => {
    const c = color ?? draftColorRef.current;
    setAccentColor(c);
    chrome.storage?.sync?.set({ accentColor: c });
  }, [setAccentColor]);

  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)');
    const updateViewport = () => setIsMobileViewport(media.matches);
    updateViewport();
    media.addEventListener?.('change', updateViewport);
    return () => media.removeEventListener?.('change', updateViewport);
  }, []);

  React.useEffect(() => {
    if (!mobileSettingsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSettingsOpen]);

  return (
    <>
      <AnimatePresence>
        {mobileSettingsOpen && setMobileSettingsOpen && (
          <motion.div
            className="settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={panelTransition}
            onClick={() => setMobileSettingsOpen(false)}
          />
        )}
      </AnimatePresence>
      <motion.aside
        className={`settings-sidebar ${mobileSettingsOpen ? 'open' : ''}`}
        data-onboarding="settings-panel"
        initial={false}
        animate={isMobileViewport ? { x: mobileSettingsOpen ? 0 : '100%' } : { x: 0 }}
        transition={panelTransition}
      >

        {/* This wrapper is position:relative so the content panel can be
            absolutely placed ABOVE the toggle button via bottom: 100% */}
        <div className="settings-panel-anchor">

          {/* Content panel — GPU accelerated translateY slide */}
          <div className={`settings-content-wrapper ${settingsExpanded ? 'is-expanded' : 'is-collapsed'}`}>
            <div className="settings-content-inner">
              <motion.div
                className="accordion-slider"
                initial={false}
                animate={{
                  opacity: settingsExpanded ? 1 : 0,
                  y: settingsExpanded ? 0 : 8,
                }}
                transition={panelTransition}
              >
                <SaveConfigCard
                  saveMode={saveMode} setSaveMode={setSaveMode}
                  injectedPosition={injectedPosition} setInjectedPosition={setInjectedPosition}
                  nativeOverrideAction={nativeOverrideAction} setNativeOverrideAction={setNativeOverrideAction}
                  buttonAlignment={buttonAlignment} setButtonAlignment={setButtonAlignment}
                  alsoSaveNative={alsoSaveNative} setAlsoSaveNative={setAlsoSaveNative}
                  accentColor={accentColor}
                />

                <div className="settings-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div className="settings-card-title" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                      Personalization
                      <InfoTooltip text="Switch theme mode (System, Light, Dark) or select your custom accent color." />
                    </div>

                    {/* Compact 3-state Theme Mode Icon Toggle */}
                    <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', padding: '2px', border: '1px solid var(--border)', position: 'relative' }}>
                      {[
                        { id: 'system', label: 'System preference', icon: <SystemIcon size={13} /> },
                        { id: 'light', label: 'Light mode', icon: <SunIcon size={13} /> },
                        { id: 'dark', label: 'Dark mode', icon: <MoonIcon size={13} /> },
                      ].map(mode => {
                        const isActive = themeMode === mode.id;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => setThemeMode(mode.id as ThemeMode)}
                            title={mode.label}
                            aria-label={mode.label}
                            style={{
                              position: 'relative',
                              background: 'transparent',
                              color: isActive ? 'var(--accent-contrast, #ffffff)' : 'var(--text-muted)',
                              border: 'none',
                              borderRadius: 'var(--radius-full)',
                              width: '26px',
                              height: '22px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              zIndex: 1,
                              transition: 'color 0.2s',
                            }}
                          >
                            {isActive && (
                              <motion.span
                                layoutId="theme-mode-pill"
                                transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  background: 'var(--accent)',
                                  borderRadius: 'var(--radius-full)',
                                  zIndex: -1,
                                }}
                              />
                            )}
                            <span style={{ position: 'relative', zIndex: 2, display: 'inline-flex', alignItems: 'center', color: isActive ? 'var(--accent-contrast, #ffffff)' : 'var(--text-muted)' }}>{mode.icon}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Accent Color Palette & Custom Color Picker */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span className="toggle-label" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', textTransform: 'uppercase' }}>
                      ACCENT COLOR
                      <InfoTooltip text="Select a preset accent color for your XMarks dashboard interface." />
                    </span>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'nowrap' }}>
                      {categoryColors.map(color => (
                        <span
                          key={color}
                          onClick={() => {
                            setAccentColor(color);
                            setColorPickerOpen(false);
                            chrome.storage?.sync?.set({ accentColor: color });
                          }}
                          title={color}
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: 'var(--radius-sm)',
                            background: color,
                            cursor: 'pointer',
                            border: accentColor.toLowerCase() === color.toLowerCase() ? '2px solid var(--text)' : '1px solid transparent',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                            transition: 'transform 0.15s, border-color 0.15s',
                          }}
                        />
                      ))}
                      {/* Theme-Adaptive Auto Black/White Swatch (Before Custom Color) */}
                      <span
                        onClick={() => {
                          setAccentColor('monochrome');
                          setColorPickerOpen(false);
                          chrome.storage?.sync?.set({ accentColor: 'monochrome' });
                        }}
                        title="Auto Black/White (Black in Light Mode, White in Dark Mode)"
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'linear-gradient(135deg, #000000 50%, #ffffff 50%)',
                          cursor: 'pointer',
                          border: accentColor === 'monochrome' ? '2px solid var(--text)' : '1.5px solid var(--border-strong)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                          transition: 'transform 0.15s, border-color 0.15s',
                          boxSizing: 'border-box',
                        }}
                      />

                      {/* Custom Color Selector Swatch & Floating Popover (Only when Experimental mode is ON) */}
                      <AnimatePresence>
                        {experimentalColors && (
                          <motion.div
                            key="custom-color-picker-wrap"
                            ref={colorPickerRef}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                            style={{ position: 'relative' }}
                          >
                            {/* Swatch button - restoring original iconic rainbow wheel graphic */}
                            <div
                              className="custom-color-swatch"
                              title="Pick custom color"
                              onClick={(e) => {
                                e.stopPropagation();
                                setColorPickerOpen(v => !v);
                              }}
                              style={{
                                border: (accentColor !== 'monochrome' && !categoryColors.some(c => c.toLowerCase() === accentColor.toLowerCase())) ? '2px solid var(--text)' : '1.5px solid var(--border-strong)',
                              }}
                            >
                              <span className="custom-color-swatch-inner" />
                            </div>

                            {/* Floating Glass Popover */}
                            <AnimatePresence>
                              {colorPickerOpen && (
                                <motion.div
                                  key="colorful-popover"
                                  initial={{ opacity: 0, scale: 0.9, y: 6 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.9, y: 6 }}
                                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                  // Commit to React state only once when pointer is released
                                  onPointerUp={() => handleColorCommit()}
                                  style={{
                                    position: 'absolute',
                                    bottom: 'calc(100% + 10px)',
                                    right: 0,
                                    zIndex: 9999,
                                    background: 'var(--bg-secondary)',
                                    backdropFilter: 'blur(16px) saturate(180%)',
                                    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-strong)',
                                    boxShadow: 'var(--shadow-lg)',
                                    padding: '12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '10px',
                                    transformOrigin: 'bottom right',
                                  }}
                                >
                                  <HexColorPicker
                                    color={accentColor}
                                    onChange={handleColorChange}
                                  />
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', maxWidth: '180px' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>HEX:</span>
                                    <input
                                      type="text"
                                      value={accentColor}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                                          handleColorChange(v);
                                          handleColorCommit(v);
                                        }
                                      }}
                                      style={{
                                        flex: 1,
                                        padding: '5px 8px',
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid var(--border-strong)',
                                        background: 'var(--bg)',
                                        color: 'var(--text)',
                                        fontSize: '12px',
                                        fontFamily: 'monospace',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                      }}
                                    />
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Experimental Custom Color Switch */}
                    <div className="toggle-row" style={{ marginTop: '12px', marginBottom: 0, paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                      <span className="toggle-label" style={{ fontSize: '11.5px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                        Experimental Custom Color
                        <InfoTooltip text="⚠️ Caution: Custom accent colors are experimental. Certain custom hex hues may degrade text contrast or legibility in some UI themes." />
                      </span>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={experimentalColors}
                          onChange={(e) => handleToggleExperimental(e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>

                    {/* Card Density / Tweet Size Control */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                      <span className="toggle-label" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', textTransform: 'uppercase' }}>
                        TWEET DENSITY
                        <InfoTooltip text="Adjust vertical tweet height. Compact mode displays up to 2x more bookmarks per screen." />
                      </span>
                      <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', padding: '2px', border: '1px solid var(--border)', position: 'relative' }}>
                        {[
                          { id: 'ultra', label: 'Ultra' },
                          { id: 'compact', label: 'Compact' },
                          { id: 'comfortable', label: 'Default' },
                          { id: 'spacious', label: 'Spacious' },
                        ].map(density => {
                          const isActive = cardDensity === density.id;
                          return (
                            <button
                              key={density.id}
                              type="button"
                              onClick={() => setCardDensity(density.id as CardDensity)}
                              style={{
                                flex: 1,
                                position: 'relative',
                                background: 'transparent',
                                color: isActive ? 'var(--accent-contrast, #ffffff)' : 'var(--text-muted)',
                                border: 'none',
                                borderRadius: 'var(--radius-full)',
                                padding: '5px 6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                zIndex: 1,
                                transition: 'color 0.15s',
                              }}
                            >
                              {isActive && (
                                <motion.span
                                  layoutId="card-density-pill"
                                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: 'var(--accent)',
                                    borderRadius: 'var(--radius-full)',
                                    zIndex: -1,
                                  }}
                                />
                              )}
                              {density.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Storage & Data Footprint */}
                <div className="settings-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div className="settings-card-title" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                      Storage
                      <InfoTooltip text="Total on-device IndexedDB storage used by your saved tweets, notes, and metadata." />
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, fontFamily: 'monospace' }}>
                      {formatBytes(storageSize)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    <span>{bookmarks?.length ?? 0} saved {bookmarks?.length === 1 ? 'tweet' : 'tweets'}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00ba7c' }} />
                      100% Local
                    </span>
                  </div>
                </div>

                <BackupCard />
              </motion.div>

              <div className="mobile-only-ai-card">
                <AICard
                  autoCategorize={autoCategorize}
                  toggleAutoCategorize={toggleAutoCategorize}
                  isModelLoaded={isModelLoaded}
                  modelProgress={modelProgress}
                  isClassifying={isClassifying}
                  classifyProgress={classifyProgress}
                  runAutoCategorizeJobs={runAutoCategorizeJobs}
                />
              </div>
            </div>
          </div>

          {/* Toggle button — always visible at the bottom */}
          <button
            type="button"
            className={`sidebar-toggle-bar ${settingsExpanded ? 'is-expanded' : 'is-collapsed'}`}
            data-onboarding="settings-toggle"
            aria-expanded={settingsExpanded}
            onClick={() => setSettingsExpanded(!settingsExpanded)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <SettingsIcon />
              <span className="settings-card-title">Settings</span>
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{
                transform: settingsExpanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
                color: 'var(--text-muted)'
              }}
            >
              <path d="M6 15l6-6 6 6"/>
            </svg>
          </button>

        </div>
      </motion.aside>
    </>
  );
};

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { db } from '../../db';
import { getCategoryColor, categoryColors, formatBytes, calculateBookmarksStorageSize } from '../helpers';
import { getContrastTextColor } from '../../shared/colors';
import { AllIcon, XMarksMark } from '../icons';
import { AICard } from './AICard';
import { InfoTooltip } from './InfoTooltip';
import { ProfileSwitcher } from './ProfileSwitcher';

interface SidebarProps {
  bookmarks: any[] | undefined;
  categories: any[] | undefined;
  selectedCategoryId: string | null;
  setSelectedCategoryId: (id: string | null) => void;
  newCatName: string;
  setNewCatName: (val: string) => void;
  handleCreateCategory: (e: React.FormEvent) => Promise<void>;
  editingCatId: string | null;
  setEditingCatId: (id: string | null) => void;
  editingCatName: string;
  setEditingCatName: (val: string) => void;
  activeColorPickerCatId: string | null;
  setActiveColorPickerCatId: (id: string | null) => void;
  autoCategorize: boolean;
  toggleAutoCategorize: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isModelLoaded: boolean;
  modelProgress: number | null;
  isClassifying: boolean;
  classifyProgress: { current: number; total: number } | null;
  runAutoCategorizeJobs: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  bookmarks, categories,
  selectedCategoryId, setSelectedCategoryId,
  newCatName, setNewCatName,
  handleCreateCategory,
  editingCatId, setEditingCatId,
  editingCatName, setEditingCatName,
  activeColorPickerCatId, setActiveColorPickerCatId,
  autoCategorize, toggleAutoCategorize,
  isModelLoaded, modelProgress,
  isClassifying, classifyProgress,
  runAutoCategorizeJobs,
}) => {
  const [isStorageHovered, setIsStorageHovered] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const logoRef = useRef<HTMLDivElement>(null);

  const storageSize = useMemo(() => {
    return calculateBookmarksStorageSize(bookmarks);
  }, [bookmarks]);

  const updatePosition = () => {
    if (!logoRef.current) return;
    const rect = logoRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 6,
      left: rect.left + 16,
    });
  };

  const handleMouseEnter = () => {
    updatePosition();
    setIsStorageHovered(true);
  };

  const handleMouseLeave = () => {
    setIsStorageHovered(false);
  };

  useEffect(() => {
    if (!isStorageHovered) return;
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isStorageHovered]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    if (!bookmarks) return map;
    for (const b of bookmarks) {
      if (b.categoryIds) {
        for (const catId of b.categoryIds) {
          map[catId] = (map[catId] || 0) + 1;
        }
      }
    }
    return map;
  }, [bookmarks]);

  const uncategorizedCount = useMemo(() => {
    if (!bookmarks) return 0;
    return bookmarks.filter(b => !b.categoryIds || b.categoryIds.length === 0).length;
  }, [bookmarks]);

  return (
    <aside className="sidebar" data-onboarding="desktop-categories">
      <div
        className="sidebar-logo"
        ref={logoRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'default' }}
      >
        <div>
          <div className="sidebar-logo-text" role="img" aria-label="XMarks">
            <XMarksMark size={23} />
            <span aria-hidden="true">Marks</span>
          </div>
          <div className="sidebar-logo-sub" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>{bookmarks?.length ?? 0} saved</span>
          </div>
        </div>
      </div>

      {createPortal(
        <AnimatePresence>
          {isStorageHovered && (
            <motion.div
              className="info-tooltip-portal"
              initial={{ opacity: 0, scale: 0.94, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -4 }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'fixed',
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                zIndex: 99999,
                pointerEvents: 'none',
              }}
            >
              <div className="info-tooltip-content" style={{ padding: '8px 12px', minWidth: '170px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Storage Used</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)' }}>{formatBytes(storageSize)}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00ba7c' }} />
                  100% Local IndexedDB
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <ProfileSwitcher />

      <div className="sidebar-section-label" style={{ display: 'flex', alignItems: 'center' }}>
        Bookmarks
        <InfoTooltip text="Filter bookmarks by category or add custom color-coded categories." />
      </div>
      <ul>
        <li
          className={`sidebar-item ${!selectedCategoryId ? 'active' : ''}`}
          onClick={() => setSelectedCategoryId(null)}
        >
          <span className="sidebar-item-icon"><AllIcon /></span>
          <span style={{ flex: 1 }}>All Bookmarks</span>
          {bookmarks && (
            <span className="sidebar-item-badge">{bookmarks.length}</span>
          )}
        </li>
        <li
          className={`sidebar-item ${selectedCategoryId === '__uncategorized__' ? 'active' : ''}`}
          onClick={() => setSelectedCategoryId(selectedCategoryId === '__uncategorized__' ? null : '__uncategorized__')}
        >
          <span className="sidebar-item-icon" style={{ opacity: 0.75, display: 'inline-flex', alignItems: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </span>
          <span style={{ flex: 1 }}>Uncategorized</span>
          {bookmarks && (
            <span className="sidebar-item-badge">{uncategorizedCount}</span>
          )}
        </li>
      </ul>

      <div className="sidebar-section-label">Categories</div>
      <form onSubmit={handleCreateCategory} style={{ display: 'flex', gap: '6px', padding: '4px 12px 12px 12px', flexShrink: 0 }}>
        <input 
          type="text" 
          placeholder="New category..." 
          value={newCatName}
          onChange={e => setNewCatName(e.target.value)}
          className="new-cat-input"
        />
        <button type="submit" className="new-cat-btn">Add</button>
      </form>

      <div className="sidebar-categories-list" style={{ flexGrow: 1 }}>
        {categories && categories.length > 0 && (
          <ul>
            {categories.map((cat: any) => {
              const count = categoryCounts[cat.id] ?? 0;
              const isEditing = editingCatId === cat.id;
              return (
                <li
                  key={cat.id}
                  className={`sidebar-item ${selectedCategoryId === cat.id ? 'active' : ''}`}
                  onClick={() => !isEditing && setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)}
                  style={{ position: 'relative' }}
                >
                  <span 
                    className="cat-dot" 
                    style={{ background: getCategoryColor(cat.id, cat.color), cursor: 'pointer', flexShrink: 0 }}
                    title="Click to change color"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveColorPickerCatId(activeColorPickerCatId === cat.id ? null : cat.id);
                    }}
                  />
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingCatName}
                      onChange={e => setEditingCatName(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          const trimmed = editingCatName.trim();
                          if (trimmed) await db.categories.update(cat.id, { name: trimmed });
                          setEditingCatId(null);
                        } else if (e.key === 'Escape') {
                          setEditingCatId(null);
                        }
                      }}
                      onBlur={async () => {
                        const trimmed = editingCatName.trim();
                        if (trimmed) await db.categories.update(cat.id, { name: trimmed });
                        setEditingCatId(null);
                      }}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        color: 'var(--text)',
                        border: 'none',
                        borderBottom: '1px solid var(--accent)',
                        outline: 'none',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        padding: '1px 0',
                        minWidth: 0,
                      }}
                    />
                  ) : (
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                  )}
                  {!isEditing && (
                    <>
                      <button
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCatId(cat.id);
                          setEditingCatName(cat.name);
                        }}
                        style={{
                          background: 'none', border: 'none', padding: '2px', cursor: 'pointer',
                          color: 'var(--text-muted)', opacity: 0, display: 'flex', alignItems: 'center',
                          transition: 'opacity 0.15s', flexShrink: 0,
                        }}
                        className="cat-rename-btn"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <span
                        className="sidebar-item-badge"
                        style={{
                          background: getCategoryColor(cat.id, cat.color),
                          color: getContrastTextColor(getCategoryColor(cat.id, cat.color)),
                          flexShrink: 0,
                        }}
                      >
                        {count}
                      </span>
                    </>
                  )}

                  {activeColorPickerCatId === cat.id && (
                    <div 
                      onClick={e => e.stopPropagation()} 
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: '12px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        boxShadow: 'var(--shadow-lg)',
                        padding: '8px',
                        zIndex: 150,
                        display: 'flex',
                        gap: '6px'
                      }}
                    >
                      {categoryColors.map(color => (
                        <span
                          key={color}
                          onClick={async () => {
                            await db.categories.update(cat.id, { color });
                            setActiveColorPickerCatId(null);
                          }}
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            background: color,
                            cursor: 'pointer',
                            border: cat.color === color ? '2px solid var(--text)' : 'none',
                            boxShadow: '0 0 2px rgba(0,0,0,0.3)'
                          }}
                        />
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 'auto', flexShrink: 0, width: '100%' }}>
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
    </aside>
  );
};

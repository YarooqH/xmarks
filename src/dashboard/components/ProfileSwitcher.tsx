import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DEFAULT_PROFILE_ID } from '../../db';
import { MAX_PROFILE_LABEL, type Profile } from '../../db/profiles';
import { useProfiles } from '../hooks/useProfiles';
import { Modal } from './Modal';

const initial = (label: string) => (label.match(/[\p{L}\p{N}]/u)?.[0] ?? '#').toUpperCase();

const LibraryAvatar = ({ label }: { label: string }) => (
  <span className="lib-avatar" aria-hidden="true">{initial(label)}</span>
);

const ChevronIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const PencilIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
);

export const ProfileSwitcher: React.FC = () => {
  const { mode, setMode, profiles, savingProfileId, viewingProfileId, create, rename, view, saveTo, remove } = useProfiles();
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const multiple = profiles.length > 1;
  const viewing = profiles.find(p => p.id === viewingProfileId);
  const saving = profiles.find(p => p.id === savingProfileId);
  const deleting = profiles.find(p => p.id === deletingId);
  const defaultProfile = profiles.find(p => p.id === DEFAULT_PROFILE_ID);

  const close = () => {
    setOpen(false);
    setAdding(false);
    setNewName('');
    setRenamingId(null);
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      // Escape inside an input only cancels that edit; the delete modal handles its own.
      if (e.key === 'Escape' && !deletingId && !(e.target instanceof HTMLInputElement)) close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, deletingId]);

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await create(newName);
    setNewName('');
    setAdding(false);
  };

  const submitRename = async (id: string) => {
    if (renameValue.trim()) await rename(id, renameValue);
    setRenamingId(null);
  };

  // One line under the library name that always answers "where does a new save go?"
  const status = mode === 'auto'
    ? 'Saves follow your X account'
    : viewingProfileId === savingProfileId
      ? 'New saves land here'
      : `New saves go to ${saving?.label}`;

  const rowMeta = (p: Profile) => {
    if (mode === 'auto') return p.handle ? `@${p.handle}` : p.id === DEFAULT_PROFILE_ID ? 'Not linked to an account yet' : null;
    return multiple && p.id === savingProfileId ? 'New saves land here' : null;
  };

  return (
    <div className="lib-switcher" ref={rootRef}>
      <button
        type="button"
        className={`lib-trigger ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <LibraryAvatar label={viewing?.label ?? 'Default'} />
        <span className="lib-trigger-text">
          <span className="lib-trigger-name">{viewing?.label ?? 'Default'}</span>
          <span className={`lib-trigger-status ${viewingProfileId !== savingProfileId && mode === 'manual' ? 'is-elsewhere' : ''}`}>
            {status}
          </span>
        </span>
        <span className="lib-trigger-chevron"><ChevronIcon /></span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="lib-pop"
            role="dialog"
            aria-label="Libraries"
            initial={{ opacity: 0, y: reducedMotion ? 0 : -4, scale: reducedMotion ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -4, scale: reducedMotion ? 1 : 0.98 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="lib-pop-label">Libraries</div>
            <ul className="lib-list">
              {profiles.map(p => {
                const meta = rowMeta(p);
                const active = p.id === viewingProfileId;
                return (
                  <li key={p.id} className={`lib-row ${active ? 'is-active' : ''}`}>
                    {renamingId === p.id ? (
                      <div className="lib-row-edit">
                        <LibraryAvatar label={renameValue || p.label} />
                        <input
                          className="lib-input"
                          autoFocus
                          aria-label={`Rename ${p.label}`}
                          value={renameValue}
                          maxLength={MAX_PROFILE_LABEL}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => submitRename(p.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') submitRename(p.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                        />
                      </div>
                    ) : (
                      <>
                        <button type="button" className="lib-row-main" aria-current={active || undefined} onClick={() => view(p.id)}>
                          <LibraryAvatar label={p.label} />
                          <span className="lib-row-text">
                            <span className="lib-row-name">{p.label}</span>
                            {meta && <span className="lib-row-meta">{meta}</span>}
                          </span>
                          {active && <span className="lib-row-check"><CheckIcon /></span>}
                        </button>
                        <span className="lib-row-tools">
                          <button
                            type="button"
                            className="lib-icon-btn"
                            title="Rename"
                            aria-label={`Rename ${p.label}`}
                            onClick={() => { setRenamingId(p.id); setRenameValue(p.label); }}
                          >
                            <PencilIcon />
                          </button>
                          {p.id !== DEFAULT_PROFILE_ID && (
                            <button
                              type="button"
                              className="lib-icon-btn is-danger"
                              title="Delete"
                              aria-label={`Delete ${p.label}`}
                              onClick={() => setDeletingId(p.id)}
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>

            {adding ? (
              <form className="lib-add-form" onSubmit={submitNew}>
                <input
                  className="lib-input"
                  autoFocus
                  aria-label="New library name"
                  placeholder="Name it, e.g. Work"
                  value={newName}
                  maxLength={MAX_PROFILE_LABEL}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
                />
                <button type="submit" className="lib-create-btn" disabled={!newName.trim()}>Create</button>
              </form>
            ) : (
              <button type="button" className="lib-add-btn" onClick={() => setAdding(true)}>
                <span className="lib-add-plus" aria-hidden="true">+</span>
                New library
              </button>
            )}

            <div className="lib-pop-divider" />

            <fieldset className="lib-dest">
              <legend className="lib-pop-label">Save new bookmarks to</legend>
              <label className="lib-radio">
                <input type="radio" name="lib-dest" checked={mode === 'manual'} onChange={() => setMode('manual')} />
                <span className="lib-radio-text">
                  <span className="lib-radio-title">A library I pick</span>
                  {mode === 'manual' && (
                    multiple ? (
                      <select
                        className="lib-select"
                        aria-label="Library for new bookmarks"
                        value={savingProfileId}
                        onChange={e => saveTo(e.target.value)}
                      >
                        {profiles.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    ) : (
                      <span className="lib-radio-hint">Everything goes into {saving?.label ?? 'Default'}.</span>
                    )
                  )}
                </span>
              </label>
              <label className="lib-radio">
                <input type="radio" name="lib-dest" checked={mode === 'auto'} onChange={() => setMode('auto')} />
                <span className="lib-radio-text">
                  <span className="lib-radio-title">One library per X account</span>
                  {mode === 'auto' && (
                    <span className="lib-radio-hint">
                      Whichever account you're logged into on X gets its own library.
                      {defaultProfile && !defaultProfile.handle && <> {defaultProfile.label} goes to the first account you save from.</>}
                    </span>
                  )}
                </span>
              </label>
            </fieldset>

            <p className="lib-pop-note">
              Libraries aren't locked. Anyone using this browser profile can open all of them.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        isOpen={Boolean(deleting)}
        title={`Delete "${deleting?.label ?? ''}"?`}
        message="This permanently deletes every bookmark, category and note in this library. Export it first if you want a copy."
        confirmText="Delete library"
        isDanger
        onConfirm={async () => { if (deletingId) await remove(deletingId); setDeletingId(null); }}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
};

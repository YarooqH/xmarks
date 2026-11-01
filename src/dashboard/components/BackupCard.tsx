import React, { useEffect, useState } from 'react';
import { MSG } from '../../messages';
import {
  BACKUP_FOLDER, BACKUP_LOG_KEY, BACKUP_SETTINGS_KEY, BACKUPS_KEPT_PER_LIBRARY, loadBackupLog, loadBackupSettings,
  normalizeBackupLog, normalizeBackupSettings, saveBackupSettings, type BackupFrequency, type BackupSettings,
} from '../../backup/settings';
import { InfoTooltip } from './InfoTooltip';

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Chrome only shows the permission prompt during a click, so this must be the first await in a click handler.
const allowDownloads = () => chrome.permissions.request({ permissions: ['downloads'] });

export const BackupCard: React.FC = () => {
  const [settings, setSettings] = useState<BackupSettings>(() => normalizeBackupSettings(undefined));
  const [log, setLog] = useState(() => normalizeBackupLog(undefined));
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    loadBackupSettings().then(setSettings);
    loadBackupLog().then(setLog);
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (changes[BACKUP_SETTINGS_KEY]) setSettings(normalizeBackupSettings(changes[BACKUP_SETTINGS_KEY].newValue));
      if (changes[BACKUP_LOG_KEY]) setLog(normalizeBackupLog(changes[BACKUP_LOG_KEY].newValue));
    };
    chrome.storage?.onChanged?.addListener(onChanged);
    return () => chrome.storage?.onChanged?.removeListener(onChanged);
  }, []);

  const update = (next: BackupSettings) => {
    setSettings(next);
    saveBackupSettings(next);
  };

  const run = async () => {
    setRunning(true);
    setNotice(null);
    try {
      const result = await chrome.runtime.sendMessage({ type: MSG.RUN_BACKUP });
      if (!result?.success) setNotice({ text: result?.error ?? 'The backup failed. Try again.', error: true });
      else if (result.written === 0) setNotice({ text: 'Nothing to back up yet. Save a post first.' });
      else setNotice({ text: `Saved ${result.written} ${result.written === 1 ? 'file' : 'files'} to ${BACKUP_FOLDER}.` });
    } catch {
      setNotice({ text: 'The backup failed. Try again.', error: true });
    } finally {
      setRunning(false);
    }
  };

  const toggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked;
    if (enabled && !(await allowDownloads())) {
      setNotice({ text: 'Backups need permission to save files to your Downloads folder.', error: true });
      return;
    }
    update({ ...settings, enabled });
    // The first backup happens right away, so there's a file before the first scheduled one.
    if (enabled) run();
    else setNotice(null);
  };

  const backUpNow = async () => {
    if (!(await allowDownloads())) {
      setNotice({ text: 'Backups need permission to save files to your Downloads folder.', error: true });
      return;
    }
    run();
  };

  const lastFile = log.files[0]?.createdAt;
  const status = log.lastError
    ? { text: log.lastError, error: true }
    : lastFile
      ? { text: `Last backup ${formatWhen(lastFile)}` }
      : { text: 'No backups yet' };
  const shown = notice ?? status;

  return (
    <div className="settings-card backup-card">
      <div className="settings-card-title" style={{ display: 'flex', alignItems: 'center' }}>
        Backups
        <InfoTooltip text="Writes a copy of every library to your computer, so your bookmarks survive even if XMarks is removed." />
      </div>

      <div className="backup-body">
        <div className="toggle-row backup-toggle-row">
          <span className="toggle-label">Back up automatically</span>
          <label className="toggle-switch">
            <input type="checkbox" checked={settings.enabled} onChange={toggle} aria-label="Back up automatically" />
            <span className="toggle-slider" />
          </label>
        </div>

        {settings.enabled && (
          <select
            className="lib-select"
            aria-label="How often to back up"
            value={settings.frequency}
            onChange={e => update({ ...settings, frequency: e.target.value as BackupFrequency })}
          >
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
          </select>
        )}

        <p className={`backup-status ${shown.error ? 'is-error' : ''}`} aria-live="polite">{shown.text}</p>

        <button type="button" className="btn btn-ghost backup-now" onClick={backUpNow} disabled={running}>
          {running ? 'Backing up…' : 'Back up now'}
        </button>

        <p className="backup-hint">
          Files go to Downloads › {BACKUP_FOLDER}, keeping the {BACKUPS_KEPT_PER_LIBRARY} newest for each library. Bring one back with Import.
        </p>
      </div>
    </div>
  );
};

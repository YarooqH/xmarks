import { getProfileDb } from '../db';
import { loadProfilesState } from '../db/profiles';
import { createBookmarkRepository } from '../bookmarks/repository';
import { backupFileName, buildBackup } from '../dashboard/backup';
import { BACKUP_FOLDER, filesToPrune, loadBackupLog, saveBackupLog, type BackupFile } from './settings';

export const BACKUP_ALARM = 'xmarks-auto-backup';

export type BackupRunResult = { written: number };

// A service worker can't make blob: URLs, but chrome.downloads accepts a data: URL.
function toDataUrl(json: string) {
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:application/json;base64,${btoa(binary)}`;
}

async function fingerprint(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

async function backUpLibraries(force: boolean): Promise<BackupRunResult> {
  const log = await loadBackupLog();
  const { profiles } = await loadProfilesState();
  const now = new Date();
  const files: BackupFile[] = [...log.files];
  const fingerprints = { ...log.fingerprints };
  let written = 0;

  try {
    if (!(await chrome.permissions.contains({ permissions: ['downloads'] }))) {
      throw new Error("XMarks isn't allowed to save files. Turn automatic backups off and on again to allow it.");
    }

    for (const profile of profiles) {
      const repo = createBookmarkRepository(() => getProfileDb(profile.id));
      const [bookmarks, categories] = await Promise.all([repo.all(), repo.listCategories()]);
      // An emptied library is skipped so it can never push the good backups out of rotation.
      if (!bookmarks.length) continue;
      const print = await fingerprint(JSON.stringify([categories, bookmarks]));
      if (!force && fingerprints[profile.id] === print) continue;

      const downloadId = await chrome.downloads.download({
        url: toDataUrl(JSON.stringify(buildBackup(bookmarks, categories))),
        filename: `${BACKUP_FOLDER}/${backupFileName({ date: now, library: profile.label })}`,
        conflictAction: 'uniquify',
        saveAs: false,
      });
      files.unshift({ downloadId, profileId: profile.id, createdAt: now.toISOString() });
      fingerprints[profile.id] = print;
      written++;
    }

    const pruned = filesToPrune(files);
    for (const file of pruned) {
      // The file may already be moved or deleted by the user; either way it leaves the download list.
      await chrome.downloads.removeFile(file.downloadId).catch(() => {});
      await chrome.downloads.erase({ id: file.downloadId }).catch(() => {});
    }

    await saveBackupLog({ lastRunAt: now.toISOString(), files: files.filter(f => !pruned.includes(f)), fingerprints });
    return { written };
  } catch (error) {
    // lastRunAt stays put, so the hourly check tries again.
    await saveBackupLog({ ...log, files, fingerprints, lastError: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

let running: Promise<BackupRunResult> | null = null;

/** Writes a file for each library that has posts and changed since its last backup. `force` writes unchanged ones too. */
export function runBackup({ force = false } = {}) {
  running ??= backUpLibraries(force).finally(() => { running = null; });
  return running;
}

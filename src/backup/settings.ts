// Automatic backups. The dashboard writes the settings and only the background writes the log;
// they live under separate keys so neither can overwrite the other's change.

export type BackupFrequency = 'daily' | 'weekly';

export type BackupSettings = {
  enabled: boolean;
  frequency: BackupFrequency;
};

export type BackupFile = {
  downloadId: number;
  profileId: string;
  createdAt: string;
};

export type BackupLog = {
  // When the last run finished without an error, whether or not it wrote anything.
  lastRunAt?: string;
  lastError?: string;
  // Files XMarks wrote and may later delete. Nothing outside this list is ever removed.
  files: BackupFile[];
  // Fingerprint of each library's contents at its last backup, so an unchanged library isn't written again.
  fingerprints: Record<string, string>;
};

export const BACKUP_SETTINGS_KEY = 'xmarks_backup_settings';
export const BACKUP_LOG_KEY = 'xmarks_backup_log';
export const BACKUP_FOLDER = 'XMarks backups';
export const BACKUPS_KEPT_PER_LIBRARY = 7;

const HOUR = 60 * 60 * 1000;
const INTERVAL: Record<BackupFrequency, number> = { daily: 24 * HOUR, weekly: 7 * 24 * HOUR };

export function normalizeBackupSettings(raw: unknown): BackupSettings {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<BackupSettings>;
  return { enabled: input.enabled === true, frequency: input.frequency === 'weekly' ? 'weekly' : 'daily' };
}

export function normalizeBackupLog(raw: unknown): BackupLog {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<BackupLog>;
  const files = (Array.isArray(input.files) ? input.files : []).filter(
    (f): f is BackupFile => Boolean(f) && typeof f.downloadId === 'number' && typeof f.profileId === 'string' && typeof f.createdAt === 'string'
  );
  return {
    lastRunAt: typeof input.lastRunAt === 'string' ? input.lastRunAt : undefined,
    lastError: typeof input.lastError === 'string' ? input.lastError : undefined,
    files,
    fingerprints: input.fingerprints && typeof input.fingerprints === 'object' ? input.fingerprints : {},
  };
}

// The check runs hourly, so allow an hour of slack or a daily backup would drift later every day.
export function isBackupDue(settings: BackupSettings, log: BackupLog, now = Date.now()) {
  if (!settings.enabled) return false;
  if (!log.lastRunAt) return true;
  return now - Date.parse(log.lastRunAt) >= INTERVAL[settings.frequency] - HOUR;
}

/** The files past the newest `keep` of each library. */
export function filesToPrune(files: BackupFile[], keep = BACKUPS_KEPT_PER_LIBRARY): BackupFile[] {
  const seen = new Map<string, number>();
  return [...files]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter(file => {
      const count = (seen.get(file.profileId) ?? 0) + 1;
      seen.set(file.profileId, count);
      return count > keep;
    });
}

function load<T>(key: string, normalize: (raw: unknown) => T): Promise<T> {
  const storage = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
  if (!storage) return Promise.resolve(normalize(undefined));
  return new Promise(resolve => storage.get(key, result => resolve(normalize(result?.[key]))));
}

function save(key: string, value: unknown): Promise<void> {
  const storage = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
  if (!storage) return Promise.resolve();
  return new Promise(resolve => storage.set({ [key]: value }, () => resolve()));
}

export const loadBackupSettings = () => load(BACKUP_SETTINGS_KEY, normalizeBackupSettings);
export const saveBackupSettings = (settings: BackupSettings) => save(BACKUP_SETTINGS_KEY, settings);
export const loadBackupLog = () => load(BACKUP_LOG_KEY, normalizeBackupLog);
export const saveBackupLog = (log: BackupLog) => save(BACKUP_LOG_KEY, log);

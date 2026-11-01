import { describe, expect, it } from 'vitest';
import { filesToPrune, isBackupDue, normalizeBackupLog, normalizeBackupSettings, type BackupFile } from './settings';

const HOUR = 60 * 60 * 1000;
const now = Date.parse('2026-10-30T12:00:00Z');
const ago = (hours: number) => new Date(now - hours * HOUR).toISOString();
const log = (lastRunAt?: string) => ({ ...normalizeBackupLog(undefined), lastRunAt });

describe('normalizeBackupSettings', () => {
  it('defaults to off and daily', () => {
    expect(normalizeBackupSettings(undefined)).toEqual({ enabled: false, frequency: 'daily' });
    expect(normalizeBackupSettings({ enabled: 'yes', frequency: 'hourly' })).toEqual({ enabled: false, frequency: 'daily' });
  });
});

describe('normalizeBackupLog', () => {
  it('drops malformed file records', () => {
    const parsed = normalizeBackupLog({ files: [{ downloadId: 1, profileId: 'default', createdAt: ago(1) }, { downloadId: '2' }, null] });
    expect(parsed.files).toHaveLength(1);
    expect(parsed.fingerprints).toEqual({});
  });
});

describe('isBackupDue', () => {
  const daily = { enabled: true, frequency: 'daily' as const };
  const weekly = { enabled: true, frequency: 'weekly' as const };

  it('never runs while turned off', () => {
    expect(isBackupDue({ enabled: false, frequency: 'daily' }, log(), now)).toBe(false);
  });

  it('runs straight away when there has never been a backup', () => {
    expect(isBackupDue(daily, log(), now)).toBe(true);
  });

  it('allows an hour of slack so the hourly check does not drift', () => {
    expect(isBackupDue(daily, log(ago(22)), now)).toBe(false);
    expect(isBackupDue(daily, log(ago(23)), now)).toBe(true);
  });

  it('waits a week on the weekly schedule', () => {
    expect(isBackupDue(weekly, log(ago(24 * 3)), now)).toBe(false);
    expect(isBackupDue(weekly, log(ago(24 * 7)), now)).toBe(true);
  });
});

describe('filesToPrune', () => {
  const file = (downloadId: number, profileId: string, hoursAgo: number): BackupFile => ({ downloadId, profileId, createdAt: ago(hoursAgo) });

  it('keeps the newest files of each library and returns the rest', () => {
    const files = [file(1, 'default', 3), file(2, 'default', 1), file(3, 'default', 2), file(4, 'work', 5)];
    expect(filesToPrune(files, 2).map(f => f.downloadId)).toEqual([1]);
  });

  it('counts each library separately', () => {
    const files = [file(1, 'default', 1), file(2, 'work', 2), file(3, 'work', 3)];
    expect(filesToPrune(files, 1).map(f => f.downloadId)).toEqual([3]);
  });
});

import { describe, expect, it } from 'vitest';
import type { Bookmark, Category } from '../db';
import { backupFileName, buildBackup, parseBackup } from './backup';

const cat = (id: string, name: string): Category => ({ id, name, color: '#1d9bf0', createdAt: new Date('2026-01-01'), sortOrder: 1 });
const bm = (id: string, categoryIds: string[] = []): Bookmark => ({
  id,
  tweetUrl: `https://x.com/a/status/${id}`,
  authorHandle: 'a',
  text: `post ${id}`,
  savedAt: new Date('2026-02-01'),
  categoryIds,
  tags: ['t'],
  note: 'n',
  media: [],
  source: 'extension',
});

// What a backup looks like after a trip through a .json file.
const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('backupFileName', () => {
  const date = new Date(2026, 9, 3, 9, 5);

  it('stamps the local date and time', () => {
    expect(backupFileName({ date })).toBe('xmarks-backup-2026-10-03_09-05.json');
  });

  it('adds the library name and a suffix when given', () => {
    expect(backupFileName({ date, library: '@Some_Handle', suffix: '3-selected' })).toBe('xmarks-backup-some-handle-2026-10-03_09-05-3-selected.json');
    expect(backupFileName({ date, library: 'Work & Play' })).toBe('xmarks-backup-work-play-2026-10-03_09-05.json');
  });
});

describe('buildBackup', () => {
  it('includes every category for a full export', () => {
    const backup = buildBackup([bm('1', ['c1'])], [cat('c1', 'Dev'), cat('c2', 'Design')]);
    expect(backup.app).toBe('xmarks');
    expect(backup.categories.map(c => c.id)).toEqual(['c1', 'c2']);
  });

  it('includes only the categories the selected posts use', () => {
    const backup = buildBackup([bm('1', ['c2'])], [cat('c1', 'Dev'), cat('c2', 'Design')], true);
    expect(backup.categories.map(c => c.id)).toEqual(['c2']);
  });
});

describe('parseBackup', () => {
  it('restores categories, notes, tags and dates into an empty browser', () => {
    const file = roundTrip(buildBackup([bm('1', ['c1'])], [cat('c1', 'Dev')]));
    const { bookmarks, categories } = parseBackup(file, []);

    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe('Dev');
    expect(categories[0].createdAt).toBeInstanceOf(Date);
    expect(bookmarks[0].categoryIds).toEqual(['c1']);
    expect(bookmarks[0].note).toBe('n');
    expect(bookmarks[0].tags).toEqual(['t']);
    expect(bookmarks[0].savedAt).toBeInstanceOf(Date);
  });

  it('still accepts old files that are a bare array of bookmarks', () => {
    const { bookmarks, categories } = parseBackup(roundTrip([bm('1', ['c1'])]), []);
    expect(bookmarks).toHaveLength(1);
    expect(categories).toEqual([]);
  });

  it('merges an imported category into an existing one with the same name', () => {
    const file = roundTrip(buildBackup([bm('1', ['other-id'])], [cat('other-id', 'design')]));
    const { bookmarks, categories } = parseBackup(file, [cat('mine', 'Design')]);

    expect(categories).toEqual([]);
    expect(bookmarks[0].categoryIds).toEqual(['mine']);
  });

  it('keeps a category whose id already exists here, so its edits come across', () => {
    const file = roundTrip(buildBackup([bm('1', ['c1'])], [cat('c1', 'Renamed')]));
    const { categories } = parseBackup(file, [cat('c1', 'Dev')]);
    expect(categories.map(c => c.name)).toEqual(['Renamed']);
  });

  it('rejects files that are not a backup', () => {
    expect(() => parseBackup({ hello: 'world' }, [])).toThrow();
    expect(() => parseBackup(null, [])).toThrow();
  });

  it('skips rows without an id', () => {
    const { bookmarks } = parseBackup([{ text: 'no id' }, roundTrip(bm('2'))], []);
    expect(bookmarks.map(b => b.id)).toEqual(['2']);
  });
});

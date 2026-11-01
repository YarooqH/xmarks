// JSON backup format for Export / Import in the dashboard.
//
// Version 1 carries the categories as well as the bookmarks, so a library
// moved to another browser keeps its category names and colors. Files from
// before version 1 are a bare array of bookmarks; import still accepts them.

import type { Bookmark, Category } from '../db';

export const BACKUP_VERSION = 1;

export type Backup = {
  app: 'xmarks';
  version: number;
  exportedAt: string;
  categories: Category[];
  bookmarks: Bookmark[];
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date and time for file names, e.g. 2026-10-30_14-25. Windows doesn't allow ":" in names. */
export const fileTimestamp = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;

const slug = (label: string) => label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

/** e.g. xmarks-backup-work-2026-10-30_14-25.json. The library part is left out when there's no library name. */
export function backupFileName({ date = new Date(), library, suffix }: { date?: Date; library?: string; suffix?: string } = {}) {
  return `${['xmarks-backup', library && slug(library), fileTimestamp(date), suffix].filter(Boolean).join('-')}.json`;
}

/** Build a backup. Only categories used by the given bookmarks are included when `onlyUsedCategories` is set. */
export function buildBackup(bookmarks: Bookmark[], categories: Category[], onlyUsedCategories = false): Backup {
  const used = new Set(bookmarks.flatMap(b => b.categoryIds ?? []));
  return {
    app: 'xmarks',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    categories: onlyUsedCategories ? categories.filter(c => used.has(c.id)) : categories,
    bookmarks,
  };
}

const toDate = (value: unknown) => (value ? new Date(value as string) : undefined);

function reviveBookmark(raw: any): Bookmark {
  return {
    ...raw,
    categoryIds: Array.isArray(raw.categoryIds) ? raw.categoryIds : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    media: Array.isArray(raw.media) ? raw.media : [],
    savedAt: toDate(raw.savedAt) ?? new Date(),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
    deletedAt: toDate(raw.deletedAt),
  };
}

function reviveCategory(raw: any): Category {
  return {
    ...raw,
    createdAt: toDate(raw.createdAt) ?? new Date(),
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : Date.now(),
    updatedAt: toDate(raw.updatedAt),
    deletedAt: toDate(raw.deletedAt),
  };
}

/**
 * Turn a parsed backup file into rows ready to store.
 *
 * An imported category whose name matches an existing one (ignoring case) but
 * has a different id is merged into the existing category, so importing into
 * a browser that already has "Design" doesn't create a second "Design".
 */
export function parseBackup(json: unknown, existingCategories: Category[]): { bookmarks: Bookmark[]; categories: Category[] } {
  const isLegacy = Array.isArray(json);
  const file = json as Partial<Backup> | null;
  if (!isLegacy && !(file && Array.isArray(file.bookmarks))) {
    throw new Error('Not an XMarks backup');
  }

  const rawBookmarks: any[] = isLegacy ? (json as any[]) : file!.bookmarks!;
  const rawCategories: any[] = isLegacy || !Array.isArray(file!.categories) ? [] : file!.categories!;

  const byId = new Map(existingCategories.map(c => [c.id, c]));
  const byName = new Map(existingCategories.map(c => [c.name.trim().toLowerCase(), c]));
  const remap = new Map<string, string>();
  const categories: Category[] = [];

  for (const raw of rawCategories) {
    if (!raw?.id || typeof raw.name !== 'string') continue;
    const sameName = byName.get(raw.name.trim().toLowerCase());
    if (!byId.has(raw.id) && sameName) {
      remap.set(raw.id, sameName.id);
      continue;
    }
    categories.push(reviveCategory(raw));
  }

  const bookmarks = rawBookmarks
    .filter(b => b && typeof b.id === 'string')
    .map(reviveBookmark)
    .map(b => (remap.size ? { ...b, categoryIds: [...new Set(b.categoryIds.map(id => remap.get(id) ?? id))] } : b));

  return { bookmarks, categories };
}

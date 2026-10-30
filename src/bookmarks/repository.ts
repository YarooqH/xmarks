import { db as activeDb, type Bookmark, type Category, type TwitterBookmarkDatabase } from '../db';

export type BookmarkSaveInput = Partial<Bookmark> & Pick<Bookmark, 'id'>;
export type BookmarkPatch = Partial<Pick<Bookmark, 'categoryIds' | 'note' | 'tags'>>;

const now = () => new Date();

export function normalizeBookmark(input: BookmarkSaveInput, source: Bookmark['source'] = 'extension'): Bookmark {
  return {
    id: input.id,
    tweetUrl: input.tweetUrl || '',
    authorHandle: input.authorHandle || '',
    authorName: input.authorName,
    text: input.text,
    createdAt: input.createdAt,
    savedAt: input.savedAt || now(),
    categoryIds: input.categoryIds || [],
    tags: input.tags || [],
    note: input.note,
    media: input.media || [],
    quotedTweet: input.quotedTweet,
    articles: input.articles,
    source: input.source || source,
    authorAvatarUrl: input.authorAvatarUrl,
    archived: input.archived,
    userId: input.userId,
    updatedAt: input.updatedAt,
    deletedAt: input.deletedAt,
    syncStatus: input.syncStatus,
  };
}

async function save(db: TwitterBookmarkDatabase, input: BookmarkSaveInput) {
  const existing = await db.bookmarks.get(input.id);
  if (existing) {
    const patch: BookmarkPatch = {};
    if (input.categoryIds) patch.categoryIds = input.categoryIds;
    if (input.note !== undefined) patch.note = input.note;
    if (input.tags) patch.tags = input.tags;
    const refreshed: Partial<Bookmark> = { ...patch };
    if (input.tweetUrl) refreshed.tweetUrl = input.tweetUrl;
    // Article posts saved before previews existed have the cover or body images as media and no
    // article. Saving one again replaces those with the fresh scrape.
    if (input.articles?.some(art => art.kind === 'x-article')) {
      refreshed.articles = input.articles;
      refreshed.media = input.media || [];
    }
    if (Object.keys(refreshed).length > 0) await db.bookmarks.update(input.id, refreshed);
    return { bookmark: (await db.bookmarks.get(input.id))!, created: false };
  }

  const bookmark = normalizeBookmark(input);
  await db.bookmarks.add(bookmark);
  return { bookmark, created: true };
}

async function importBatch(db: TwitterBookmarkDatabase, inputs: BookmarkSaveInput[]) {
  return db.transaction('rw', db.bookmarks, db.categories, async () => {
    let importCategory = await db.categories.get('cat_imported');
    if (!importCategory) {
      importCategory = {
        id: 'cat_imported',
        name: 'Imported from X',
        createdAt: now(),
        sortOrder: 999,
      } satisfies Category;
      await db.categories.add(importCategory);
    }

    const validInputs = inputs.filter(input => Boolean(input.id));
    const existing = await db.bookmarks.bulkGet(validInputs.map(input => input.id));
    const existingIds = new Set(existing.filter(Boolean).map(bookmark => bookmark!.id));
    const newBookmarks = validInputs
      .filter(input => !existingIds.has(input.id))
      .map(input => normalizeBookmark({
        ...input,
        categoryIds: input.categoryIds?.length ? input.categoryIds : [importCategory!.id],
        source: 'x-bookmark-import',
      }, 'x-bookmark-import'));

    if (newBookmarks.length > 0) await db.bookmarks.bulkAdd(newBookmarks);
    return { bookmarks: newBookmarks, count: newBookmarks.length };
  });
}

export function createBookmarkRepository(getDb: () => TwitterBookmarkDatabase) {
  return {
    list: () => getDb().bookmarks.orderBy('savedAt').reverse().toArray(),
    get: (id: string) => getDb().bookmarks.get(id),
    getMany: (ids: string[]) => getDb().bookmarks.bulkGet(ids),
    save: (input: BookmarkSaveInput) => save(getDb(), input),
    importBatch: (inputs: BookmarkSaveInput[]) => importBatch(getDb(), inputs),
    update: (id: string, patch: BookmarkPatch) => getDb().bookmarks.update(id, patch),
    updateCategories: (ids: string[], categoryId: string | null) => {
      const db = getDb();
      return db.transaction('rw', db.bookmarks, async () => {
        await Promise.all(ids.map(id => db.bookmarks.update(id, { categoryIds: categoryId ? [categoryId] : [] })));
      });
    },
    delete: (id: string) => getDb().bookmarks.delete(id),
    deleteMany: (ids: string[]) => getDb().bookmarks.bulkDelete(ids),
    putMany: (bookmarks: Bookmark[]) => getDb().bookmarks.bulkPut(bookmarks),
    all: () => getDb().bookmarks.toArray(),
    listCategories: () => getDb().categories.toArray(),
    createCategory: (category: Category) => getDb().categories.add(category),
    /** Store an imported backup: categories first, so posts never point at a missing one. */
    importBackup: (categories: Category[], bookmarks: Bookmark[]) => {
      const db = getDb();
      return db.transaction('rw', db.bookmarks, db.categories, async () => {
        if (categories.length) await db.categories.bulkPut(categories);
        await db.bookmarks.bulkPut(bookmarks);
      });
    },
  };
}

// Follows the profile the current page is viewing (dashboard/popup).
export const bookmarkRepository = createBookmarkRepository(() => activeDb);

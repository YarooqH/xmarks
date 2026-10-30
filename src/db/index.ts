import Dexie from 'dexie';
import type { Table } from 'dexie';
import { DEFAULT_PROFILE_ID } from './profiles';
import { canonicalTweetUrl } from '../shared/tweetUrl';

export type MediaItem = {
  type: "image" | "video" | "gif";
  url: string;
  previewUrl?: string;
};

export type QuotedTweet = {
  id?: string;
  authorHandle: string;
  authorName?: string;
  authorAvatarUrl?: string;
  text?: string;
  tweetUrl?: string;
  media?: MediaItem[];
};

export type ArticleItem = {
  url: string;
  // 'x-article' is a long-form X Article; anything else is a link card.
  kind?: 'x-article';
  title?: string;
  domain?: string;
  snippet?: string;
  thumbnailUrl?: string;
};

export type Bookmark = {
  id: string; // Tweet ID; primary key
  tweetUrl: string;
  authorHandle: string;
  authorName?: string;
  text?: string;
  createdAt?: Date;
  savedAt: Date;
  categoryIds: string[];
  tags: string[];
  note?: string;
  media: MediaItem[];
  quotedTweet?: QuotedTweet;
  articles?: ArticleItem[];
  source: "extension" | "x-bookmark-import";
  archived?: boolean;
  authorAvatarUrl?: string;
  // Sync fields
  userId?: string;
  updatedAt?: Date;
  deletedAt?: Date;
  syncStatus?: 'pending' | 'synced' | 'conflict';
};

export type Category = {
  id: string;
  name: string;
  color?: string;
  createdAt: Date;
  sortOrder: number;
  // Sync fields
  userId?: string;
  updatedAt?: Date;
  deletedAt?: Date;
  syncStatus?: 'pending' | 'synced' | 'conflict';
};

export { DEFAULT_PROFILE_ID };

// The default profile keeps the original database name so existing libraries are untouched.
export const dbNameForProfile = (profileId: string) =>
  profileId === DEFAULT_PROFILE_ID ? 'TwitterBookmarkDB' : `XMarks_${profileId}`;

export class TwitterBookmarkDatabase extends Dexie {
  bookmarks!: Table<Bookmark, string>;
  categories!: Table<Category, string>;

  constructor(name = dbNameForProfile(DEFAULT_PROFILE_ID)) {
    super(name);
    this.version(2).stores({
      bookmarks: 'id, savedAt, *categoryIds, *tags, source, syncStatus',
      categories: 'id, sortOrder, syncStatus'
    });
    // Article posts used to save their views link (/status/<id>/analytics) as the tweet URL.
    this.version(3).stores({
      bookmarks: 'id, savedAt, *categoryIds, *tags, source, syncStatus',
      categories: 'id, sortOrder, syncStatus'
    }).upgrade(tx =>
      tx.table('bookmarks').toCollection().modify((bookmark: Bookmark) => {
        if (bookmark.tweetUrl) bookmark.tweetUrl = canonicalTweetUrl(bookmark.tweetUrl);
      })
    );
  }
}

const profileDbs = new Map<string, TwitterBookmarkDatabase>();

export function getProfileDb(profileId: string): TwitterBookmarkDatabase {
  let instance = profileDbs.get(profileId);
  if (!instance) {
    instance = new TwitterBookmarkDatabase(dbNameForProfile(profileId));
    profileDbs.set(profileId, instance);
  }
  return instance;
}

/**
 * The database the current page (dashboard/popup) is viewing. Reassigned by setActiveProfile;
 * ES live bindings mean every importer sees the new instance. The service worker does not use this:
 * it resolves the saving profile per message through getProfileDb.
 */
export let db = getProfileDb(DEFAULT_PROFILE_ID);

export function setActiveProfile(profileId: string) {
  db = getProfileDb(profileId);
}

// Closes the profile's connection and removes its IndexedDB. Never call for the profile being viewed.
export async function deleteProfileDb(profileId: string) {
  const instance = profileDbs.get(profileId) ?? new TwitterBookmarkDatabase(dbNameForProfile(profileId));
  profileDbs.delete(profileId);
  await instance.delete();
}

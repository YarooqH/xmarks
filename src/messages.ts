/**
 * Shared message-type contract between content scripts and the background service worker.
 *
 * Every chrome.runtime.sendMessage call uses one of these typed constants instead of a raw
 * string literal.  The discriminated union `ActionMessage` is the single source of truth
 * for the background listener so a rename or typo is caught at compile time.
 */
import type { Bookmark } from './db';

// ── Message type constants (use these instead of raw strings) ──────────────
export const MSG = {
  SAVE_TWEET:       'SAVE_TWEET',
  DELETE_BOOKMARK:  'DELETE_BOOKMARK',
  CHECK_TWEET_SAVED:'CHECK_TWEET_SAVED',
  IMPORT_BATCH:     'IMPORT_BATCH',
  GET_CATEGORIES:   'GET_CATEGORIES',
  CREATE_CATEGORY:  'CREATE_CATEGORY',
  OPEN_DASHBOARD:   'OPEN_DASHBOARD',
  RUN_BACKUP:       'RUN_BACKUP',
} as const;

export type MessageType = (typeof MSG)[keyof typeof MSG];

// ── Per-message payload shapes ─────────────────────────────────────────────
export type SaveTweetPayload       = Partial<Bookmark>;
export type DeleteBookmarkPayload  = { id: string };
export type CheckTweetSavedPayload = { id: string };
export type ImportBatchPayload     = Partial<Bookmark>[];
export type CreateCategoryPayload  = { name: string };

// ── Discriminated union (background handler's single source of truth) ──────
export type ActionMessage = (
  | { type: typeof MSG.SAVE_TWEET;        payload: SaveTweetPayload }
  | { type: typeof MSG.DELETE_BOOKMARK;    payload: DeleteBookmarkPayload }
  | { type: typeof MSG.CHECK_TWEET_SAVED; payload: CheckTweetSavedPayload }
  | { type: typeof MSG.IMPORT_BATCH;      payload: ImportBatchPayload }
  | { type: typeof MSG.GET_CATEGORIES }
  | { type: typeof MSG.CREATE_CATEGORY;   payload: CreateCategoryPayload }
  | { type: typeof MSG.OPEN_DASHBOARD }
  | { type: typeof MSG.RUN_BACKUP }
) & {
  // X handle the content script detected; the background uses it to pick a library in auto mode.
  accountHandle?: string;
};

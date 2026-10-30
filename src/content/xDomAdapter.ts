/**
 * xDomAdapter – Isolates X's volatile DOM behind a stable typed surface.
 *
 * Resolution order: stable attributes (data-testid) → accessible names (aria-label) →
 * structural heuristics. Every lookup returns a confidence-annotated result so
 * consumers can decide how to degrade when X changes its DOM.
 */

import { findPermalink, parseStatusHref } from '../shared/tweetUrl';

// ---- Types ----

export const ADAPTER_VERSION = 1;

export type ActionType = 'bookmark' | 'like' | 'retweet' | 'reply' | 'views' | 'share';
export type ActionState = 'saved' | 'unsaved' | 'neutral';

export interface AdapterResult<T = Element> {
  found: boolean;
  element?: T;
  confidence: 'high' | 'medium' | 'low';
}

export interface SemanticAction {
  action: ActionType;
  state: ActionState;
}

// ---- Versioned selector configuration ----

interface TestIdEntry {
  value: string;
  state: ActionState;
}

interface AriaLabelEntry {
  value: string;
  state: ActionState;
  /** If true, match exact aria-label; if false, case-insensitive contains */
  exact: boolean;
}

interface ActionSelectorConfig {
  testIds: TestIdEntry[];
  ariaLabels: AriaLabelEntry[];
  structural?: (actionBar: Element) => Element | null;
}

export const SELECTOR_CONFIG: Record<ActionType, ActionSelectorConfig> = {
  bookmark: {
    testIds: [
      { value: 'bookmark', state: 'unsaved' },
      { value: 'removeBookmark', state: 'saved' },
    ],
    ariaLabels: [
      { value: 'Bookmark', state: 'unsaved', exact: true },
      { value: 'Bookmarked', state: 'saved', exact: true },
      { value: 'Bookmark', state: 'unsaved', exact: false },
    ],
  },
  like: {
    testIds: [
      { value: 'like', state: 'unsaved' },
      { value: 'unlike', state: 'saved' },
    ],
    ariaLabels: [
      { value: 'Like', state: 'unsaved', exact: true },
      { value: 'Liked', state: 'saved', exact: true },
    ],
  },
  retweet: {
    testIds: [
      { value: 'retweet', state: 'neutral' },
      { value: 'unretweet', state: 'saved' },
    ],
    ariaLabels: [
      { value: 'Repost', state: 'neutral', exact: true },
      { value: 'Retweet', state: 'neutral', exact: true },
    ],
  },
  reply: {
    testIds: [{ value: 'reply', state: 'neutral' }],
    ariaLabels: [{ value: 'Reply', state: 'neutral', exact: true }],
  },
  views: {
    testIds: [
      { value: 'analytics', state: 'neutral' },
      { value: 'views', state: 'neutral' },
    ],
    ariaLabels: [],
    structural: (actionBar: Element) => actionBar.querySelector('a[href*="/analytics"]'),
  },
  share: {
    testIds: [{ value: 'share', state: 'neutral' }],
    ariaLabels: [
      { value: 'Share post', state: 'neutral', exact: true },
      { value: 'Share Tweet', state: 'neutral', exact: true },
      { value: 'Share', state: 'neutral', exact: true },
      { value: 'Share', state: 'neutral', exact: false },
    ],
  },
};

// ---- Public API ----

/** Find a single tweet element starting from an optional root. */
export function findTweet(root: Element = document.documentElement): AdapterResult<Element> {
  const el = root.querySelector('[data-testid="tweet"]');
  if (el) return { found: true, element: el, confidence: 'high' };
  return { found: false, confidence: 'low' };
}

/** Find all tweet elements starting from an optional root. */
export function findAllTweets(root: Element = document.documentElement): Element[] {
  return Array.from(root.querySelectorAll('[data-testid="tweet"]'));
}

/** Find the action bar (role="group") inside a tweet. */
export function findActionBar(tweet: Element): AdapterResult<Element> {
  const el = tweet.querySelector('[role="group"]');
  if (el) return { found: true, element: el, confidence: 'high' };
  return { found: false, confidence: 'low' };
}

/**
 * Find a specific action element inside an action bar.
 * Resolution: data-testid → aria-label exact → aria-label contains → structural.
 */
export function findAction(actionBar: Element, action: ActionType): AdapterResult<Element> {
  const config = SELECTOR_CONFIG[action];
  if (!config) return { found: false, confidence: 'low' };

  // Phase 1: data-testid (high confidence)
  for (const entry of config.testIds) {
    const el = actionBar.querySelector(`[data-testid="${entry.value}"]`);
    if (el) return { found: true, element: el, confidence: 'high' };
  }

  // Phase 2: aria-label exact (medium confidence)
  for (const entry of config.ariaLabels.filter(a => a.exact)) {
    const el = actionBar.querySelector(`[aria-label="${entry.value}"]`);
    if (el) return { found: true, element: el, confidence: 'medium' };
  }

  // Phase 3: aria-label case-insensitive contains (medium confidence)
  for (const entry of config.ariaLabels.filter(a => !a.exact)) {
    const el = actionBar.querySelector(`[aria-label*="${entry.value}" i]`);
    if (el) return { found: true, element: el, confidence: 'medium' };
  }

  // Phase 4: structural (low confidence)
  if (config.structural) {
    const el = config.structural(actionBar);
    if (el) return { found: true, element: el, confidence: 'low' };
  }

  return { found: false, confidence: 'low' };
}

/**
 * Determine the semantic state of an action (e.g., bookmark is saved or unsaved).
 * Returns null if the action element cannot be found.
 */
export function getActionState(actionBar: Element, action: ActionType): ActionState | null {
  const config = SELECTOR_CONFIG[action];
  if (!config) return null;

  // Phase 1: data-testid (highest priority for state detection)
  for (const entry of config.testIds) {
    if (actionBar.querySelector(`[data-testid="${entry.value}"]`)) {
      return entry.state;
    }
  }

  // Phase 2: aria-labels (exact, then contains)
  for (const entry of config.ariaLabels.filter(a => a.exact)) {
    if (actionBar.querySelector(`[aria-label="${entry.value}"]`)) {
      return entry.state;
    }
  }
  for (const entry of config.ariaLabels.filter(a => !a.exact)) {
    if (actionBar.querySelector(`[aria-label*="${entry.value}" i]`)) {
      return entry.state;
    }
  }

  return null;
}

/**
 * Extract tweet ID from a tweet element.
 * Resolution: the <time> permalink → a bare /status/<id> link → any status link.
 */
export function getTweetId(tweet: Element): AdapterResult<string> {
  // Phase 1: anchor with /status/ in href (high confidence)
  const timeLink = findPermalink(tweet);
  if (timeLink) {
    const parsed = parseStatusHref(timeLink.getAttribute('href') || '');
    if (parsed) return { found: true, element: parsed.id, confidence: 'high' };
  }

  return { found: false, confidence: 'low' };
}

/**
 * Get the direct child wrapper of the action bar that contains the target element.
 * Walks up from target until the parent is the action bar.
 */
export function getActionWrapper(actionBar: Element, target: Element): HTMLElement {
  let curr: HTMLElement = target as HTMLElement;
  while (curr.parentElement && curr.parentElement !== actionBar) {
    curr = curr.parentElement;
  }
  return curr;
}

/**
 * Score a candidate role="group" by counting how many native actions it
 * recognizes (reply, retweet, like, bookmark, share, views).
 */
export function scoreActionGroup(group: Element): number {
  const actionTypes: ActionType[] = ['reply', 'retweet', 'like', 'bookmark', 'share', 'views'];
  let score = 0;
  for (const action of actionTypes) {
    if (findAction(group, action).found) score++;
  }
  return score;
}

/** Minimum score to treat a role="group" as a real action bar. */
export const MIN_ACTION_BAR_SCORE = 3;

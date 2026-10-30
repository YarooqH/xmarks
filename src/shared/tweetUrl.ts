const STATUS_PATH = /^(?:https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com)?\/([A-Za-z0-9_]+)\/status\/(\d+)/i;

/** Pull the handle and status ID out of an X status href, absolute or relative. */
export function parseStatusHref(href: string): { handle: string; id: string } | null {
  const match = href.match(STATUS_PATH);
  if (!match) return null;
  return { handle: match[1], id: match[2] };
}

/**
 * Reduce any status link to https://x.com/<handle>/status/<id>. X hangs extra
 * segments off the status path (/analytics on the views count, /photo/N,
 * /video/N, /quotes, /history), and an article post's first status link in the
 * DOM is often the views one, so saving the raw href sent people to analytics.
 */
export function canonicalTweetUrl(href: string): string {
  const parsed = parseStatusHref(href);
  if (!parsed) return href;
  return `https://x.com/${parsed.handle}/status/${parsed.id}`;
}

/** An X Article's body, which can embed other tweets with their own permalinks. */
export const ARTICLE_BODY_SELECTOR = '[data-testid="twitterArticleRichTextView"]';

/**
 * The tweet's own permalink is the anchor wrapping its <time>. Links inside an
 * article body or a nested tweet belong to other posts and are skipped. In the
 * article reader the views link comes before the timestamp, so without a time
 * link prefer a bare /status/<id> over sub-pages like /analytics.
 */
export function findPermalink(tweet: Element): HTMLAnchorElement | null {
  const links = Array.from(tweet.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')).filter(a => {
    if (a.closest(ARTICLE_BODY_SELECTOR)) return false;
    const owner = a.closest('[data-testid="tweet"]');
    return !owner || owner === tweet || !tweet.contains(owner);
  });

  return links.find(a => a.querySelector('time'))
    || links.find(a => /\/status\/\d+\/?(?:[?#].*)?$/.test(a.getAttribute('href') || ''))
    || links[0]
    || null;
}

// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { extractTweetData } from './extract';
import { canonicalTweetUrl, findPermalink } from '../shared/tweetUrl';

// jsdom has no layout, so it leaves innerText undefined; textContent is close enough here.
beforeAll(() => {
  if (!('innerText' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      configurable: true,
      get(this: HTMLElement) { return this.textContent ?? ''; },
    });
  }
});

// Structures mirror what X rendered for article posts in October 2026, trimmed to
// the parts extraction reads.

const header = (handle: string) => `
  <div data-testid="User-Name">
    <a href="/${handle}"><span>Author</span></a>
    <a href="/${handle}"><span>@${handle}</span></a>
  </div>`;

/** Full article reader on the post's own page: views link first, timestamp after the body. */
function buildArticleReader(): HTMLElement {
  const el = document.createElement('article');
  el.setAttribute('data-testid', 'tweet');
  el.innerHTML = `
    ${header('writer')}
    <div data-testid="twitterArticleReadView">
      <a href="/writer/article/111/media/900"><img src="https://pbs.twimg.com/media/COVER?format=jpg&name=small"></a>
      <div data-testid="twitter-article-title">How I Shipped It</div>
      <a href="/writer/status/111/analytics">15K</a>
      <div data-testid="twitterArticleRichTextView">
        <p>This story starts in January.</p>
        <a href="/writer/article/111/media/901"><img src="https://pbs.twimg.com/media/BODY1?format=jpg&name=small"></a>
        <article data-testid="tweet">
          <div data-testid="simpleTweet">
            ${header('writer')}
            <a href="/writer/status/222"><time datetime="2026-09-01T10:00:00.000Z">Sep 1</time></a>
            <div data-testid="tweetText">An older tweet quoted in the article</div>
          </div>
        </article>
        <a href="https://x.com/writer/status/333">linked post</a>
      </div>
    </div>
    <a href="/writer/status/111"><time datetime="2026-10-11T09:00:00.000Z">Oct 11</time></a>
    <a href="/writer/status/111/analytics">15K Views</a>
    <a href="/writer/status/111/quotes">Quotes</a>`;
  return el;
}

/** Timeline card: tweet text, then [cover, text block] with title and excerpt. */
function buildArticleTimelineCard(): HTMLElement {
  const el = document.createElement('article');
  el.setAttribute('data-testid', 'tweet');
  el.innerHTML = `
    ${header('writer')}
    <a href="/writer/status/111"><time datetime="2026-10-11T09:00:00.000Z">Oct 11</time></a>
    <div data-testid="tweetText">I wrote about what finally worked</div>
    <div>
      <div data-testid="article-cover-image">
        <div><div style="background-image: url(&quot;https://pbs.twimg.com/media/COVER?format=jpg&amp;name=small&quot;);"></div>
        <img src="https://pbs.twimg.com/media/COVER?format=jpg&name=small"></div>
        <div><span>Article</span></div>
      </div>
      <div>
        <div><div><span>How I Shipped It</span></div></div>
        <div><span>This story starts in January.</span></div>
      </div>
    </div>
    <a href="/writer/status/111/analytics">15K</a>`;
  return el;
}

describe('canonicalTweetUrl', () => {
  it('drops sub-pages hung off the status path', () => {
    expect(canonicalTweetUrl('https://x.com/writer/status/111/analytics')).toBe('https://x.com/writer/status/111');
    expect(canonicalTweetUrl('/writer/status/111/photo/2')).toBe('https://x.com/writer/status/111');
    expect(canonicalTweetUrl('https://twitter.com/writer/status/111?s=20')).toBe('https://x.com/writer/status/111');
  });

  it('leaves non-status links alone', () => {
    expect(canonicalTweetUrl('https://x.com/i/article/42')).toBe('https://x.com/i/article/42');
  });
});

describe('findPermalink', () => {
  it('skips links inside the article body and embedded tweets', () => {
    expect(findPermalink(buildArticleReader())?.getAttribute('href')).toBe('/writer/status/111');
  });

  it('prefers a bare status link over /analytics when there is no timestamp', () => {
    const el = buildArticleReader();
    el.querySelector(':scope > a > time')!.remove();
    expect(findPermalink(el)?.getAttribute('href')).toBe('/writer/status/111');
  });
});

describe('extractTweetData for X Articles', () => {
  it('saves the post URL, not the views page, from the reader', () => {
    const data = extractTweetData(buildArticleReader())!;
    expect(data.id).toBe('111');
    expect(data.tweetUrl).toBe('https://x.com/writer/status/111');
    expect(data.createdAt?.toISOString()).toBe('2026-10-11T09:00:00.000Z');
  });

  it('builds the article preview from the reader without leaking body content', () => {
    const data = extractTweetData(buildArticleReader())!;
    expect(data.articles).toEqual([{
      url: 'https://x.com/writer/status/111',
      kind: 'x-article',
      title: 'How I Shipped It',
      domain: 'X Article',
      snippet: expect.stringContaining('This story starts in January.'),
      thumbnailUrl: 'https://pbs.twimg.com/media/COVER?format=jpg&name=medium',
    }]);
    expect(data.media).toEqual([]);
    expect(data.quotedTweet).toBeUndefined();
    // No tweet text in the reader, so the title stands in; the embedded tweet's text never does.
    expect(data.text).toBe('How I Shipped It');
  });

  it('falls back to the first body image when the article has no cover', () => {
    const el = buildArticleReader();
    el.querySelector('a[href$="/media/900"]')!.remove();
    expect(extractTweetData(el)!.articles![0].thumbnailUrl).toBe('https://pbs.twimg.com/media/BODY1?format=jpg&name=medium');
  });

  it('builds the article preview from the timeline card and keeps the tweet text', () => {
    const data = extractTweetData(buildArticleTimelineCard())!;
    expect(data.tweetUrl).toBe('https://x.com/writer/status/111');
    expect(data.text).toBe('I wrote about what finally worked');
    expect(data.media).toEqual([]);
    expect(data.articles).toEqual([expect.objectContaining({
      kind: 'x-article',
      title: 'How I Shipped It',
      snippet: 'This story starts in January.',
      thumbnailUrl: 'https://pbs.twimg.com/media/COVER?format=jpg&name=medium',
    })]);
  });
});

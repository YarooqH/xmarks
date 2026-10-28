// Links and addresses used across pages.

export const repoUrl = 'https://github.com/YarooqH/xmarks';
// No ?hl= so the store opens in the visitor's own language.
export const storeUrl = 'https://chromewebstore.google.com/detail/xmarks-bookmark-manager-f/hhdfgcjebkpakbcjaiikoceimfeogpih';
export const siteUrl = 'https://yarooqh.github.io/xmarks/';
export const issuesUrl = `${repoUrl}/issues`;

/** The base path with a trailing slash ('/' in dev, '/xmarks/' in production). */
export const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');

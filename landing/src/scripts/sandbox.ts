// "See it in action": a small working copy of XMarks. Save any post on the fake
// X timeline into any category (or a new one) with any note, then find it in the
// fake dashboard. Nothing leaves the page; Start over resets it.

type Category = { id: string; name: string; color: string };
type Post = { id: string; name: string; handle: string; av: string; text: string; time: string };
type Saved = { post: Post; cat: string | null; note: string; ago: number; fresh?: boolean };
type Data = { base: string; categories: Category[]; timeline: Post[]; library: (Post & { cat: string | null; note: string; ago: number })[] };

// Colors for categories made in the sandbox, picked in order.
const NEW_COLORS = ['#7856ff', '#00ba7c', '#ff7a00', '#f91880', '#1d9bf0', '#ffd400'];

export function initSandbox() {
  const root = document.querySelector<HTMLElement>('[data-sandbox]');
  if (!root) return;
  const data: Data = JSON.parse(root.dataset.sandbox!);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;

  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-sandbox-tabs] [role="tab"]'));
  const url = $('[data-url]');
  const views = { x: $('[data-view="x"]'), dash: $('[data-view="dash"]') };
  const feed = $('[data-feed-list]');
  const popTpl = $<HTMLTemplateElement>('[data-pop-tpl]');
  const toast = $('[data-toast]');
  const side = $('[data-side]');
  const list = $('[data-list]');
  const listTitle = $('[data-list-title]');
  const search = $<HTMLInputElement>('[data-search]');
  const hintTitle = $('[data-hint-title]');
  const hintBody = $('[data-hint-body]');
  const primary = $<HTMLButtonElement>('[data-primary]');
  const reset = $<HTMLButtonElement>('[data-reset]');

  let categories: Category[];
  let library: Saved[];
  let view: 'x' | 'dash';
  let filter: string; // 'all', 'none' or a category id
  let query: string;
  let last: Saved | null;
  let pop: { el: HTMLElement; book: HTMLButtonElement } | null = null;
  let toastTimer = 0;

  const catOf = (id: string | null) => categories.find((c) => c.id === id) ?? null;
  const catName = (id: string | null) => catOf(id)?.name ?? 'Uncategorized';

  function start() {
    categories = data.categories.map((c) => ({ ...c }));
    library = data.library.map(({ cat, note, ago, ...post }) => ({ post, cat, note, ago }));
    view = 'x';
    filter = 'all';
    query = '';
    last = null;
    search.value = '';
    closePop();
    toast.classList.remove('on');
    renderFeed();
    show('x');
  }

  // ---- X timeline ----

  function renderFeed() {
    for (const book of feed.querySelectorAll<HTMLButtonElement>('[data-book]')) {
      const saved = library.some((s) => s.post.id === book.dataset.book);
      book.classList.toggle('saved', saved);
      book.setAttribute('aria-label', saved ? 'Saved in XMarks. Change category or note' : 'Save to XMarks');
    }
  }

  function closePop(returnFocus = false) {
    if (!pop) return;
    const { el, book } = pop;
    el.remove();
    book.setAttribute('aria-expanded', 'false');
    pop = null;
    if (returnFocus) book.focus();
    hint();
  }

  function openPop(book: HTMLButtonElement) {
    const again = pop?.book === book;
    closePop();
    if (again) return;

    const el = popTpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
    const listEl = el.querySelector<HTMLElement>('[data-cats]')!;
    const nameIn = el.querySelector<HTMLInputElement>('[data-new-name]')!;
    const noteIn = el.querySelector<HTMLTextAreaElement>('[data-note]')!;
    const existing = library.find((s) => s.post.id === book.dataset.book);
    if (existing) noteIn.value = existing.note;

    const item = (c: Category | null) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pop-cat';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = c?.color ?? '#71767b';
      const label = document.createElement('span');
      label.className = 'pop-cat-name';
      label.textContent = c?.name ?? 'Uncategorized';
      b.append(dot, label);
      if (existing && existing.cat === (c?.id ?? null)) b.classList.add('current');
      b.addEventListener('click', () => save(book, c?.id ?? null, noteIn.value.trim()));
      return b;
    };
    listEl.append(item(null), ...categories.map(item));

    const add = () => {
      const name = nameIn.value.trim().slice(0, 40);
      if (!name) return nameIn.focus();
      let c = categories.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!c) {
        const used = new Set(categories.map((x) => x.color));
        const color = NEW_COLORS.find((x) => !used.has(x)) ?? NEW_COLORS[categories.length % NEW_COLORS.length];
        c = { id: `new-${Date.now()}`, name, color };
        categories.push(c);
        listEl.append(item(c));
      }
      nameIn.value = '';
      const btn = Array.from(listEl.children).find((b) => b.textContent === c!.name) as HTMLElement;
      btn.classList.add('added');
      btn.scrollIntoView({ block: 'nearest' });
      btn.focus({ preventScroll: true });
      hint(`“${name}” is ready`, 'Click it to save the post there. Your note goes with it.');
    };
    el.querySelector('[data-add]')!.addEventListener('click', add);
    nameIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closePop(true);
      }
    });

    book.closest('.post')!.append(el);
    book.setAttribute('aria-expanded', 'true');
    pop = { el, book };
    nameIn.focus({ preventScroll: true });
    // Keep the whole menu in view inside the feed.
    const fb = feed.getBoundingClientRect();
    const pb = el.getBoundingClientRect();
    if (pb.bottom > fb.bottom - 8) feed.scrollBy({ top: pb.bottom - fb.bottom + 16, behavior: reduced() ? 'auto' : 'smooth' });
    hint();
  }

  function save(book: HTMLButtonElement, cat: string | null, note: string) {
    const post = data.timeline.find((p) => p.id === book.dataset.book)!;
    library = library.filter((s) => s.post.id !== post.id);
    for (const s of library) s.fresh = false;
    last = { post, cat, note, ago: 0, fresh: true };
    library.unshift(last);
    closePop();
    renderFeed();
    book.focus({ preventScroll: true });
    filter = 'all';
    query = '';
    search.value = '';

    $('[data-toast-text]').textContent = `Saved to ${catName(cat)}`;
    toast.classList.remove('on');
    void toast.offsetWidth;
    toast.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('on'), 5000);
    hint();
  }

  feed.addEventListener('click', (e) => {
    const book = (e.target as Element).closest<HTMLButtonElement>('[data-book]');
    if (book) openPop(book);
  });

  document.addEventListener('click', (e) => {
    if (!pop) return;
    const t = e.target as Node;
    if (!pop.el.contains(t) && !pop.book.contains(t)) closePop();
  });

  $('[data-toast-view]').addEventListener('click', () => show('dash', true));

  // ---- Dashboard ----

  function ago(h: number) {
    if (h === 0) return 'saved just now';
    if (h < 24) return `saved ${h}h ago`;
    return `saved ${Math.round(h / 24)}d ago`;
  }

  // Writes text into el, wrapping each match of q in <mark>. Text only, never HTML.
  function put(el: HTMLElement, text: string, q: string) {
    el.textContent = '';
    if (!q) return void (el.textContent = text);
    const low = text.toLowerCase();
    let i = 0;
    for (let at = low.indexOf(q); at !== -1; at = low.indexOf(q, i)) {
      el.append(text.slice(i, at));
      const m = document.createElement('mark');
      m.textContent = text.slice(at, at + q.length);
      el.append(m);
      i = at + q.length;
    }
    el.append(text.slice(i));
  }

  function renderSide() {
    const count = (f: string) =>
      f === 'all' ? library.length : library.filter((s) => (f === 'none' ? s.cat === null : s.cat === f)).length;
    const row = (f: string, name: string, color?: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'side-item';
      b.setAttribute('aria-pressed', String(filter === f));
      if (color) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = color;
        b.append(dot);
      }
      const label = document.createElement('span');
      label.className = 'side-name';
      label.textContent = name;
      const n = document.createElement('span');
      n.className = 'side-n';
      n.textContent = String(count(f));
      if (color) n.style.setProperty('--c', color);
      b.append(label, n);
      b.addEventListener('click', () => {
        filter = f;
        renderDash();
        hint();
      });
      return b;
    };
    const head = document.createElement('p');
    head.className = 'side-head';
    head.textContent = 'Categories';
    side.replaceChildren(row('all', 'All Bookmarks'), row('none', 'Uncategorized'), head, ...categories.map((c) => row(c.id, c.name, c.color)));
  }

  function renderDash() {
    renderSide();
    const q = query.trim().toLowerCase();
    const shown = library.filter((s) => {
      if (filter === 'none' ? s.cat !== null : filter !== 'all' && s.cat !== filter) return false;
      if (!q) return true;
      const hay = [s.post.text, s.post.name, s.post.handle, s.note, catName(s.cat)].join('\n').toLowerCase();
      return hay.includes(q);
    });
    listTitle.textContent = filter === 'all' ? 'All Bookmarks' : catName(filter === 'none' ? null : filter);

    if (!shown.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = q ? `Nothing matches “${query.trim()}”.` : 'Nothing in here yet.';
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(
      ...shown.map((s) => {
        const card = document.createElement('article');
        card.className = 'card';
        if (s.fresh) card.classList.add('fresh');
        const av = document.createElement('img');
        av.className = 'av';
        av.src = `${data.base}avatars/${s.post.av}.webp`;
        av.alt = '';
        av.width = av.height = 36;
        const body = document.createElement('div');
        body.className = 'card-body';
        const who = document.createElement('p');
        who.className = 'who';
        const name = document.createElement('b');
        put(name, s.post.name, q);
        const handle = document.createElement('span');
        put(handle, `@${s.post.handle}`, q);
        who.append(name, ' ', handle);
        const text = document.createElement('p');
        text.className = 'text';
        put(text, s.post.text, q);
        body.append(who, text);
        if (s.note) {
          const note = document.createElement('p');
          note.className = 'note';
          const label = document.createElement('b');
          label.textContent = 'Note: ';
          const span = document.createElement('span');
          put(span, s.note, q);
          note.append(label, span);
          body.append(note);
        }
        const meta = document.createElement('p');
        meta.className = 'meta';
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.style.setProperty('--c', catOf(s.cat)?.color ?? '#71767b');
        badge.textContent = catName(s.cat);
        meta.append(badge, ago(s.ago));
        body.append(meta);
        card.append(av, body);
        return card;
      }),
    );
  }

  search.addEventListener('input', () => {
    query = search.value;
    renderDash();
    hint();
  });

  // ---- Shared ----

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function show(v: 'x' | 'dash', moveFocus = false) {
    view = v;
    if (v === 'x') closePop();
    for (const [k, el] of Object.entries(views)) el.hidden = k !== v;
    url.textContent = v === 'x' ? 'x.com/home' : 'XMarks · Dashboard';
    tabs.forEach((t) => {
      const on = t.dataset.target === v;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    toast.classList.remove('on');
    if (v === 'dash') {
      renderDash();
      list.scrollTop = 0;
      if (moveFocus) search.focus({ preventScroll: true });
      // The highlight on a new save plays once.
      window.setTimeout(() => last && (last.fresh = false), 50);
    }
    hint();
  }

  // The line under the window: a suggestion for what to try next, never a requirement.
  function hint(title?: string, body?: string) {
    let t = title;
    let b = body;
    let next: { label: string; go: 'x' | 'dash' } | null = null;

    if (!t) {
      if (view === 'x' && pop) {
        t = 'Pick a category to save';
        b = 'Any of them, or type a new one and click Add. Write a note first if you want one. Esc closes the menu.';
      } else if (view === 'x' && !last) {
        t = 'Save any post you like';
        b = 'Click the book in a post’s action bar. You choose the category and the note.';
        next = { label: 'Peek at the dashboard', go: 'dash' };
      } else if (view === 'x') {
        t = `Saved to ${catName(last!.cat)}`;
        b = 'Save another one, or open the dashboard and find it.';
        next = { label: 'Open the dashboard', go: 'dash' };
      } else if (!last) {
        t = 'Your library';
        b = 'Everything you save lands here, sorted into your categories. Go save something and come back.';
        next = { label: 'Back to X', go: 'x' };
      } else if (query.trim()) {
        const hit = list.querySelector('.card');
        t = hit ? 'Found it' : 'No luck';
        b = hit ? 'Search reads the post, the author, its category and your note.' : 'Try another word from the post or your note.';
        next = { label: 'Save another post', go: 'x' };
      } else {
        const word = last.note.split(/\s+/).find((w) => w.length > 3) ?? last.post.text.split(/\s+/).find((w) => w.length > 3);
        t = 'There it is, at the top';
        b = word
          ? `Try the search with a word from it, like “${word.replace(/[^\p{L}\p{N}'’-]/gu, '')}”, or filter by ${catName(last.cat)}.`
          : `Filter by ${catName(last.cat)}, or search for anything.`;
        next = { label: 'Save another post', go: 'x' };
      }
    }
    hintTitle.textContent = t!;
    hintBody.textContent = b!;
    primary.hidden = !next;
    if (next) {
      primary.textContent = next.label;
      primary.dataset.go = next.go;
    }
    reset.hidden = !last;
  }

  primary.addEventListener('click', () => show(primary.dataset.go as 'x' | 'dash', true));
  reset.addEventListener('click', () => {
    start();
    feed.scrollTop = 0;
  });

  tabs.forEach((tab, ti) => {
    tab.addEventListener('click', () => show(tab.dataset.target as 'x' | 'dash'));
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const to = tabs[(ti + step + tabs.length) % tabs.length];
      show(to.dataset.target as 'x' | 'dash');
      to.focus();
    });
  });

  start();
}

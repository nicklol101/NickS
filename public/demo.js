// Christmas Lists by Nick — demo mode
// "View demo" lets anyone try the app with a pretend family, no account needed.
// Everything runs in the browser only: nothing is sent to the server or saved.
'use strict';

const DEMO = { on: false, db: null, imgs: {} };
const DEMO_ME = 'demo-you';
let demoN = 0;
const demoId = () => 'd' + (++demoN) + Math.random().toString(36).slice(2, 7);

// Draw a simple product picture: a big emoji on a coloured square.
function demoPic(emoji, bg) {
  try {
    const c = document.createElement('canvas'); c.width = 400; c.height = 400;
    const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, 400, 400);
    x.font = '210px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(emoji, 200, 215);
    return c.toDataURL('image/png');
  } catch { return null; }
}

function demoSeed() {
  const db = {
    users: {
      'demo-you': { name: 'You (demo)', contacts: [{ type: 'Phone', value: '(555) 010-2025' }] },
      'demo-rosa': { name: 'Grandma Rosa', contacts: [{ type: 'Phone', value: '(555) 010-1111' }, { type: 'Gmail', value: 'grandma.rosa@example.com' }] },
      'demo-joe': { name: 'Uncle Joe', contacts: [{ type: 'Phone', value: '(555) 010-2222' }, { type: 'Hotmail', value: 'unclejoe@example.com' }] },
      'demo-mia': { name: 'Cousin Mia', contacts: [{ type: 'Phone', value: '(555) 010-3333' }] }
    },
    circles: {
      'demo-c1': { name: 'The Demo Family', code: 'DEMO25', members: ['demo-you', 'demo-rosa', 'demo-joe', 'demo-mia'], createdBy: 'demo-rosa' }
    },
    lists: {}, items: {}, claims: {}, views: {}
  };
  const t0 = Date.now() - 864e5 * 3;
  let k = 0;
  const list = (owner, title, emoji) => { const id = demoId(); db.lists[id] = { owner, title, emoji, circleIds: ['demo-c1'], createdAt: t0 + (k++) }; return id; };
  const item = (listId, title, price, pic, bg, link, alternatives, notes) => {
    const id = demoId(), imageId = demoId();
    const url = demoPic(pic, bg); if (url) DEMO.imgs[imageId] = url;
    db.items[id] = { listId, owner: db.lists[listId].owner, title, price, link, alternatives: alternatives || [], notes: notes || '', imageId: url ? imageId : null, createdAt: t0 + (k++) };
    return id;
  };
  const view = (iid, by) => { db.views[iid + '__' + by] = { itemId: iid, listId: db.items[iid].listId, by, at: t0 + (k++) }; };
  const claim = (iid, by) => { db.claims[iid] = { taken: true, by }; };
  const search = (site, q) => site + encodeURIComponent(q);
  const AMZ = 'https://www.amazon.com/s?k=', EBAY = 'https://www.ebay.com/sch/i.html?_nkw=', TGT = 'https://www.target.com/s?searchTerm=', WMT = 'https://www.walmart.com/search?q=';

  const rosa = list('demo-rosa', "Grandma's wishes", '🎄');
  const r1 = item(rosa, 'Cozy knit throw blanket', '$45', '🧶', '#f4d9c6', search(AMZ, 'knit throw blanket'), [{ label: 'Target', url: search(TGT, 'knit throw blanket') }], 'Something warm for the couch. Cream or red!');
  const r2 = item(rosa, 'Window bird feeder', '$30', '🐦', '#dcefe3', search(AMZ, 'window bird feeder'), [{ label: 'eBay', url: search(EBAY, 'window bird feeder') }]);
  const r3 = item(rosa, 'Large-print crossword book', '$12', '📖', '#efe6d2', search(AMZ, 'large print crossword book'));

  const joe = list('demo-joe', "Uncle Joe's list", '🎅');
  const j1 = item(joe, 'BBQ grill tool set', '$60', '🍖', '#f6d6cf', search(AMZ, 'bbq grill tool set'), [{ label: 'eBay', url: search(EBAY, 'bbq grill tool set') }, { label: 'Walmart', url: search(WMT, 'bbq grill tool set') }, { label: 'Target', url: search(TGT, 'bbq grill tool set') }], 'Stainless steel please');
  const j2 = item(joe, 'Electric coffee grinder', '$35', '☕', '#e9dccf', search(AMZ, 'electric coffee grinder'));

  const mia = list('demo-mia', "Mia's Christmas 2026", '⭐');
  const m1 = item(mia, 'Instant camera (pastel pink)', '$80', '📷', '#f9dbe6', search(AMZ, 'instant camera pink'), [{ label: 'Target', url: search(TGT, 'instant camera') }, { label: 'eBay', url: search(EBAY, 'instant camera pink') }]);
  const m2 = item(mia, 'Wireless headphones', '$99', '🎧', '#dfe3f6', search(AMZ, 'wireless headphones'));
  const m3 = item(mia, 'Oversized hoodie, size M', '$40', '👕', '#e4f0f6', search(AMZ, 'oversized hoodie'), [], 'Any dark color');

  const you = list('demo-you', 'My wishes', '🎁');
  const y1 = item(you, 'Nike Air Force 1, size 10', '$115', '👟', '#eeeeee', search(AMZ, 'nike air force 1'), [{ label: 'eBay', url: search(EBAY, 'nike air force 1 size 10') }]);
  item(you, 'Gaming controller', '$70', '🎮', '#e3dcf3', search(AMZ, 'wireless game controller'));

  // Some activity so the demo feels alive
  claim(r1, 'demo-joe'); claim(r2, DEMO_ME); claim(j1, 'demo-mia'); claim(m2, 'demo-rosa'); claim(y1, 'demo-mia');
  view(r1, 'demo-joe'); view(r1, 'demo-mia'); view(r2, DEMO_ME); view(j1, 'demo-mia'); view(j1, 'demo-rosa');
  view(m1, 'demo-rosa'); view(m2, 'demo-rosa'); view(y1, 'demo-mia'); view(y1, 'demo-joe');
  return db;
}

// Same shape as the real server's /api/state, with the same privacy rules.
function demoState() {
  const db = DEMO.db, uid = DEMO_ME;
  const mine = new Set(Object.entries(db.circles).filter(([, c]) => c.members.includes(uid)).map(([id]) => id));
  const circles = {}, lists = {}, items = {}, claims = {}, views = {}, people = {};
  const ppl = new Set([uid]);
  for (const id of mine) { circles[id] = db.circles[id]; db.circles[id].members.forEach((m) => ppl.add(m)); }
  for (const [id, l] of Object.entries(db.lists)) {
    if (l.owner === uid || l.circleIds.some((c) => mine.has(c))) { lists[id] = { ...l, circleIds: l.circleIds.filter((c) => l.owner === uid || mine.has(c)) }; ppl.add(l.owner); }
  }
  for (const [id, it] of Object.entries(db.items)) {
    if (!lists[it.listId]) continue;
    items[id] = it;
    const c = db.claims[id];
    if (it.owner !== uid && c && c.taken) claims[id] = { taken: true, mine: c.by === uid };
  }
  for (const [k, v] of Object.entries(db.views)) if (items[v.itemId]) { views[k] = v; ppl.add(v.by); }
  for (const p of ppl) if (db.users[p]) people[p] = db.users[p];
  const me = db.users[uid];
  return JSON.parse(JSON.stringify({
    me: { id: uid, name: me.name, email: 'demo@example.com', contacts: me.contacts, introSeen: true, isAdmin: false, mustChangePassword: false },
    people, circles, lists, items, claims, views
  }));
}

function demoCleanItem(b) {
  const title = String(b.title || '').trim().slice(0, 120);
  if (!title) throw new ApiError(400, 'Add a name for the item.');
  const isUrl = (u) => /^https?:\/\/\S+$/i.test(u);
  const link = String(b.link || '').trim();
  if (link && !isUrl(link)) throw new ApiError(400, 'The main link should start with https://');
  const alternatives = (b.alternatives || []).slice(0, 5).filter((a) => a && a.url);
  if (alternatives.some((a) => !isUrl(a.url))) throw new ApiError(400, 'Backup links should start with https://');
  return { title, link, alternatives, imageId: b.imageId || null, price: String(b.price || '').slice(0, 30), notes: String(b.notes || '').slice(0, 600) };
}

async function demoApi(path, opts = {}) {
  await new Promise((r) => setTimeout(r, 120));
  const db = DEMO.db, uid = DEMO_ME;
  const method = opts.method || (opts.body !== undefined || opts.raw ? 'POST' : 'GET');
  const b = opts.body || {};
  const seg = path.split('/').filter(Boolean);
  const fail = (s, m) => { throw new ApiError(s, m); };

  if (path === '/state') return demoState();
  if (path === '/logout') { exitDemo(); return { ok: true }; }
  if (path === '/intro-seen' || path === '/password') return { ok: true };
  if (seg[0] === 'admin') fail(403, 'Not available in the demo.');
  if (path === '/profile') {
    const name = String(b.name || '').trim().slice(0, 40);
    if (!name) fail(400, 'Enter your name.');
    db.users[uid] = { name, contacts: (b.contacts || []).slice(0, 20) };
    return { ok: true };
  }
  if (path === '/upload') { const id = demoId(); DEMO.imgs[id] = URL.createObjectURL(opts.raw); return { id }; }

  if (method === 'POST' && path === '/circles') {
    const name = String(b.name || '').trim().slice(0, 40);
    if (!name) fail(400, 'Give the circle a name.');
    const id = demoId(), code = Math.random().toString(36).slice(2, 8).toUpperCase();
    db.circles[id] = { name, code, members: [uid], createdBy: uid };
    return { id };
  }
  if (path === '/circles/join') {
    const code = String(b.code || '').trim().toUpperCase();
    const found = Object.entries(db.circles).find(([, c]) => c.code === code);
    if (!found) fail(404, 'No circle with that code. In the demo, try DEMO25.');
    if (!found[1].members.includes(uid)) found[1].members.push(uid);
    return { id: found[0], name: found[1].name };
  }
  if (seg[0] === 'circles' && seg[2] === 'leave') {
    const c = db.circles[seg[1]]; if (c) c.members = c.members.filter((m) => m !== uid);
    return { ok: true };
  }

  if (method === 'POST' && path === '/lists') {
    const title = String(b.title || '').trim().slice(0, 60);
    if (!title) fail(400, 'Give the list a name.');
    const id = demoId();
    db.lists[id] = { owner: uid, title, emoji: b.emoji || '🎁', circleIds: (b.circleIds || []).filter((c) => db.circles[c]), createdAt: Date.now() };
    return { id };
  }
  if (seg[0] === 'lists' && seg[1]) {
    const l = db.lists[seg[1]];
    if (!l || l.owner !== uid) fail(404, 'List not found.');
    if (method === 'DELETE') {
      for (const [iid, it] of Object.entries(db.items)) if (it.listId === seg[1]) { delete db.items[iid]; delete db.claims[iid]; }
      delete db.lists[seg[1]];
      return { ok: true };
    }
    const title = String(b.title || '').trim().slice(0, 60);
    if (!title) fail(400, 'Give the list a name.');
    Object.assign(l, { title, emoji: b.emoji || l.emoji, circleIds: (b.circleIds || []).filter((c) => db.circles[c]) });
    return { ok: true };
  }

  if (method === 'POST' && path === '/items') {
    const l = db.lists[b.listId];
    if (!l || l.owner !== uid) fail(404, 'List not found.');
    const id = demoId();
    db.items[id] = { ...demoCleanItem(b), listId: b.listId, owner: uid, createdAt: Date.now() };
    return { id };
  }
  if (seg[0] === 'items' && seg[1]) {
    const iid = seg[1], it = db.items[iid];
    if (!it) fail(404, 'That item was removed.');
    const action = seg[2] || '';
    if (!action) {
      if (it.owner !== uid) fail(404, 'Item not found.');
      if (method === 'DELETE') { delete db.items[iid]; delete db.claims[iid]; return { ok: true }; }
      Object.assign(it, demoCleanItem(b));
      return { ok: true };
    }
    if (action === 'view') { if (it.owner !== uid) db.views[iid + '__' + uid] = { itemId: iid, listId: it.listId, by: uid, at: Date.now() }; return { ok: true }; }
    if (action === 'claim') {
      if (it.owner === uid) fail(400, "You can't buy your own wish!");
      const c = db.claims[iid];
      if (c && c.taken && c.by !== uid) fail(409, 'Someone already took this one.');
      db.claims[iid] = { taken: true, by: uid };
      return { ok: true };
    }
    if (action === 'unclaim') { const c = db.claims[iid]; if (c && c.by === uid) delete db.claims[iid]; return { ok: true }; }
  }
  fail(404, 'Not found.');
}

function startDemo() {
  DEMO.on = true; DEMO.imgs = {}; DEMO.db = demoSeed();
  S.tab = 'lists'; S.route = null; S.introShown = true;
  refresh().then(() => toast('Welcome to the demo! 🎄 Nothing here is saved.'));
}
function exitDemo() {
  for (const u of Object.values(DEMO.imgs)) if (String(u).startsWith('blob:')) URL.revokeObjectURL(u);
  DEMO.on = false; DEMO.db = null; DEMO.imgs = {};
}

// ---------- hook into the app ----------

// Better duplicate detection for the Master list (used in real mode too):
// two links match only if site, path AND search terms match. Tracking bits
// (utm_*, ref, tag...) are ignored, and Amazon product links match by product id.
keyOf = function (it) {
  const u = safeUrl(it.link);
  if (u) {
    try {
      const x = new URL(u);
      const host = x.hostname.replace(/^www\./, '').toLowerCase();
      const asin = x.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
      if (host.includes('amazon.') && asin) return 'amz:' + asin[1].toUpperCase();
      const drop = /^(utm_|ref|tag|fbclid|gclid|psc|th|_encoding|qid|sr|crid|sprefix)/i;
      const params = [...x.searchParams].filter(([k]) => !drop.test(k)).sort().map(([k, v]) => k + '=' + v.toLowerCase()).join('&');
      return 'u:' + host + x.pathname.replace(/\/+$/, '').toLowerCase() + (params ? '?' + params : '');
    } catch {}
  }
  return 't:' + (it.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
};
const realApi = api;
api = function (path, opts) { return DEMO.on ? demoApi(path, opts || {}) : realApi(path, opts); };

const realImg = img;
img = function (id, cls = 'ph', emoji = '🎁') {
  if (DEMO.on && id && DEMO.imgs[id]) return h('img', { class: cls, src: DEMO.imgs[id], alt: '' });
  return realImg(id, cls, emoji);
};

const realRender = render;
render = function () {
  realRender();
  if (!DEMO.on || !S.me) return;
  $main.prepend(h('div', { class: 'installbar', style: 'background:#fff6e5;border-color:#f0d9a8' },
    h('span', { style: 'font-size:22px' }, '👀'),
    h('div', { class: 'grow' }, h('b', {}, 'Demo mode'), h('div', { class: 'sub' }, 'A pretend family to play with. Nothing you do here is saved.')),
    h('button', { class: 'btn sm', onclick: () => { exitDemo(); S.me = null; S.route = null; renderAuth('signup'); } }, 'Make my account')));
};

const realRenderAuth = renderAuth;
renderAuth = function (mode) {
  if (DEMO.on) exitDemo();
  realRenderAuth(mode);
  const card = document.querySelector('.auth .card');
  if (!card) return;
  card.append(
    h('div', { style: 'display:flex;align-items:center;gap:10px;margin:16px 0 12px;color:var(--muted);font-size:13px' },
      h('span', { style: 'flex:1;height:1px;background:var(--line)' }), 'or', h('span', { style: 'flex:1;height:1px;background:var(--line)' })),
    h('button', { class: 'btn g', type: 'button', style: 'width:100%;justify-content:center', onclick: startDemo }, '👀 View demo, no sign-up'),
    h('p', { class: 'sub', style: 'text-align:center;margin:8px 0 0' }, 'Try it with a pretend family first. Nothing is saved.'));
};

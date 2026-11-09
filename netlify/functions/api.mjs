// Christmas Lists by Nick — backend API
// Runs as one Netlify Function at /api/*  and stores everything in Netlify Blobs.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const config = { path: "/api/*" };

const SESSION_DAYS = 90;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// ---------- storage ----------
let _db, _img;
const db = () => (_db ||= getStore({ name: "xmas-data", consistency: "strong" }));
const imgs = () => (_img ||= getStore({ name: "xmas-images", consistency: "strong" }));

const getJSON = (key) => db().get(key, { type: "json" });
const putJSON = (key, val) => db().setJSON(key, val);
const del = (key) => db().delete(key);
async function listJSON(prefix) {
  const { blobs } = await db().list({ prefix });
  const out = await Promise.all(blobs.map(async (b) => [b.key.slice(prefix.length), await getJSON(b.key)]));
  return Object.fromEntries(out.filter(([, v]) => v));
}

// ---------- helpers ----------
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const fail = (status, error, headers) => json({ error }, status, headers);
const newId = () => crypto.randomBytes(12).toString("base64url");
const now = () => Date.now();
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isUrl = (u) => typeof u === "string" && /^https?:\/\/\S+$/i.test(u.trim());
const emailKey = (e) => crypto.createHash("sha256").update(e.toLowerCase()).digest("hex");

function genCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...crypto.randomBytes(6)].map((x) => a[x % a.length]).join("");
}

// ---------- sessions ----------
let _secret;
async function secret() {
  if (_secret) return _secret;
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 16) return (_secret = process.env.APP_SECRET);
  let s = await getJSON("config/secret");
  if (!s) { s = { value: crypto.randomBytes(32).toString("hex") }; await putJSON("config/secret", s); }
  return (_secret = s.value);
}
async function sign(uid, sv = 0) {
  const exp = now() + SESSION_DAYS * 864e5;
  const body = `${uid}.${sv}.${exp}`;
  const mac = crypto.createHmac("sha256", await secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}
async function verify(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [uid, sv, exp, mac] = parts;
  const good = crypto.createHmac("sha256", await secret()).update(`${uid}.${sv}.${exp}`).digest("base64url");
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  if (Number(exp) < now()) return null;
  return { uid, sv: Number(sv) };
}
function readCookie(req, name) {
  const c = req.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function sessionCookie(req, token, maxAge) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `session=${token ? encodeURIComponent(token) : ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// ---------- passwords ----------
function hashPw(pw, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString("hex") };
}
function checkPw(pw, user) {
  if (!user.salt || !user.hash) return false; // Google-only accounts have no password
  const h = crypto.scryptSync(pw, user.salt, 64);
  const want = Buffer.from(user.hash, "hex");
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}

// ---------- admin ----------
// The first account ever created is the admin (Nick). ADMIN_EMAIL env var can override.
async function isAdmin(user) {
  if (process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL.trim().toLowerCase()) return true;
  const a = await getJSON("config/admin");
  return !!a && a.id === user.id;
}
function tempPassword() {
  const words = ["snow", "elf", "star", "gift", "bell", "tree", "deer", "candy", "jolly", "merry", "cocoa", "sled"];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${pick()}-${crypto.randomInt(100, 1000)}`;
}

// ---------- visibility ----------
async function loadAll() {
  const [users, circles, lists, items, claims, views] = await Promise.all(
    ["users/", "circles/", "lists/", "items/", "claims/", "views/"].map(listJSON)
  );
  return { users, circles, lists, items, claims, views };
}
function myCircleIds(all, uid) {
  return new Set(Object.entries(all.circles).filter(([, c]) => (c.members || []).includes(uid)).map(([id]) => id));
}
function canSeeList(list, uid, mine) {
  return list && (list.owner === uid || (list.circleIds || []).some((c) => mine.has(c)));
}
function publicUser(u) {
  return { name: u.name, contacts: u.contacts || [] };
}

// Build everything this person is allowed to see.
// Claims: the buyer's id never leaves the server. The list owner gets nothing;
// everyone else gets {taken, mine}.
function stateFor(all, uid, admin = false) {
  const me = all.users[uid];
  const mine = myCircleIds(all, uid);
  const circles = {};
  const peopleIds = new Set([uid]);
  for (const id of mine) {
    const c = all.circles[id];
    circles[id] = { name: c.name, code: c.code, members: c.members, createdBy: c.createdBy };
    (c.members || []).forEach((m) => peopleIds.add(m));
  }
  const lists = {};
  for (const [id, l] of Object.entries(all.lists)) {
    if (!canSeeList(l, uid, mine)) continue;
    lists[id] = { ...l, circleIds: (l.circleIds || []).filter((c) => l.owner === uid || mine.has(c)) };
    peopleIds.add(l.owner);
  }
  const items = {}, claims = {}, views = {};
  for (const [id, it] of Object.entries(all.items)) {
    if (!lists[it.listId]) continue;
    items[id] = it;
    const c = all.claims[id];
    if (it.owner !== uid && c && c.taken) claims[id] = { taken: true, mine: c.by === uid };
  }
  for (const [k, v] of Object.entries(all.views)) {
    if (items[v.itemId]) { views[k] = v; peopleIds.add(v.by); }
  }
  const people = {};
  for (const p of peopleIds) if (all.users[p]) people[p] = publicUser(all.users[p]);
  return {
    me: { id: uid, name: me.name, email: me.email, contacts: me.contacts || [], introSeen: !!me.introSeen, isAdmin: admin, mustChangePassword: !!me.mustChangePassword },
    people, circles, lists, items, claims, views,
  };
}

// ---------- validation ----------
function cleanContacts(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 20).map((c) => ({ type: str(c && c.type, 20) || "Other", value: str(c && c.value, 120) })).filter((c) => c.value);
}
function cleanItem(b) {
  const title = str(b.title, 120);
  if (!title) throw new HttpError(400, "Add a name for the item.");
  const link = str(b.link, 2000);
  if (link && !isUrl(link)) throw new HttpError(400, "The main link should start with https://");
  const alternatives = (Array.isArray(b.alternatives) ? b.alternatives : []).slice(0, 5)
    .map((a) => ({ label: str(a && a.label, 40), url: str(a && a.url, 2000) })).filter((a) => a.url);
  if (alternatives.some((a) => !isUrl(a.url))) throw new HttpError(400, "Backup links should start with https://");
  const imageId = typeof b.imageId === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(b.imageId) ? b.imageId : null;
  return { title, link, alternatives, imageId, price: str(b.price, 30), notes: str(b.notes, 600) };
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// ---------- handler ----------
export default async (req) => {
  try {
    return await route(req);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    console.error(e);
    return fail(500, "Something went wrong on the server.");
  }
};

async function body(req) {
  try { return await req.json(); } catch { return {}; }
}

async function route(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const method = req.method;
  const seg = path.split("/").filter(Boolean);

  // Basic CSRF guard: every state-changing call must come from our own page.
  if (method !== "GET" && req.headers.get("x-app") !== "listsbynick") return fail(403, "Bad request.");

  if (path === "/health") return json({ ok: true });
  if (method === "GET" && path === "/config") return json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });

  // Public image serving (ids are long and random; cookie also required).
  if (method === "GET" && seg[0] === "img" && seg[1]) {
    if (!(await verify(readCookie(req, "session")))) return new Response("Not found", { status: 404 });
    const r = await imgs().getWithMetadata(seg[1], { type: "arrayBuffer" });
    if (!r) return new Response("Not found", { status: 404 });
    return new Response(r.data, { headers: { "content-type": r.metadata?.contentType || "image/jpeg", "cache-control": "private, max-age=31536000, immutable" } });
  }

  // ----- auth -----
  if (method === "POST" && path === "/signup") {
    const b = await body(req);
    const email = str(b.email, 200).toLowerCase();
    const name = str(b.name, 40);
    const password = typeof b.password === "string" ? b.password : "";
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Enter a real email address.");
    if (!name) throw new HttpError(400, "Enter your name.");
    if (password.length < 6) throw new HttpError(400, "Password needs at least 6 characters.");
    if (await getJSON("emails/" + emailKey(email))) throw new HttpError(409, "That email already has an account. Log in instead.");
    const id = newId();
    const pw = hashPw(password);
    await putJSON("users/" + id, { id, email, name, ...pw, contacts: [{ type: email.includes("gmail") ? "Gmail" : email.includes("hotmail") ? "Hotmail" : "Other email", value: email }], createdAt: now() });
    await putJSON("emails/" + emailKey(email), { id });
    if (!(await getJSON("config/admin"))) await putJSON("config/admin", { id });
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, await sign(id, 0), SESSION_DAYS * 86400) });
  }
  if (method === "POST" && path === "/login") {
    const b = await body(req);
    const email = str(b.email, 200).toLowerCase();
    const ref = await getJSON("emails/" + emailKey(email));
    const user = ref && (await getJSON("users/" + ref.id));
    if (!user || !checkPw(typeof b.password === "string" ? b.password : "", user)) throw new HttpError(401, "Wrong email or password.");
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, await sign(user.id, user.sv || 0), SESSION_DAYS * 86400) });
  }
  if (method === "POST" && path === "/google") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new HttpError(400, "Google sign-in isn't set up yet.");
    const credential = str((await body(req)).credential, 4000);
    if (!credential) throw new HttpError(400, "Google sign-in failed. Try again.");
    // Ask Google to check the token's signature and expiry for us.
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
    const g = r.ok ? await r.json() : null;
    const issuerOk = g && (g.iss === "accounts.google.com" || g.iss === "https://accounts.google.com");
    if (!g || g.aud !== clientId || !issuerOk || Number(g.exp) * 1000 < now()) throw new HttpError(401, "Google sign-in failed. Try again.");
    if (!(g.email_verified === true || g.email_verified === "true") || !g.email || !g.sub) throw new HttpError(401, "Your Google email isn't verified.");
    const email = String(g.email).toLowerCase();
    let ref = (await getJSON("google/" + g.sub)) || (await getJSON("emails/" + emailKey(email)));
    let user = ref && (await getJSON("users/" + ref.id));
    if (!user) {
      const id = newId();
      user = { id, email, name: str(g.given_name || g.name || email.split("@")[0], 40), contacts: [{ type: email.endsWith("@gmail.com") ? "Gmail" : "Other email", value: email }], createdAt: now() };
      await putJSON("users/" + id, user);
      await putJSON("emails/" + emailKey(email), { id });
      if (!(await getJSON("config/admin"))) await putJSON("config/admin", { id });
    }
    if (user.google !== g.sub) { user = { ...user, google: g.sub }; await putJSON("users/" + user.id, user); }
    await putJSON("google/" + g.sub, { id: user.id });
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, await sign(user.id, user.sv || 0), SESSION_DAYS * 86400) });
  }
  if (method === "POST" && path === "/logout") {
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, "", 0) });
  }

  // ----- everything below needs a login -----
  const sess = await verify(readCookie(req, "session"));
  const uid = sess && sess.uid;
  const me = uid && (await getJSON("users/" + uid));
  if (!me || (me.sv || 0) !== sess.sv) return fail(401, "Please log in.", { "set-cookie": sessionCookie(req, "", 0) });

  if (method === "GET" && path === "/state") return json(stateFor(await loadAll(), uid, await isAdmin(me)));

  // ----- admin: list people and reset a forgotten password -----
  if (seg[0] === "admin") {
    if (!(await isAdmin(me))) return fail(403, "Only the app admin can do that.");
    if (method === "GET" && seg[1] === "users") {
      const users = await listJSON("users/");
      return json({ users: Object.values(users).map((u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt })).sort((a, b) => (a.name || "").localeCompare(b.name || "")) });
    }
    if (method === "POST" && seg[1] === "reset") {
      const target = await getJSON("users/" + str((await body(req)).id, 40));
      if (!target) throw new HttpError(404, "Person not found.");
      if (target.id === uid) throw new HttpError(400, "Use Change password for your own account.");
      const temp = tempPassword();
      await putJSON("users/" + target.id, { ...target, ...hashPw(temp), sv: (target.sv || 0) + 1, mustChangePassword: true });
      return json({ tempPassword: temp, name: target.name, email: target.email });
    }
  }

  if (method === "POST" && path === "/profile") {
    const b = await body(req);
    const name = str(b.name, 40);
    if (!name) throw new HttpError(400, "Enter your name.");
    await putJSON("users/" + uid, { ...me, name, contacts: cleanContacts(b.contacts) });
    return json({ ok: true });
  }
  if (method === "POST" && path === "/intro-seen") {
    if (!me.introSeen) await putJSON("users/" + uid, { ...me, introSeen: true });
    return json({ ok: true });
  }
  if (method === "POST" && path === "/password") {
    const b = await body(req);
    // Google-only accounts can add a password without knowing an old one.
    if (me.hash && !checkPw(typeof b.current === "string" ? b.current : "", me)) throw new HttpError(400, "Current password is wrong.");
    if (typeof b.next !== "string" || b.next.length < 6) throw new HttpError(400, "New password needs at least 6 characters.");
    const sv = (me.sv || 0) + 1;
    await putJSON("users/" + uid, { ...me, ...hashPw(b.next), sv, mustChangePassword: false });
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, await sign(uid, sv), SESSION_DAYS * 86400) });
  }

  // ----- images -----
  if (method === "POST" && path === "/upload") {
    const type = (req.headers.get("content-type") || "").split(";")[0].trim();
    if (!IMAGE_TYPES.includes(type)) throw new HttpError(400, "Only JPG, PNG, WebP or GIF photos.");
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) throw new HttpError(400, "Empty photo.");
    if (buf.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, "That photo is too big.");
    const id = newId();
    await imgs().set(id, buf, { metadata: { contentType: type, owner: uid } });
    return json({ id });
  }

  // ----- circles -----
  if (method === "POST" && path === "/circles") {
    const name = str((await body(req)).name, 40);
    if (!name) throw new HttpError(400, "Give the circle a name.");
    const id = newId();
    const circle = { name, code: genCode(), members: [uid], createdBy: uid, createdAt: now() };
    await putJSON("circles/" + id, circle);
    return json({ id });
  }
  if (method === "POST" && path === "/circles/join") {
    const code = str((await body(req)).code, 12).toUpperCase();
    const circles = await listJSON("circles/");
    const found = Object.entries(circles).find(([, c]) => c.code === code);
    if (!found) throw new HttpError(404, "No circle with that code.");
    const [id, c] = found;
    if (!c.members.includes(uid)) await putJSON("circles/" + id, { ...c, members: [...c.members, uid] });
    return json({ id, name: c.name });
  }
  if (method === "POST" && seg[0] === "circles" && seg[2] === "leave") {
    const c = await getJSON("circles/" + seg[1]);
    if (!c) throw new HttpError(404, "Circle not found.");
    await putJSON("circles/" + seg[1], { ...c, members: c.members.filter((m) => m !== uid) });
    return json({ ok: true });
  }

  // ----- lists -----
  if (method === "POST" && path === "/lists") {
    const b = await body(req);
    const title = str(b.title, 60);
    if (!title) throw new HttpError(400, "Give the list a name.");
    const all = { circles: await listJSON("circles/") };
    const mine = myCircleIds(all, uid);
    const id = newId();
    await putJSON("lists/" + id, { title, emoji: str(b.emoji, 8) || "🎁", circleIds: (b.circleIds || []).filter((c) => mine.has(c)), owner: uid, createdAt: now() });
    return json({ id });
  }
  if ((method === "PUT" || method === "DELETE") && seg[0] === "lists" && seg[1] && !seg[2]) {
    const l = await getJSON("lists/" + seg[1]);
    if (!l || l.owner !== uid) throw new HttpError(404, "List not found.");
    if (method === "DELETE") {
      const items = await listJSON("items/");
      for (const [iid, it] of Object.entries(items)) if (it.listId === seg[1]) await deleteItem(iid, it);
      await del("lists/" + seg[1]);
      return json({ ok: true });
    }
    const b = await body(req);
    const title = str(b.title, 60);
    if (!title) throw new HttpError(400, "Give the list a name.");
    const mine = myCircleIds({ circles: await listJSON("circles/") }, uid);
    // keep circles the owner has left (they can't see them) and only add circles they're in
    const kept = (l.circleIds || []).filter((c) => !mine.has(c));
    const chosen = (b.circleIds || []).filter((c) => mine.has(c));
    await putJSON("lists/" + seg[1], { ...l, title, emoji: str(b.emoji, 8) || l.emoji, circleIds: [...new Set([...kept, ...chosen])], updatedAt: now() });
    return json({ ok: true });
  }

  // ----- items -----
  if (method === "POST" && path === "/items") {
    const b = await body(req);
    const l = await getJSON("lists/" + str(b.listId, 40));
    if (!l || l.owner !== uid) throw new HttpError(404, "List not found.");
    const id = newId();
    await putJSON("items/" + id, { ...cleanItem(b), listId: str(b.listId, 40), owner: uid, createdAt: now() });
    return json({ id });
  }
  if (seg[0] === "items" && seg[1]) {
    const iid = seg[1];
    const it = await getJSON("items/" + iid);
    if (!it) throw new HttpError(404, "That item was removed.");
    const action = seg[2] || "";

    if (!action && (method === "PUT" || method === "DELETE")) {
      if (it.owner !== uid) throw new HttpError(404, "Item not found.");
      if (method === "DELETE") { await deleteItem(iid, it); return json({ ok: true }); }
      await putJSON("items/" + iid, { ...it, ...cleanItem(await body(req)), updatedAt: now() });
      return json({ ok: true });
    }

    // the rest need the item to be visible to me and not my own
    const l = await getJSON("lists/" + it.listId);
    const mine = myCircleIds({ circles: await listJSON("circles/") }, uid);
    if (!canSeeList(l, uid, mine)) throw new HttpError(404, "Item not found.");

    if (method === "POST" && action === "view") {
      if (it.owner === uid) return json({ ok: true });
      const key = "views/" + iid + "__" + uid;
      if (!(await getJSON(key))) await putJSON(key, { itemId: iid, listId: it.listId, by: uid, at: now() });
      return json({ ok: true });
    }
    if (method === "POST" && action === "claim") {
      if (it.owner === uid) throw new HttpError(400, "You can't buy your own wish!");
      const c = await getJSON("claims/" + iid);
      if (c && c.taken && c.by !== uid) throw new HttpError(409, "Someone already took this one.");
      await putJSON("claims/" + iid, { itemId: iid, taken: true, by: uid, at: now() });
      return json({ ok: true });
    }
    if (method === "POST" && action === "unclaim") {
      const c = await getJSON("claims/" + iid);
      if (c && c.by === uid) await del("claims/" + iid);
      return json({ ok: true });
    }
  }

  return fail(404, "Not found.");
}

async function deleteItem(iid, it) {
  await del("items/" + iid);
  await del("claims/" + iid);
  const { blobs } = await db().list({ prefix: "views/" + iid + "__" });
  for (const b of blobs) await del(b.key);
  if (it.imageId) await imgs().delete(it.imageId);
}

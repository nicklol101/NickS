// Christmas Lists by Nick — frontend
'use strict';

// ---------- tiny DOM helper (always uses textContent, never innerHTML) ----------
function h(tag, props, ...kids){
  const el = document.createElement(tag);
  for (const [k,v] of Object.entries(props||{})){
    if (v==null || v===false) continue;
    if (k==='class') el.className = v;
    else if (k==='style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k==='value') el.value = v;
    else if (k==='checked') el.checked = !!v;
    else el.setAttribute(k, v===true ? '' : v);
  }
  for (const c of kids.flat(Infinity)){
    if (c==null || c===false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const $main = document.getElementById('main');
const $modal = document.getElementById('modal');
const $nav = document.getElementById('nav');
const $help = document.getElementById('helpbtn');

// ---------- state ----------
const S = {
  me:null, people:{}, circles:{}, lists:{}, items:{}, claims:{}, views:{},
  loaded:false, tab:'lists', route:null, masterFilter:'all', introShown:false, offline:false
};
const CONTACT_TYPES = ['Phone','Gmail','Hotmail','Outlook','iCloud','Yahoo','Other email'];
const APP_URL = location.origin;

// ---------- API ----------
class ApiError extends Error { constructor(status,msg){ super(msg); this.status=status; } }
async function api(path, opts={}){
  const init = { method: opts.method || (opts.body!==undefined ? 'POST' : 'GET'), credentials:'same-origin', headers:{ 'x-app':'listsbynick' } };
  if (opts.raw){ init.body = opts.raw; init.headers['content-type'] = opts.type; }
  else if (opts.body!==undefined){ init.body = JSON.stringify(opts.body); init.headers['content-type']='application/json'; }
  let res;
  try { res = await fetch('/api'+path, init); }
  catch { throw new ApiError(0, "Can't reach the server. Check your internet connection."); }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok){
    if (res.status===401 && path!=='/login' && path!=='/signup'){ S.me=null; renderAuth(); }
    if (res.status===404 && !data.error) throw new ApiError(404, "The backend isn't running. See SETUP.md: the site has to be deployed from GitHub or the Netlify CLI, not drag-and-drop.");
    throw new ApiError(res.status, data.error || 'Something went wrong.');
  }
  return data;
}
async function refresh(){
  try {
    const st = await api('/state');
    Object.assign(S, st, {loaded:true, offline:false});
    $nav.hidden = false; $help.hidden = isStandalone();
    render();
    maybeIntro();
  } catch(e){
    if (e.status===401) return;
    S.offline = true;
    if (S.loaded) render(); else showError(e.message);
  }
}
// Do something, show a toast, then refresh. Returns true on success.
async function act(fn, okMsg){
  try { const r = await fn(); if (okMsg) toast(okMsg); await refresh(); return r || true; }
  catch(e){ toast(e.message); return false; }
}

// ---------- helpers ----------
const safeUrl = u => (typeof u==='string' && /^https?:\/\//i.test(u.trim())) ? u.trim() : null;
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; } };
const imgUrl = id => id ? '/api/img/' + encodeURIComponent(id) : null;
const nameOf = uid => (S.people[uid] && S.people[uid].name) || 'Someone';
const youOr = uid => (S.me && uid===S.me.id) ? 'You' : nameOf(uid);
const ME = () => S.me && S.me.id;
function colorOf(uid){ let x=0; for (const c of String(uid)) x=(x*31+c.charCodeAt(0))>>>0; return ['#b8233a','#1d5a45','#c9a24a','#3b5ba5','#7a3fa0','#d06b2b','#2b8a8a'][x%7]; }
function avatar(uid){ const n=nameOf(uid); return h('div',{class:'avi',style:'background:'+colorOf(uid)}, (n[0]||'?').toUpperCase()); }
function myCircleIds(){ return new Set(Object.entries(S.circles).filter(([,c])=>(c.members||[]).includes(ME())).map(([id])=>id)); }
function itemsOf(listId){ return Object.entries(S.items).filter(([,i])=>i.listId===listId).sort((a,b)=>(a[1].createdAt||0)-(b[1].createdAt||0)); }
function viewersOf(itemId){ return Object.values(S.views).filter(v=>v.itemId===itemId && v.by).sort((a,b)=>(a.at||0)-(b.at||0)); }
const claimOf = iid => S.claims[iid] && S.claims[iid].taken ? S.claims[iid] : null;
const isMine = iid => !!(S.claims[iid] && S.claims[iid].mine);
function toast(msg){ const t=h('div',{class:'toast'},msg); document.body.append(t); setTimeout(()=>t.remove(),3000); }
function img(id, cls='ph', emoji='🎁'){
  const u = imgUrl(id);
  if (!u) return h('div',{class:cls},emoji);
  const el = h('img',{class:cls, src:u, alt:'', loading:'lazy'});
  el.addEventListener('error',()=>el.replaceWith(h('div',{class:cls},emoji)));
  return el;
}
function copyBtn(text){
  return h('button',{class:'copy', onclick:async(e)=>{e.stopPropagation(); try{ await navigator.clipboard.writeText(text); toast('Copied'); }catch{ toast('Copy not available here'); }}},'Copy');
}
function showError(msg){
  $main.replaceChildren(h('div',{class:'empty'},h('div',{class:'big'},'⚠️'),h('p',{},msg),h('button',{class:'btn g sm',onclick:()=>location.reload()},'Try again')));
}

// ---------- navigation ----------
$nav.addEventListener('click',e=>{
  const b = e.target.closest('button[data-tab]'); if(!b) return;
  S.tab=b.dataset.tab; S.route=null; render(); window.scrollTo(0,0);
});
function go(route){ S.route=route; render(); window.scrollTo(0,0); }
function back(){ S.route = S.route && S.route.from ? S.route.from : null; render(); window.scrollTo(0,0); }

// ---------- auth screen ----------
function renderAuth(mode='login'){
  $nav.hidden = true;
  const email = h('input',{class:'in',type:'email',autocomplete:'email',placeholder:'you@gmail.com',maxlength:200});
  const pw = h('input',{class:'in',type:'password',autocomplete:mode==='login'?'current-password':'new-password',placeholder:mode==='login'?'Your password':'At least 6 characters'});
  const name = h('input',{class:'in',autocomplete:'given-name',placeholder:'e.g. Nick, Mom, Uncle Joe',maxlength:40});
  const err = h('div',{class:'err'});
  const btn = h('button',{class:'btn',type:'submit',style:'width:100%;justify-content:center;margin-top:16px'}, mode==='login'?'Log in':'Create account');
  const form = h('form',{onsubmit:async e=>{
    e.preventDefault(); err.textContent=''; btn.disabled=true;
    try {
      await api(mode==='login'?'/login':'/signup',{body: mode==='login' ? {email:email.value, password:pw.value} : {email:email.value, password:pw.value, name:name.value}});
      $main.replaceChildren(h('div',{class:'empty'},h('div',{class:'big'},'🎁'),'Loading your lists…'));
      await refresh();
    } catch(x){ err.textContent = x.message; }
    finally { btn.disabled=false; }
  }},
    mode==='signup' ? [h('label',{class:'f'},'Your name'), name] : null,
    h('label',{class:'f'},'Email'), email,
    h('label',{class:'f'},'Password'), pw,
    err, btn);
  $main.replaceChildren(h('div',{class:'auth'},
    h('div',{class:'card'},
      h('h2',{style:'font-size:24px;text-align:center'}, mode==='login'?'Welcome back 🎄':'Join the family lists 🎁'),
      h('p',{class:'sub',style:'text-align:center;margin:6px 0 4px'}, mode==='login'?'Log in to see your family’s wish lists.':'Make an account so you can make lists and check off gifts.'),
      form,
      h('div',{class:'switch'}, mode==='login'?'New here? ':'Already have an account? ',
        h('button',{type:'button',onclick:()=>renderAuth(mode==='login'?'signup':'login')}, mode==='login'?'Create an account':'Log in'))),
    h('p',{class:'sub',style:'text-align:center;margin-top:14px'},'Forgot your password? Ask Nick to help reset it.')));
  setTimeout(()=>(mode==='signup'?name:email).focus(),50);
}

// ---------- render ----------
function render(){
  if (!S.me) return;
  for (const b of $nav.querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab===S.tab);
  const prefix = [];
  if (S.offline) prefix.push(h('div',{class:'note warn',style:'margin-bottom:12px'},"You're offline. What you see may be out of date."));
  if (S.me.mustChangePassword) prefix.push(h('div',{class:'installbar',style:'border-color:#f0d9a8;background:#fff6e5'},h('span',{style:'font-size:22px'},'🔑'),
    h('div',{class:'grow'},h('b',{},'You’re using a temporary password'),h('div',{class:'sub'},'Pick your own so you don’t forget it.')),
    h('button',{class:'btn sm',onclick:openPassword},'Change')));
  const ib = installBar(); if (ib) prefix.push(ib);
  let view;
  if (S.route && S.route.v==='list') view = viewList(S.route.id);
  else if (S.route && S.route.v==='item') view = viewItem(S.route.id);
  else if (S.route && S.route.v==='circle') view = viewCircle(S.route.id);
  else if (S.tab==='circles') view = viewCircles();
  else if (S.tab==='master') view = viewMaster();
  else if (S.tab==='contacts') view = viewContacts();
  else if (S.tab==='me') view = viewMe();
  else view = viewLists();
  $main.replaceChildren(...prefix, view);
}

function listRow(id,l,showOwner){
  const n = itemsOf(id).length;
  const circ = (l.circleIds||[]).map(c=>S.circles[c]&&S.circles[c].name).filter(Boolean);
  return h('button',{class:'listrow',onclick:()=>go({v:'list',id,from:S.route})},
    h('div',{class:'em'},l.emoji||'🎁'),
    h('div',{class:'grow'},
      h('div',{class:'t'},l.title||'Untitled list'),
      h('div',{class:'sub'}, (showOwner? youOr(l.owner)+' · ' : '') + n + (n===1?' item':' items') + (circ.length? ' · ' + circ.join(', ') : ' · not shared yet'))),
    h('span',{class:'chev'},'›'));
}

function viewLists(){
  const mine = Object.entries(S.lists).filter(([,l])=>l.owner===ME()).sort((a,b)=>(a[1].createdAt||0)-(b[1].createdAt||0));
  const others = Object.entries(S.lists).filter(([,l])=>l.owner!==ME()).sort((a,b)=>nameOf(a[1].owner).localeCompare(nameOf(b[1].owner)));
  return h('div',{},
    h('div',{class:'sec'},h('h2',{},'My lists'),h('button',{class:'btn sm',onclick:()=>openListForm()},'+ New list')),
    mine.length ? h('div',{class:'stack'},mine.map(([id,l])=>listRow(id,l,false)))
      : h('div',{class:'empty'},h('div',{class:'big'},'📝'),'No lists yet. Make one, then share it with a circle.'),
    h('div',{class:'sec'},h('h2',{},'Family lists')),
    others.length ? h('div',{class:'stack'},others.map(([id,l])=>listRow(id,l,true)))
      : h('div',{class:'empty'},h('div',{class:'big'},'👨‍👩‍👧'),
          myCircleIds().size ? "Nobody in your circles has shared a list yet." : "Join or create a circle to see your family's lists.",
          myCircleIds().size ? null : h('div',{style:'margin-top:10px'},h('button',{class:'btn g sm',onclick:()=>{S.tab='circles';render();}},'Go to Circles')))
  );
}

function viewList(id){
  const l = S.lists[id];
  if (!l) return h('div',{},h('button',{class:'back',onclick:back},'‹ Back'),h('div',{class:'empty'},'This list was removed or isn’t shared with you.'));
  const own = l.owner===ME();
  const items = itemsOf(id);
  const circ = (l.circleIds||[]).map(c=>S.circles[c]&&S.circles[c].name).filter(Boolean);
  return h('div',{},
    h('button',{class:'back',onclick:back},'‹ Back'),
    h('div',{class:'row',style:'justify-content:space-between'},
      h('div',{},h('h2',{style:'font-size:24px'},(l.emoji||'🎁')+' '+(l.title||'Untitled list')),
        h('div',{class:'sub'}, own ? 'Your list' : youOr(l.owner)+"'s list"),
        h('div',{style:'margin-top:6px'}, circ.length ? circ.map(c=>h('span',{class:'pill'},c)) : h('span',{class:'sub'},'Not shared with any circle yet'))),
      own ? h('div',{class:'row'},
        h('button',{class:'btn ghost sm',onclick:()=>openListForm(id)},'Edit'),
        h('button',{class:'btn sm',onclick:()=>openItemForm(id)},'+ Add item')) : null),
    own ? h('div',{class:'note',style:'margin-top:12px'},"🤫 You won't see who's buying what on your own list. That keeps it a surprise.") :
      h('div',{class:'note',style:'margin-top:12px'},"Tap an item to see the details. Check it off if you're buying it. Others just see “Taken,” never your name, and "+nameOf(l.owner)+" sees nothing."),
    h('div',{style:'margin-top:14px'},
      items.length ? h('div',{class:'grid'},items.map(([iid,it])=>itemCard(iid,it,own)))
        : h('div',{class:'empty'},h('div',{class:'big'},'🎄'), own?'Add your first wish with a photo and a link.':'No items on this list yet.'))
  );
}
function itemCard(iid,it,own){
  let tag=null;
  if (!own && claimOf(iid)) tag = isMine(iid) ? h('span',{class:'badge ok tag'},"✓ You're getting it") : h('span',{class:'badge tag'},'✓ Taken');
  const nv = viewersOf(iid).length;
  return h('button',{class:'item',onclick:()=>go({v:'item',id:iid,from:S.route})},
    img(it.imageId), tag,
    h('div',{class:'b'},h('div',{class:'t'},it.title||'Untitled'),
      it.price ? h('div',{class:'p'},it.price) : null,
      nv ? h('div',{class:'views',style:'margin-top:4px'},'👀 Opened by '+nv) : null));
}

const recorded = new Set();
function recordView(iid, it){
  if (!it || it.owner===ME() || recorded.has(iid)) return;
  if (S.views[iid+'__'+ME()]) return;
  recorded.add(iid);
  api('/items/'+encodeURIComponent(iid)+'/view',{body:{}}).catch(()=>{});
}

function viewItem(iid){
  const it = S.items[iid];
  const l = it && S.lists[it.listId];
  if (!it || !l) return h('div',{},h('button',{class:'back',onclick:back},'‹ Back'),h('div',{class:'empty'},'This item was removed.'));
  const own = it.owner===ME();
  recordView(iid,it);
  const main = safeUrl(it.link);
  const alts = (it.alternatives||[]).filter(a=>safeUrl(a.url));
  const viewers = viewersOf(iid);
  let claimBox = null;
  if (!own){
    if (!claimOf(iid)) claimBox = h('div',{class:'claim'},h('button',{class:'check',onclick:()=>act(()=>api('/items/'+encodeURIComponent(iid)+'/claim',{body:{}}),"Checked off. It's yours to buy!")},h('span',{class:'box'}),
      h('div',{},h('div',{style:'font-weight:700'},"I'm buying this"),h('div',{class:'sub'},'Others will only see “Taken,” not your name. '+nameOf(it.owner)+" won't see anything."))));
    else if (isMine(iid)) claimBox = h('div',{class:'claim mine'},h('button',{class:'check',onclick:()=>act(()=>api('/items/'+encodeURIComponent(iid)+'/unclaim',{body:{}}),'Unchecked')},h('span',{class:'box'},'✓'),
      h('div',{},h('div',{style:'font-weight:700'},"You're getting this 🎉"),h('div',{class:'sub'},'Tap to uncheck if you change your mind.'))));
    else claimBox = h('div',{class:'claim taken'},h('div',{class:'check',style:'cursor:default'},h('span',{class:'box'},'✓'),
      h('div',{},h('div',{style:'font-weight:700'},'Someone is getting this'),h('div',{class:'sub'},'Already taken, so pick something else!'))));
  }
  return h('div',{},
    h('button',{class:'back',onclick:back},'‹ Back to '+(own?'your list':youOr(it.owner)+"'s list")),
    h('div',{class:'hero'},
      img(it.imageId),
      h('div',{class:'stack'},
        h('h2',{style:'font-size:24px'},it.title||'Untitled'),
        h('div',{class:'row'}, it.price?h('span',{class:'badge red'},it.price):null, h('span',{class:'sub'},'On '+(own?'your':nameOf(it.owner)+"'s")+' list: '+(l.title||''))),
        it.notes ? h('p',{style:'margin:0;white-space:pre-wrap'},it.notes) : null,
        claimBox,
        main ? h('a',{class:'linkbox',href:main,target:'_blank',rel:'noopener noreferrer'},h('span',{style:'font-size:20px'},'🛒'),
          h('div',{style:'flex:1;min-width:0'},h('div',{style:'font-weight:600'},'Main link'),h('div',{class:'host'},hostOf(main))),h('span',{class:'chev'},'↗')) : null,
        alts.length ? h('div',{},h('div',{style:'font-weight:700;margin:6px 0'},'Backup stores ('+alts.length+')'),
          h('div',{class:'stack'},alts.map((a,i)=>h('a',{class:'linkbox',href:safeUrl(a.url),target:'_blank',rel:'noopener noreferrer'},
            h('span',{style:'font-size:16px;font-weight:700;color:var(--muted)'},i+1),
            h('div',{style:'flex:1;min-width:0'},h('div',{style:'font-weight:600'},a.label||hostOf(a.url)),h('div',{class:'host'},hostOf(a.url))),h('span',{class:'chev'},'↗'))))) : null,
        h('div',{class:'card'},h('div',{style:'font-weight:700;margin-bottom:6px'},'👀 Who opened this'),
          viewers.length ? h('div',{},viewers.map(v=>h('span',{class:'pill'},youOr(v.by)))) : h('div',{class:'sub'},'Nobody yet')),
        own ? h('div',{class:'row'},h('button',{class:'btn ghost sm',onclick:()=>openItemForm(it.listId,iid)},'Edit item'),
          h('button',{class:'btn ghost sm',onclick:()=>confirmBox('Delete this item?','“'+(it.title||'Untitled')+'” will be removed from your list.','Delete',async()=>{
            if (await act(()=>api('/items/'+encodeURIComponent(iid),{method:'DELETE'}),'Item deleted')) back();
          })},'Delete')) : null
      ))
  );
}

// ---------- circles ----------
function viewCircles(){
  const mine = Object.entries(S.circles).sort((a,b)=>(a[1].name||'').localeCompare(b[1].name||''));
  return h('div',{},
    h('div',{class:'sec'},h('h2',{},'My circles'),
      h('div',{class:'row'},h('button',{class:'btn ghost sm',onclick:openJoin},'Join with code'),h('button',{class:'btn sm',onclick:openCircleForm},'+ New circle'))),
    h('p',{class:'sub',style:'margin-top:-4px'},'A circle is a group like “Mom’s side” or “Cousins.” Share a list with a circle and only those people can see it.'),
    mine.length ? h('div',{class:'stack'},mine.map(([id,c])=>h('button',{class:'listrow',onclick:()=>go({v:'circle',id,from:S.route})},
      h('div',{class:'em',style:'background:#eef3f0'},'👨‍👩‍👧'),
      h('div',{class:'grow'},h('div',{class:'t'},c.name||'Circle'),h('div',{class:'sub'},(c.members||[]).length+' members')),
      h('span',{class:'chev'},'›'))))
      : h('div',{class:'empty'},h('div',{class:'big'},'👨‍👩‍👧'),'Create a circle and send the code to your family, or join one with a code someone gave you.')
  );
}
function viewCircle(id){
  const c = S.circles[id];
  if (!c) return h('div',{},h('button',{class:'back',onclick:back},'‹ Back'),h('div',{class:'empty'},'You’re not in this circle.'));
  const members = [...(c.members||[])].sort((a,b)=>(a===ME()?-1:b===ME()?1:nameOf(a).localeCompare(nameOf(b))));
  const invite = 'Join my family Christmas lists! Go to '+APP_URL+' , make an account, then tap Circles → Join with code and type: '+c.code;
  return h('div',{},
    h('button',{class:'back',onclick:back},'‹ Back'),
    h('h2',{style:'font-size:24px'},c.name||'Circle'),
    h('div',{class:'card',style:'margin-top:12px'},
      h('div',{class:'row',style:'justify-content:space-between'},
        h('div',{},h('div',{class:'sub'},'Invite code'),h('span',{class:'code'},c.code||'')),
        h('div',{class:'row'},copyBtn(c.code||''),
          h('button',{class:'btn sm',onclick:async()=>{
            if (navigator.share){ try{ await navigator.share({title:'Christmas Lists by Nick', text:invite}); }catch{} }
            else { try{ await navigator.clipboard.writeText(invite); toast('Invite message copied'); }catch{ toast('Copy not available'); } }
          }},'Send invite'))),
      h('p',{class:'sub',style:'margin:8px 0 0'},'They open the app, make an account, tap Circles, then “Join with code.”')),
    h('div',{class:'sec'},h('h2',{},'Members')),
    h('div',{class:'stack'},members.map(uid=>{
      const ls = Object.entries(S.lists).filter(([,l])=>l.owner===uid && (l.circleIds||[]).includes(id));
      return h('div',{class:'card'},
        h('div',{class:'person'},avatar(uid),
          h('div',{style:'flex:1;min-width:0'},h('div',{style:'font-weight:700'},youOr(uid)),
            ls.length ? h('div',{class:'stack',style:'margin-top:8px'},ls.map(([lid,l])=>listRow(lid,l,false))) : h('div',{class:'sub'},'No lists shared with this circle'))));
    })),
    h('div',{style:'margin-top:18px'},h('button',{class:'btn ghost sm',onclick:()=>confirmBox('Leave '+(c.name||'circle')+'?','You’ll stop seeing lists shared with this circle.','Leave',async()=>{
      if (await act(()=>api('/circles/'+encodeURIComponent(id)+'/leave',{body:{}}),'You left the circle')) back();
    })},'Leave circle'))
  );
}

// ---------- master ----------
function keyOf(it){
  const u = safeUrl(it.link);
  if (u){ try{ const x=new URL(u); return 'u:'+x.hostname.replace(/^www\./,'').toLowerCase()+x.pathname.replace(/\/+$/,'').toLowerCase(); }catch{} }
  return 't:'+(it.title||'').trim().toLowerCase().replace(/\s+/g,' ');
}
function viewMaster(){
  const groups = new Map();
  for (const [iid,it] of Object.entries(S.items)){
    const k = keyOf(it);
    if (!groups.has(k)) groups.set(k,{entries:[]});
    groups.get(k).entries.push([iid,it]);
  }
  let rows = [...groups.values()].map(g=>{
    g.entries.sort((a,b)=>(a[1].createdAt||0)-(b[1].createdAt||0));
    const first = g.entries.find(([,i])=>i.imageId) || g.entries[0];
    const others = g.entries.filter(([,i])=>i.owner!==ME());
    const claimed = others.filter(([iid])=>claimOf(iid));
    const byMe = others.some(([iid])=>claimOf(iid) && isMine(iid));
    const allTaken = others.length>0 && claimed.length===others.length;
    const owners = [...new Set(g.entries.map(([,i])=>i.owner))];
    return {first, others, claimed, byMe, allTaken, owners, title:first[1].title||'Untitled'};
  }).sort((a,b)=>a.title.localeCompare(b.title));
  const total = rows.length;
  if (S.masterFilter==='needed') rows = rows.filter(r=>r.others.length && !r.allTaken);
  if (S.masterFilter==='mine') rows = rows.filter(r=>r.byMe);
  const chip=(k,label)=>h('button',{class:'chip'+(S.masterFilter===k?' on':''),onclick:()=>{S.masterFilter=k;render();}},label);
  return h('div',{},
    h('div',{class:'sec'},h('div',{},h('h2',{},'Master list'),h('div',{class:'sub'},total+' unique items from every list you can see. Duplicates are combined.'))),
    h('div',{class:'chips'},chip('all','All'),chip('needed','Still needed'),chip('mine',"I'm buying")),
    rows.length ? h('div',{class:'stack'},rows.map(r=>{
      const [iid,it]=r.first;
      let status;
      if (!r.others.length) status = h('span',{class:'badge'},'Your wish');
      else if (r.byMe) status = h('span',{class:'badge ok'},"✓ You're getting it");
      else if (r.allTaken) status = h('span',{class:'badge'},'✓ Taken');
      else if (r.claimed.length) status = h('span',{class:'badge red'},r.claimed.length+' of '+r.others.length+' taken');
      else status = h('span',{class:'badge red'},'Needed');
      return h('button',{class:'mrow',onclick:()=>go({v:'item',id:iid,from:S.route})},
        img(it.imageId),
        h('div',{class:'grow'},h('div',{style:'font-weight:600'},r.title),
          h('div',{class:'sub'},'Wanted by '+r.owners.map(youOr).join(', ') + (it.price?' · '+it.price:'')),
          h('div',{style:'margin-top:4px'},status)),
        h('span',{class:'chev'},'›'));
    })) : h('div',{class:'empty'},h('div',{class:'big'},'📜'), total ? 'Nothing matches this filter.' : 'Items from every list you can see will show up here.')
  );
}

// ---------- contacts ----------
function contactBlock(uid){
  const p = uid===ME() ? S.me : S.people[uid];
  const cs = (p && p.contacts || []).filter(c=>c && c.value);
  return h('div',{class:'card'},
    h('div',{class:'person'},avatar(uid),
      h('div',{style:'flex:1;min-width:0'},h('div',{style:'font-weight:700;margin-bottom:4px'},youOr(uid)),
        cs.length ? h('div',{},cs.map(c=>h('div',{class:'contact'},h('span',{class:'ty'},c.type||''),
            c.type==='Phone' ? h('a',{class:'v',href:'tel:'+c.value.replace(/[^\d+]/g,'')},c.value)
              : h('a',{class:'v',href:'mailto:'+c.value},c.value),
            copyBtn(c.value))))
          : h('div',{class:'sub'},'No contact info added yet'))));
}
function viewContacts(){
  const ids = new Set([ME()]);
  for (const c of Object.values(S.circles)) (c.members||[]).forEach(x=>ids.add(x));
  const sorted = [...ids].sort((a,b)=>(a===ME()?-1:b===ME()?1:nameOf(a).localeCompare(nameOf(b))));
  return h('div',{},
    h('div',{class:'sec'},h('div',{},h('h2',{},'Contacts'),h('div',{class:'sub'},'Phone numbers and emails for everyone in your circles'))),
    h('div',{class:'stack'},sorted.map(contactBlock)));
}

// ---------- me ----------
function viewMe(){
  const mineLists = Object.values(S.lists).filter(l=>l.owner===ME()).length;
  const buying = Object.keys(S.items).filter(iid=>claimOf(iid) && isMine(iid));
  return h('div',{},
    isStandalone() ? null : h('div',{class:'card phonecard',style:'margin-bottom:6px'},h('div',{class:'row',style:'justify-content:space-between'},
      h('div',{},h('div',{style:'font-weight:700;font-size:16px'},'📲 Put this app on your phone'),h('div',{class:'sub'},'Add it to your home screen so it opens like a real app.')),
      h('button',{class:'btn',onclick:()=>openIntro(1)},'Show me how'))),
    h('div',{class:'sec'},h('h2',{},'My profile'),h('button',{class:'btn ghost sm',onclick:openProfile},'Edit')),
    contactBlock(ME()),
    h('div',{class:'row',style:'margin-top:12px'},
      h('span',{class:'badge'},mineLists+' lists'),h('span',{class:'badge'},myCircleIds().size+' circles'),h('span',{class:'badge ok'},buying.length+" gifts I'm buying")),
    h('div',{class:'sec'},h('h2',{},"Gifts I'm buying")),
    buying.length ? h('div',{class:'stack'},buying.map(iid=>{const it=S.items[iid]; return h('button',{class:'mrow',onclick:()=>go({v:'item',id:iid,from:S.route})},
      img(it.imageId),h('div',{class:'grow'},h('div',{style:'font-weight:600'},it.title||'Untitled'),h('div',{class:'sub'},'For '+nameOf(it.owner)+(it.price?' · '+it.price:''))),h('span',{class:'chev'},'›'));}))
      : h('div',{class:'empty'},'Check off items on family lists and they’ll show up here as your shopping list.'),
    S.me.isAdmin ? h('div',{},h('div',{class:'sec'},h('h2',{},'Admin')),
      h('div',{class:'card'},h('div',{style:'font-weight:700'},'👑 You’re the app admin'),
        h('div',{class:'sub',style:'margin:4px 0 10px'},'If someone forgets their password, reset it here and text them the temporary one.'),
        h('button',{class:'btn g sm',onclick:openAdmin},'Family accounts & password resets'))) : null,
    h('div',{class:'sec'},h('h2',{},'Account')),
    h('div',{class:'card'},
      h('div',{class:'sub'},'Logged in as ',h('b',{},S.me.email||'')),
      h('div',{class:'row',style:'margin-top:10px'},
        h('button',{class:'btn ghost sm',onclick:()=>openIntro(0)},'👋 Welcome tour'),
        h('button',{class:'btn ghost sm',onclick:openPassword},'Change password'),
        h('button',{class:'btn ghost sm',onclick:async()=>{ try{ await api('/logout',{body:{}}); }catch{} S.me=null; S.introShown=false; renderAuth(); }},'Log out')))
  );
}

// ---------- modals ----------
function openModal(title, body, actions){
  const close=()=>$modal.replaceChildren();
  const scrim = h('div',{class:'scrim',onclick:e=>{ if(e.target===scrim) close(); }},
    h('div',{class:'sheet'},h('h3',{},title),body,h('div',{class:'acts'},h('button',{class:'btn ghost',onclick:close},'Cancel'),actions)));
  $modal.replaceChildren(scrim);
  const first = scrim.querySelector('input,textarea'); if (first && !first.type.match(/file|checkbox/)) setTimeout(()=>first.focus(),50);
  return close;
}
function confirmBox(title,msg,label,fn){
  let close;
  const b = h('button',{class:'btn',onclick:async()=>{b.disabled=true; await fn(); close();}},label);
  close = openModal(title,h('p',{style:'margin:0'},msg),b);
}
function busy(btn, fn){ return async()=>{ if(btn.disabled) return; btn.disabled=true; const t=btn.textContent; btn.textContent='Saving…'; try{ await fn(); } finally { btn.disabled=false; btn.textContent=t; } }; }

function openProfile(){
  const p = S.me;
  const name = h('input',{class:'in',value:p.name||'',placeholder:'e.g. Nick, Mom, Uncle Joe',maxlength:40});
  const rows = h('div',{});
  const addRow=(c={type:'Phone',value:''})=>{
    const sel = h('select',{class:'in'},CONTACT_TYPES.map(t=>h('option',{value:t},t))); sel.value = CONTACT_TYPES.includes(c.type)?c.type:'Other email';
    const val = h('input',{class:'in',value:c.value||'',placeholder:'Number or email',maxlength:120});
    const r = h('div',{class:'crow'},sel,val,h('button',{class:'x',type:'button','aria-label':'Remove',onclick:()=>r.remove()},'×'));
    rows.append(r);
  };
  (p.contacts && p.contacts.length ? p.contacts : [{type:'Phone',value:''}]).forEach(addRow);
  const save = h('button',{class:'btn'},'Save');
  const close = openModal('My profile', h('div',{},
    h('label',{class:'f'},'Name your family sees'), name,
    h('label',{class:'f'},'Phone numbers & emails'), rows,
    h('button',{class:'btn ghost sm',type:'button',style:'margin-top:8px',onclick:()=>addRow({type:'Phone',value:''})},'+ Add another')), save);
  save.onclick = busy(save, async()=>{
    const contacts = [...rows.querySelectorAll('.crow')].map(r=>({type:r.querySelector('select').value, value:r.querySelector('input').value.trim()})).filter(c=>c.value);
    if (await act(()=>api('/profile',{body:{name:name.value, contacts}}),'Profile saved')) close();
  });
}
async function openAdmin(){
  const listBox = h('div',{class:'stack'},h('div',{class:'sub'},'Loading…'));
  const search = h('input',{class:'in',placeholder:'Search by name or email',style:'margin-bottom:10px'});
  let users = [];
  const draw=()=>{
    const q = search.value.trim().toLowerCase();
    const shown = users.filter(u=>!q || (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q));
    listBox.replaceChildren(...(shown.length ? shown.map(u=>h('div',{class:'contact',style:'padding:10px 0'},
      h('div',{style:'flex:1;min-width:0'},h('div',{style:'font-weight:600'},u.name||'(no name)', u.id===ME()?' (you)':''),h('div',{class:'sub',style:'word-break:break-all'},u.email||'')),
      u.id===ME() ? null : h('button',{class:'btn ghost sm',onclick:()=>resetFor(u)},'Reset password')))
      : [h('div',{class:'sub'},'No one found.')]));
  };
  search.addEventListener('input',draw);
  openModal('Family accounts', h('div',{},h('p',{class:'sub',style:'margin-top:-6px'},'Everyone who has made an account.'),search,listBox), null);
  try { users = (await api('/admin/users')).users; draw(); }
  catch(e){ listBox.replaceChildren(h('div',{class:'sub'},e.message)); }
}
function resetFor(u){
  confirmBox('Reset '+(u.name||'their')+'’s password?','They’ll be logged out and get a temporary password. You’ll see it next so you can text it to them.','Reset',async()=>{
    try {
      const r = await api('/admin/reset',{body:{id:u.id}});
      const msg = 'Hi '+(r.name||'')+'! Your Christmas Lists by Nick password was reset. Log in at '+APP_URL+' with your email ('+r.email+') and this temporary password: '+r.tempPassword+'  You’ll be asked to pick a new one.';
      setTimeout(()=>openModal('Temporary password', h('div',{},
        h('p',{style:'margin:0 0 8px'},'Send this to ',h('b',{},r.name||r.email),':'),
        h('div',{class:'linkcopy',style:'font-size:18px;font-family:ui-monospace,Menlo,monospace'},h('span',{},r.tempPassword),copyBtn(r.tempPassword)),
        h('p',{class:'sub'},'It only shows once. They’ll be asked to change it after they log in.')),
        h('button',{class:'btn',onclick:async()=>{
          if (navigator.share){ try{ await navigator.share({text:msg}); }catch{} }
          else { try{ await navigator.clipboard.writeText(msg); toast('Message copied. Paste it in a text.'); }catch{ toast('Copy not available'); } }
        }},'Send them a message')),0);
    } catch(e){ toast(e.message); }
  });
}
function openPassword(){
  const cur = h('input',{class:'in',type:'password',autocomplete:'current-password'});
  const nx = h('input',{class:'in',type:'password',autocomplete:'new-password',placeholder:'At least 6 characters'});
  const save = h('button',{class:'btn'},'Change');
  const close = openModal('Change password', h('div',{},h('label',{class:'f'},S.me.mustChangePassword?'Temporary password':'Current password'),cur,h('label',{class:'f'},'New password'),nx), save);
  save.onclick = busy(save, async()=>{ if (await act(()=>api('/password',{body:{current:cur.value,next:nx.value}}),'Password changed')) close(); });
}
function openCircleForm(){
  const name = h('input',{class:'in',placeholder:'e.g. Stuardo family, Cousins',maxlength:40});
  const save = h('button',{class:'btn'},'Create');
  const close = openModal('New circle', h('div',{},h('label',{class:'f'},'Circle name'),name), save);
  save.onclick = busy(save, async()=>{
    const r = await act(()=>api('/circles',{body:{name:name.value}}),'Circle created');
    if (r){ close(); go({v:'circle',id:r.id,from:null}); }
  });
}
function openJoin(){
  const code = h('input',{class:'in',placeholder:'6-letter code',maxlength:10,autocapitalize:'characters',style:'text-transform:uppercase;letter-spacing:2px'});
  const save = h('button',{class:'btn g'},'Join');
  const close = openModal('Join a circle', h('div',{},h('label',{class:'f'},'Invite code'),code), save);
  save.onclick = busy(save, async()=>{
    const r = await act(()=>api('/circles/join',{body:{code:code.value}}),'You joined the circle');
    if (r){ close(); go({v:'circle',id:r.id,from:null}); }
  });
}

const EMOJIS=['🎁','🎄','🎅','⛄','🧸','🎮','👟','👕','💄','📚','🎧','⭐'];
function openListForm(id){
  const l = id ? S.lists[id] : {};
  const title = h('input',{class:'in',value:l.title||'',placeholder:'e.g. Christmas 2026',maxlength:60});
  let emoji = l.emoji || '🎁';
  const emo = h('div',{class:'chips'});
  const drawEmo=()=>emo.replaceChildren(...EMOJIS.map(e=>h('button',{type:'button',class:'chip'+(e===emoji?' on':''),onclick:()=>{emoji=e;drawEmo();}},e)));
  drawEmo();
  const circles = Object.entries(S.circles);
  const sel = new Set(l.circleIds||[]);
  const cbs = circles.length ? h('div',{},circles.map(([cid,c])=>h('label',{class:'cb'},h('input',{type:'checkbox',checked:sel.has(cid),onchange:e=>e.target.checked?sel.add(cid):sel.delete(cid)}),c.name||'Circle')))
    : h('div',{class:'note'},'You aren’t in any circles yet. You can share this list later from Edit.');
  const save = h('button',{class:'btn'},id?'Save':'Create list');
  let close;
  const del = id ? h('button',{class:'btn ghost',onclick:()=>{ close(); confirmBox('Delete this list?','All items on “'+(l.title||'')+'” will be deleted too.','Delete list',async()=>{
      if (await act(()=>api('/lists/'+encodeURIComponent(id),{method:'DELETE'}),'List deleted')){ S.route=null; render(); }
    }); }},'Delete list') : null;
  close = openModal(id?'Edit list':'New list', h('div',{},
    h('label',{class:'f'},'List name'),title,
    h('label',{class:'f'},'Icon'),emo,
    h('label',{class:'f'},'Share with circles'),cbs), [del,save]);
  save.onclick = busy(save, async()=>{
    const body = {title:title.value, emoji, circleIds:[...sel]};
    const r = await act(()=> id ? api('/lists/'+encodeURIComponent(id),{method:'PUT',body}) : api('/lists',{body}), id?'List saved':'List created');
    if (r){ close(); if(!id) go({v:'list',id:r.id,from:null}); }
  });
}

async function shrink(file){
  try{
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 1200/Math.max(bmp.width,bmp.height));
    const c = document.createElement('canvas'); c.width=Math.round(bmp.width*s); c.height=Math.round(bmp.height*s);
    c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
    const b = await new Promise(r=>c.toBlob(r,'image/jpeg',0.85));
    return b ? {blob:b,type:'image/jpeg'} : {blob:file,type:file.type};
  }catch{ return {blob:file,type:file.type}; }
}
function openItemForm(listId, iid){
  const it = iid ? S.items[iid] : {};
  const title = h('input',{class:'in',value:it.title||'',placeholder:'e.g. Nike Air Force 1, size 10',maxlength:120});
  const price = h('input',{class:'in',value:it.price||'',placeholder:'e.g. $110 (optional)',maxlength:30});
  const link = h('input',{class:'in',value:it.link||'',placeholder:'https://www.amazon.com/…',type:'url',inputmode:'url'});
  const notes = h('textarea',{class:'in',placeholder:'Size, color, anything helpful (optional)',maxlength:600},it.notes||'');
  let imageId = it.imageId || null, file=null;
  const prevWrap = h('div',{});
  const drawPrev=()=>{
    if (file) prevWrap.replaceChildren(h('img',{class:'prev',src:URL.createObjectURL(file),alt:''}));
    else if (imageId) prevWrap.replaceChildren(img(imageId,'prev'));
    else prevWrap.replaceChildren();
  };
  drawPrev();
  const fileIn = h('input',{type:'file',accept:'image/*',class:'in',onchange:e=>{file=e.target.files[0]||null; drawPrev();}});
  const photo = h('div',{class:'row',style:'align-items:flex-start'},prevWrap,h('div',{style:'flex:1;min-width:180px'},fileIn,
      h('div',{class:'sub',style:'margin-top:4px'},'Tip: screenshot the product page and upload it.'),
      imageId?h('button',{type:'button',class:'btn ghost sm',style:'margin-top:6px',onclick:()=>{imageId=null;file=null;fileIn.value='';drawPrev();}},'Remove photo'):null));
  const alts = h('div',{});
  const addAlt=(a={label:'',url:''})=>{
    if (alts.children.length>=5) return toast('Up to 5 backup links');
    const r = h('div',{class:'altrow'},h('input',{class:'in',value:a.label||'',placeholder:'Store (eBay)',maxlength:40}),h('input',{class:'in',value:a.url||'',placeholder:'https://…',type:'url',inputmode:'url'}),h('button',{class:'x',type:'button','aria-label':'Remove',onclick:()=>r.remove()},'×'));
    alts.append(r);
  };
  (it.alternatives||[]).forEach(addAlt);
  const save = h('button',{class:'btn'},iid?'Save':'Add item');
  const close = openModal(iid?'Edit item':'Add an item', h('div',{},
    h('label',{class:'f'},'What do you want?'),title,
    h('label',{class:'f'},'Photo'),photo,
    h('label',{class:'f'},'Main link'),link,
    h('label',{class:'f'},'Price'),price,
    h('label',{class:'f'},'Notes'),notes,
    h('label',{class:'f'},'Backup links (up to 5)'),
    h('div',{class:'sub'},'In case the main store sells out, like eBay, Target, or Walmart.'),
    alts, h('button',{class:'btn ghost sm',type:'button',style:'margin-top:8px',onclick:()=>addAlt()},'+ Add backup link')), save);
  save.onclick = busy(save, async()=>{
    if (!title.value.trim()) return toast('Add a name for the item');
    const alternatives = [...alts.querySelectorAll('.altrow')].map(r=>{const [a,b]=r.querySelectorAll('input'); return {label:a.value.trim(), url:b.value.trim()};}).filter(a=>a.url);
    if (file){
      try{ const {blob,type}=await shrink(file); const up = await api('/upload',{method:'POST',raw:blob,type}); imageId = up.id; }
      catch(e){ toast(e.message || 'Photo upload failed'); return; }
    }
    const body = {listId, title:title.value, price:price.value, link:link.value.trim(), notes:notes.value, imageId, alternatives};
    const r = await act(()=> iid ? api('/items/'+encodeURIComponent(iid),{method:'PUT',body}) : api('/items',{body}), iid?'Item saved':'Item added');
    if (r) close();
  });
}

// ---------- install / home screen ----------
const UA = navigator.userAgent || '';
const IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const IS_ANDROID = /Android/i.test(UA);
function isStandalone(){ return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone===true; }
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt = e; if (S.me) render(); });
window.addEventListener('appinstalled', ()=>{ deferredPrompt=null; toast('Installed! Find it on your home screen.'); if (S.me) render(); });
async function promptInstall(){
  if (!deferredPrompt) return openIntro(1);
  deferredPrompt.prompt();
  try { await deferredPrompt.userChoice; } catch {}
  deferredPrompt = null; render();
}
function installBar(){
  if (!deferredPrompt || isStandalone() || S.route) return null;
  return h('div',{class:'installbar'},h('span',{style:'font-size:24px'},'📲'),h('div',{class:'grow'},h('b',{},'Install Lists by Nick'),h('div',{class:'sub'},'Get it on your home screen in one tap.')),h('button',{class:'btn sm',onclick:promptInstall},'Install'));
}
const ICONS = {
  share:'<svg viewBox="0 0 24 24" fill="none" stroke="#1a73e8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg>',
  dots:'<svg viewBox="0 0 24 24" fill="#333"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>'
};
function icon(name){ const s=h('span',{class:'ico'}); s.innerHTML=ICONS[name]; return s; } // static, trusted SVG only
function maybeIntro(){
  if (S.introShown || !S.me || S.me.introSeen) return;
  S.introShown = true;
  openIntro(0);
}
function installSteps(platform){
  if (platform==='ios') return h('div',{},
    h('ol',{class:'steps'},
      h('li',{},h('div',{},'Open this site in ',h('b',{},'Safari'),'. If you opened it from a text or Instagram, tap “Open in Safari” or copy the link below and paste it into Safari.')),
      h('li',{},h('div',{},'Tap the ',h('b',{},'Share'),' button ',icon('share'),' at the bottom of the screen (on iPad it’s at the top).')),
      h('li',{},h('div',{},'Scroll down and tap ',h('b',{},'Add to Home Screen'),' ',icon('plus'),'.')),
      h('li',{},h('div',{},'Keep the name ',h('b',{},'Lists by Nick'),' and tap ',h('b',{},'Add'),'.')),
      h('li',{},h('div',{},'Open it from your home screen and log in once. It’ll stay logged in.'))),
    h('div',{class:'note',style:'margin-top:8px'},'Using Chrome on iPhone? Tap ',icon('share'),' in the address bar, then “Add to Home Screen.”'));
  return h('div',{},
    deferredPrompt ? h('button',{class:'btn',style:'width:100%;justify-content:center;margin-bottom:10px',onclick:()=>{ $modal.replaceChildren(); markIntroSeen(); promptInstall(); }},'📲 Install now') : null,
    h('ol',{class:'steps'},
      h('li',{},h('div',{},'Open this site in ',h('b',{},'Chrome'),'.')),
      h('li',{},h('div',{},'Tap the ',h('b',{},'menu'),' ',icon('dots'),' in the top right corner.')),
      h('li',{},h('div',{},'Tap ',h('b',{},'Install app'),' or ',h('b',{},'Add to Home screen'),'.')),
      h('li',{},h('div',{},'Tap ',h('b',{},'Install'),'. The app icon shows up on your home screen.')),
      h('li',{},h('div',{},'Open it and log in once. It’ll stay logged in.'))),
    h('div',{class:'note',style:'margin-top:8px'},'Samsung Internet: tap ☰ at the bottom, then “Add page to” → “Home screen.”'));
}
function markIntroSeen(){ if (S.me && !S.me.introSeen){ S.me.introSeen=true; api('/intro-seen',{body:{}}).catch(()=>{}); } }
function openIntro(start){
  let step = start||0, platform = IS_ANDROID ? 'android' : 'ios';
  const sheet = h('div',{class:'sheet intro'});
  const scrim = h('div',{class:'scrim'},sheet);
  const finish=()=>{ $modal.replaceChildren(); markIntroSeen(); };
  scrim.addEventListener('click',e=>{ if(e.target===scrim) finish(); });
  const slides = [
    ()=>h('div',{},
      h('div',{class:'hero-e'},'🎄'),
      h('h3',{},'Welcome to Christmas Lists by Nick'),
      h('p',{class:'sub',style:'text-align:center;margin:-4px 0 10px'},'Everyone’s wish lists in one place, with no doubled-up gifts.'),
      [['👨‍👩‍👧','Join your family circle','Use the 6-letter code someone sends you, or start your own circle.'],
       ['🎁','Make your wish list','Add a photo, a link, and up to 5 backup stores for each item.'],
       ['✅','Check off what you’re buying','Others just see “Taken.” Your name stays private, and the person you’re buying for sees nothing.'],
       ['📜','Master list','Every item from every list in one place, with duplicates combined.']]
       .map(([i,t,d])=>h('div',{class:'feat'},h('div',{class:'fi'},i),h('div',{},h('div',{style:'font-weight:700'},t),h('div',{class:'sub'},d))))),
    ()=>h('div',{},
      h('div',{class:'hero-e'},'📲'),
      h('h3',{},'Add it to your home screen'),
      isStandalone() ? h('div',{class:'note',style:'text-align:center'},'✅ You’re already using the home-screen app!') : [
      h('p',{class:'sub',style:'text-align:center;margin:-4px 0 6px'},'Then it opens like a real app, right from your phone.'),
      h('div',{class:'tabs'},
        h('button',{class:platform==='ios'?'on':'',onclick:()=>{platform='ios';draw();}},' iPhone / iPad'),
        h('button',{class:platform==='android'?'on':'',onclick:()=>{platform='android';draw();}},'🤖 Android')),
      installSteps(platform),
      h('div',{style:'font-weight:600;font-size:13px;margin-top:12px'},'App link'),
      h('div',{class:'linkcopy'},h('span',{},APP_URL),copyBtn(APP_URL))]),
    ()=>h('div',{},
      h('div',{class:'hero-e'},'🎅'),
      h('h3',{},'You’re all set!'),
      h('p',{class:'sub',style:'text-align:center'},'Add your phone number, then join or create a circle.'),
      h('div',{class:'note',style:'margin-top:10px'},'You can see these steps again anytime with the ',h('b',{},'📲 Add to phone'),' button at the top, or from the ',h('b',{},'Me'),' tab.'))
  ];
  function draw(){
    const last = step===slides.length-1;
    sheet.replaceChildren(
      slides[step](),
      h('div',{class:'dots'},slides.map((_,i)=>h('span',{class:i===step?'on':''}))),
      h('div',{class:'acts',style:'justify-content:space-between'},
        step>0 ? h('button',{class:'btn ghost',onclick:()=>{step--;draw();}},'Back') : h('button',{class:'btn ghost',onclick:finish},'Skip'),
        last ? h('button',{class:'btn',onclick:()=>{ finish(); if (!(S.me.contacts||[]).some(c=>c.type==='Phone')) openProfile(); }},'Let’s go')
             : h('button',{class:'btn',onclick:()=>{step++;draw();}},'Next')));
    sheet.scrollTop=0;
  }
  draw();
  $modal.replaceChildren(scrim);
}
$help.addEventListener('click',()=>openIntro(1));

// ---------- live updates ----------
setInterval(()=>{ if (S.me && document.visibilityState==='visible' && !$modal.firstChild) refresh(); }, 20000);
document.addEventListener('visibilitychange',()=>{ if (S.me && document.visibilityState==='visible') refresh(); });

// ---------- service worker (offline shell + installable app) ----------
if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));

// ---------- boot ----------
(async function boot(){
  try { await api('/state').then(st=>{ Object.assign(S, st, {loaded:true}); $nav.hidden=false; $help.hidden=isStandalone(); render(); maybeIntro(); }); }
  catch(e){ if (e.status!==401) showError(e.message); }
})();

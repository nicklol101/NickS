// Christmas Lists by Nick — "Continue with Google"
// Shows Google's sign-in button on the login screen once a Google Client ID
// is set in Netlify (environment variable GOOGLE_CLIENT_ID). Until then it hides itself.
'use strict';

let googleCfg = null;      // null = not checked yet
let googleLib = null;      // promise for Google's script

function loadGoogleLib() {
  if (googleLib) return googleLib;
  googleLib = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => { googleLib = null; reject(new Error('Could not load Google sign-in.')); };
    document.head.append(s);
  });
  return googleLib;
}

async function googleClientId() {
  if (googleCfg === null) {
    try { googleCfg = (await (await fetch('/api/config', { cache: 'no-store' })).json()).googleClientId || ''; }
    catch { googleCfg = ''; }
  }
  return googleCfg;
}

async function addGoogleButton(mode) {
  const form = document.querySelector('.auth form');
  if (!form || document.getElementById('gbtn-wrap')) return;
  const clientId = await googleClientId();
  if (!clientId || !document.querySelector('.auth form')) return;

  const err = h('div', { class: 'err', style: 'text-align:center' });
  const slot = h('div', { style: 'display:flex;justify-content:center;min-height:44px' });
  const wrap = h('div', { id: 'gbtn-wrap', style: 'margin-top:14px' },
    h('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:12px;color:var(--muted);font-size:13px' },
      h('span', { style: 'flex:1;height:1px;background:var(--line)' }), 'or', h('span', { style: 'flex:1;height:1px;background:var(--line)' })),
    slot, err);
  form.after(wrap);

  try {
    const google = await loadGoogleLib();
    google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      callback: async (resp) => {
        err.textContent = '';
        try {
          await api('/google', { body: { credential: resp.credential } });
          $main.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'big' }, '🎁'), 'Loading your lists…'));
          await refresh();
        } catch (e) { err.textContent = e.message; }
      }
    });
    google.accounts.id.renderButton(slot, {
      theme: 'outline', size: 'large', shape: 'pill',
      text: mode === 'signup' ? 'signup_with' : 'continue_with',
      width: Math.min(360, (form.clientWidth || 320))
    });
  } catch (e) {
    wrap.remove();
  }
}

// Hook into the login / sign-up screen.
const renderAuthBeforeGoogle = renderAuth;
renderAuth = function (mode) {
  renderAuthBeforeGoogle(mode);
  addGoogleButton(mode || 'login');
};

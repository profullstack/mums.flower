// mums.flower browser helpers: passkeys, copy link, offline shell. Pages work without this.
const msg = (text) => {
  for (const el of document.querySelectorAll('[data-passkey-msg]')) el.textContent = text;
};

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

/** Load the WebAuthn helper (UMD, sets window.SimpleWebAuthnBrowser) on first use. */
function webauthn() {
  if (window.SimpleWebAuthnBrowser) return Promise.resolve(window.SimpleWebAuthnBrowser);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/simplewebauthn.js';
    s.onload = () => resolve(window.SimpleWebAuthnBrowser);
    s.onerror = () => reject(new Error('could not load the passkey helper'));
    document.head.append(s);
  });
}

const loginBtn = document.querySelector('[data-passkey-login]');
if (loginBtn && window.PublicKeyCredential) {
  loginBtn.hidden = false;
  loginBtn.addEventListener('click', async () => {
    try {
      const { startAuthentication } = await webauthn();
      const { options, challengeId } = await post('/api/v1/passkeys/login/options');
      const response = await startAuthentication({ optionsJSON: options });
      await post('/api/v1/passkeys/login/verify', { challengeId, response });
      location.href = '/app';
    } catch (e) {
      msg(e?.name === 'NotAllowedError' ? 'Cancelled.' : `Passkey sign-in failed: ${e.message}`);
    }
  });
}

const regBtn = document.querySelector('[data-passkey-register]');
if (regBtn) {
  if (!window.PublicKeyCredential) {
    regBtn.disabled = true;
    msg('This browser does not support passkeys.');
  }
  regBtn.addEventListener('click', async () => {
    try {
      const { startRegistration } = await webauthn();
      const { options, challengeId } = await post('/api/v1/passkeys/register/options');
      const response = await startRegistration({ optionsJSON: options });
      await post('/api/v1/passkeys/register/verify', { challengeId, response });
      location.href = '/account?m=' + encodeURIComponent('Passkey added. Next time, sign in with it.');
    } catch (e) {
      msg(e?.name === 'NotAllowedError' ? 'Cancelled.' : `Could not add the passkey: ${e.message}`);
    }
  });
}

for (const b of document.querySelectorAll('[data-copy]')) {
  b.addEventListener('click', async () => {
    const url = b.getAttribute('data-copy');
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Flowers for you', url });
      else {
        await navigator.clipboard.writeText(url);
        b.textContent = 'Copied ✓';
      }
    } catch {
      prompt('Copy this link:', url);
    }
  });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

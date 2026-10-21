'use client';

import { useEffect, useState } from 'react';

type Who = { username: string; display_name: string } | null;

/** Curator login, pyecod_vis style: username only, session row in ecod_curation.curator_session. */
export default function LoginBox() {
  const [who, setWho] = useState<Who | undefined>(undefined);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((j) => setWho(j.authenticated ? j.curator : null))
      .catch(() => setWho(null));
  }, []);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name.trim() }),
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error ?? 'login failed'); return; }
    window.location.reload();
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  };

  if (who === undefined) return null;
  if (who) {
    return (
      <span style={{ fontSize: 12 }}>
        {who.display_name} <button className="linkish muted" onClick={logout}>log out</button>
      </span>
    );
  }
  return (
    <form onSubmit={login} className="navlogin" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="curator username" size={14} />
      <button className="btn" type="submit" disabled={!name.trim()}>log in</button>
      {err && <span style={{ color: 'var(--bad)' }}>{err}</span>}
    </form>
  );
}

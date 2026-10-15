'use client';

import React from 'react';
import { useClaimsStore } from '../lib/store';

export function Sidebar() {
  const { route, navigate, user, setUser, users, toast, exceptions } = useClaimsStore();

  const navItems = [
    { group: 'Work' },
    {
      path: 'intake',
      label: 'Intake',
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      ),
    },
    {
      path: 'claims',
      label: 'Claims',
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6M8 13h8M8 17h5" />
        </svg>
      ),
    },
    {
      path: 'queue',
      label: 'Work queue',
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      ),
      count: exceptions.filter(x => x.sla !== 'On track').length,
      warn: true,
    },
    { group: 'Reference' },
    {
      path: 'tariffs',
      label: 'Tariff repository',
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M3 7h18M3 12h18M3 17h18M8 7v10M16 7v10" />
        </svg>
      ),
    },
    {
      path: 'reports',
      label: 'Reports',
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      ),
    },
    { group: 'System' },
    {
      path: 'admin',
      label: 'Admin',
      icon: (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      ),
    },
  ];

  const userInitials = (user.name || 'U')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  return (
    <nav className="rail" id="rail">
      <div className="brand">
        <div className="brand-mark">CD</div>
        <div>
          <div className="brand-name">ClaimsDigi</div>
          <div className="brand-sub">Claims document digitization</div>
        </div>
      </div>

      <div className="nav" id="nav">
        {navItems.map((n, i) =>
          n.group ? (
            <div key={i} className="nav-group">
              {n.group}
            </div>
          ) : (
            <a
              key={n.path}
              href={`#/${n.path}`}
              className={route.path === n.path ? 'active' : ''}
              onClick={e => {
                e.preventDefault();
                navigate(n.path!);
              }}
            >
              {n.icon}
              {n.label}
              {typeof n.count === 'number' && n.count > 0 && (
                <span className={`n-count ${n.warn ? 'warn' : ''}`}>{n.count}</span>
              )}
            </a>
          )
        )}
      </div>

      <div className="rail-user">
        <div className="avatar" id="rail-avatar">
          {userInitials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div id="rail-username">{user.name}</div>
          <select
            id="role-switch"
            title="Switch active user"
            value={user.id}
            onChange={e => {
              const selected = users.find(u => u.id === e.target.value);
              if (selected) {
                setUser(selected);
                toast(`Now acting as ${selected.name} (${selected.role})`);
              }
            }}
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role}
              </option>
            ))}
          </select>
        </div>
      </div>
    </nav>
  );
}

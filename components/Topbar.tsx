'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useClaimsStore } from '../lib/store';

export function Topbar() {
  const {
    route,
    navigate,
    claims,
    exceptions,
    providers,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useClaimsStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Compute title and breadcrumbs based on route
  let title = 'Intake';
  let crumbs: Array<{ label: string; href?: string }> = [{ label: 'Intake' }];

  if (route.path === 'claims') {
    if (route.subId) {
      title = route.subId;
      crumbs = [{ label: 'Claims', href: '#/claims' }, { label: route.subId }];
    } else {
      title = 'Claims';
      crumbs = [{ label: 'Claims' }];
    }
  } else if (route.path === 'queue') {
    title = 'Work queue';
    crumbs = [{ label: 'Work queue' }];
  } else if (route.path === 'tariffs') {
    title = 'Tariff repository';
    const currentProv = providers.find(p => p.id === route.subId) || providers[0];
    crumbs = [{ label: 'Tariff repository', href: '#/tariffs' }, { label: currentProv?.name || '' }];
  } else if (route.path === 'reports') {
    title = 'Reports';
    crumbs = [{ label: 'Reports' }];
  } else if (route.path === 'admin') {
    title = 'Admin';
    crumbs = [{ label: 'Admin' }];
  }

  // Search results
  const getSearchHits = () => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const hits: Array<{ title: string; subtitle: string; link: string }> = [];

    claims.forEach(c => {
      if ([c.id, c.patient, c.memberId, c.policy, c.hospital].join(' ').toLowerCase().includes(q)) {
        hits.push({
          title: `${c.id} · ${c.patient}`,
          subtitle: `${c.hospital} · ${c.status}`,
          link: `#/claims/${c.id}`,
        });
      }
    });

    exceptions.forEach(x => {
      if ([x.id, x.issue, x.type].join(' ').toLowerCase().includes(q)) {
        hits.push({
          title: `${x.id} · ${x.type}`,
          subtitle: `${x.claimId} · ${x.issue}`,
          link: x.link,
        });
      }
    });

    providers.forEach(p => {
      if (p.name.toLowerCase().includes(q)) {
        hits.push({
          title: p.name,
          subtitle: `Tariff repository · ${p.versions.length} version(s)`,
          link: `#/tariffs/${p.id}`,
        });
      }
    });

    return hits.slice(0, 8);
  };

  const searchHits = isSearchOpen ? getSearchHits() : [];
  const unreadCount = notifications.filter(n => !n.read).length;

  const mobileNavLinks = [
    { path: 'intake', label: 'Intake' },
    { path: 'claims', label: 'Claims' },
    { path: 'queue', label: 'Work queue' },
    { path: 'tariffs', label: 'Tariff repository' },
    { path: 'reports', label: 'Reports' },
    { path: 'admin', label: 'Admin' },
  ];

  return (
    <>
      <div className="mobile-nav" id="mobile-nav">
        {mobileNavLinks.map(l => (
          <a
            key={l.path}
            href={`#/${l.path}`}
            className={route.path === l.path ? 'active' : ''}
            onClick={e => {
              e.preventDefault();
              navigate(l.path);
            }}
          >
            {l.label}
          </a>
        ))}
      </div>

      <header className="topbar">
        <div>
          <h1 id="page-title">{title}</h1>
          <div className="crumbs" id="crumbs">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span>/</span>}
                {c.href ? (
                  <a
                    href={c.href}
                    onClick={e => {
                      e.preventDefault();
                      navigate(c.href!.replace(/^#\/?/, ''));
                    }}
                  >
                    {c.label}
                  </a>
                ) : (
                  <span>{c.label}</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="spacer"></div>

        <div className="search" ref={searchRef}>
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="global-search"
            type="search"
            placeholder="Search claim, member, hospital, exception…"
            autoComplete="off"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(e.target.value.trim().length >= 2);
            }}
            onFocus={() => {
              if (searchQuery.trim().length >= 2) setIsSearchOpen(true);
            }}
          />
          {isSearchOpen && (
            <div className="search-results open" id="search-results">
              {searchHits.length > 0 ? (
                searchHits.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      navigate(h.link.replace(/^#\/?/, ''));
                      setIsSearchOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    {h.title}
                    <small>{h.subtitle}</small>
                  </button>
                ))
              ) : (
                <div className="empty" style={{ padding: '16px' }}>
                  No matches
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }} ref={notifRef}>
          <button
            className="icon-btn"
            id="notif-btn"
            title="Notifications"
            aria-label="Notifications"
            onClick={e => {
              e.stopPropagation();
              setIsNotifOpen(!isNotifOpen);
              setIsSearchOpen(false);
            }}
          >
            <svg viewBox="0 0 24 24">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="dot" id="notif-count">
                {unreadCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="notif-panel open" id="notif-panel">
              <header>
                <span>Notifications</span>
                <button
                  className="btn btn-ghost btn-sm"
                  id="notif-clear"
                  onClick={() => markAllNotificationsRead()}
                >
                  Mark all read
                </button>
              </header>
              <ul id="notif-list">
                {notifications.length > 0 ? (
                  notifications.map(n => (
                    <li
                      key={n.id}
                      className={!n.read ? 'unread' : ''}
                      onClick={() => {
                        markNotificationRead(n.id);
                        setIsNotifOpen(false);
                        if (n.link) navigate(n.link.replace(/^#\/?/, ''));
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <span
                        className="notif-ico"
                        style={{
                          background:
                            n.kind === 'warn'
                              ? 'var(--amber)'
                              : n.kind === 'bad'
                              ? 'var(--red)'
                              : 'var(--green)',
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div>{n.text}</div>
                        <div className="t">{new Date(n.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </li>
                  ))
                ) : (
                  <div className="empty">No notifications</div>
                )}
              </ul>
            </div>
          )}
        </div>
      </header>
    </>
  );
}

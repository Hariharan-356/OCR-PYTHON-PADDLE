'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  Claim,
  User,
  RuleConfig,
  Provider,
  NotificationItem,
  SystemLogItem,
  ExceptionItem,
} from './types';
import {
  USERS,
  PERMS,
  INITIAL_RULES,
  PROVIDERS,
  CLAIMS,
  INITIAL_NOTIFS,
  INITIAL_LOGS,
  uid,
} from './data';
import { computeExceptions, claimTotals } from './engine';

export interface RouteState {
  path: string;
  subId?: string;
  tab?: string;
  query: Record<string, string>;
}

export interface ToastItem {
  id: string;
  text: string;
  kind?: string;
}

export interface ModalState {
  isOpen: boolean;
  title: string;
  content: ReactNode | null;
  footer?: ReactNode | null;
  wide?: boolean;
}

interface ClaimsContextType {
  claims: Claim[];
  setClaims: React.Dispatch<React.SetStateAction<Claim[]>>;
  updateClaim: (id: string, updater: (claim: Claim) => Claim) => void;
  addClaim: (claim: Claim) => void;
  user: User;
  setUser: (user: User) => void;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  rules: RuleConfig;
  setRules: React.Dispatch<React.SetStateAction<RuleConfig>>;
  providers: Provider[];
  setProviders: React.Dispatch<React.SetStateAction<Provider[]>>;
  notifications: NotificationItem[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  addNotification: (text: string, kind?: 'ok' | 'warn' | 'bad' | 'info', link?: string | null) => void;
  systemLogs: SystemLogItem[];
  addLog: (log: SystemLogItem) => void;
  toasts: ToastItem[];
  toast: (msg: string, kind?: string) => void;
  modal: ModalState;
  openModal: (opts: { title: string; content: ReactNode; footer?: ReactNode; wide?: boolean }) => void;
  closeModal: () => void;
  route: RouteState;
  navigate: (target: string) => void;
  can: (permission: string) => boolean;
  exceptions: ExceptionItem[];
  getClaimTotals: (c: Claim) => ReturnType<typeof claimTotals>;
}

const ClaimsContext = createContext<ClaimsContextType | null>(null);

function parseHashString(hash: string): RouteState {
  const clean = hash.replace(/^#\/?/, '');
  const [pathPart, qs] = clean.split('?');
  const parts = (pathPart || '').split('/').filter(Boolean);
  const query: Record<string, string> = {};
  if (qs) {
    qs.split('&').forEach(kv => {
      const [k, v] = kv.split('=');
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
  }
  const path = parts[0] || 'intake';
  const subId = parts[1];
  const tab = parts[2];
  return { path, subId, tab, query };
}

export function ClaimsProvider({ children }: { children: ReactNode }) {
  const [claims, setClaims] = useState<Claim[]>(() => JSON.parse(JSON.stringify(CLAIMS)));
  const [user, setUser] = useState<User>(() => USERS[0]);
  const [users, setUsers] = useState<User[]>(() => [...USERS]);
  const [rules, setRules] = useState<RuleConfig>(() => JSON.parse(JSON.stringify(INITIAL_RULES)));
  const [providers, setProviders] = useState<Provider[]>(() => [...PROVIDERS]);
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => [...INITIAL_NOTIFS]);
  const [systemLogs, setSystemLogs] = useState<SystemLogItem[]>(() => [...INITIAL_LOGS]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modal, setModal] = useState<ModalState>({ isOpen: false, title: '', content: null });
  const [route, setRoute] = useState<RouteState>({ path: 'intake', query: {} });

  // Sync route with window.location.hash
  useEffect(() => {
    const handleHash = () => {
      if (typeof window !== 'undefined') {
        const parsed = parseHashString(window.location.hash);
        setRoute(parsed);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const navigate = useCallback((target: string) => {
    if (typeof window !== 'undefined') {
      const clean = target.startsWith('#') ? target : `#/${target.replace(/^\//, '')}`;
      window.location.hash = clean;
    }
  }, []);

  const toast = useCallback((msg: string, kind: string = '') => {
    const id = uid('TST');
    setToasts(prev => [...prev, { id, text: msg, kind }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const openModal = useCallback((opts: { title: string; content: ReactNode; footer?: ReactNode; wide?: boolean }) => {
    setModal({
      isOpen: true,
      title: opts.title,
      content: opts.content,
      footer: opts.footer,
      wide: opts.wide,
    });
  }, []);

  const closeModal = useCallback(() => {
    setModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const addNotification = useCallback((text: string, kind: 'ok' | 'warn' | 'bad' | 'info' = 'ok', link: string | null = null) => {
    const n: NotificationItem = {
      id: uid('NTF'),
      ts: new Date().toISOString(),
      text,
      kind,
      read: false,
      link,
    };
    setNotifications(prev => [n, ...prev]);
  }, []);

  // Sync with NestJS backend on mount
  useEffect(() => {
    fetch('http://localhost:3001/api/claims')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data && Array.isArray(data) && data.length > 0) {
          setClaims(data);
        }
      })
      .catch(() => {
        // Local fallback is already initialized
      });
  }, []);

  const addLog = useCallback((log: SystemLogItem) => {
    setSystemLogs(prev => [log, ...prev]);
  }, []);

  const updateClaim = useCallback((id: string, updater: (claim: Claim) => Claim) => {
    setClaims(prev => {
      const updated = prev.map(c => (c.id === id ? updater(c) : c));
      const target = updated.find(c => c.id === id);
      if (target) {
        fetch(`http://localhost:3001/api/claims/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(target),
        }).catch(() => {});
      }
      return updated;
    });
  }, []);

  const addClaim = useCallback((claim: Claim) => {
    setClaims(prev => [claim, ...prev]);
    fetch('http://localhost:3001/api/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(claim),
    }).catch(() => {});
  }, []);

  const can = useCallback(
    (permission: string) => {
      const p = (PERMS as any)[user.role];
      return !!(p && p[permission]);
    },
    [user.role]
  );

  const exceptions = computeExceptions(claims, rules, providers);

  const getClaimTotals = useCallback((c: Claim) => {
    return claimTotals(c, rules, providers);
  }, [rules, providers]);

  return (
    <ClaimsContext.Provider
      value={{
        claims,
        setClaims,
        updateClaim,
        addClaim,
        user,
        setUser,
        users,
        setUsers,
        rules,
        setRules,
        providers,
        setProviders,
        notifications,
        markNotificationRead,
        markAllNotificationsRead,
        addNotification,
        systemLogs,
        addLog,
        toasts,
        toast,
        modal,
        openModal,
        closeModal,
        route,
        navigate,
        can,
        exceptions,
        getClaimTotals,
      }}
    >
      {children}
    </ClaimsContext.Provider>
  );
}

export function useClaimsStore() {
  const ctx = useContext(ClaimsContext);
  if (!ctx) throw new Error('useClaimsStore must be used within ClaimsProvider');
  return ctx;
}

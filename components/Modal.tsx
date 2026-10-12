'use client';

import React from 'react';
import { useClaimsStore } from '../lib/store';

export function Modal() {
  const { modal, closeModal } = useClaimsStore();

  if (!modal.isOpen) return null;

  return (
    <div
      className="modal-bg open"
      id="modal-bg"
      onClick={e => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className={`modal ${modal.wide ? 'wide' : ''}`} id="modal" role="dialog" aria-modal="true">
        <header>
          <h3>{modal.title}</h3>
          <button className="icon-btn" onClick={closeModal} aria-label="Close modal">
            <svg viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="mbody">{modal.content}</div>
        {modal.footer && <footer>{modal.footer}</footer>}
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useClaimsStore();

  return (
    <div className="toasts" id="toasts">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind || ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

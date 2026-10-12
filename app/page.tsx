'use client';

import React from 'react';
import { ClaimsProvider, useClaimsStore } from '../lib/store';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { Modal, Toasts } from '../components/Modal';
import { IntakeView } from '../components/views/IntakeView';
import { ClaimsView } from '../components/views/ClaimsView';
import { QueueView } from '../components/views/QueueView';
import { TariffsView } from '../components/views/TariffsView';
import { ReportsView } from '../components/views/ReportsView';
import { AdminView } from '../components/views/AdminView';
import { ClaimDetailView } from '../components/views/ClaimDetailView';

function DashboardContent() {
  const { route } = useClaimsStore();

  const renderActiveView = () => {
    if (route.path === 'claims' && route.subId) {
      return <ClaimDetailView claimId={route.subId} />;
    }
    switch (route.path) {
      case 'intake':
        return <IntakeView />;
      case 'claims':
        return <ClaimsView />;
      case 'queue':
        return <QueueView />;
      case 'tariffs':
        return <TariffsView />;
      case 'reports':
        return <ReportsView />;
      case 'admin':
        return <AdminView />;
      default:
        return <IntakeView />;
    }
  };

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar />
        <main className="content" id="content">
          {renderActiveView()}
        </main>
      </div>
      <Modal />
      <Toasts />
    </div>
  );
}

export default function Page() {
  return (
    <ClaimsProvider>
      <DashboardContent />
    </ClaimsProvider>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { AgentFlowProvider, useAgentFlow } from './context/AgentFlowContext';
import { AgentWorkspacePage } from './pages/AgentWorkspacePage';
import { DashboardPage } from './pages/DashboardPage';
import { NewTaskPage } from './pages/NewTaskPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TaskHistoryPage } from './pages/TaskHistoryPage';
import { WorkflowVisualizerPage } from './pages/WorkflowVisualizerPage';

function ShellLayout() {
  const { currentPage } = useAgentFlow();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'new-task':
        return <NewTaskPage />;
      case 'workspace':
        return <AgentWorkspacePage />;
      case 'visualizer':
        return <WorkflowVisualizerPage />;
      case 'reports':
        return <ReportsPage />;
      case 'history':
        return <TaskHistoryPage />;
      case 'settings':
        return <SettingsPage />;
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0B0F17] text-slate-100">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <TopBar onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AgentFlowProvider>
      <ShellLayout />
    </AgentFlowProvider>
  );
}

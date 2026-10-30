import React from 'react';
import { CircleHelp, Moon, Sun } from 'lucide-react';
import { Theme } from '../hooks/useTheme';

interface HeaderProps {
  /** null until the first health check completes */
  serverConnected: boolean | null;
  activeTab: 'playground' | 'matrix';
  setActiveTab: (tab: 'playground' | 'matrix') => void;
  runCount: number;
  /** Opens the onboarding tour. */
  onStartTour?: () => void;
  /** The colour theme and its toggle; omitted, no toggle is shown. */
  theme?: Theme;
  onToggleTheme?: () => void;
}

const TABS = [
  { id: 'playground', label: 'Playground & Inspector' },
  { id: 'matrix', label: 'Interop Matrix Report' }
] as const;

export const Header: React.FC<HeaderProps> = ({ serverConnected, activeTab, setActiveTab, runCount, onStartTour, theme, onToggleTheme }) => {
  const status =
    serverConnected === null
      ? { label: 'Connecting...', dot: 'bg-ink-subtle', text: 'text-ink-muted' }
      : serverConnected
        ? { label: 'Online (Collab/Mock)', dot: 'bg-success-line', text: 'text-success-ink' }
        : { label: 'Offline', dot: 'bg-danger-line', text: 'text-danger-ink' };

  return (
    <header className="bg-surface border-b border-line sticky top-0 z-50 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <div>
            <h1 className="text-base sm:text-lg font-semibold text-ink">MOSIP VC Interoperability Playground</h1>
            <p className="text-xs text-ink-muted">OpenID4VCI and OpenID4VP across Inji and independent implementations</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-pressed={theme === 'dark'}
                data-tour="theme-toggle"
                className="text-xs text-ink-muted hover:text-ink inline-flex items-center gap-1 whitespace-nowrap transition-colors"
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
            )}
            {onStartTour && (
              <button type="button" onClick={onStartTour} data-tour="tour-button" className="text-xs text-ink-muted hover:text-ink inline-flex items-center gap-1 whitespace-nowrap transition-colors">
                <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
                Take the tour
              </button>
            )}
            <p className="text-xs text-ink-muted inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
              BFF: <span className={`font-medium ${status.text}`}>{status.label}</span>
            </p>
          </div>
        </div>

        <nav aria-label="Views" className="flex gap-4 text-sm -mb-px">
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-tour={tab.id === 'matrix' ? 'report-tab' : undefined}
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 border-b-2 inline-flex items-center gap-1.5 transition-colors ${
                  active ? 'border-accent text-ink font-medium' : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {tab.label}
                {tab.id === 'matrix' && runCount > 0 && (
                  <span className="text-xs px-1.5 rounded-full bg-surface-muted border border-line text-ink-muted">{runCount}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

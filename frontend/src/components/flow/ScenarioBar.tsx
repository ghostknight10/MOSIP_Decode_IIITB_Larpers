import React from 'react';
import { Bug } from 'lucide-react';
import { Scenario, SCENARIOS } from '../../config/scenarios';

/** One-click presets for the documented test cases. */
export const ScenarioBar: React.FC<{ onRun: (scenario: Scenario) => void; disabled: boolean }> = ({ onRun, disabled }) => (
  <section aria-labelledby="scenario-heading" data-tour="scenarios" className="mb-4">
    <h4 id="scenario-heading" className="text-sm font-semibold text-ink mb-2">
      Quick scenarios
    </h4>
    <div className="grid grid-cols-2 gap-2">
      {SCENARIOS.map(sc => (
        <button
          key={sc.id}
          type="button"
          disabled={disabled}
          onClick={() => onRun(sc)}
          aria-label={`${sc.testCase} ${sc.label}`}
          aria-describedby={`scenario-${sc.id}-desc`}
          className="text-left p-2.5 rounded-md border border-line bg-surface hover:border-accent hover:bg-accent-soft disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-ink">
            <span className="shrink-0 whitespace-nowrap font-mono text-xs px-1.5 py-0.5 rounded border border-line bg-surface-muted text-ink-muted">{sc.testCase}</span>
            {sc.tamper && <Bug className="h-3.5 w-3.5 text-warning-ink" aria-hidden="true" />}
            {sc.label}
          </span>
          {/* Still the button's accessible description when visually hidden on phones. */}
          <span id={`scenario-${sc.id}-desc`} className="hidden sm:block mt-1 text-xs text-ink-muted">
            {sc.description}
          </span>
        </button>
      ))}
    </div>
  </section>
);

import React from 'react';
import { Bug, Play } from 'lucide-react';
import { Scenario, SCENARIOS } from '../../config/scenarios';

/** One-click presets for the documented test cases. */
export const ScenarioBar: React.FC<{ onRun: (scenario: Scenario) => void; disabled: boolean }> = ({ onRun, disabled }) => (
  <section aria-labelledby="scenario-heading" className="mb-4">
    <h4 id="scenario-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
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
          className="text-left p-2.5 rounded-lg border border-slate-800 bg-slate-950/50 hover:border-sky-500/50 hover:bg-sky-500/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-100">
            <span className="font-mono px-1.5 py-0.5 rounded-sm bg-slate-800 text-sky-300">{sc.testCase}</span>
            {sc.tamper ? <Bug className="h-3.5 w-3.5 text-rose-300" aria-hidden="true" /> : <Play className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />}
            {sc.label}
          </span>
          {/* Still the button's accessible description when visually hidden on phones. */}
          <span id={`scenario-${sc.id}-desc`} className="hidden sm:block mt-1 text-xs text-slate-400">
            {sc.description}
          </span>
        </button>
      ))}
    </div>
  </section>
);

import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { ProtocolLog } from '../types';
import { chronological, participantOf } from '../lib/participants';

interface RunTimelineProps {
  /** Logs newest-first, as stored by the run hook. */
  logs: ProtocolLog[];
  /** Number of steps revealed (replay); defaults to all. */
  revealed?: number;
}

const STATUS = {
  SUCCESS: { Icon: CheckCircle2, cls: 'text-success-ink', label: 'Success' },
  FAILED: { Icon: XCircle, cls: 'text-danger-ink', label: 'Failed' },
  PENDING: { Icon: Clock, cls: 'text-ink-muted', label: 'Pending' }
} as const;

/**
 * Vertical, screen-reader friendly list of protocol steps. Replaces the
 * sequence diagram on small screens and doubles as a progress track.
 */
export const RunTimeline: React.FC<RunTimelineProps> = ({ logs, revealed }) => {
  const steps = chronological(logs);
  const shown = revealed ?? steps.length;
  return (
    <ol aria-label="Protocol steps" className="space-y-1.5">
      {steps.map((log, i) => {
        const { Icon, cls, label } = STATUS[log.status] ?? STATUS.PENDING;
        const from = participantOf(log.sender) ?? log.sender;
        const to = participantOf(log.receiver) ?? log.receiver;
        const future = i >= shown;
        const current = i === shown - 1;
        return (
          <li
            key={log.id}
            aria-current={current ? 'step' : undefined}
            className={`flex items-start gap-3 p-2 rounded-md border text-xs transition-colors ${
              current ? 'border-accent border-l-4 bg-accent-soft' : 'border-line bg-surface'
            }`}
          >
            <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border font-mono flex items-center justify-center ${
              future ? 'border-line text-ink-subtle' : 'border-line-strong bg-surface-muted text-ink'
            }`}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className={`font-medium truncate ${future ? 'text-ink-subtle' : 'text-ink'}`}>{log.action}</div>
              <div className={future ? 'text-ink-subtle' : 'text-ink-muted'}>
                {from} → {to} <span className="font-mono text-ink-subtle">· {log.protocol}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <span className={`inline-flex items-center gap-1 font-medium ${future ? 'text-ink-subtle' : cls}`}>
                {future ? <Clock className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                {future ? 'Not yet' : label}
              </span>
              {log.tampered && !future && (
                <div className="mt-0.5 inline-flex items-center gap-1 text-warning-ink">
                  <AlertTriangle className="h-3 w-3" /> Tampered
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

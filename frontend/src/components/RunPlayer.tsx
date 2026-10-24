import React, { useEffect, useState } from 'react';
import { Pause, Play, Radio, SkipBack, StepBack, StepForward } from 'lucide-react';
import { ProtocolLog } from '../types';
import { chronological } from '../lib/participants';

interface RunPlayerProps {
  /** The run's logs, newest-first. */
  logs: ProtocolLog[];
  /** Steps revealed, or null when following the live run. */
  revealed: number | null;
  onChange: (revealed: number | null) => void;
  intervalMs?: number;
}

const prefersReducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/**
 * Step-by-step replay of a run (the "animated / interactive sequence diagram"
 * good-to-have). Skim the whole exchange, then step through it.
 */
export const RunPlayer: React.FC<RunPlayerProps> = ({ logs, revealed, onChange, intervalMs = 800 }) => {
  const steps = chronological(logs);
  const total = steps.length;
  const position = revealed ?? total;
  const [playing, setPlaying] = useState(false);
  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    if (!playing) return;
    if (position >= total) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => onChange(position + 1), intervalMs);
    return () => clearTimeout(id);
  }, [playing, position, total, intervalMs, onChange]);

  // A new run arriving (logs changing under us) stops playback.
  useEffect(() => setPlaying(false), [total]);

  if (total === 0) return null;
  const go = (n: number) => {
    setPlaying(false);
    onChange(Math.min(total, Math.max(1, n)));
  };
  const play = () => {
    if (position >= total) onChange(1);
    setPlaying(true);
  };
  const btn = 'p-1.5 rounded-md border border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed';
  const current = steps[position - 1];

  return (
    <div role="group" aria-label="Replay controls" className="mb-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={btn} onClick={() => go(1)} disabled={position <= 1} aria-label="First step">
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn} onClick={() => go(position - 1)} disabled={position <= 1} aria-label="Previous step">
          <StepBack className="h-3.5 w-3.5" />
        </button>
        {playing ? (
          <button type="button" className={btn} onClick={() => setPlaying(false)} aria-label="Pause replay">
            <Pause className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            className={btn}
            onClick={play}
            disabled={reducedMotion}
            aria-label="Play replay"
            title={reducedMotion ? 'Autoplay is off because your system prefers reduced motion; use the step buttons.' : undefined}
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="button" className={btn} onClick={() => go(position + 1)} disabled={position >= total} aria-label="Next step">
          <StepForward className="h-3.5 w-3.5" />
        </button>
        <input
          type="range"
          min={1}
          max={total}
          value={position}
          onChange={e => go(Number(e.target.value))}
          aria-label="Replay position"
          aria-valuetext={`Step ${position} of ${total}`}
          className="flex-1 min-w-24 accent-sky-500"
        />
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            onChange(null);
          }}
          aria-pressed={revealed === null}
          className={`px-2 py-1 rounded-md border text-xs font-semibold inline-flex items-center gap-1 ${
            revealed === null ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Radio className="h-3.5 w-3.5" /> Live
        </button>
      </div>
      <p aria-live="polite" className="mt-1.5 text-xs text-slate-300">
        {revealed === null ? `Live · ${total} step${total === 1 ? '' : 's'}` : `Step ${position} of ${total}: ${current?.action ?? ''}`}
      </p>
    </div>
  );
};

import React, { useEffect, useRef } from 'react';
import { Controls, EVENTS, Joyride, STATUS, Step } from 'react-joyride';

/**
 * First-visit walkthrough (react-joyride). Starts once, remembers that it was
 * seen, and can be reopened from the header. Steps point at stable
 * `data-tour` attributes, and a test checks each target exists, so the tour
 * can't silently drift from the UI.
 */
export const TOUR_KEY = 'mosip-playground-tour';

export const tourSeen = (): boolean => {
  try {
    return localStorage.getItem(TOUR_KEY) === 'done';
  } catch {
    return false; // storage unavailable: show it, it just won't be remembered
  }
};

export const markTourSeen = () => {
  try {
    localStorage.setItem(TOUR_KEY, 'done');
  } catch {
    // Private mode: the tour will show again next visit.
  }
};

const target = (name: string) => `[data-tour="${name}"]`;

export const TOUR_STEPS: Step[] = [
  {
    id: 'welcome',
    target: 'body',
    placement: 'center',
    title: 'Welcome to the interoperability playground',
    content:
      'A credential is issued, held in a wallet and shown to a verifier. Here you pick who plays each role, run the whole exchange, and see exactly what was sent, what was checked, and where things break. This takes about a minute.'
  },
  {
    id: 'matrix',
    target: target('matrix'),
    placement: 'bottom',
    title: 'Pick who plays each role',
    content:
      'Choose an issuer, a wallet and a verifier. Inji modules sit next to our own mocks and an independent implementation (Walt.id), so you can test across ecosystems. The badges show where each one stands.'
  },
  {
    id: 'format',
    target: target('format'),
    placement: 'bottom',
    title: 'Choose the credential format',
    content: 'W3C VC, SD-JWT VC or mDoc. Formats a node cannot handle are greyed out.'
  },
  {
    id: 'scenarios',
    target: target('scenarios'),
    placement: 'right',
    title: 'Or start from a ready-made scenario',
    content:
      'Each preset sets the roles, the format and the attack for you: happy paths, an expired credential, a corrupted signature, a replayed presentation, and credentials crossing between ecosystems.'
  },
  {
    id: 'run',
    target: target('run-flow'),
    placement: 'bottom',
    title: 'Run the whole flow',
    content: 'One click issues the credential, presents it and shows the verifier\'s verdict. The two phases below can also be run one at a time.'
  },
  {
    id: 'tamper',
    target: target('tamper'),
    placement: 'bottom',
    title: 'Try to break it',
    content:
      'Tamper mode really changes the credential before it is shown: expire it, corrupt its signature, swap its type, or replay an old answer. A good verifier rejects them. Not all of them do, and the report shows which.'
  },
  {
    id: 'live-view',
    target: target('live-view'),
    placement: 'left',
    title: 'Watch it happen, read every message',
    content:
      'After a run, every step of the exchange appears here: a timeline you can replay, a sequence diagram, and the protocol inspector with each request, response and header exactly as exchanged. "Live" marks steps that went to a real service.'
  },
  {
    id: 'report',
    target: target('report-tab'),
    placement: 'bottom',
    title: 'See the bigger picture',
    content:
      'The report collects every run into a heatmap of what works with what, names the layer where failures happen, and shows telemetry. Export it as Markdown or JSON.'
  },
  {
    id: 'done',
    target: 'body',
    placement: 'center',
    title: 'You are set',
    content: 'Click TC-01 for a first run. You can open this tour again any time with "Take the tour" at the top.'
  }
];

interface OnboardingTourProps {
  run: boolean;
  /** Called when the tour finishes or is skipped. */
  onEnd: () => void;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ run, onEnd }) => {
  const reducedMotion = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  // Escape ends the tour (the library's own Escape handling can only advance a step).
  const controls = useRef<Controls | null>(null);
  useEffect(() => {
    if (!run) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') controls.current?.skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run]);

  return (
    <Joyride
      run={run}
      steps={TOUR_STEPS}
      continuous
      scrollToFirstStep
      onEvent={(data, tourControls) => {
        controls.current = tourControls;
        if (data.type === EVENTS.TOUR_END || data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
          markTourSeen();
          onEnd();
        }
      }}
      locale={{ back: 'Back', close: 'Close', last: 'Done', next: 'Next', nextWithProgress: 'Next ({current} of {total})', skip: 'Skip tour' }}
      options={{
        skipBeacon: true,
        dismissKeyAction: false,
        overlayClickAction: false,
        showProgress: true,
        buttons: ['back', 'skip', 'primary'],
        primaryColor: 'var(--color-accent)',
        textColor: 'var(--color-ink)',
        backgroundColor: 'var(--color-surface)',
        arrowColor: 'var(--color-surface)',
        overlayColor: 'color-mix(in srgb, var(--color-scrim) 55%, transparent)',
        spotlightRadius: 6,
        spotlightPadding: 6,
        width: 380,
        zIndex: 100,
        scrollOffset: 120,
        scrollDuration: reducedMotion ? 0 : 300
      }}
      styles={{
        tooltip: { borderRadius: 6, boxShadow: 'none', border: '1px solid var(--color-line-strong)', fontFamily: 'inherit', fontSize: '14px', padding: 4 },
        tooltipTitle: { fontSize: '16px', fontWeight: 600, textAlign: 'left' },
        tooltipContent: { fontSize: '14px', lineHeight: 1.5, padding: '8px 4px', textAlign: 'left' },
        buttonPrimary: { borderRadius: 4, fontSize: '14px', fontWeight: 500 },
        buttonBack: { color: 'var(--color-ink-muted)', fontSize: '14px' },
        buttonSkip: { color: 'var(--color-ink-muted)', fontSize: '14px' }
      }}
    />
  );
};

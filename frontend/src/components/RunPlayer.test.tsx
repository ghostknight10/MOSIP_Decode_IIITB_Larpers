import { act, render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunPlayer } from './RunPlayer';
import { makeLog } from '../test/fixtures';

const logs = [makeLog({ step: 3, action: 'Third' }), makeLog({ step: 2, action: 'Second' }), makeLog({ step: 1, action: 'First' })];

const Harness: React.FC<{ initial?: number | null; spy?: (n: number | null) => void }> = ({ initial = null, spy }) => {
  const [revealed, setRevealed] = useState<number | null>(initial);
  return (
    <RunPlayer
      logs={logs}
      revealed={revealed}
      intervalMs={100}
      onChange={n => {
        spy?.(n);
        setRevealed(n);
      }}
    />
  );
};

const status = () => screen.getByText(/^(Live ·|Step \d)/);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RunPlayer', () => {
  it('renders nothing without logs', () => {
    const { container } = render(<RunPlayer logs={[]} revealed={null} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('starts live and reports the step count', () => {
    render(<Harness />);
    expect(status()).toHaveTextContent('Live · 3 steps');
    expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('steps backwards and forwards with the current action named', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(status()).toHaveTextContent('Step 2 of 3: Second');
    fireEvent.click(screen.getByRole('button', { name: 'First step' }));
    expect(status()).toHaveTextContent('Step 1 of 3: First');
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(status()).toHaveTextContent('Step 2 of 3: Second');
  });

  it('scrubs with the range slider', () => {
    render(<Harness />);
    const slider = screen.getByRole('slider', { name: 'Replay position' });
    fireEvent.change(slider, { target: { value: '1' } });
    expect(status()).toHaveTextContent('Step 1 of 3: First');
    expect(slider).toHaveAttribute('aria-valuetext', 'Step 1 of 3');
  });

  it('returns to live', () => {
    render(<Harness initial={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(status()).toHaveTextContent('Live');
  });

  it('autoplays from the start to the end, then stops', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play replay' }));
    expect(status()).toHaveTextContent('Step 1 of 3');
    act(() => vi.advanceTimersByTime(100));
    expect(status()).toHaveTextContent('Step 2 of 3');
    act(() => vi.advanceTimersByTime(100));
    expect(status()).toHaveTextContent('Step 3 of 3');
    act(() => vi.advanceTimersByTime(500));
    expect(spy.mock.calls.map(c => c[0])).toEqual([1, 2, 3]);
    expect(screen.getByRole('button', { name: 'Play replay' })).toBeInTheDocument();
  });

  it('pauses', () => {
    vi.useFakeTimers();
    render(<Harness initial={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play replay' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause replay' }));
    act(() => vi.advanceTimersByTime(1000));
    expect(status()).toHaveTextContent('Step 1 of 3');
  });

  it('disables autoplay when the user prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Play replay' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled(); // already at the end while live
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(status()).toHaveTextContent('Step 2 of 3');
  });
});

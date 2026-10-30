import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { markTourSeen, TOUR_KEY, TOUR_STEPS, tourSeen } from './OnboardingTour';

vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn().mockResolvedValue({ svg: '<svg></svg>' }) } }));

const stubHealth = () =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'healthy' }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

beforeEach(stubHealth);
afterEach(() => vi.unstubAllGlobals());

describe('tour storage', () => {
  it('remembers that the tour was seen', () => {
    localStorage.removeItem(TOUR_KEY);
    expect(tourSeen()).toBe(false);
    markTourSeen();
    expect(tourSeen()).toBe(true);
  });

  it('survives unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(tourSeen()).toBe(false);
    expect(() => markTourSeen()).not.toThrow();
  });
});

describe('tour steps', () => {
  it('has unique ids, a title and content for every step', () => {
    expect(new Set(TOUR_STEPS.map(s => s.id)).size).toBe(TOUR_STEPS.length);
    for (const step of TOUR_STEPS) {
      expect(step.title, step.id).toBeTruthy();
      expect(step.content, step.id).toBeTruthy();
    }
  });

  it('points only at elements that exist in the app, so the tour cannot drift from the UI', async () => {
    render(<App />);
    await screen.findByText(/Online/);
    for (const step of TOUR_STEPS.filter(s => s.target !== 'body')) {
      expect(document.querySelector(step.target as string), `${step.id}: ${String(step.target)}`).not.toBeNull();
    }
  });
});

describe('tour in the app', () => {
  it('does not start for a returning visitor', async () => {
    render(<App />);
    await screen.findByText(/Online/);
    expect(screen.queryByText('Welcome to the interoperability playground')).not.toBeInTheDocument();
  });

  it('starts for a first-time visitor, and skipping remembers it', async () => {
    localStorage.removeItem(TOUR_KEY);
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('Welcome to the interoperability playground')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Skip tour/ }));
    await waitFor(() => expect(screen.queryByText('Welcome to the interoperability playground')).not.toBeInTheDocument());
    expect(tourSeen()).toBe(true);
  });

  it('ends on Escape and remembers it', async () => {
    localStorage.removeItem(TOUR_KEY);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Welcome to the interoperability playground');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Welcome to the interoperability playground')).not.toBeInTheDocument());
    expect(tourSeen()).toBe(true);
  });

  it('can be reopened from the header, from any tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Interop Matrix Report/ }));
    await user.click(screen.getByRole('button', { name: /Take the tour/ }));
    expect(await screen.findByText('Welcome to the interoperability playground')).toBeInTheDocument();
    // The tour is about the playground, so it moved back to it.
    expect(screen.getByRole('button', { name: /Playground & Inspector/ })).toHaveAttribute('aria-current', 'page');
  });

  it('walks to the next step', async () => {
    localStorage.removeItem(TOUR_KEY);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Welcome to the interoperability playground');
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(await screen.findByText('Pick who plays each role')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

const renderHeader = (props: Partial<React.ComponentProps<typeof Header>> = {}) => {
  const setActiveTab = vi.fn();
  render(<Header serverConnected={true} activeTab="playground" setActiveTab={setActiveTab} runCount={0} {...props} />);
  return { setActiveTab };
};

describe('Header', () => {
  it.each([
    [null, 'Connecting...'],
    [true, 'Online (Collab/Mock)'],
    [false, 'Offline']
  ])('shows BFF state %s as "%s"', (serverConnected, label) => {
    renderHeader({ serverConnected });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('marks the active view', () => {
    renderHeader({ activeTab: 'matrix' });
    expect(screen.getByRole('button', { name: /Interop Matrix Report/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /Playground/ })).not.toHaveAttribute('aria-current');
  });

  it('switches views', async () => {
    const { setActiveTab } = renderHeader();
    await userEvent.click(screen.getByRole('button', { name: /Interop Matrix Report/ }));
    expect(setActiveTab).toHaveBeenCalledWith('matrix');
    await userEvent.click(screen.getByRole('button', { name: /Playground/ }));
    expect(setActiveTab).toHaveBeenCalledWith('playground');
  });

  it('shows the run count only when there are runs', () => {
    renderHeader({ runCount: 7 });
    expect(screen.getByRole('button', { name: /Interop Matrix Report/ })).toHaveTextContent('7');
  });

  it('hides the run count when there are no runs', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: /Interop Matrix Report/ })).toHaveTextContent(/^Interop Matrix Report$/);
  });
});

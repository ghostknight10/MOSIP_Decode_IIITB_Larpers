import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteropMatrixReport, scoreMatrix, toMarkdown } from './InteropMatrixReport';
import { allCombinations } from '../config/nodes';
import { makeRun } from '../test/fixtures';
import { RunRecord } from '../types';

const TOTAL = allCombinations().length;

const renderReport = (history: RunRecord[] = [], props: Partial<React.ComponentProps<typeof InteropMatrixReport>> = {}) => {
  const handlers = { onRunAll: vi.fn(), onClearHistory: vi.fn() };
  const user = userEvent.setup();
  render(<InteropMatrixReport history={history} batchProgress={null} busy={false} {...handlers} {...props} />);
  return { ...handlers, user };
};

/** The heatmap is the default view; matrix-table assertions use the List view. */
const renderList = async (history: RunRecord[] = []) => {
  const result = renderReport(history);
  await result.user.click(screen.getByRole('radio', { name: 'List' }));
  return result;
};
const matrixTable = () => screen.getAllByRole('table')[0];
const historyTable = () => screen.getAllByRole('table')[1];
const matrixRow = (issuer: string, wallet: string, verifier: string, format: string) =>
  within(matrixTable())
    .getAllByRole('row')
    .find(r => {
      const cells = within(r).queryAllByRole('cell').map(c => c.textContent);
      return cells[0] === issuer && cells[1] === wallet && cells[2] === verifier && cells[3] === format;
    })!;

// Blob downloads: capture the blob handed to URL.createObjectURL.
let blobs: Blob[] = [];
beforeEach(() => {
  blobs = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => {
    blobs.push(b as Blob);
    return 'blob:mock';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('InteropMatrixReport with no runs', () => {
  it('lists every combination as UNTESTED', async () => {
    await renderList();
    expect(within(matrixTable()).getAllByRole('row')).toHaveLength(TOTAL + 1);
    expect(within(matrixTable()).getAllByText('UNTESTED')).toHaveLength(TOTAL);
    expect(screen.getByText(`0 / ${TOTAL}`)).toBeInTheDocument();
  });

  it('shows an empty history message and no pass rate', () => {
    renderReport();
    expect(screen.getByText(/No runs yet/)).toBeInTheDocument();
    expect(screen.queryByText(/pass$/)).not.toBeInTheDocument();
    expect(screen.queryByText('No real MOSIP results yet')).not.toBeInTheDocument();
  });

  it('disables exports and clearing', () => {
    renderReport();
    expect(screen.getByRole('button', { name: /Markdown/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'JSON' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Clear/ })).toBeDisabled();
  });
});

describe('InteropMatrixReport with runs', () => {
  const history = [
    // newest first
    makeRun({ outcome: 'FAIL', verificationStatus: 'INVALID', errorDetail: 'Issuer DID not resolvable' }),
    makeRun({ proofType: 'older-run' }),
    makeRun({ issuer: 'mock-openid4vci', format: 'sd-jwt', proofType: 'JWT (ES256)' }),
    makeRun({ tampered: true, verificationStatus: 'EXPIRED', outcome: 'PASS' }),
    makeRun({ tampered: true, wallet: 'mock-wallet', verificationStatus: 'VALID', outcome: 'FAIL', errorDetail: 'accepted tampered VC' })
  ];

  it('uses the latest clean run for each combination', async () => {
    await renderList(history);
    const row = matrixRow('Inji Certify', 'Inji Web / Mobile', 'Inji Verify', 'W3C VC (JSON-LD)');
    expect(within(row).getByText('FAIL')).toBeInTheDocument();
    expect(within(row).getByText('Issuer DID not resolvable')).toBeInTheDocument();
    expect(within(row).queryByText('older-run')).not.toBeInTheDocument();
  });

  it('keeps tampered runs out of the matrix', async () => {
    await renderList(history);
    const row = matrixRow('Inji Certify', 'Simulated Holder', 'Inji Verify', 'W3C VC (JSON-LD)');
    expect(within(row).getByText('UNTESTED')).toBeInTheDocument();
  });

  it('computes coverage, pass rate and negative-path results', () => {
    renderReport(history);
    expect(screen.getByText(`2 / ${TOTAL}`)).toBeInTheDocument();
    expect(screen.getByText('Real: 1/2 pass')).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('shows 100% when every tested combination passes', () => {
    renderReport([makeRun()]);
    expect(screen.getByText('Real: 1/1 pass')).toBeInTheDocument();
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });

  it('flags runs that hit the emulated sandbox', async () => {
    await renderList([makeRun({ sandboxFallback: true })]);
    expect(within(matrixTable()).getByTitle('Emulated sandbox response')).toBeInTheDocument();
  });

  it('reports real and emulated results separately', () => {
    renderReport([makeRun(), makeRun({ issuer: 'mock-openid4vci', sandboxFallback: true, outcome: 'FAIL', errorDetail: 'x' })]);
    expect(screen.getByText('Real: 1/1 pass')).toBeInTheDocument();
    expect(screen.getByText('Emulated: 0/1 pass')).toBeInTheDocument();
    expect(screen.queryByText('No real MOSIP results yet')).not.toBeInTheDocument();
  });

  it('warns when every result came from the emulated sandbox', () => {
    renderReport([makeRun({ sandboxFallback: true })]);
    expect(screen.getByText('Emulated: 1/1 pass')).toBeInTheDocument();
    expect(screen.queryByText(/^Real:/)).not.toBeInTheDocument();
    expect(screen.getByText('No real MOSIP results yet')).toBeInTheDocument();
  });

  it('lists every run in the history table', () => {
    renderReport(history);
    expect(within(historyTable()).getAllByRole('row')).toHaveLength(history.length + 1);
    expect(screen.getByText(`(${history.length} of ${history.length})`)).toBeInTheDocument();
  });

  it.each([
    ['Filter by format', 'sd-jwt', 1],
    ['Filter by outcome', 'FAIL', 2],
    ['Filter by mode', 'tampered', 2],
    ['Filter by mode', 'clean', 3]
  ])('%s = %s narrows history to %i runs', async (label, value, count) => {
    const { user } = renderReport(history);
    await user.selectOptions(screen.getByLabelText(label), value);
    expect(within(historyTable()).getAllByRole('row')).toHaveLength(count + 1);
  });
});

describe('InteropMatrixReport actions', () => {
  it('starts a batch run', async () => {
    const { onRunAll, user } = renderReport();
    await user.click(screen.getByRole('button', { name: /Run All Combinations/ }));
    expect(onRunAll).toHaveBeenCalled();
  });

  it('shows batch progress and blocks a second batch', () => {
    renderReport([], { batchProgress: { done: 3, total: TOTAL } });
    expect(screen.getByRole('button', { name: `Running 3/${TOTAL}…` })).toBeDisabled();
  });

  it('blocks a batch while a single run is in progress', () => {
    renderReport([], { busy: true });
    expect(screen.getByRole('button', { name: /Run All Combinations/ })).toBeDisabled();
  });

  it('exports the report as Markdown', async () => {
    const history = [makeRun()];
    const { user } = renderReport(history);
    await user.click(screen.getByRole('button', { name: /Markdown/ }));
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe('text/markdown');
    expect(await blobs[0].text()).toContain('# Interoperability Report');
  });

  it('exports raw runs as JSON', async () => {
    const history = [makeRun(), makeRun({ outcome: 'FAIL' })];
    const { user } = renderReport(history);
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(JSON.parse(await blobs[0].text())).toEqual(history);
  });

  it('clears history only after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { onClearHistory, user } = renderReport([makeRun()]);
    await user.click(screen.getByRole('button', { name: /Clear/ }));
    expect(onClearHistory).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Clear/ }));
    expect(onClearHistory).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('prints', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { user } = renderReport();
    await user.click(screen.getByRole('button', { name: /Print/ }));
    expect(print).toHaveBeenCalled();
  });
});

describe('toMarkdown', () => {
  it('renders a matrix row per combination and a row per run', () => {
    const run = makeRun({ errorDetail: undefined });
    const md = toMarkdown(allCombinations().map(combo => ({ combo })), [run]);
    const lines = md.split('\n');
    expect(lines.filter(l => l.includes('| UNTESTED |'))).toHaveLength(TOTAL);
    expect(md).toContain(`| ${run.transactionId} |`);
    expect(md).toContain('| clean |');
  });

  it('escapes pipes inside cells so the table stays valid', () => {
    const run = makeRun({ outcome: 'FAIL', errorDetail: 'expected a|b' });
    const md = toMarkdown([], [run]);
    expect(md).toContain('expected a\\|b');
  });

  it('marks emulated and tampered runs', () => {
    const run = makeRun({ sandboxFallback: true, tampered: true });
    const combo = { issuer: run.issuer, wallet: run.wallet, verifier: run.verifier, format: run.format };
    const md = toMarkdown([{ combo, run }], [run]);
    expect(md).toMatch(/\| PASS \|  \|  \| yes \|/);
    expect(md).toContain('| tampered |');
  });
});

describe('scoreMatrix', () => {
  it('splits tested combinations into real and emulated scores', () => {
    const scores = scoreMatrix([
      { run: makeRun() },
      { run: makeRun({ outcome: 'FAIL' }) },
      { run: makeRun({ sandboxFallback: true }) },
      {}
    ]);
    expect(scores).toEqual({
      all: { tested: 3, passed: 2 },
      real: { tested: 2, passed: 1 },
      emulated: { tested: 1, passed: 1 }
    });
  });
});

describe('InteropMatrixReport heatmap and failure layers', () => {
  const cell = (label: RegExp) => screen.getByRole('button', { name: label });

  it('shows the heatmap by default with every supported cell untested', () => {
    renderReport();
    expect(screen.getByRole('radio', { name: 'Heatmap' })).toHaveAttribute('aria-checked', 'true');
    const heatmap = screen.getAllByRole('table')[0];
    expect(within(heatmap).getAllByRole('rowheader')).toHaveLength(4);
    expect(within(heatmap).getAllByRole('button', { name: /UNTESTED/ })).toHaveLength(TOTAL);
    // Inji Verify x mDoc: 4 issuer-wallet rows, shown as not supported and not clickable.
    expect(within(heatmap).getAllByLabelText(/Inji Verify, mDoc \(ISO 18013-5\), not supported/)).toHaveLength(4);
  });

  it('labels each cell with the combination, outcome, emulation and layer', () => {
    renderReport([makeRun({ outcome: 'FAIL', verificationStatus: 'SIGNATURE_MISMATCH', failedChecks: ['signatureValid'], sandboxFallback: true })]);
    const c = cell(/^Inji Certify → Inji Web \/ Mobile → Inji Verify, W3C VC \(JSON-LD\), FAIL/);
    expect(c).toHaveAccessibleName(/emulated sandbox, Technical layer$/);
    expect(c).toHaveTextContent('FAIL');
    expect(c).toHaveTextContent('TECH');
  });

  it('filters the run history to a combination when a cell is selected', async () => {
    const history = [makeRun(), makeRun({ issuer: 'mock-openid4vci' }), makeRun({ issuer: 'mock-openid4vci', format: 'sd-jwt' })];
    const { user } = renderReport(history);
    const target = cell(/^Mock OpenID4VCI → Inji Web \/ Mobile → Inji Verify, W3C VC/);
    await user.click(target);
    expect(target).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('(1 of 3)')).toBeInTheDocument();
    expect(screen.getByText(/Showing Mock OpenID4VCI → Inji Web \/ Mobile → Inji Verify/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear combination filter' }));
    expect(screen.getByText('(3 of 3)')).toBeInTheDocument();
  });

  it('toggles the combination filter off when the same cell is clicked again', async () => {
    const { user } = renderReport([makeRun(), makeRun({ issuer: 'mock-openid4vci' })]);
    const target = cell(/^Inji Certify → Inji Web \/ Mobile → Inji Verify, W3C VC/);
    await user.click(target);
    await user.click(target);
    expect(screen.getByText('(2 of 2)')).toBeInTheDocument();
  });

  it('shows the failure layer in history and filters by it', async () => {
    const history = [
      makeRun({ outcome: 'FAIL', verificationStatus: 'EXPIRED', failedChecks: ['notExpired'] }),
      makeRun({ outcome: 'FAIL', errorDetail: 'Issuance failed: down' }),
      makeRun()
    ];
    const { user } = renderReport(history);
    const historyTable = screen.getAllByRole('table')[1];
    expect(within(historyTable).getByText('Organizational')).toBeInTheDocument();
    expect(within(historyTable).getByText('Technical')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter by layer'), 'Organizational');
    expect(within(screen.getAllByRole('table')[1]).getAllByRole('row')).toHaveLength(2);
  });

  it('explains the layers', () => {
    renderReport();
    expect(screen.getByText('Failure layers (Schumm et al., 2025)')).toBeInTheDocument();
    expect(screen.getByText(/Out of scope for automated runs/)).toBeInTheDocument();
  });

  it('includes the layer in the Markdown export', () => {
    const run = makeRun({ outcome: 'FAIL', verificationStatus: 'INVALID', failedChecks: ['formatCheck'] });
    const combo = { issuer: run.issuer, wallet: run.wallet, verifier: run.verifier, format: run.format };
    const md = toMarkdown([{ combo, run }], [run]);
    expect(md).toContain('| FAIL | Syntactical |');
    expect(md).toContain('## Failure layers');
    expect(md).toContain('- **Legal**:');
  });
});

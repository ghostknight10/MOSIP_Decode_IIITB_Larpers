import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

/**
 * Interoperability report: runs every supported issuer × wallet × verifier ×
 * format combination (clean), plus every attack against each verifier, through
 * a live BFF, and writes the results as Markdown and JSON.
 *
 *   npm --prefix backend run report:interop -- --out ../docs/interop-report.md --json ../docs/interop-report.json
 *
 * Needs a running BFF (BFF_URL, default http://localhost:4000). With
 * COLLAB_TEST_INDIVIDUAL_ID set on the BFF, Inji Certify issues for real.
 * Outcomes never fail the process: the report is the result. Only an
 * unreachable BFF does.
 */

const BFF_URL = process.env.BFF_URL || 'http://localhost:4000';
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};

type Format = 'w3c-vc' | 'sd-jwt' | 'mso-mdoc';
const NODES = {
  issuer: [
    { id: 'inji-certify', label: 'Inji Certify', formats: ['w3c-vc', 'sd-jwt', 'mso-mdoc'] },
    { id: 'mock-openid4vci', label: 'Mock OpenID4VCI', formats: ['w3c-vc', 'sd-jwt', 'mso-mdoc'] }
  ],
  wallet: [
    { id: 'inji-wallet', label: 'Inji Web / Mobile', formats: ['w3c-vc', 'sd-jwt', 'mso-mdoc'] },
    { id: 'mock-wallet', label: 'Simulated Holder', formats: ['w3c-vc', 'sd-jwt', 'mso-mdoc'] }
  ],
  verifier: [
    // Inji Verify's service accepts no mDoc (G-10), as in the UI's registry.
    { id: 'inji-verify', label: 'Inji Verify', formats: ['w3c-vc', 'sd-jwt'] },
    { id: 'mock-openid4vp', label: 'Mock OpenID4VP', formats: ['w3c-vc', 'sd-jwt', 'mso-mdoc'] }
  ]
} as const;
const FORMAT_LABEL: Record<Format, string> = { 'w3c-vc': 'W3C VC (JSON-LD)', 'sd-jwt': 'SD-JWT VC', 'mso-mdoc': 'mDoc (ISO 18013-5)' };
const ATTACKS = {
  forceExpired: 'Expired credential',
  corruptSignature: 'Corrupted signature',
  wrongCredentialType: 'Wrong credential type',
  replayPresentation: 'Replayed presentation'
} as const;
type Attack = keyof typeof ATTACKS;

interface Run {
  issuer: string;
  wallet: string;
  verifier: string;
  format: Format;
  attack: Attack | null;
  outcome: 'PASS' | 'FAIL';
  status?: string;
  failedChecks: string[];
  layer?: string;
  proofType?: string;
  /** Some answer came from the mock engine standing in for a Collab service. */
  emulated: boolean;
  /** Inji Certify issued a real credential (test identity). */
  realIssuance: boolean;
  liveSteps: number;
  durationMs: number;
  detail?: string;
  transactionId: string;
}

async function call(path: string, body: unknown, transactionId: string) {
  const res = await fetch(`${BFF_URL}/api/playground${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-transaction-id': transactionId, ...(process.env.PLAYGROUND_TOKEN ? { 'x-playground-token': process.env.PLAYGROUND_TOKEN } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000)
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

/** Same rule as the UI (lib/failureLayer.ts). */
const layerOf = (run: Pick<Run, 'outcome' | 'attack' | 'status' | 'failedChecks' | 'detail'>) => {
  if (run.outcome === 'PASS') return undefined;
  if (/^(Issuance|Verification) failed/.test(run.detail ?? '')) return 'Technical';
  if (run.attack && run.status === 'VALID') return 'Technical';
  const f = run.failedChecks;
  if (f.includes('signatureValid') || f.includes('holderBinding')) return 'Technical';
  if (f.includes('formatCheck')) return 'Syntactical';
  if (f.includes('schemaCompliant')) return 'Semantic';
  if (f.includes('notExpired')) return 'Organizational';
  return 'Unclassified';
};

async function runOne(issuer: string, wallet: string, verifier: string, format: Format, attack: Attack | null): Promise<Run> {
  const transactionId = `tx-${randomBytes(4).toString('hex')}`;
  const started = Date.now();
  const base = { issuer, wallet, verifier, format, attack, transactionId };
  let issued: any;
  try {
    issued = await call('/issue', { issuer, wallet, format }, transactionId);
  } catch (err: any) {
    const run = { ...base, outcome: 'FAIL' as const, failedChecks: [], emulated: false, realIssuance: false, liveSteps: 0, durationMs: Date.now() - started, detail: `Issuance failed: ${err.message}` };
    return { ...run, layer: layerOf(run) };
  }
  let verified: any;
  try {
    verified = await call(
      '/verify',
      { verifier, wallet, format, credentialOrToken: issued.issuedCredential, ...(attack ? { tamperPayload: { [attack]: true } } : {}) },
      transactionId
    );
  } catch (err: any) {
    const run = { ...base, outcome: 'FAIL' as const, failedChecks: [], emulated: Boolean(issued.isSandboxFallback), realIssuance: false, liveSteps: 0, durationMs: Date.now() - started, detail: `Verification failed: ${err.message}`, proofType: issued.proofType };
    return { ...run, layer: layerOf(run) };
  }
  const result = verified.verificationResult ?? {};
  const status: string = result.status;
  // PASS: a clean credential is accepted, an attacked one rejected.
  const outcome = attack ? (status !== 'VALID' ? 'PASS' : 'FAIL') : status === 'VALID' ? 'PASS' : 'FAIL';
  const failedChecks = Object.entries(result.checks ?? {}).filter(([, ok]) => ok === false).map(([k]) => k);
  const run = {
    ...base,
    outcome: outcome as Run['outcome'],
    status,
    failedChecks,
    proofType: issued.proofType,
    emulated: Boolean(issued.isSandboxFallback || verified.isSandboxFallback),
    realIssuance: String(issued.notice ?? '').startsWith('Real credential'),
    liveSteps: (verified.protocolLogs ?? []).filter((l: any) => l.live).length,
    durationMs: Date.now() - started,
    detail: outcome === 'PASS' ? undefined : result.details
  };
  return { ...run, layer: layerOf(run) };
}

const label = (role: keyof typeof NODES, id: string) => NODES[role].find(n => n.id === id)?.label ?? id;
const cell = (v: unknown) => String(v ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const row = (cells: unknown[]) => `| ${cells.map(cell).join(' | ')} |`;

async function main() {
  const health = await fetch(`${BFF_URL}/api/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`No BFF at ${BFF_URL}. Start it first (npm run dev:backend).`);
    process.exit(1);
  }
  const components: any = await fetch(`${BFF_URL}/api/playground/components`).then(r => r.json()).catch(() => ({ label: 'unknown' }));

  const runs: Run[] = [];
  const log = (r: Run) => console.log(`${r.outcome} ${r.issuer} → ${r.wallet} → ${r.verifier} · ${r.format}${r.attack ? ` · ${r.attack}` : ''} (${r.status ?? r.detail})`);

  for (const issuer of NODES.issuer)
    for (const wallet of NODES.wallet)
      for (const verifier of NODES.verifier)
        for (const format of verifier.formats as readonly Format[]) {
          if (!issuer.formats.includes(format as never) || !wallet.formats.includes(format as never)) continue;
          const run = await runOne(issuer.id, wallet.id, verifier.id, format, null);
          runs.push(run);
          log(run);
        }

  for (const verifier of NODES.verifier)
    for (const format of verifier.formats as readonly Format[])
      for (const attack of Object.keys(ATTACKS) as Attack[]) {
        const run = await runOne('mock-openid4vci', 'mock-wallet', verifier.id, format, attack);
        runs.push(run);
        log(run);
      }

  const clean = runs.filter(r => !r.attack);
  const negative = runs.filter(r => r.attack);
  const pass = (rs: Run[]) => `${rs.filter(r => r.outcome === 'PASS').length} / ${rs.length}`;
  const date = new Date().toISOString();

  const md = [
    '# Interoperability Report',
    '',
    `Generated ${date} by \`backend/scripts/interop-report.ts\` against a live BFF and the MOSIP Collab sandbox. Regenerate with \`npm run report:interop\` (see [testing.md](./testing.md)).`,
    '',
    `- **Collab component builds:** \`${components.label}\``,
    `- **Real Inji Certify issuance:** ${clean.some(r => r.realIssuance) ? 'yes (Collab test identity configured)' : 'no (credential emulated)'}`,
    `- **Clean runs passed:** ${pass(clean)}. With no emulated step: ${pass(clean.filter(r => !r.emulated))}; where the mock engine stood in for a Collab service: ${pass(clean.filter(r => r.emulated))}.`,
    `- **Attacks correctly rejected:** ${pass(negative)}`,
    '',
    'PASS means the verifier behaved as it should: it accepted a clean credential, or rejected an attacked one. Expected FAILs, explained in [known-issues.md](./known-issues.md):',
    '',
    '- A real Inji Certify credential at the mock verifier: it carries no holder binding, so a strict verifier rejects it (G-12).',
    '- Inji Verify accepting "wrong type" and "replay": its `/vc-verification` checks a credential, not a presentation (G-8).',
    '',
    '## Clean runs (every supported combination)',
    '',
    row(['Issuer', 'Wallet', 'Verifier', 'Format', 'Proof type', 'Verifier status', 'Outcome', 'Layer', 'Live steps', 'Emulated', 'Error detail']),
    row(Array(11).fill('---')),
    ...clean.map(r =>
      row([
        `${label('issuer', r.issuer)}${r.realIssuance ? ' (real)' : ''}`,
        label('wallet', r.wallet),
        label('verifier', r.verifier),
        FORMAT_LABEL[r.format],
        r.proofType,
        r.status,
        r.outcome,
        r.layer,
        r.liveSteps,
        r.emulated ? 'yes' : 'no',
        r.detail
      ])
    ),
    '',
    'Inji Verify × mDoc is not run: Inji Verify\'s service accepts no mDoc (G-10).',
    '',
    '## Attacks (Mock OpenID4VCI → Simulated Holder)',
    '',
    row(['Verifier', 'Format', 'Attack', 'Verifier status', 'Failed checks', 'Outcome', 'Detail']),
    row(Array(7).fill('---')),
    ...negative.map(r =>
      row([label('verifier', r.verifier), FORMAT_LABEL[r.format], ATTACKS[r.attack!], r.status, r.failedChecks.join(', '), r.outcome, r.detail])
    ),
    ''
  ].join('\n');

  const out = arg('--out');
  if (out) writeFileSync(out, md);
  else console.log(`\n${md}`);
  const json = arg('--json');
  if (json) writeFileSync(json, `${JSON.stringify({ generatedAt: date, bff: BFF_URL, components, runs }, null, 2)}\n`);
  console.log(`\nClean ${pass(clean)} · attacks rejected ${pass(negative)}${out ? ` · written to ${out}` : ''}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

import React from 'react';

/**
 * Tiny dependency-free JSON syntax highlighter. Colours are paired with the
 * JSON syntax itself (quotes, colons, literals), so meaning never rests on
 * colour alone.
 */

const TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

export type JsonTokenKind = 'key' | 'string' | 'number' | 'boolean' | 'null';

const CLASS: Record<JsonTokenKind, string> = {
  key: 'text-sky-300',
  string: 'text-emerald-300',
  number: 'text-amber-300',
  boolean: 'text-violet-300',
  null: 'text-slate-400'
};

export const kindOf = (token: string): JsonTokenKind => {
  if (token.startsWith('"')) return /:\s*$/.test(token) ? 'key' : 'string';
  if (token === 'true' || token === 'false') return 'boolean';
  if (token === 'null') return 'null';
  return 'number';
};

export const JsonView: React.FC<{ value: unknown; className?: string }> = ({ value, className = '' }) => {
  const text = JSON.stringify(value, null, 2) ?? 'undefined';
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const kind = kindOf(m[0]);
    out.push(
      <span key={m.index} data-kind={kind} className={CLASS[kind]}>
        {m[0]}
      </span>
    );
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return <pre className={`font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-slate-300 ${className}`}>{out}</pre>;
};

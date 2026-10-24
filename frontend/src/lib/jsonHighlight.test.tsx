import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JsonView, kindOf } from './jsonHighlight';

describe('kindOf', () => {
  it.each([
    ['"name":', 'key'],
    ['"name" :', 'key'],
    ['"value"', 'string'],
    ['42', 'number'],
    ['-1.5e3', 'number'],
    ['true', 'boolean'],
    ['null', 'null']
  ])('%s is a %s', (token, kind) => {
    expect(kindOf(token)).toBe(kind);
  });
});

describe('JsonView', () => {
  it('keeps the exact JSON text', () => {
    const value = { a: 'x', n: 1, ok: true, nothing: null, list: ['y'] };
    const { container } = render(<JsonView value={value} />);
    expect(container.textContent).toBe(JSON.stringify(value, null, 2));
  });

  it('tags each token with its kind', () => {
    const { container } = render(<JsonView value={{ a: 'x', n: 1, ok: false, z: null }} />);
    const kinds = [...container.querySelectorAll('[data-kind]')].map(e => `${e.getAttribute('data-kind')}:${e.textContent}`);
    expect(kinds).toEqual(['key:"a":', 'string:"x"', 'key:"n":', 'number:1', 'key:"ok":', 'boolean:false', 'key:"z":', 'null:null']);
  });

  it('does not treat escaped quotes as string ends', () => {
    const { container } = render(<JsonView value={{ q: 'say "hi"' }} />);
    expect(container.querySelector('[data-kind="string"]')!.textContent).toBe('"say \\"hi\\""');
  });

  it('renders primitives and undefined', () => {
    expect(render(<JsonView value={7} />).container.textContent).toBe('7');
    expect(render(<JsonView value={undefined} />).container.textContent).toBe('undefined');
  });
});

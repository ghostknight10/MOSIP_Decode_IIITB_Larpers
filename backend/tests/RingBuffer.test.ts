import { beforeEach, describe, expect, it } from 'vitest';
import globalAuditBuffer from '../src/utils/RingBuffer.js';

// The module only exports the singleton; build small instances from its class.
const AuditRingBuffer = (globalAuditBuffer as any).constructor;
const frame = (i: number, extra: object = {}) => ({ i, transactionId: 'tx-a', sequenceNo: i, ...extra });

describe('AuditRingBuffer', () => {
  let buf: any;
  beforeEach(() => {
    buf = new AuditRingBuffer(3);
  });

  it('pre-allocates its capacity', () => {
    expect(buf.capacity).toBe(3);
    expect(buf.buffer).toEqual([null, null, null]);
  });

  it('returns frames newest-first', () => {
    [1, 2].forEach(i => buf.add(frame(i)));
    expect(buf.getLogs().map((f: any) => f.i)).toEqual([2, 1]);
    expect(buf.getLatest().map((f: any) => f.i)).toEqual([2, 1]);
  });

  it('respects the limit', () => {
    [1, 2, 3].forEach(i => buf.add(frame(i)));
    expect(buf.getLogs(2).map((f: any) => f.i)).toEqual([3, 2]);
    expect(buf.getLatest(1).map((f: any) => f.i)).toEqual([3]);
  });

  it('evicts the oldest frame once full', () => {
    [1, 2, 3, 4, 5].forEach(i => buf.add(frame(i)));
    // Explicit limit: the default (50) exceeds this buffer's capacity, see the it.fails below.
    expect(buf.getLogs(3).map((f: any) => f.i)).toEqual([5, 4, 3]);
  });

  it('returns an empty list when nothing was logged', () => {
    expect(buf.getLogs()).toEqual([]);
    expect(buf.getByTransactionId('tx-a')).toEqual([]);
  });

  it('filters by transaction id and orders by sequence number', () => {
    buf.add(frame(2));
    buf.add(frame(9, { transactionId: 'tx-b' }));
    buf.add(frame(1));
    expect(buf.getByTransactionId('tx-a').map((f: any) => f.i)).toEqual([1, 2]);
    expect(buf.getByTransactionId('tx-b').map((f: any) => f.i)).toEqual([9]);
  });

  it('clearLogs empties the buffer and resets the write pointer', () => {
    [1, 2].forEach(i => buf.add(frame(i)));
    buf.clearLogs();
    expect(buf.getLogs()).toEqual([]);
    buf.add(frame(7));
    expect(buf.head).toBe(1);
    expect(buf.getLogs().map((f: any) => f.i)).toEqual([7]);
  });

  // Known bug: on a full buffer, a limit above capacity wraps around and
  // returns duplicates ([3, 2, 1, 3, 2]). Flip to `it` once fixed.
  it.fails('never returns a frame twice, even when limit > capacity', () => {
    [1, 2, 3].forEach(i => buf.add(frame(i)));
    expect(buf.getLogs(5).map((f: any) => f.i)).toEqual([3, 2, 1]);
  });

  it('exports a shared 350-frame singleton', () => {
    expect((globalAuditBuffer as any).capacity).toBe(350);
  });
});

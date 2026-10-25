import { EventEmitter } from 'events';

class AuditRingBuffer extends EventEmitter {
  constructor(capacity = 350) {
    super();
    // One 'newFrame' and one 'clear' listener per open SSE client; the default
    // limit of 10 would warn about a leak after ten browser tabs.
    this.setMaxListeners(0);
    this.capacity = capacity;
    // Pre-allocate the array to avoid dynamic allocation overhead
    this.buffer = new Array(capacity).fill(null);
    this.head = 0;
  }

  /**
   * Adds a new frame using FIFO chronological eviction (circular pointer)
   * and emits a 'newFrame' event for active SSE listeners.
   */
  add(frame) {
    this.buffer[this.head] = frame;
    this.head = (this.head + 1) % this.capacity;
    this.emit('newFrame', frame);
  }

  /**
   * Retrieves all frames for a specific transaction, sorted chronologically
   */
  getByTransactionId(txId) {
    return this.buffer
      .filter((frame) => frame !== null && frame.transactionId === txId)
      .sort((a, b) => a.sequenceNo - b.sequenceNo);
  }

  /**
   * Optional: For future SSE stream fetching / legacy compatibility
   */
  getLatest(count = 10) {
    const results = [];
    let idx = (this.head - 1 + this.capacity) % this.capacity;
    let itemsChecked = 0;
    while (results.length < count && this.buffer[idx] !== null && itemsChecked < this.capacity) {
      results.push(this.buffer[idx]);
      idx = (idx - 1 + this.capacity) % this.capacity;
      itemsChecked++;
    }
    return results;
  }

  /**
   * Retrieves the most recent frames (for initial UI load or SSE streams)
   * Prevents infinite wrapping when limit exceeds buffer capacity (B-5 fix).
   */
  getLogs(limit = 50) {
    const results = [];
    let idx = (this.head - 1 + this.capacity) % this.capacity;
    let itemsChecked = 0;
    
    while (results.length < limit && this.buffer[idx] !== null && itemsChecked < this.capacity) {
      results.push(this.buffer[idx]);
      idx = (idx - 1 + this.capacity) % this.capacity;
      itemsChecked++;
    }
    return results;
  }

  /**
   * Wipes the memory cache completely and emits a 'clear' event.
   */
  clearLogs() {
    this.buffer = new Array(this.capacity).fill(null);
    this.head = 0;
    this.emit('clear');
  }
}

// Export a singleton instance for the entire Express app to share
const globalAuditBuffer = new AuditRingBuffer(350);
export default globalAuditBuffer;
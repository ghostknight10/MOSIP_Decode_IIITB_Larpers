class AuditRingBuffer {
  constructor(capacity = 350) {
    this.capacity = capacity;
    // Pre-allocate the array to avoid dynamic allocation overhead
    this.buffer = new Array(capacity).fill(null);
    this.head = 0;
  }

  /**
   * Adds a new frame using FIFO chronological eviction (circular pointer)
   */
  add(frame) {
    this.buffer[this.head] = frame;
    this.head = (this.head + 1) % this.capacity;
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
   * Optional: For future SSE stream fetching
   */
  getLatest(count = 10) {
    // Collects the most recent non-null frames
    const results = [];
    let idx = (this.head - 1 + this.capacity) % this.capacity;
    while (results.length < count && this.buffer[idx] !== null) {
      results.push(this.buffer[idx]);
      idx = (idx - 1 + this.capacity) % this.capacity;
    }
    return results;
  }

  /**
   * Retrieves the most recent frames (for initial UI load or SSE streams)
   */
  getLogs(limit = 50) {
    const results = [];
    let idx = (this.head - 1 + this.capacity) % this.capacity;
    
    while (results.length < limit && this.buffer[idx] !== null) {
      results.push(this.buffer[idx]);
      idx = (idx - 1 + this.capacity) % this.capacity;
    }
    return results;
  }

  /**
   * Wipes the memory cache completely
   */
  clearLogs() {
    this.buffer = new Array(this.capacity).fill(null);
    this.head = 0;
  }
}

// Export a singleton instance for the entire Express app to share
const globalAuditBuffer = new AuditRingBuffer(350);
export default globalAuditBuffer;
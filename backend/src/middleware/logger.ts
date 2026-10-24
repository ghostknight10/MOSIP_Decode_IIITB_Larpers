import { ProtocolLog } from '../types/index.js';

class ProtocolAuditLogger {
  private logs: ProtocolLog[] = [];
  private maxLogs: number = 200;

  public addLog(log: ProtocolLog): void {
    this.logs.unshift(log); // newest first
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
  }

  public getLogs(limit: number = 50): ProtocolLog[] {
    return this.logs.slice(0, limit);
  }

  public clearLogs(): void {
    this.logs = [];
  }

  public getLogsByIds(ids: string[]): ProtocolLog[] {
    return this.logs.filter(log => ids.includes(log.id));
  }
}

export const auditLogger = new ProtocolAuditLogger();

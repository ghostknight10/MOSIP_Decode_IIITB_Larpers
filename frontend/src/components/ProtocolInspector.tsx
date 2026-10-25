import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ProtocolLog } from '../types';
import { AlertTriangle, Copy, Check, Search } from 'lucide-react';
import { JsonView } from '../lib/jsonHighlight';

interface ProtocolInspectorProps {
  logs: ProtocolLog[];
  onClearLogs?: () => void;
}

export const ProtocolInspector: React.FC<ProtocolInspectorProps> = ({ logs, onClearLogs }) => {
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [activeTab, setActiveTab] = useState<'request' | 'response'>('response');
  const [searchQuery, setSearchQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const selectedLog = logs.find((l) => l.id === selectedLogId) || logs[0];

  useEffect(() => {
    // The list is newest-first: bring the new entry into view by scrolling the
    // list itself. scrollIntoView would also scroll the page and every ancestor.
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [logs.length]);

  const handleCopy = (data: any, id: string) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = () => {
    navigator.clipboard.writeText(JSON.stringify(logs, null, 2));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        l.sender.toLowerCase().includes(q) ||
        l.receiver.toLowerCase().includes(q) ||
        l.status.toLowerCase().includes(q) ||
        l.protocol.toLowerCase().includes(q)
    );
  }, [logs, searchQuery]);

  const headers = selectedLog
    ? activeTab === 'response'
      ? selectedLog.response.headers
      : selectedLog.request.headers
    : undefined;
  const hasHeaders = Boolean(headers && Object.keys(headers).length > 0);

  return (
    <div className="bg-surface border border-line rounded-md overflow-hidden flex flex-col h-[480px]">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-line flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">Live Protocol Inspector</h3>
          <span className="text-xs font-mono px-1.5 py-0.5 rounded border border-line bg-surface-muted text-ink-muted">
            {logs.length} Transactions Logged
          </span>
        </div>

        <div className="flex items-center gap-3">
          {logs.length > 0 && (
            <button
              onClick={handleCopyAll}
              className="text-xs text-ink-muted hover:text-accent transition-colors flex items-center gap-1"
              title="Copy all transactions as JSON"
            >
              {copiedAll ? <Check className="h-3 w-3 text-success-ink" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
              <span>{copiedAll ? 'Copied All!' : 'Copy All Logs'}</span>
            </button>
          )}

          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="text-xs text-ink-muted hover:text-danger-ink transition-colors"
            >
              Clear History
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left pane: Log List */}
        <div className="w-full md:w-2/5 border-b md:border-b-0 md:border-r border-line overflow-y-auto flex flex-col">
          {logs.length > 0 && (
            <div className="p-2 border-b border-line bg-surface sticky top-0 z-10">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-subtle" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter actions, routes..."
                  className="w-full bg-surface border border-line-strong rounded pl-8 pr-3 py-1 text-xs text-ink placeholder:text-ink-subtle"
                />
              </div>
            </div>
          )}

          <div ref={listRef} className="flex-1 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="p-4 text-center text-xs text-ink-subtle">
                No protocol traffic logged yet. Trigger an Issuance or Verification flow to capture wire payloads.
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-4 text-center text-xs text-ink-subtle">
                No transactions match &quot;{searchQuery}&quot;.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {filteredLogs.map((log) => {
                  const isSelected = selectedLog?.id === log.id;
                  return (
                    <button
                      key={log.id}
                      onClick={() => setSelectedLogId(log.id)}
                      className={`w-full text-left p-3 transition-colors flex flex-col gap-1 border-l-4 ${
                        isSelected ? 'bg-accent-soft border-l-accent' : 'border-l-transparent hover:bg-surface-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink truncate flex items-center gap-1.5">
                          <span className="text-xs font-mono px-1.5 rounded border border-line bg-surface-muted text-ink-muted">
                            Step {log.step}
                          </span>
                          {log.action}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {log.tampered && (
                            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-warning-soft text-warning-ink border border-warning-line inline-flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Tampered
                            </span>
                          )}
                          <span
                            className={`text-xs font-medium px-1.5 py-0.5 rounded-full border ${
                              log.status === 'SUCCESS'
                                ? 'text-success-ink bg-success-soft border-success-line'
                                : 'text-danger-ink bg-danger-soft border-danger-line'
                            }`}
                          >
                            {log.status}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-ink-muted">
                        <span className="truncate">
                          {log.sender} &rarr; {log.receiver}
                        </span>
                        <span className="font-mono text-xs text-ink-subtle">{log.durationMs}ms</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right pane: Payload Inspector */}
        <div className="flex-1 flex flex-col overflow-hidden bg-surface">
          {selectedLog ? (
            <>
              {/* Payload Tab Controls */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-line bg-surface-muted text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveTab('response')}
                    className={`px-1 py-1.5 border-b-2 transition-colors ${
                      activeTab === 'response' ? 'border-accent text-ink font-medium' : 'border-transparent text-ink-muted hover:text-ink'
                    }`}
                  >
                    Response Body ({selectedLog.response.status})
                  </button>
                  <button
                    onClick={() => setActiveTab('request')}
                    className={`px-1 py-1.5 border-b-2 transition-colors ${
                      activeTab === 'request' ? 'border-accent text-ink font-medium' : 'border-transparent text-ink-muted hover:text-ink'
                    }`}
                  >
                    Request ({selectedLog.request.method} {selectedLog.request.url.slice(0, 24)}...)
                  </button>
                </div>

                <button
                  onClick={() =>
                    handleCopy(
                      activeTab === 'response' ? selectedLog.response.body : selectedLog.request.body,
                      selectedLog.id
                    )
                  }
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-muted hover:bg-surface-muted text-ink-muted font-medium transition-colors"
                >
                  {copiedId === selectedLog.id ? (
                    <>
                      <Check className="h-3 w-3 text-success-ink" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy JSON
                    </>
                  )}
                </button>
              </div>

              {/* HTTP Metadata Pill Strip */}
              <div className="px-3 py-1.5 bg-surface-muted border-b border-line flex flex-wrap items-center gap-2 text-xs font-mono">
                <span
                  className="px-1.5 py-0.5 rounded border border-line-strong bg-surface text-ink font-medium"
                >
                  {selectedLog.request.method}
                </span>
                <span className="text-ink-muted truncate max-w-[200px] md:max-w-[280px]" title={selectedLog.request.url}>
                  {selectedLog.request.url}
                </span>
                <span className="text-ink-subtle">·</span>
                <span className="text-ink-muted">
                  Status:{' '}
                  <span
                    className={selectedLog.response.status < 400 ? 'text-success-ink font-medium' : 'text-danger-ink font-medium'}
                  >
                    {selectedLog.response.status}
                  </span>
                </span>
                <span className="text-ink-subtle">·</span>
                <span className="text-ink-muted">
                  Duration: <span className="text-ink font-medium">{selectedLog.durationMs} ms</span>
                </span>
                <span className="text-ink-subtle">·</span>
                <span className="text-ink-muted">
                  Protocol: <span className="text-ink font-medium">{selectedLog.protocol}</span>
                </span>
              </div>

              {/* HTTP Headers Section */}
              {hasHeaders && (
                <details className="border-b border-line bg-surface text-xs group" open={true}>
                  <summary className="px-3 py-1 text-ink-muted hover:text-ink text-xs font-medium flex items-center justify-between select-none">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-ink-muted">
                        {activeTab === 'response' ? 'Response Headers' : 'Request Headers'}
                      </span>
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-surface-muted text-ink-muted">
                        {Object.keys(headers!).length}
                      </span>
                    </span>
                    <span className="text-xs text-accent group-open:hidden">Show</span>
                    <span className="text-xs text-ink-subtle hidden group-open:inline">Hide</span>
                  </summary>
                  <div className="px-3 py-1.5 border-t border-line bg-surface font-mono text-xs space-y-1 max-h-24 overflow-y-auto">
                    {Object.entries(headers!).map(([key, val]) => (
                      <div key={key} className="flex items-baseline gap-2">
                        <span className="text-accent">{key}:</span>
                        <span className="text-ink-muted break-all">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Raw JSON Code Block with Syntax Highlighting using JsonView */}
              <div className="flex-1 p-3 overflow-auto font-mono text-xs leading-relaxed ">
                <JsonView
                  value={activeTab === 'response' ? selectedLog.response.body : selectedLog.request}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-4 text-center text-xs text-ink-subtle">
              Select a transaction on the left to inspect HTTP headers and payloads.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

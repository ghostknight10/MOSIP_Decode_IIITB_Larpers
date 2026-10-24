import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ProtocolLog } from '../types';
import { Terminal, Copy, Check, Search } from 'lucide-react';
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
  const listEndRef = useRef<HTMLDivElement>(null);

  const selectedLog = logs.find((l) => l.id === selectedLogId) || logs[0];

  useEffect(() => {
    if (logs.length > 0 && typeof listEndRef.current?.scrollIntoView === 'function') {
      listEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[480px]">
      {/* Header */}
      <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-sky-400" />
          <h3 className="text-sm font-bold text-white">Live Protocol Inspector</h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            {logs.length} Transactions Logged
          </span>
        </div>

        <div className="flex items-center gap-3">
          {logs.length > 0 && (
            <button
              onClick={handleCopyAll}
              className="text-xs text-slate-400 hover:text-sky-300 transition-colors font-medium flex items-center gap-1 cursor-pointer"
              title="Copy all transactions as JSON"
            >
              {copiedAll ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copiedAll ? 'Copied All!' : 'Copy All Logs'}</span>
            </button>
          )}

          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="text-xs text-slate-400 hover:text-rose-400 transition-colors font-medium cursor-pointer"
            >
              Clear History
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left pane: Log List */}
        <div className="w-full md:w-2/5 border-b md:border-b-0 md:border-r border-slate-800 overflow-y-auto flex flex-col">
          {logs.length > 0 && (
            <div className="p-2 border-b border-slate-800/80 bg-slate-950/40 sticky top-0 z-10">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter actions, routes..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/60"
                />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No protocol traffic logged yet. Trigger an Issuance or Verification flow to capture wire payloads.
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No transactions match &quot;{searchQuery}&quot;.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {filteredLogs.map((log) => {
                  const isSelected = selectedLog?.id === log.id;
                  return (
                    <button
                      key={log.id}
                      onClick={() => setSelectedLogId(log.id)}
                      className={`w-full text-left p-3 transition-all flex flex-col gap-1 cursor-pointer ${
                        isSelected
                          ? 'bg-sky-500/10 border-l-4 border-l-sky-500'
                          : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-sm bg-slate-800 text-sky-300 font-bold">
                            Step {log.step}
                          </span>
                          {log.action}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {log.tampered && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-rose-500/20 text-rose-300 animate-pulse border border-rose-500/30">
                              ⚠ TAMPERED
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${
                              log.status === 'SUCCESS'
                                ? 'text-emerald-400 bg-emerald-500/10'
                                : 'text-rose-400 bg-rose-500/10'
                            }`}
                          >
                            {log.status}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="truncate">
                          {log.sender} &rarr; {log.receiver}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500">{log.durationMs}ms</span>
                      </div>
                    </button>
                  );
                })}
                <div ref={listEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Right pane: Payload Inspector */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          {selectedLog ? (
            <>
              {/* Payload Tab Controls */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/80 bg-slate-900/60 text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveTab('response')}
                    className={`px-2.5 py-1 rounded-sm font-medium transition-all cursor-pointer ${
                      activeTab === 'response'
                        ? 'bg-sky-500 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Response Body ({selectedLog.response.status})
                  </button>
                  <button
                    onClick={() => setActiveTab('request')}
                    className={`px-2.5 py-1 rounded-sm font-medium transition-all cursor-pointer ${
                      activeTab === 'request'
                        ? 'bg-sky-500 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
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
                  className="flex items-center gap-1 px-2.5 py-1 rounded-sm bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all cursor-pointer"
                >
                  {copiedId === selectedLog.id ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
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
              <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800/60 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                <span
                  className={`px-2 py-0.5 rounded font-bold uppercase ${
                    selectedLog.request.method === 'GET'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      : selectedLog.request.method === 'POST'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {selectedLog.request.method}
                </span>
                <span className="text-slate-300 truncate max-w-[200px] md:max-w-[280px]" title={selectedLog.request.url}>
                  {selectedLog.request.url}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">
                  Status:{' '}
                  <span
                    className={
                      selectedLog.response.status < 400
                        ? 'text-emerald-400 font-semibold'
                        : 'text-rose-400 font-semibold'
                    }
                  >
                    {selectedLog.response.status}
                  </span>
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">
                  Duration: <span className="text-amber-300 font-semibold">{selectedLog.durationMs} ms</span>
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">
                  Protocol: <span className="text-sky-400 font-semibold">{selectedLog.protocol}</span>
                </span>
              </div>

              {/* HTTP Headers Section */}
              {hasHeaders && (
                <details className="border-b border-slate-800/60 bg-slate-950/70 text-xs group" open={true}>
                  <summary className="px-3 py-1 cursor-pointer text-slate-400 hover:text-slate-200 text-[11px] font-medium flex items-center justify-between select-none">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                        {activeTab === 'response' ? 'Response Headers' : 'Request Headers'}
                      </span>
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                        {Object.keys(headers!).length}
                      </span>
                    </span>
                    <span className="text-[10px] text-sky-400 group-open:hidden">Show</span>
                    <span className="text-[10px] text-slate-500 hidden group-open:inline">Hide</span>
                  </summary>
                  <div className="px-3 py-1.5 border-t border-slate-800/40 bg-slate-950 font-mono text-[11px] space-y-1 max-h-24 overflow-y-auto">
                    {Object.entries(headers!).map(([key, val]) => (
                      <div key={key} className="flex items-baseline gap-2">
                        <span className="text-sky-300 font-semibold">{key}:</span>
                        <span className="text-slate-300 break-all">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Raw JSON Code Block with Syntax Highlighting using JsonView */}
              <div className="flex-1 p-3 overflow-auto font-mono text-xs leading-relaxed selection:bg-sky-500 selection:text-white">
                <JsonView
                  value={activeTab === 'response' ? selectedLog.response.body : selectedLog.request}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-4 text-center text-xs text-slate-600">
              Select a transaction on the left to inspect HTTP headers and payloads.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

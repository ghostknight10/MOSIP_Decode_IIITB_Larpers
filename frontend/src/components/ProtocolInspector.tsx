import React, { useState } from 'react';
import { ProtocolLog } from '../types';
import { Terminal, Copy, Check, ChevronDown, ChevronRight, Filter } from 'lucide-react';

interface ProtocolInspectorProps {
  logs: ProtocolLog[];
  onClearLogs?: () => void;
}

export const ProtocolInspector: React.FC<ProtocolInspectorProps> = ({ logs, onClearLogs }) => {
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'request' | 'response'>('response');

  const selectedLog = logs.find(l => l.id === selectedLogId) || logs[0];

  const handleCopy = (data: any, id: string) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[520px]">
      {/* Header */}
      <div className="bg-slate-950 px-5 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-sky-400" />
          <h3 className="text-sm font-bold text-white">Live Protocol Inspector</h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            {logs.length} Transactions Logged
          </span>
        </div>

        {onClearLogs && (
          <button
            onClick={onClearLogs}
            className="text-xs text-slate-400 hover:text-rose-400 transition-colors font-medium"
          >
            Clear History
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left pane: Log List */}
        <div className="w-full md:w-2/5 border-b md:border-b-0 md:border-r border-slate-800 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No protocol traffic logged yet. Trigger an Issuance or Verification flow to capture wire payloads.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {logs.map((log) => {
                const isSelected = selectedLog?.id === log.id;
                return (
                  <button
                    key={log.id}
                    onClick={() => setSelectedLogId(log.id)}
                    className={`w-full text-left p-3.5 transition-all flex flex-col gap-1.5 ${
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
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${
                        log.status === 'SUCCESS' ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                      }`}>
                        {log.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="truncate">{log.sender} &rarr; {log.receiver}</span>
                      <span className="font-mono text-[10px] text-slate-500">{log.durationMs}ms</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right pane: Payload Inspector */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          {selectedLog ? (
            <>
              {/* Payload Tab Controls */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-slate-900/60 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('response')}
                    className={`px-2.5 py-1 rounded-sm font-medium transition-all ${
                      activeTab === 'response' ? 'bg-sky-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Response Body ({selectedLog.response.status})
                  </button>
                  <button
                    onClick={() => setActiveTab('request')}
                    className={`px-2.5 py-1 rounded-sm font-medium transition-all ${
                      activeTab === 'request' ? 'bg-sky-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
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
                  className="flex items-center gap-1 px-2.5 py-1 rounded-sm bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all"
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

              {/* Raw JSON Code Block */}
              <div className="flex-1 p-4 overflow-auto font-mono text-xs leading-relaxed text-sky-200/90 selection:bg-sky-500 selection:text-white">
                <pre className="whitespace-pre">
                  {JSON.stringify(
                    activeTab === 'response' ? selectedLog.response.body : selectedLog.request,
                    null,
                    2
                  )}
                </pre>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-600">
              Select a transaction on the left to inspect HTTP headers and payloads.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

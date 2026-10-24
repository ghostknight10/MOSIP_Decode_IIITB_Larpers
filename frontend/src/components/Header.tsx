import React from 'react';
import { ShieldCheck, Activity, Layers, Server } from 'lucide-react';

interface HeaderProps {
  serverConnected: boolean;
  activeTab: 'playground' | 'matrix';
  setActiveTab: (tab: 'playground' | 'matrix') => void;
}

export const Header: React.FC<HeaderProps> = ({ serverConnected, activeTab, setActiveTab }) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">MOSIP VC Interoperability Playground</h1>
              <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                Topic 02
              </span>
            </div>
            <p className="text-xs text-slate-400">OpenID4VCI & OpenID4VP Cross-Ecosystem Testbed</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-sm">
          <button
            onClick={() => setActiveTab('playground')}
            className={`px-4 py-1.5 rounded-md font-medium transition-all flex items-center gap-2 ${
              activeTab === 'playground'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="h-4 w-4" />
            Playground & Inspector
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-4 py-1.5 rounded-md font-medium transition-all flex items-center gap-2 ${
              activeTab === 'matrix'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-4 w-4" />
            Interop Matrix Report
          </button>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-xs">
            <Server className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-300">BFF Proxy:</span>
            <span className={`inline-flex items-center gap-1 font-semibold ${serverConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`h-2 w-2 rounded-full ${serverConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {serverConnected ? 'Online (Collab/Mock)' : 'Connecting...'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

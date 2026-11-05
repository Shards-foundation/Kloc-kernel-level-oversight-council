import React from 'react';
import { KlocResponse, FinalState } from '../types';
import { SeatCard } from './SeatCard';
import { councilPresentation } from '../services/council-presentation.mjs';
import { AlertOctagon, CheckCircle, PauseCircle, ShieldBan, Terminal } from 'lucide-react';

interface KlocResultsProps {
  response: KlocResponse;
  onReset: () => void;
}

const getFinalStateDetails = (state: FinalState) => {
  switch (state) {
    case 'PROCEED':
      return {
        color: 'text-emerald-400',
        bg: 'bg-emerald-950/30 border-emerald-500/50',
        icon: <CheckCircle className="w-12 h-12" />,
        text: 'PROPOSAL CLEARED'
      };
    case 'DEFER':
      return {
        color: 'text-amber-400',
        bg: 'bg-amber-950/30 border-amber-500/50',
        icon: <PauseCircle className="w-12 h-12" />,
        text: 'DEFER / REVISE'
      };
    case 'BLOCK':
      return {
        color: 'text-red-500',
        bg: 'bg-red-950/30 border-red-500/50',
        icon: <ShieldBan className="w-12 h-12" />,
        text: 'HARD BLOCK'
      };
    case 'MANUAL_REVIEW':
      return {
        color: 'text-purple-400',
        bg: 'bg-purple-950/30 border-purple-500/50',
        icon: <AlertOctagon className="w-12 h-12" />,
        text: 'HUMAN INTERVENTION REQ.'
      };
  }
};

export const KlocResults: React.FC<KlocResultsProps> = ({ response, onReset }) => {
  const status = getFinalStateDetails(response.kernel_resolution.final_state);
  const presentation = councilPresentation(response);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Header Summary */}
      <div className={`p-8 rounded-xl border-2 flex flex-col md:flex-row items-center justify-between gap-6 ${status.bg}`}>
        <div className="flex items-center gap-6">
          <div className={`${status.color}`}>
            {status.icon}
          </div>
          <div>
            <div className="text-xs font-mono uppercase opacity-70 mb-1">KERNEL RESOLUTION</div>
            <h1 className={`text-4xl font-black font-mono tracking-tighter ${status.color}`}>
              {status.text}
            </h1>
            <p className="mt-2 text-sm opacity-80 font-mono">
                {response.proposal_summary_1line}
            </p>
          </div>
        </div>
        
        <div className="text-right space-y-2 font-mono text-xs opacity-70">
           <div className="p-2 bg-black/40 rounded border border-white/10">
                <div className="text-[10px] uppercase text-zinc-500 mb-1">Rule Trace</div>
                {response.kernel_resolution.rule_trace.map((rule, i) => (
                    <div key={i} className="text-zinc-300">{rule}</div>
                ))}
           </div>
        </div>
      </div>

      <div className={`rounded-lg border p-4 text-xs font-mono ${presentation.degraded
        ? 'border-amber-500/40 bg-amber-950/20 text-amber-200'
        : 'border-blue-500/20 bg-zinc-900/60 text-zinc-400'}`}>
        {presentation.label}
        {presentation.replacements.map(item => (
          <div key={item.seat} className="mt-2 text-zinc-300">{item.label}</div>
        ))}
      </div>

      {/* Seats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {response.seats.map((seat, idx) => (
          <SeatCard key={seat.seat} seatData={seat} reviewer={response.reviewers.find(r => r.seat === seat.seat)} />
        ))}
      </div>

      {/* Deep Dive & Resolution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Blocking/Defer Items */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
           <h3 className="text-sm font-bold font-mono text-zinc-400 uppercase mb-4 flex items-center gap-2">
             <Terminal className="w-4 h-4" /> Kernel Logs
           </h3>
           <div className="space-y-4">
              {response.kernel_resolution.blocking_items.length > 0 && (
                <div>
                   <span className="text-red-400 text-xs font-bold uppercase block mb-2">Blocking Items</span>
                   <ul className="space-y-2">
                      {response.kernel_resolution.blocking_items.map((item, i) => (
                        <li key={i} className="p-2 bg-red-950/20 border-l-2 border-red-500 text-sm text-zinc-300">
                          {item}
                        </li>
                      ))}
                   </ul>
                </div>
              )}
              {response.kernel_resolution.defer_items.length > 0 && (
                <div>
                   <span className="text-amber-400 text-xs font-bold uppercase block mb-2">Defer Items</span>
                   <ul className="space-y-2">
                      {response.kernel_resolution.defer_items.map((item, i) => (
                        <li key={i} className="p-2 bg-amber-950/20 border-l-2 border-amber-500 text-sm text-zinc-300">
                          {item}
                        </li>
                      ))}
                   </ul>
                </div>
              )}
              {response.kernel_resolution.blocking_items.length === 0 && response.kernel_resolution.defer_items.length === 0 && (
                  <div className="p-4 text-center text-zinc-500 text-sm italic">
                    No active blocks or deferrals found.
                  </div>
              )}
           </div>
        </div>

        {/* Operator Notes & Actions */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col">
            <h3 className="text-sm font-bold font-mono text-zinc-400 uppercase mb-4">
                Operator Directives
            </h3>
            
            <div className="flex-1 space-y-6">
                <div>
                    <span className="text-blue-400 text-xs font-bold uppercase block mb-1">Recommended Next Action</span>
                    <p className="text-lg text-white font-medium">
                        {response.operator_notes.recommended_next_action}
                    </p>
                </div>

                <div>
                    <span className="text-zinc-500 text-xs font-bold uppercase block mb-1">Override Policy</span>
                    <p className="text-sm text-zinc-400 leading-relaxed border-l-2 border-zinc-700 pl-3">
                        {response.operator_notes.override_policy}
                    </p>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-zinc-800">
                <button 
                    onClick={onReset}
                    className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded font-mono text-sm uppercase tracking-wide transition-colors"
                >
                    Initialize New Packet
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
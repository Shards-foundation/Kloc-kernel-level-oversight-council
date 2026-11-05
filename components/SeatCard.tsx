import React from 'react';
import { SeatResult, Verdict, ReviewerTrace } from '../types';
import { Shield, Activity, DollarSign, UserMinus, Globe, AlertTriangle, CheckCircle, XCircle, AlertOctagon } from 'lucide-react';

interface SeatCardProps {
  seatData: SeatResult;
  reviewer?: ReviewerTrace;
}

const getVerdictColor = (verdict: Verdict) => {
  switch (verdict) {
    case 'NO_OBJECTION': return 'border-emerald-500/50 bg-emerald-950/20 text-emerald-400';
    case 'SOFT_REJECT': return 'border-amber-500/50 bg-amber-950/20 text-amber-400';
    case 'HARD_REJECT': return 'border-red-500/50 bg-red-950/20 text-red-400';
    case 'ESCALATE': return 'border-purple-500/50 bg-purple-950/20 text-purple-400';
    default: return 'border-zinc-700 bg-zinc-900 text-zinc-400';
  }
};

const getVerdictIcon = (verdict: Verdict) => {
  switch (verdict) {
    case 'NO_OBJECTION': return <CheckCircle className="w-5 h-5" />;
    case 'SOFT_REJECT': return <AlertTriangle className="w-5 h-5" />;
    case 'HARD_REJECT': return <XCircle className="w-5 h-5" />;
    case 'ESCALATE': return <AlertOctagon className="w-5 h-5" />;
  }
};

const getSeatIcon = (seat: string) => {
  switch (seat) {
    case 'SECURITY': return <Shield className="w-5 h-5" />;
    case 'SYSTEMS_INTEGRITY': return <Activity className="w-5 h-5" />;
    case 'ECONOMIC_RISK': return <DollarSign className="w-5 h-5" />;
    case 'FOUNDER_ADVERSARY': return <UserMinus className="w-5 h-5" />;
    case 'EXTERNAL_REALITY': return <Globe className="w-5 h-5" />;
    default: return <Shield className="w-5 h-5" />;
  }
};

export const SeatCard: React.FC<SeatCardProps> = ({ seatData, reviewer }) => {
  const colorClass = getVerdictColor(seatData.verdict);

  return (
    <div className={`p-4 border rounded-lg flex flex-col gap-4 ${colorClass} transition-all duration-300 hover:shadow-lg hover:shadow-${colorClass.split(' ')[0].replace('border-', '')}/20`}>
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          {getSeatIcon(seatData.seat)}
          <h3 className="font-bold text-sm tracking-wider">{seatData.seat.replace('_', ' ')}</h3>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase">
          {getVerdictIcon(seatData.verdict)}
          <span>{seatData.verdict}</span>
        </div>
      </div>

      {reviewer && (
        <div className="rounded border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-zinc-300">
          <div className="uppercase tracking-wide text-zinc-500 mb-1">Independent reviewer</div>
          <div className="font-semibold break-all">{reviewer.provider.toUpperCase()} · {reviewer.model}</div>
          <div className="mt-1 text-zinc-500">
            {Math.round(reviewer.latency_ms)}ms
            {reviewer.input_tokens !== undefined && ` · ${reviewer.input_tokens} input tokens`}
            {reviewer.output_tokens !== undefined && ` · ${reviewer.output_tokens} output tokens`}
          </div>
        </div>
      )}

      <div className="flex justify-between text-xs font-mono opacity-80">
        <span>RISK: {seatData.risk_score}/10</span>
        <span>CONF: {(seatData.confidence * 100).toFixed(0)}%</span>
      </div>

      {seatData.hard_reject_triggers.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-bold text-red-400 uppercase tracking-wide">Hard Triggers</span>
          <ul className="list-disc list-inside text-xs space-y-1 opacity-90">
            {seatData.hard_reject_triggers.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {seatData.soft_reject_flags.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">Soft Flags</span>
          <ul className="list-disc list-inside text-xs space-y-1 opacity-90">
            {seatData.soft_reject_flags.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {(seatData.unknowns.length > 0 || seatData.required_mitigations.length > 0) && (
        <div className="mt-auto pt-3 border-t border-white/10 text-xs space-y-2">
            {seatData.unknowns.length > 0 && (
                <div>
                    <span className="text-purple-400 font-bold block mb-1">UNKNOWNS:</span>
                    <p className="opacity-80">{seatData.unknowns.join(', ')}</p>
                </div>
            )}
            {seatData.required_mitigations.length > 0 && (
                <div>
                     <span className="text-blue-400 font-bold block mb-1">MITIGATION:</span>
                     <p className="opacity-80">{seatData.required_mitigations[0]}</p>
                </div>
            )}
        </div>
      )}
    </div>
  );
};
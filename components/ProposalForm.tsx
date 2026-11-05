import React, { ChangeEvent } from 'react';
import { ProposalData } from '../types';
import { Terminal, Cpu, ShieldAlert, FileJson, Play, Gavel } from 'lucide-react';

interface ProposalFormProps {
  data: ProposalData;
  onChange: (key: keyof ProposalData, value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export const ProposalForm: React.FC<ProposalFormProps> = ({ data, onChange, onSubmit, isLoading }) => {
  const handleChange = (field: keyof ProposalData) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(field, e.target.value);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 opacity-50"></div>
      
      <div className="flex items-center gap-3 mb-6 text-zinc-100">
        <Terminal className="w-6 h-6 text-blue-400" />
        <h2 className="text-xl font-bold font-mono tracking-tight">PROPOSAL_PACKET</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="col-span-1 md:col-span-2 space-y-2">
           <label className="text-xs font-mono text-zinc-500 uppercase">Title</label>
           <input
             type="text"
             value={data.title}
             onChange={handleChange('title')}
             placeholder="Operation: Deep Sky"
             className="w-full bg-black/50 border border-zinc-700 rounded p-3 text-sm focus:border-blue-500 focus:outline-none transition-colors text-zinc-200"
           />
        </div>

        <div className="space-y-2">
           <label className="text-xs font-mono text-zinc-500 uppercase">Context (What + Why)</label>
           <textarea
             rows={4}
             value={data.context}
             onChange={handleChange('context')}
             placeholder="We are building an autonomous agent to..."
             className="w-full bg-black/50 border border-zinc-700 rounded p-3 text-sm focus:border-blue-500 focus:outline-none transition-colors text-zinc-200 resize-none"
           />
        </div>

        <div className="space-y-2">
           <label className="text-xs font-mono text-zinc-500 uppercase">Scope (Can / Cannot Do)</label>
           <textarea
             rows={4}
             value={data.scope}
             onChange={handleChange('scope')}
             placeholder="Can access read-only DB. Cannot execute transactions."
             className="w-full bg-black/50 border border-zinc-700 rounded p-3 text-sm focus:border-blue-500 focus:outline-none transition-colors text-zinc-200 resize-none"
           />
        </div>

        <div className="space-y-2">
           <label className="text-xs font-mono text-zinc-500 uppercase flex items-center gap-2">
              <ShieldAlert className="w-3 h-3 text-red-400" /> Assets At Risk
           </label>
           <input
             type="text"
             value={data.assets_at_risk}
             onChange={handleChange('assets_at_risk')}
             placeholder="Customer PII, AWS Root Keys, Reputation"
             className="w-full bg-black/50 border border-zinc-700 rounded p-3 text-sm focus:border-red-500/50 focus:outline-none transition-colors text-zinc-200"
           />
        </div>

        <div className="space-y-2">
           <label className="text-xs font-mono text-zinc-500 uppercase flex items-center gap-2">
              <Cpu className="w-3 h-3 text-purple-400" /> Execution Boundary
           </label>
           <input
             type="text"
             value={data.execution_boundary}
             onChange={handleChange('execution_boundary')}
             placeholder="Human must approve all withdrawals > $50"
             className="w-full bg-black/50 border border-zinc-700 rounded p-3 text-sm focus:border-purple-500/50 focus:outline-none transition-colors text-zinc-200"
           />
        </div>

        {/* Collapsed secondary fields for layout balance, but fully functional */}
        <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase">Tools & Integrations</label>
                <input
                    type="text"
                    value={data.tools_and_integrations}
                    onChange={handleChange('tools_and_integrations')}
                    placeholder="Slack API, OpenAI GPT-4, Internal SQL"
                    className="w-full bg-black/50 border border-zinc-700 rounded p-3 text-sm focus:border-blue-500 focus:outline-none text-zinc-200"
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase">Data Sources</label>
                <input
                    type="text"
                    value={data.data_sources}
                    onChange={handleChange('data_sources')}
                    placeholder="Public Internet, Internal Wiki"
                    className="w-full bg-black/50 border border-zinc-700 rounded p-3 text-sm focus:border-blue-500 focus:outline-none text-zinc-200"
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase">Success Criteria</label>
                <input
                    type="text"
                    value={data.success_criteria}
                    onChange={handleChange('success_criteria')}
                    placeholder="Latency < 200ms, Accuracy > 95%"
                    className="w-full bg-black/50 border border-zinc-700 rounded p-3 text-sm focus:border-blue-500 focus:outline-none text-zinc-200"
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase">Known Unknowns</label>
                <input
                    type="text"
                    value={data.unknowns_you_already_know}
                    onChange={handleChange('unknowns_you_already_know')}
                    placeholder="Exact API rate limits, user adoption rate"
                    className="w-full bg-black/50 border border-zinc-700 rounded p-3 text-sm focus:border-blue-500 focus:outline-none text-zinc-200"
                />
            </div>
        </div>

      </div>

      <div className="mt-8 rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-zinc-300">
        <strong className="text-amber-300">Five-provider disclosure:</strong> Submitting sends this proposal independently
        to Anthropic, OpenAI, Google, xAI and Mistral. Each provider may charge for tokens and handle data according
        to its own terms. Do not submit private keys, passwords, personal information or confidential data without
        appropriate authorisation. KLOC never gives its reviewers execution authority.
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={onSubmit}
          disabled={isLoading}
          className={`
            group relative px-6 py-3 font-mono font-bold uppercase tracking-wider overflow-hidden rounded
            ${isLoading ? 'bg-zinc-800 cursor-not-allowed text-zinc-500' : 'bg-white text-black hover:bg-zinc-200 hover:text-red-600'}
            transition-all duration-200
          `}
        >
          <span className="flex items-center gap-2">
            {isLoading ? (
                <>PROCESSING...</>
            ) : (
                <>
                    ATTEMPT TO DISPROVE PROPOSAL <Gavel className="w-4 h-4 fill-current" />
                </>
            )}
          </span>
        </button>
      </div>
    </div>
  );
};
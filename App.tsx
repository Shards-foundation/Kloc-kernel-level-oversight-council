import React, { useState } from 'react';
import { DEFAULT_PROPOSAL, ProposalData, KlocResponse } from './types';
import { runKlocAnalysis } from './services/council';
import { ProposalForm } from './components/ProposalForm';
import { KlocResults } from './components/KlocResults';
import { Box } from 'lucide-react';

const App: React.FC = () => {
  const [proposal, setProposal] = useState<ProposalData>(DEFAULT_PROPOSAL);
  const [result, setResult] = useState<KlocResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleProposalChange = (key: keyof ProposalData, value: string) => {
    setProposal(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    // Basic validation
    if (!proposal.context || !proposal.title) {
        setError("Context and Title are required to run the simulation.");
        return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const klocResponse = await runKlocAnalysis(proposal);
      setResult(klocResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed; no decision issued.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-200 selection:bg-blue-500/30">
        
        {/* Navigation / Header */}
        <header className="border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white text-black flex items-center justify-center rounded font-bold">
                        <Box size={20} strokeWidth={3} />
                    </div>
                    <div>
                        <h1 className="font-mono font-bold tracking-tight text-white leading-none">KLOC v1.2</h1>
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Kernel-Level Oversight Council</span>
                    </div>
                </div>
                <div className="text-xs font-mono text-zinc-600 hidden sm:block">
                    MODE: <span className="text-emerald-500">LOCAL REVIEW</span>
                </div>
            </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-12">
            
            <div className="max-w-4xl mx-auto">
                {/* Intro Text (only if no result) */}
                {!result && (
                    <div className="mb-10 text-center space-y-4">
                        <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white">
                            Forced Disagreement Engine
                        </h2>
                        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                            Simulate a council of 5 independent adversarial agents to stress-test your proposal before you build it.
                        </p>
                    </div>
                )}

                {/* Error Banner */}
                {error && (
                    <div className="mb-6 p-4 bg-red-950/30 border border-red-500/50 rounded flex items-center justify-center text-red-400 font-mono text-sm">
                        [ERROR] {error}
                    </div>
                )}

                {/* Main Content Switcher */}
                {!result ? (
                    <div className="transition-opacity duration-300">
                        <ProposalForm 
                            data={proposal} 
                            onChange={handleProposalChange}
                            onSubmit={handleSubmit}
                            isLoading={isLoading}
                        />
                    </div>
                ) : (
                    <KlocResults 
                        response={result} 
                        onReset={handleReset} 
                    />
                )}
            </div>
        </main>

        <footer className="border-t border-white/5 py-8 mt-12 text-center text-zinc-600 text-xs font-mono">
            SHARDS LABS // INTERNAL USE ONLY // NO EXECUTION AUTHORITY
        </footer>
    </div>
  );
};

export default App;
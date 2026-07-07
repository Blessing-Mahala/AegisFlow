import { useState, useEffect, useRef, useCallback } from 'react';
import { Cpu, Radio, Terminal, Shield, Zap, Skull, CheckCircle, Lock, Play } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface LogEntry {
  id: number;
  agent: 1 | 2 | 3;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
}

type AgentPhase = 'idle' | 'scanning' | 'analyzing' | 'complete';
type DeployPhase = 'idle' | 'deploying' | 'success';

/* ------------------------------------------------------------------ */
/*  Scripted conversation lines (each with an optional delay override) */
/* ------------------------------------------------------------------ */

interface ScriptLine {
  agent: 1 | 2 | 3;
  message: string;
  type: LogEntry['type'];
  delay?: number; // ms before next line (default 800)
}

const SCRIPT: ScriptLine[] = [
  /* ---- Phase 1: Asset Discovery ---- */
  { agent: 1, message: 'Initializing network sweep on 10.0.0.0/24 — ARP + ICMP + mDNS probes...', type: 'info' },
  { agent: 1, message: 'Probe response: 47 hosts alive. Enumerating OUI fingerprints...', type: 'info' },
  { agent: 1, message: 'Anomaly detected — wlan0 interface (10.0.0.47) — TTL mismatch (expected 64, got 128)', type: 'warning' },
  { agent: 1, message: 'Device fingerprint: "Cisco Meraki MX64" | Actual OUI: Unknown vendor', type: 'warning' },
  { agent: 1, message: 'Validation score: 23/100 — device FAILED legitimacy check', type: 'error', delay: 1200 },
  { agent: 1, message: 'Suspicious traffic pattern: 10.0.0.47 → 10.0.1.0/24 on ports 443, 8443, 5000', type: 'info' },
  { agent: 1, message: 'Asset discovery complete. Handing off to Threat Analysis.', type: 'success', delay: 1000 },

  /* ---- Phase 2: Threat Analysis ---- */
  { agent: 2, message: 'Receiving suspect node asset bundle from Agent 1...', type: 'info', delay: 600 },
  { agent: 2, message: 'Extracting 1,247 packets from 10.0.0.47 — running entropy analysis...', type: 'info' },
  { agent: 2, message: 'Entropy score: 0.89 — consistent with encrypted C2 beacon traffic', type: 'warning' },
  { agent: 2, message: 'Cross-referencing payload signatures against CVE repository...', type: 'info' },
  { agent: 2, message: 'MATCH: CVE-2024-21762 — Cisco ASA SSL VPN volumetric flood pattern', type: 'error', delay: 1500 },
  { agent: 2, message: 'Lateral movement detected: 10.0.0.47 → 10.0.1.12 (database segment)', type: 'error' },
  { agent: 2, message: 'Threat score: 87/100 — CRITICAL. Persistent backdoor channel probable.', type: 'error', delay: 1000 },
  { agent: 2, message: 'Recommended action: immediate ACL block on 10.0.0.47 + port 443 quarantine.', type: 'info' },
  { agent: 2, message: 'Threat analysis complete. Sending mitigation plan to Orchestration.', type: 'success', delay: 800 },

  /* ---- Phase 3: Orchestration ---- */
  { agent: 3, message: 'Ingesting threat matrix from Agent 2 — 3 rule sets requested.', type: 'info', delay: 600 },
  { agent: 3, message: 'Synthesizing iptables chain: FORWARD — DROP src=10.0.0.47 dst=10.0.1.0/24', type: 'info' },
  { agent: 3, message: 'Synthesizing iptables chain: INPUT — RATE-LIMIT 10.0.0.0/24 100pps burst 200', type: 'info' },
  { agent: 3, message: 'Generating Cisco-iOS ACL template: deny ip host 10.0.0.47 10.0.1.0 0.0.0.255', type: 'info' },
  { agent: 3, message: 'Validating rule conflicts against 1,482 existing policies... no conflicts found.', type: 'info' },
  { agent: 3, message: 'Dry-run simulation: 100% of threat flows would be terminated.', type: 'success', delay: 1200 },
  { agent: 3, message: 'Self-healing firewall configuration ready for deployment.', type: 'success' },
  { agent: 3, message: 'Awaiting human operator confirmation — deploy to apply rules.', type: 'info', delay: 500 },
];

/* ------------------------------------------------------------------ */
/*  Agent helper                                                      */
/* ------------------------------------------------------------------ */

const AGENT_META: Record<1 | 2 | 3, { label: string; short: string; color: string; icon: string }> = {
  1: { label: 'Asset Discovery Agent', short: 'ADA', color: 'text-cyan-400', icon: 'search' },
  2: { label: 'Threat Analysis Agent', short: 'TAA', color: 'text-amber-400', icon: 'alert' },
  3: { label: 'Orchestration Agent',    short: 'OA',  color: 'text-emerald-400', icon: 'zap' },
};

function agentBadge(agent: 1 | 2 | 3) {
  const m = AGENT_META[agent];
  return (
    <span className={`font-bold ${m.color}`} style={{ textShadow: `0 0 6px currentColor` }}>
      [{m.short}]
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function MultiAgentRemediationCore() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [scriptIdx, setScriptIdx] = useState(0);
  const [phases, setPhases] = useState<Record<1 | 2 | 3, AgentPhase>>({
    1: 'idle',
    2: 'idle',
    3: 'idle',
  });
  const [deployPhase, setDeployPhase] = useState<DeployPhase>('idle');
  const [networkState, setNetworkState] = useState<'COMPROMISED' | 'ISOLATED & SECURE'>('COMPROMISED');
  const [showDeployButton, setShowDeployButton] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Auto-scroll */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log]);

  /* Stream script lines */
  const streamNext = useCallback(() => {
    if (scriptIdx >= SCRIPT.length) {
      setShowDeployButton(true);
      return;
    }

    const line = SCRIPT[scriptIdx];
    const nextIdx = scriptIdx + 1;

    // Create log entry
    const entry: LogEntry = {
      id: ++idCounter.current,
      agent: line.agent,
      message: line.message,
      type: line.type,
    };
    setLog((prev) => [...prev, entry]);

    // Update agent phase
    const agent = line.agent;
    setPhases((prev) => {
      const next = { ...prev };
      if (next[agent] === 'idle') next[agent] = line.type === 'error' || line.type === 'warning' ? 'scanning' : 'scanning';
      return next;
    });

    // After last line for each agent, mark complete
    const lastLineForAgent = (a: 1 | 2 | 3) => {
      for (let i = SCRIPT.length - 1; i >= 0; i--) {
        if (SCRIPT[i].agent === a) return i;
      }
      return -1;
    };

    if (nextIdx > lastLineForAgent(agent)) {
      setTimeout(() => {
        setPhases((prev) => ({ ...prev, [agent]: 'complete' }));
      }, 400);
    }

    // Schedule next line
    const delay = line.delay ?? 800;
    timerRef.current = setTimeout(() => {
      setScriptIdx(nextIdx);
    }, delay);
  }, [scriptIdx]);

  useEffect(() => {
    streamNext();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [streamNext]);

  /* Restart simulation */
  const handleRestart = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLog([]);
    setScriptIdx(0);
    setPhases({ 1: 'idle', 2: 'idle', 3: 'idle' });
    setDeployPhase('idle');
    setNetworkState('COMPROMISED');
    setShowDeployButton(false);
    idCounter.current = 0;
  };

  /* Deploy action */
  const handleDeploy = () => {
    if (deployPhase !== 'idle') return;
    setDeployPhase('deploying');

    // Simulate deployment animation
    const deployLine = (msg: string, type: LogEntry['type'], delay: number) => {
      setTimeout(() => {
        setLog((prev) => [...prev, { id: ++idCounter.current, agent: 3, message: msg, type }]);
      }, delay);
    };

    deployLine('Applying iptables rules — 3 chains updated...', 'info', 300);
    deployLine('Pushing Cisco-iOS ACL to edge router 10.0.0.1...', 'info', 900);
    deployLine('Verifying connectivity block — 10.0.0.47 is now unreachable.', 'success', 1600);
    deployLine('Quarantine confirmed. Network integrity restored.', 'success', 2200);
    deployLine('SELF-HEALING FIREWALL RULE DEPLOYED SUCCESSFULLY.', 'success', 2800);
    deployLine('System state transition: COMPROMISED → ISOLATED & SECURE', 'success', 3200);

    setTimeout(() => {
      setNetworkState('ISOLATED & SECURE');
      setDeployPhase('success');
    }, 3500);
  };

  /* ── Agent status dot ── */
  const statusDot = (phase: AgentPhase) => {
    switch (phase) {
      case 'idle':
        return <span className="w-2 h-2 rounded-full bg-gray-600 inline-block" />;
      case 'scanning':
        return <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse" style={{ boxShadow: '0 0 8px #fbbf24' }} />;
      case 'analyzing':
        return <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse" style={{ boxShadow: '0 0 8px #fbbf24' }} />;
      case 'complete':
        return <CheckCircle className="w-3.5 h-3.5 text-accent" />;
    }
  };

  /* ── Log icon ── */
  const logIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'info':    return <span className="text-blue-400">◆</span>;
      case 'warning': return <span className="text-amber-400">⚠</span>;
      case 'success': return <span className="text-accent">✔</span>;
      case 'error':   return <span className="text-destructive">✖</span>;
    }
  };

  return (
    <div className="mt-6 border border-border rounded-xl overflow-hidden bg-[#0a0e17]" style={{ boxShadow: '0 0 40px rgba(0,0,0,0.6)' }}>
      {/* ── Header Bar ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#0d111e] border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Cpu className="w-5 h-5 text-accent" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent animate-ping opacity-75" />
          </div>
          <div>
            <h2 className="text-sm font-heading font-bold text-foreground flex items-center gap-2">
              AMD INSTINCT MULTI-AGENT REMEDIATION CORE
              <span className="text-[9px] font-mono bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.5 rounded">
                v4.2.1
              </span>
            </h2>
            <p className="text-[10px] font-mono text-foreground/40">
              autonomous self-healing · zero-trust remediation engine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick agent status dots */}
          {([1, 2, 3] as const).map((a) => (
            <div key={a} className="flex items-center gap-1.5 text-[10px] font-mono">
              {statusDot(phases[a])}
              <span className={phases[a] === 'complete' ? 'text-accent' : 'text-foreground/50'}>
                {AGENT_META[a].short}
              </span>
            </div>
          ))}
          <button
            onClick={handleRestart}
            className="ml-2 px-2.5 py-1 bg-muted rounded-lg text-[10px] font-mono text-foreground/50 hover:text-foreground border border-border/50 hover:border-border transition-all duration-150 cursor-pointer"
          >
            ↻ RESTART
          </button>
        </div>
      </div>

      {/* ── Main body: Terminal + Action Panel ── */}
      <div className="flex flex-col lg:flex-row">
        {/* Terminal log — left / top */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 px-5 py-2 bg-[#080c15] border-b border-border/30">
            <Terminal className="w-3.5 h-3.5 text-foreground/40" />
            <span className="text-[10px] font-mono text-foreground/30">agentic_workflow.log — LIVE</span>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[10px] font-mono text-accent/60">STREAMING</span>
            </span>
          </div>

          <div
            ref={scrollRef}
            className="h-64 lg:h-72 overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-0.5"
            style={{ backgroundColor: '#060a12', scrollBehavior: 'smooth' }}
          >
            {log.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <span className="text-foreground/20 text-[10px] animate-pulse">Initializing agents...</span>
              </div>
            )}
            {log.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 hover:bg-white/[0.02] rounded px-1 py-0.5 transition-colors duration-100">
                <span className="shrink-0 w-3.5 text-center">{logIcon(entry.type)}</span>
                <span className="text-foreground/30 shrink-0 font-mono text-[9px] pt-[2px]">
                  {String(entry.id).padStart(3, '0')}
                </span>
                {agentBadge(entry.agent)}
                <span className="text-foreground/90 break-words">
                  {entry.message}
                </span>
              </div>
            ))}
            {showDeployButton && deployPhase === 'idle' && (
              <div className="flex items-center gap-2 mt-3 text-accent/70 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-[10px]">Awaiting operator action — deploy firewall rule below</span>
              </div>
            )}
            {deployPhase === 'deploying' && (
              <div className="flex items-center gap-2 mt-2 text-amber-400">
                <Zap className="w-3 h-3 animate-pulse" />
                <span className="text-[10px]">Deploying countermeasures...</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Action Panel — right / bottom ── */}
        <div className="w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-border/40 bg-[#080c15] flex flex-col items-center justify-center p-6 gap-5">
          {/* Network state indicator */}
          <div className="text-center">
            <p className="text-[9px] font-mono text-foreground/30 uppercase tracking-widest mb-2">Network State</p>
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border font-heading font-bold text-sm tracking-wider transition-all duration-500 ${
                networkState === 'COMPROMISED'
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-accent/10 border-accent/30 text-accent'
              }`}
              style={
                networkState === 'COMPROMISED'
                  ? { boxShadow: '0 0 20px rgba(239,68,68,0.15), inset 0 0 20px rgba(239,68,68,0.05)' }
                  : { boxShadow: '0 0 20px rgba(34,197,94,0.2), inset 0 0 20px rgba(34,197,94,0.08)' }
              }
            >
              {networkState === 'COMPROMISED' ? (
                <Skull className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              {networkState}
            </div>
          </div>

          {/* Divider */}
          <div className="w-16 h-px bg-border/40" />

          {/* Deploy button */}
          <button
            onClick={handleDeploy}
            disabled={!showDeployButton || deployPhase !== 'idle'}
            className={`relative w-full px-6 py-4 rounded-xl font-heading font-bold text-sm tracking-widest uppercase transition-all duration-300 cursor-pointer
              ${
                !showDeployButton || deployPhase !== 'idle'
                  ? 'bg-muted text-foreground/20 border border-border/30 cursor-not-allowed'
                  : 'bg-accent text-black hover:brightness-110 active:scale-[0.97]'
              }
            `}
            style={
              showDeployButton && deployPhase === 'idle'
                ? {
                    boxShadow: '0 0 30px rgba(34,197,94,0.3), 0 0 60px rgba(34,197,94,0.1), inset 0 0 20px rgba(34,197,94,0.1)',
                    textShadow: '0 0 10px rgba(0,0,0,0.3)',
                  }
                : {}
            }
          >
            {deployPhase === 'deploying' ? (
              <span className="flex items-center justify-center gap-2">
                <Zap className="w-4 h-4 animate-pulse" />
                DEPLOYING...
              </span>
            ) : deployPhase === 'success' ? (
              <span className="flex items-center justify-center gap-2 text-accent">
                <CheckCircle className="w-4 h-4" />
                DEPLOYED ✓
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Play className="w-4 h-4" />
                DEPLOY SELF-HEALING FIREWALL RULE
              </span>
            )}
          </button>

          {deployPhase === 'success' && (
            <p className="text-[10px] font-mono text-accent/70 text-center animate-pulse">
              Network is now ISOLATED & SECURE ✓
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
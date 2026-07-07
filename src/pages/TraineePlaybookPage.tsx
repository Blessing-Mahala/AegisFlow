import { useState } from 'react';
import {
  Terminal,
  BookOpen,
  Shield,
  AlertTriangle,
  Skull,
  Siren,
  Network,
  CheckCircle2,
  XCircle,
  Activity,
  Globe,
} from 'lucide-react';

/* ─── Types ───────────────────────────────────────────── */

interface CrisisEntry {
  id: number;
  title: string;
  slug: string;
  timestamp: string;
  srcHost: string;
  severity: 'critical' | 'high';
  analysis: {
    whatJustHappened: string;
    riskImpact: string;
  };
  steps: [string, string];
}

/* ─── Hardcoded Crisis Entries ────────────────────────── */

const CRISIS_ENTRIES: CrisisEntry[] = [
  {
    id: 1,
    title: 'CRITICAL_FRAUD: API Wallet Drainer Signature Intercepted',
    slug: 'FRAUD',
    timestamp: '16:20:11',
    srcHost: '192.168.1.14',
    severity: 'critical',
    analysis: {
      whatJustHappened:
        'An internal device on the subnet is firing high-velocity automated transaction commands to drain a target banking API rail via a phishing smart contract hook.',
      riskImpact:
        'High-risk cross-border balance drainage or unauthorized asset liquidation.',
    },
    steps: [
      "[ISOLATE] Click 'DEPLOY DEFENSE RULE' immediately to cut off network access for host 192.168.1.14.",
      '[FREEZE] Signal the API router cluster to drop and invalidate all active transaction tokens matching this session handle.',
    ],
  },
  {
    id: 2,
    title: 'HIGH_INTRUSION: Brute-Force SSH Probing on Absa Cluster',
    slug: 'INTRUSION',
    timestamp: '16:21:05',
    srcHost: '192.168.1.89',
    severity: 'high',
    analysis: {
      whatJustHappened:
        'An unauthorized machine is attempting a high-speed password spraying dictionary attack to log directly into your primary database storage cluster nodes.',
      riskImpact:
        'Server compromise, system configuration hijacking, and server-side client data exfiltration.',
    },
    steps: [
      '[BLOCK] Deploy a hardware MAC filter block onto the routing gateway interface layer.',
      '[ROTATION] Force an automated credential rotation cycle for all master administrative passwords on the cluster.',
    ],
  },
  {
    id: 3,
    title: 'COMPLIANCE_ALARM: Outbound Sanctioned Mixer Route Identified',
    slug: 'COMPLIANCE',
    timestamp: '16:22:40',
    srcHost: '192.168.1.210',
    severity: 'critical',
    analysis: {
      whatJustHappened:
        'An outbound server payload was intercepted trying to route transactional assets directly to an anonymous financial obfuscation mixer.',
      riskImpact:
        'Severe anti-money laundering (AML) regulatory compliance failure and immediate legal exposure.',
    },
    steps: [
      '[KILL] Instantly sever the active TCP socket link routing to the mixer network address.',
      '[QUARANTINE] Isolate the target user workstation into a sandboxed Zero-Trust quarantine VLAN segment.',
    ],
  },
];

/* ─── Entry styling config ────────────────────────────── */

const ENTRY_CONFIG: Record<
  number,
  { border: string; bg: string; icon: typeof Skull; label: string; titleIcon: typeof Skull }
> = {
  1: {
    border: 'border-rose-500/40',
    bg: 'bg-rose-500/8',
    icon: Skull,
    label: 'CRITICAL',
    titleIcon: Skull,
  },
  2: {
    border: 'border-orange-500/40',
    bg: 'bg-orange-500/8',
    icon: AlertTriangle,
    label: 'HIGH',
    titleIcon: AlertTriangle,
  },
  3: {
    border: 'border-rose-500/40',
    bg: 'bg-rose-500/8',
    icon: Skull,
    label: 'CRITICAL',
    titleIcon: Skull,
  },
};

/* ─── Component ───────────────────────────────────────── */

export default function TraineePlaybookPage() {
  const [selectedIncident, setSelectedIncident] = useState<CrisisEntry>(CRISIS_ENTRIES[0]);
  const [contained, setContained] = useState(false);
  const [showNotification, setShowNotification] = useState(false);

  const handleDeploy = () => {
    setContained(true);
    setShowNotification(true);
    setTimeout(() => {
      setShowNotification(false);
    }, 5000);
  };

  const handleSelect = (entry: CrisisEntry) => {
    if (selectedIncident.id !== entry.id) {
      setSelectedIncident(entry);
      setContained(false);
      setShowNotification(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-border bg-primary/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-heading font-bold text-foreground tracking-tight">
              AI TRAINEE PLAYBOOK &amp; DOCUMENTATION LAYER
            </h1>
            <p className="text-xs text-foreground/40 font-mono">
              LIVE INCIDENT TRIAGE // JUNIOR ANALYST TRAINING INTERFACE
            </p>
          </div>
        </div>
      </div>

      {/* ── Two-Column Layout ──────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ────────── LEFT PANEL (40%) ──────────────────────── */}
        <div className="w-[40%] shrink-0 flex flex-col border-r border-border">
          {/* Panel header */}
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border bg-background/50 shrink-0">
            <Terminal className="w-3.5 h-3.5 text-foreground/40" />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground/50">
              Incident &amp; Packet Stream Terminal
            </span>
          </div>

          {/* Scrollable entry list */}
          <div className="flex-1 overflow-y-auto bg-[#0a0a0f]">
            {CRISIS_ENTRIES.map((entry) => {
              const isSelected = selectedIncident.id === entry.id;
              const ecfg = ENTRY_CONFIG[entry.id];
              const IconComponent = ecfg.icon;
              const isThisContained = contained && isSelected;

              return (
                <button
                  key={entry.id}
                  onClick={() => handleSelect(entry)}
                  className={`w-full text-left transition-all duration-150 cursor-pointer
                    ${isSelected
                      ? entry.severity === 'critical'
                        ? 'bg-rose-500/[0.04] border-l-2 border-l-rose-400'
                        : 'bg-orange-500/[0.04] border-l-2 border-l-orange-400'
                      : 'border-l-2 border-l-transparent hover:bg-foreground/[0.02]'
                    }`}
                >
                  <div className="px-5 py-4 space-y-2.5 border-b border-border/5">
                    {/* Header row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Severity badge */}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider border ${ecfg.border} ${ecfg.bg}`}
                      >
                        <IconComponent className="w-2.5 h-2.5" />
                        {ecfg.label}
                      </span>

                      {/* Timestamp */}
                      <span className="text-[10px] font-mono text-foreground/30">
                        {entry.timestamp}
                      </span>

                      {/* Contained badge */}
                      {isThisContained && (
                        <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          CONTAINED
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <p className="text-xs font-heading font-bold text-foreground/90 leading-snug">
                      {entry.title}
                    </p>

                    {/* Source info */}
                    <div className="flex items-center gap-2 text-[10px] font-mono text-foreground/40">
                      <Globe className="w-2.5 h-2.5 shrink-0" />
                      <span className="text-foreground/70">{entry.srcHost}</span>
                      <span className="text-foreground/20">|</span>
                      <span>
                        Type:{' '}
                        <span className="text-foreground/70 font-semibold">{entry.slug}</span>
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer status */}
          <div className="flex items-center gap-2 px-5 py-2.5 border-t border-border/40 bg-background/50 shrink-0">
            <span
              className={`w-1.5 h-1.5 rounded-full ${contained ? 'bg-emerald-400' : 'bg-accent'} animate-ping`}
            />
            <span className="text-[10px] font-mono text-foreground/40">
              {contained ? 'INCIDENT CONTAINED' : `${CRISIS_ENTRIES.length} PENDING INCIDENTS`}
            </span>
          </div>
        </div>

        {/* ────────── RIGHT PANEL (60%) ──────────────────────── */}
        <div className="flex-1 flex flex-col bg-primary/30 min-w-0">
          {/* Panel header */}
          <div className="px-5 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <Network className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-sm font-heading font-bold text-foreground tracking-tight">
                  AMD MENTOR AGENT
                </h2>
                <p className="text-[10px] font-mono text-foreground/40">
                  INCIDENT TRANSLATOR // CRISIS RESPONSE CENTER
                </p>
              </div>
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-5">
              {/* ── A. AMD Mentor Agent: What Just Happened ── */}
              <div className="bg-background/60 border border-border/50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                    <Activity className="w-3 h-3 text-blue-400" />
                  </div>
                  <h3 className="text-xs font-heading font-bold text-blue-400 uppercase tracking-wider">
                    What Just Happened
                  </h3>
                </div>
                <p className="text-xs text-foreground/80 leading-relaxed">
                  {selectedIncident.analysis.whatJustHappened}
                </p>
              </div>

              {/* ── A. AMD Mentor Agent: Risk Impact ─────────── */}
              <div className="bg-background/60 border border-border/50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                    <Shield className="w-3 h-3 text-rose-400" />
                  </div>
                  <h3 className="text-xs font-heading font-bold text-rose-400 uppercase tracking-wider">
                    Risk Impact
                  </h3>
                </div>
                <p className="text-xs text-foreground/80 leading-relaxed">
                  {selectedIncident.analysis.riskImpact}
                </p>
              </div>

              {/* ── B. Emergency Crisis Manifesto ──────────────── */}
              <div className="rounded-xl border border-red-800/60 bg-[#1a0a0a] overflow-hidden shadow-[0_0_20px_rgba(220,38,38,0.15)]">
                {/* Header */}
                <div className="px-4 py-3 border-b border-red-900/60 bg-[#7f1d1d]/80">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-red-500/20 border border-red-500/40 flex items-center justify-center animate-pulse">
                      <Siren className="w-3.5 h-3.5 text-red-400" />
                    </div>
                    <h3 className="text-xs font-heading font-bold uppercase tracking-wider text-foreground">
                      EMERGENCY CRISIS MANIFESTO
                    </h3>
                  </div>
                  <p className="mt-1.5 text-[9px] font-mono font-semibold tracking-wider text-red-300/80 uppercase">
                    Immediate Action Required — Follow Steps in Order
                  </p>
                </div>

                {/* Steps */}
                <div className="p-4 space-y-3">
                  {selectedIncident.steps.map((step, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-all duration-300 ${
                        contained
                          ? 'bg-emerald-500/8 border-emerald-500/30'
                          : 'bg-black/40 border-red-800/30'
                      }`}
                    >
                      {/* Step number badge */}
                      <div
                        className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[10px] font-mono font-bold transition-colors duration-300 ${
                          contained
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-red-500/15 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {idx + 1}
                      </div>

                      {/* Step text */}
                      <p className="text-[11px] font-mono text-foreground/80 leading-relaxed flex-1 min-w-0">
                        {step}
                      </p>

                      {/* Status pill */}
                      <div
                        className={`flex items-center gap-1 shrink-0 text-[9px] font-mono font-bold uppercase tracking-wider transition-all duration-300 ${
                          contained ? 'text-emerald-400' : 'text-amber-500'
                        }`}
                      >
                        {contained ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            CONTAINED
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" />
                            PENDING
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── C. Core Action Mitigation Interface ────────── */}
              <div className="flex flex-col items-center gap-3 pt-1">
                <button
                  onClick={handleDeploy}
                  disabled={contained}
                  className={`w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl
                    transition-all duration-300 cursor-pointer
                    text-sm font-heading font-bold uppercase tracking-widest
                    ${
                      contained
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)] cursor-default'
                        : 'bg-rose-500/15 border border-rose-500/40 text-rose-300 shadow-[0_0_16px_rgba(239,68,68,0.25)] hover:bg-rose-500/25 hover:border-rose-500/60 hover:shadow-[0_0_24px_rgba(239,68,68,0.4)] active:scale-[0.98]'
                    }`}
                >
                  {contained ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      ALL CONTAINED
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5" />
                      DEPLOY SELF-HEALING FIREWALL RULE
                    </>
                  )}
                </button>

                <p className="text-[9px] font-mono text-foreground/30 text-center max-w-md">
                  This action will deploy countermeasures across all affected systems.
                  In production, this requires two-person verification.
                </p>
              </div>
            </div>
          </div>

          {/* ── Success Notification Toast ────────────────── */}
          {showNotification && (
            <div className="shrink-0 px-5 py-3 border-t border-emerald-500/30 bg-emerald-500/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-[11px] font-mono font-semibold text-emerald-300">
                  CRISIS AVERTED: Mitigation rules applied successfully to target interface.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
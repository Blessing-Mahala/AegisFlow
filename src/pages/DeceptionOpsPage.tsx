import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Radar,
  Shield,
  AlertTriangle,
  Siren,
  Server,
  HardDrive,
  Monitor,
  Network,
  Activity,
  Gauge,
  CheckCircle2,
  XCircle,
  Radio,
  Terminal,
  Zap,
  Globe,
  RadioTower,
  Satellite,
  Brain,
  ChevronRight,
  Target,
  Sigma,
  ArrowRight,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useAlertsStore } from '../stores/alertsStore';
import { useGuardiumRealtimeSubscription } from '../hooks/useGuardiumRealtimeSubscription';
import {
  createInitialGameState,
  runGameRound,
  simulateAttackerAction,
  DECOY_PROFILES,
  ATTACKER_PROFILES,
} from '../lib/stackelbergDeception';
import type { GameState, DecoyType, InteractionRecord, StackelbergEquilibrium } from '../lib/stackelbergDeception';

/* ═══════════════════════════════════════════════════════════════
   MODULE 1 — HONEYTOKEN COUNTER-DECEPTION PANELS
   ═══════════════════════════════════════════════════════════════ */
const DECOY_KEYS = ['canaryPort', 'fakeApiKeys', 'decoyAtm'] as const;
type DecoyKey = (typeof DECOY_KEYS)[number];

const DECOY_LABELS: Record<DecoyKey, string> = {
  canaryPort: 'Deploy Fake Core-SSH Canary Port',
  fakeApiKeys: 'Inject Dummy Financial API Keys',
  decoyAtm: 'Broadcast Decoy ATM Workstation Host',
};

const DECOY_ICONS: Record<DecoyKey, React.ElementType> = {
  canaryPort: Terminal,
  fakeApiKeys: RadioTower,
  decoyAtm: Monitor,
};

/* ═══════════════════════════════════════════════════════════════
   MODULE 2 — TOPOLOGY / BLAST RADIUS TYPES
   ═══════════════════════════════════════════════════════════════ */

interface TopoNode {
  id: string;
  label: string;
  type: 'router' | 'server' | 'mainframe' | 'workstation';
  x: number;
  y: number;
}

interface TopoEdge {
  from: string;
  to: string;
}

interface TopoIncident {
  id: string;
  label: string;
  nodeId: string;
  severity: 'critical' | 'high';
}

/* ─── Topology data ────────────────────────────────────── */

const TOPO_NODES: TopoNode[] = [
  { id: 'router-a', label: 'Edge Router', type: 'router', x: 150, y: 50 },
  { id: 'firewall-1', label: 'Perimeter FW', type: 'router', x: 370, y: 50 },
  { id: 'server-01', label: 'Web Server 01', type: 'server', x: 70, y: 180 },
  { id: 'server-02', label: 'Web Server 02', type: 'server', x: 230, y: 180 },
  { id: 'db-main', label: 'Core DB Cluster', type: 'mainframe', x: 390, y: 180 },
  { id: 'app-srv', label: 'App Server', type: 'server', x: 530, y: 180 },
  { id: 'ws-01', label: 'Dev WS 01', type: 'workstation', x: 70, y: 310 },
  { id: 'ws-02', label: 'Dev WS 02', type: 'workstation', x: 230, y: 310 },
  { id: 'router-b', label: 'Internal GW', type: 'router', x: 390, y: 310 },
  { id: 'mf-01', label: 'Mainframe 01', type: 'mainframe', x: 530, y: 310 },
  { id: 'srv-03', label: 'Storage Node', type: 'server', x: 130, y: 430 },
  { id: 'mail-srv', label: 'Mail Server', type: 'server', x: 380, y: 430 },
];

const TOPO_EDGES: TopoEdge[] = [
  { from: 'router-a', to: 'firewall-1' },
  { from: 'router-a', to: 'server-01' },
  { from: 'router-a', to: 'server-02' },
  { from: 'firewall-1', to: 'db-main' },
  { from: 'firewall-1', to: 'app-srv' },
  { from: 'server-01', to: 'ws-01' },
  { from: 'server-02', to: 'ws-02' },
  { from: 'db-main', to: 'mf-01' },
  { from: 'app-srv', to: 'router-b' },
  { from: 'ws-01', to: 'srv-03' },
  { from: 'ws-02', to: 'mail-srv' },
  { from: 'router-b', to: 'mf-01' },
  { from: 'server-01', to: 'server-02' },
  { from: 'server-02', to: 'app-srv' },
];

const TOPO_INCIDENTS: TopoIncident[] = [
  { id: 't-inc-1', label: 'SSH Brute Force', nodeId: 'server-01', severity: 'high' },
  { id: 't-inc-2', label: 'API Wallet Drainer', nodeId: 'db-main', severity: 'critical' },
  { id: 't-inc-3', label: 'Mixer Route Detection', nodeId: 'router-b', severity: 'critical' },
];

const TYPE_COLORS: Record<string, string> = {
  router: '#06b6d4',
  server: '#3b82f6',
  mainframe: '#8b5cf6',
  workstation: '#22c55e',
};

/* ─── Blast radius helpers ─────────────────────────────── */

function getAffectedNodeIds(nodeId: string, severity: 'critical' | 'high' | null): string[] {
  if (!nodeId || !severity) return [];
  const adjacent = new Set<string>();
  TOPO_EDGES.forEach((e) => {
    if (e.from === nodeId) adjacent.add(e.to);
    if (e.to === nodeId) adjacent.add(e.from);
  });
  if (severity === 'high') {
    return Array.from(adjacent).slice(0, 3);
  }
  if (severity === 'critical') {
    const twoHop = new Set(adjacent);
    adjacent.forEach((nid) => {
      TOPO_EDGES.forEach((e) => {
        if (e.from === nid) twoHop.add(e.to);
        if (e.to === nid) twoHop.add(e.from);
      });
    });
    twoHop.delete(nodeId);
    return Array.from(twoHop).slice(0, 7);
  }
  return [];
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function DeceptionOpsPage() {
  /* ── Real-time WebSocket subscription (layout-effect mount) ── */
  useGuardiumRealtimeSubscription();

  /* ── Real-time store selectors ──────────────────────────── */
  const currentEntropy = useAlertsStore((s) => s.currentEntropy);
  const entropyHistory = useAlertsStore((s) => s.entropyHistory);
  const criticalAlertMode = useAlertsStore((s) => s.criticalAlertMode);
  const highEntropyCount = useAlertsStore((s) => s.highEntropyCount);
  const feed = useAlertsStore((s) => s.feed);
  const clearCriticalMode = useAlertsStore((s) => s.clearCriticalMode);

  /* ── Derived ────────────────────────────────────────────── */
  const isEntropyHigh = currentEntropy > 7.2;

  /* ── Module 1: Decoy state ───────────────────────────── */
  const [activeDecoys, setActiveDecoys] = useState<Record<DecoyKey, boolean>>({
    canaryPort: false,
    fakeApiKeys: false,
    decoyAtm: false,
  });
  const [decoyAlert, setDecoyAlert] = useState<string | null>(null);
  const decoyTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    Object.values(decoyTimersRef.current).forEach(clearTimeout);
    decoyTimersRef.current = {};

    Object.entries(activeDecoys).forEach(([key, active]) => {
      if (active) {
        decoyTimersRef.current[key] = setTimeout(() => {
          setDecoyAlert(
            'HONEYTOKEN BREACH: Unauthorized access signature detected on active decoy module!',
          );
        }, 15000);
      }
    });

    return () => {
      Object.values(decoyTimersRef.current).forEach(clearTimeout);
    };
  }, [activeDecoys]);

  const toggleDecoy = useCallback((key: DecoyKey) => {
    setActiveDecoys((prev) => ({ ...prev, [key]: !prev[key] }));
    setDecoyAlert(null);
  }, []);

  const anyDecoyActive = Object.values(activeDecoys).some(Boolean);

  /* ── Latest blast radius node count from the real-time feed ── */
  const latestBlastRadius = useMemo(() => {
    const firstWithBlast = feed.find(
      (e) => (e.row.blast_radius_nodes ?? 0) > 0
    );
    return firstWithBlast?.row.blast_radius_nodes ?? 0;
  }, [feed]);

  /* ── Module 3: Stackelberg Deception Game ──────────────── */
  const [gameState, setGameState] = useState<GameState>(createInitialGameState());
  const [currentInteraction, setCurrentInteraction] = useState<InteractionRecord | null>(null);
  const gameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-advance the game every 8 seconds
  useEffect(() => {
    gameIntervalRef.current = setInterval(() => {
      setGameState((prev) => {
        const { nextState, recommendedDecoy, equilibrium } = runGameRound(prev);

        // Simulate attacker interaction
        const action = simulateAttackerAction(recommendedDecoy, nextState.inferredAttackerType);
        const record: InteractionRecord = {
          round: nextState.round,
          decoyType: recommendedDecoy,
          attackerAction: action,
          timestamp: Date.now(),
        };

        setCurrentInteraction(record);

        return {
          ...nextState,
          decoyDeployed: true,
          activeDecoy: recommendedDecoy,
          interactionHistory: [...nextState.interactionHistory, record],
        };
      });
    }, 8000);
    return () => { if (gameIntervalRef.current) clearInterval(gameIntervalRef.current); };
  }, []);

  const decoyProfile = gameState.activeDecoy ? DECOY_PROFILES[gameState.activeDecoy] : null;
  const attackerProfile = ATTACKER_PROFILES[gameState.inferredAttackerType];
  const eq = gameState.equilibrium;

  const strategyColor = (val: number) => {
    if (val >= 0.5) return 'text-accent';
    if (val >= 0.25) return 'text-amber-400';
    return 'text-foreground/40';
  };

  /* ── Module 4: Blast radius state ────────────────────── */
  const [selectedIncident, setSelectedIncident] = useState<TopoIncident | null>(null);

  const affectedNodeIds = useMemo<string[]>(() => {
    if (!selectedIncident) return [];
    return getAffectedNodeIds(selectedIncident.nodeId, selectedIncident.severity);
  }, [selectedIncident]);

  const selectedNode = useMemo(() => {
    if (!selectedIncident) return null;
    return TOPO_NODES.find((n) => n.id === selectedIncident.nodeId) ?? null;
  }, [selectedIncident]);

  const handleSelectIncident = useCallback((inc: TopoIncident | null) => {
    setSelectedIncident(inc);
  }, []);

  const handleDismissCritical = useCallback(() => {
    clearCriticalMode();
  }, [clearCriticalMode]);

  return (
    <div className="h-full flex flex-col bg-background overflow-y-auto">
      {/* ══════════════════════════════════════════════════
          CRITICAL ALERT MODE — FLASHING ORANGE BANNER
         ══════════════════════════════════════════════════ */}
      <div
        className={`transition-all duration-500 ease-in-out overflow-hidden ${
          criticalAlertMode ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'
        }`}>
        {criticalAlertMode && (
          <div className="px-6 py-3 bg-orange-600/20 border-b border-orange-500/50">
            <div className="flex items-center gap-3 max-w-5xl mx-auto">
              <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-400/60 flex items-center justify-center animate-ping shrink-0">
                <AlertTriangle className="w-4 h-4 text-orange-300" />
              </div>
              <p className="text-sm font-semibold font-mono text-orange-200 animate-pulse">
                ⚡ CRITICAL ENTROPY THRESHOLD {'>'} 7.2 bits — Encrypted exfiltration / ransomware traffic pattern detected
              </p>
              <button
                onClick={handleDismissCritical}
                className="ml-auto shrink-0 px-3 py-1 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[10px] font-mono font-bold hover:bg-orange-500/20 transition-all duration-200 cursor-pointer"
              >
                DISMISS
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════
          PAGE HEADER
         ══════════════════════════════════════════════════ */}
      <div className="px-6 py-4 border-b border-border bg-primary/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <Radar className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg font-heading font-bold text-foreground tracking-tight">
              DECEPTION OPS &amp; ENTROPY RADAR
            </h1>
            <p className="text-xs text-foreground/40 font-mono">
              HONEYPOT MANAGEMENT // REAL-TIME ENTROPY FEED // THREAT MAPPING
              {highEntropyCount > 0 && (
                <span className="ml-2 text-orange-400">
                  // {highEntropyCount} HIGH-ENTROPY EVENTS
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6 max-w-6xl">

        {/* ══════════════════════════════════════════════════
            MODULE 1 — HONEYTOKEN COUNTER-DECEPTION
           ══════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Shield className="w-3 h-3 text-emerald-400" />
            </div>
            <h2 className="text-sm font-heading font-bold text-foreground">
              HONEYTOKEN COUNTER-DECEPTION PANELS
            </h2>
            {anyDecoyActive && (
              <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 animate-pulse">
                <Radio className="w-2.5 h-2.5 animate-spin" />
                ACTIVE DECOYS
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(DECOY_KEYS as DecoyKey[]).map((key) => {
              const active = activeDecoys[key];
              const Icon = DECOY_ICONS[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleDecoy(key)}
                  className={`relative text-left transition-all duration-300 cursor-pointer rounded-xl border-2 p-4 space-y-3 ${
                    active
                      ? 'border-emerald-500/50 bg-emerald-500/5 shadow-[0_0_16px_rgba(16,185,129,0.15)]'
                      : 'border-border/60 bg-secondary hover:border-foreground/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-300 ${
                        active
                          ? 'bg-emerald-500/15 border border-emerald-500/30'
                          : 'bg-foreground/5 border border-border/40'
                      }`}
                    >
                      <Icon className={`w-4 h-4 transition-colors duration-300 ${active ? 'text-emerald-400' : 'text-foreground/40'}`} />
                    </div>
                    <div
                      className={`w-11 h-6 rounded-full border transition-all duration-300 flex items-center ${
                        active
                          ? 'bg-emerald-500/20 border-emerald-500/50 justify-end'
                          : 'bg-foreground/5 border-border/60 justify-start'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full mx-0.5 transition-all duration-300 ${active ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-foreground/30'}`} />
                    </div>
                  </div>
                  <p className="text-xs font-heading font-bold text-foreground/90 leading-snug min-h-[2.5rem]">
                    {DECOY_LABELS[key]}
                  </p>
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 ${
                      active
                        ? 'border-emerald-500/30 bg-emerald-500/8'
                        : 'border-border/30 bg-foreground/[0.02]'
                    }`}
                  >
                    {active ? (
                      <>
                        <Radar className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
                        <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-400">DECOY TRAP LIVE // AWAITING SEC-VIOLATION</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 text-foreground/30 shrink-0" />
                        <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-foreground/30">DECOY OFFLINE // INACTIVE</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            MODULE 2 — REAL-TIME PAYLOAD ENTROPY METRIC
           ══════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
              <Activity className="w-3 h-3 text-orange-400" />
            </div>
            <h2 className="text-sm font-heading font-bold text-foreground">
              REAL-TIME PAYLOAD ENTROPY METRIC
            </h2>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-mono text-foreground/40">
              <span className={`w-1.5 h-1.5 rounded-full ${isEntropyHigh ? 'bg-orange-400 animate-ping' : 'bg-emerald-400'}`} />
              {isEntropyHigh ? 'CRITICAL' : 'BASELINE'}
              <span className="text-[8px] text-foreground/30 ml-1">
                {feed.length > 0 ? `${feed.length} alerts` : 'no data'}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* ── Entropy Gauge ──────────────────────────── */}
            <div
              className={`bg-secondary border rounded-xl p-5 flex flex-col items-center justify-center space-y-3 transition-all duration-500 ${
                criticalAlertMode
                  ? 'border-orange-500/40 shadow-[0_0_24px_rgba(249,115,22,0.25)] animate-pulse'
                  : isEntropyHigh
                    ? 'border-orange-500/40 shadow-[0_0_20px_rgba(249,115,22,0.15)]'
                    : 'border-border/60'
              }`}
            >
              <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
                <circle cx="70" cy="70" r="56" fill="none" stroke="currentColor" strokeWidth="10" className="text-border/60" strokeLinecap="round" transform="rotate(-90 70 70)" strokeDasharray={`${2 * Math.PI * 56}`} strokeDashoffset="0" />
                <circle cx="70" cy="70" r="56" fill="none" stroke={criticalAlertMode ? '#f97316' : '#22c55e'} strokeWidth="10" strokeLinecap="round" transform="rotate(-90 70 70)" strokeDasharray={`${2 * Math.PI * 56}`} strokeDashoffset={`${2 * Math.PI * 56 * (1 - currentEntropy / 8)}`} className="transition-all duration-700 ease-out" />
                <text x="70" y="62" textAnchor="middle" fill="currentColor" className={`text-2xl font-heading font-bold transition-colors duration-500 ${criticalAlertMode ? 'fill-orange-400' : 'fill-emerald-400'}`}>
                  {currentEntropy.toFixed(2)}
                </text>
                <text x="70" y="82" textAnchor="middle" className="text-[10px] font-mono fill-foreground/40">bits / byte</text>
              </svg>

              <div className="flex items-center gap-2">
                <Gauge className={`w-3.5 h-3.5 ${criticalAlertMode ? 'text-orange-400 animate-pulse' : 'text-emerald-400'}`} />
                <span className={`text-[10px] font-mono font-bold uppercase tracking-wider transition-colors duration-500 ${criticalAlertMode ? 'text-orange-400' : 'text-emerald-400'}`}>
                  {criticalAlertMode ? '⚠ CRITICAL MODE' : isEntropyHigh ? 'HIGH ENTROPY' : 'NORMAL FLOW'}
                </span>
              </div>
            </div>

            {/* ── Entropy Line Chart ────────────────────────── */}
            <div className="lg:col-span-2 bg-secondary border border-border/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground/50">
                    Stream History (last {entropyHistory.length} ticks)
                  </span>
                  <span className="text-[8px] font-mono text-foreground/30 bg-foreground/5 px-1.5 py-0.5 rounded border border-border/30">
                    {feed.length} alerts cached
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border transition-all duration-500 ${
                    criticalAlertMode
                      ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 animate-pulse'
                      : isEntropyHigh
                        ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  }`}
                >
                  {currentEntropy.toFixed(2)} bits
                </span>
              </div>

              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={entropyHistory}>
                    <XAxis dataKey="t" hide />
                    <YAxis domain={[0, 8.5]} tick={{ fill: 'rgb(255 255 255 / 0.3)', fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f0f1a',
                        border: '1px solid rgb(255 255 255 / 0.1)',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                      }}
                      labelStyle={{ color: 'rgb(255 255 255 / 0.5)' }}
                      formatter={(value: number) => [`${value.toFixed(2)} bits`, 'Entropy']}
                    />
                    <Line type="monotone" dataKey="v" stroke={criticalAlertMode ? '#f97316' : isEntropyHigh ? '#f97316' : '#22c55e'} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── High Entropy / Critical Mode Warning Ticker ── */}
          <div
            className={`mt-3 overflow-hidden transition-all duration-500 ${
              criticalAlertMode || isEntropyHigh ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg ${
              criticalAlertMode
                ? 'bg-orange-600/20 border-orange-500/50'
                : 'bg-orange-500/10 border-orange-500/30'
            }`}>
              <AlertTriangle className={`w-4 h-4 shrink-0 ${criticalAlertMode ? 'text-orange-300 animate-ping' : 'text-orange-400 animate-pulse'}`} />
              <p className={`text-[11px] font-mono font-semibold ${criticalAlertMode ? 'text-orange-200' : 'text-orange-300'}`}>
                {criticalAlertMode
                  ? '⚡ CRITICAL: PAYLOAD ENTROPY > 7.2 — ENCRYPTED DATA EXFILTRATION OR RANSOMWARE TRAFFIC ACTIVE — IMMEDIATE RESPONSE REQUIRED'
                  : 'HIGH ENTROPY DETECTED — POTENTIAL ENCRYPTED DATA EXFILTRATION OR RANSOMWARE TRAFFIC ACTIVE'}
              </p>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            MODULE 3 — STACKELBERG DECEPTION GAME
           ══════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
              <Brain className="w-3 h-3 text-purple-400" />
            </div>
            <h2 className="text-sm font-heading font-bold text-foreground">
              STACKELBERG DECEPTION GAME
            </h2>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-mono text-foreground/40">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
              Round {gameState.round}
              {' | '}
              <span className="text-purple-400">{gameState.inferredAttackerType === 'scanner' ? 'SCANNER DETECTED' : 'EXPLOIT KIT DETECTED'}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* ── Defender Strategy Distribution ───────────── */}
            <div className="bg-secondary border border-border/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-accent" />
                <h3 className="text-[10px] font-heading font-bold uppercase tracking-wider text-foreground">Defender Mixed Strategy</h3>
              </div>
              <p className="text-[8px] font-mono text-foreground/40">Optimal decoy deployment probabilities</p>

              <div className="space-y-2">
                {(['low_interaction', 'medium_interaction', 'high_interaction'] as DecoyType[]).map((dt) => {
                  const pct = Math.round((eq?.defenderStrategy[dt] ?? 0) * 100);
                  const profile = DECOY_PROFILES[dt];
                  return (
                    <div key={dt} className="space-y-1">
                      <div className="flex items-center justify-between text-[9px] font-mono">
                        <span className="text-foreground/70">{profile.label}</span>
                        <span className={`font-bold ${strategyColor(eq?.defenderStrategy[dt] ?? 0)}`}>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-purple-500 transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {decoyProfile && (
                <div className="bg-black/30 border border-purple-500/20 rounded-lg p-2.5 mt-2">
                  <p className="text-[8px] font-mono text-purple-400/70 uppercase tracking-wider mb-1">Current Decoy Deployed</p>
                  <p className="text-[10px] font-mono text-foreground font-bold">{decoyProfile.label}</p>
                  <div className="flex items-center gap-2 mt-1 text-[8px] font-mono text-foreground/50">
                    <span>Stealth: {Math.round(decoyProfile.stealth * 100)}%</span>
                    <span>Intel value: {Math.round(decoyProfile.intelligenceValue * 100)}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Attacker & Payoff Info ──────────────────── */}
            <div className="bg-secondary border border-border/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-rose-400" />
                <h3 className="text-[10px] font-heading font-bold uppercase tracking-wider text-foreground">Attacker Profile</h3>
              </div>

              <div className="bg-black/30 border border-rose-500/20 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-mono font-bold text-rose-400">{attackerProfile.label}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border ${
                    gameState.inferredAttackerType === 'exploit_kit'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  }`}>
                    {gameState.inferredAttackerType === 'exploit_kit' ? 'ADVANCED' : 'BASIC'}
                  </span>
                </div>
                <p className="text-[8px] font-mono text-foreground/60">{attackerProfile.goal}</p>
                <div className="flex items-center gap-3 mt-2 text-[8px] font-mono text-foreground/50">
                  <span>Detection: {Math.round(attackerProfile.detectionSkill * 100)}%</span>
                  <span>Patience: {attackerProfile.patience}s</span>
                </div>
              </div>

              {/* Payoff summary */}
              <div className="bg-black/30 border border-border/40 rounded-lg p-3 space-y-1">
                <p className="text-[8px] font-mono text-foreground/40 uppercase tracking-wider">Equilibrium Payoffs</p>
                <div className="flex items-center justify-between text-[9px] font-mono">
                  <span className="text-accent">Defender EU</span>
                  <span className="text-accent font-bold">{eq?.defenderExpectedUtility ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono">
                  <span className="text-rose-400">Attacker EU</span>
                  <span className="text-rose-400 font-bold">{eq?.attackerExpectedUtility ?? 0}</span>
                </div>
                <p className={`text-[8px] font-mono mt-1 ${
                  eq?.converged ? 'text-accent' : 'text-amber-400'
                }`}>
                  {eq?.converged ? '✓ Equilibrium converged' : `⟳ Iterating (${eq?.iterations ?? 0})`}
                </p>
              </div>
            </div>

            {/* ── Interaction History ──────────────────────── */}
            <div className="lg:col-span-2 bg-secondary border border-border/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sigma className="w-3.5 h-3.5 text-cyan-400" />
                <h3 className="text-[10px] font-heading font-bold uppercase tracking-wider text-foreground">Interaction History &amp; Attacker Best Response</h3>
              </div>

              {/* Latest interaction */}
              {currentInteraction && (
                <div className={`px-3 py-2 rounded-lg border text-[9px] font-mono ${
                  currentInteraction.attackerAction === 'exploit'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : currentInteraction.attackerAction === 'probe'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-accent/10 border-accent/20 text-accent'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold uppercase">
                      {currentInteraction.attackerAction === 'exploit' ? '⚠ EXPLOIT ATTEMPT' :
                       currentInteraction.attackerAction === 'probe' ? '🔍 PROBE DETECTED' : '✓ ATTACKER MOVED ON'}
                    </span>
                    <ChevronRight className="w-3 h-3" />
                    <span className="text-foreground/70">
                      {DECOY_PROFILES[currentInteraction.decoyType].label} — Round {currentInteraction.round}
                    </span>
                  </div>
                </div>
              )}

              {/* Best response info */}
              {eq && (
                <div className="bg-black/30 border border-border/40 rounded-lg p-3">
                  <p className="text-[8px] font-mono text-foreground/40 uppercase tracking-wider mb-1">Attacker Best Responds To</p>
                  <p className="text-[10px] font-mono font-bold text-amber-400">
                    {DECOY_PROFILES[eq.attackerBestResponse].label}
                  </p>
                  <p className="text-[8px] font-mono text-foreground/50 mt-0.5">
                    The attacker maximises their expected utility by targeting this decoy type
                  </p>
                </div>
              )}

              {/* Recent interaction log */}
              <div className="max-h-28 overflow-y-auto space-y-1">
                {gameState.interactionHistory.length === 0 && (
                  <p className="text-[9px] font-mono text-foreground/30 text-center py-4 italic">No interactions yet — game initialising...</p>
                )}
                {[...gameState.interactionHistory].reverse().slice(0, 8).map((rec, i) => (
                  <div key={i} className="flex items-center gap-2 text-[8px] font-mono text-foreground/50">
                    <span className="text-foreground/30 w-6">R{rec.round}</span>
                    <span className={`w-14 text-center px-1 rounded ${
                      rec.attackerAction === 'exploit' ? 'bg-rose-500/10 text-rose-400' :
                      rec.attackerAction === 'probe' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-accent/10 text-accent'
                    }`}>
                      {rec.attackerAction.toUpperCase()}
                    </span>
                    <ArrowRight className="w-2 h-2" />
                    <span className="truncate text-foreground/60">{DECOY_PROFILES[rec.decoyType].label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            MODULE 4 — AUTOMATED BLAST RADIUS COMPONENT
           ══════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
              <Satellite className="w-3 h-3 text-rose-400" />
            </div>
            <h2 className="text-sm font-heading font-bold text-foreground">
              AUTOMATED BLAST RADIUS
            </h2>
            {latestBlastRadius > 0 && (
              <span className="ml-2 text-[10px] font-mono text-rose-400">
                ({latestBlastRadius} nodes at risk)
              </span>
            )}
          </div>

          {/* Incident selector */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground/50 mr-1">
              Target Incident:
            </span>
            <button
              onClick={() => handleSelectIncident(null)}
              className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                !selectedIncident
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-foreground/5 border-border/50 text-foreground/50 hover:text-foreground/80'
              }`}
            >
              None
            </button>
            {TOPO_INCIDENTS.map((inc) => (
              <button
                key={inc.id}
                onClick={() => handleSelectIncident(inc)}
                className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  selectedIncident?.id === inc.id
                    ? inc.severity === 'critical'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                    : 'bg-foreground/5 border-border/50 text-foreground/50 hover:text-foreground/80'
                }`}
              >
                {inc.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* ── Topology SVG map ─────────────────────────── */}
            <div className="lg:col-span-3 bg-primary/30 border border-border/60 rounded-xl overflow-hidden relative">
              <svg viewBox="0 0 640 490" className="w-full h-auto bg-[#0a0a12]" style={{ minHeight: 340 }}>
                <text x="320" y="22" textAnchor="middle" className="text-[9px] font-mono font-bold fill-foreground/30">
                  NETWORK TOPOLOGY — THREAT LANDSCAPE MAP
                </text>

                {TOPO_EDGES.map((edge, i) => {
                  const from = TOPO_NODES.find((n) => n.id === edge.from);
                  const to = TOPO_NODES.find((n) => n.id === edge.to);
                  if (!from || !to) return null;
                  const isAffected = affectedNodeIds.includes(edge.from) || affectedNodeIds.includes(edge.to);
                  const isTargeted = selectedNode?.id === edge.from || selectedNode?.id === edge.to;
                  return (
                    <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke={isTargeted && isAffected ? '#f97316' : isAffected ? '#ef444480' : 'rgb(255 255 255 / 0.08)'}
                      strokeWidth={isTargeted && isAffected ? 2 : isAffected ? 1.5 : 0.8}
                      className="transition-all duration-500" />
                  );
                })}

                {selectedNode && (
                  <>
                    <circle cx={selectedNode.x} cy={selectedNode.y} r={selectedIncident?.severity === 'critical' ? 50 : 35} fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.3" className="animate-blast-pulse" />
                    <circle cx={selectedNode.x} cy={selectedNode.y} r={selectedIncident?.severity === 'critical' ? 40 : 28} fill="none" stroke="#ef444480" strokeWidth="1" opacity="0.5" className="animate-blast-pulse" style={{ animationDelay: '0.4s' }} />
                    <circle cx={selectedNode.x} cy={selectedNode.y} r={selectedIncident?.severity === 'critical' ? 30 : 20} fill="none" stroke="#ef444430" strokeWidth="1" opacity="0.7" className="animate-blast-pulse" style={{ animationDelay: '0.8s' }} />
                  </>
                )}

                {TOPO_NODES.map((node) => {
                  const isTarget = selectedNode?.id === node.id;
                  const isAffected = affectedNodeIds.includes(node.id);
                  const isDirectNeighbor = selectedIncident
                    ? TOPO_EDGES.some((e) => (e.from === selectedIncident.nodeId && e.to === node.id) || (e.to === selectedIncident.nodeId && e.from === node.id))
                    : false;
                  const fillColor = isTarget ? '#ef4444' : isAffected ? '#f97316' : TYPE_COLORS[node.type] ?? '#6b7280';
                  const glowFilter = isTarget ? 'drop-shadow(0 0 6px rgba(239,68,68,0.6))' : isAffected ? 'drop-shadow(0 0 4px rgba(249,115,22,0.4))' : 'none';

                  return (
                    <g key={node.id} className="transition-all duration-300">
                      {node.type === 'router' ? (
                        <polygon points={`${node.x},${node.y - 10} ${node.x + 10},${node.y} ${node.x},${node.y + 10} ${node.x - 10},${node.y}`} fill={fillColor} fillOpacity={isTarget ? 0.9 : isAffected ? 0.7 : 0.5} stroke={fillColor} strokeWidth={1.5} style={{ filter: glowFilter }} />
                      ) : node.type === 'mainframe' ? (
                        <rect x={node.x - 11} y={node.y - 9} width={22} height={18} rx={2} fill={fillColor} fillOpacity={isTarget ? 0.9 : isAffected ? 0.7 : 0.5} stroke={fillColor} strokeWidth={1.5} style={{ filter: glowFilter }} />
                      ) : (
                        <circle cx={node.x} cy={node.y} r={7} fill={fillColor} fillOpacity={isTarget ? 0.9 : isAffected ? 0.7 : 0.5} stroke={fillColor} strokeWidth={1.5} style={{ filter: glowFilter }} />
                      )}
                      <text x={node.x} y={node.y + 20} textAnchor="middle" className={`text-[8px] font-mono transition-all duration-300 ${isTarget ? 'fill-rose-300 font-bold' : isAffected ? 'fill-orange-300 font-semibold' : 'fill-foreground/50'}`}>
                        {node.label}
                      </text>
                      {isDirectNeighbor && !isTarget && (
                        <text x={node.x + 12} y={node.y - 4} textAnchor="middle" className="fill-rose-400 text-[6px] font-bold">⚠</text>
                      )}
                    </g>
                  );
                })}
              </svg>
              <style>{`
                @keyframes blast-pulse {
                  0%, 100% { opacity: 0.6; }
                  50% { opacity: 0.2; }
                }
                .animate-blast-pulse {
                  animation: blast-pulse 2s ease-in-out infinite;
                }
              `}</style>
            </div>

            {/* ── Blast Radius Info Panel ─────────────────── */}
            <div className="bg-secondary border border-border/60 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-rose-400" />
                <h3 className="text-xs font-heading font-bold text-foreground uppercase tracking-wider">Blast Radius</h3>
              </div>

              {!selectedIncident ? (
                <div className="flex flex-col items-center justify-center h-32 text-foreground/40 text-[11px] font-mono text-center space-y-2">
                  <Radar className="w-8 h-8 opacity-30" />
                  <span>Select an incident</span>
                  <span className="text-[9px] text-foreground/20">to view threat spread</span>
                </div>
              ) : (
                <>
                  <div className="bg-black/40 border border-rose-500/30 rounded-lg p-3">
                    <span className="text-[9px] font-mono text-foreground/40 uppercase tracking-wider block mb-1">Compromised Node</span>
                    <p className="text-xs font-heading font-bold text-rose-400">{selectedNode?.label ?? 'Unknown'}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${selectedIncident.severity === 'critical' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-orange-500/10 border-orange-500/30 text-orange-400'}`}>
                        {selectedIncident.severity.toUpperCase()}
                      </span>
                      <span className="text-[9px] font-mono text-foreground/40">{selectedIncident.label}</span>
                    </div>
                  </div>

                  <div className="bg-black/40 border border-border/50 rounded-lg p-3">
                    <span className="text-[9px] font-mono text-foreground/40 uppercase tracking-wider block mb-1">Adjacent Vulnerable Nodes at Risk</span>
                    <p className="text-2xl font-heading font-bold text-orange-400">{affectedNodeIds.length}</p>
                    <p className="text-[10px] font-mono text-foreground/50 mt-0.5">{selectedIncident.severity === 'critical' ? 'Critical — 2-hop spread' : 'High — direct neighbors'}</p>
                  </div>

                  <div className="bg-black/40 border border-border/50 rounded-lg p-3">
                    <span className="text-[9px] font-mono text-foreground/40 uppercase tracking-wider block mb-1">Affected Systems</span>
                    <ul className="space-y-1">
                      {affectedNodeIds.length === 0 ? (
                        <li className="text-[10px] font-mono text-foreground/30">None</li>
                      ) : (
                        affectedNodeIds.map((nid) => {
                          const node = TOPO_NODES.find((n) => n.id === nid);
                          if (!node) return null;
                          return (
                            <li key={nid} className="flex items-center gap-2 text-[10px] font-mono text-foreground/70">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[node.type] ?? '#6b7280' }} />
                              <span className="truncate">{node.label}</span>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ══════════════════════════════════════════════════
          Footer
         ══════════════════════════════════════════════════ */}
      <div className="px-6 py-3 border-t border-border/40 bg-background/50 shrink-0">
        <div className="flex items-center justify-between text-[9px] font-mono text-foreground/30">
          <span>DECEPTION OPS v2.0 // REAL-TIME FABRIC STREAM</span>
          <span>
            Entropy: {currentEntropy.toFixed(2)} bits{' '}
            {criticalAlertMode ? '⚡ CRITICAL' : isEntropyHigh ? '⚠ ANOMALY' : ''}
            {' | '}
            Decoys: {Object.values(activeDecoys).filter(Boolean).length} active
            {' | '}
            Cache: {feed.length} alerts
          </span>
        </div>
      </div>
    </div>
  );
}

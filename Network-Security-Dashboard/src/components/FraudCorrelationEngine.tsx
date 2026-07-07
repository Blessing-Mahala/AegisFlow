import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  Gauge,
  AlertTriangle,
  Skull,
  Shield,
  Zap,
  Radio,
  Globe,
  Fingerprint,
  ArrowRight,
  Ban,
  Lock,
  CheckCircle,
  Cpu,
  Database,
  Network,
  Terminal,
  TrendingUp,
  Clock,
  Hash,
  MapPin,
  Target,
  Play,
  Users,
  BarChart3,
  Sigma,
  Brain,
} from 'lucide-react';
import { UEBAEngine, createFinancialUEBA, seedUEBAEngine } from '../lib/uebaEngine';
import type { EntityProfile, AnomalyEvent, MetricName } from '../lib/uebaEngine';
import { METRIC_LABELS, METRIC_UNITS } from '../lib/uebaEngine';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface TransactionEntry {
  id: number;
  hash: string;
  srcIp: string;
  geoNode: string;
  attackType: string;
  riskScore: number;
  isMalicious: boolean;
  neutralized: boolean;
  timestamp: number;
}

interface TelemetryState {
  throughput: number;       // transactions per second (450k - 1.2M)
  latency: number;          // milliseconds (0.6 - 1.2)
  illicitFlags: number;     // running counter
}

type DeployPhase = 'idle' | 'deploying' | 'success';

/* ------------------------------------------------------------------ */
/*  Attack & IP data pools                                             */
/* ------------------------------------------------------------------ */

const ATTACK_VECTORS = [
  'Illicit Funds Drainage Attempt',
  'Scam Campaign Relay',
  'API Key Extraction Spike',
  'Social Engineering Payload Injection',
  'Crypto Wallet Phishing Beacon',
  'Server Brute-Force Intelligence Gathering',
  'Unauthorized RPC Call Exploitation',
  'DDoS Financial Service Disruption',
  'Data Exfiltration via DNS Tunneling',
  'Credential Stuffing Attack Surge',
  'Zero-Day Exploit Probe',
  'Reverse Shell Payload Injection',
  'Privilege Escalation via RCE',
  'Supply Chain Tainted Query',
  'Cross-Site Scripting Financial Scrape',
];

const GEO_NODES = [
  { ip: '185.220.101.4', geo: 'Tor Exit Node - DE' },
  { ip: '91.121.87.34', geo: 'VPS Hosting - FR' },
  { ip: '45.33.32.156', geo: 'Scanning Node - US' },
  { ip: '103.235.46.92', geo: 'Proxy Relay - CN' },
  { ip: '5.255.88.100', geo: 'Botnet C2 - RU' },
  { ip: '194.26.29.187', geo: 'SOCKS Proxy - NL' },
  { ip: '23.129.64.210', geo: 'Residential Proxy - US' },
  { ip: '156.146.56.45', geo: 'VPN Exit - CH' },
  { ip: '45.155.205.233', geo: 'Bulletproof Host - NL' },
  { ip: '102.165.16.100', geo: 'Darknet Relay - ZA' },
  { ip: '31.171.152.54', geo: 'Mobile Proxy - IQ' },
  { ip: '189.90.254.12', geo: 'Hijacked Router - BR' },
];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateTransaction(id: number, malicious = false): TransactionEntry {
  const geo = randomPick(GEO_NODES);
  return {
    id,
    hash: `TXN-${String(9000 + Math.floor(Math.random() * 1000))}-AMD`,
    srcIp: geo.ip,
    geoNode: geo.geo,
    attackType: randomPick(ATTACK_VECTORS),
    riskScore: malicious ? randomBetween(85, 99.9) : randomBetween(5, 35),
    isMalicious: malicious,
    neutralized: false,
    timestamp: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/*  AI Analyst plain-English explanations                             */
/* ------------------------------------------------------------------ */

function generateAiExplanation(tx: TransactionEntry): string {
  const intros = [
    'Hey analyst, ',
    'Attention required: ',
    'Flagging this immediately: ',
    'Urgent pattern detected: ',
  ];
  const intros2 = [
    'A remote host is trying to ',
    'An unauthorized node is attempting to ',
    'Suspicious traffic indicates an attempt to ',
    'Alert — a malicious endpoint is trying to ',
  ];
  const actions: Record<string, string> = {
    'Illicit Funds Drainage Attempt': 'execute a fast-velocity draining exploit across our payment server cluster. This looks like a coordinated phishing or wallet scam trail.',
    'Scam Campaign Relay': 'relay scam campaign payloads through our internal mail gateways. The source IP matches known social engineering infrastructure.',
    'API Key Extraction Spike': 'perform rapid API key enumeration against our auth gateway. This resembles an automated credential harvesting bot.',
    'Social Engineering Payload Injection': 'inject social engineering payloads into our customer support ticket system. The vector matches recent Vishing campaigns.',
    'Crypto Wallet Phishing Beacon': 'establish a phishing beacon to our crypto wallet infrastructure. The packet signature matches known drainer toolkits.',
    'Server Brute-Force Intelligence Gathering': 'conduct brute-force reconnaissance on our server fleet. Multiple authentication failures detected across 12 nodes.',
    'Unauthorized RPC Call Exploitation': 'send unauthorized RPC calls to our blockchain validator nodes. This is a known front-running exploit pattern.',
    'DDoS Financial Service Disruption': 'overwhelm our financial transaction gateway with a volumetric DDoS flood. Upstream BGP metrics confirm anomolous traffic.',
    'Data Exfiltration via DNS Tunneling': 'exfiltrate sensitive financial data via DNS tunneling. Query patterns match known data theft frameworks.',
    'Credential Stuffing Attack Surge': 'execute a credential stuffing campaign against our corporate VPN endpoint. 15,000+ login attempts in under 90 seconds.',
    'Zero-Day Exploit Probe': 'probe our core banking stack for zero-day vulnerabilities. The payload structure is unfamiliar — high probability of novel exploit.',
    'Reverse Shell Payload Injection': 'inject a reverse shell payload into our transaction processing daemon. Immediate isolation recommended.',
    'Privilege Escalation via RCE': 'escalate privileges via a remote code execution path in our payment API. The session token was compromised.',
    'Supply Chain Tainted Query': 'send tainted queries through our third-party vendor API gateway. The source IP belongs to an untrusted partner network.',
    'Cross-Site Scripting Financial Scrape': 'inject XSS payloads into our client-facing dashboard to scrape financial data in real time from authenticated sessions.',
  };
  const closing = [
    ' Automated countermeasures are standing by.',
    ' Manual override recommended for immediate containment.',
    ' The system can auto-mitigate this vector.',
    ' This requires escalation to the senior SOC team.',
    ' Pending your authorization to deploy a drop rule.',
  ];
  const action = actions[tx.attackType] ?? 'perform an unauthorized operation against our infrastructure that requires immediate mitigation.';
  return `${randomPick(intros)}${randomPick(intros2)}${action}${randomPick(closing)}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function FraudCorrelationEngine() {
  /* ── Core state ── */
  const [telemetry, setTelemetry] = useState<TelemetryState>({
    throughput: 780_000,
    latency: 0.82,
    illicitFlags: 0,
  });
  const [transactions, setTransactions] = useState<TransactionEntry[]>([]);
  const [aiExplanation, setAiExplanation] = useState<string>(
    'Awaiting incoming transaction data for behavioral analysis...'
  );
  const [deployPhase, setDeployPhase] = useState<DeployPhase>('idle');
  const [activeThreat, setActiveThreat] = useState<TransactionEntry | null>(null);

  /* ── UEBA Engine ────────────────────────────────────────── */
  const uebaRef = useRef<UEBAEngine>(createFinancialUEBA());
  const [uebaEntities, setUebaEntities] = useState<EntityProfile[]>([]);
  const [uebaAnomalies, setUebaAnomalies] = useState<AnomalyEvent[]>([]);
  const [uebaStats, setUebaStats] = useState({ totalEntities: 0, totalObservations: 0, totalAnomalies: 0, normalCount: 0, suspiciousCount: 0, anomalousCount: 0, criticalCount: 0 });
  const [uebaTab, setUebaTab] = useState<'entities' | 'anomalies'>('entities');

  /* ── Refs ── */
  const txCounter = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const deployTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Auto-scroll stream ── */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transactions]);

  /* ── Telemetry update interval (every 600ms) ── */
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetry((prev) => ({
        throughput: randomBetween(450_000, 1_200_000),
        latency: randomBetween(0.6, 1.2),
        illicitFlags: prev.illicitFlags + (Math.random() > 0.6 ? 1 : 0),
      }));
    }, 600);
    return () => clearInterval(interval);
  }, []);

  /* ── Transaction stream (new entry every 800-2200ms) ── */
  useEffect(() => {
    const scheduleNext = () => {
      const delay = randomBetween(800, 2200);
      const timer = setTimeout(() => {
        const isMalicious = Math.random() > 0.55;
        const tx = generateTransaction(++txCounter.current, isMalicious);

        // Feed transaction into UEBA engine
        const ueba = uebaRef.current;
        // Use srcIp as entity ID for IP-based behavioral profiling
        const ipEntityId = `ip-${tx.srcIp}`;
        ueba.recordObservation(
          ipEntityId, tx.srcIp, 'ip_address',
          'transaction_volume', 50 + Math.random() * 200, Date.now(),
        );
        ueba.recordObservation(
          ipEntityId, tx.srcIp, 'ip_address',
          'api_call_rate', 20 + Math.random() * 60, Date.now(),
        );

        if (isMalicious) {
          // Record anomalous metrics when a malicious transaction is detected
          ueba.recordObservation(
            ipEntityId, tx.srcIp, 'ip_address',
            'failed_login_rate', 30 + Math.random() * 50, Date.now(),
          );
          ueba.recordObservation(
            ipEntityId, tx.srcIp, 'ip_address',
            'data_transfer', 150 + Math.random() * 300, Date.now(),
          );
        } else {
          ueba.recordObservation(
            ipEntityId, tx.srcIp, 'ip_address',
            'data_transfer', 5 + Math.random() * 30, Date.now(),
          );
        }

        // Update UEBA display state periodically (every 5 transactions)
        if (txCounter.current % 5 === 0) {
          setUebaEntities(ueba.getEntitiesByRisk());
          setUebaAnomalies(ueba.getRecentAnomalies());
          setUebaStats(ueba.getStats());
        }

        setTransactions((prev) => {
          const next = [...prev, tx];
          // Cap at 80 entries
          return next.length > 80 ? next.slice(-60) : next;
        });

        // If malicious, update AI explanation
        if (isMalicious) {
          setActiveThreat(tx);
          setAiExplanation(generateAiExplanation(tx));
          setTelemetry((prev) => ({
            ...prev,
            illicitFlags: prev.illicitFlags + 1,
          }));
        }

        scheduleNext();
      }, delay);
      deployTimerRef.current = timer;
    };

    // Seed initial transactions
    const ueba = uebaRef.current;
    seedUEBAEngine(ueba);
    setUebaEntities(ueba.getEntitiesByRisk());
    setUebaAnomalies(ueba.getRecentAnomalies());
    setUebaStats(ueba.getStats());

    const seed = Array.from({ length: 8 }, (_, i) => {
      const isMal = i < 4 ? Math.random() > 0.4 : false;
      const tx = generateTransaction(++txCounter.current, isMal);
      if (isMal && i === 0) {
        setActiveThreat(tx);
        setAiExplanation(generateAiExplanation(tx));
      }
      return tx;
    });
    setTransactions(seed);
    setTelemetry((prev) => ({
      ...prev,
      illicitFlags: prev.illicitFlags + seed.filter((t) => t.isMalicious).length,
    }));

    scheduleNext();
    return () => {
      if (deployTimerRef.current) clearTimeout(deployTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Deploy handler ── */
  const handleDeploy = useCallback(() => {
    if (deployPhase !== 'idle') return;
    setDeployPhase('deploying');

    // Mark all malicious entries as neutralized
    setTimeout(() => {
      setTransactions((prev) =>
        prev.map((tx) => (tx.isMalicious ? { ...tx, neutralized: true } : tx))
      );
      setDeployPhase('success');
      setAiExplanation(
        '✅ All active threats have been neutralized. The automated backend drop rule is now live across all edge routers and payment gateways. The compromised nodes are frozen and quarantined.'
      );
      setActiveThreat(null);

      // Reset deploy after 8 seconds
      setTimeout(() => {
        setDeployPhase('idle');
        setAiExplanation('Monitoring fresh transaction streams for anomalous behavior...');
      }, 8000);
    }, 1500);
  }, [deployPhase]);

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => {
      if (deployTimerRef.current) clearTimeout(deployTimerRef.current);
    };
  }, []);

  /* ── Format helpers ── */
  const formatTPS = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toFixed(0);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  };

  /* ── Risk color ── */
  const riskColor = (score: number) => {
    if (score >= 90) return 'text-red-400';
    if (score >= 70) return 'text-amber-400';
    if (score >= 40) return 'text-yellow-400';
    return 'text-foreground/40';
  };

  const riskBar = (score: number) => {
    if (score >= 80) return 'bg-red-500';
    if (score >= 50) return 'bg-amber-500';
    return 'bg-foreground/20';
  };

  /* ── Render ── */
  return (
    <div className="mt-6 border border-border rounded-xl overflow-hidden bg-[#0a0e17]" style={{ boxShadow: '0 0 40px rgba(0,0,0,0.6)' }}>
      {/* ══════════════════════════════════════════════════════════════
          HEADER
         ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#0d111e] border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Database className="w-5 h-5 text-amber-400" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-ping opacity-75" />
          </div>
          <div>
            <h2 className="text-sm font-heading font-bold text-foreground flex items-center gap-2">
              REAL-TIME FINANCIAL FRAUD CORRELATION & BIG DATA INGESTION ENGINE
              <span className="text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                LIVE
              </span>
            </h2>
            <p className="text-[10px] font-mono text-foreground/40">
              enterprise-grade behavioral heuristics · big-data packet stream analysis · zero-trust fraud verification
            </p>
          </div>
        </div>
        {/* Live indicator */}
        <div className="flex items-center gap-2 text-[10px] font-mono text-accent/60">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
          </span>
          STREAMING LIVE
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 1: BIG DATA TELEMETRY OVERVIEW CARDS
         ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-[#080c15] border-b border-border/40">
        {/* Card 1: Throughput */}
        <div className="bg-secondary/70 border border-border/50 rounded-lg p-4 hover:border-accent/20 transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-accent" />
            <span className="text-[10px] font-mono text-foreground/40 uppercase tracking-wider">
              Ingestion Throughput Rate
            </span>
          </div>
          <div className="flex items-end gap-1.5">
            <span className="text-2xl font-heading font-bold text-foreground">
              {formatTPS(telemetry.throughput)}
            </span>
            <span className="text-[10px] font-mono text-foreground/40 mb-1">TPS</span>
          </div>
          {/* Spark bar */}
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${(telemetry.throughput / 1_400_000) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[9px] font-mono text-foreground/30">
            <span>450K</span>
            <span>1.2M</span>
          </div>
        </div>

        {/* Card 2: Latency */}
        <div className="bg-secondary/70 border border-border/50 rounded-lg p-4 hover:border-accent/20 transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] font-mono text-foreground/40 uppercase tracking-wider">
              Fraud Verification Latency
            </span>
          </div>
          <div className="flex items-end gap-1.5">
            <span className="text-2xl font-heading font-bold text-foreground">
              {telemetry.latency.toFixed(2)}
            </span>
            <span className="text-[10px] font-mono text-foreground/40 mb-1">ms</span>
          </div>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 rounded-full transition-all duration-300"
              style={{ width: `${((1.2 - telemetry.latency) / 0.6) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[9px] font-mono text-foreground/30">
            <span>0.6ms</span>
            <span className="text-cyan-400/60">sub-ms ⚡</span>
          </div>
        </div>

        {/* Card 3: Illicit Flags */}
        <div className="bg-secondary/70 border border-border/50 rounded-lg p-4 hover:border-accent/20 transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <Skull className="w-4 h-4 text-destructive" />
            <span className="text-[10px] font-mono text-foreground/40 uppercase tracking-wider">
              Active Illicit Activity Flags
            </span>
          </div>
          <div className="flex items-end gap-1.5">
            <span className="text-2xl font-heading font-bold text-destructive">
              {telemetry.illicitFlags}
            </span>
            <span className="text-[10px] font-mono text-foreground/40 mb-1">flagged</span>
          </div>
          {/* Pulse indicator */}
          <div className="mt-2 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
            </span>
            <span className="text-[10px] font-mono text-destructive/70 animate-pulse">
              {telemetry.illicitFlags > 0
                ? `${telemetry.illicitFlags} active threats requiring mitigation`
                : 'No active threats'}
            </span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 2: FRAUD ASSESSOR STREAM + AI SIDECARD
         ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row">
        {/* ── Left: Transaction Stream ── */}
        <div className="flex-1 min-w-0">
          {/* Stream header */}
          <div className="flex items-center gap-2 px-4 py-2 bg-[#080c15] border-b border-border/30">
            <Radio className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-mono text-foreground/30">
              malicious_transaction_stream.log — REAL-TIME
            </span>
            <span className="ml-auto text-[10px] font-mono text-foreground/20">
              {transactions.length} entries
            </span>
          </div>

          {/* Stream body */}
          <div
            ref={scrollRef}
            className="h-72 lg:h-80 overflow-y-auto font-mono text-[11px] leading-relaxed"
            style={{ backgroundColor: '#060a12', scrollBehavior: 'smooth' }}
          >
            {transactions.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <span className="text-foreground/20 text-[10px] animate-pulse">Bootstrapping big-data ingestion pipeline...</span>
              </div>
            )}
            {transactions.map((tx, idx) => (
              <div
                key={tx.id}
                className={`flex items-start gap-1.5 px-3 py-1.5 border-b border-border/10 transition-all duration-300 ${
                  tx.isMalicious && !tx.neutralized
                    ? 'bg-red-500/10 border-l-2 border-l-red-500'
                    : tx.neutralized
                    ? 'bg-accent/5 border-l-2 border-l-accent opacity-60'
                    : 'hover:bg-white/[0.02]'
                }`}
                style={
                  tx.isMalicious && !tx.neutralized
                    ? { backgroundColor: 'rgba(239,68,68,0.08)', boxShadow: 'inset 0 0 20px rgba(239,68,68,0.05)' }
                    : {}
                }
              >
                {/* Entry number */}
                <span className="text-foreground/20 shrink-0 w-6 text-right text-[9px] pt-0.5">
                  {String(idx + 1).padStart(2, '0')}
                </span>

                {/* Malicious indicator */}
                {tx.isMalicious && !tx.neutralized && (
                  <Skull className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
                )}
                {tx.neutralized && (
                  <CheckCircle className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                )}
                {!tx.isMalicious && (
                  <span className="w-3 h-3 shrink-0 flex items-center justify-center text-[9px] text-foreground/20">·</span>
                )}

                {/* Timestamp */}
                <span className="text-foreground/30 shrink-0 text-[9px] pt-0.5 w-14">
                  {formatTime(tx.timestamp).slice(0, 8)}
                </span>

                {/* TXN Hash */}
                <span className={`shrink-0 font-semibold text-[10px] w-28 truncate ${
                  tx.isMalicious && !tx.neutralized ? 'text-red-300' : 'text-foreground/60'
                }`}>
                  {tx.hash}
                </span>

                {/* Arrow */}
                <ArrowRight className={`w-2.5 h-2.5 shrink-0 mt-0.5 ${
                  tx.isMalicious && !tx.neutralized ? 'text-red-400' : 'text-foreground/20'
                }`} />

                {/* Source IP */}
                <span className={`shrink-0 w-28 truncate text-[10px] ${
                  tx.isMalicious && !tx.neutralized ? 'text-red-300' : 'text-foreground/50'
                }`}>
                  {tx.srcIp}
                </span>

                {/* Geo */}
                <span className={`shrink-0 w-28 truncate text-[9px] ${
                  tx.isMalicious && !tx.neutralized ? 'text-red-400/60' : 'text-foreground/30'
                }`}>
                  {tx.geoNode}
                </span>

                {/* Attack type */}
                <span className={`flex-1 min-w-0 truncate text-[10px] ${
                  tx.isMalicious && !tx.neutralized ? 'text-red-200 font-medium' : 'text-foreground/40'
                }`}>
                  {tx.attackType}
                </span>

                {/* Risk score bar */}
                <div className="shrink-0 flex items-center gap-1.5 w-20">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${riskBar(tx.riskScore)}`}
                      style={{ width: `${tx.riskScore}%` }}
                    />
                  </div>
                  <span className={`text-[9px] font-semibold w-9 text-right ${riskColor(tx.riskScore)}`}>
                    {tx.riskScore.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: AI Risk Breakdown Sidecard ── */}
        <div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-border/40 bg-[#080c15] flex flex-col">
          {/* Sidecard header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-mono text-foreground/40 uppercase tracking-wider">
              AI Financial Risk Breakdown
            </span>
            {activeThreat && deployPhase === 'idle' && (
              <span className="ml-auto w-2 h-2 rounded-full bg-destructive animate-ping" />
            )}
          </div>

          {/* Sidecard body */}
          <div className="flex-1 p-4 flex flex-col gap-4">
            {/* Risk indicator */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-foreground/40">Current Threat Level</span>
              <span className={`text-[10px] font-heading font-bold px-2 py-0.5 rounded ${
                activeThreat && deployPhase === 'idle'
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : deployPhase === 'success'
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'bg-muted text-foreground/40 border border-border/50'
              }`}>
                {activeThreat && deployPhase === 'idle'
                  ? 'CRITICAL'
                  : deployPhase === 'success'
                  ? 'NEUTRALIZED'
                  : 'MONITORING'}
              </span>
            </div>

            {/* AI Explanation panel */}
            <div
              className="flex-1 bg-[#060a12] border border-border/30 rounded-lg p-3 overflow-y-auto"
              style={{ minHeight: '100px' }}
            >
              <div className="flex items-start gap-2">
                <div className="relative mt-0.5">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                </div>
                <div>
                  <p className="text-[10px] font-mono text-amber-400/70 mb-1.5">AI ANALYST :: v3.2</p>
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    {aiExplanation}
                  </p>
                </div>
              </div>
            </div>

            {/* Active threat details */}
            {activeThreat && deployPhase === 'idle' && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 space-y-1.5">
                <p className="text-[9px] font-mono text-red-400/70 uppercase tracking-wider">Latest Malicious Session</p>
                <div className="flex items-center gap-2 text-xs">
                  <Hash className="w-3 h-3 text-red-400/60" />
                  <span className="font-mono text-red-300 text-[10px]">{activeThreat.hash}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <MapPin className="w-3 h-3 text-red-400/60" />
                  <span className="font-mono text-red-300/80 text-[10px]">{activeThreat.srcIp} — {activeThreat.geoNode}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Target className="w-3 h-3 text-red-400/60" />
                  <span className="font-mono text-red-300/80 text-[10px]">{activeThreat.riskScore.toFixed(1)}% risk score</span>
                </div>
              </div>
            )}

            {/* Deploy button */}
            <button
              onClick={handleDeploy}
              disabled={!activeThreat || deployPhase !== 'idle'}
              className={`relative w-full px-5 py-3.5 rounded-xl font-heading font-bold text-xs tracking-widest uppercase transition-all duration-300 cursor-pointer
                ${
                  !activeThreat || deployPhase !== 'idle'
                    ? 'bg-muted text-foreground/20 border border-border/30 cursor-not-allowed'
                    : 'bg-gradient-to-r from-red-600 to-amber-600 text-white hover:brightness-110 active:scale-[0.97]'
                }
              `}
              style={
                activeThreat && deployPhase === 'idle'
                  ? {
                      boxShadow: '0 0 30px rgba(239,68,68,0.3), 0 0 60px rgba(239,68,68,0.1), inset 0 0 20px rgba(239,68,68,0.1)',
                      textShadow: '0 0 10px rgba(0,0,0,0.3)',
                    }
                  : deployPhase === 'success'
                  ? {
                      boxShadow: '0 0 30px rgba(34,197,94,0.2)',
                    }
                  : {}
              }
            >
              {deployPhase === 'deploying' ? (
                <span className="flex items-center justify-center gap-2">
                  <Zap className="w-4 h-4 animate-pulse" />
                  DEPLOYING DROP RULES...
                </span>
              ) : deployPhase === 'success' ? (
                <span className="flex items-center justify-center gap-2 text-accent">
                  <CheckCircle className="w-4 h-4" />
                  NODE FROZEN & QUARANTINED ✓
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Ban className="w-4 h-4" />
                  AUTHORIZE AUTOMATED BACKEND DROP RULE &amp; FREEZE NODE
                </span>
              )}
            </button>

            {deployPhase === 'success' && (
              <p className="text-[10px] font-mono text-accent/70 text-center animate-pulse">
                ✅ All active threats neutralized. Backend drop rule live across all edge routers.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 3: ENDPOINT DISCOVERY & ZERO-TRUST INTEGRATION
         ══════════════════════════════════════════════════════════════ */}
      <div className="border-t border-border/40 bg-[#080c15] p-4">
        <div className="flex items-start gap-4">
          <div className="shrink-0 flex items-center gap-2">
            <Network className="w-4 h-4 text-accent" />
            <span className="text-[10px] font-mono text-foreground/40 uppercase tracking-wider">
              Automated Endpoint Discovery
            </span>
          </div>

          {/* Simulated rogue device feed */}
          <div className="flex-1 flex flex-wrap gap-2">
            {[
              { ip: '10.0.0.47', mac: 'C4:5B:BE:22:19:41', subnet: '10.0.0.0/24', vendor: 'Unknown', status: 'rogue' as const },
              { ip: '10.0.1.12', mac: '00:1A:2B:3C:4D:5E', subnet: '10.0.1.0/24', vendor: 'Cisco Meraki', status: 'compromised' as const },
              { ip: '10.0.0.1', mac: 'AC:CD:19:04:7B:32', subnet: '10.0.0.0/24', vendor: 'Ubiquiti', status: 'verified' as const },
              { ip: '10.0.2.88', mac: 'D4:6E:0E:AA:BB:CC', subnet: '10.0.2.0/24', vendor: 'Unknown', status: 'rogue' as const },
              { ip: '10.0.1.200', mac: 'F8:32:E4:DD:EE:FF', subnet: '10.0.1.0/24', vendor: 'Fortinet', status: 'verified' as const },
            ].map((device) => (
              <div
                key={device.ip}
                className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-mono transition-all duration-200 ${
                  device.status === 'rogue'
                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                    : device.status === 'compromised'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-accent/5 border-border/40 text-foreground/50'
                }`}
                style={
                  device.status === 'rogue'
                    ? { boxShadow: '0 0 12px rgba(239,68,68,0.1)' }
                    : device.status === 'compromised'
                    ? { boxShadow: '0 0 12px rgba(245,158,11,0.1)' }
                    : {}
                }
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    device.status === 'rogue' ? 'bg-red-500 animate-pulse' :
                    device.status === 'compromised' ? 'bg-amber-500 animate-pulse' :
                    'bg-accent'
                  }`} />
                  <span className="font-semibold">{device.ip}</span>
                </div>
                <div className="text-[8px] text-foreground/40 mt-0.5">
                  {device.mac} · {device.subnet}
                </div>
                <div className="text-[9px] mt-0.5">
                  {device.status === 'rogue' ? (
                    <span className="text-red-400/70">⚠ ROGUE DEVICE — ZERO-TRUST DENIED</span>
                  ) : device.status === 'compromised' ? (
                    <span className="text-amber-400/70">⚠ COMPROMISED — QUARANTINE PENDING</span>
                  ) : (
                    <span className="text-accent/50">✓ TRUSTED — 802.1X VERIFIED</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Link to Scanner */}
          <a
            href="/scanner"
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-accent/10 border border-accent/20 rounded-lg text-[10px] font-mono text-accent hover:bg-accent/20 transition-all duration-150 cursor-pointer"
            style={{ textShadow: '0 0 8px rgba(34,197,94,0.3)' }}
          >
            <Fingerprint className="w-3 h-3" />
            SCAN NETWORK
            <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 4: UEBA — USER & ENTITY BEHAVIOR ANALYTICS
         ══════════════════════════════════════════════════════════════ */}
      <div className="border-t border-border/40 bg-[#080c15]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-400" />
            <span className="text-[10px] font-mono text-foreground/40 uppercase tracking-wider">
              UEBA — User & Entity Behavior Analytics Engine
            </span>
            <span className="text-[8px] font-mono text-foreground/30 bg-foreground/5 px-1.5 py-0.5 rounded border border-border/30">
              {uebaStats.totalObservations} obs
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Risk-level summary dots */}
            <span className="flex items-center gap-1 text-[8px] font-mono">
              <span className="w-2 h-2 rounded-full bg-accent" /> {uebaStats.normalCount}
            </span>
            <span className="flex items-center gap-1 text-[8px] font-mono">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> {uebaStats.suspiciousCount}
            </span>
            <span className="flex items-center gap-1 text-[8px] font-mono">
              <span className="w-2 h-2 rounded-full bg-orange-500" /> {uebaStats.anomalousCount}
            </span>
            <span className="flex items-center gap-1 text-[8px] font-mono">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> {uebaStats.criticalCount}
            </span>
            {/* Tab toggle */}
            <div className="flex items-center bg-muted rounded-lg p-0.5 ml-2">
              <button onClick={() => setUebaTab('entities')}
                className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  uebaTab === 'entities' ? 'bg-accent/20 text-accent' : 'text-foreground/30 hover:text-foreground/60'
                }`}>Entities</button>
              <button onClick={() => setUebaTab('anomalies')}
                className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  uebaTab === 'anomalies' ? 'bg-accent/20 text-accent' : 'text-foreground/30 hover:text-foreground/60'
                }`}>Anomalies</button>
            </div>
          </div>
        </div>

        {uebaTab === 'entities' ? (
          /* ── Entity risk table ── */
          <div className="p-4 space-y-2">
            {uebaEntities.length === 0 && (
              <p className="text-[10px] font-mono text-foreground/30 text-center py-4">No entities profiled yet — waiting for observations...</p>
            )}
            {uebaEntities.slice(0, 10).map((entity) => (
              <div key={entity.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border text-[9px] font-mono transition-all duration-200"
                style={{
                  borderColor: entity.riskLevel === 'critical' ? 'rgba(244,63,94,0.3)' :
                    entity.riskLevel === 'anomalous' ? 'rgba(249,115,22,0.3)' :
                    entity.riskLevel === 'suspicious' ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.06)',
                  backgroundColor: entity.riskLevel === 'critical' ? 'rgba(244,63,94,0.04)' :
                    entity.riskLevel === 'anomalous' ? 'rgba(249,115,22,0.04)' : 'transparent',
                }}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  entity.riskLevel === 'critical' ? 'bg-rose-500 animate-pulse' :
                  entity.riskLevel === 'anomalous' ? 'bg-orange-500' :
                  entity.riskLevel === 'suspicious' ? 'bg-amber-400' : 'bg-accent'
                }`} />
                <span className="w-28 truncate text-foreground/80 font-semibold">{entity.label}</span>
                <span className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider border ${
                  entity.riskLevel === 'critical' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
                  entity.riskLevel === 'anomalous' ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' :
                  entity.riskLevel === 'suspicious' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                  'bg-accent/10 border-accent/20 text-accent'
                }`}>{entity.riskLevel.toUpperCase()}</span>
                <span className="text-foreground/40">{entity.type === 'user' ? '👤' : entity.type === 'device' ? '📟' : '🌐'}</span>
                <div className="flex-1" />
                <span className="text-foreground/40">Score: </span>
                <span className={`font-bold ${
                  entity.overallAnomalyScore >= 3.5 ? 'text-rose-400' :
                  entity.overallAnomalyScore >= 2.5 ? 'text-orange-400' :
                  entity.overallAnomalyScore >= 1.5 ? 'text-amber-400' : 'text-accent'
                }`}>{entity.overallAnomalyScore.toFixed(2)}</span>
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden ml-2">
                  <div className={`h-full rounded-full ${
                    entity.overallAnomalyScore >= 3.5 ? 'bg-rose-500' :
                    entity.overallAnomalyScore >= 2.5 ? 'bg-orange-500' :
                    entity.overallAnomalyScore >= 1.5 ? 'bg-amber-400' : 'bg-accent'
                  }`} style={{ width: `${Math.min(entity.overallAnomalyScore / 5 * 100, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── Anomaly event log ── */
          <div className="p-4 space-y-1.5 max-h-48 overflow-y-auto">
            {uebaAnomalies.length === 0 && (
              <p className="text-[10px] font-mono text-foreground/30 text-center py-4">No anomalies detected — all entities behaving within baseline.</p>
            )}
            {uebaAnomalies.map((anomaly, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-1.5 rounded text-[9px] font-mono border-l-2"
                style={{
                  borderLeftColor: anomaly.severity === 'critical' ? '#f43f5e' :
                    anomaly.severity === 'high' ? '#f97316' :
                    anomaly.severity === 'medium' ? '#fbbf24' : '#22c55e',
                  backgroundColor: anomaly.severity === 'critical' ? 'rgba(244,63,94,0.04)' :
                    anomaly.severity === 'high' ? 'rgba(249,115,22,0.03)' : 'transparent',
                }}
              >
                <span className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${
                  anomaly.severity === 'critical' ? 'bg-rose-500 animate-pulse' :
                  anomaly.severity === 'high' ? 'bg-orange-500' :
                  anomaly.severity === 'medium' ? 'bg-amber-400' : 'bg-accent'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground/70 font-semibold">{anomaly.entityLabel}</span>
                    <span className={`px-1 rounded text-[7px] font-bold uppercase ${
                      anomaly.severity === 'critical' ? 'bg-rose-500/10 text-rose-400' :
                      anomaly.severity === 'high' ? 'bg-orange-500/10 text-orange-400' :
                      anomaly.severity === 'medium' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-accent/10 text-accent'
                    }`}>{anomaly.severity}</span>
                  </div>
                  <p className="text-[8px] text-foreground/50 mt-0.5">{anomaly.description}</p>
                </div>
                <span className="text-[8px] font-mono text-foreground/30 shrink-0">z={anomaly.zScore.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer stats */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border/30 bg-background/20">
          <span className="text-[8px] font-mono text-foreground/30">
            <Brain className="w-2.5 h-2.5 inline mr-1" />
            Welford's online algorithm · Z-score threshold: 2.5σ
          </span>
          <span className="text-[8px] font-mono text-foreground/30">
            Entities tracked: {uebaStats.totalEntities}
          </span>
          <span className="text-[8px] font-mono text-foreground/30">
            Total anomalies: {uebaStats.totalAnomalies}
          </span>
          <span className="ml-auto text-[8px] font-mono text-foreground/20 italic">
            Temporal decay: 15%/hr · Warmup: 15 obs
          </span>
        </div>
      </div>
    </div>
  );
}

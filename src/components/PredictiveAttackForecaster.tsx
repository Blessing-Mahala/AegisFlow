import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import {
  Shield,
  Radar,
  Activity,
  Wifi,
  Server,
  Smartphone,
  Monitor,
  Cpu,
  Lock,
  Unlock,
  Clock,
  AlertTriangle,
  Gauge,
  Brain,
  Sigma,
  TrendingUp,
  BarChart3,
  ThumbsUp,
  HelpCircle,
  AlertOctagon,
  Eye,
  Radio,
  FileSearch,
  Bot,
  Siren,
  ArrowRight,
  GitBranch,
  Shuffle,
  Microscope,
} from 'lucide-react';
import { BayesianForecaster, createFinancialForecaster } from '../lib/bayesianForecaster';
import type { BayesianForecast } from '../lib/bayesianForecaster';

/* ══════════════════════════════════════════════════════════════
   CONSENSUS CONFIDENCE SCORE — INDEPENDENT SIGNAL VOTING
   ══════════════════════════════════════════════════════════════ */

type Vote = 'attack' | 'benign' | 'abstain';

interface SignalVote {
  signalId: string;
  signalLabel: string;
  icon: typeof Brain;
  vote: Vote;
  confidence: number;          // 0-1 how sure the signal is of its vote
  weight: number;              // 0-1 importance weight for final consensus
  evidence: string;            // human-readable explanation
  rawValue: number;            // the raw observed value
}

type ConsensusLevel = 'critical' | 'elevated' | 'low_confidence' | 'uncertain' | 'normal';

interface ConsensusResult {
  level: ConsensusLevel;
  consensusScore: number;      // 0-100 weighted consensus %
  agreementCount: number;      // how many signals agreed on the majority vote
  totalSignals: number;
  attackingSignals: number;    // count voting 'attack'
  benignSignals: number;       // count voting 'benign'
  abstainSignals: number;      // count voting 'abstain'
  avgAttackConfidence: number; // avg confidence among attack voters
  votes: SignalVote[];
  recommendation: string;      // human action recommendation
}

/* ─── Consensus computation ─────────────────────────────── */

function computeConsensus(votes: SignalVote[]): ConsensusResult {
  const totalSignals = votes.length;
  const attacking = votes.filter((v) => v.vote === 'attack');
  const benign = votes.filter((v) => v.vote === 'benign');
  const abstain = votes.filter((v) => v.vote === 'abstain');

  const attackingSignals = attacking.length;
  const benignSignals = benign.length;
  const abstainSignals = abstain.length;

  // Weighted consensus score: how much weighted agreement toward the majority
  const totalWeight = votes.reduce((s, v) => s + v.weight, 0);
  const attackWeight = attacking.reduce((s, v) => s + v.weight * v.confidence, 0);
  const benignWeight = benign.reduce((s, v) => s + v.weight * v.confidence, 0);

  // Consensus score = higher of attack or benign weighted agreement, as a percentage
  const rawScore = totalWeight > 0
    ? (Math.max(attackWeight, benignWeight) / totalWeight) * 100
    : 0;

  // Which side has majority
  const majorityAttack = attackWeight >= benignWeight;

  // Average confidence among attack voters
  const avgAttackConfidence = attacking.length > 0
    ? attacking.reduce((s, v) => s + v.confidence, 0) / attacking.length
    : 0;

  // Determine level
  let level: ConsensusLevel;
  let recommendation: string;

  // Strong attack consensus: >= 3 signals vote attack with avg confidence > 0.7
  if (attackingSignals >= 3 && avgAttackConfidence > 0.7) {
    level = 'critical';
    recommendation = 'Multiple independent signals corroborate an active attack vector. Initiate automated mitigation and notify SOC lead immediately.';
  }
  // Moderate attack: 2 signals vote attack with confidence > 0.5
  else if (attackingSignals >= 2 && avgAttackConfidence > 0.5) {
    level = 'elevated';
    recommendation = 'Partial corroboration across signals. Escalate to Tier-2 analyst for manual correlation and possible containment.';
  }
  // Weak attack / low confidence: 1 signal or low confidence
  else if (attackingSignals >= 1 && avgAttackConfidence > 0.3) {
    level = 'low_confidence';
    recommendation = 'Low confidence — only one signal flagged activity. Escalating to analyst for manual review. Do not trigger automated response.';
  }
  // All abstain or no agreement = uncertain
  else if (abstainSignals > totalSignals / 2 || (attackingSignals === 0 && benignSignals === 0)) {
    level = 'uncertain';
    recommendation = 'Uncertain — insufficient signal agreement. Escalating to analyst. System will abstain from automated action.';
  }
  // Benign consensus: >= 3 signals vote benign with avg confidence > 0.7
  else if (benignSignals >= 3) {
    const avgBenignConfidence = benign.reduce((s, v) => s + v.confidence, 0) / benign.length;
    if (avgBenignConfidence > 0.7) {
      level = 'normal';
      recommendation = 'All signals indicate normal baseline activity. No action required.';
    } else {
      level = 'uncertain';
      recommendation = 'Uncertain — signals lean benign but confidence is low. Escalating to analyst for confirmation.';
    }
  } else {
    level = 'uncertain';
    recommendation = 'Uncertain — conflicting signal votes. Escalating to analyst.';
  }

  return {
    level,
    consensusScore: Math.round(rawScore),
    agreementCount: majorityAttack ? attackingSignals : benignSignals,
    totalSignals,
    attackingSignals,
    benignSignals,
    abstainSignals,
    avgAttackConfidence,
    votes,
    recommendation,
  };
}

/* ─── Signal generators (each returns a vote + evidence) ── */

interface SignalInput {
  anomalousVolume: number;
  baseline: number;
  threshold: number;
  tickIndex: number;
  recentVolumes: number[];
}

function signalPayloadEntropy(input: SignalInput): SignalVote {
  // Entropy: normal payload ~6.5-7.8 bits/byte
  // Very low entropy (< 4) = shellcode padding, null byte streams
  // Very high entropy (> 8.5) = encrypted/packed malware payload
  const { anomalousVolume } = input;
  const baseEntropy = 6.2 + Math.random() * 1.6;
  const entropy = anomalousVolume > 60
    ? baseEntropy + 2.2 + Math.random() * 1.5
    : anomalousVolume > 40
      ? baseEntropy + 0.8 + Math.random() * 1.2
      : baseEntropy;

  if (entropy > 8.5) {
    return {
      signalId: 'entropy',
      signalLabel: 'Payload Entropy Analysis',
      icon: FileSearch,
      vote: 'attack',
      confidence: Math.min((entropy - 7.0) / 3.0, 0.95),
      weight: 0.85,
      evidence: `Payload entropy abnormally high (${entropy.toFixed(2)} bits/byte) — consistent with encrypted/packed malware payload or encoded exploit`,
      rawValue: entropy,
    };
  }
  if (entropy < 4.0) {
    return {
      signalId: 'entropy',
      signalLabel: 'Payload Entropy Analysis',
      icon: FileSearch,
      vote: 'attack',
      confidence: Math.min((4.5 - entropy) / 1.5, 0.9),
      weight: 0.85,
      evidence: `Payload entropy abnormally low (${entropy.toFixed(2)} bits/byte) — consistent with shellcode padding or null-byte injection`,
      rawValue: entropy,
    };
  }
  if (entropy > 7.8 || entropy < 5.5) {
    return {
      signalId: 'entropy',
      signalLabel: 'Payload Entropy Analysis',
      icon: FileSearch,
      vote: 'abstain',
      confidence: 0.4,
      weight: 0.5,
      evidence: `Entropy (${entropy.toFixed(2)} bits/byte) is borderline — requires deeper packet inspection`,
      rawValue: entropy,
    };
  }
  return {
    signalId: 'entropy',
    signalLabel: 'Payload Entropy Analysis',
    icon: FileSearch,
    vote: 'benign',
    confidence: 0.75,
    weight: 0.65,
    evidence: `Payload entropy (${entropy.toFixed(2)} bits/byte) within normal range`,
    rawValue: entropy,
  };
}

function signalPortScanHeuristics(input: SignalInput): SignalVote {
  const { anomalousVolume } = input;

  const closedPortRatio = anomalousVolume > 65
    ? 0.45 + Math.random() * 0.45
    : anomalousVolume > 40
      ? 0.15 + Math.random() * 0.25
      : 0.02 + Math.random() * 0.1;

  const synRate = anomalousVolume > 65
    ? 800 + Math.random() * 1500
    : anomalousVolume > 40
      ? 100 + Math.random() * 400
      : 10 + Math.random() * 50;

  const synCompletionRatio = anomalousVolume > 65
    ? 0.05 + Math.random() * 0.2
    : anomalousVolume > 40
      ? 0.3 + Math.random() * 0.3
      : 0.7 + Math.random() * 0.25;

  if (closedPortRatio > 0.5 && synRate > 500 && synCompletionRatio < 0.25) {
    return {
      signalId: 'portscan',
      signalLabel: 'Port-Scan Heuristics',
      icon: Radio,
      vote: 'attack',
      confidence: 0.85 + Math.random() * 0.15,
      weight: 0.9,
      evidence: `High closed-port ratio (${(closedPortRatio * 100).toFixed(0)}%), elevated SYN rate (${Math.round(synRate)}/s), low completion ratio (${(synCompletionRatio * 100).toFixed(0)}%) — active port scanning`,
      rawValue: closedPortRatio,
    };
  }
  if (closedPortRatio > 0.3 || synRate > 200) {
    return {
      signalId: 'portscan',
      signalLabel: 'Port-Scan Heuristics',
      icon: Radio,
      vote: 'abstain',
      confidence: 0.45,
      weight: 0.6,
      evidence: `Elevated SYN rate (${Math.round(synRate)}/s) with ${(closedPortRatio * 100).toFixed(0)}% closed-port ratio — possible reconnaissance, needs correlation`,
      rawValue: closedPortRatio,
    };
  }
  return {
    signalId: 'portscan',
    signalLabel: 'Port-Scan Heuristics',
    icon: Radio,
    vote: 'benign',
    confidence: 0.8,
    weight: 0.7,
    evidence: `Normal connection patterns — SYN rate (${Math.round(synRate)}/s), ${(synCompletionRatio * 100).toFixed(0)}% completion ratio`,
    rawValue: closedPortRatio,
  };
}

function signalDeceptionTraps(input: SignalInput): SignalVote {
  const { anomalousVolume } = input;
  const trapHit = anomalousVolume > 55 && Math.random() > 0.4;
  const trapFrequency = trapHit
    ? 1 + Math.floor(Math.random() * 4)
    : 0;

  if (trapFrequency >= 2) {
    return {
      signalId: 'deception',
      signalLabel: 'Deception Trap Telemetry',
      icon: Siren,
      vote: 'attack',
      confidence: 0.9 + Math.random() * 0.1,
      weight: 1.0,
      evidence: `${trapFrequency} interactions with deception trap subnet in this window — unauthorized access to decoy assets is a confirmed adversarial indicator`,
      rawValue: trapFrequency,
    };
  }
  if (trapFrequency === 1) {
    return {
      signalId: 'deception',
      signalLabel: 'Deception Trap Telemetry',
      icon: Siren,
      vote: 'abstain',
      confidence: 0.5,
      weight: 0.7,
      evidence: `Single interaction with deception trap — could be misconfigured service or initial recon, needs manual verification`,
      rawValue: trapFrequency,
    };
  }
  return {
    signalId: 'deception',
    signalLabel: 'Deception Trap Telemetry',
    icon: Siren,
    vote: 'benign',
    confidence: 0.9,
    weight: 0.8,
    evidence: 'No interactions with deception traps — all traffic confined to production assets',
    rawValue: 0,
  };
}

function signalAICopilotClassification(input: SignalInput): SignalVote {
  const { anomalousVolume, threshold } = input;
  const anomalyRatio = anomalousVolume / threshold;

  if (anomalyRatio > 1.1 && Math.random() > 0.2) {
    const conf = 0.6 + Math.random() * 0.35;
    return {
      signalId: 'ai_copilot',
      signalLabel: 'AI Co-Pilot Classifier',
      icon: Bot,
      vote: 'attack',
      confidence: conf,
      weight: 0.85,
      evidence: `Deep packet classifier flagged anomalous payload pattern (confidence: ${(conf * 100).toFixed(0)}%) — ${anomalyRatio > 1.4 ? 'high-severity pattern match to known exploit vector' : 'deviation from trained traffic profile'}`,
      rawValue: anomalyRatio,
    };
  }
  if (anomalyRatio > 0.9) {
    return {
      signalId: 'ai_copilot',
      signalLabel: 'AI Co-Pilot Classifier',
      icon: Bot,
      vote: 'abstain',
      confidence: 0.4,
      weight: 0.5,
      evidence: `Classifier returned ambiguous result — traffic near threshold (${(anomalyRatio * 100).toFixed(0)}% of alarm threshold)`,
      rawValue: anomalyRatio,
    };
  }
  return {
    signalId: 'ai_copilot',
    signalLabel: 'AI Co-Pilot Classifier',
    icon: Bot,
    vote: 'benign',
    confidence: 0.75 + Math.random() * 0.2,
    weight: 0.7,
    evidence: 'Classifier confirms benign traffic — no signature matches in current epoch',
    rawValue: anomalyRatio,
  };
}

function signalBayesianModel(input: SignalInput, forecast: BayesianForecast): SignalVote {
  const attackProb = forecast.probability;
  const conf = forecast.confidence;

  if (attackProb > 0.7 && conf > 0.35) {
    return {
      signalId: 'bayesian',
      signalLabel: 'Bayesian Probabilistic Model',
      icon: Brain,
      vote: 'attack',
      confidence: Math.min(conf + 0.15, 0.95),
      weight: 0.9,
      evidence: `Posterior P(Attack|Evidence) = ${(attackProb * 100).toFixed(0)}% across ${forecast.signalCount} signal types — ${forecast.explanation}`,
      rawValue: attackProb,
    };
  }
  if (attackProb > 0.4) {
    return {
      signalId: 'bayesian',
      signalLabel: 'Bayesian Probabilistic Model',
      icon: Brain,
      vote: 'abstain',
      confidence: conf * 0.7,
      weight: 0.65,
      evidence: `Posterior P(Attack|Evidence) = ${(attackProb * 100).toFixed(0)}% — insufficient posterior mass, model defers`,
      rawValue: attackProb,
    };
  }
  return {
    signalId: 'bayesian',
    signalLabel: 'Bayesian Probabilistic Model',
    icon: Brain,
    vote: 'benign',
    confidence: Math.min(conf, 0.85),
    weight: 0.75,
    evidence: `Posterior P(Attack|Evidence) = ${(attackProb * 100).toFixed(0)}% — below threshold, baseline behavior confirmed`,
    rawValue: attackProb,
  };
}


/* ══════════════════════════════════════════════════════════════
   ORIGINAL TYPES & HELPERS (unchanged)
   ══════════════════════════════════════════════════════════════ */

interface TrafficPoint {
  time: string;
  anomalous: number;
  baseline: number;
  threshold: number;
}

interface NetworkNode {
  id: string;
  label: string;
  type: 'server' | 'atm' | 'workstation' | 'mobile';
  ip: string;
  behavioralSig: string;
  bandwidth: number;
  isolated: boolean;
}

const DEVICE_ICONS: Record<NetworkNode['type'], typeof Server> = {
  server: Server,
  atm: Wifi,
  workstation: Monitor,
  mobile: Smartphone,
};

const NODE_SEED: NetworkNode[] = [
  { id: 'n1', label: 'Core Banking Server', type: 'server', ip: '10.0.1.10', behavioralSig: 'A3:F1:7C:9E:4B', bandwidth: 72, isolated: false },
  { id: 'n2', label: 'ATM Cluster #3', type: 'atm', ip: '10.0.2.22', behavioralSig: 'D8:4A:2E:11:F7', bandwidth: 34, isolated: false },
  { id: 'n3', label: 'Employee Pod — Sales', type: 'workstation', ip: '10.0.3.45', behavioralSig: 'B2:9C:04:EA:81', bandwidth: 56, isolated: false },
  { id: 'n4', label: 'Mobile Terminal — Ops', type: 'mobile', ip: '10.0.4.12', behavioralSig: 'EF:71:3D:AA:50', bandwidth: 88, isolated: false },
  { id: 'n5', label: 'Backup Replica DB', type: 'server', ip: '10.0.1.15', behavioralSig: '49:BB:C2:6F:3D', bandwidth: 41, isolated: false },
  { id: 'n6', label: 'ATM Lobby Unit', type: 'atm', ip: '10.0.2.31', behavioralSig: 'C0:23:8E:19:AA', bandwidth: 27, isolated: false },
  { id: 'n7', label: 'Executive Workstation', type: 'workstation', ip: '10.0.3.50', behavioralSig: 'F1:5D:0A:77:BE', bandwidth: 63, isolated: false },
  { id: 'n8', label: 'Field Agent Phone', type: 'mobile', ip: '10.0.4.19', behavioralSig: '34:90:1B:C2:44', bandwidth: 95, isolated: false },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/* ─── SVG Gauge Component ───────────────────────────────── */
function VelocityGauge({ value, max }: { value: number; max: number }) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.min(value / max, 1);
  const offset = circumference * (1 - fraction);
  const danger = fraction >= 0.85;

  return (
    <div className="relative flex flex-col items-center">
      <svg width="120" height="120" viewBox="0 0 120 120" className="drop-shadow-[0_0_8px_rgba(34,197,94,0.15)]">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#1a2a1a" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={radius}
          fill="none"
          stroke={danger ? '#f43f5e' : '#22C55E'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          className="transition-all duration-700 ease-out"
          style={{ filter: danger ? 'drop-shadow(0 0 6px #f43f5e)' : 'drop-shadow(0 0 6px #22C55E)' }}
        />
        <text x="60" y="52" textAnchor="middle" fill={danger ? '#f43f5e' : '#22C55E'} fontSize="20" fontWeight="bold" fontFamily="ui-monospace" className="transition-colors duration-300">
          {value}
        </text>
        <text x="60" y="68" textAnchor="middle" fill="#6b7280" fontSize="8" fontFamily="ui-monospace">
          Mbps
        </text>
      </svg>
      <span className={`text-[9px] font-mono mt-1 ${danger ? 'text-rose-400 animate-pulse' : 'text-accent'}`}>
        {danger ? '⚠ OVER THRESHOLD' : `${Math.round(fraction * 100)}% Util`}
      </span>
    </div>
  );
}

/* ─── Mini Bandwidth Pulse ──────────────────────────────── */
function BandwidthPulse({ level }: { level: number }) {
  const bars = 8;
  const active = Math.round((level / 100) * bars);
  return (
    <div className="flex items-end gap-[2px] h-5">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-t-sm transition-all duration-300 ${
            i < active ? 'bg-accent' : 'bg-accent/15'
          }`}
          style={{
            height: `${30 + (i / bars) * 70}%`,
            animation: i < active ? `pulse-bar ${0.6 + i * 0.1}s ease-in-out infinite` : 'none',
          }}
        />
      ))}
    </div>
  );
}

/* ─── Crypto Status Badge ───────────────────────────────── */
function CryptoSigBadge({ sig, isolated }: { sig: string; isolated: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono tracking-wider ${
      isolated
        ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
        : 'bg-accent/10 border border-accent/20 text-accent'
    }`}>
      <Lock className="w-2 h-2" />
      {sig}
    </span>
  );
}


/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function PredictiveAttackForecaster() {
  /* ── Bayesian Forecaster (persistent across renders) ── */
  const forecasterRef = useRef<BayesianForecaster>(createFinancialForecaster());

  /* ── Traffic chart state ── */
  const [trafficData, setTrafficData] = useState<TrafficPoint[]>([]);
  const [velocity, setVelocity] = useState(42);
  const [mitigationSeconds, setMitigationSeconds] = useState(3599);
  const [nodes, setNodes] = useState<NetworkNode[]>(NODE_SEED);
  const [forecast, setForecast] = useState<BayesianForecast>(
    forecasterRef.current.getForecast(),
  );
  const chartInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const velInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const mitInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [initialized, setInitialized] = useState(false);

  /* ── Consensus state ── */
  const [consensus, setConsensus] = useState<ConsensusResult>(() =>
    computeConsensus([
      { signalId: 'entropy', signalLabel: 'Payload Entropy Analysis', icon: FileSearch, vote: 'benign', confidence: 0.75, weight: 0.65, evidence: 'Waiting for data...', rawValue: 0 },
      { signalId: 'portscan', signalLabel: 'Port-Scan Heuristics', icon: Radio, vote: 'benign', confidence: 0.8, weight: 0.7, evidence: 'Waiting for data...', rawValue: 0 },
      { signalId: 'deception', signalLabel: 'Deception Trap Telemetry', icon: Siren, vote: 'benign', confidence: 0.9, weight: 0.8, evidence: 'Waiting for data...', rawValue: 0 },
      { signalId: 'ai_copilot', signalLabel: 'AI Co-Pilot Classifier', icon: Bot, vote: 'benign', confidence: 0.75, weight: 0.7, evidence: 'Waiting for data...', rawValue: 0 },
      { signalId: 'bayesian', signalLabel: 'Bayesian Probabilistic Model', icon: Brain, vote: 'benign', confidence: 0.5, weight: 0.75, evidence: 'Waiting for data...', rawValue: 0 },
    ]),
  );
  const tickIndex = useRef(0);

  /* ── Seed initial chart data ── */
  useEffect(() => {
    const now = new Date();
    const forecaster = forecasterRef.current;
    const seed: TrafficPoint[] = [];
    for (let i = 19; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 1500);
      const anom = Math.floor(Math.random() * 60) + 10;
      seed.push({
        time: t.toLocaleTimeString('en-US', { minute: '2-digit', second: '2-digit' }),
        anomalous: anom,
        baseline: 25,
        threshold: 75,
      });
      const severity = anom > 75 ? 3 : anom > 50 ? 2 : anom > 30 ? 1 : 0;
      forecaster.ingestSignal('severity', severity);
    }
    setTrafficData(seed);
    setForecast(forecaster.getForecast());
    setInitialized(true);
  }, []);

  /* ── Live chart tick + consensus voting ── */
  useEffect(() => {
    if (!initialized) return;
    chartInterval.current = setInterval(() => {
      const forecaster = forecasterRef.current;
      const idx = tickIndex.current++;

      setTrafficData((prev) => {
        const next = [...prev];
        next.shift();
        const anom = Math.floor(Math.random() * 70) + 5;
        next.push({
          time: new Date().toLocaleTimeString('en-US', { minute: '2-digit', second: '2-digit' }),
          anomalous: anom,
          baseline: 25,
          threshold: 75,
        });

        // ── Bayesian signal ingestion (kept for model fidelity) ──
        const severity = anom > 75 ? 3 : anom > 50 ? 2 : anom > 30 ? 1 : 0;
        forecaster.ingestSignal('severity', severity);
        const burstCount = next.filter((p) => p.anomalous > p.baseline * 1.5).length;
        forecaster.ingestSignal('frequency', burstCount * 3);
        const entropyVal = 4 + (anom / 100) * 4;
        forecaster.ingestSignal('entropy', entropyVal);
        const mitreW = anom > 60 ? 5 : anom > 40 ? 3 : 1;
        forecaster.ingestSignal('mitre_weight', mitreW);

        return next;
      });

      const curForecast = forecaster.getForecast();
      setForecast(curForecast);

      // ── Build consensus from 5 independent signals ──
      const recentVolumes = trafficData.map((d) => d.anomalous);
      const input: SignalInput = {
        anomalousVolume: trafficData.length > 0 ? trafficData[trafficData.length - 1].anomalous : 50,
        baseline: 25,
        threshold: 75,
        tickIndex: idx,
        recentVolumes,
      };

      const votes: SignalVote[] = [
        signalPayloadEntropy(input),
        signalPortScanHeuristics(input),
        signalDeceptionTraps(input),
        signalAICopilotClassification(input),
        signalBayesianModel(input, curForecast),
      ];

      setConsensus(computeConsensus(votes));
    }, 1800);
    return () => { if (chartInterval.current) clearInterval(chartInterval.current); };
  }, [initialized, trafficData]);

  /* ── Velocity gauge drift ── */
  useEffect(() => {
    velInterval.current = setInterval(() => {
      setVelocity((prev) => {
        const delta = (Math.random() - 0.5) * 12;
        return Math.max(0, Math.min(100, Math.round(prev + delta)));
      });
    }, 2000);
    return () => { if (velInterval.current) clearInterval(velInterval.current); };
  }, []);

  /* ── Mitigation countdown ── */
  useEffect(() => {
    mitInterval.current = setInterval(() => {
      setMitigationSeconds((prev) => {
        if (prev <= 1) return 3599;
        return prev - 1;
      });
    }, 1000);
    return () => { if (mitInterval.current) clearInterval(mitInterval.current); };
  }, []);

  /* ── Toggle isolation ── */
  const toggleIsolation = useCallback((id: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isolated: !n.isolated } : n)),
    );
  }, []);

  /* ── Countdown warning level ── */
  const mitWarning = mitigationSeconds < 60;
  const mitCritical = mitigationSeconds < 15;

  /* ── Anomaly trend ── */
  const avgAnomalous = trafficData.length
    ? Math.round(trafficData.reduce((s, p) => s + p.anomalous, 0) / trafficData.length)
    : 0;
  const lastAnomalous = trafficData.length ? trafficData[trafficData.length - 1].anomalous : 0;
  const trendUp = lastAnomalous > avgAnomalous + 5;

  /* ── Bayesian derived values ── */
  const bayesianPct = Math.round(forecast.probability * 100);
  const bayesianConf = Math.round(forecast.confidence * 100);
  const threatColor =
    forecast.threatLevel === 'critical' ? 'text-rose-400' :
    forecast.threatLevel === 'high' ? 'text-orange-400' :
    forecast.threatLevel === 'elevated' ? 'text-amber-400' :
    'text-accent';

  /* ── Consensus display values ── */
  const consensusColor =
    consensus.level === 'critical' ? 'text-rose-400' :
    consensus.level === 'elevated' ? 'text-orange-400' :
    consensus.level === 'low_confidence' ? 'text-amber-400' :
    consensus.level === 'uncertain' ? 'text-violet-400' :
    'text-accent';

  const consensusLabel =
    consensus.level === 'critical' ? 'CONSENSUS: ATTACK CONFIRMED' :
    consensus.level === 'elevated' ? 'CONSENSUS: ELEVATED' :
    consensus.level === 'low_confidence' ? 'LOW CONFIDENCE — REVIEW NEEDED' :
    consensus.level === 'uncertain' ? 'UNCERTAIN — ESCALATING TO ANALYST' :
    'CONSENSUS: NORMAL';

  const ConsensusIcon =
    consensus.level === 'critical' ? AlertOctagon :
    consensus.level === 'elevated' ? AlertTriangle :
    consensus.level === 'low_confidence' ? Eye :
    consensus.level === 'uncertain' ? HelpCircle :
    ThumbsUp;

  const consensusBgBorder =
    consensus.level === 'critical' ? 'border-rose-500/30 bg-rose-500/[0.03]' :
    consensus.level === 'elevated' ? 'border-orange-500/30 bg-orange-500/[0.03]' :
    consensus.level === 'low_confidence' ? 'border-amber-500/30 bg-amber-500/[0.03]' :
    consensus.level === 'uncertain' ? 'border-violet-500/30 bg-violet-500/[0.03]' :
    'border-accent/20 bg-accent/[0.02]';

  /* ── Whether to show a review banner ── */
  const needsAnalystReview = consensus.level === 'low_confidence' || consensus.level === 'uncertain';

  return (
    <div className="space-y-6">
      {/* ─── PREDICTIVE ATTACK VECTOR FORECASTER ───────── */}
      <div className="bg-black border border-accent/20 rounded-2xl shadow-[0_0_40px_rgba(34,197,94,0.06)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-accent/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center">
              <Radar className="w-5 h-5 text-accent drop-shadow-[0_0_4px_#22C55E]" />
            </div>
            <div>
              <h2 className="text-sm font-heading font-bold text-accent tracking-tight flex items-center gap-2">
                PREDICTIVE ATTACK VECTOR FORECASTER
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent font-mono">
                  Consensus v4.0
                </span>
              </h2>
              <p className="text-[10px] text-foreground/40 font-mono tracking-wider">
                MULTI-SIGNAL CONSENSUS CONFIDENCE // 5 INDEPENDENT VOTERS // P(ATTACK|EVIDENCE)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[9px] text-foreground/40 font-mono uppercase">Consensus Score</p>
              <p className={`text-sm font-bold font-mono ${consensusColor}`}>
                {consensus.consensusScore}%
              </p>
            </div>
            <span className={`flex items-center gap-1.5 text-[10px] font-mono ${
              trendUp ? 'text-rose-400' : 'text-accent'
            }`}>
              <span className={`w-2 h-2 rounded-full ${trendUp ? 'bg-rose-400 animate-ping' : 'bg-accent'}`} />
              {trendUp ? 'ANOMALY RISING' : 'STABLE'}
            </span>
          </div>
        </div>

        {/* ─── CONSENSUS CONFIDENCE PANEL ──────────────── */}
        <div className={`px-6 py-4 border-b ${consensusBgBorder}`}>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
            {/* Consensus gauge + status */}
            <div className="flex items-center gap-4 lg:col-span-1">
              <div className="relative w-20 h-20 shrink-0">
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#1a2a1a" strokeWidth="6" />
                  <circle cx="40" cy="40" r="34" fill="none"
                    stroke={
                      consensus.level === 'critical' ? '#f43f5e' :
                      consensus.level === 'elevated' ? '#f97316' :
                      consensus.level === 'low_confidence' ? '#fbbf24' :
                      consensus.level === 'uncertain' ? '#a78bfa' :
                      '#22C55E'
                    }
                    strokeWidth="6"
                    strokeLinecap="round" transform="rotate(-90 40 40)"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - consensus.consensusScore / 100)}`}
                    className="transition-all duration-700 ease-out"
                    style={{
                      filter: consensus.level === 'critical' ? 'drop-shadow(0 0 6px #f43f5e)' :
                        consensus.level === 'uncertain' ? 'drop-shadow(0 0 6px #a78bfa)' :
                        'drop-shadow(0 0 4px #22C55E)',
                    }}
                  />
                  <text x="40" y="36" textAnchor="middle"
                    fill={
                      consensus.level === 'critical' ? '#f43f5e' :
                      consensus.level === 'elevated' ? '#f97316' :
                      consensus.level === 'low_confidence' ? '#fbbf24' :
                      consensus.level === 'uncertain' ? '#a78bfa' :
                      '#22C55E'
                    }
                    fontSize="13" fontWeight="bold" fontFamily="ui-monospace"
                  >
                    {consensus.consensusScore}%
                  </text>
                  <text x="40" y="50" textAnchor="middle" fill="#6b7280" fontSize="6" fontFamily="ui-monospace">CONSENSUS</text>
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ConsensusIcon className={`w-3.5 h-3.5 ${consensusColor} ${
                    consensus.level === 'critical' ? 'animate-pulse' : ''
                  }`} />
                  <span className={`text-[10px] font-heading font-bold uppercase tracking-wider ${consensusColor}`}>
                    {consensusLabel}
                  </span>
                </div>
                <p className="text-[8px] font-mono text-foreground/40 mt-1 leading-tight">
                  {consensus.recommendation}
                </p>

                {/* Escalation banner for low confidence / uncertain */}
                {needsAnalystReview && (
                  <div className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded bg-violet-500/10 border border-violet-500/25 animate-pulse">
                    <Eye className="w-3 h-3 text-violet-400" />
                    <span className="text-[8px] font-mono text-violet-400 font-bold tracking-wider">
                      ESCALATING TO SOC ANALYST — SYSTEM ABSTAINS
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Signal vote breakdown */}
            <div className="lg:col-span-3 space-y-1.5">
              {/* Header legend */}
              <div className="flex items-center gap-2 text-[8px] font-mono text-foreground/30 uppercase tracking-wider mb-1">
                <Shuffle className="w-2.5 h-2.5" />
                <span>Independent Signal Votes</span>
                <span className="ml-auto">{consensus.attackingSignals} attack · {consensus.benignSignals} benign · {consensus.abstainSignals} abstain</span>
              </div>

              {consensus.votes.map((vote) => {
                const SigIcon = vote.icon;
                const voteColor =
                  vote.vote === 'attack' ? 'text-rose-400' :
                  vote.vote === 'benign' ? 'text-accent' :
                  'text-violet-400';
                const voteLabel =
                  vote.vote === 'attack' ? 'ATTACK' :
                  vote.vote === 'benign' ? 'BENIGN' :
                  'ABSTAIN';
                return (
                  <div key={vote.signalId}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[9px] font-mono transition-all duration-300"
                    style={{
                      borderColor: vote.vote === 'attack' ? 'rgba(244,63,94,0.25)' :
                        vote.vote === 'abstain' ? 'rgba(167,139,250,0.25)' :
                        'rgba(34,197,94,0.2)',
                      backgroundColor: vote.vote === 'attack' ? 'rgba(244,63,94,0.04)' :
                        vote.vote === 'abstain' ? 'rgba(167,139,250,0.04)' :
                        'rgba(34,197,94,0.03)',
                    }}
                  >
                    <SigIcon className={`w-3 h-3 ${voteColor} shrink-0`} />
                    <span className="w-28 truncate text-foreground/70 font-semibold">{vote.signalLabel}</span>
                    <span className={`px-1 rounded text-[7px] font-bold uppercase tracking-wider border ${
                      vote.vote === 'attack' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
                      vote.vote === 'abstain' ? 'bg-violet-500/10 border-violet-500/30 text-violet-400' :
                      'bg-accent/10 border-accent/20 text-accent'
                    }`}>{voteLabel}</span>
                    <span className="text-foreground/30 w-9 text-right">
                      {Math.round(vote.confidence * 100)}%
                    </span>
                    {/* Mini confidence bar */}
                    <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${
                        vote.vote === 'attack' ? 'bg-rose-500' :
                        vote.vote === 'abstain' ? 'bg-violet-400' :
                        'bg-accent'
                      }`} style={{ width: `${vote.confidence * 100}%` }} />
                    </div>
                    {/* Evidence tooltip */}
                    <span className="relative group ml-auto">
                      <Microscope className="w-2.5 h-2.5 text-foreground/30 cursor-help" />
                      <span className="absolute bottom-full right-0 mb-1 w-56 p-1.5 rounded bg-black border border-border/60 text-[8px] text-foreground/70 font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 shadow-xl">
                        {vote.evidence}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick stats row under consensus */}
          <div className="flex items-center gap-6 mt-3 pt-3 border-t border-border/30 text-[8px] font-mono text-foreground/30">
            <span>
              <GitBranch className="w-2.5 h-2.5 inline mr-1" />
              Attack voters: <span className="text-foreground/60 font-bold">{consensus.attackingSignals}/{consensus.totalSignals}</span>
            </span>
            <span>
              Avg attack confidence: <span className="text-foreground/60 font-bold">{(consensus.avgAttackConfidence * 100).toFixed(0)}%</span>
            </span>
            <span>
              Agreement: <span className="text-foreground/60 font-bold">{consensus.agreementCount} signals</span>
            </span>
            <span>
              Recommendation: <span className="text-foreground/60 italic">{consensus.recommendation.slice(0, 60)}...</span>
            </span>
          </div>
        </div>

        {/* Body: 3-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
          {/* ─── LEFT: Live Traffic Timeline ─────────── */}
          <div className="lg:col-span-1 p-5 border-r border-accent/5">
            <h3 className="text-[10px] font-heading font-semibold text-foreground/50 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Activity className="w-3 h-3 text-accent" />
              Anomalous Traffic Volume (20-tick window)
            </h3>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="anomGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="baselineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22C55E" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#22C55E" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 8, fill: '#6b7280' }} interval={3} />
                  <YAxis tick={{ fontSize: 8, fill: '#6b7280' }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: '#0a0a0a', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, fontSize: 10 }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Area type="monotone" dataKey="threshold" stroke="#f43f5e" strokeWidth={1} strokeDasharray="4 2" fill="none" dot={false} activeDot={false} />
                  <Area type="monotone" dataKey="baseline" stroke="#22C55E" strokeWidth={1.5} fill="url(#baselineGrad)" dot={false} />
                  <Area type="monotone" dataKey="anomalous" stroke="#f43f5e" strokeWidth={2} fill="url(#anomGrad)" dot={false} animationDuration={400} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between mt-2 text-[9px] font-mono text-foreground/40">
              <span>Avg: <span className="text-foreground/70">{avgAnomalous} pkts</span></span>
              <span>Threshold: <span className="text-rose-400">75 pkts</span></span>
              <span>Last: <span className={lastAnomalous > 75 ? 'text-rose-400 font-bold' : 'text-foreground/70'}>{lastAnomalous}</span></span>
            </div>
          </div>

          {/* ─── CENTER: Subnet Velocity Cap ─────────── */}
          <div className="lg:col-span-1 p-5 border-r border-accent/5 flex flex-col items-center justify-center">
            <h3 className="text-[10px] font-heading font-semibold text-foreground/50 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Gauge className="w-3 h-3 text-accent" />
              Subnet Velocity Cap
            </h3>
            <VelocityGauge value={velocity} max={100} />
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[9px] font-mono text-foreground/40 text-center">
              <span>Peak: 98 Mbps</span>
              <span>Floor: 12 Mbps</span>
              <span>Avg: {Math.round(velocity)} Mbps</span>
              <span>Cap: 100 Mbps</span>
            </div>
          </div>

          {/* ─── RIGHT: Time-to-Mitigation Window ───── */}
          <div className="lg:col-span-1 p-5 flex flex-col items-center justify-center">
            <h3 className="text-[10px] font-heading font-semibold text-foreground/50 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Clock className="w-3 h-3 text-amber-400" />
              Time-to-Mitigation Window
            </h3>
            <div className={`text-5xl font-bold font-mono tracking-widest transition-all duration-300 ${
              mitCritical
                ? 'text-rose-400 animate-pulse drop-shadow-[0_0_12px_rgba(244,63,94,0.6)]'
                : mitWarning
                  ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]'
                  : 'text-accent'
            }`}>
              {formatTime(mitigationSeconds)}
            </div>
            <div className="flex items-center gap-2 mt-3">
              {mitCritical ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 animate-pulse" />
              ) : mitWarning ? (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              ) : (
                <Shield className="w-4 h-4 text-accent" />
              )}
              <span className={`text-[10px] font-mono ${
                mitCritical ? 'text-rose-400' : mitWarning ? 'text-amber-400' : 'text-accent'
              }`}>
                {mitCritical ? 'CRITICAL — IMMEDIATE ACTION REQUIRED' : mitWarning ? 'WARNING — WINDOW CLOSING' : 'NOMINAL — MITIGATION AVAILABLE'}
              </span>
            </div>
            <button
              onClick={() => setMitigationSeconds(3599)}
              className="mt-4 px-4 py-1.5 rounded-lg bg-accent/10 border border-accent/25 text-accent hover:bg-accent/20 hover:border-accent/40 transition-all duration-200 text-[10px] font-bold uppercase tracking-widest font-mono cursor-pointer active:scale-97"
            >
              ⚡ Reset Mitigation Timer
            </button>
          </div>
        </div>
      </div>

      {/* ─── AUTONOMOUS NETWORK NODE MAP ─────────────────── */}
      <div className="bg-black border border-border/60 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.4)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-heading font-bold text-foreground/90 tracking-tight">
                AUTONOMOUS NETWORK NODE MAP
              </h2>
              <p className="text-[10px] text-foreground/40 font-mono tracking-wider">
                LIVE CRYPTOGRAPHIC BEHAVIORAL SIGNATURES // ZERO-TRUST ISOLATION CONTROL
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1.5 text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
              {nodes.filter((n) => !n.isolated).length} Online
            </span>
            <span className="text-rose-400">
              {nodes.filter((n) => n.isolated).length} Isolated
            </span>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6">
          {nodes.map((node) => {
            const Icon = DEVICE_ICONS[node.type];
            return (
              <div
                key={node.id}
                className={`
                  relative rounded-xl border p-4 transition-all duration-300
                  ${node.isolated
                    ? 'bg-rose-500/[0.04] border-rose-500/30 shadow-[0_0_15px_rgba(239,68,68,0.06)]'
                    : 'bg-background border-border/60 hover:border-accent/30 hover:shadow-[0_0_15px_rgba(34,197,94,0.05)]'
                  }
                `}
              >
                {node.isolated && (
                  <div className="absolute -top-px left-3 right-3 h-[2px] rounded-full bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                )}

                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    node.isolated
                      ? 'bg-rose-500/10 border border-rose-500/20'
                      : 'bg-accent/10 border border-accent/20'
                  }`}>
                    <Icon className={`w-4 h-4 ${node.isolated ? 'text-rose-400' : 'text-accent'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-foreground/90 truncate">{node.label}</p>
                    <p className="text-[9px] font-mono text-foreground/40 truncate">{node.ip}</p>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-[8px] text-foreground/40 font-mono uppercase tracking-widest mb-1">Behavioral Signature</p>
                  <CryptoSigBadge sig={node.behavioralSig} isolated={node.isolated} />
                </div>

                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[8px] text-foreground/40 font-mono uppercase tracking-widest">Bandwidth</span>
                    <span className={`text-[9px] font-mono font-bold ${node.bandwidth > 80 ? 'text-rose-400' : 'text-accent'}`}>
                      {node.bandwidth} Mbps
                    </span>
                  </div>
                  <BandwidthPulse level={node.bandwidth} />
                </div>

                <label className="flex items-center gap-2 cursor-pointer group mt-2 pt-2 border-t border-border/30">
                  <input
                    type="checkbox"
                    checked={node.isolated}
                    onChange={() => toggleIsolation(node.id)}
                    className="
                      appearance-none w-4 h-4 rounded border-2 shrink-0
                      transition-all duration-200 cursor-pointer
                      checked:bg-rose-500 checked:border-rose-500
                      border-border/60 hover:border-rose-400/50
                      focus:outline-none focus:ring-1 focus:ring-rose-400/40
                    "
                  />
                  <span className={`text-[9px] font-mono font-semibold uppercase tracking-widest transition-colors duration-200 ${
                    node.isolated ? 'text-rose-400' : 'text-foreground/40 group-hover:text-foreground/60'
                  }`}>
                    {node.isolated ? 'Isolation Active' : 'Enforce Zero-Trust Isolation'}
                  </span>
                  {node.isolated ? (
                    <Lock className="w-3 h-3 text-rose-400 ml-auto shrink-0" />
                  ) : (
                    <Unlock className="w-3 h-3 text-foreground/30 ml-auto shrink-0" />
                  )}
                </label>

                <span className={`absolute bottom-1 right-2 text-[8px] font-mono ${
                  node.isolated ? 'text-rose-400/40' : 'text-accent/30'
                }`}>
                  {node.isolated ? 'ISOLATED' : 'TRUSTED'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-t border-border/40 bg-background/30">
          <span className="text-[9px] font-mono text-foreground/40">
            Node auto-discovery interval: 12s | Behavioral sig rotation: 24h
          </span>
          <button
            onClick={() => setNodes(NODE_SEED.map((n) => ({ ...n, isolated: false })))}
            className="px-3 py-1 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 text-[9px] font-mono uppercase tracking-widest transition-all duration-200 cursor-pointer active:scale-97"
          >
            Reset All Trust
          </button>
        </div>
      </div>
    </div>
  );
}
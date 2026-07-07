/**
 * Bayesian Attack Forecaster
 *
 * Models attack likelihood as a probability that updates with each new signal,
 * rather than using static thresholds. Uses Bayes' theorem to compute
 * P(attack | evidence) from prior beliefs and observed signals.
 *
 * P(A|E) = P(E|A) * P(A) / [P(E|A)*P(A) + P(E|¬A)*P(¬A)]
 *
 * Supports multiple signal types: alert severity, frequency bursts, MITRE
 * tactic weights, payload entropy, and temporal recency.
 */

/* ─── Types ─────────────────────────────────────────────── */

export type SignalType =
  | 'severity'       // alert severity level (low/medium/high/critical)
  | 'frequency'      // alert burst rate (alerts per minute)
  | 'mitre_weight'   // MITRE ATT&CK technique weight (1-5)
  | 'entropy'        // payload entropy (bits/byte)
  | 'temporal';      // time since last alert (seconds)

export interface SignalEvidence {
  type: SignalType;
  value: number;          // observed value
  timestamp: number;      // ms epoch
}

export interface LikelihoodFunction {
  /** P(evidence_value | attack) — probability of observing this value during an attack */
  givenAttack: (value: number) => number;
  /** P(evidence_value | no_attack) — probability of observing this value during normal ops */
  givenNoAttack: (value: number) => number;
}

export interface BayesianForecast {
  /** P(attack | evidence) — posterior probability */
  probability: number;
  /** P(attack) — prior before latest update */
  prior: number;
  /** Logged evidence used in the latest update */
  evidence: SignalEvidence[];
  /** Number of signals processed */
  signalCount: number;
  /** Forecast confidence (0-1) — based on signal diversity */
  confidence: number;
  /** Timestamp of the last evidence ingestion */
  lastUpdated: number;
  /** Simplified threat level label */
  threatLevel: 'low' | 'elevated' | 'high' | 'critical';
}

/* ─── Default likelihood models ─────────────────────────── */

/**
 * Default likelihood functions for each signal type.
 * Calibrated for a financial network security context.
 */
export const DEFAULT_LIKELIHOODS: Record<SignalType, LikelihoodFunction> = {
  severity: {
    // Severity: 0=low, 1=medium, 2=high, 3=critical
    givenAttack: (v: number) => {
      if (v >= 3) return 0.85;
      if (v >= 2) return 0.70;
      if (v >= 1) return 0.40;
      return 0.15;
    },
    givenNoAttack: (v: number) => {
      if (v >= 3) return 0.02;
      if (v >= 2) return 0.08;
      if (v >= 1) return 0.25;
      return 0.65;
    },
  },

  frequency: {
    // Frequency: alerts per minute (normalised 0-50)
    givenAttack: (v: number) => {
      // High burst rate is very likely during attack
      const normalised = Math.min(v / 50, 1);
      return 0.15 + normalised * 0.80;
    },
    givenNoAttack: (v: number) => {
      const normalised = Math.min(v / 50, 1);
      return 0.70 * Math.exp(-3 * normalised);
    },
  },

  mitre_weight: {
    // MITRE weight: 1-5
    givenAttack: (v: number) => {
      if (v >= 5) return 0.90;
      if (v >= 4) return 0.75;
      if (v >= 3) return 0.55;
      if (v >= 2) return 0.35;
      return 0.20;
    },
    givenNoAttack: (v: number) => {
      if (v >= 5) return 0.03;
      if (v >= 4) return 0.08;
      if (v >= 3) return 0.20;
      if (v >= 2) return 0.35;
      return 0.55;
    },
  },

  entropy: {
    // Entropy: 0-8 bits/byte (normal traffic ~4-6, encrypted exfil >7.2)
    givenAttack: (v: number) => {
      const normalised = Math.min(v / 8, 1);
      return normalised * 0.95;
    },
    givenNoAttack: (v: number) => {
      const normalised = Math.min(v / 8, 1);
      // Low entropy is normal; high entropy is rare in benign traffic
      return 0.80 * Math.exp(-5 * Math.max(0, normalised - 0.5));
    },
  },

  temporal: {
    // Temporal: seconds since last alert (shorter bursts = more likely attack)
    givenAttack: (v: number) => {
      // Very recent alerts are attack-significant
      if (v < 5) return 0.80;
      if (v < 30) return 0.55;
      if (v < 120) return 0.30;
      return 0.10;
    },
    givenNoAttack: (v: number) => {
      if (v < 5) return 0.15;
      if (v < 30) return 0.30;
      if (v < 120) return 0.45;
      return 0.60;
    },
  },
};

/* ─── Prior configuration ───────────────────────────────── */

export interface PriorConfig {
  /** Base rate of attack in the environment (default 0.05 = 5%) */
  baseRate: number;
  /** Decay factor for evidence weight over time (0-1, higher = faster decay) */
  temporalDecay: number;
  /** Minimum number of distinct signal types needed for high confidence */
  minSignalsForConfidence: number;
}

const DEFAULT_PRIOR: PriorConfig = {
  baseRate: 0.05,
  temporalDecay: 0.3,
  minSignalsForConfidence: 3,
};

/* ─── Core Bayesian Engine ──────────────────────────────── */

export class BayesianForecaster {
  private prior: number;
  private posterior: number;
  private evidence: SignalEvidence[];
  private signalTypesSeen: Set<SignalType>;
  private lastUpdateTime: number;
  private config: PriorConfig;
  private likelihoods: Record<SignalType, LikelihoodFunction>;

  constructor(config?: Partial<PriorConfig>) {
    this.config = { ...DEFAULT_PRIOR, ...config };
    this.prior = this.config.baseRate;
    this.posterior = this.config.baseRate;
    this.evidence = [];
    this.signalTypesSeen = new Set();
    this.lastUpdateTime = Date.now();
    this.likelihoods = { ...DEFAULT_LIKELIHOODS };
  }

  /**
   * Register a custom likelihood function for a signal type.
   * Allows the caller to override the default model for specific sensors.
   */
  setLikelihood(type: SignalType, fn: LikelihoodFunction): void {
    this.likelihoods[type] = fn;
  }

  /**
   * Ingest a new signal and update the posterior probability.
   * Uses Bayes' theorem: P(A|E) ∝ P(E|A) * P(A)
   */
  ingestSignal(type: SignalType, value: number): BayesianForecast {
    const timestamp = Date.now();
    const signal: SignalEvidence = { type, value, timestamp };

    this.evidence.push(signal);
    this.signalTypesSeen.add(type);

    // Apply temporal decay to prior based on time since last update
    const elapsed = (timestamp - this.lastUpdateTime) / 1000; // seconds
    const decay = Math.exp(-this.config.temporalDecay * elapsed / 60);
    const currentPrior = this.prior * decay + this.config.baseRate * (1 - decay);

    // Get likelihoods
    const likelihood = this.likelihoods[type];
    const pEgA = likelihood.givenAttack(value);
    const pEgNA = likelihood.givenNoAttack(value);

    // Bayes' theorem
    const pEgA_prior = pEgA * currentPrior;
    const pEgNA_prior = pEgNA * (1 - currentPrior);
    const evidenceProb = pEgA_prior + pEgNA_prior;

    this.posterior = evidenceProb > 0
      ? pEgA_prior / evidenceProb
      : currentPrior;

    this.prior = currentPrior;
    this.lastUpdateTime = timestamp;

    // Keep a rolling window of the last 50 signals
    if (this.evidence.length > 50) {
      this.evidence = this.evidence.slice(-50);
    }

    return this.getForecast();
  }

  /**
   * Compute forecast confidence based on signal diversity.
   * More distinct signal types = higher confidence.
   * Caps at 0.95 to reflect irreducible uncertainty.
   */
  getConfidence(): number {
    const distinctCount = this.signalTypesSeen.size;
    if (distinctCount === 0) return 0;
    const ratio = distinctCount / 5; // 5 total signal types
    return Math.min(0.95, ratio * 0.8 + 0.05);
  }

  /**
   * Get the current forecast.
   */
  getForecast(): BayesianForecast {
    const prob = this.posterior;
    const confidence = this.getConfidence();

    let threatLevel: BayesianForecast['threatLevel'];
    if (prob >= 0.70) threatLevel = 'critical';
    else if (prob >= 0.45) threatLevel = 'high';
    else if (prob >= 0.20) threatLevel = 'elevated';
    else threatLevel = 'low';

    return {
      probability: prob,
      prior: this.prior,
      evidence: [...this.evidence],
      signalCount: this.evidence.length,
      confidence,
      lastUpdated: this.lastUpdateTime,
      threatLevel,
    };
  }

  /**
   * Get the threat probability as a percentage for display (0-100).
   */
  getProbabilityPercent(): number {
    return Math.round(this.posterior * 100);
  }

  /**
   * Reset the forecaster to initial state.
   */
  reset(): void {
    this.prior = this.config.baseRate;
    this.posterior = this.config.baseRate;
    this.evidence = [];
    this.signalTypesSeen = new Set();
    this.lastUpdateTime = Date.now();
  }

  /**
   * Generate a descriptive text explaining the current forecast.
   */
  getExplanation(): string {
    const fc = this.getForecast();
    const pct = Math.round(fc.probability * 100);
    const conf = Math.round(fc.confidence * 100);

    if (fc.signalCount === 0) {
      return 'Awaiting signals. Baseline prior: ' + Math.round(this.config.baseRate * 100) + '%';
    }

    const recentSignals = this.evidence.slice(-5).map((s) => s.type).join(', ');

    const explanations: Record<string, string> = {
      low: `Low attack probability (${pct}%). Current signals (${recentSignals}) are consistent with normal operations. Confidence: ${conf}%.`,
      elevated: `Elevated attack probability (${pct}%). Recent signals (${recentSignals}) deviate from baseline. Monitor closely. Confidence: ${conf}%.`,
      high: `High attack probability (${pct}%). Evidence from ${recentSignals} strongly suggests active threat. Confidence: ${conf}%.`,
      critical: `CRITICAL attack probability (${pct}%). Converging evidence from ${recentSignals} indicates active attack in progress. Confidence: ${conf}%. Immediate response required.`,
    };

    return explanations[fc.threatLevel];
  }
}

/**
 * Factory: create a BayesianForecaster pre-configured for a financial SOC.
 */
export function createFinancialForecaster(): BayesianForecaster {
  return new BayesianForecaster({
    baseRate: 0.04,
    temporalDecay: 0.25,
    minSignalsForConfidence: 3,
  });
}
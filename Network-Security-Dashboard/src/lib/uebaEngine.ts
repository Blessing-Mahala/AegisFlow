/**
 * User & Entity Behavior Analytics (UEBA) Engine
 *
 * Baselines "normal" behavior per user/device and flags deviations
 * using statistical models. Core enterprise SOC concept.
 *
 * Methodology:
 * - Welford's online algorithm for streaming mean + variance (O(1) memory)
 * - Z-score anomaly detection with configurable thresholds
 * - Exponential temporal decay (recent behavior weighted more heavily)
 * - Multi-metric profiles per entity
 */

/* ─── Types ─────────────────────────────────────────────── */

export type MetricName =
  | 'login_frequency'        // Logins per hour
  | 'transaction_volume'     // Transactions per hour
  | 'data_transfer'          // MB transferred per hour
  | 'api_call_rate'          // API calls per minute
  | 'session_duration'       // Average session duration in minutes
  | 'geo_velocity'           // Geographic distance between consecutive logins (km/h)
  | 'failed_login_rate'      // Failed logins per hour
  | 'privilege_escalations'; // Privilege change requests per hour

export interface MetricProfile {
  /** Running mean (Welford's algorithm) */
  mean: number;
  /** Running M2 (sum of squares of differences from the mean) */
  m2: number;
  /** Number of observations */
  count: number;
  /** Variance (computed from M2 / count) */
  variance: number;
  /** Standard deviation */
  stdDev: number;
  /** Last observed value */
  lastValue: number;
  /** Z-score of the last observation */
  lastZScore: number;
  /** Timestamp of last update */
  lastUpdated: number;
  /** Whether the profile is "warm" (has enough observations) */
  warm: boolean;
}

export interface EntityProfile {
  /** Entity identifier (user ID, device MAC, IP) */
  id: string;
  /** Human-readable label */
  label: string;
  /** Entity type */
  type: 'user' | 'device' | 'ip_address';
  /** Metrics tracked for this entity */
  metrics: Partial<Record<MetricName, MetricProfile>>;
  /** Overall anomaly score (weighted combination) */
  overallAnomalyScore: number;
  /** Number of anomalous metrics */
  anomalousMetricCount: number;
  /** When the profile was created */
  createdAt: number;
  /** When the profile was last updated */
  lastUpdated: number;
  /** Current risk level */
  riskLevel: 'normal' | 'suspicious' | 'anomalous' | 'critical';
}

export interface UEBAConfig {
  /** Number of observations before a metric is "warm" */
  warmupThreshold: number;
  /** Z-score threshold for flagging an anomaly (default 2.5) */
  anomalyThreshold: number;
  /** Z-score threshold for critical anomaly (default 3.5) */
  criticalThreshold: number;
  /** Temporal decay factor per hour (0-1, higher = faster decay) */
  decayPerHour: number;
  /** Maximum entities to track */
  maxEntities: number;
}

export interface AnomalyEvent {
  entityId: string;
  entityLabel: string;
  metric: MetricName;
  observedValue: number;
  meanValue: number;
  zScore: number;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface UEBAState {
  entities: Map<string, EntityProfile>;
  anomalyHistory: AnomalyEvent[];
  totalObservations: number;
  config: UEBAConfig;
}

/* ─── Metric metadata ──────────────────────────────────── */

export const METRIC_LABELS: Record<MetricName, string> = {
  login_frequency: 'Login Frequency',
  transaction_volume: 'Transaction Volume',
  data_transfer: 'Data Transfer',
  api_call_rate: 'API Call Rate',
  session_duration: 'Session Duration',
  geo_velocity: 'Geo Velocity',
  failed_login_rate: 'Failed Login Rate',
  privilege_escalations: 'Privilege Escalations',
};

export const METRIC_UNITS: Record<MetricName, string> = {
  login_frequency: '/hr',
  transaction_volume: '/hr',
  data_transfer: 'MB/hr',
  api_call_rate: '/min',
  session_duration: 'min',
  geo_velocity: 'km/h',
  failed_login_rate: '/hr',
  privilege_escalations: '/hr',
};

export const METRIC_THRESHOLD_DEFAULTS: Record<MetricName, number> = {
  login_frequency: 2,
  transaction_volume: 2.5,
  data_transfer: 2.5,
  api_call_rate: 2.0,
  session_duration: 2.0,
  geo_velocity: 3.0,
  failed_login_rate: 3.0,
  privilege_escalations: 3.5,
};

/* ─── UEBA Engine ───────────────────────────────────────── */

const DEFAULT_CONFIG: UEBAConfig = {
  warmupThreshold: 10,
  anomalyThreshold: 2.5,
  criticalThreshold: 3.5,
  decayPerHour: 0.1,
  maxEntities: 100,
};

export class UEBAEngine {
  private state: UEBAState;

  constructor(config?: Partial<UEBAConfig>) {
    this.state = {
      entities: new Map(),
      anomalyHistory: [],
      totalObservations: 0,
      config: { ...DEFAULT_CONFIG, ...config },
    };
  }

  /* ─── Core: Welford's online update ──────────────────── */

  /**
   * Update a metric's running mean and variance using Welford's algorithm.
   * Applies temporal decay to down-weight older observations.
   */
  private updateMetricProfile(
    profile: MetricProfile,
    value: number,
    timestamp: number,
  ): MetricProfile {
    const elapsed = (timestamp - profile.lastUpdated) / (1000 * 60 * 60); // hours
    const decay = Math.exp(-this.state.config.decayPerHour * elapsed);

    // Apply decay: reduce count and variance contribution of old data
    const effectiveCount = profile.count > 0
      ? 1 + profile.count * decay
      : 1;

    // Welford's online update
    const delta = value - profile.mean;
    const newMean = profile.mean + delta / effectiveCount;
    const delta2 = value - newMean;
    const newM2 = profile.m2 * decay + delta * delta2;
    const newCount = effectiveCount;
    const newVariance = newCount > 1 ? newM2 / (newCount - 1) : 0;
    const newStdDev = Math.sqrt(newVariance);
    const newZScore = newStdDev > 0 ? (value - newMean) / newStdDev : 0;

    return {
      mean: newMean,
      m2: newM2,
      count: Math.round(newCount),
      variance: newVariance,
      stdDev: newStdDev,
      lastValue: value,
      lastZScore: newZScore,
      lastUpdated: timestamp,
      warm: newCount >= this.state.config.warmupThreshold,
    };
  }

  /* ─── Public API ─────────────────────────────────────── */

  /**
   * Record a behavioral observation for an entity.
   * Automatically creates the entity profile if it doesn't exist.
   * Returns any anomaly events generated.
   */
  recordObservation(
    entityId: string,
    entityLabel: string,
    entityType: EntityProfile['type'],
    metric: MetricName,
    value: number,
    timestamp: number = Date.now(),
  ): AnomalyEvent | null {
    this.state.totalObservations++;

    // Get or create entity profile
    let profile = this.state.entities.get(entityId);
    if (!profile) {
      // Enforce max entities
      if (this.state.entities.size >= this.state.config.maxEntities) {
        // Evict oldest inactive entity
        const oldest = [...this.state.entities.entries()]
          .sort((a, b) => a[1].lastUpdated - b[1].lastUpdated)[0];
        if (oldest) this.state.entities.delete(oldest[0]);
      }

      profile = {
        id: entityId,
        label: entityLabel,
        type: entityType,
        metrics: {},
        overallAnomalyScore: 0,
        anomalousMetricCount: 0,
        createdAt: timestamp,
        lastUpdated: timestamp,
        riskLevel: 'normal',
      };
    }

    // Update metric profile
    const existingMetric = profile.metrics[metric] ?? {
      mean: value,
      m2: 0,
      count: 0,
      variance: 0,
      stdDev: 0,
      lastValue: value,
      lastZScore: 0,
      lastUpdated: timestamp,
      warm: false,
    };

    profile.metrics[metric] = this.updateMetricProfile(existingMetric, value, timestamp);
    profile.lastUpdated = timestamp;

    // Compute overall anomaly score (RMS of z-scores across all warm metrics)
    const warmMetrics = Object.values(profile.metrics).filter((m) => m.warm);
    if (warmMetrics.length > 0) {
      const sumSq = warmMetrics.reduce((s, m) => s + m.lastZScore ** 2, 0);
      profile.overallAnomalyScore = Math.sqrt(sumSq / warmMetrics.length);
      profile.anomalousMetricCount = warmMetrics.filter(
        (m) => Math.abs(m.lastZScore) >= this.state.config.anomalyThreshold,
      ).length;

      // Determine risk level
      const maxAbsZ = Math.max(...warmMetrics.map((m) => Math.abs(m.lastZScore)));
      if (maxAbsZ >= this.state.config.criticalThreshold) {
        profile.riskLevel = 'critical';
      } else if (profile.anomalousMetricCount >= 2) {
        profile.riskLevel = 'anomalous';
      } else if (maxAbsZ >= this.state.config.anomalyThreshold) {
        profile.riskLevel = 'suspicious';
      } else {
        profile.riskLevel = 'normal';
      }
    }

    this.state.entities.set(entityId, profile);

    // Generate anomaly event if metric is warm and exceeds threshold
    const metricProfile = profile.metrics[metric]!;
    if (metricProfile.warm && Math.abs(metricProfile.lastZScore) >= this.state.config.anomalyThreshold) {
      const absZ = Math.abs(metricProfile.lastZScore);
      let severity: AnomalyEvent['severity'];
      if (absZ >= this.state.config.criticalThreshold) severity = 'critical';
      else if (absZ >= 3.0) severity = 'high';
      else if (absZ >= this.state.config.anomalyThreshold) severity = 'medium';
      else severity = 'low';

      const anomaly: AnomalyEvent = {
        entityId,
        entityLabel,
        metric,
        observedValue: value,
        meanValue: Math.round(metricProfile.mean * 100) / 100,
        zScore: Math.round(metricProfile.lastZScore * 100) / 100,
        timestamp,
        severity,
        description: `${entityLabel} — ${METRIC_LABELS[metric]} deviated ${metricProfile.lastZScore > 0 ? 'above' : 'below'} baseline ` +
          `(observed: ${value.toFixed(1)} ${METRIC_UNITS[metric]}, baseline: ${metricProfile.mean.toFixed(1)} ${METRIC_UNITS[metric]}, z=${metricProfile.lastZScore.toFixed(2)})`,
      };

      this.state.anomalyHistory.push(anomaly);
      // Keep only last 200 anomalies
      if (this.state.anomalyHistory.length > 200) {
        this.state.anomalyHistory = this.state.anomalyHistory.slice(-200);
      }

      return anomaly;
    }

    return null;
  }

  /**
   * Get the profile for a specific entity.
   */
  getEntityProfile(entityId: string): EntityProfile | undefined {
    return this.state.entities.get(entityId);
  }

  /**
   * Get all entities sorted by anomaly score (highest first).
   */
  getEntitiesByRisk(): EntityProfile[] {
    return [...this.state.entities.values()]
      .filter((e) => e.overallAnomalyScore > 0)
      .sort((a, b) => b.overallAnomalyScore - a.overallAnomalyScore);
  }

  /**
   * Get entities at a specific risk level.
   */
  getEntitiesByRiskLevel(level: EntityProfile['riskLevel']): EntityProfile[] {
    return [...this.state.entities.values()].filter((e) => e.riskLevel === level);
  }

  /**
   * Get recent anomaly events.
   */
  getRecentAnomalies(count = 20): AnomalyEvent[] {
    return this.state.anomalyHistory.slice(-count).reverse();
  }

  /**
   * Get overall engine statistics.
   */
  getStats(): {
    totalEntities: number;
    totalObservations: number;
    totalAnomalies: number;
    normalCount: number;
    suspiciousCount: number;
    anomalousCount: number;
    criticalCount: number;
  } {
    const entities = [...this.state.entities.values()];
    return {
      totalEntities: entities.length,
      totalObservations: this.state.totalObservations,
      totalAnomalies: this.state.anomalyHistory.length,
      normalCount: entities.filter((e) => e.riskLevel === 'normal').length,
      suspiciousCount: entities.filter((e) => e.riskLevel === 'suspicious').length,
      anomalousCount: entities.filter((e) => e.riskLevel === 'anomalous').length,
      criticalCount: entities.filter((e) => e.riskLevel === 'critical').length,
    };
  }

  /**
   * Reset the engine to initial state.
   */
  reset(): void {
    this.state.entities.clear();
    this.state.anomalyHistory = [];
    this.state.totalObservations = 0;
  }
}

/**
 * Factory: create a UEBA engine pre-configured for financial SOC.
 */
export function createFinancialUEBA(): UEBAEngine {
  return new UEBAEngine({
    warmupThreshold: 15,
    anomalyThreshold: 2.5,
    criticalThreshold: 3.5,
    decayPerHour: 0.15,
    maxEntities: 200,
  });
}

/**
 * Seed UEBA engine with initial entity profiles for demo purposes.
 */
export function seedUEBAEngine(engine: UEBAEngine): void {
  const entities = [
    { id: 'user-alice', label: 'Alice Chen (Finance)', type: 'user' as const },
    { id: 'user-bob', label: 'Bob Martinez (Ops)', type: 'user' as const },
    { id: 'user-carol', label: 'Carol Smith (Exec)', type: 'user' as const },
    { id: 'device-atm-01', label: 'ATM #1001 (Lobby)', type: 'device' as const },
    { id: 'device-atm-02', label: 'ATM #1002 (Drive-up)', type: 'device' as const },
    { id: 'device-server-db', label: 'Core DB Server', type: 'device' as const },
    { id: 'ip-10.0.1.10', label: '10.0.1.10 (Core Banking)', type: 'ip_address' as const },
    { id: 'ip-10.0.2.22', label: '10.0.2.22 (ATM Cluster)', type: 'ip_address' as const },
  ];

  const now = Date.now();

  for (const entity of entities) {
    // Seed normal login frequency (1-8 per hour)
    for (let i = 0; i < 20; i++) {
      const hourAgo = now - i * 60 * 60 * 1000;
      engine.recordObservation(
        entity.id, entity.label, entity.type,
        'login_frequency',
        3 + Math.random() * 5,
        hourAgo,
      );
    }

    // Seed normal transaction volume
    for (let i = 0; i < 15; i++) {
      const hourAgo = now - i * 60 * 60 * 1000;
      engine.recordObservation(
        entity.id, entity.label, entity.type,
        'transaction_volume',
        50 + Math.random() * 200,
        hourAgo,
      );
    }

    // Seed normal data transfer
    for (let i = 0; i < 12; i++) {
      const hourAgo = now - i * 60 * 60 * 1000;
      engine.recordObservation(
        entity.id, entity.label, entity.type,
        'data_transfer',
        10 + Math.random() * 40,
        hourAgo,
      );
    }

    // Seed API call rate
    for (let i = 0; i < 10; i++) {
      const hourAgo = now - i * 60 * 60 * 1000;
      engine.recordObservation(
        entity.id, entity.label, entity.type,
        'api_call_rate',
        20 + Math.random() * 60,
        hourAgo,
      );
    }
  }

  // Inject recent anomaly for one entity
  engine.recordObservation(
    'ip-10.0.2.22', '10.0.2.22 (ATM Cluster)', 'ip_address',
    'data_transfer',
    350, // 10x normal — highly anomalous
    now,
  );

  engine.recordObservation(
    'device-atm-01', 'ATM #1001 (Lobby)', 'device',
    'failed_login_rate',
    47, // massive spike
    now,
  );
}
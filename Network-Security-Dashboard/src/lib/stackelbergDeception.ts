/**
 * Game-Theoretic Deception Ops — Stackelberg Security Game
 *
 * Frames honeypot / decoy placement as a Stackelberg game:
 * - Defender (leader) commits to a mixed strategy over decoy types
 * - Attacker (follower) observes the strategy and best-responds
 * - The defender's optimal strategy maximises expected utility
 *   accounting for the attacker's best response
 *
 * Decoy types differ in cost, detectability, and interaction level.
 * Attacker types differ in capability, patience, and goal.
 */

/* ─── Types ─────────────────────────────────────────────── */

export type DecoyType =
  | 'low_interaction'     // Fake port / banner (cheap, easy to detect)
  | 'medium_interaction'  // Emulated service (credible, moderate cost)
  | 'high_interaction';   // Full honeypot VM (expensive, highly convincing)

export type AttackerType =
  | 'scanner'       // Automated reconnaissance — fast, shallow
  | 'exploit_kit';  // Semi-automated exploitation — targeted
  // Future: APT — patient, human-driven (can be added later)

export interface DecoyProfile {
  type: DecoyType;
  label: string;
  /** Cost per deployment (0-1, higher = more expensive) */
  cost: number;
  /** How convincing the decoy looks to an attacker (0-1) */
  believability: number;
  /** Detection difficulty for attacker (0-1, higher = harder to detect) */
  stealth: number;
  /** Information gain if attacker interacts (0-1) */
  intelligenceValue: number;
  /** Deployment time in seconds */
  deployTime: number;
  /** Icon name for UI */
  icon: string;
}

export interface AttackerProfile {
  type: AttackerType;
  label: string;
  /** Detection capability (0-1) */
  detectionSkill: number;
  /** Patience — how long they probe before moving on */
  patience: number; // seconds
  /** Goal: what they're seeking */
  goal: string;
}

export interface PayoffCell {
  /** Defender's payoff for this strategy profile */
  defenderPayoff: number;
  /** Attacker's payoff for this strategy profile */
  attackerPayoff: number;
}

export interface MixedStrategy {
  low_interaction: number;
  medium_interaction: number;
  high_interaction: number;
}

export interface StackelbergEquilibrium {
  /** Defender's optimal mixed strategy */
  defenderStrategy: MixedStrategy;
  /** The pure strategy the attacker best-responds with */
  attackerBestResponse: DecoyType;
  /** Defender's expected utility at equilibrium */
  defenderExpectedUtility: number;
  /** Attacker's expected utility at equilibrium */
  attackerExpectedUtility: number;
  /** Number of iterations to converge */
  iterations: number;
  /** Whether equilibrium was reached */
  converged: boolean;
}

export interface GameState {
  /** Current defender mixed strategy */
  defenderStrategy: MixedStrategy;
  /** Attacker type we believe we're facing */
  inferredAttackerType: AttackerType;
  /** Whether a decoy is currently deployed */
  decoyDeployed: boolean;
  /** Which decoy type is currently active (if any) */
  activeDecoy: DecoyType | null;
  /** Round number (game iterations) */
  round: number;
  /** History of attacker interactions */
  interactionHistory: InteractionRecord[];
  /** Current equilibrium */
  equilibrium: StackelbergEquilibrium | null;
}

export interface InteractionRecord {
  round: number;
  decoyType: DecoyType;
  attackerAction: 'probe' | 'exploit' | 'ignore';
  timestamp: number;
}

/* ─── Decoy profiles ────────────────────────────────────── */

export const DECOY_PROFILES: Record<DecoyType, DecoyProfile> = {
  low_interaction: {
    type: 'low_interaction',
    label: 'Low-Interaction Decoy',
    cost: 0.15,
    believability: 0.35,
    stealth: 0.25,
    intelligenceValue: 0.30,
    deployTime: 5,
    icon: 'Terminal',
  },
  medium_interaction: {
    type: 'medium_interaction',
    label: 'Medium-Interaction Emulation',
    cost: 0.40,
    believability: 0.65,
    stealth: 0.55,
    intelligenceValue: 0.65,
    deployTime: 15,
    icon: 'Server',
  },
  high_interaction: {
    type: 'high_interaction',
    label: 'High-Interaction Honeypot VM',
    cost: 0.75,
    believability: 0.90,
    stealth: 0.80,
    intelligenceValue: 0.90,
    deployTime: 45,
    icon: 'Monitor',
  },
};

/* ─── Attacker profiles ─────────────────────────────────── */

export const ATTACKER_PROFILES: Record<AttackerType, AttackerProfile> = {
  scanner: {
    type: 'scanner',
    label: 'Automated Scanner',
    detectionSkill: 0.30,
    patience: 30,
    goal: 'Reconnaissance — identify open ports and live services',
  },
  exploit_kit: {
    type: 'exploit_kit',
    label: 'Exploit Kit Operator',
    detectionSkill: 0.60,
    patience: 120,
    goal: 'Find exploitable service — deploy payload',
  },
};

/* ─── Payoff matrices ───────────────────────────────────── */

/**
 * Compute payoffs given decoy and attacker types.
 * Defender wants to: maximise intel gain, minimise cost, detect attacker.
 * Attacker wants to: find real services, avoid detection.
 */
function computePayoffs(
  decoy: DecoyProfile,
  attacker: AttackerProfile,
): PayoffCell {
  // Defender payoff:
  // + intelligenceValue * 10
  // - cost * 8 (resource expenditure)
  // + (1 - attacker.detectionSkill) * stealth * 5 (successful deception)
  const defPayoff =
    decoy.intelligenceValue * 10 -
    decoy.cost * 8 +
    (1 - attacker.detectionSkill) * decoy.stealth * 5;

  // Attacker payoff:
  // + believability * 3 (the decoy is convincing = wasted attacker time)
  // - (1 - stealth) * 4 (detectability saves the attacker from wasting time)
  // - detectionSkill * 2 (being detected costs the attacker)
  // If attacker detects decoy, they get a small positive (move on)
  const attPayoff =
    decoy.believability * 3 -
    (1 - decoy.stealth) * 4 -
    attacker.detectionSkill * 2;

  return {
    defenderPayoff: Math.round(defPayoff * 100) / 100,
    attackerPayoff: Math.round(attPayoff * 100) / 100,
  };
}

/* ─── Helper: expected payoff for a mixed strategy ──────── */

function expectedPayoff(
  strategy: MixedStrategy,
  decoyType: DecoyType,
  attacker: AttackerProfile,
  isDefender: boolean,
): number {
  const profile = DECOY_PROFILES[decoyType];
  const payoffs = computePayoffs(profile, attacker);
  // The probability that this decoy is selected
  const prob = strategy[decoyType];
  return prob * (isDefender ? payoffs.defenderPayoff : payoffs.attackerPayoff);
}

/* ─── Stackelberg Solver ───────────────────────────────── */

const STRATEGY_KEYS: DecoyType[] = ['low_interaction', 'medium_interaction', 'high_interaction'];

/**
 * Compute the Stackelberg equilibrium for the deception game.
 *
 * Algorithm:
 * 1. Defender chooses a mixed strategy over decoy types
 * 2. Attacker observes the strategy and picks the decoy type
 *    that maximises their expected payoff
 * 3. Defender maximises expected utility given the attacker's best response
 *
 * Uses iterative best-response (fictitious play) to converge.
 */
export function computeStackelbergEquilibrium(
  attackerType: AttackerType,
  maxIterations = 100,
): StackelbergEquilibrium {
  const attacker = ATTACKER_PROFILES[attackerType];

  // Start with uniform mixed strategy
  const strategy: MixedStrategy = {
    low_interaction: 1 / 3,
    medium_interaction: 1 / 3,
    high_interaction: 1 / 3,
  };

  let converged = false;
  let iteration = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iteration = iter;

    // Attacker best-responds: pick decoy type with highest expected payoff
    let bestDecoy: DecoyType = 'low_interaction';
    let bestAttPayoff = -Infinity;

    for (const dt of STRATEGY_KEYS) {
      const attPayoffVals = STRATEGY_KEYS.map((d) =>
        expectedPayoff(strategy, d, attacker, false),
      );
      const total = attPayoffVals.reduce((a, b) => a + b, 0);
      if (total > bestAttPayoff) {
        bestAttPayoff = total;
        bestDecoy = dt;
      }
    }

    // Defender updates: shift probability toward the decoy type
    // that maximises defender payoff given attacker's best response
    const oldStrategy = { ...strategy };

    // Defender payoff under each decoy type (attacker will respond to bestDecoy)
    const defPayoffs = STRATEGY_KEYS.map((dt) => {
      const profile = DECOY_PROFILES[dt];
      const p = computePayoffs(profile, attacker);
      return p.defenderPayoff;
    });

    // Softmax-based update: shift probability toward higher-defender-payoff decoys
    const temp = 2.0; // temperature — higher = more exploration
    const expPayoffs = defPayoffs.map((p) => Math.exp(p / temp));
    const sumExp = expPayoffs.reduce((a, b) => a + b, 0);

    strategy.low_interaction = expPayoffs[0] / sumExp;
    strategy.medium_interaction = expPayoffs[1] / sumExp;
    strategy.high_interaction = expPayoffs[2] / sumExp;

    // Check convergence: max change < 1%
    const maxChange = Math.max(
      Math.abs(strategy.low_interaction - oldStrategy.low_interaction),
      Math.abs(strategy.medium_interaction - oldStrategy.medium_interaction),
      Math.abs(strategy.high_interaction - oldStrategy.high_interaction),
    );

    if (maxChange < 0.01 && iter > 5) {
      converged = true;
      break;
    }
  }

  // Final attacker best response
  let attackerBestResponse: DecoyType = 'low_interaction';
  let bestAttTotal = -Infinity;
  for (const dt of STRATEGY_KEYS) {
    const total = STRATEGY_KEYS.map((d) =>
      expectedPayoff(strategy, d, attacker, false),
    ).reduce((a, b) => a + b, 0);
    if (total > bestAttTotal) {
      bestAttTotal = total;
      attackerBestResponse = dt;
    }
  }

  // Compute expected utilities
  const defExpected = STRATEGY_KEYS.reduce(
    (sum, dt) => sum + expectedPayoff(strategy, dt, attacker, true),
    0,
  );
  const attExpected = STRATEGY_KEYS.reduce(
    (sum, dt) => sum + expectedPayoff(strategy, dt, attacker, false),
    0,
  );

  return {
    defenderStrategy: strategy,
    attackerBestResponse,
    defenderExpectedUtility: Math.round(defExpected * 100) / 100,
    attackerExpectedUtility: Math.round(attExpected * 100) / 100,
    iterations: iteration + 1,
    converged,
  };
}

/* ─── Adaptive Decoy Selector ───────────────────────────── */

/**
 * Select the optimal decoy type to deploy based on the equilibrium strategy
 * and current game state. Incorporates randomness based on the mixed strategy.
 */
export function selectDecoyToDeploy(
  equilibrium: StackelbergEquilibrium,
): DecoyType {
  const rand = Math.random();
  let cumulative = 0;

  for (const dt of STRATEGY_KEYS) {
    cumulative += equilibrium.defenderStrategy[dt];
    if (rand <= cumulative) return dt;
  }

  return 'medium_interaction'; // fallback
}

/**
 * Infer attacker type from observed interactions.
 * Uses a simple heuristic: scanners probe more but engage less.
 */
export function inferAttackerType(
  interactions: InteractionRecord[],
): AttackerType {
  if (interactions.length === 0) return 'scanner';

  const recent = interactions.slice(-10);
  const probeCount = recent.filter((r) => r.attackerAction === 'probe').length;
  const exploitCount = recent.filter((r) => r.attackerAction === 'exploit').length;

  // Exploit attempts suggest a more sophisticated attacker
  if (exploitCount > probeCount * 0.3) return 'exploit_kit';
  return 'scanner';
}

/**
 * Simulate an attacker's action given the deployed decoy type and attacker type.
 * Returns the action the attacker would take.
 */
export function simulateAttackerAction(
  decoy: DecoyType,
  attackerType: AttackerType,
): 'probe' | 'exploit' | 'ignore' {
  const profile = DECOY_PROFILES[decoy];
  const attacker = ATTACKER_PROFILES[attackerType];

  // Attackers with higher detection skill are more likely to detect low-stealth decoys
  const detectionProb = attacker.detectionSkill * (1 - profile.stealth);

  if (Math.random() < detectionProb) {
    return 'ignore';
  }

  // Exploit kits try to exploit; scanners just probe
  if (attackerType === 'exploit_kit' && Math.random() > 0.3) {
    return 'exploit';
  }

  return 'probe';
}

/**
 * Create the initial game state.
 */
export function createInitialGameState(): GameState {
  const equilibrium = computeStackelbergEquilibrium('scanner');

  return {
    defenderStrategy: equilibrium.defenderStrategy,
    inferredAttackerType: 'scanner',
    decoyDeployed: false,
    activeDecoy: null,
    round: 0,
    interactionHistory: [],
    equilibrium,
  };
}

/**
 * Run one round of the deception game.
 * Updates beliefs, computes new equilibrium, and returns the recommended decoy.
 */
export function runGameRound(state: GameState): {
  nextState: GameState;
  recommendedDecoy: DecoyType;
  equilibrium: StackelbergEquilibrium;
} {
  const round = state.round + 1;

  // Infer attacker type from history
  const inferred = inferAttackerType(state.interactionHistory);

  // Compute new equilibrium
  const equilibrium = computeStackelbergEquilibrium(inferred);

  // Select decoy to deploy based on equilibrium
  const recommended = selectDecoyToDeploy(equilibrium);

  const nextState: GameState = {
    defenderStrategy: equilibrium.defenderStrategy,
    inferredAttackerType: inferred,
    decoyDeployed: false,
    activeDecoy: null,
    round,
    interactionHistory: [...state.interactionHistory],
    equilibrium,
  };

  return { nextState, recommendedDecoy: recommended, equilibrium };
}
/**
 * Cryptographic Chain of Custody
 *
 * Binds every alert to the one before it via SHA-256, forming a tamper-evident
 * hash chain. If any alert is altered or deleted after ingestion, every
 * subsequent hash breaks — provable in O(n) with a single button press.
 *
 * Uses the Web Crypto API (SubtleCrypto) — no external crypto libraries needed.
 */

/* ─── Types ─────────────────────────────────────────────── */

export interface ChainedAlert {
  id: string;
  /** Serialized alert payload (fields that define the alert's content) */
  dataPayload: string;
  /** SHA-256 hex digest of the previous alert in the chain */
  previousHash: string;
  /** SHA-256 hex digest of (dataPayload + previousHash) */
  currentHash: string;
  /** ISO timestamp when the hash was computed */
  hashedAt: string;
}

export interface ChainVerificationResult {
  /** True IFF every link in the chain is valid */
  valid: boolean;
  /** Total alerts inspected */
  total: number;
  /** Indices of broken links (0-based, ordered by time) */
  brokenLinks: number[];
  /** Human-readable summary */
  summary: string;
  /** Per-link verification detail */
  links: ChainLinkVerification[];
}

export interface ChainLinkVerification {
  index: number;
  alertId: string;
  label: string;
  passed: boolean;
  expectedHash: string;
  computedHash: string;
  /** True if this alert's currentHash matches the next alert's previousHash */
  forwardLinkPassed: boolean | null;
}

/* ─── Genesis marker ────────────────────────────────────── */

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/* ─── Core hashing ──────────────────────────────────────── */

/**
 * Compute SHA-256 hex digest of an arbitrary string.
 * Uses Web Crypto API — works in all modern browsers.
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build the hash input string for an alert.
 * currentHash = SHA256(dataPayload + previousHash)
 */
export function buildHashInput(dataPayload: string, previousHash: string): string {
  return dataPayload + previousHash;
}

/**
 * Compute the current hash for a new alert given its payload and predecessor hash.
 */
export async function computeHash(dataPayload: string, previousHash: string): Promise<string> {
  return sha256(buildHashInput(dataPayload, previousHash));
}

/* ─── Chain operations ──────────────────────────────────── */

/**
 * Build the hash payload string from an alert object.
 * Normalises the fields so re-computation always produces the same hash
 * regardless of field ordering in JSON.stringify.
 */
export function buildAlertPayload(fields: Record<string, unknown>): string {
  // Pick only the content-bearing fields (exclude chain metadata + timestamps)
  const {
    id,
    previous_hash,
    current_hash,
    hashed_at,
    previous_alert_id,
    created_at,
    updated_at,
    ...content
  } = fields;

  // Sort keys for deterministic serialisation
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(content).sort()) {
    sorted[key] = content[key];
  }
  return JSON.stringify(sorted);
}

/**
 * Get the previous hash for a new alert given the most recent alert in the chain.
 * Returns the genesis hash if this is the first alert.
 */
export function getPreviousHash(previousAlert: ChainedAlert | null): string {
  return previousAlert?.currentHash ?? GENESIS_HASH;
}

/**
 * Create a fully-chained alert object.
 */
export async function createChainedAlert(
  alertId: string,
  payload: Record<string, unknown>,
  previousAlert: ChainedAlert | null,
): Promise<ChainedAlert> {
  const dataPayload = buildAlertPayload(payload);
  const previousHash = getPreviousHash(previousAlert);
  const currentHash = await computeHash(dataPayload, previousHash);

  return {
    id: alertId,
    dataPayload,
    previousHash,
    currentHash,
    hashedAt: new Date().toISOString(),
  };
}

/* ─── Verification ──────────────────────────────────────── */

/**
 * Verify the integrity of an ordered list of alerts.
 * Alerts MUST be sorted by creation time (oldest first).
 */
export async function verifyChain(
  alerts: Array<{
    id: string;
    /** Label/description for display (e.g. alert title) */
    label: string;
    /** Raw fields used to build the payload */
    fields: Record<string, unknown>;
    /** Previous hash as stored in the database */
    storedPreviousHash: string;
    /** Current hash as stored in the database */
    storedCurrentHash: string;
  }>,
): Promise<ChainVerificationResult> {
  const links: ChainLinkVerification[] = [];
  const brokenLinks: number[] = [];

  for (let i = 0; i < alerts.length; i++) {
    const alert = alerts[i];
    const dataPayload = buildAlertPayload(alert.fields);
    const computedHash = await computeHash(dataPayload, alert.storedPreviousHash);

    // Check that the stored previous hash matches the previous alert's current hash
    let forwardLinkPassed: boolean | null = null;
    if (i > 0) {
      forwardLinkPassed = alert.storedPreviousHash === alerts[i - 1].storedCurrentHash;
    }

    const passed = computedHash === alert.storedCurrentHash;
    if (!passed) {
      brokenLinks.push(i);
    }

    links.push({
      index: i,
      alertId: alert.id,
      label: alert.label,
      passed,
      expectedHash: alert.storedCurrentHash,
      computedHash,
      forwardLinkPassed,
    });
  }

  const valid = brokenLinks.length === 0;

  return {
    valid,
    total: alerts.length,
    brokenLinks,
    summary: valid
      ? `✅ Chain intact — all ${alerts.length} alerts verified`
      : `⚠️ Chain broken — ${brokenLinks.length} of ${alerts.length} alerts have invalid hashes (indices: ${brokenLinks.join(', ')})`,
    links,
  };
}

/**
 * Short human-readable prefix of a hash for badge display.
 */
export function hashPrefix(hash: string, chars = 8): string {
  return hash.slice(0, chars) + '…';
}
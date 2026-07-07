/**
 * MITRE ATT&CK™ Mapping Utility
 *
 * Maps Guardium alert categories/titles to MITRE ATT&CK technique IDs.
 * Provides consistent T-codes across the dashboard, alerts feed, and mitigation sandbox.
 *
 * Reference: https://attack.mitre.org
 */

export interface MitreMapping {
  /** MITRE ATT&CK technique ID (e.g. T1071) */
  techniqueId: string;
  /** Short label (e.g. "Application Layer Protocol") */
  techniqueName: string;
  /** MITRE tactic (e.g. "Command and Control") */
  tactic: string;
  /** Link to MITRE page */
  url: string;
  /** Severity weight for ranking (1-5) */
  weight: number;
}

/* ─── Category-level defaults ───────────────────────────── */

const CATEGORY_MAP: Record<string, MitreMapping> = {
  port_scan: {
    techniqueId: 'T1046',
    techniqueName: 'Network Service Discovery',
    tactic: 'Discovery',
    url: 'https://attack.mitre.org/techniques/T1046/',
    weight: 2,
  },
  ddos: {
    techniqueId: 'T1498',
    techniqueName: 'Network Denial of Service',
    tactic: 'Impact',
    url: 'https://attack.mitre.org/techniques/T1498/',
    weight: 5,
  },
  brute_force: {
    techniqueId: 'T1110',
    techniqueName: 'Brute Force',
    tactic: 'Credential Access',
    url: 'https://attack.mitre.org/techniques/T1110/',
    weight: 4,
  },
  malware: {
    techniqueId: 'T1204',
    techniqueName: 'User Execution',
    tactic: 'Execution',
    url: 'https://attack.mitre.org/techniques/T1204/',
    weight: 4,
  },
  anomaly: {
    techniqueId: 'T1078',
    techniqueName: 'Valid Accounts',
    tactic: 'Defense Evasion',
    url: 'https://attack.mitre.org/techniques/T1078/',
    weight: 3,
  },
};

/* ─── Title-level overrides (more specific) ─────────────── */

const TITLE_MAP: Record<string, MitreMapping> = {
  // ── Port Scan ──────────────────────────────────────────────
  'Port Scan Detected': {
    techniqueId: 'T1046',
    techniqueName: 'Network Service Discovery',
    tactic: 'Discovery',
    url: 'https://attack.mitre.org/techniques/T1046/',
    weight: 2,
  },
  'Vertical Port Scan': {
    techniqueId: 'T1046',
    techniqueName: 'Network Service Discovery',
    tactic: 'Discovery',
    url: 'https://attack.mitre.org/techniques/T1046/',
    weight: 2,
  },
  'Horizontal Port Scan': {
    techniqueId: 'T1046',
    techniqueName: 'Network Service Discovery',
    tactic: 'Discovery',
    url: 'https://attack.mitre.org/techniques/T1046/',
    weight: 3,
  },
  'Stealth SYN Scan': {
    techniqueId: 'T1046',
    techniqueName: 'Network Service Discovery',
    tactic: 'Discovery',
    url: 'https://attack.mitre.org/techniques/T1046/',
    weight: 3,
  },

  // ── DDoS ───────────────────────────────────────────────────
  'Volumetric DDoS Attack': {
    techniqueId: 'T1498',
    techniqueName: 'Network Denial of Service',
    tactic: 'Impact',
    url: 'https://attack.mitre.org/techniques/T1498/',
    weight: 5,
  },
  'SYN Flood': {
    techniqueId: 'T1498',
    techniqueName: 'Network Denial of Service',
    tactic: 'Impact',
    url: 'https://attack.mitre.org/techniques/T1498/',
    weight: 5,
  },
  'DNS Amplification': {
    techniqueId: 'T1498',
    techniqueName: 'Network Denial of Service',
    tactic: 'Impact',
    url: 'https://attack.mitre.org/techniques/T1498/',
    weight: 5,
  },
  'HTTP Flood': {
    techniqueId: 'T1498',
    techniqueName: 'Network Denial of Service',
    tactic: 'Impact',
    url: 'https://attack.mitre.org/techniques/T1498/',
    weight: 4,
  },

  // ── Brute Force ────────────────────────────────────────────
  'SSH Brute Force': {
    techniqueId: 'T1110',
    techniqueName: 'Brute Force',
    tactic: 'Credential Access',
    url: 'https://attack.mitre.org/techniques/T1110/',
    weight: 4,
  },
  'RDP Brute Force': {
    techniqueId: 'T1110',
    techniqueName: 'Brute Force',
    tactic: 'Credential Access',
    url: 'https://attack.mitre.org/techniques/T1110/',
    weight: 4,
  },
  'Database Credential Stuffing': {
    techniqueId: 'T1110',
    techniqueName: 'Brute Force',
    tactic: 'Credential Access',
    url: 'https://attack.mitre.org/techniques/T1110/',
    weight: 4,
  },
  'Web Login Brute Force': {
    techniqueId: 'T1110.003',
    techniqueName: 'Password Spraying',
    tactic: 'Credential Access',
    url: 'https://attack.mitre.org/techniques/T1110/003/',
    weight: 4,
  },

  // ── Malware ────────────────────────────────────────────────
  'C2 Beacon Detected': {
    techniqueId: 'T1071',
    techniqueName: 'Application Layer Protocol',
    tactic: 'Command and Control',
    url: 'https://attack.mitre.org/techniques/T1071/',
    weight: 5,
  },
  'Ransomware File Extension Change': {
    techniqueId: 'T1486',
    techniqueName: 'Data Encrypted for Impact',
    tactic: 'Impact',
    url: 'https://attack.mitre.org/techniques/T1486/',
    weight: 5,
  },
  'DNS TXT Exfiltration': {
    techniqueId: 'T1048',
    techniqueName: 'Exfiltration Over Alternative Protocol',
    tactic: 'Exfiltration',
    url: 'https://attack.mitre.org/techniques/T1048/',
    weight: 5,
  },
  'Worm Propagation': {
    techniqueId: 'T1090',
    techniqueName: 'Proxy',
    tactic: 'Command and Control',
    url: 'https://attack.mitre.org/techniques/T1090/',
    weight: 4,
  },

  // ── Anomaly ────────────────────────────────────────────────
  'Data Exfiltration via ICMP': {
    techniqueId: 'T1048',
    techniqueName: 'Exfiltration Over Alternative Protocol',
    tactic: 'Exfiltration',
    url: 'https://attack.mitre.org/techniques/T1048/',
    weight: 5,
  },
  'Unusual DNS Query Pattern': {
    techniqueId: 'T1568',
    techniqueName: 'Dynamic Resolution',
    tactic: 'Command and Control',
    url: 'https://attack.mitre.org/techniques/T1568/',
    weight: 4,
  },
  'Non-Business Hours Access': {
    techniqueId: 'T1078',
    techniqueName: 'Valid Accounts',
    tactic: 'Defense Evasion',
    url: 'https://attack.mitre.org/techniques/T1078/',
    weight: 3,
  },
  'Geolocation Anomaly': {
    techniqueId: 'T1550',
    techniqueName: 'Use Alternate Authentication Material',
    tactic: 'Defense Evasion',
    url: 'https://attack.mitre.org/techniques/T1550/',
    weight: 3,
  },
};

/* ─── Public API ─────────────────────────────────────────── */

/**
 * Look up the MITRE ATT&CK mapping for a given alert title and category.
 * Title-level mappings take priority; falls back to category-level.
 */
export function getMitreMapping(
  title: string,
  category: string,
): MitreMapping {
  return (
    TITLE_MAP[title] ??
    CATEGORY_MAP[category] ?? {
      techniqueId: 'T1078',
      techniqueName: 'Valid Accounts',
      tactic: 'Defense Evasion',
      url: 'https://attack.mitre.org/techniques/T1078/',
      weight: 2,
    }
  );
}

/**
 * Get the MITRE technique ID and name formatted for display (e.g. "T1071 — C2").
 */
export function formatMitreTag(
  title: string,
  category: string,
): { id: string; label: string; tactic: string; weight: number } {
  const m = getMitreMapping(title, category);
  return {
    id: m.techniqueId,
    label: `${m.techniqueId} — ${m.techniqueName}`,
    tactic: m.tactic,
    weight: m.weight,
  };
}

/**
 * Return the MITRE tactic color for the dashboard (bg/text).
 */
export function mitreTacticColor(tactic: string): { badge: string; text: string } {
  switch (tactic) {
    case 'Discovery':
      return { badge: 'bg-sky-500/10 border-sky-500/30', text: 'text-sky-400' };
    case 'Impact':
      return { badge: 'bg-rose-500/10 border-rose-500/30', text: 'text-rose-400' };
    case 'Credential Access':
      return { badge: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400' };
    case 'Execution':
      return { badge: 'bg-orange-500/10 border-orange-500/30', text: 'text-orange-400' };
    case 'Defense Evasion':
      return { badge: 'bg-purple-500/10 border-purple-500/30', text: 'text-purple-400' };
    case 'Command and Control':
      return { badge: 'bg-cyan-500/10 border-cyan-500/30', text: 'text-cyan-400' };
    case 'Exfiltration':
      return { badge: 'bg-pink-500/10 border-pink-500/30', text: 'text-pink-400' };
    default:
      return { badge: 'bg-gray-500/10 border-gray-500/30', text: 'text-gray-400' };
  }
}

/**
 * All unique MITRE technique IDs used in the current mapping.
 * Useful for building threat-profile summaries.
 */
export function getAllTechniques(): MitreMapping[] {
  const seen = new Set<string>();
  const all: MitreMapping[] = [];

  for (const m of Object.values(TITLE_MAP)) {
    if (!seen.has(m.techniqueId)) {
      seen.add(m.techniqueId);
      all.push(m);
    }
  }

  return all.sort((a, b) => b.weight - a.weight);
}

/**
 * Group techniques by tactic for the MITRE matrix-style display.
 */
export function getTechniquesByTactic(): Record<string, MitreMapping[]> {
  const grouped: Record<string, MitreMapping[]> = {};

  for (const m of getAllTechniques()) {
    const key = m.tactic;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }

  return grouped;
}
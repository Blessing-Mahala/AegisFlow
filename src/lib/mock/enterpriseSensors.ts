// ─── Enterprise sensor mock data ────────────────────────────────
// 20+ sensors organized into 4 network zones for large-deployment demo.

export type ZoneId = 'core' | 'perimeter' | 'branch' | 'datacenter';
export type SensorStatus = 'healthy' | 'high_traffic' | 'offline';

export interface EnterpriseSensor {
  id: string;
  tag: string;
  name: string;
  location: string;
  zone: ZoneId;
  zoneLabel: string;
  cpu_usage: number;
  memory_usage: number;
  vram_usage: number;
  packets_per_sec: number;
  packet_drop_rate: number;        // percentage 0–1
  link_speed: number;              // Mbps
  link_type: 'ethernet' | 'wifi' | 'fiber';
  uptime_seconds: number;
  firmware_version: string;
  status: SensorStatus;
  last_seen: string;
  sparkline: number[];             // last ~20 PPS snapshots
}

// ── Per-zone sensor definitions with baselines ──────────────────

function makeSensor(
  tag: string,
  name: string,
  location: string,
  zone: ZoneId,
  zoneLabel: string,
  baseline: {
    cpu: number;
    mem: number;
    vram: number;
    pps: number;
    dropRate: number;
    linkSpeed: number;
    linkType: EnterpriseSensor['link_type'];
    firmware: string;
    status: SensorStatus;
    uptimeDays: number;
  },
): EnterpriseSensor {
  const sparkline = Array.from({ length: 24 }, () =>
    Math.round(baseline.pps * (0.7 + Math.random() * 0.6)),
  );
  return {
    id: `ent-${tag.toLowerCase()}`,
    tag,
    name,
    location,
    zone,
    zoneLabel,
    cpu_usage: baseline.cpu,
    memory_usage: baseline.mem,
    vram_usage: baseline.vram,
    packets_per_sec: baseline.pps,
    packet_drop_rate: baseline.dropRate,
    link_speed: baseline.linkSpeed,
    link_type: baseline.linkType,
    uptime_seconds: baseline.uptimeDays * 86400,
    firmware_version: baseline.firmware,
    status: baseline.status,
    last_seen: new Date().toISOString(),
    sparkline,
  };
}

export const ENTERPRISE_SENSORS: EnterpriseSensor[] = [
  // ── Core Infrastructure ────────────────────────────────────
  makeSensor('SNSR-CORE-01', 'Core Spine Switch TOR-1',     'Main Gateway Switch',                'core', 'Core Infrastructure', { cpu: 47, mem: 52, vram: 38, pps: 4200, dropRate: 0.003, linkSpeed: 40000, linkType: 'fiber', firmware: 'v7.2.1', status: 'healthy', uptimeDays: 187 }),
  makeSensor('SNSR-CORE-02', 'Core Spine Switch TOR-2',     'Backbone Router Rack A2',            'core', 'Core Infrastructure', { cpu: 63, mem: 71, vram: 44, pps: 5800, dropRate: 0.008, linkSpeed: 40000, linkType: 'fiber', firmware: 'v7.2.1', status: 'high_traffic', uptimeDays: 93 }),
  makeSensor('SNSR-CORE-03', 'Aggregation Leaf-1',           'Core PoP NYC - Level 3',             'core', 'Core Infrastructure', { cpu: 28, mem: 34, vram: 22, pps: 1800, dropRate: 0.001, linkSpeed: 10000, linkType: 'fiber', firmware: 'v6.9.4', status: 'healthy', uptimeDays: 312 }),
  makeSensor('SNSR-CORE-04', 'Aggregation Leaf-2',           'Core PoP LON - Data Hall B',         'core', 'Core Infrastructure', { cpu: 51, mem: 58, vram: 41, pps: 3900, dropRate: 0.005, linkSpeed: 10000, linkType: 'fiber', firmware: 'v6.9.4', status: 'healthy', uptimeDays: 256 }),
  makeSensor('SNSR-CORE-05', 'Backbone Edge Router',         'Tier-1 Peering Exchange AMS',        'core', 'Core Infrastructure', { cpu: 82, mem: 79, vram: 66, pps: 12400, dropRate: 0.015, linkSpeed: 100000, linkType: 'fiber', firmware: 'v8.0.2', status: 'high_traffic', uptimeDays: 44 }),

  // ── Perimeter & DMZ ────────────────────────────────────────
  makeSensor('SNSR-DMZ-01', 'External Firewall Cluster-A',   'DMZ Perimeter - North Segment',      'perimeter', 'Perimeter & DMZ', { cpu: 71, mem: 68, vram: 53, pps: 7600, dropRate: 0.002, linkSpeed: 10000, linkType: 'fiber', firmware: 'v9.1.0', status: 'healthy', uptimeDays: 134 }),
  makeSensor('SNSR-DMZ-02', 'External Firewall Cluster-B',   'DMZ Perimeter - South Segment',      'perimeter', 'Perimeter & DMZ', { cpu: 39, mem: 44, vram: 31, pps: 2100, dropRate: 0.001, linkSpeed: 10000, linkType: 'fiber', firmware: 'v9.1.0', status: 'healthy', uptimeDays: 201 }),
  makeSensor('SNSR-DMZ-03', 'Web Proxy Gateway',             'Reverse Proxy Layer - DMZ',          'perimeter', 'Perimeter & DMZ', { cpu: 58, mem: 63, vram: 47, pps: 5100, dropRate: 0.004, linkSpeed: 1000, linkType: 'ethernet', firmware: 'v5.3.2', status: 'healthy', uptimeDays: 78 }),
  makeSensor('SNSR-DMZ-04', 'WAF & IPS Appliance',           'Application Security - DMZ',         'perimeter', 'Perimeter & DMZ', { cpu: 76, mem: 81, vram: 72, pps: 8900, dropRate: 0.009, linkSpeed: 10000, linkType: 'fiber', firmware: 'v10.2.1', status: 'high_traffic', uptimeDays: 15 }),
  makeSensor('SNSR-DMZ-05', 'VPN Concentrator',              'Remote Access Gateway - DMZ',        'perimeter', 'Perimeter & DMZ', { cpu: 22, mem: 30, vram: 18, pps: 640, dropRate: 0.0005, linkSpeed: 1000, linkType: 'ethernet', firmware: 'v4.7.0', status: 'healthy', uptimeDays: 365 }),

  // ── Branch Offices ─────────────────────────────────────────
  makeSensor('SNSR-BR-01', 'NYC Office Edge',                'Finance Office - Manhattan',          'branch', 'Branch Offices', { cpu: 44, mem: 51, vram: 36, pps: 1500, dropRate: 0.002, linkSpeed: 1000, linkType: 'ethernet', firmware: 'v6.1.3', status: 'healthy', uptimeDays: 89 }),
  makeSensor('SNSR-BR-02', 'LON Office Edge',                'HR Segment - Canary Wharf',           'branch', 'Branch Offices', { cpu: 33, mem: 40, vram: 27, pps: 980, dropRate: 0.001, linkSpeed: 1000, linkType: 'ethernet', firmware: 'v6.1.3', status: 'healthy', uptimeDays: 142 }),
  makeSensor('SNSR-BR-03', 'SFO Office Edge',                'Engineering Office - SOMA',            'branch', 'Branch Offices', { cpu: 55, mem: 60, vram: 43, pps: 2700, dropRate: 0.003, linkSpeed: 1000, linkType: 'ethernet', firmware: 'v6.1.3', status: 'healthy', uptimeDays: 54 }),
  makeSensor('SNSR-BR-04', 'Remote Site - CHI',              'Distribution Center - Chicago',       'branch', 'Branch Offices', { cpu: 18, mem: 25, vram: 14, pps: 410, dropRate: 0.008, linkSpeed: 100, linkType: 'wifi', firmware: 'v5.9.2', status: 'high_traffic', uptimeDays: 12 }),
  makeSensor('SNSR-BR-05', 'Remote Site - TOK',              'Asia-Pacific Regional Office',        'branch', 'Branch Offices', { cpu: 67, mem: 72, vram: 55, pps: 3400, dropRate: 0.004, linkSpeed: 1000, linkType: 'ethernet', firmware: 'v6.1.3', status: 'healthy', uptimeDays: 71 }),

  // ── Datacenter / Cloud Clusters ────────────────────────────
  makeSensor('SNSR-DB-AMD-01', 'DB Cluster Node AMD-1',      'Fintech Server Rack B - Row 12',     'datacenter', 'Datacenter & Cloud', { cpu: 89, mem: 78, vram: 93, pps: 15200, dropRate: 0.002, linkSpeed: 40000, linkType: 'fiber', firmware: 'v7.4.0-epyc', status: 'healthy', uptimeDays: 203 }),
  makeSensor('SNSR-DB-AMD-02', 'DB Cluster Node AMD-2',      'Fintech Server Rack B - Row 12',     'datacenter', 'Datacenter & Cloud', { cpu: 74, mem: 66, vram: 88, pps: 12100, dropRate: 0.001, linkSpeed: 40000, linkType: 'fiber', firmware: 'v7.4.0-epyc', status: 'high_traffic', uptimeDays: 203 }),
  makeSensor('SNSR-DB-AMD-03', 'DB Cluster Node AMD-3',      'Analytics Server Rack C - Row 14',   'datacenter', 'Datacenter & Cloud', { cpu: 91, mem: 85, vram: 96, pps: 19800, dropRate: 0.003, linkSpeed: 40000, linkType: 'fiber', firmware: 'v7.4.0-epyc', status: 'healthy', uptimeDays: 96 }),
  makeSensor('SNSR-DB-AMD-04', 'DB Cluster Node AMD-4',      'Analytics Server Rack C - Row 14',   'datacenter', 'Datacenter & Cloud', { cpu: 0, mem: 0, vram: 0, pps: 0, dropRate: 100, linkSpeed: 40000, linkType: 'fiber', firmware: 'v7.4.0-epyc', status: 'offline', uptimeDays: 0 }),
  makeSensor('SNSR-CLOUD-01', 'AWS VPC Gateway (us-east-1)', 'Cloud Cluster - EC2 Reserved',       'datacenter', 'Datacenter & Cloud', { cpu: 35, mem: 42, vram: 29, pps: 2200, dropRate: 0.001, linkSpeed: 10000, linkType: 'fiber', firmware: 'v6.2.0-cloud', status: 'healthy', uptimeDays: 318 }),
  makeSensor('SNSR-CLOUD-02', 'GCP VPC Gateway (us-west1)',  'Cloud Cluster - GCE N2 Node',        'datacenter', 'Datacenter & Cloud', { cpu: 41, mem: 48, vram: 34, pps: 1700, dropRate: 0.002, linkSpeed: 10000, linkType: 'fiber', firmware: 'v6.2.0-cloud', status: 'healthy', uptimeDays: 267 }),
  makeSensor('SNSR-CLOUD-03', 'Azure VNet Gateway (europe)', 'Cloud Cluster - Azure F72s v2',      'datacenter', 'Datacenter & Cloud', { cpu: 56, mem: 61, vram: 45, pps: 3100, dropRate: 0.004, linkSpeed: 10000, linkType: 'fiber', firmware: 'v6.2.0-cloud', status: 'healthy', uptimeDays: 144 }),
];


// ── Zone label lookup ───────────────────────────────────────────
const ZONE_LABEL_MAP: Record<ZoneId, string> = {
  core: 'Core Infrastructure',
  perimeter: 'Perimeter & DMZ',
  branch: 'Branch Offices',
  datacenter: 'Datacenter & Cloud',
};

export function getZoneLabel(zone: ZoneId | string): string {
  return ZONE_LABEL_MAP[zone as ZoneId] ?? zone;
}

export const ZONE_TABS: { id: ZoneId; label: string; icon: string }[] = [
  { id: 'core',        label: 'Core Infrastructure',   icon: '🖧' },
  { id: 'perimeter',   label: 'Perimeter & DMZ',       icon: '🛡' },
  { id: 'branch',      label: 'Branch Offices',         icon: '🏢' },
  { id: 'datacenter',  label: 'Datacenter & Cloud',    icon: '☁' },
];

// ── Helpers ─────────────────────────────────────────────────────
export function getSensorsByZone(zone: ZoneId | 'all'): EnterpriseSensor[] {
  if (zone === 'all') return ENTERPRISE_SENSORS;
  return ENTERPRISE_SENSORS.filter((s) => s.zone === zone);
}

export function getFleetMetrics() {
  const total = ENTERPRISE_SENSORS.length;
  const online = ENTERPRISE_SENSORS.filter((s) => s.status !== 'offline').length;
  const offline = ENTERPRISE_SENSORS.filter((s) => s.status === 'offline').length;
  const highTraffic = ENTERPRISE_SENSORS.filter((s) => s.status === 'high_traffic').length;
  const totalPps = ENTERPRISE_SENSORS.reduce((sum, s) => sum + s.packets_per_sec, 0);
  const totalMbps = totalPps * 0.008; // rough PPS → Mbps (avg ~1KB/pkt)
  const avgDrop = ENTERPRISE_SENSORS.reduce((sum, s) => sum + s.packet_drop_rate, 0) / total;
  return { total, online, offline, highTraffic, totalPps, totalMbps, avgDrop };
}

// ── Live fluctuation (re‑runnable) ──────────────────────────────
export function fluctuateEnterpriseSensors(): EnterpriseSensor[] {
  return ENTERPRISE_SENSORS.map((s) => {
    if (s.status === 'offline') return s; // stay offline until "repaired"

    const cpu = clamp(s.cpu_usage + (Math.random() - 0.5) * 10, 0, 100);
    const mem = clamp(s.memory_usage + (Math.random() - 0.5) * 6, 0, 100);
    const vram = clamp(s.vram_usage + (Math.random() - 0.5) * 8, 0, 100);
    const pps = Math.max(0, s.packets_per_sec + Math.round((Math.random() - 0.5) * 400));
    const drop = clamp(s.packet_drop_rate + (Math.random() - 0.5) * 0.004, 0, 1);

    // Determine status from current load
    let status: SensorStatus = 'healthy';
    if (cpu > 85 || vram > 85 || drop > 0.02) status = 'high_traffic';

    const sparkline = [...s.sparkline.slice(1), pps];

    return {
      ...s,
      cpu_usage: Math.round(cpu * 10) / 10,
      memory_usage: Math.round(mem * 10) / 10,
      vram_usage: Math.round(vram * 10) / 10,
      packets_per_sec: pps,
      packet_drop_rate: Math.round(drop * 10000) / 10000,
      status,
      uptime_seconds: s.uptime_seconds + 10,
      last_seen: new Date().toISOString(),
      sparkline,
    };
  });
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

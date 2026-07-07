import type { Database } from '../database.types'

type Sensor = Database['public']['Tables']['sensors']['Row']
type SensorSetter = (sensors: Sensor[]) => void

// ── Enterprise sensor definitions (20 sensors across 4 zones) ──
export interface EnterpriseSensor extends Sensor {
  tag: string
  zone: 'core' | 'perimeter' | 'branch' | 'datacenter'
  segment: string
  bandwidth_current: number      // Mbps
  packet_drop_rate: number        // percentage 0–1
  gpu_load: number                // percentage 0–100
}

const ZONE_LABELS: Record<string, string> = {
  core: 'Core Infrastructure',
  perimeter: 'Perimeter & DMZ',
  branch: 'Branch Offices',
  datacenter: 'Datacenter / Cloud',
}

export function getZoneLabel(zone: string): string {
  return ZONE_LABELS[zone] ?? zone
}

const ENTERPRISE_SENSORS: Array<Omit<EnterpriseSensor, keyof Sensor> & {
  name: string; location: string; link_speed: number; link_type: string;
  firmware_version: string; cpu_usage: number; vram_usage: number;
  memory_usage: number; packets_per_sec: number; uptime_seconds: number;
  last_seen: string;
}> = [
  // ── Core Infrastructure (5) ──
  { tag: 'SNSR-CORE-01', zone: 'core', segment: 'Main Core Switch', name: 'Core-Switch-01', location: 'HQ NOC Rack A1', link_speed: 10000, link_type: 'ethernet', firmware_version: 'v3.2.1', cpu_usage: 45, vram_usage: 60, memory_usage: 55, packets_per_sec: 1200, uptime_seconds: 864000, last_seen: new Date().toISOString(), bandwidth_current: 3400, packet_drop_rate: 0.002, gpu_load: 12 },
  { tag: 'SNSR-CORE-02', zone: 'core', segment: 'Backup Core Switch', name: 'Core-Switch-02', location: 'HQ NOC Rack A2', link_speed: 10000, link_type: 'ethernet', firmware_version: 'v3.2.1', cpu_usage: 38, vram_usage: 52, memory_usage: 48, packets_per_sec: 980, uptime_seconds: 691200, last_seen: new Date().toISOString(), bandwidth_current: 2100, packet_drop_rate: 0.001, gpu_load: 8 },
  { tag: 'SNSR-CORE-03', zone: 'core', segment: 'Distribution Switch A', name: 'Dist-Switch-A', location: 'HQ IDF Rack B3', link_speed: 1000, link_type: 'ethernet', firmware_version: 'v2.9.4', cpu_usage: 62, vram_usage: 71, memory_usage: 58, packets_per_sec: 2800, uptime_seconds: 518400, last_seen: new Date().toISOString(), bandwidth_current: 780, packet_drop_rate: 0.008, gpu_load: 15 },
  { tag: 'SNSR-CORE-04', zone: 'core', segment: 'Distribution Switch B', name: 'Dist-Switch-B', location: 'HQ IDF Rack B4', link_speed: 1000, link_type: 'ethernet', firmware_version: 'v2.9.4', cpu_usage: 55, vram_usage: 65, memory_usage: 50, packets_per_sec: 2100, uptime_seconds: 432000, last_seen: new Date().toISOString(), bandwidth_current: 620, packet_drop_rate: 0.005, gpu_load: 10 },
  { tag: 'SNSR-CORE-05', zone: 'core', segment: 'Spine Router', name: 'Spine-RTR-01', location: 'HQ NOC Rack A5', link_speed: 10000, link_type: 'ethernet', firmware_version: 'v4.0.2', cpu_usage: 72, vram_usage: 80, memory_usage: 68, packets_per_sec: 5600, uptime_seconds: 950400, last_seen: new Date().toISOString(), bandwidth_current: 7200, packet_drop_rate: 0.015, gpu_load: 22 },

  // ── Perimeter & DMZ (5) ──
  { tag: 'SNSR-DMZ-01', zone: 'perimeter', segment: 'External Firewall', name: 'Firewall-Primary', location: 'DMZ Rack D1', link_speed: 10000, link_type: 'ethernet', firmware_version: 'v6.1.0', cpu_usage: 88, vram_usage: 45, memory_usage: 78, packets_per_sec: 8900, uptime_seconds: 172800, last_seen: new Date().toISOString(), bandwidth_current: 9600, packet_drop_rate: 0.12, gpu_load: 35 },
  { tag: 'SNSR-DMZ-02', zone: 'perimeter', segment: 'Web Proxy Server', name: 'WebProxy-01', location: 'DMZ Rack D2', link_speed: 1000, link_type: 'ethernet', firmware_version: 'v3.5.0', cpu_usage: 35, vram_usage: 42, memory_usage: 30, packets_per_sec: 450, uptime_seconds: 259200, last_seen: new Date().toISOString(), bandwidth_current: 180, packet_drop_rate: 0.001, gpu_load: 5 },
  { tag: 'SNSR-DMZ-03', zone: 'perimeter', segment: 'IDS/IPS Appliance', name: 'IDS-IPS-01', location: 'DMZ Rack D3', link_speed: 10000, link_type: 'ethernet', firmware_version: 'v5.2.3', cpu_usage: 91, vram_usage: 75, memory_usage: 82, packets_per_sec: 14000, uptime_seconds: 86400, last_seen: new Date().toISOString(), bandwidth_current: 11000, packet_drop_rate: 0.25, gpu_load: 78 },
  { tag: 'SNSR-DMZ-04', zone: 'perimeter', segment: 'VPN Concentrator', name: 'VPN-CONC-01', location: 'DMZ Rack D4', link_speed: 1000, link_type: 'ethernet', firmware_version: 'v4.1.1', cpu_usage: 52, vram_usage: 38, memory_usage: 44, packets_per_sec: 2200, uptime_seconds: 604800, last_seen: new Date().toISOString(), bandwidth_current: 340, packet_drop_rate: 0.003, gpu_load: 18 },
  { tag: 'SNSR-DMZ-05', zone: 'perimeter', segment: 'Load Balancer', name: 'LB-Primary', location: 'DMZ Rack D5', link_speed: 10000, link_type: 'ethernet', firmware_version: 'v3.8.0', cpu_usage: 47, vram_usage: 55, memory_usage: 51, packets_per_sec: 4800, uptime_seconds: 345600, last_seen: new Date().toISOString(), bandwidth_current: 5100, packet_drop_rate: 0.007, gpu_load: 20 },

  // ── Branch Offices (5) ──
  { tag: 'SNSR-BRN-01', zone: 'branch', segment: 'Finance Office', name: 'Finance-SW', location: 'NYC Office Rack F1', link_speed: 1000, link_type: 'ethernet', firmware_version: 'v2.5.0', cpu_usage: 23, vram_usage: 34, memory_usage: 30, packets_per_sec: 450, uptime_seconds: 1209600, last_seen: new Date().toISOString(), bandwidth_current: 120, packet_drop_rate: 0.001, gpu_load: 3 },
  { tag: 'SNSR-BRN-02', zone: 'branch', segment: 'HR Segment', name: 'HR-SW-01', location: 'NYC Office Rack F2', link_speed: 100, link_type: 'ethernet', firmware_version: 'v2.4.2', cpu_usage: 18, vram_usage: 22, memory_usage: 20, packets_per_sec: 180, uptime_seconds: 1555200, last_seen: new Date().toISOString(), bandwidth_current: 55, packet_drop_rate: 0.001, gpu_load: 2 },
  { tag: 'SNSR-BRN-03', zone: 'branch', segment: 'Remote DC-01', name: 'Remote-DC-SW', location: 'LON Colo Rack L1', link_speed: 1000, link_type: 'ethernet', firmware_version: 'v3.0.0', cpu_usage: 41, vram_usage: 48, memory_usage: 44, packets_per_sec: 1100, uptime_seconds: 691200, last_seen: new Date().toISOString(), bandwidth_current: 290, packet_drop_rate: 0.004, gpu_load: 7 },
  { tag: 'SNSR-BRN-04', zone: 'branch', segment: 'APAC Gateway', name: 'APAC-GW-01', location: 'SGP Data Center Rack S1', link_speed: 1000, link_type: 'ethernet', firmware_version: 'v3.1.1', cpu_usage: 67, vram_usage: 73, memory_usage: 70, packets_per_sec: 3800, uptime_seconds: 432000, last_seen: new Date().toISOString(), bandwidth_current: 890, packet_drop_rate: 0.018, gpu_load: 25 },
  { tag: 'SNSR-BRN-05', zone: 'branch', segment: 'EU Branch Switch', name: 'EU-Branch-SW', location: 'FRA Office Rack E1', link_speed: 1000, link_type: 'ethernet', firmware_version: 'v2.8.3', cpu_usage: 32, vram_usage: 28, memory_usage: 35, packets_per_sec: 720, uptime_seconds: 864000, last_seen: new Date().toISOString(), bandwidth_current: 190, packet_drop_rate: 0.002, gpu_load: 4 },

  // ── Datacenter / Cloud (5) ──
  { tag: 'SNSR-DB-AMD-01', zone: 'datacenter', segment: 'DB Cluster Node-1', name: 'DB-Node-AMD-01', location: 'DC Rack G1 - AMD EPYC', link_speed: 10000, link_type: 'ethernet', firmware_version: 'v4.2.0', cpu_usage: 78, vram_usage: 88, memory_usage: 82, packets_per_sec: 7800, uptime_seconds: 518400, last_seen: new Date().toISOString(), bandwidth_current: 8200, packet_drop_rate: 0.005, gpu_load: 65 },
  { tag: 'SNSR-DB-AMD-02', zone: 'datacenter', segment: 'DB Cluster Node-2', name: 'DB-Node-AMD-02', location: 'DC Rack G2 - AMD EPYC', link_speed: 10000, link_type: 'ethernet', firmware_version: 'v4.2.0', cpu_usage: 74, vram_usage: 85, memory_usage: 80, packets_per_sec: 7200, uptime_seconds: 475200, last_seen: new Date().toISOString(), bandwidth_current: 7900, packet_drop_rate: 0.004, gpu_load: 58 },
  { tag: 'SNSR-DB-AMD-03', zone: 'datacenter', segment: 'DB Cluster Node-3', name: 'DB-Node-AMD-03', location: 'DC Rack G3 - AMD EPYC', link_speed: 10000, link_type: 'ethernet', firmware_version: 'v4.2.0', cpu_usage: 82, vram_usage: 90, memory_usage: 86, packets_per_sec: 8500, uptime_seconds: 432000, last_seen: new Date().toISOString(), bandwidth_current: 9400, packet_drop_rate: 0.006, gpu_load: 72 },
  { tag: 'SNSR-DB-AMD-04', zone: 'datacenter', segment: 'DB Cluster Node-4', name: 'DB-Node-AMD-04', location: 'DC Rack G4 - AMD EPYC', link_speed: 10000, link_type: 'ethernet', firmware_version: 'v4.2.0', cpu_usage: 69, vram_usage: 76, memory_usage: 72, packets_per_sec: 6400, uptime_seconds: 388800, last_seen: new Date().toISOString(), bandwidth_current: 6800, packet_drop_rate: 0.003, gpu_load: 50 },
  { tag: 'SNSR-CLD-01', zone: 'datacenter', segment: 'AWS VPC Monitor', name: 'AWS-VPC-MON', location: 'us-east-1 VPC', link_speed: 1000, link_type: 'ethernet', firmware_version: 'v3.7.2', cpu_usage: 56, vram_usage: 44, memory_usage: 60, packets_per_sec: 3100, uptime_seconds: 259200, last_seen: new Date().toISOString(), bandwidth_current: 420, packet_drop_rate: 0.009, gpu_load: 14 },
]

/** Generate all 20 enterprise mock sensors, each with a unique UUID-like id */
export function generateEnterpriseSensors(teamId: string): EnterpriseSensor[] {
  return ENTERPRISE_SENSORS.map((e, i) => ({
    api_key: `ent_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
    cpu_usage: e.cpu_usage,
    vram_usage: e.vram_usage,
    memory_usage: e.memory_usage,
    created_at: new Date(Date.now() - e.uptime_seconds * 1000).toISOString(),
    firmware_version: e.firmware_version,
    id: `ent-${String(i).padStart(3, '0')}-${crypto.randomUUID().slice(0, 8)}`,
    last_seen: new Date().toISOString(),
    link_speed: e.link_speed,
    link_type: e.link_type,
    location: e.location,
    name: e.name,
    packets_per_sec: e.packets_per_sec,
    team_id: teamId,
    uptime_seconds: e.uptime_seconds,
    // Enterprise extensions
    tag: e.tag,
    zone: e.zone,
    segment: e.segment,
    bandwidth_current: e.bandwidth_current,
    packet_drop_rate: e.packet_drop_rate,
    gpu_load: e.gpu_load,
  }))
}

// ── Baseline / fluctuation helpers (shared with real sensors) ──
interface SensorBaseline {
  id: string
  cpu_usage: number
  vram_usage: number
  memory_usage: number
  packets_per_sec: number
}

function getBaseline(index: number): SensorBaseline {
  const baselines = [
    { cpu_usage: 45, vram_usage: 60, memory_usage: 55, packets_per_sec: 1200 },
    { cpu_usage: 72, vram_usage: 88, memory_usage: 65, packets_per_sec: 3400 },
    { cpu_usage: 23, vram_usage: 34, memory_usage: 30, packets_per_sec: 450 },
    { cpu_usage: 91, vram_usage: 45, memory_usage: 78, packets_per_sec: 8900 },
    { cpu_usage: 38, vram_usage: 72, memory_usage: 42, packets_per_sec: 2100 },
  ]
  const base = baselines[index % baselines.length]
  return { id: '', ...base }
}

function fluctuate(current: number, amount = 5, min = 0, max = 100): number {
  const delta = (Math.random() - 0.5) * 2 * amount
  const next = current + delta
  if (next < min) return min
  if (next > max) return max
  return Math.round(next * 10) / 10
}

function fluctuatePPS(current: number, amount = 200, min = 0): number {
  const delta = (Math.random() - 0.5) * 2 * amount
  const next = current + delta
  return next < min ? min : Math.round(next)
}

function fluctuateBW(current: number, amount = 100, min = 0): number {
  const delta = (Math.random() - 0.5) * 2 * amount
  const next = current + delta
  return next < min ? min : Math.round(next * 10) / 10
}

function fluctuateDrop(current: number): number {
  const delta = (Math.random() - 0.5) * 0.02
  const next = current + delta
  return next < 0 ? 0 : Math.round(next * 1000) / 1000
}

/**
 * Start a telemetry loop that updates sensor metrics every 10 seconds.
 * Works with both real (BaseSensor) and enterprise sensors.
 * Returns a cleanup function.
 */
export function startTelemetryLoop<T extends { id: string; cpu_usage?: number; vram_usage?: number; memory_usage?: number; packets_per_sec?: number }>(
  sensors: T[],
  setter: (sensors: T[]) => void,
): () => void {
  const baselines: SensorBaseline[] = sensors.map((s, i) => ({
    id: s.id,
    cpu_usage: s.cpu_usage ?? getBaseline(i).cpu_usage,
    vram_usage: s.vram_usage ?? getBaseline(i).vram_usage,
    memory_usage: s.memory_usage ?? getBaseline(i).memory_usage,
    packets_per_sec: s.packets_per_sec ?? getBaseline(i).packets_per_sec,
  }))

  const intervalId = setInterval(() => {
    const updated = sensors.map((s) => {
      const base = baselines.find((b) => b.id === s.id)
      if (!base) return s

      const cpu = fluctuate(s.cpu_usage ?? base.cpu_usage, 8, 0, 100)
      const vram = fluctuate(s.vram_usage ?? base.vram_usage, 6, 0, 100)
      const mem = fluctuate(s.memory_usage ?? base.memory_usage, 4, 0, 100)
      const pps = fluctuatePPS(s.packets_per_sec ?? base.packets_per_sec, 350, 0)
      const bw = 'bandwidth_current' in s ? fluctuateBW((s as any).bandwidth_current ?? 0, 120, 0) : undefined
      const drop = 'packet_drop_rate' in s ? fluctuateDrop((s as any).packet_drop_rate ?? 0) : undefined

      return {
        ...s,
        cpu_usage: cpu,
        vram_usage: vram,
        memory_usage: mem,
        packets_per_sec: pps,
        ...(bw !== undefined ? { bandwidth_current: bw } : {}),
        ...(drop !== undefined ? { packet_drop_rate: drop } : {}),
        uptime_seconds: (s.uptime_seconds ?? 0) + 10,
        last_seen: new Date().toISOString(),
      }
    })

    setter(updated)
  }, 10_000)

  return () => clearInterval(intervalId)
}

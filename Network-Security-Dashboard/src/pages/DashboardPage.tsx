import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { useMitigationStore } from '../stores/mitigationStore';
import { useScanStore } from '../stores/scanStore';
import { usePcapStore } from '../stores/pcapStore';
import LiveAlertsFeed from '../components/LiveAlertsFeed';
import { supabase } from '../lib/supabase/client';
import FraudCorrelationEngine from '../components/FraudCorrelationEngine';
import TrafficChart from '../components/TrafficChart';
import PacketFeed from '../components/PacketFeed';
import { format } from 'date-fns';
import { getMitreMapping, mitreTacticColor, getAllTechniques } from '../lib/mitre-attack';
import {
  Activity,
  Radio,
  AlertTriangle,
  Shield,
  Search,
  Upload,
  Siren,
  PlusCircle,
  ArrowUp,
  ArrowDown,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
  Gauge,
  RadioTower,
  Play,
  Square,
  Crosshair,
  Fingerprint,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

// ─── Color maps ──────────────────────────────────────────────
const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

const SEVERITY_BG: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  low: 'bg-green-500/10 text-green-400 border-green-500/20',
};

const PROTOCOL_COLORS: Record<string, string> = {
  TCP: '#3b82f6',
  UDP: '#8b5cf6',
  DNS: '#22c55e',
  HTTP: '#06b6d4',
  ICMP: '#f59e0b',
  HTTPS: '#10b981',
  ARP: '#f43f5e',
  OTHER: '#6b7280',
};

const PROTOCOL_PALE: Record<string, string> = {
  TCP: 'rgba(59,130,246,0.15)',
  UDP: 'rgba(139,92,246,0.15)',
  DNS: 'rgba(34,197,94,0.15)',
  HTTP: 'rgba(6,182,212,0.15)',
  ICMP: 'rgba(245,158,11,0.15)',
  HTTPS: 'rgba(16,185,129,0.15)',
  ARP: 'rgba(244,63,94,0.15)',
  OTHER: 'rgba(107,114,128,0.15)',
};

// ─── Quick-action card ───────────────────────────────────────
interface ActionCard {
  label: string;
  description: string;
  icon: React.ElementType;
  route: string;
  color: string;
}

const ACTIONS: ActionCard[] = [
  {
    label: 'New Scan',
    description: 'Run network scan on a target subnet',
    icon: Search,
    route: '/scanner',
    color: 'text-cyan-400',
  },
  {
    label: 'Upload PCAP',
    description: 'Analyze a captured pcap file',
    icon: Upload,
    route: '/pcap-analyzer',
    color: 'text-purple-400',
  },
  {
    label: 'View Alerts',
    description: 'Respond to security incidents',
    icon: Siren,
    route: '/mitigation',
    color: 'text-amber-400',
  },
  {
    label: 'Add Sensor',
    description: 'Deploy a new network sensor',
    icon: PlusCircle,
    route: '/sensors',
    color: 'text-emerald-400',
  },
];

// ─── Tooltip for pie charts ──────────────────────────────────
function PieTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-secondary border border-border rounded-lg p-3 shadow-lg text-sm">
        <p className="font-semibold text-foreground">{payload[0].name}</p>
        <p className="text-foreground/70">{payload[0].value} packets</p>
      </div>
    );
  }
  return null;
}

// ─── Main dashboard component ─────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const { selectedSensorId, packets, copilotOpen } = useAppStore();
  const { alerts: mitigationAlerts } = useMitigationStore();
  const { scanHistory } = useScanStore();
  const { captures } = usePcapStore();
  const [stats, setStats] = useState({
    packetsToday: 0,
    activeSensors: 0,
    uniqueProtocols: 0,
    totalBytes: 0,
  });

  // ── Live simulation state ───────────────────────────────────
  const [simulationActive, setSimulationActive] = useState(false);
  const [injectedCount, setInjectedCount] = useState(0);
  const simulationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runIngestion = useCallback(async () => {
    if (!user) return;
    try {
      const { error } = await supabase.functions.invoke('guardium-ingestor', {
        body: { count: 2 }, // inject 2 alerts per tick
      });
      if (!error) {
        setInjectedCount((c) => c + 2);
      }
    } catch {
      // silently fail — session token may not be ready
    }
  }, [user]);

  useEffect(() => {
    if (simulationActive) {
      // Fire immediately, then every 5 seconds
      runIngestion();
      simulationRef.current = setInterval(runIngestion, 5000);
    } else {
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
        simulationRef.current = null;
      }
    }
    return () => {
      if (simulationRef.current) clearInterval(simulationRef.current);
    };
  }, [simulationActive, runIngestion]);

  // ── Load real-time summary stats from Supabase ─────────────
  useEffect(() => {
    if (!profile?.team_id || !selectedSensorId) return;

    const loadStats = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [{ count: packetsToday }, { count: activeSensors }, { data: protocolData }, { data: bytesData }] =
        await Promise.all([
          supabase
            .from('packets')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', profile.team_id!)
            .eq('sensor_id', selectedSensorId)
            .gte('captured_at', today.toISOString()),
          supabase
            .from('sensors')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', profile.team_id!)
            .gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString()),
          supabase
            .from('packets')
            .select('protocol')
            .eq('team_id', profile.team_id!)
            .eq('sensor_id', selectedSensorId)
            .gte('captured_at', today.toISOString()),
          supabase
            .from('packets')
            .select('payload_size')
            .eq('team_id', profile.team_id!)
            .eq('sensor_id', selectedSensorId)
            .gte('captured_at', today.toISOString()),
        ]);

      const uniqueProtocols = new Set(protocolData?.map((p: any) => p.protocol) ?? []).size;
      const totalBytes = bytesData?.reduce((sum: number, p: any) => sum + (p.payload_size ?? 0), 0) ?? 0;

      setStats({
        packetsToday: packetsToday ?? 0,
        activeSensors: activeSensors ?? 0,
        uniqueProtocols,
        totalBytes,
      });
    };

    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [profile?.team_id, selectedSensorId]);

  // ── Derived: protocol distribution from in-memory packets ──
  const protocolDist = useMemo(() => {
    const counts: Record<string, number> = {};
    packets.forEach((p) => {
      counts[p.protocol] = (counts[p.protocol] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [packets]);

  // ── Derived: top talkers (source IPs by packet count) ──────
  const topTalkers = useMemo(() => {
    const counts: Record<string, { packets: number; bytes: number }> = {};
    packets.forEach((p) => {
      const ip = String(p.src_ip);
      if (!counts[ip]) counts[ip] = { packets: 0, bytes: 0 };
      counts[ip].packets++;
      counts[ip].bytes += p.payload_size ?? 0;
    });
    return Object.entries(counts)
      .map(([ip, data]) => ({ ip, ...data }))
      .sort((a, b) => b.packets - a.packets)
      .slice(0, 8);
  }, [packets]);

  // ── Derived: alert summary ─────────────────────────────────
  const alertSummary = useMemo(() => {
    const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const byStatus: Record<string, number> = {};
    mitigationAlerts.forEach((a) => {
      bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    });
    return { bySeverity, byStatus, total: mitigationAlerts.length };
  }, [mitigationAlerts]);

  // ── Derived: 24h activity timeline ──────────────────────────
  const timeline = useMemo(() => {
    const entries: Array<{ time: string; type: string; label: string; icon: React.ElementType; color: string }> = [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    // Mitigation alerts (most recent first, cap at 5)
    mitigationAlerts
      .filter((a) => new Date(a.createdAt).getTime() > cutoff)
      .slice(0, 5)
      .forEach((a) => {
        entries.push({
          time: a.createdAt,
          type: 'alert',
          label: `${a.title}`,
          icon: AlertCircle,
          color: SEVERITY_COLORS[a.severity] ?? '#6b7280',
        });
      });

    // Scans
    scanHistory
      .filter((s) => new Date(s.completedAt).getTime() > cutoff)
      .slice(0, 3)
      .forEach((s) => {
        entries.push({
          time: s.completedAt,
          type: 'scan',
          label: `Scan ${s.targetSubnet}`,
          icon: Search,
          color: '#06b6d4',
        });
      });

    // PCAP uploads
    captures
      .filter((c) => new Date(c.uploadedAt).getTime() > cutoff)
      .slice(0, 3)
      .forEach((c) => {
        entries.push({
          time: c.uploadedAt,
          type: 'upload',
          label: `Uploaded ${c.fileName}`,
          icon: Upload,
          color: '#8b5cf6',
        });
      });

    return entries.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8);
  }, [mitigationAlerts, scanHistory, captures]);

  // ── Stat cards ──────────────────────────────────────────────
  const statCards = [
    {
      label: 'Packets Today',
      value: stats.packetsToday.toLocaleString(),
      icon: Activity,
      color: 'text-accent',
    },
    {
      label: 'Active Sensors',
      value: stats.activeSensors.toString(),
      icon: Radio,
      color: 'text-cyan-400',
    },
    {
      label: 'Open Alerts',
      value: alertSummary.byStatus.open?.toLocaleString() ?? '0',
      icon: AlertTriangle,
      color: 'text-amber-400',
    },
    {
      label: 'Total Data',
      value:
        stats.totalBytes >= 1024 * 1024 * 1024
          ? `${(stats.totalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
          : stats.totalBytes >= 1024 * 1024
            ? `${(stats.totalBytes / (1024 * 1024)).toFixed(1)} MB`
            : stats.totalBytes >= 1024
              ? `${(stats.totalBytes / 1024).toFixed(1)} KB`
              : `${stats.totalBytes} B`,
      icon: Shield,
      color: 'text-purple-400',
    },
  ];

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* ── Header ────────────────────────────────────────── */}
        <div className="p-6 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-heading font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-foreground/60 mt-1">
              Real-time network security monitoring and threat overview
            </p>
          </div>

          {/* ── Live Simulation toggle ──────────────────────── */}
          <button
            onClick={() => setSimulationActive((a) => !a)}
            disabled={!user}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 cursor-pointer ${
              simulationActive
                ? 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse shadow-lg shadow-red-500/10'
                : 'bg-secondary text-foreground/70 border-border hover:border-accent/40 hover:text-foreground'
            } ${!user ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={!user ? 'Sign in to run simulation' : simulationActive ? 'Stop live simulation' : 'Start live simulation'}
          >
            {simulationActive ? (
              <Square className="w-4 h-4" />
            ) : (
              <RadioTower className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {simulationActive ? `Simulating… ${injectedCount} injected` : 'Live Simulation'}
            </span>
          </button>
        </div>

        {/* ── Quick-action toolbar ──────────────────────────── */}
        <div className="px-6 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => navigate(action.route)}
                  className="flex items-center gap-3 px-4 py-3 bg-secondary border border-border rounded-xl hover:border-accent/40 hover:bg-accent/[0.03] transition-all duration-200 group cursor-pointer text-left"
                >
                  <div className={`p-2 rounded-lg bg-background ${action.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground group-hover:text-accent transition-colors duration-200">
                      {action.label}
                    </p>
                    <p className="text-xs text-foreground/50 truncate">
                      {action.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Stats row ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-6 pb-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="bg-secondary border border-border rounded-xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-foreground/60 uppercase tracking-wider">
                    {card.label}
                  </span>
                  <Icon className={`w-4 h-4 ${card.color}`} />
                </div>
                <p className={`text-xl font-heading font-bold ${card.color}`}>
                  {card.value}
                </p>
              </div>
            );
          })}
        </div>

        {/* ── Middle row: Alert summary + Protocol pie + Top talkers ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-6 pb-4">
          {/* Alert summary widget */}
          <div className="bg-secondary border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Siren className="w-4 h-4 text-amber-400" />
              <h3 className="font-heading font-semibold text-sm text-foreground">Alert Summary</h3>
              <span className="ml-auto text-xs text-foreground/50">{alertSummary.total} total</span>
            </div>
            {/* Severity bars */}
            <div className="space-y-2.5">
              {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
                const count = alertSummary.bySeverity[sev] ?? 0;
                const pct = alertSummary.total > 0 ? (count / alertSummary.total) * 100 : 0;
                return (
                  <div key={sev}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="capitalize text-foreground/70">{sev}</span>
                      <span className="font-semibold text-foreground">{count}</span>
                    </div>
                    <div className="h-1.5 bg-background rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: SEVERITY_COLORS[sev] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Status breakdown chips */}
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
              {Object.entries(alertSummary.byStatus).map(([status, count]) => (
                <span
                  key={status}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${
                    status === 'open'
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : status === 'mitigated'
                        ? 'bg-green-500/10 text-green-400 border-green-500/20'
                        : status === 'acknowledged'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : status === 'dismissed'
                            ? 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                            : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                  }`}
                >
                  {status === 'open' && <AlertCircle className="w-3 h-3" />}
                  {status === 'mitigated' && <CheckCircle2 className="w-3 h-3" />}
                  {status === 'acknowledged' && <Info className="w-3 h-3" />}
                  {status === 'dismissed' && <XCircle className="w-3 h-3" />}
                  {status === 'escalated' && <ArrowUp className="w-3 h-3" />}
                  {count}
                </span>
              ))}
            </div>
            {/* MITRE ATT&CK techniques detected */}
            {(() => {
              const techCounts = new Map<string, number>();
              const techTactics = new Map<string, string>();
              mitigationAlerts.forEach((a) => {
                const mitre = getMitreMapping(a.title, a.category);
                techCounts.set(mitre.techniqueId, (techCounts.get(mitre.techniqueId) ?? 0) + 1);
                techTactics.set(mitre.techniqueId, mitre.tactic);
              });
              const sortedTechs = [...techCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

              if (sortedTechs.length > 0) {
                return (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Crosshair className="w-3 h-3 text-cyan-400" />
                      <span className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wider">
                        MITRE ATT&CK
                      </span>
                      <span className="ml-auto text-[10px] text-foreground/40 font-mono">{techCounts.size} techniques</span>
                    </div>
                    <div className="space-y-1">
                      {sortedTechs.map(([id, count]) => {
                        const colors = mitreTacticColor(techTactics.get(id) ?? '');
                        const pct = mitigationAlerts.length > 0 ? (count / mitigationAlerts.length) * 100 : 0;
                        return (
                          <div key={id}>
                            <div className="flex items-center justify-between text-[10px] mb-0.5">
                              <a
                                href={`https://attack.mitre.org/techniques/${id.replace('.', '/')}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`font-mono font-bold ${colors.text} hover:opacity-80 transition-opacity duration-150`}
                              >
                                {id}
                              </a>
                              <span className="font-mono text-foreground/50">{count}</span>
                            </div>
                            <div className="h-1 bg-background rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, backgroundColor: techTactics.get(id) === 'Impact' ? '#ef4444' : '#06b6d4' }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Link to mitigation */}
            <button
              onClick={() => navigate('/mitigation')}
              className="mt-3 w-full text-xs text-accent hover:text-accent/80 transition-colors duration-200 cursor-pointer"
            >
              View all alerts →
            </button>

            {/* Chain of custody status */}
            {(() => {
              const hashed = mitigationAlerts.filter((a) => a.currentHash).length;
              if (hashed > 0) {
                return (
                  <div className="mt-2 pt-2 border-t border-border flex items-center gap-1.5 text-[10px] text-emerald-400/70">
                    <Fingerprint className="w-3 h-3" />
                    <span className="font-mono">{hashed}/{mitigationAlerts.length} alerts hash-chained</span>
                  </div>
                );
              }
              return null;
            })()}
          </div>

          {/* Protocol distribution pie */}
          <div className="bg-secondary border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-accent" />
              <h3 className="font-heading font-semibold text-sm text-foreground">Protocol Distribution</h3>
            </div>
            {protocolDist.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-foreground/50 text-sm">
                No packet data yet
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-28 h-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={protocolDist}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={24}
                        outerRadius={40}
                        paddingAngle={2}
                      >
                        {protocolDist.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={PROTOCOL_COLORS[entry.name] ?? '#6b7280'}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-1.5 min-w-0">
                  {protocolDist.slice(0, 6).map((p) => (
                    <div key={p.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: PROTOCOL_COLORS[p.name] ?? '#6b7280' }}
                      />
                      <span className="text-foreground/70 w-12">{p.name}</span>
                      <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(p.value / packets.length) * 100}%`,
                            backgroundColor: PROTOCOL_COLORS[p.name] ?? '#6b7280',
                          }}
                        />
                      </div>
                      <span className="font-mono-custom text-foreground/60 w-12 text-right">
                        {p.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Top talkers */}
          <div className="bg-secondary border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <ArrowUp className="w-4 h-4 text-cyan-400" />
              <h3 className="font-heading font-semibold text-sm text-foreground">Top Talkers</h3>
              <span className="ml-auto text-xs text-foreground/50">
                {topTalkers.length} sources
              </span>
            </div>
            {topTalkers.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-foreground/50 text-sm">
                No packet data yet
              </div>
            ) : (
              <div className="space-y-1.5">
                {topTalkers.map((t, i) => {
                  const maxPackets = topTalkers[0].packets;
                  const barWidth = (t.packets / maxPackets) * 100;
                  const bytesFormatted =
                    t.bytes >= 1024 * 1024
                      ? `${(t.bytes / (1024 * 1024)).toFixed(1)} MB`
                      : t.bytes >= 1024
                        ? `${(t.bytes / 1024).toFixed(1)} KB`
                        : `${t.bytes} B`;
                  return (
                    <div key={t.ip} className="group">
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="font-mono-custom text-foreground/80 truncate max-w-[120px]">
                          {t.ip}
                        </span>
                        <span className="text-foreground/50 whitespace-nowrap ml-2">
                          {t.packets} pkts · {bytesFormatted}
                        </span>
                      </div>
                      <div className="h-1.5 bg-background rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${barWidth}%`,
                            background:
                              i === 0
                                ? 'linear-gradient(90deg, #06b6d4, #3b82f6)'
                                : `linear-gradient(90deg, rgba(6,182,212,0.6), rgba(59,130,246,${0.6 - i * 0.06}))`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom row: Traffic chart + Activity timeline ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-6 pb-4">
          {/* Traffic chart (spans 2 cols) */}
          <div className="lg:col-span-2">
            <TrafficChart />
          </div>

          {/* 24h Activity timeline */}
          <div className="bg-secondary border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-accent" />
              <h3 className="font-heading font-semibold text-sm text-foreground">Recent Activity</h3>
              <span className="ml-auto text-xs text-foreground/50">{timeline.length} events</span>
            </div>
            <div className="space-y-0 max-h-[240px] overflow-y-auto">
              {timeline.length === 0 ? (
                <div className="py-8 flex flex-col items-center text-center text-foreground/50 text-sm">
                  <Zap className="w-8 h-8 mb-2 opacity-40" />
                  No recent activity
                </div>
              ) : (
                timeline.map((entry, i) => {
                  const Icon = entry.icon;
                  const isLast = i === timeline.length - 1;
                  return (
                    <div key={`${entry.type}-${entry.time}-${i}`} className="flex gap-3 relative pb-4">
                      {/* Vertical connector line */}
                      {!isLast && (
                        <div className="absolute left-[15px] top-6 bottom-0 w-px bg-border" />
                      )}
                      {/* Icon circle */}
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${entry.color}18` }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: entry.color }} />
                      </div>
                      {/* Content */}
                      <div className="min-w-0 flex-1 pt-1">
                        <p className="text-xs text-foreground/90 truncate">{entry.label}</p>
                        <p className="text-[11px] text-foreground/40 mt-0.5">
                          {format(new Date(entry.time), 'MMM d, HH:mm')}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── Packet feed at bottom ── */}
          <div className="px-6 pb-4 flex-1 flex flex-col min-h-0">
            <div className="flex-1 bg-secondary border border-border rounded-xl overflow-hidden flex flex-col min-h-0">
              <PacketFeed />
            </div>
          </div>

          {/* ── REAL-TIME NETWORK ALERTS FROM TERMUX SNIFFER ── */}
          <div className="px-6 pb-6">
            <LiveAlertsFeed />
          </div>

          {/* ── REAL-TIME FINANCIAL FRAUD CORRELATION & BIG DATA INGESTION ENGINE ── */}
          <div className="px-6 pb-6">
            <FraudCorrelationEngine />
          </div>

      {/* Co-pilot toggle (mobile) */}
      {!copilotOpen && (
        <button
          onClick={() => useAppStore.getState().setCopilotOpen(true)}
          className="fixed bottom-4 right-4 lg:hidden z-50 p-3 bg-accent text-black rounded-full shadow-lg hover:opacity-90 transition-all duration-200 cursor-pointer"
          title="Open AI Co-Pilot"
        >
          <Shield className="w-5 h-5" />
        </button>
      )}
    </div>
  </div>
  );
}
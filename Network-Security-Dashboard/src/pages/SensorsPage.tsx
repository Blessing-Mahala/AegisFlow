import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { supabase } from '../lib/supabase/client';
import type { Tables } from '../lib/database.types';
import { format } from 'date-fns';
import { getZoneLabel } from '../lib/mock/enterpriseSensors';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import {
  Radio,
  Plus,
  Key,
  Copy,
  Check,
  Trash2,
  Pencil,
  Wifi,
  Cable,
  ChevronDown,
  Activity,
  Clock,
  Server,
  Shield,
  AlertTriangle,
  HardDrive,
  Cpu,
  Zap,
  Gauge,
  Globe,
  Building2,
  Cloud,
  WifiOff,
  Search,
  X,
  Filter,
  MoreHorizontal,
  Eye,
  EyeOff,
  RefreshCw,
  Circle,
  BarChart3,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
type Sensor = Tables<'sensors'>;

interface EnterpriseSensor extends Sensor {
  tag: string;
  zone: 'core' | 'perimeter' | 'branch' | 'datacenter';
  segment: string;
  bandwidth_current: number;
  packet_drop_rate: number;
  gpu_load: number;
}

type EnhancedSensor = Sensor | EnterpriseSensor;
type SortKey = 'tag' | 'zone' | 'cpu_usage' | 'packet_drop_rate' | 'bandwidth_current';
type HealthStatus = 'healthy' | 'high_traffic' | 'offline';

interface EditForm {
  name: string;
  location: string;
  link_speed: number;
  link_type: string;
}

// ─── Constants ────────────────────────────────────────────────
const LINK_SPEED_OPTIONS = [
  { value: 100, label: '100 Mbps' },
  { value: 1000, label: '1 Gbps' },
  { value: 10000, label: '10 Gbps' },
];

const LINK_TYPE_OPTIONS = ['ethernet', 'wifi', 'cellular'];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'tag', label: 'Tag' },
  { key: 'zone', label: 'Zone' },
  { key: 'cpu_usage', label: 'CPU Usage' },
  { key: 'packet_drop_rate', label: 'Drop Rate' },
  { key: 'bandwidth_current', label: 'Bandwidth' },
];

const ZONE_TABS = ['all', 'core', 'perimeter', 'branch', 'datacenter'] as const;
const ZONE_ICONS: Record<string, React.ElementType> = {
  all: Server,
  core: Shield,
  perimeter: Globe,
  branch: Building2,
  datacenter: Cloud,
};

// ─── Helpers ──────────────────────────────────────────────────
function getHealthStatus(s: EnhancedSensor): HealthStatus {
  if (!s.last_seen) return 'offline';
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  if (new Date(s.last_seen).getTime() < fiveMinAgo) return 'offline';
  if ((s.cpu_usage ?? 0) > 85 || ((s as EnterpriseSensor).packet_drop_rate ?? 0) > 0.1) return 'high_traffic';
  return 'healthy';
}

function isEnterpriseSensor(s: EnhancedSensor): s is EnterpriseSensor {
  return 'tag' in s;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBandwidth(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`;
  return `${Math.round(mbps)} Mbps`;
}

function getUtilizationColor(value: number) {
  if (value < 60) return 'bg-accent';
  if (value < 85) return 'bg-yellow-500';
  return 'bg-destructive';
}

function getZoneColor(zone: string): string {
  switch (zone) {
    case 'core': return 'text-cyan-400';
    case 'perimeter': return 'text-amber-400';
    case 'branch': return 'text-emerald-400';
    case 'datacenter': return 'text-purple-400';
    default: return 'text-foreground/60';
  }
}

function getZoneBg(zone: string): string {
  switch (zone) {
    case 'core': return 'bg-cyan-500/10 border-cyan-500/20';
    case 'perimeter': return 'bg-amber-500/10 border-amber-500/20';
    case 'branch': return 'bg-emerald-500/10 border-emerald-500/20';
    case 'datacenter': return 'bg-purple-500/10 border-purple-500/20';
    default: return 'bg-muted border-border';
  }
}

// Generate per-sensor sparkline data
function useSparkline(sensorCount: number) {
  const dataRef = useRef<Record<string, Array<{ t: number; v: number }>>>({});

  const getSparkline = useCallback((sensorId: string, currentPps: number) => {
    let points = dataRef.current[sensorId];
    if (!points) {
      points = Array.from({ length: 30 }, (_, i) => ({
        t: i,
        v: Math.floor(Math.random() * 3000) + 200,
      }));
      dataRef.current[sensorId] = points;
    } else {
      // Build a new array instead of mutating
      const nextT = (points.at(-1)?.t ?? 0) + 1;
      const nextV = Math.max(0, currentPps + (Math.random() - 0.5) * 400);
      points = [...points.slice(1), { t: nextT, v: nextV }];
      dataRef.current[sensorId] = points;
    }
    return points;
  }, []);

  // Clean up old sensor sparklines when count changes
  useEffect(() => {
    dataRef.current = {};
  }, [sensorCount]);

  return getSparkline;
}

// ─── Main component ───────────────────────────────────────────
export default function SensorsPage() {
  const { profile } = useAuthStore();
  const { setSelectedSensorId } = useAppStore();
  const [sensors, setSensors] = useState<EnhancedSensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeZone, setActiveZone] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('tag');
  const [sortOpen, setSortOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSensor, setEditingSensor] = useState<Sensor | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', location: '', link_speed: 1000, link_type: 'ethernet' });
  const [showOfflineOnly, setShowOfflineOnly] = useState(false);

  // ── Load real sensors from Supabase + subscribe to realtime ──
  const getSparkline = useSparkline(sensors.length);

  const loadSensors = useCallback(async () => {
    if (!profile?.team_id) return;
    setLoading(true);

    const { data: realSensors } = await supabase
      .from('sensors')
      .select('*')
      .eq('team_id', profile.team_id)
      .order('created_at', { ascending: false });

    setSensors(realSensors ?? []);
    setLoading(false);
  }, [profile?.team_id]);

  useEffect(() => {
    loadSensors();
  }, [loadSensors]);

  // ── Subscribe to real-time sensor updates ──
  useEffect(() => {
    if (!profile?.team_id) return;

    const channel = supabase
      .channel('sensors-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sensors',
          filter: `team_id=eq.${profile.team_id}`,
        },
        () => {
          // Reload sensors on any change
          loadSensors();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.team_id, loadSensors]);

  // ── Derived fleet metrics ──
  const fleetMetrics = useMemo(() => {
    const total = sensors.length;
    const online = sensors.filter((s) => getHealthStatus(s) !== 'offline');
    const offline = sensors.filter((s) => getHealthStatus(s) === 'offline');
    const critical = offline.filter((s) => (s.cpu_usage ?? 0) > 85 || (isEnterpriseSensor(s) && s.packet_drop_rate > 0.15));

    const totalBandwidth = sensors.reduce((sum, s) => sum + (isEnterpriseSensor(s) ? s.bandwidth_current : 0), 0);
    const avgDrop = sensors.length > 0
      ? sensors.reduce((sum, s) => sum + (isEnterpriseSensor(s) ? s.packet_drop_rate : 0), 0) / sensors.length
      : 0;

    const avgCpu = sensors.length > 0
      ? sensors.reduce((sum, s) => sum + (s.cpu_usage ?? 0), 0) / sensors.length
      : 0;

    return { total, online: online.length, offline: offline.length, critical: critical.length, totalBandwidth, avgDrop, avgCpu };
  }, [sensors]);

  // ── Zone counts ──
  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sensors.length };
    ZONE_TABS.slice(1).forEach((z) => {
      counts[z] = sensors.filter((s) => isEnterpriseSensor(s) && s.zone === z).length;
    });
    return counts;
  }, [sensors]);

  // ── Filtered + sorted list ──
  const displayed = useMemo(() => {
    let filtered = [...sensors];

    if (activeZone !== 'all') {
      filtered = filtered.filter((s) => isEnterpriseSensor(s) && s.zone === activeZone);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((s) => {
        const tag = isEnterpriseSensor(s) ? s.tag : s.name;
        return tag.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || (s.location ?? '').toLowerCase().includes(q);
      });
    }

    if (showOfflineOnly) {
      filtered = filtered.filter((s) => getHealthStatus(s) === 'offline');
    }

    filtered.sort((a, b) => {
      switch (sortKey) {
        case 'tag': {
          const tagA = isEnterpriseSensor(a) ? a.tag : a.name;
          const tagB = isEnterpriseSensor(b) ? b.tag : b.name;
          return tagA.localeCompare(tagB);
        }
        case 'zone': {
          const aZone = isEnterpriseSensor(a) ? a.zone : '';
          const bZone = isEnterpriseSensor(b) ? b.zone : '';
          return aZone.localeCompare(bZone);
        }
        case 'cpu_usage':
          return (b.cpu_usage ?? 0) - (a.cpu_usage ?? 0);
        case 'packet_drop_rate':
          return ((b as EnterpriseSensor).packet_drop_rate ?? 0) - ((a as EnterpriseSensor).packet_drop_rate ?? 0);
        case 'bandwidth_current':
          return ((b as EnterpriseSensor).bandwidth_current ?? 0) - ((a as EnterpriseSensor).bandwidth_current ?? 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [sensors, activeZone, searchQuery, sortKey, showOfflineOnly]);

  // ── Handlers ──
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.team_id || !newName.trim()) return;
    const apiKey = `snk_${crypto.randomUUID().replace(/-/g, '')}`;
    const { error } = await supabase.from('sensors').insert({
      name: newName.trim(),
      team_id: profile.team_id,
      api_key: apiKey,
    });
    if (!error) {
      setNewKey(apiKey);
      setNewName('');
      await loadSensors();
    }
  };

  const handleDelete = async (sensorId: string) => {
    if (!confirm('Are you sure you want to delete this sensor?')) return;
    await supabase.from('sensors').delete().eq('id', sensorId);
    await loadSensors();
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openEditModal = (sensor: Sensor) => {
    setEditingSensor(sensor);
    setEditForm({
      name: sensor.name,
      location: sensor.location || '',
      link_speed: sensor.link_speed || 1000,
      link_type: sensor.link_type || 'ethernet',
    });
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingSensor) return;
    const { error } = await supabase
      .from('sensors')
      .update({
        name: editForm.name,
        location: editForm.location || null,
        link_speed: editForm.link_speed,
        link_type: editForm.link_type,
      })
      .eq('id', editingSensor.id);
    if (!error) {
      setEditModalOpen(false);
      setEditingSensor(null);
      await loadSensors();
    }
  };

  const handleSelectSensor = (s: EnhancedSensor) => {
    setSelectedSensorId(s.id);
    setSelectedRowId(selectedRowId === s.id ? null : s.id);
  };

  // ── Render ──
  return (
    <div className="p-6 space-y-6">
      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground">Sensor Fleet Management</h1>
          <p className="text-sm text-foreground/60 mt-1">
            Enterprise-wide distributed network sensor grid — {fleetMetrics.total} nodes deployed
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowOfflineOnly(!showOfflineOnly)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all duration-200 cursor-pointer ${
              showOfflineOnly
                ? 'bg-destructive/10 text-destructive border-destructive/30'
                : 'bg-secondary text-foreground/70 border-border hover:border-foreground/20'
            }`}
          >
            <WifiOff className="w-4 h-4" />
            Offline Only
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-black font-semibold rounded-lg hover:opacity-90 transition-all duration-200 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Sensor
          </button>
        </div>
      </div>

      {/* ─── Create form ─────────────────────────────────────── */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-secondary border border-border rounded-xl p-4 space-y-3">
          <h3 className="font-heading font-semibold text-sm text-foreground">Register New Network Sensor</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Sensor name (e.g., HQ-Gateway-1)"
              className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent transition-colors duration-200"
              required
            />
            <button
              type="submit"
              className="px-4 py-2 bg-accent text-black text-sm font-semibold rounded-lg hover:opacity-90 transition-all duration-200 cursor-pointer"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setNewKey(''); }}
              className="px-3 py-2 text-foreground/60 hover:text-foreground transition-colors duration-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {newKey && (
            <div className="bg-muted border border-border rounded-lg p-3">
              <p className="text-xs text-foreground/60 mb-2">
                API Key (copy this now — it won't be shown again):
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-2 py-1.5 bg-background rounded text-xs font-mono text-accent break-all">
                  {newKey}
                </code>
                <button
                  onClick={() => copyToClipboard(newKey, 'new-key')}
                  className="p-1.5 text-foreground/50 hover:text-foreground rounded-lg transition-colors duration-200 cursor-pointer"
                >
                  {copiedId === 'new-key' ? <Check className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {/* ─── Fleet Overview Cards ────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-secondary border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-foreground/60 uppercase tracking-wider">Active Sensors</span>
            <Radio className="w-4 h-4 text-accent" />
          </div>
          <p className="text-2xl font-heading font-bold text-accent">{fleetMetrics.online}</p>
          <p className="text-xs text-foreground/50 mt-1">
            of {fleetMetrics.total} deployed · {((fleetMetrics.online / fleetMetrics.total) * 100).toFixed(0)}% uptime
          </p>
        </div>

        <div className="bg-secondary border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-foreground/60 uppercase tracking-wider">Offline / Critical</span>
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </div>
          <p className="text-2xl font-heading font-bold text-destructive">{fleetMetrics.offline}</p>
          <p className="text-xs text-foreground/50 mt-1">
            {fleetMetrics.critical} flagged as critical
          </p>
        </div>

        <div className="bg-secondary border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-foreground/60 uppercase tracking-wider">Total Traffic</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-heading font-bold text-amber-400">{formatBandwidth(fleetMetrics.totalBandwidth)}</p>
          <p className="text-xs text-foreground/50 mt-1">
            Aggregated across all zones
          </p>
        </div>

        <div className="bg-secondary border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-foreground/60 uppercase tracking-wider">Avg Drop Rate</span>
            <Gauge className={`w-4 h-4 ${fleetMetrics.avgDrop > 0.1 ? 'text-destructive' : 'text-accent'}`} />
          </div>
          <p className={`text-2xl font-heading font-bold ${fleetMetrics.avgDrop > 0.1 ? 'text-destructive' : 'text-foreground'}`}>
            {fleetMetrics.avgDrop.toFixed(2)}%
          </p>
          <p className="text-xs text-foreground/50 mt-1">
            Avg CPU: {fleetMetrics.avgCpu.toFixed(0)}%
          </p>
        </div>
      </div>

      {/* ─── Zone Tabs + Controls ───────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-secondary border border-border rounded-lg p-1 overflow-x-auto">
          {ZONE_TABS.map((zone) => {
            const Icon = ZONE_ICONS[zone];
            const count = zoneCounts[zone] ?? 0;
            const isActive = activeZone === zone;
            return (
              <button
                key={zone}
                onClick={() => setActiveZone(zone)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-accent/10 text-accent shadow-sm'
                    : 'text-foreground/60 hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{zone === 'all' ? 'All Zones' : getZoneLabel(zone)}</span>
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  isActive ? 'bg-accent/20 text-accent' : 'bg-background/50 text-foreground/50'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tag, name, location…"
              className="w-48 pl-8 pr-3 py-1.5 bg-secondary border border-border rounded-lg text-xs text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent/50 transition-colors duration-200"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-foreground/40 hover:text-foreground cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => setSortOpen(!sortOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-secondary border border-border rounded-lg text-xs text-foreground hover:border-accent/50 transition-colors duration-200 cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5 text-foreground/50" />
              <span>{SORT_OPTIONS.find((o) => o.key === sortKey)?.label}</span>
              <ChevronDown className={`w-3 h-3 text-foreground/40 transition-transform duration-200 ${sortOpen ? 'rotate-180' : ''}`} />
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                <div className="absolute top-full right-0 mt-1 bg-secondary border border-border rounded-lg shadow-lg z-20 py-1 min-w-[140px]">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => { setSortKey(opt.key); setSortOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors duration-150 cursor-pointer ${sortKey === opt.key ? 'bg-muted text-accent' : 'text-foreground hover:bg-muted'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── High-Density Sensor Table ──────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-5 h-5 text-accent animate-spin" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-foreground/50">
          <Radio className="w-10 h-10 mb-3" />
          <p className="text-sm">No sensors match your filters</p>
          <button
            onClick={() => { setActiveZone('all'); setSearchQuery(''); setShowOfflineOnly(false); }}
            className="mt-2 text-xs text-accent hover:text-accent/80 transition-colors duration-200 cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="bg-secondary border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[10px] text-foreground/50 uppercase tracking-wider font-medium px-4 py-3 w-[130px]">
                    ID / Tag
                  </th>
                  <th className="text-left text-[10px] text-foreground/50 uppercase tracking-wider font-medium px-4 py-3 w-[80px]">
                    Status
                  </th>
                  <th className="text-left text-[10px] text-foreground/50 uppercase tracking-wider font-medium px-4 py-3 w-[140px]">
                    Segment / Location
                  </th>
                  <th className="text-left text-[10px] text-foreground/50 uppercase tracking-wider font-medium px-4 py-3 w-[100px]">
                    Zone
                  </th>
                  <th className="text-left text-[10px] text-foreground/50 uppercase tracking-wider font-medium px-4 py-3 w-[120px]">
                    Bandwidth
                  </th>
                  <th className="text-left text-[10px] text-foreground/50 uppercase tracking-wider font-medium px-4 py-3 w-[180px]">
                    CPU / Memory / VRAM
                  </th>
                  <th className="text-left text-[10px] text-foreground/50 uppercase tracking-wider font-medium px-4 py-3 w-[100px]">
                    Link
                  </th>
                  <th className="text-left text-[10px] text-foreground/50 uppercase tracking-wider font-medium px-4 py-3 w-12">
                    {/* Actions */}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {displayed.map((s) => {
                  const isEnt = isEnterpriseSensor(s);
                  const ent = isEnt ? (s as EnterpriseSensor) : null;
                  const displayTag = ent?.tag ?? s.name.toUpperCase().replace(/\s+/g, '-');
                  const status = getHealthStatus(s);
                  const isSelected = selectedRowId === s.id;

                  // Sparkline data for this sensor
                  const sparkPts = getSparkline(s.id, s.packets_per_sec ?? 0);

                  return (
                    <tr
                      key={s.id}
                      onClick={() => handleSelectSensor(s)}
                      className={`transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? 'bg-accent/[0.04] border-l-2 border-l-accent'
                          : status === 'offline'
                            ? 'hover:bg-destructive/[0.03]'
                            : 'hover:bg-muted/40'
                      }`}
                    >
                      {/* ID / Tag */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            status === 'healthy' ? 'bg-accent' : status === 'high_traffic' ? 'bg-yellow-500' : 'bg-destructive'
                          }`} />
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-foreground font-semibold">{displayTag}</p>
                            <p className="text-[10px] text-foreground/40 truncate">{s.name}</p>
                          </div>
                        </div>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          status === 'healthy'
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                            : status === 'high_traffic'
                              ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                              : 'bg-destructive/10 text-destructive border border-destructive/20'
                        }`}>
                          <Circle className={`w-1.5 h-1.5 ${
                            status === 'healthy' ? 'fill-green-400' : status === 'high_traffic' ? 'fill-yellow-400' : 'fill-destructive'
                          }`} />
                          {status === 'healthy' ? 'Healthy' : status === 'high_traffic' ? 'Warning' : 'Offline'}
                        </span>
                      </td>

                      {/* Segment / Location */}
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-xs text-foreground/80">{ent?.segment ?? s.location ?? '—'}</p>
                          <p className="text-[10px] text-foreground/40 truncate">{s.location ?? '—'}</p>
                        </div>
                      </td>

                      {/* Zone */}
                      <td className="px-4 py-3">
                        {ent ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${getZoneBg(ent.zone)}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${getZoneColor(ent.zone).replace('text-', 'bg-')}`} />
                            {getZoneLabel(ent.zone)}
                          </span>
                        ) : (
                          <span className="text-xs text-foreground/40">Custom</span>
                        )}
                      </td>

                      {/* Bandwidth sparkline + value */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-7 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={sparkPts}>
                                <Line
                                  type="monotone"
                                  dataKey="v"
                                  stroke={status === 'offline' ? '#ef4444' : status === 'high_traffic' ? '#eab308' : '#22c55e'}
                                  strokeWidth={1.2}
                                  dot={false}
                                  isAnimationActive={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-mono text-foreground/80">
                              {isEnt ? formatBandwidth(ent!.bandwidth_current) : '—'}
                            </p>
                            <p className="text-[10px] text-foreground/40">
                              {s.packets_per_sec?.toLocaleString()} pps
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* CPU / Memory / VRAM bars */}
                      <td className="px-4 py-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-foreground/40 w-5 shrink-0">CPU</span>
                            <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${getUtilizationColor(s.cpu_usage ?? 0)}`}
                                style={{ width: `${Math.min(s.cpu_usage ?? 0, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-foreground/60 w-8 text-right">
                              {s.cpu_usage?.toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-foreground/40 w-5 shrink-0">MEM</span>
                            <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${getUtilizationColor(s.memory_usage ?? 0)}`}
                                style={{ width: `${Math.min(s.memory_usage ?? 0, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-foreground/60 w-8 text-right">
                              {s.memory_usage?.toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-foreground/40 w-5 shrink-0">
                              {isEnt ? 'GPU' : 'VRM'}
                            </span>
                            <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${getUtilizationColor(isEnt ? ent!.gpu_load : s.vram_usage ?? 0)}`}
                                style={{ width: `${Math.min(isEnt ? ent!.gpu_load : s.vram_usage ?? 0, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-foreground/60 w-8 text-right">
                              {(isEnt ? ent!.gpu_load : s.vram_usage ?? 0).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Link info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {s.link_type === 'wifi' ? (
                            <Wifi className="w-3 h-3 text-foreground/40" />
                          ) : (
                            <Cable className="w-3 h-3 text-foreground/40" />
                          )}
                          <span className="text-[11px] text-foreground/60">
                            {s.link_speed >= 1000 ? `${s.link_speed / 1000} Gbps` : `${s.link_speed} Mbps`}
                          </span>
                        </div>
                        {s.uptime_seconds && (
                          <p className="text-[10px] text-foreground/40 mt-0.5 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {formatUptime(s.uptime_seconds)}
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5">
                          {!isEnt && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(s.api_key, `key-${s.id}`); }}
                                className="p-1.5 text-foreground/40 hover:text-accent rounded-lg transition-colors duration-150 cursor-pointer"
                                title="Copy API key"
                              >
                                {copiedId === `key-${s.id}` ? <Check className="w-3.5 h-3.5" /> : <Key className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); openEditModal(s as Sensor); }}
                                className="p-1.5 text-foreground/40 hover:text-accent rounded-lg transition-colors duration-150 cursor-pointer"
                                title="Edit sensor"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                                className="p-1.5 text-foreground/40 hover:text-destructive rounded-lg transition-colors duration-150 cursor-pointer"
                                title="Delete sensor"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {isEnt && (
                            <span className="text-[10px] text-foreground/30 px-1.5 py-0.5 rounded bg-background/50">
                              MOCK
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
            <span className="text-[11px] text-foreground/50">
              Showing {displayed.length} of {sensors.length} sensor nodes
            </span>
            <span className="text-[11px] text-foreground/40">
              Telemetry updates every 10s
              <span className="inline-block w-1.5 h-1.5 bg-accent rounded-full ml-1.5 animate-pulse" />
            </span>
          </div>
        </div>
      )}

      {/* ─── Edit Modal ──────────────────────────────────────── */}
      {editModalOpen && editingSensor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} />
          <div className="relative bg-secondary border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h3 className="font-heading font-semibold text-base text-foreground mb-4">Edit Sensor</h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground/60 uppercase tracking-wider mb-1.5 block">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent/50 transition-colors duration-200"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground/60 uppercase tracking-wider mb-1.5 block">Location</label>
                <input
                  type="text"
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  placeholder="e.g. HQ-DFW-Rack4"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent/50 transition-colors duration-200"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground/60 uppercase tracking-wider mb-1.5 block">Link Speed</label>
                <select
                  value={editForm.link_speed}
                  onChange={(e) => setEditForm({ ...editForm, link_speed: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent/50 transition-colors duration-200 cursor-pointer"
                >
                  {LINK_SPEED_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground/60 uppercase tracking-wider mb-1.5 block">Link Type</label>
                <div className="flex gap-2">
                  {LINK_TYPE_OPTIONS.map((type) => (
                    <button
                      key={type}
                      onClick={() => setEditForm({ ...editForm, link_type: type })}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${editForm.link_type === type ? 'bg-accent text-black' : 'bg-background border border-border text-foreground/70 hover:border-accent/50'}`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
              <button
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 text-sm text-foreground/70 hover:text-foreground transition-colors duration-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                className="px-4 py-2 bg-accent text-black text-sm font-semibold rounded-lg hover:opacity-90 transition-all duration-200 cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

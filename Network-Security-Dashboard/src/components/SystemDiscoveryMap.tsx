import { useEffect, useState, useMemo, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  Radio,
  Wifi,
  Shield,
  AlertTriangle,
  Skull,
  Globe,
  Server,
  Zap,
} from 'lucide-react';
import type { ScanHost } from '../lib/mock/scannerMock';

/* ─── Types ───────────────────────────────────────────── */

interface DiscoveryAlert {
  id: string;
  src_ip: string | null;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  protocol: string | null;
  port: number | null;
  description: string | null;
  created_at: string;
}

interface DiscoveredNode {
  ip: string;
  hostname: string;
  macVendor: string;
  osGuess: string;
  openPorts: number;
  latency: number;
  alerts: DiscoveryAlert[];
  discoveredAt: number; // timestamp
  status: 'online' | 'alerted' | 'critical';
}

/* ─── Severity config ─────────────────────────────────── */

const SEV_COLORS: Record<string, { bg: string; border: string; text: string; icon: React.ElementType }> = {
  critical: { bg: 'bg-rose-500/20', border: 'border-rose-500/50', text: 'text-rose-400', icon: Skull },
  high: { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400', icon: AlertTriangle },
  medium: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', text: 'text-yellow-400', icon: AlertTriangle },
  low: { bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'text-green-400', icon: Shield },
};

/* ─── Props ───────────────────────────────────────────── */

interface SystemDiscoveryMapProps {
  hosts: ScanHost[];
  isScanning: boolean;
  scanProgress: number;
}

/* ─── Component ───────────────────────────────────────── */

export default function SystemDiscoveryMap({ hosts, isScanning, scanProgress }: SystemDiscoveryMapProps) {
  const { profile } = useAuthStore();
  const [discoveredNodes, setDiscoveredNodes] = useState<DiscoveredNode[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<DiscoveryAlert[]>([]);
  const [activePhase, setActivePhase] = useState<'idle' | 'discovering' | 'mapping' | 'monitoring'>('idle');
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Phase transitions based on scan state ──────────── */
  useEffect(() => {
    if (isScanning) {
      setActivePhase('discovering');
      setTimeout(() => setActivePhase('mapping'), 4000);
    } else if (hosts.length > 0) {
      setActivePhase('monitoring');
    } else {
      setActivePhase('idle');
    }
  }, [isScanning, hosts.length]);

  /* ── Build discovered nodes from scan results ───────── */
  useEffect(() => {
    if (hosts.length === 0) {
      setDiscoveredNodes([]);
      return;
    }

    const nodes: DiscoveredNode[] = hosts.map((h, i) => ({
      ip: h.ip,
      hostname: h.hostname,
      macVendor: h.macVendor,
      osGuess: h.osGuess,
      openPorts: h.openPorts.length,
      latency: h.latency,
      alerts: [],
      discoveredAt: Date.now() + i * 100,
      status: 'online' as const,
    }));

    // Staggered appearance
    nodes.forEach((_, i) => {
      setTimeout(() => {
        setDiscoveredNodes((prev) => {
          if (prev.find((n) => n.ip === nodes[i].ip)) return prev;
          return [...prev, nodes[i]];
        });
      }, i * 250);
    });
  }, [hosts]);

  /* ── Real-time alert subscription from sniffer ──────── */
  useEffect(() => {
    if (!profile?.team_id) return;

    const channel = supabase
      .channel('discovery-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'network_alerts',
          filter: `team_id=eq.${profile.team_id}`,
        },
        (payload: RealtimePostgresChangesPayload<DiscoveryAlert>) => {
          const alert = payload.new as unknown as DiscoveryAlert;
          if (!alert?.id) return;

          setRecentAlerts((prev) => [alert, ...prev].slice(0, 50));

          // Check if alert's src_ip matches any discovered node
          if (alert.src_ip) {
            setDiscoveredNodes((prev) =>
              prev.map((node) => {
                if (node.ip !== alert.src_ip) return node;
                const severity = alert.severity;
                return {
                  ...node,
                  alerts: [alert, ...node.alerts].slice(0, 10),
                  status: severity === 'critical' ? 'critical' as const : 'alerted' as const,
                };
              }),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.team_id]);

  /* ── Layout nodes in a radial pattern ───────────────── */
  const positionedNodes = useMemo(() => {
    return discoveredNodes.map((node, i) => {
      const total = discoveredNodes.length;
      const angle = (2 * Math.PI * i) / total - Math.PI / 2;
      const radius = Math.min(containerRef.current?.clientWidth ?? 400, 400) * 0.35;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return { ...node, x, y, angle };
    });
  }, [discoveredNodes]);

  /* ── Grid view for when there are too many hosts ────── */
  const useGrid = discoveredNodes.length > 12;

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div className="bg-black/80 border border-border/60 rounded-xl overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.6)]">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-500 ${
            activePhase === 'monitoring'
              ? 'bg-emerald-500/10 border border-emerald-500/30'
              : activePhase !== 'idle'
                ? 'bg-accent/10 border border-accent/30 animate-pulse'
                : 'bg-foreground/5 border border-border/30'
          }`}>
            <Wifi className={`w-4 h-4 transition-colors duration-500 ${
              activePhase === 'monitoring' ? 'text-emerald-400' : activePhase !== 'idle' ? 'text-accent' : 'text-foreground/40'
            }`} />
          </div>
          <div>
            <h2 className="text-sm font-heading font-bold text-foreground tracking-tight flex items-center gap-2">
              SYSTEM DISCOVERY
              {activePhase === 'monitoring' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  LIVE
                </span>
              )}
              {activePhase !== 'idle' && activePhase !== 'monitoring' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 font-mono animate-pulse">
                  {activePhase === 'discovering' ? 'SCANNING' : 'MAPPING'}
                </span>
              )}
            </h2>
            <p className="text-[10px] text-foreground/40 font-mono">
              {activePhase === 'idle' && 'Awaiting discovery activation'}
              {activePhase === 'discovering' && 'Probing subnet for live hosts...'}
              {activePhase === 'mapping' && `Mapping ${discoveredNodes.length} discovered devices`}
              {activePhase === 'monitoring' && `Monitoring ${discoveredNodes.length} devices — ${recentAlerts.filter(a => a.severity === 'critical' || a.severity === 'high').length} alerts`}
            </p>
          </div>
        </div>

        {/* Progress ring */}
        {isScanning && (
          <div className="relative w-10 h-10">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="3" className="text-border/40" />
              <circle
                cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="3"
                strokeDasharray={`${2 * Math.PI * 16}`}
                strokeDashoffset={`${2 * Math.PI * 16 * (1 - scanProgress / 100)}`}
                className="text-accent transition-all duration-300 ease-out"
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-accent">
              {scanProgress}%
            </span>
          </div>
        )}
      </div>

      {/* ── Discovery body ──────────────────────────────── */}
      <div className="relative">
        {activePhase === 'idle' ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <Radio className="w-12 h-12 text-foreground/10 mb-4" />
            <p className="text-foreground/40 text-sm font-heading">
              SYSTEM OFFLINE
            </p>
            <p className="text-foreground/25 text-xs mt-1 font-mono">
              Click <span className="text-accent">INITIALIZE SYSTEM DISCOVERY</span> to begin
            </p>
          </div>
        ) : discoveredNodes.length === 0 && isScanning ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="relative mb-6">
              <Radio className="w-16 h-16 text-accent/30 animate-pulse" />
              <div className="absolute -top-1 -right-1 w-4 h-4">
                <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-75" />
                <span className="absolute inset-1 rounded-full bg-accent" />
              </div>
            </div>
            <p className="text-foreground/50 text-sm font-heading flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
              DISCOVERING NETWORK HOSTS...
            </p>
            <p className="text-foreground/30 text-xs mt-2 font-mono">
              Scanning subnet for active devices
            </p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className={`relative ${useGrid ? 'p-4' : 'h-[400px]'} overflow-hidden`}
          >
            {/* Connection lines (radial view) */}
            {!useGrid && positionedNodes.length > 1 && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {positionedNodes.map((node, i) => {
                  const cx = containerRef.current?.clientWidth
                    ? containerRef.current.clientWidth / 2 + node.x
                    : 200 + node.x;
                  const cy = 200 + node.y;
                  return positionedNodes
                    .filter((_, j) => j > i)
                    .map((other, j) => {
                      const ox = containerRef.current?.clientWidth
                        ? containerRef.current.clientWidth / 2 + other.x
                        : 200 + other.x;
                      const oy = 200 + other.y;
                      const dist = Math.sqrt((cx - ox) ** 2 + (cy - oy) ** 2);
                      if (dist > 280) return null;
                      const opacity = Math.max(0.05, 0.2 - dist / 1400);
                      return (
                        <line
                          key={`${node.ip}-${other.ip}`}
                          x1={cx} y1={cy} x2={ox} y2={oy}
                          stroke={node.status === 'critical' ? '#ef4444' : node.status === 'alerted' ? '#f97316' : '#22c55e'}
                          strokeOpacity={opacity}
                          strokeWidth={1}
                          className="transition-all duration-500"
                        />
                      );
                    });
                })}
              </svg>
            )}

            {/* Nodes */}
            {useGrid ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {positionedNodes.map((node) => (
                  <DeviceCard key={node.ip} node={node} />
                ))}
              </div>
            ) : (
              positionedNodes.map((node) => {
                const cx = containerRef.current?.clientWidth
                  ? containerRef.current.clientWidth / 2 + node.x
                  : 200 + node.x;
                const cy = 200 + node.y;

                return (
                  <div
                    key={node.ip}
                    className="absolute transition-all duration-700 ease-out"
                    style={{
                      left: `${cx}px`,
                      top: `${cy}px`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <DeviceCard node={node} />
                  </div>
                );
              })
            )}

            {/* Center hub (radial view) */}
            {!useGrid && discoveredNodes.length > 0 && (
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-background border-2 border-accent/30 flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.1)]"
              >
                <Globe className="w-6 h-6 text-accent/60" />
              </div>
            )}
          </div>
        )}

        {/* ── Bottom stats bar ──────────────────────────── */}
        {discoveredNodes.length > 0 && (
          <div className="flex items-center justify-between px-5 py-2.5 border-t border-border/40 bg-background/30">
            <div className="flex items-center gap-4 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-foreground/50">
                <Server className="w-3 h-3" />
                <span className="text-foreground/70 font-bold">{discoveredNodes.length}</span> devices
              </span>
              <span className="flex items-center gap-1 text-foreground/50">
                <Zap className="w-3 h-3" />
                <span className="text-foreground/70 font-bold">{discoveredNodes.reduce((s, n) => s + n.openPorts, 0)}</span> ports
              </span>
              <span className="flex items-center gap-1 text-rose-400/70">
                <AlertTriangle className="w-3 h-3" />
                <span className="text-rose-400 font-bold">{discoveredNodes.filter((n) => n.status !== 'online').length}</span> flagged
              </span>
            </div>
            <span className="text-[10px] font-mono text-foreground/40 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${
                activePhase === 'monitoring' ? 'bg-emerald-400 animate-ping' : 'bg-accent animate-pulse'
              }`} />
              {activePhase === 'monitoring' ? 'STREAMING' : activePhase.toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Device Card ─────────────────────────────────────── */

function DeviceCard({ node }: { node: DiscoveredNode & { x?: number; y?: number } }) {
  const hasAlerts = node.alerts.length > 0;
  const latestAlert = node.alerts[0];
  const sevCfg = latestAlert ? SEV_COLORS[latestAlert.severity] ?? SEV_COLORS.low : null;

  return (
    <div
      className={`
        w-44 p-3 rounded-xl border transition-all duration-300
        ${hasAlerts
          ? node.status === 'critical'
            ? 'bg-rose-500/10 border-rose-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
            : 'bg-orange-500/10 border-orange-500/40 shadow-[0_0_10px_rgba(249,115,22,0.1)]'
          : 'bg-secondary/80 border-border/50 hover:border-accent/30 hover:bg-secondary shadow-lg'
        }
      `}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              node.status === 'critical'
                ? 'bg-rose-400 animate-pulse'
                : node.status === 'alerted'
                  ? 'bg-orange-400 animate-pulse'
                  : 'bg-emerald-400'
            }`}
          />
          <span className="text-[11px] font-mono text-foreground/90 truncate font-semibold">
            {node.ip}
          </span>
        </div>
        {node.openPorts > 0 && (
          <span className="text-[9px] font-mono text-accent bg-accent/10 px-1 py-0.5 rounded">
            {node.openPorts}p
          </span>
        )}
      </div>

      {/* Hostname / OS */}
      <p className="text-[10px] text-foreground/50 truncate">{node.hostname}</p>
      <p className="text-[9px] text-foreground/40 truncate font-mono">{node.osGuess}</p>

      {/* Latest alert */}
      {latestAlert && sevCfg && (
        <div className={`mt-2 pt-2 border-t ${node.status === 'critical' ? 'border-rose-500/30' : 'border-orange-500/30'}`}>
          <div className="flex items-center gap-1">
            <sevCfg.icon className={`w-3 h-3 ${sevCfg.text}`} />
            <span className={`text-[9px] font-semibold font-mono ${sevCfg.text}`}>
              {latestAlert.severity.toUpperCase()}
            </span>
          </div>
          <p className="text-[9px] text-foreground/60 mt-0.5 line-clamp-2 leading-tight">
            {latestAlert.title}
          </p>
          <p className="text-[8px] text-foreground/30 mt-0.5 font-mono">
            {latestAlert.protocol && `${latestAlert.protocol}`}{latestAlert.port ? ` :${latestAlert.port}` : ''}
          </p>
        </div>
      )}

      {/* Metadata */}
      {!hasAlerts && (
        <div className="mt-1.5 flex items-center gap-2 text-[9px] font-mono text-foreground/30">
          <span>{node.latency}ms</span>
          <span>{node.macVendor}</span>
        </div>
      )}
    </div>
  );
}

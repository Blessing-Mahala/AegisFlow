import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { getMitreMapping, mitreTacticColor } from '../lib/mitre-attack';
import {
  Siren,
  AlertTriangle,
  Skull,
  AlertCircle,
  Info,
  Radio,
  Globe,
  Activity,
  Eye,
  EyeOff,
  ArrowUpDown,
  Crosshair,
  Fingerprint,
} from 'lucide-react';

/* ─── Types ───────────────────────────────────────────── */

interface NetworkAlert {
  id: string;
  team_id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  src_ip: string | null;
  dst_ip: string | null;
  protocol: string | null;
  port: number | null;
  description: string | null;
  status: 'open' | 'acknowledged' | 'mitigated' | 'dismissed';
  created_at: string;
}

/* ─── Config ──────────────────────────────────────────── */

const MAX_VISIBLE = 100;

const SEVERITY_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; border: string; bg: string; text: string; glow: string }
> = {
  critical: {
    label: 'CRITICAL',
    icon: Skull,
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    glow: 'shadow-[0_0_12px_rgba(239,68,68,0.15)]',
  },
  high: {
    label: 'HIGH',
    icon: AlertTriangle,
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    glow: 'shadow-[0_0_10px_rgba(249,115,22,0.12)]',
  },
  medium: {
    label: 'MEDIUM',
    icon: AlertCircle,
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    glow: 'shadow-[0_0_8px_rgba(234,179,8,0.1)]',
  },
  low: {
    label: 'LOW',
    icon: Info,
    border: 'border-green-500/30',
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    glow: '',
  },
};

const STATUS_PILLS: Record<string, { bg: string; text: string; border: string }> = {
  open: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
  acknowledged: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  mitigated: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  dismissed: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
};

/* ─── Component ───────────────────────────────────────── */

export default function LiveAlertsFeed() {
  const { profile } = useAuthStore();
  const [alerts, setAlerts] = useState<NetworkAlert[]>([]);
  const [paused, setPaused] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef<NetworkAlert[]>([]);

  /* ── Initial fetch ──────────────────────────────────── */
  const fetchAlerts = useCallback(async () => {
    if (!profile?.team_id) return;
    const { data, error } = await supabase
      .from('network_alerts')
      .select('*')
      .eq('team_id', profile.team_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setAlerts(data as unknown as NetworkAlert[]);
    }
  }, [profile?.team_id]);

  useEffect(() => {
    if (profile?.team_id) fetchAlerts();
  }, [fetchAlerts, profile?.team_id]);

  /* ── Batched realtime INSERT ────────────────────────── */
  useEffect(() => {
    if (!profile?.team_id) return;

    const channel = supabase
      .channel('network-alerts-live')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'network_alerts',
          filter: `team_id=eq.${profile.team_id}`,
        },
        (payload: RealtimePostgresChangesPayload<NetworkAlert>) => {
          const newAlert = payload.new as unknown as NetworkAlert;
          if (!newAlert?.id) return;

          if (paused) {
            bufferRef.current.push(newAlert);
            return;
          }

          setAlerts((prev) => [newAlert, ...prev].slice(0, MAX_VISIBLE));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.team_id, paused]);

  /* ── Flush buffered alerts when unpaused ────────────── */
  useEffect(() => {
    if (!paused && bufferRef.current.length > 0) {
      const batch = bufferRef.current.splice(0);
      setAlerts((prev) => {
        const merged = [...batch, ...prev];
        return merged.slice(0, MAX_VISIBLE);
      });
    }
  }, [paused]);

  /* ── Auto-scroll to top on new alerts ────────────────── */
  useEffect(() => {
    if (containerRef.current && alerts.length > 0) {
      containerRef.current.scrollTop = 0;
    }
  }, [alerts.length]);

  /* ── Derived stats ──────────────────────────────────── */
  const openCount = alerts.filter((a) => a.status === 'open').length;
  const criticalCount = alerts.filter((a) => a.severity === 'critical' && a.status === 'open').length;

  const filteredAlerts = filterSeverity
    ? alerts.filter((a) => a.severity === filterSeverity)
    : alerts;

  if (!profile?.team_id) return null;

  return (
    <div className="bg-black border border-border/60 rounded-xl overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.5)]">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
            <Siren className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <h2 className="text-sm font-heading font-bold text-foreground tracking-tight">
              LIVE NETWORK ALERTS
            </h2>
            <p className="text-[10px] text-foreground/40 font-mono">
              REAL-TIME SNIFFER INGESTION // TERMUX BACKEND
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats */}
          <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono">
            <span className="text-foreground/40">
              Open: <span className="text-rose-400 font-bold">{openCount}</span>
            </span>
            <span className="text-foreground/40">
              Critical: <span className="text-rose-400 font-bold">{criticalCount}</span>
            </span>
          </div>

          {/* Pause / Resume */}
          <button
            onClick={() => setPaused((p) => !p)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              paused
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-background border-border/60 text-foreground/60 hover:border-foreground/30'
            }`}
            title={paused ? 'Resume live feed' : 'Pause live feed'}
          >
            {paused ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {paused ? 'PAUSED' : 'LIVE'}
          </button>
        </div>
      </div>

      {/* ── Filter chips ────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-border/40 bg-background/30">
        <ArrowUpDown className="w-3 h-3 text-foreground/40" />
        {['critical', 'high', 'medium', 'low'].map((sev) => {
          const cfg = SEVERITY_CONFIG[sev];
          const active = filterSeverity === sev;
          return (
            <button
              key={sev}
              onClick={() => setFilterSeverity(active ? null : sev)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider border transition-all duration-200 cursor-pointer ${
                active
                  ? `${cfg.bg} ${cfg.border} ${cfg.text}`
                  : 'border-transparent text-foreground/40 hover:text-foreground/70'
              }`}
            >
              {sev}
            </button>
          );
        })}
        {filterSeverity && (
          <button
            onClick={() => setFilterSeverity(null)}
            className="ml-auto text-[10px] font-mono text-foreground/40 hover:text-foreground/70 transition-colors duration-200 cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Alert list ──────────────────────────────────── */}
      <div
        ref={containerRef}
        className="overflow-y-auto max-h-[500px] scroll-smooth"
      >
        {filteredAlerts.length === 0 ? (
          <div className="p-10 flex flex-col items-center justify-center text-foreground/30 font-mono text-xs gap-3">
            <Radio className="w-8 h-8 opacity-40" />
            <span>Awaiting real-time sniffer ingestion...</span>
            <span className="text-[9px] text-foreground/20">
              Run the Termux Guardium sniffer on your network interface
            </span>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const sevCfg = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.low;
            const SevIcon = sevCfg.icon;
            const statusCfg = STATUS_PILLS[alert.status] ?? STATUS_PILLS.open;

            return (
              <div
                key={alert.id}
                className={`
                  grid grid-cols-[auto_1fr_auto] gap-3 px-5 py-3
                  border-b border-border/30
                  transition-all duration-200
                  hover:bg-foreground/[0.02]
                  ${sevCfg.glow}
                `}
              >
                {/* Severity icon */}
                <div className={`w-8 h-8 rounded-lg ${sevCfg.bg} border ${sevCfg.border} flex items-center justify-center shrink-0 mt-0.5`}>
                  <SevIcon className={`w-4 h-4 ${sevCfg.text}`} />
                </div>

                {/* Body */}
                <div className="min-w-0 space-y-1">
                  {/* Title row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold font-heading ${sevCfg.text}`}>
                      {sevCfg.label}
                    </span>
                    <span className="text-xs text-foreground/90 font-semibold truncate">
                      {alert.title}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-mono ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                      {alert.status}
                    </span>
                  </div>

                  {/* Description */}
                  {alert.description && (
                    <p className="text-[11px] text-foreground/60 leading-relaxed line-clamp-2">
                      {alert.description}
                    </p>
                  )}

                  {/* Metadata chips */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {alert.src_ip && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono text-foreground/50 bg-foreground/[0.03] px-1.5 py-0.5 rounded">
                        <Globe className="w-2.5 h-2.5" />
                        {alert.src_ip}
                      </span>
                    )}
                    {alert.protocol && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono text-foreground/50 bg-foreground/[0.03] px-1.5 py-0.5 rounded">
                        <Activity className="w-2.5 h-2.5" />
                        {alert.protocol}
                      </span>
                    )}
                    {alert.port && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono text-foreground/50 bg-foreground/[0.03] px-1.5 py-0.5 rounded">
                        :{alert.port}
                      </span>
                    )}
                    {alert.category && (() => {
                      const mitre = getMitreMapping(alert.title ?? '', alert.category ?? '');
                      const colors = mitreTacticColor(mitre.tactic);
                      return (
                        <a
                          href={mitre.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${colors.badge} ${colors.text} hover:opacity-80 transition-opacity duration-150`}
                          title={`MITRE ATT&CK: ${mitre.techniqueId} — ${mitre.techniqueName} (${mitre.tactic})`}
                        >
                          <Crosshair className="w-2.5 h-2.5" />
                          {mitre.techniqueId}
                        </a>
                      );
                    })()}
                    {/* Chain of custody hash badge */}
                    {(alert as any).current_hash && (
                      <span
                        className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                        title={`SHA-256: ${(alert as any).current_hash}`}
                      >
                        <Fingerprint className="w-2.5 h-2.5" />
                        {(alert as any).current_hash!.slice(0, 8)}…
                      </span>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <div className="shrink-0 text-right">
                  <span className="text-[10px] font-mono text-foreground/30 whitespace-nowrap">
                    {format(new Date(alert.created_at), 'HH:mm:ss')}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-t border-border/40 bg-background/30">
        <span className="text-[10px] font-mono text-foreground/40">
          Total alerts: <span className="text-foreground/70 font-bold">{alerts.length}</span>
        </span>
        <span className="text-[10px] font-mono text-foreground/40 flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${paused ? 'bg-amber-400' : 'bg-accent animate-ping'}`} />
          {paused ? 'PAUSED' : 'STREAMING'}
        </span>
      </div>
    </div>
  );
}

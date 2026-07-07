import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useMitigationStore } from '../stores/mitigationStore';
import type { MitigationAlert, TimelineEntry } from '../stores/mitigationStore';
import { generateAlert } from '../lib/mock/alertMock';
import { supabase } from '../lib/supabase/client';
import { getMitreMapping, mitreTacticColor } from '../lib/mitre-attack';
import {
  createChainedAlert,
  verifyChain,
  hashPrefix,
  type ChainVerificationResult,
  type ChainedAlert,
} from '../lib/chainOfCustody';
import MultiAgentRemediationCore from '../components/MultiAgentRemediationCore';
import FraudCorrelationEngine from '../components/FraudCorrelationEngine';
import PredictiveAttackForecaster from '../components/PredictiveAttackForecaster';
import {
  Clock,
  Ban,
  Lock,
  ArrowDownToLine,
  AlertTriangle,
  X,
  Undo2,
  Activity,
  Gauge,
  ListOrdered,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Crosshair,
  Fingerprint,
  ShieldCheck,
  ShieldX,
  FileCheck,
} from 'lucide-react';

const SEVERITY_CONFIG: Record<string, { border: string; dot: string; label: string; bg: string }> = {
  critical: {
    border: 'border-l-red-500',
    dot: 'bg-red-500',
    label: 'CRITICAL',
    bg: 'bg-red-500/10',
  },
  high: {
    border: 'border-l-amber-500',
    dot: 'bg-amber-500',
    label: 'HIGH',
    bg: 'bg-amber-500/10',
  },
  medium: {
    border: 'border-l-yellow-500',
    dot: 'bg-yellow-500',
    label: 'MEDIUM',
    bg: 'bg-yellow-500/10',
  },
  low: {
    border: 'border-l-gray-500',
    dot: 'bg-gray-500',
    label: 'LOW',
    bg: 'bg-gray-500/10',
  },
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  block_ip: <Ban className="w-3.5 h-3.5" />,
  isolate_host: <Lock className="w-3.5 h-3.5" />,
  drop_packet: <ArrowDownToLine className="w-3.5 h-3.5" />,
  escalate: <AlertTriangle className="w-3.5 h-3.5" />,
  dismiss: <X className="w-3.5 h-3.5" />,
};

const ACTION_LABELS: Record<string, string> = {
  block_ip: 'Block IP',
  isolate_host: 'Isolate Host',
  drop_packet: 'Drop Packet',
  escalate: 'Escalate',
  dismiss: 'Dismiss',
};

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function MitigationPage() {
  const { profile } = useAuthStore();
  const {
    alerts,
    timeline,
    stats,
    addAlert,
    mitigateAlert,
    dismissAlert,
    escalateAlert,
    undoMitigation,
    loadMockAlerts,
  } = useMitigationStore();

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [undoTimers, setUndoTimers] = useState<Record<string, ReturnType<typeof setTimeout>>>({});
  const [timelineExpanded, setTimelineExpanded] = useState<string | null>(null);

  // Chain of custody state
  const [chainResult, setChainResult] = useState<ChainVerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [chainExpanded, setChainExpanded] = useState(false);
  // Track the last alert we chained, to build the chain incrementally
  const lastChainedRef = useRef<ChainedAlert | null>(null);
  // Set of alert IDs that have stored hashes in the DB
  const [hashedAlertIds, setHashedAlertIds] = useState<Set<string>>(new Set());

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Helper: map a DB network_alerts row to MitigationAlert with MITRE + chain
  const mapDbAlert = useCallback((row: any): MitigationAlert => {
    const mitre = getMitreMapping(row.title ?? '', row.category ?? '');
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      severity: row.severity,
      category: row.category,
      srcIp: String(row.src_ip ?? ''),
      dstIp: String(row.dst_ip ?? ''),
      protocol: row.protocol ?? 'TCP',
      port: row.port ?? 0,
      status: row.status ?? 'open',
      createdAt: row.created_at,
      mitigatedAt: row.mitigated_at ?? undefined,
      actionTaken: row.action_taken ?? undefined,
      mitreId: row.mitre_id ?? mitre.techniqueId,
      mitreTactic: mitre.tactic,
      previousHash: row.previous_hash ?? undefined,
      currentHash: row.current_hash ?? undefined,
      hashedAt: row.hashed_at ?? undefined,
    };
  }, []);

  // Load initial alerts from Supabase + subscribe to new ones
  useEffect(() => {
    if (!profile?.team_id) return;

    const loadAlerts = async () => {
      const { data, error } = await supabase
        .from('network_alerts')
        .select('*')
        .eq('team_id', profile.team_id!)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Failed to load alerts:', error);
        return;
      }

      const mapped = (data ?? []).map(mapDbAlert);
      loadMockAlerts(mapped);

      // Track which alerts already have chain hashes stored
      const hashed = new Set<string>();
      let chainTail: ChainedAlert | null = null;

      // Build chain from oldest to newest (data is newest-first, so reverse)
      const sorted = [...(data ?? [])].reverse();
      for (const row of sorted) {
        if (row.current_hash) {
          hashed.add(row.id);
          chainTail = {
            id: row.id,
            dataPayload: '',
            previousHash: row.previous_hash ?? '0000000000000000000000000000000000000000000000000000000000000000',
            currentHash: row.current_hash,
            hashedAt: row.hashed_at ?? row.created_at,
          };
        }
      }
      setHashedAlertIds(hashed);
      lastChainedRef.current = chainTail;
    };

    loadAlerts();

    // Subscribe to real-time new alerts
    const channel = supabase
      .channel('alerts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'network_alerts',
          filter: `team_id=eq.${profile.team_id!}`,
        },
        (payload) => {
          const newAlert = mapDbAlert(payload.new);
          addAlert(newAlert);
          if (payload.new.current_hash) {
            setHashedAlertIds((prev) => new Set(prev).add(payload.new.id));
            lastChainedRef.current = {
              id: payload.new.id,
              dataPayload: '',
              previousHash: payload.new.previous_hash ?? '0000000000000000000000000000000000000000000000000000000000000000',
              currentHash: payload.new.current_hash,
              hashedAt: payload.new.hashed_at ?? new Date().toISOString(),
            };
          }
        }
      )
      .subscribe();

    // Periodically generate a demo alert (every 15-45s) with chain-of-custody hashing
    const demoInterval = setInterval(async () => {
      if (!profile?.team_id) return;
      const mock = generateAlert();

      // Build the hash payload (deterministic key-sorted JSON)
      const payloadFields: Record<string, unknown> = {
        title: mock.title,
        description: mock.description,
        severity: mock.severity,
        category: mock.category,
        src_ip: mock.srcIp,
        dst_ip: mock.dstIp,
        protocol: mock.protocol,
        port: mock.port,
      };

      // Compute chain hash
      const chained = await createChainedAlert(
        `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        payloadFields,
        lastChainedRef.current,
      );

      // Update the tail reference
      lastChainedRef.current = chained;

      await supabase.from('network_alerts').insert({
        team_id: profile.team_id,
        title: mock.title,
        description: mock.description,
        severity: mock.severity,
        category: mock.category,
        src_ip: mock.srcIp,
        dst_ip: mock.dstIp,
        protocol: mock.protocol,
        port: mock.port,
        status: 'open',
        mitre_id: mock.mitreId,
        previous_hash: chained.previousHash,
        current_hash: chained.currentHash,
        hashed_at: chained.hashedAt,
      });
    }, Math.floor(Math.random() * 30000) + 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(demoInterval);
    };
  }, [profile?.team_id, addAlert, loadMockAlerts, mapDbAlert]);

  const handleAction = async (alertId: string, action: string) => {
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) return;

    try {
      if (profile?.team_id) {
        const { error } = await supabase.from('network_alerts').upsert({
          id: alertId,
          team_id: profile.team_id,
          title: alert.title,
          severity: alert.severity,
          category: alert.category,
          src_ip: alert.srcIp,
          dst_ip: alert.dstIp,
          protocol: alert.protocol,
          port: alert.port,
          description: alert.description,
          status: action === 'dismiss' ? 'dismissed' : 'mitigated',
          mitigated_by: action === 'dismiss' ? null : profile.id,
          mitigated_at: action === 'dismiss' ? null : new Date().toISOString(),
          action_taken: action,
        });
        if (error) {
          showToast(`Failed to update: ${error.message}`, 'error');
          return;
        }
      }

      if (action === 'dismiss') {
        dismissAlert(alertId);
        showToast(`Dismissed: ${alert.title}`);
      } else if (action === 'escalate') {
        escalateAlert(alertId);
        showToast(`Escalated: ${alert.title}`);
      } else {
        mitigateAlert(alertId, action);
        showToast(`Mitigated via ${ACTION_LABELS[action] || action}: ${alert.srcIp}`);

        const timer = setTimeout(() => {
          setUndoTimers((prev) => {
            const next = { ...prev };
            delete next[alertId];
            return next;
          });
        }, 10000);
        setUndoTimers((prev) => ({ ...prev, [alertId]: timer }));
      }
    } catch {
      showToast('Failed to apply action', 'error');
    }
  };

  const handleUndo = (alertId: string) => {
    const timer = undoTimers[alertId];
    if (timer) clearTimeout(timer);
    undoMitigation(alertId);
    setUndoTimers((prev) => {
      const next = { ...prev };
      delete next[alertId];
      return next;
    });
    showToast('Action undone');
  };

  // ── Chain of Custody: Verify Integrity ──────────────────────

  const handleVerifyIntegrity = async () => {
    setVerifying(true);
    try {
      // Get all alerts with stored hashes, sorted oldest-first
      const hashedAlerts = alerts
        .filter((a) => a.currentHash)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      if (hashedAlerts.length < 2) {
        showToast('Need at least 2 hashed alerts to verify the chain', 'info');
        setVerifying(false);
        return;
      }

      const result = await verifyChain(
        hashedAlerts.map((a) => ({
          id: a.id,
          label: a.title,
          fields: {
            title: a.title,
            description: a.description,
            severity: a.severity,
            category: a.category,
            src_ip: a.srcIp,
            dst_ip: a.dstIp,
            protocol: a.protocol,
            port: a.port,
          },
          storedPreviousHash: a.previousHash ?? '0000000000000000000000000000000000000000000000000000000000000000',
          storedCurrentHash: a.currentHash!,
        })),
      );

      setChainResult(result);
      setChainExpanded(true);

      if (result.valid) {
        showToast(`✅ Chain intact — ${result.total} alerts verified`, 'success');
      } else {
        showToast(`⚠️ Chain broken at ${result.brokenLinks.length} link(s)!`, 'error');
      }
    } catch (err) {
      showToast('Verification failed', 'error');
      console.error(err);
    } finally {
      setVerifying(false);
    }
  };

  // Active alerts sorted: critical first, then by recency
  const activeAlerts = alerts
    .filter((a) => a.status === 'open' || a.status === 'acknowledged')
    .sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const sevDiff = (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4);
      if (sevDiff !== 0) return sevDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // Mitigated alerts sorted by mitigatedAt desc
  const mitigatedAlerts = alerts
    .filter((a) => a.status === 'mitigated' || a.status === 'dismissed' || a.status === 'escalated')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Stats for hashed vs unhashed alerts
  const hashedCount = alerts.filter((a) => a.currentHash).length;
  const unhashedCount = alerts.length - hashedCount;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-destructive" />
          Mitigation Sandbox
        </h1>
        <p className="text-sm text-foreground/50 mt-1">
          Simulate and respond to network security incidents
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 ${
            toast.type === 'success'
              ? 'bg-accent text-black'
              : toast.type === 'error'
                ? 'bg-destructive text-white'
                : 'bg-secondary border border-border text-foreground'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex gap-6">
        {/* Left column: Alert feed */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Active alerts */}
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-destructive" />
            Active Alerts
            <span className="text-xs font-mono text-foreground/50 bg-muted px-1.5 py-0.5 rounded">
              {activeAlerts.length}
            </span>
          </h2>

          {activeAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShieldAlert className="w-12 h-12 text-accent/30 mb-4" />
              <p className="text-foreground/50 text-sm">No active alerts.</p>
              <p className="text-foreground/40 text-xs mt-1">The network is quiet... for now.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeAlerts.map((alert) => {
                const sev = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.low;
                const hasUndo = undoTimers[alert.id];
                const isHashed = !!alert.currentHash;

                return (
                  <div
                    key={alert.id}
                    className={`bg-secondary border-l-4 ${sev.border} border border-border rounded-lg p-4 hover:border-accent/20 transition-all duration-200`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${sev.dot}`} />
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${sev.bg} ${sev.dot.replace('bg-', 'text-')}`}>
                          {sev.label}
                        </span>
                        <span className="text-xs text-foreground/40">{formatRelativeTime(alert.createdAt)}</span>
                      </div>
                      {hasUndo && (
                        <button
                          onClick={() => handleUndo(alert.id)}
                          className="flex items-center gap-1 px-2 py-1 bg-muted rounded-lg text-xs text-foreground/70 hover:text-accent transition-colors duration-150 cursor-pointer"
                        >
                          <Undo2 className="w-3 h-3" />
                          Undo
                        </button>
                      )}
                    </div>

                    <h3 className="text-sm font-semibold text-foreground mb-1">{alert.title}</h3>
                    <p className="text-xs text-foreground/60 mb-2">{alert.description}</p>

                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-foreground/50">
                      <span className="px-1.5 py-0.5 bg-muted rounded">{alert.srcIp}</span>
                      <span className="text-foreground/30">&rarr;</span>
                      <span className="px-1.5 py-0.5 bg-muted rounded">{alert.dstIp}</span>
                      <span className="px-1.5 py-0.5 bg-muted rounded">{alert.protocol}</span>
                      <span className="px-1.5 py-0.5 bg-muted rounded">:{alert.port}</span>
                      {alert.mitreId && (() => {
                        const colors = mitreTacticColor(alert.mitreTactic ?? '');
                        return (
                          <a
                            href={`https://attack.mitre.org/techniques/${alert.mitreId!.replace('.', '/')}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${colors.badge} ${colors.text} hover:opacity-80 transition-opacity duration-150`}
                            title={`MITRE ATT&CK: ${alert.mitreId} — ${alert.mitreTactic}`}
                          >
                            <Crosshair className="w-2.5 h-2.5" />
                            {alert.mitreId}
                          </a>
                        );
                      })()}
                      {/* Chain of custody hash badge */}
                      {isHashed && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-[9px] font-mono"
                          title={`SHA-256: ${alert.currentHash}`}
                        >
                          <Fingerprint className="w-2.5 h-2.5" />
                          {hashPrefix(alert.currentHash!, 8)}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2 border-t border-border/50">
                      <button
                        onClick={() => handleAction(alert.id, 'block_ip')}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-all duration-150 cursor-pointer"
                      >
                        <Ban className="w-3 h-3" />
                        Block IP
                      </button>
                      <button
                        onClick={() => handleAction(alert.id, 'isolate_host')}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-medium hover:bg-amber-500/20 transition-all duration-150 cursor-pointer"
                      >
                        <Lock className="w-3 h-3" />
                        Isolate Host
                      </button>
                      <button
                        onClick={() => handleAction(alert.id, 'drop_packet')}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-medium hover:bg-blue-500/20 transition-all duration-150 cursor-pointer"
                      >
                        <ArrowDownToLine className="w-3 h-3" />
                        Drop Packet
                      </button>
                      <button
                        onClick={() => handleAction(alert.id, 'escalate')}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-medium hover:bg-purple-500/20 transition-all duration-150 cursor-pointer"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Escalate
                      </button>
                      <button
                        onClick={() => handleAction(alert.id, 'dismiss')}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-muted text-foreground/50 border border-border rounded-lg text-xs font-medium hover:text-foreground transition-all duration-150 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Mitigated section */}
          {mitigatedAlerts.length > 0 && (
            <div className="space-y-3 mt-6">
              <h3 className="text-sm font-semibold text-foreground/60 flex items-center gap-2">
                <ListOrdered className="w-4 h-4" />
                Resolved
                <span className="text-xs font-mono text-foreground/40 bg-muted px-1.5 py-0.5 rounded">
                  {mitigatedAlerts.length}
                </span>
              </h3>
              {mitigatedAlerts.slice(0, 10).map((alert) => (
                <div
                  key={alert.id}
                  className="bg-secondary/50 border border-border rounded-lg p-3 opacity-70 hover:opacity-100 transition-all duration-200"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-accent">
                      Mitigated via {ACTION_LABELS[alert.actionTaken || ''] || alert.actionTaken}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-foreground/40">
                        {alert.mitigatedAt ? formatRelativeTime(alert.mitigatedAt) : ''}
                      </span>
                      {alert.status === 'mitigated' && undoTimers[alert.id] && (
                        <button
                          onClick={() => handleUndo(alert.id)}
                          className="flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded text-[10px] text-foreground/50 hover:text-accent transition-colors duration-150 cursor-pointer"
                        >
                          <Undo2 className="w-2.5 h-2.5" />
                          Undo
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-foreground/60">{alert.title}</p>
                  <p className="text-[10px] font-mono text-foreground/40 mt-0.5">{alert.srcIp} &rarr; {alert.dstIp}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel: Stats + MITRE + Chain of Custody + Timeline */}
        <div className="w-80 shrink-0 space-y-4">
          {/* Stats summary */}
          <div className="bg-secondary border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" />
              Stats
            </h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/50">Total Alerts</span>
                <span className="font-mono font-semibold text-foreground">{stats.totalAlerts}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/50">Open</span>
                <span className="font-mono text-foreground">{stats.openCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/50">Mitigated</span>
                <span className="font-mono text-accent font-semibold">{stats.mitigatedCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/50">Dismissed</span>
                <span className="font-mono text-foreground">{stats.dismissedCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/50">Escalated</span>
                <span className="font-mono text-purple-400">{stats.escalatedCount}</span>
              </div>
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground/50">Mitigation Rate</span>
                  <span className="font-mono text-foreground font-semibold">
                    {stats.totalAlerts > 0
                      ? `${((stats.mitigatedCount / stats.totalAlerts) * 100).toFixed(0)}%`
                      : '0%'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/50">Avg Response</span>
                <span className="font-mono text-foreground">
                  {stats.avgResponseTime > 0
                    ? stats.avgResponseTime < 60
                      ? `${stats.avgResponseTime}s`
                      : `${Math.floor(stats.avgResponseTime / 60)}m ${stats.avgResponseTime % 60}s`
                    : '—'}
                </span>
              </div>
              {/* Chain coverage */}
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground/50 flex items-center gap-1">
                    <Fingerprint className="w-3 h-3 text-emerald-400" />
                    Hash-Chained
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {hashedCount}/{stats.totalAlerts}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Chain of custody panel ──────────────────────────── */}
          <div className="bg-secondary border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                Chain of Custody
              </h3>
              <button
                onClick={handleVerifyIntegrity}
                disabled={verifying || hashedCount < 2}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono font-semibold border transition-all duration-200 cursor-pointer ${
                  verifying
                    ? 'bg-muted text-foreground/40 border-border cursor-wait'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                } ${hashedCount < 2 ? 'opacity-40 cursor-not-allowed' : ''}`}
                title={hashedCount < 2 ? 'Need at least 2 hashed alerts to verify' : 'Recompute and verify the hash chain'}
              >
                <ShieldCheck className="w-3 h-3" />
                {verifying ? 'Verifying...' : 'Verify Integrity'}
              </button>
            </div>

            {/* Chain verification result */}
            {chainResult ? (
              <div className="space-y-2">
                <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium ${
                  chainResult.valid
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  {chainResult.valid ? (
                    <ShieldCheck className="w-3 h-3 shrink-0" />
                  ) : (
                    <ShieldX className="w-3 h-3 shrink-0" />
                  )}
                  <span>{chainResult.valid ? 'Intact' : `Broken at ${chainResult.brokenLinks.length} link(s)`}</span>
                  <span className="ml-auto font-mono">{chainResult.total} alerts</span>
                </div>

                {/* Expandable chain detail */}
                <button
                  onClick={() => setChainExpanded(!chainExpanded)}
                  className="flex items-center gap-1 text-[10px] text-foreground/40 hover:text-foreground/70 transition-colors duration-150 cursor-pointer w-full"
                >
                  {chainExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {chainExpanded ? 'Hide chain' : `Show ${chainResult.links.length} links`}
                </button>

                {chainExpanded && (
                  <div className="mt-1 space-y-1 max-h-[300px] overflow-y-auto">
                    {chainResult.links.map((link) => (
                      <div
                        key={link.alertId}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-mono ${
                          link.passed
                            ? 'text-emerald-400/70'
                            : 'text-rose-400 bg-rose-500/5'
                        }`}
                      >
                        {link.passed ? (
                          <ShieldCheck className="w-2.5 h-2.5 shrink-0" />
                        ) : (
                          <ShieldX className="w-2.5 h-2.5 shrink-0" />
                        )}
                        <span className="truncate max-w-[100px]">{link.label}</span>
                        <span className="ml-auto">{hashPrefix(link.computedHash, 6)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-foreground/40 text-center py-3">
                {hashedCount < 2
                  ? 'Awaiting hash-chained alerts...'
                  : 'Press "Verify Integrity" to validate the chain'}
              </p>
            )}
          </div>

          {/* MITRE ATT&CK Techniques in play */}
          {(() => {
            const techniqueCounts = new Map<string, { count: number; tactic: string }>();
            alerts.forEach((a) => {
              if (a.mitreId) {
                const existing = techniqueCounts.get(a.mitreId);
                if (existing) {
                  existing.count++;
                } else {
                  techniqueCounts.set(a.mitreId, { count: 1, tactic: a.mitreTactic ?? '' });
                }
              }
            });
            const sorted = [...techniqueCounts.entries()].sort((a, b) => b[1].count - a[1].count);

            if (sorted.length > 0) {
              return (
                <div className="bg-secondary border border-border rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                    <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                    MITRE ATT&CK
                    <span className="ml-auto text-[10px] text-foreground/40 font-mono">{sorted.length} techniques</span>
                  </h3>
                  <div className="space-y-1.5">
                    {sorted.slice(0, 8).map(([id, data]) => {
                      const colors = mitreTacticColor(data.tactic);
                      return (
                        <a
                          key={id}
                          href={`https://attack.mitre.org/techniques/${id.replace('.', '/')}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted/50 transition-colors duration-150 group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[10px] font-bold font-mono ${colors.text}`}>{id}</span>
                            <span className="text-[10px] text-foreground/40 truncate">{data.tactic}</span>
                          </div>
                          <span className="text-[10px] font-mono text-foreground/50 shrink-0 ml-2">{data.count}</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Timeline log */}
          <div className="bg-secondary border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Timeline
            </h3>
            {timeline.length === 0 ? (
              <p className="text-xs text-foreground/40 py-4 text-center">No actions yet</p>
            ) : (
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {timeline.map((entry) => {
                  const alert = alerts.find((a) => a.id === entry.alertId);
                  const isExpanded = timelineExpanded === entry.id;

                  return (
                    <div
                      key={entry.id}
                      onClick={() => setTimelineExpanded(isExpanded ? null : entry.id)}
                      className="p-2 rounded-lg hover:bg-muted/50 transition-colors duration-150 cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 text-xs">
                        {ACTION_ICONS[entry.action] || <Activity className="w-3 h-3 text-foreground/40" />}
                        <span className="flex-1 text-foreground/70 truncate">
                          {entry.action === 'mitigated' ? 'Blocked' :
                           entry.action === 'dismissed' ? 'Dismissed' :
                           entry.action === 'escalated' ? 'Escalated' :
                           entry.action === 'undo' ? 'Undone' : entry.action}
                        </span>
                        <span className="text-[10px] text-foreground/40">
                          {formatRelativeTime(entry.timestamp)}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 text-foreground/30" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-foreground/30" />
                        )}
                      </div>
                      {isExpanded && (
                        <div className="mt-1.5 ml-5 text-[10px] text-foreground/40 space-y-0.5">
                          <p>Action: {entry.details}</p>
                          {alert && (
                            <>
                              <p>Alert: {alert.title}</p>
                              <p>Severity: {alert.severity}</p>
                              <p>Source: {alert.srcIp}</p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- AMD INSTINCT MULTI-AGENT REMEDIATION CORE ---- */}
      <MultiAgentRemediationCore />

      {/* ---- REAL-TIME FINANCIAL FRAUD CORRELATION & BIG DATA INGESTION ENGINE ---- */}
      <FraudCorrelationEngine />

      {/* ---- PREDICTIVE ATTACK VECTOR FORECASTER ---- */}
      <PredictiveAttackForecaster />
    </div>
  );
}
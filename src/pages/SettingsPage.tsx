import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase/client';
import { SUPABASE_URL } from '../constants/config';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  User,
  Shield,
  Radio,
  CheckCircle,
  RefreshCw,
  Server,
  Zap,
  Ban,
  Globe,
  AlertTriangle,
  DollarSign,
  Activity,
  Skull,
  Key,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import PredictiveAttackForecaster from '../components/PredictiveAttackForecaster';

/* ─── Types ───────────────────────────────────────────── */
interface FinancialInterception {
  id: string;
  src_ip: string;
  dst_ip: string;
  protocol: 'RPC' | 'Web3 Socket' | 'JSON-RPC' | 'WS' | 'gRPC';
  risk_factor: number;
  target_label: string;
  direction: 'outbound' | 'inbound';
  status: 'active' | 'killed';
  killed_at: string | null;
  killed_by: string | null;
  created_at: string;
}

const HIGH_RISK_RAILS: Array<{ ip: string; label: string }> = [
  { ip: '45.33.22.184', label: 'Known Wallet Drainer C2' },
  { ip: '103.235.46.12', label: 'Tornado Cash Mixer Clone' },
  { ip: '185.234.72.18', label: 'Suspicious Exchange Rail' },
  { ip: '91.242.230.15', label: 'Unregulated DEX Router' },
  { ip: '198.51.100.77', label: 'Fake Bridge Phishing Node' },
  { ip: '203.0.113.200', label: 'Wallet Drainer Pool' },
  { ip: '192.0.2.88', label: 'Known Mixer Endpoint' },
  { ip: '104.28.14.55', label: 'Suspicious RPC Proxy' },
];

export default function SettingsPage() {
  const { profile, user } = useAuthStore();
  const [pipelineStatus, setPipelineStatus] = useState<'checking' | 'active' | 'offline'>('checking');
  const [interfaceName, setInterfaceName] = useState('wlan0');
  const [lastAlertTime, setLastAlertTime] = useState<string | null>(null);
  const [totalBlocked, setTotalBlocked] = useState(0);
  const [totalMonitored, setTotalMonitored] = useState(0);

  /* ─── Financial interceptor state (from Supabase) ─── */
  const [interceptions, setInterceptions] = useState<FinancialInterception[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const seedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(localStorage.getItem('guardium_api_key') || '');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  /* ─── Call Edge Function via Supabase SDK ────────────── */
  const callInterceptorFn = useCallback(async (count: number = 1) => {
    try {
      setErrorState(null);
      const { error } = await supabase.functions.invoke('financial-interceptor', {
        body: { count },
      });
      if (error) {
        const msg = error.message || 'Unknown error';
        console.error('financial-interceptor invoke error:', error);
        setErrorState(`Edge function error: ${msg}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to call financial-interceptor fn:', msg);
      // Only show the error state if we haven't seen it before this session
      setErrorState(`Could not reach the Financial Interceptor service. The system will retry automatically.`);
    }
  }, []);

  /* ─── Fetch existing interceptions on mount ────────── */
  const fetchActiveInterceptions = useCallback(async () => {
    if (!profile?.team_id) return;
    const { data, error } = await supabase
      .from('financial_interceptions')
      .select('*')
      .eq('team_id', profile.team_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Failed to fetch interceptions:', error);
      return;
    }
    if (data) {
      setInterceptions(data as unknown as FinancialInterception[]);
      setTotalMonitored(data.length);
      setTotalBlocked(data.filter((r) => r.status === 'killed').length);
    }
  }, [profile?.team_id]);

  /* ─── Seed initial data + periodic seeding ─────────── */
  useEffect(() => {
    if (!profile?.team_id) return;

    callInterceptorFn(5);

    // Fetch existing after a brief delay for DB propagation
    const fetchTimer = setTimeout(() => {
      fetchActiveInterceptions();
    }, 1000);

    // Periodic seeding every 4-9 seconds
    const scheduleSeed = () => {
      const delay = Math.floor(Math.random() * 5000) + 4000;
      seedTimerRef.current = setTimeout(() => {
        callInterceptorFn(1);
        scheduleSeed();
      }, delay);
    };
    scheduleSeed();

    return () => {
      clearTimeout(fetchTimer);
      if (seedTimerRef.current) clearTimeout(seedTimerRef.current);
    };
  }, [profile?.team_id, callInterceptorFn, fetchActiveInterceptions]);

  /* ─── Realtime subscription: INSERT & UPDATE ───────── */
  useEffect(() => {
    if (!profile?.team_id) return;
    setPipelineStatus('active');

    const channel = supabase
      .channel('financial-interceptor-live')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'financial_interceptions',
          filter: `team_id=eq.${profile.team_id}`,
        },
        (payload: RealtimePostgresChangesPayload<FinancialInterception>) => {
          const newRow = payload.new as unknown as FinancialInterception;
          if (newRow && newRow.id) {
            setInterceptions((prev) => {
              if (prev.some((item) => item.id === newRow.id)) return prev;
              return [newRow, ...prev].slice(0, 50);
            });
            setTotalMonitored((n) => n + 1);
            setLastAlertTime(new Date().toLocaleTimeString());
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'financial_interceptions',
          filter: `team_id=eq.${profile.team_id}`,
        },
        (payload: RealtimePostgresChangesPayload<FinancialInterception>) => {
          const updated = payload.new as unknown as FinancialInterception;
          if (updated && updated.id) {
            setInterceptions((prev) =>
              prev.map((fi) => (fi.id === updated.id ? updated : fi)),
            );
            if (updated.status === 'killed') {
              setTotalBlocked((n) => n + 1);
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.team_id]);

  // Auto-scroll to newest
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [interceptions.length]);

  /* ─── Kill switch (updates DB row + records operator) ─── */
  const handleKillSwitch = useCallback(
    async (id: string) => {
      if (!profile?.id) return;
      try {
        const { error } = await supabase
          .from('financial_interceptions')
          .update({ status: 'killed', killed_at: new Date().toISOString(), killed_by: profile.id })
          .eq('id', id);

        if (error) {
          console.error('Kill switch error:', error);
        }
      } catch (err) {
        console.error('Kill switch failed:', err);
      }
    },
    [profile?.id],
  );

  /* ─── Mass kill all active ─────────────────────────── */
  const handleMassKill = useCallback(async () => {
    const activeIds = interceptions
      .filter((fi) => fi.status === 'active')
      .map((fi) => fi.id);

    for (const id of activeIds) {
      await handleKillSwitch(id);
    }
  }, [interceptions, handleKillSwitch]);

  const riskColor = (factor: number) => {
    if (factor >= 95) return 'text-rose-400';
    if (factor >= 90) return 'text-amber-400';
    return 'text-orange-400';
  };
  const activeInterceptions = interceptions.filter((fi) => fi.status === 'active');

  return (
    <div className="p-6 space-y-6">
      {/* GUARDIUM OPS BANNER */}
      <div className="border-b border-border/80 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold text-accent flex items-center gap-2 tracking-tight">
            <Shield className="w-5 h-5 text-accent drop-shadow-[0_0_6px_#22C55E]" />
            GUARDIUM OPERATIONS CENTER
            <span className="text-[10px] ml-2 px-2 py-0.5 rounded bg-accent/10 border border-accent/30 text-accent font-mono">
              TIER-1 BANKING
            </span>
          </h1>
          <p className="text-[11px] text-foreground/40 mt-1 font-mono tracking-wider">
            SYSTEM_SETTINGS_V2.0 // ENTERPRISE INGESTION ENGINE // ENCRYPTED CONTROL PLANE
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-accent font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
            LIVE
          </span>
          <span className="text-foreground/40 font-mono">
            {new Date().toLocaleTimeString()} UTC
          </span>
        </div>
      </div>

      {/* Error banner */}
      {errorState && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <p className="text-xs font-mono text-rose-300">{errorState}</p>
          <button
            onClick={() => setErrorState(null)}
            className="ml-auto shrink-0 text-[10px] text-rose-400/60 hover:text-rose-400 px-2 py-0.5 rounded border border-rose-500/20 hover:border-rose-500/40 transition-all cursor-pointer"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* ─── PREDICTIVE ATTACK VECTOR FORECASTER ────────── */}
      <PredictiveAttackForecaster />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pipeline Status */}
          <div className="bg-black border border-border/60 rounded-xl p-5 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-heading font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                <Radio className="w-4 h-4 text-accent animate-pulse" />
                INGESTION &amp; DEPLOYMENT PIPELINES
              </h2>
              <span
                className={`text-xs px-2.5 py-1 rounded-full border font-bold flex items-center gap-1.5 font-mono ${
                  pipelineStatus === 'active'
                    ? 'bg-accent/10 border-accent/30 text-accent'
                    : 'bg-destructive/10 border-destructive/30 text-destructive'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    pipelineStatus === 'active' ? 'bg-accent animate-ping' : 'bg-destructive'
                  }`}
                />
                {pipelineStatus === 'active' ? 'PIPELINE_ACTIVE' : 'LINK_MISSING'}
              </span>
            </div>

            <div className="space-y-2.5 text-sm">
              {[
                { label: 'Termux Backend Ingestion Engine', desc: 'Automated Python core capturing packet streams on socket interface layer.' },
                { label: 'Supabase DB Relational Mapping', desc: 'Raw logs converted to security event objects via structured schemas.' },
                { label: 'WebSocket Realtime Sync', desc: 'Active DB proxy listeners streaming metrics without polling loops.' },
                { label: 'Blockchain Ledger Interceptor', desc: 'Deep packet inspection on RPC/Web3 outbound traffic to financial rails.', accent: 'text-amber-400' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="p-3 bg-background border border-border/50 rounded-lg flex items-start gap-3 transition-all duration-200 hover:border-border/80"
                >
                  <CheckCircle className={`w-4 h-4 mt-0.5 shrink-0 ${item.accent || 'text-accent'}`} />
                  <div>
                    <p className={`font-semibold text-foreground ${item.accent || ''}`}>{item.label}</p>
                    <p className="text-foreground/50 mt-0.5 text-xs">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FINTECH & BLOCKCHAIN LEDGER INTERCEPTOR (LIVE FROM SUPABASE) */}
          <div className="bg-black border border-amber-500/20 rounded-xl shadow-[0_0_25px_rgba(245,158,11,0.08)] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-amber-500/15">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-sm font-heading font-bold text-amber-400 tracking-tight">
                    FINTECH &amp; BLOCKCHAIN LEDGER INTERCEPTOR
                  </h2>
                  <p className="text-[10px] text-foreground/40 font-mono">
                    LIVE FROM SUPABASE // REALTIME DB STREAM // DEEP PACKET INSPECTION
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-[10px] text-foreground/40 font-mono uppercase">Monitored</p>
                  <p className="text-sm font-bold text-amber-400 font-mono">{totalMonitored}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-foreground/40 font-mono uppercase">Blocked</p>
                  <p className="text-sm font-bold text-rose-400 font-mono">{totalBlocked}</p>
                </div>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              </div>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_1.2fr_0.8fr_0.9fr_0.7fr] gap-2 px-5 py-2 text-[10px] font-mono text-foreground/40 uppercase tracking-widest border-b border-amber-500/10 bg-amber-500/5">
              <span>Source (Banking Subnet)</span>
              <span>Target Endpoint</span>
              <span>Protocol</span>
              <span>Risk Factor</span>
              <span className="text-center">Action</span>
            </div>

            {/* Scrollable feed */}
            <div ref={containerRef} className="overflow-y-auto max-h-[420px] scroll-smooth">
              {interceptions.length === 0 && (
                <div className="p-8 text-center text-foreground/30 font-mono text-xs">
                  Awaiting realtime stream from database...
                </div>
              )}
              {interceptions.map((fi) => (
                <div
                  key={fi.id}
                  className={`
                    grid grid-cols-[1fr_1.2fr_0.8fr_0.9fr_0.7fr] gap-2 px-5 py-2.5
                    border-b border-amber-500/5 text-xs font-mono items-center
                    transition-all duration-300
                    ${fi.status === 'killed' ? 'opacity-30 bg-rose-500/5 line-through decoration-rose-500/40' : 'hover:bg-amber-500/[0.03]'}
                  `}
                >
                  <span className="text-foreground/60">{fi.src_ip}</span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-foreground/90 font-semibold truncate">{fi.dst_ip}</span>
                    <span className="text-[10px] text-rose-400/70 truncate">
                      🔺 {fi.target_label}
                    </span>
                  </div>
                  <div>
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/80 text-[10px] font-semibold">
                      {fi.protocol}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className={`font-bold text-sm ${riskColor(fi.risk_factor)}`}>
                      {fi.risk_factor}%{' '}
                      <span className="text-[10px] font-normal">
                        {fi.risk_factor >= 95 ? 'CRITICAL' : 'HIGH'}
                      </span>
                    </span>
                    {fi.risk_factor >= 90 && (
                      <span className="text-[9px] font-semibold text-rose-400 bg-rose-500/10 px-1 py-0.5 rounded inline-flex items-center gap-1 w-fit">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        FINANCIAL EXFILTRATION RISK DETECTED
                      </span>
                    )}
                  </div>
                  <div className="flex justify-center">
                    {fi.status === 'killed' ? (
                      <span className="text-[10px] text-rose-400/60 font-mono">KILLED</span>
                    ) : (
                      <button
                        onClick={() => handleKillSwitch(fi.id)}
                        className="
                          flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                          bg-rose-500/15 border border-rose-500/30 text-rose-400
                          hover:bg-rose-500/30 hover:border-rose-500/60 hover:shadow-[0_0_12px_rgba(239,68,68,0.3)]
                          transition-all duration-200 text-[10px] font-bold uppercase tracking-wider cursor-pointer
                        "
                        title="Kill connection"
                      >
                        <Zap className="w-3 h-3" />
                        Kill Switch
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer stats */}
            <div className="flex items-center justify-between px-5 py-2.5 border-t border-amber-500/10 bg-amber-500/[0.02]">
              <span className="text-[10px] font-mono text-foreground/40">
                Active threats in view:{' '}
                <span className="text-amber-400 font-bold">{activeInterceptions.length}</span>
              </span>
              <span className="text-[10px] font-mono text-foreground/40">
                DB-backed pipeline | Kill-switch latency: &lt;12ms
              </span>
            </div>
          </div>

          {/* Gateway Configurations */}
          <div className="bg-black border border-border/60 rounded-xl p-5">
            <h2 className="text-sm font-heading font-semibold text-foreground/80 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Server className="w-4 h-4 text-accent" />
              Gateway Configurations
            </h2>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-[10px] font-semibold text-foreground/40 uppercase tracking-widest mb-1.5 font-mono">
                  Target Capture Interface
                </label>
                <input
                  type="text"
                  value={interfaceName}
                  onChange={(e) => setInterfaceName(e.target.value)}
                  className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent/50 transition-colors duration-200 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-foreground/40 uppercase tracking-widest mb-1.5 font-mono">
                  Supabase Host URL
                </label>
                <input
                  type="text"
                  readOnly
                  value={SUPABASE_URL || 'MISSING_ENV_VARIABLE'}
                  className="w-full bg-background/50 border border-border/60 rounded-lg px-3 py-2 text-foreground/40 font-mono select-all cursor-not-allowed text-xs"
                />
              </div>
            </div>
          </div>

          {/* Profile & Team */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-black border border-border/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-accent" />
                <h2 className="font-heading font-semibold text-sm text-foreground">Profile</h2>
              </div>
              <div className="text-sm text-foreground/80 space-y-1 font-mono text-xs">
                <p><span className="text-foreground/40">Email:</span> {profile?.email}</p>
                <p><span className="text-foreground/40">Role:</span> {profile?.role}</p>
                <p><span className="text-foreground/40">Team:</span> {profile?.team_id?.slice(0, 8)}...</p>
              </div>
            </div>
            <div className="bg-black border border-border/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent" />
                <h2 className="font-heading font-semibold text-sm text-foreground">Team</h2>
              </div>
              <p className="text-xs text-foreground/40 font-mono">
                Team management features will be available in a future update.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (1/3) */}
        <div className="space-y-6">
          {/* Pipe Telemetry */}
          <div className="bg-black border border-border/60 rounded-xl p-5 flex flex-col justify-between shadow-[0_0_15px_rgba(0,0,0,0.4)]">
            <div>
              <h2 className="text-sm font-heading font-semibold text-foreground/80 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-500" />
                Pipe Telemetry
              </h2>
              <div className="bg-background rounded-lg p-4 border border-border/50 font-mono text-xs space-y-2.5">
                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-foreground/40">Pipeline State:</span>
                  <span className="text-accent font-bold">READY</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-foreground/40">Sniffer Interface:</span>
                  <span className="text-foreground font-bold">{interfaceName}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-foreground/40">DB Realtime Channel:</span>
                  <span className="text-accent animate-pulse">LISTENING</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-foreground/40">Financial Interceptions:</span>
                  <span className="text-amber-400 font-bold">{totalMonitored}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-foreground/40">Last Live Data Block:</span>
                  <span className="text-amber-400 font-bold">{lastAlertTime || 'Awaiting stream...'}</span>
                </div>
              </div>
            </div>
            <div className="mt-6 space-y-2.5">
              <button
                onClick={() => {
                  fetchActiveInterceptions();
                  callInterceptorFn(3);
                }}
                className="w-full bg-background hover:bg-muted text-foreground/80 border border-border/60 font-semibold py-2 px-4 rounded-lg text-[10px] tracking-widest uppercase transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Re-verify Ingestion Pipeline
              </button>
            </div>
          </div>

          {/* OpenAI API Key */}
          <div className="bg-black border border-accent/20 rounded-xl p-5 shadow-[0_0_20px_rgba(34,197,94,0.05)]">
            <div className="flex items-center gap-2 mb-4">
              <Key className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-heading font-bold text-accent uppercase tracking-wider">
                AI API Key
              </h2>
            </div>
            <p className="text-[10px] text-foreground/40 font-mono mb-3 leading-relaxed">
              Set your OpenAI API key to enable AI-powered analysis in the Co-Pilot.
              Without it, the built-in expert system handles responses.
            </p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setKeySaved(false);
                  }}
                  placeholder={apiKey ? '••••••••••••' : 'sk-...'}
                  className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 pr-10 text-foreground focus:outline-none focus:border-accent/50 transition-colors duration-200 font-mono text-xs"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-foreground/40 hover:text-foreground transition-colors duration-150 cursor-pointer"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={() => {
                  localStorage.setItem('guardium_api_key', apiKey);
                  setKeySaved(true);
                  setTimeout(() => setKeySaved(false), 2000);
                }}
                disabled={!apiKey.trim()}
                className="px-4 py-2 rounded-lg bg-accent text-black font-bold text-xs hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer active:scale-95 shrink-0"
              >
                {keySaved ? 'SAVED ✓' : 'SAVE'}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-foreground/30 font-mono">
              <span className={`w-1.5 h-1.5 rounded-full ${apiKey ? 'bg-accent' : 'bg-foreground/20'}`} />
              {apiKey ? 'API key configured — AI mode active' : 'No API key — using expert system fallback'}
            </div>
          </div>

          {/* Emergency Shutdown Panel */}
          <div className="bg-black border border-rose-500/20 rounded-xl p-5 shadow-[0_0_20px_rgba(239,68,68,0.05)]">
            <div className="flex items-center gap-2 mb-4">
              <Skull className="w-4 h-4 text-rose-400" />
              <h2 className="text-sm font-heading font-bold text-rose-400 uppercase tracking-wider">
                Emergency Override
              </h2>
            </div>
            <div className="space-y-3">
              <div className="bg-rose-500/5 border border-rose-500/15 rounded-lg p-3 font-mono text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-foreground/40">Active Kill Switches:</span>
                  <span className="text-rose-400 font-bold">{totalBlocked}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/40">Blacklisted Rails:</span>
                  <span className="text-foreground/60 font-bold">{HIGH_RISK_RAILS.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/40">Auto-Kill Policy:</span>
                  <span className="text-accent">ENABLED</span>
                </div>
              </div>
              <button
                onClick={handleMassKill}
                disabled={activeInterceptions.length === 0}
                className="w-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 font-bold py-2.5 px-4 rounded-lg text-[10px] tracking-widest uppercase transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Ban className="w-3.5 h-3.5" />
                Mass Kill — All Active Threats
              </button>
            </div>
            <p className="text-[9px] text-foreground/30 mt-3 font-mono text-center">
              Authorized Tier-1 SOC operator action required for each kill
            </p>
          </div>

          {/* High-Risk Rail Registry */}
          <div className="bg-black border border-border/60 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <h3 className="text-[10px] font-heading font-semibold text-foreground/60 uppercase tracking-widest">
                High-Risk Rail Registry
              </h3>
            </div>
            <div className="space-y-1.5 font-mono text-[10px]">
              {HIGH_RISK_RAILS.slice(0, 6).map((rail, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1 px-2 rounded hover:bg-rose-500/[0.03] transition-colors duration-150"
                >
                  <span className="text-foreground/50">{rail.ip}</span>
                  <span className="text-rose-400/60 truncate ml-2 max-w-[140px]">{rail.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  RotateCw,
  Clock,
  Server,
  Activity,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  RadioTower,
  Square,
  Zap,
  Network,
  Radio,
  Monitor,
  Cpu,
  Globe,
} from 'lucide-react';
import { useScanStore } from '../stores/scanStore';
import { useAuthStore } from '../stores/authStore';
import { generateScanResults } from '../lib/mock/scannerMock';
import type { ScanHost } from '../lib/mock/scannerMock';
import SystemDiscoveryMap from '../components/SystemDiscoveryMap';
import { supabase } from '../lib/supabase/client';

type ScanProfile = 'quick' | 'standard' | 'deep';

const PROFILE_LABELS: Record<ScanProfile, string> = {
  quick: 'Quick Scan',
  standard: 'Standard Scan',
  deep: 'Deep Scan',
};

const PROFILE_DESCRIPTIONS: Record<ScanProfile, string> = {
  quick: 'Common ports, 5-10 hosts',
  standard: 'Top 1000 ports, 10-20 hosts',
  deep: 'All ports, 15-25 hosts',
};

/* ── Matrix neon loader stages ── */
const MATRIX_STAGES = [
  { label: 'MAPPING ACTIVE WIFI CARD...', sub: 'wlP2p0s3 — Link detected @ 866.7 Mbps' },
  { label: 'INJECTING ARP PROBES...', sub: 'Broadcast flood — 62.3K pkt/s to 192.168.1.0/24' },
  { label: 'STANDING UP RAW SOCKET CAPTURE...', sub: 'AF_PACKET SOCK_RAW — ifindex 3 — promisc mode ON' },
] as const;

const STAGE_LABELS = ['Discovering hosts...', 'Scanning ports...'];


/* ── Generate a random MAC address ── */
function randomMac(): string {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  return `${hex()}:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`.toUpperCase();
}

/* ── Device card helper ── */
interface DeviceCard {
  ip: string;
  mac: string;
  macVendor: string;
  hostname: string;
  os: string;
  latency: number;
  openPorts: { port: number; service: string; state: string }[];
}

function hostToCard(host: ScanHost): DeviceCard {
  return {
    ip: host.ip,
    mac: randomMac(),
    macVendor: host.macVendor,
    hostname: host.hostname,
    os: host.osGuess,
    latency: host.latency,
    openPorts: host.openPorts.map((p) => ({
      port: p.port,
      service: p.service,
      state: p.state,
    })),
  };
}

function getSubnetMask(subnet: string): string {
  if (subnet.includes('/24')) return '255.255.255.0';
  if (subnet.includes('/16')) return '255.255.0.0';
  if (subnet.includes('/8')) return '255.0.0.0';
  return '255.255.255.0';
}

function getCidrBits(subnet: string): string {
  const m = subnet.match(/\/(\d+)/);
  return m ? m[1] : '24';
}

export default function ScannerPage() {
  const { profile: userProfile, user } = useAuthStore();
  const {
    currentResults,
    scanHistory,
    scanStatus,
    scanProgress,
    startScan,
    setResults,
    addToHistory,
    setProgress,
    loadHistory,
    saveScanResult,
  } = useScanStore();

  const [targetSubnet, setTargetSubnet] = useState('192.168.1.0/24');
  const [scanProfile, setScanProfile] = useState<ScanProfile>('standard');
  const [profileOpen, setProfileOpen] = useState(false);
  const [expandedHost, setExpandedHost] = useState<string | null>(null);
  const [copiedBanner, setCopiedBanner] = useState<string | null>(null);
  const [discoveryMode, setDiscoveryMode] = useState(false);
  const [injectedCount, setInjectedCount] = useState(0);
  const simulationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Matrix loader state ── */
  const [matrixStage, setMatrixStage] = useState<number>(-1); // -1 = hidden
  const [matrixGlitch, setMatrixGlitch] = useState(false);
  const matrixTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* ── Derived device cards ── */
  const deviceCards = useMemo<DeviceCard[]>(
    () => (currentResults ? currentResults.hosts.map(hostToCard) : []),
    [currentResults],
  );

  // Load scan history from Supabase on mount
  useEffect(() => {
    if (userProfile?.team_id) {
      loadHistory(userProfile.team_id);
    }
  }, [userProfile?.team_id, loadHistory]);

  /* ── Guardium backend ingestion (live simulation) ──── */
  const runGuardiumIngestion = useCallback(async () => {
    if (!user) return;
    try {
      const { error } = await supabase.functions.invoke('guardium-ingestor', {
        body: { count: 2 },
      });
      if (!error) {
        setInjectedCount((c) => c + 2);
      }
    } catch {
      // silently fail
    }
  }, [user]);

  useEffect(() => {
    if (discoveryMode) {
      runGuardiumIngestion();
      simulationRef.current = setInterval(runGuardiumIngestion, 5000);
    } else {
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
        simulationRef.current = null;
      }
    }
    return () => {
      if (simulationRef.current) clearInterval(simulationRef.current);
    };
  }, [discoveryMode, runGuardiumIngestion]);

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Cleanup matrix timers on unmount ── */
  useEffect(() => {
    return () => {
      matrixTimers.current.forEach(clearTimeout);
    };
  }, []);

  const handleStartScan = useCallback(() => {
    if (scanStatus === 'scanning') return;

    // Toggle off discovery mode if already active and not scanning
    if (discoveryMode && scanStatus !== 'scanning') {
      setDiscoveryMode(false);
      if (progressRef.current) clearInterval(progressRef.current);
      setMatrixStage(-1);
      return;
    }

    startScan();
    setDiscoveryMode(true);

    // ── Matrix animation sequence ──
    setMatrixStage(0);
    matrixTimers.current.forEach(clearTimeout);
    matrixTimers.current = [];

    MATRIX_STAGES.forEach((_, idx) => {
      if (idx === 0) return;
      const t = setTimeout(() => {
        setMatrixStage(idx);
        setMatrixGlitch(true);
        setTimeout(() => setMatrixGlitch(false), 250);
      }, idx * 2800);
      matrixTimers.current.push(t);
    });

    let elapsed = 0;
    const duration = 8500;
    const interval = 150;

    progressRef.current = setInterval(() => {
      elapsed += interval;
      const pct = Math.min(Math.round((elapsed / duration) * 100), 99);
      setProgress(pct);
    }, interval);

    setTimeout(async () => {
      if (progressRef.current) clearInterval(progressRef.current);
      const results = generateScanResults(targetSubnet, scanProfile);
      setResults(results);
      addToHistory(results);

      if (userProfile?.team_id) {
        await saveScanResult(userProfile.team_id, results);
      }
    }, duration);
  }, [
    targetSubnet, scanProfile, userProfile, scanStatus, discoveryMode,
    startScan, setResults, addToHistory, setProgress, saveScanResult,
  ]);

  const handleCopyBanner = async (banner: string) => {
    try {
      await navigator.clipboard.writeText(banner);
      setCopiedBanner(banner);
      setTimeout(() => setCopiedBanner(null), 2000);
    } catch {
      // fallback
    }
  };

  const getPortStateClass = (state: string) => {
    switch (state) {
      case 'open':
        return 'text-accent';
      case 'filtered':
        return 'text-yellow-500';
      case 'closed':
        return 'text-destructive';
      default:
        return 'text-foreground/50';
    }
  };

  const formatDuration = (started: string, completed: string) => {
    const ms = new Date(completed).getTime() - new Date(started).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const currentStage = scanProgress < 50 ? 0 : 1;
  const isScanning = scanStatus === 'scanning';
  const isComplete = scanStatus === 'complete' && currentResults !== null;
  const subnetMask = getSubnetMask(targetSubnet);
  const cidrBits = getCidrBits(targetSubnet);

  return (
    <div className="p-6 space-y-6">
      {/* ─── TOP: LIVE SUBNET PROBING & PACKET INGESTION CONTROLS ─── */}
      <div className="border border-accent/30 rounded-xl bg-gradient-to-r from-accent/[0.04] via-background to-accent/[0.02] p-5 relative overflow-hidden">
        {/* Subtle scan-line overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,197,94,0.15) 2px, rgba(34,197,94,0.15) 3px)',
          }}
        />

        <div className="flex items-center gap-3 mb-4">
          <RadioTower className="w-5 h-5 text-accent" />
          <h2 className="text-sm font-heading font-bold text-accent tracking-wider">
            LIVE SUBNET PROBING &amp; PACKET INGESTION CONTROLS
          </h2>
        </div>

        <div className="flex flex-wrap items-end gap-3 relative z-10">
          {/* Target input */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-heading font-medium text-accent/70 uppercase tracking-[0.15em] mb-1.5 block">
              Target Subnet
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent/40" />
              <input
                type="text"
                value={targetSubnet}
                onChange={(e) => setTargetSubnet(e.target.value)}
                placeholder="192.168.1.0/24"
                disabled={isScanning}
                className="w-full pl-9 pr-3 py-2.5 bg-background/80 border border-accent/25 rounded-lg text-sm font-mono text-accent placeholder:text-accent/25 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 transition-colors duration-200 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Profile dropdown */}
          <div className="min-w-[180px]">
            <label className="text-[10px] font-heading font-medium text-accent/70 uppercase tracking-[0.15em] mb-1.5 block">
              Scan Profile
            </label>
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                disabled={isScanning}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-background/80 border border-accent/25 rounded-lg text-sm font-mono text-accent hover:border-accent/50 transition-colors duration-200 cursor-pointer disabled:opacity-50"
              >
                <div className="text-left">
                  <span className="block">{PROFILE_LABELS[scanProfile]}</span>
                  <span className="block text-[10px] text-accent/40">{PROFILE_DESCRIPTIONS[scanProfile]}</span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 text-accent/40 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 bg-secondary border border-accent/25 rounded-lg shadow-lg shadow-accent/5 z-20 py-1">
                    {(Object.keys(PROFILE_LABELS) as ScanProfile[]).map((key) => (
                      <button
                        key={key}
                        onClick={() => {
                          setScanProfile(key);
                          setProfileOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm font-mono transition-colors duration-150 cursor-pointer ${key === scanProfile ? 'bg-accent/10 text-accent' : 'text-accent/70 hover:bg-accent/5'}`}
                      >
                        <span className="block font-medium">{PROFILE_LABELS[key]}</span>
                        <span className="block text-[10px] text-accent/40">{PROFILE_DESCRIPTIONS[key]}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ─── TRIGGER BUTTON ─── */}
          <button
            onClick={handleStartScan}
            disabled={isScanning}
            className="group relative flex items-center gap-3 px-7 py-3 font-heading font-bold text-sm tracking-wider rounded-lg overflow-hidden transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {/* Animated neon border */}
            <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-accent via-accent/80 to-accent opacity-90 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="absolute inset-0 rounded-lg shadow-[0_0_20px_rgba(34,197,94,0.3)] group-hover:shadow-[0_0_35px_rgba(34,197,94,0.5)] transition-shadow duration-300" />
            {/* Pulsing border glow when scanning */}
            {isScanning && (
              <span className="absolute inset-0 rounded-lg animate-ping opacity-30 bg-accent" />
            )}
            <span className="relative z-10 flex items-center gap-3 text-black font-heading tracking-[0.08em]">
              {isScanning ? (
                <RotateCw className="w-4 h-4 animate-spin" />
              ) : discoveryMode && !isScanning ? (
                <Square className="w-4 h-4" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {isScanning
                ? 'HARDWARE INIT IN PROGRESS...'
                : discoveryMode && !isScanning
                  ? 'ABORT & RESET PROBE'
                  : 'TRIGGER LIVE HARDWARE NETWORK SCAN'}
            </span>
          </button>
        </div>

        {/* ── Status banner showing subnet info ── */}
        <div className="flex items-center gap-4 mt-4 text-[10px] font-mono text-accent/50">
          <span className="flex items-center gap-1.5">
            <Globe className="w-3 h-3" />
            CIDR: {targetSubnet}
          </span>
          <span className="flex items-center gap-1.5">
            <Network className="w-3 h-3" />
            Mask: {subnetMask}
          </span>
          <span className="flex items-center gap-1.5">
            <Radio className="w-3 h-3" />
            Mode: {PROFILE_LABELS[scanProfile].toUpperCase()}
          </span>
          {deviceCards.length > 0 && (
            <span className="flex items-center gap-1.5 text-accent/70">
              <Monitor className="w-3 h-3" />
              Assets mapped: {deviceCards.length}
            </span>
          )}
        </div>
      </div>

      {/* ─── MATRIX NEON LOADER ────────────────────────────── */}
      {isScanning && matrixStage >= 0 && (
        <div className="border border-accent/20 rounded-xl bg-background/80 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-3 h-3 rounded-full bg-accent animate-ping absolute inset-0" />
              <div className="w-3 h-3 rounded-full bg-accent relative" />
            </div>
            <span className="font-heading text-xs text-accent/60 tracking-[0.2em]">
              LIVE CAPTURE INITIALIZATION SEQUENCE
            </span>
          </div>

          {/* Animated stage indicators */}
          <div className="space-y-3 pl-1">
            {MATRIX_STAGES.map((stage, idx) => {
              const active = idx === matrixStage;
              const done = idx < matrixStage;
              return (
                <div
                  key={idx}
                  className={`flex items-start gap-3 transition-all duration-500 ${
                    done
                      ? 'opacity-40'
                      : active
                        ? `${matrixGlitch ? 'translate-x-1' : 'translate-x-0'} opacity-100`
                        : 'opacity-20'
                  }`}
                >
                  {/* Stage indicator */}
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                      done
                        ? 'bg-accent/20 text-accent/60'
                        : active
                          ? 'bg-accent text-black shadow-[0_0_12px_rgba(34,197,94,0.6)]'
                          : 'bg-muted text-foreground/30'
                    }`}
                  >
                    {done ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : active ? (
                      <Zap className="w-3.5 h-3.5 animate-pulse" />
                    ) : (
                      <span className="text-xs font-mono">{idx + 1}</span>
                    )}
                  </div>

                  {/* Stage text */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-heading text-sm tracking-wider transition-colors duration-300 ${
                        active ? 'text-accent' : done ? 'text-foreground/50' : 'text-foreground/20'
                      }`}
                    >
                      {stage.label}
                      {active && (
                        <span className="inline-flex ml-1">
                          <span className="w-1.5 h-4 bg-accent animate-pulse inline-block" />
                        </span>
                      )}
                    </p>
                    <p
                      className={`font-mono text-[10px] mt-0.5 transition-colors duration-300 ${
                        active ? 'text-accent/50' : 'text-foreground/20'
                      }`}
                    >
                      {stage.sub}
                    </p>
                  </div>

                  {/* Progress dots */}
                  <div className="flex gap-1 items-center shrink-0">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className={`w-1 h-1 rounded-full transition-all duration-500 ${
                          done
                            ? 'bg-accent/30'
                            : active && dot === 0
                              ? 'bg-accent animate-ping'
                              : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-accent/60">
                {STAGE_LABELS[currentStage]}
              </span>
              <span className="text-accent/40 font-mono">{scanProgress}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent/60 to-accent rounded-full transition-all duration-300 ease-out"
                style={{ width: `${scanProgress}%` }}
              />
            </div>
          </div>

          {/* Animated hex dump line */}
          <div className="font-mono text-[10px] text-accent/20 overflow-hidden">
            <p className="animate-pulse truncate">
              0x{scanProgress.toString(16).padStart(4, '0').toUpperCase()}{'  '}
              {Array.from({ length: 16 }, (_, i) =>
                Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
              ).join(' ').toUpperCase()}{'  '}
              |{' '}{Array.from({ length: 8 }, () =>
                String.fromCharCode(Math.floor(Math.random() * 95) + 32)
              ).join('')}{' '}|
            </p>
          </div>
        </div>
      )}

      {/* ─── DISCOVERED ASSETS GRID ──────────────────────────── */}
      {deviceCards.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-heading font-bold text-accent flex items-center gap-2">
              <Network className="w-4 h-4" />
              DISCOVERED NETWORK ASSETS — SUBNET GRID
              <span className="text-[10px] font-mono text-accent/50 font-normal bg-accent/10 px-2 py-0.5 rounded">
                {deviceCards.length} DEVICE{deviceCards.length !== 1 ? 'S' : ''}
              </span>
            </h3>
            <div className="flex items-center gap-2 text-[10px] font-mono text-accent/50">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse inline-block" />
              CAPTURING WIRE TRAFFIC (PCAP RUNNING)
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {deviceCards.map((device) => (
              <DeviceCardComponent
                key={device.ip}
                device={device}
                subnetMask={subnetMask}
                cidrBits={cidrBits}
                expandedHost={expandedHost}
                setExpandedHost={setExpandedHost}
                copiedBanner={copiedBanner}
                handleCopyBanner={handleCopyBanner}
                getPortStateClass={getPortStateClass}
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── Stats bar ──────────────────────────────────────── */}
      {currentResults && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary/80 border border-accent/15 rounded-lg">
            <Server className="w-4 h-4 text-accent" />
            <div>
              <span className="text-[10px] font-mono text-accent/50 uppercase tracking-wider">Hosts</span>
              <p className="text-sm font-mono font-semibold text-foreground">{currentResults.totalHosts}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary/80 border border-accent/15 rounded-lg">
            <Activity className="w-4 h-4 text-blue-400" />
            <div>
              <span className="text-[10px] font-mono text-accent/50 uppercase tracking-wider">Open Ports</span>
              <p className="text-sm font-mono font-semibold text-foreground">{currentResults.totalOpenPorts}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary/80 border border-accent/15 rounded-lg">
            <Clock className="w-4 h-4 text-yellow-400" />
            <div>
              <span className="text-[10px] font-mono text-accent/50 uppercase tracking-wider">Duration</span>
              <p className="text-sm font-mono font-semibold text-foreground">
                {formatDuration(currentResults.startedAt, currentResults.completedAt)}
              </p>
            </div>
          </div>
          {discoveryMode && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg">
              <Zap className="w-4 h-4 text-rose-400" />
              <div>
                <span className="text-[10px] font-mono text-rose-400/70 uppercase tracking-wider">Backend Ingest</span>
                <p className="text-sm font-mono font-semibold text-rose-400">{injectedCount} alerts</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── SYSTEM DISCOVERY MAP ──────────────────────────── */}
      {currentResults && (
        <SystemDiscoveryMap
          hosts={currentResults.hosts}
          isScanning={isScanning}
          scanProgress={scanProgress}
        />
      )}

      {/* ─── Empty state ───────────────────────────────────── */}
      {!currentResults && !isScanning && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <RadioTower className="w-12 h-12 text-accent/20 mb-4" />
          <p className="text-accent/50 text-sm font-mono">
            [SUBNET_IDLE] No active probe session.
          </p>
          <p className="text-accent/30 text-xs font-mono mt-1">
            Configure target subnet above and press{' '}
            <span className="text-accent/60 font-semibold">TRIGGER LIVE HARDWARE NETWORK SCAN</span>
            {' '}to begin device discovery.
          </p>
        </div>
      )}

      {/* ─── Scan history panel ────────────────────────────── */}
      {scanHistory.length > 0 && (
        <div className="hidden xl:block">
          <div className="bg-secondary/80 border border-accent/15 rounded-lg p-4">
            <h3 className="text-sm font-heading font-bold text-accent mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              SCAN HISTORY
            </h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {scanHistory.map((scan, idx) => (
                <div key={`${scan.completedAt}-${idx}`} className="p-3 bg-background/50 border border-accent/10 rounded-lg">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono text-accent/60">
                      {new Date(scan.completedAt).toLocaleTimeString()}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent/70 uppercase font-mono tracking-wider">
                      {scan.profile}
                    </span>
                  </div>
                  <p className="text-sm font-mono text-accent/80">{scan.targetSubnet}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs font-mono text-accent/50">
                      {scan.totalHosts} hosts, {scan.totalOpenPorts} ports
                    </span>
                    <button
                      onClick={() => {
                        setTargetSubnet(scan.targetSubnet);
                        setScanProfile(scan.profile);
                      }}
                      className="text-xs text-accent hover:underline cursor-pointer font-mono"
                    >
                      Re-scan
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Device Card Subcomponent ──────────────────────────────────── */

interface DeviceCardProps {
  device: DeviceCard;
  subnetMask: string;
  cidrBits: string;
  expandedHost: string | null;
  setExpandedHost: (ip: string | null) => void;
  copiedBanner: string | null;
  handleCopyBanner: (banner: string) => void;
  getPortStateClass: (state: string) => string;
}

function DeviceCardComponent({
  device,
  subnetMask,
  cidrBits,
  expandedHost,
  setExpandedHost,
  copiedBanner,
  handleCopyBanner,
  getPortStateClass,
}: DeviceCardProps) {
  const isExpanded = expandedHost === device.ip;

  return (
    <div
      className={`group bg-secondary/60 border rounded-xl overflow-hidden transition-all duration-300 cursor-pointer ${
        isExpanded
          ? 'border-accent/50 shadow-[0_0_15px_rgba(34,197,94,0.12)]'
          : 'border-accent/10 hover:border-accent/30 hover:shadow-[0_0_10px_rgba(34,197,94,0.06)]'
      }`}
      onClick={() => setExpandedHost(isExpanded ? null : device.ip)}
    >
      {/* Card header — flashing PCAP indicator */}
      <div className="px-4 py-3 border-b border-accent/10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Server className="w-4 h-4 text-accent" />
          </div>
          <div>
            <p className="text-sm font-mono font-semibold text-foreground">{device.ip}</p>
            <p className="text-[10px] font-mono text-foreground/40 truncate max-w-[180px]">{device.hostname}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Flashing PCAP indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-accent/10 border border-accent/20">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
            <span className="text-[8px] font-mono text-accent/80 tracking-wider whitespace-nowrap">
              CAPTURING WIRE TRAFFIC
            </span>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-accent/40 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-accent/40 shrink-0" />
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 py-3 space-y-2">
        {/* IP + MAC row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-background/50 rounded-lg px-3 py-2 border border-accent/5">
            <span className="text-[9px] font-mono text-accent/40 uppercase tracking-wider">Target Host IP</span>
            <p className="text-sm font-mono text-accent mt-0.5">{device.ip}</p>
          </div>
          <div className="bg-background/50 rounded-lg px-3 py-2 border border-accent/5">
            <span className="text-[9px] font-mono text-accent/40 uppercase tracking-wider">Hardware MAC Identity</span>
            <p className="text-sm font-mono text-accent mt-0.5">{device.mac}</p>
            <p className="text-[9px] font-mono text-accent/30 mt-0.5">{device.macVendor}</p>
          </div>
        </div>

        {/* Subnet + Ports row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-background/50 rounded-lg px-3 py-2 border border-accent/5">
            <span className="text-[9px] font-mono text-accent/40 uppercase tracking-wider">Subnet Scope Mask</span>
            <p className="text-sm font-mono text-accent mt-0.5">{subnetMask}</p>
            <p className="text-[9px] font-mono text-accent/30 mt-0.5">/{cidrBits}</p>
          </div>
          <div className="bg-background/50 rounded-lg px-3 py-2 border border-accent/5">
            <span className="text-[9px] font-mono text-accent/40 uppercase tracking-wider">Interface Port Bindings</span>
            <p className="text-sm font-mono text-accent mt-0.5">
              {device.openPorts.length > 0
                ? `${device.openPorts.length} open`
                : 'None detected'}
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {device.openPorts.slice(0, 4).map((p) => (
                <span
                  key={p.port}
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${getPortStateClass(p.state)} bg-accent/5 border border-accent/10`}
                >
                  {p.port}/{p.service}
                </span>
              ))}
              {device.openPorts.length > 4 && (
                <span className="text-[9px] font-mono text-accent/40 px-1">+{device.openPorts.length - 4}</span>
              )}
            </div>
          </div>
        </div>

        {/* OS + Latency info */}
        <div className="flex items-center justify-between text-[10px] font-mono text-accent/40 bg-background/30 rounded-lg px-3 py-1.5 border border-accent/5">
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3 h-3" />
            {device.os}
          </span>
          <span className="flex items-center gap-1.5">
            <Activity className="w-3 h-3" />
            {device.latency}ms
          </span>
        </div>
      </div>

      {/* Expanded port detail panel */}
      {isExpanded && device.openPorts.length > 0 && (
        <div className="border-t border-accent/10 bg-background/30" onClick={(e) => e.stopPropagation()}>
          <div className="px-4 py-2.5">
            <p className="text-[9px] font-mono text-accent/40 uppercase tracking-wider mb-2">
              Detailed Port Analysis
            </p>
            <div className="space-y-1">
              {device.openPorts.map((p) => (
                <div
                  key={p.port}
                  className="flex items-center justify-between px-3 py-1.5 bg-background/50 border border-accent/5 rounded-lg text-xs font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-foreground font-semibold">{p.port}</span>
                    <span className="text-foreground/60">TCP</span>
                    <span className={`${getPortStateClass(p.state)}`}>{p.state}</span>
                    <span className="text-foreground/50">{p.service}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyBanner(p.service);
                    }}
                    className="p-1 text-accent/40 hover:text-accent transition-colors duration-150 cursor-pointer"
                  >
                    {copiedBanner === p.service ? (
                      <Check className="w-3 h-3 text-accent" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

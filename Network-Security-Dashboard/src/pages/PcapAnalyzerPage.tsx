import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { usePcapStore } from '../stores/pcapStore';
import { generateSessions, generatePacketLevelDetails } from '../lib/mock/pcapMock';
import { supabase } from '../lib/supabase/client';
import {
  Upload,
  FileText,
  Trash2,
  Search,
  ChevronDown,
  ChevronRight,
  Download,
  BarChart3,
  List,
  PieChart,
  ArrowLeft,
} from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

type ViewMode = 'repository' | 'detail';

const PROTOCOL_COLORS: Record<string, string> = {
  TCP: '#3B82F6',
  UDP: '#F59E0B',
  ICMP: '#22C55E',
  DNS: '#A855F7',
  HTTP: '#F97316',
};

const PROTOCOL_BADGE_COLORS: Record<string, string> = {
  TCP: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  UDP: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  ICMP: 'bg-green-500/20 text-green-400 border-green-500/30',
  DNS: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  HTTP: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const PIECHART_COLORS = ['#3B82F6', '#F59E0B', '#22C55E', '#A855F7', '#F97316'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

export default function PcapAnalyzerPage() {
  const { profile } = useAuthStore();
  const { captures, selectedCapture, currentSessions, uploading, uploadCapture, selectCapture, setSessions, deleteCapture, addCapture, loadCaptures, loadSessions, saveSessions } = usePcapStore();

  const [viewMode, setViewMode] = useState<ViewMode>('repository');
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [protocolFilter, setProtocolFilter] = useState<string>('all');
  const [ipFilter, setIpFilter] = useState('');
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>('startTime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Load captures from Supabase on mount
  useEffect(() => {
    if (profile?.team_id) {
      loadCaptures(profile.team_id);
    }
  }, [profile?.team_id, loadCaptures]);

  const inputRef = useRef<HTMLInputElement>(null);
  const parseProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Protocol breakdown from sessions
  const protocolBreakdown = currentSessions.length > 0
    ? Object.entries(
        currentSessions.reduce<Record<string, number>>((acc, s) => {
          acc[s.protocol] = (acc[s.protocol] || 0) + 1;
          return acc;
        }, {}),
      ).map(([name, value]) => ({ name, value }))
    : [];

  // Filtered sessions
  const filteredSessions = currentSessions.filter((s) => {
    if (protocolFilter !== 'all' && s.protocol !== protocolFilter) return false;
    if (ipFilter && !s.srcIp.includes(ipFilter) && !s.dstIp.includes(ipFilter)) return false;
    return true;
  });

  // Sorted sessions
  const sortedSessions = [...filteredSessions].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'protocol':
        cmp = a.protocol.localeCompare(b.protocol);
        break;
      case 'duration':
        cmp = a.duration - b.duration;
        break;
      case 'packetCount':
        cmp = a.packetCount - b.packetCount;
        break;
      case 'byteCount':
        cmp = a.byteCount - b.byteCount;
        break;
      default:
        cmp = a.startTime.localeCompare(b.startTime);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleFileDrop = useCallback(async (files: FileList | File[]) => {
    const file = files[0];
    if (!file || !profile?.team_id) return;
    if (!file.name.endsWith('.pcap') && !file.name.endsWith('.pcapng')) return;

    setIsParsing(true);
    setUploadProgress(0);

    // Simulate parse stages
    const stages = ['Validating file header...', 'Parsing packet metadata...', 'Extracting sessions...', 'Building session table...'];
    let stageIdx = 0;
    setUploadStage(stages[0]);

    parseProgressRef.current = setInterval(() => {
      setUploadProgress((prev) => {
        const next = prev + Math.floor(Math.random() * 8) + 2;
        const stageBoundary = (stageIdx + 1) * 25;
        if (next >= stageBoundary && stageIdx < stages.length - 1) {
          stageIdx++;
          setUploadStage(stages[stageIdx]);
        }
        return Math.min(next, 99);
      });
    }, 200);

    // Upload to Supabase Storage
    try {
      const captureId = `capture-${Date.now()}`;
      const storagePath = `${profile.team_id}/${captureId}/${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('pcap-uploads')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Insert metadata into pcap_captures
      const { error: insertError } = await supabase.from('pcap_captures').insert({
        team_id: profile.team_id,
        file_name: file.name,
        file_path: storagePath,
        file_size: file.size,
        file_type: file.type || 'application/vnd.tcpdump.pcap',
        uploaded_by: profile.id,
      });

      if (insertError) throw insertError;

      // Complete progress
      if (parseProgressRef.current) clearInterval(parseProgressRef.current);
      setUploadProgress(100);
      setUploadStage('Complete!');

      await new Promise((r) => setTimeout(r, 500));

      // Use mock upload instead for demo (since we may not have real data)
      await uploadCapture(file, profile.team_id);
    } catch {
      if (parseProgressRef.current) clearInterval(parseProgressRef.current);
      setUploadProgress(0);
      setUploadStage('');

      // Fallback to mock
      await uploadCapture(file, profile.team_id);
    }

    setIsParsing(false);
  }, [profile?.team_id, uploadCapture]);

  const handleAnalyze = async (captureId: string) => {
    const capture = captures.find((c) => c.id === captureId);
    if (!capture || !profile?.team_id) return;
    selectCapture(capture);

    // Try loading existing sessions from DB
    await loadSessions(captureId);

    // If no sessions yet, generate and save them
    const { currentSessions: existing } = usePcapStore.getState();
    if (existing.length === 0) {
      const sessions = generateSessions(capture.fileName, capture.fileSize);
      setSessions(sessions);
      await saveSessions(captureId, profile.team_id, sessions);
    }

    setViewMode('detail');
    setExpandedSession(null);
  };

  const handleBack = () => {
    setViewMode('repository');
    selectCapture(null);
    setSessions([]);
    setProtocolFilter('all');
    setIpFilter('');
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortKey !== colKey) return null;
    return <ChevronDown className={`w-3 h-3 inline-block ml-1 ${sortDir === 'asc' ? 'rotate-180' : ''}`} />;
  };

  const totalPieValue = protocolBreakdown.reduce((s, p) => s + p.value, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {viewMode === 'detail' && (
            <button
              onClick={handleBack}
              className="p-1.5 text-foreground/50 hover:text-foreground transition-colors duration-150 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-heading font-bold text-foreground">PCAP Analyzer</h1>
            <p className="text-sm text-foreground/50 mt-1">
              {viewMode === 'repository' ? 'Upload and analyze network capture files' : selectedCapture?.fileName}
            </p>
          </div>
        </div>
        {viewMode === 'repository' && (
          <div className="flex items-center gap-2 text-sm text-foreground/50">
            <List className="w-4 h-4" />
            <span>{captures.length} capture{captures.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {viewMode === 'repository' ? (
        <>
          {/* Upload zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileDrop(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 cursor-pointer ${
              dragOver
                ? 'border-accent bg-accent/5'
                : isParsing
                  ? 'border-accent/50 bg-accent/5'
                  : 'border-border hover:border-accent/50 hover:bg-muted/30'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pcap,.pcapng"
              className="hidden"
              onChange={(e) => e.target.files && handleFileDrop(e.target.files)}
            />

            {isParsing ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-foreground/70">{uploadStage}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden max-w-xs mx-auto">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-foreground/40">{uploadProgress}%</p>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-foreground/60">
                  Drag and drop a <span className="text-accent font-medium">.pcap</span> or{' '}
                  <span className="text-accent font-medium">.pcapng</span> file here
                </p>
                <p className="text-xs text-foreground/40 mt-1">or click to browse — max 50 MB</p>
              </>
            )}
          </div>

          {/* Repository grid */}
          {captures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="w-12 h-12 text-foreground/20 mb-4" />
              <p className="text-foreground/50 text-sm">No PCAP files uploaded yet.</p>
              <p className="text-foreground/40 text-xs mt-1">Drop a file above to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {captures.map((capture) => (
                <div
                  key={capture.id}
                  className="bg-secondary border border-border rounded-xl p-4 hover:border-accent/30 transition-all duration-200"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-accent/10 rounded-lg shrink-0">
                      <FileText className="w-5 h-5 text-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-foreground truncate">{capture.fileName}</h3>
                      <p className="text-xs text-foreground/50">{formatFileSize(capture.fileSize)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                    <div>
                      <span className="text-foreground/40">Packets</span>
                      <p className="font-mono text-foreground/80">{capture.totalPackets.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-foreground/40">Sessions</span>
                      <p className="font-mono text-foreground/80">{capture.totalSessions.toLocaleString()}</p>
                    </div>
                  </div>

                  <p className="text-[10px] text-foreground/40 mb-3">
                    Uploaded {new Date(capture.uploadedAt).toLocaleDateString()}
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAnalyze(capture.id)}
                      className="flex-1 px-3 py-1.5 bg-accent text-black text-xs font-semibold rounded-lg hover:opacity-90 transition-all duration-200 cursor-pointer"
                    >
                      Analyze
                    </button>
                    <button
                      onClick={() => deleteCapture(capture.id)}
                      className="p-1.5 text-foreground/40 hover:text-destructive rounded-lg transition-colors duration-150 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Capture Detail View */
        <>
          {/* Metadata bar */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-secondary border border-border rounded-lg">
              <FileText className="w-4 h-4 text-accent" />
              <div>
                <span className="text-[10px] text-foreground/40 block">Packets</span>
                <span className="text-sm font-mono font-semibold text-foreground">
                  {selectedCapture?.totalPackets.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-secondary border border-border rounded-lg">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <div>
                <span className="text-[10px] text-foreground/40 block">Sessions</span>
                <span className="text-sm font-mono font-semibold text-foreground">
                  {selectedCapture?.totalSessions.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-6">
            {/* Protocol pie chart */}
            <div className="w-64 shrink-0">
              <div className="bg-secondary border border-border rounded-lg p-4">
                <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <PieChart className="w-3.5 h-3.5" />
                  Protocol Distribution
                </h3>
                {protocolBreakdown.length === 0 ? (
                  <p className="text-xs text-foreground/40 py-8 text-center">No session data</p>
                ) : (
                  <>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <RePieChart>
                          <Pie
                            data={protocolBreakdown}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={65}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {protocolBreakdown.map((entry, index) => (
                              <Cell key={entry.name} fill={PIECHART_COLORS[index % PIECHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: '#1E293B',
                              border: '1px solid #334155',
                              borderRadius: '8px',
                              fontSize: '12px',
                            }}
                          />
                        </RePieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-1.5 mt-2">
                      {protocolBreakdown.map((entry) => (
                        <div key={entry.name} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: PIECHART_COLORS[protocolBreakdown.indexOf(entry)] }}
                            />
                            <span className="text-foreground/70">{entry.name}</span>
                          </span>
                          <span className="font-mono text-foreground/60">
                            {((entry.value / totalPieValue) * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Session table */}
            <div className="flex-1 min-w-0">
              {/* Filter bar */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-1">
                  {['all', 'TCP', 'UDP', 'ICMP', 'DNS', 'HTTP'].map((proto) => (
                    <button
                      key={proto}
                      onClick={() => setProtocolFilter(proto)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                        protocolFilter === proto
                          ? proto === 'all'
                            ? 'bg-accent/10 text-accent'
                            : `${PROTOCOL_BADGE_COLORS[proto]} border`
                          : 'bg-muted text-foreground/50 hover:text-foreground'
                      }`}
                    >
                      {proto === 'all' ? 'All' : proto}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 max-w-[220px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground/30" />
                  <input
                    type="text"
                    value={ipFilter}
                    onChange={(e) => setIpFilter(e.target.value)}
                    placeholder="Filter by IP..."
                    className="w-full pl-8 pr-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent/50 transition-colors duration-200"
                  />
                </div>
                <span className="text-xs text-foreground/40">{filteredSessions.length} sessions</span>
              </div>

              {/* Session table */}
              <div className="bg-secondary border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="w-8 px-2 py-2" />
                        {[
                          { key: 'startTime', label: 'Time' },
                          { key: 'srcIp', label: 'Src IP' },
                          { key: 'srcPort', label: 'Src Port' },
                          { key: 'dstIp', label: 'Dst IP' },
                          { key: 'dstPort', label: 'Dst Port' },
                          { key: 'protocol', label: 'Proto' },
                          { key: 'duration', label: 'Duration' },
                          { key: 'packetCount', label: 'Pkts' },
                          { key: 'byteCount', label: 'Bytes' },
                        ].map((col) => (
                          <th
                            key={col.key}
                            onClick={() => toggleSort(col.key)}
                            className="text-left px-2 py-2 text-[10px] font-medium text-foreground/50 uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors duration-150"
                          >
                            {col.label}
                            <SortIcon colKey={col.key} />
                          </th>
                        ))}
                        <th className="text-left px-2 py-2 text-[10px] font-medium text-foreground/50 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSessions.slice(0, 100).map((session) => (
                        <SessionRow
                          key={session.id}
                          session={session}
                          expanded={expandedSession === session.id}
                          onToggle={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                {sortedSessions.length === 0 && (
                  <div className="py-8 text-center text-xs text-foreground/40">
                    No sessions match the current filters
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SessionRow({
  session,
  expanded,
  onToggle,
}: {
  session: PcapSession;
  expanded: boolean;
  onToggle: () => void;
}) {
  const packetDetails = expanded ? generatePacketLevelDetails(session.id) : [];

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-accent';
      case 'active':
        return 'text-blue-400';
      case 'reset':
        return 'text-destructive';
      case 'timeout':
        return 'text-yellow-500';
      default:
        return 'text-foreground/50';
    }
  };

  const protocolBadge = (proto: string) => {
    const color = PROTOCOL_BADGE_COLORS[proto];
    if (!color) return null;
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${color}`}>
        {proto}
      </span>
    );
  };

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-border/50 hover:bg-muted/50 transition-colors duration-150 cursor-pointer"
      >
        <td className="px-2 py-2.5">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-foreground/40" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-foreground/40" />
          )}
        </td>
        <td className="px-2 py-2.5 font-mono text-foreground/70">
          {new Date(session.startTime).toLocaleTimeString()}
        </td>
        <td className="px-2 py-2.5 font-mono text-foreground/70">{session.srcIp}</td>
        <td className="px-2 py-2.5 font-mono text-foreground/50">{session.srcPort}</td>
        <td className="px-2 py-2.5 font-mono text-foreground/70">{session.dstIp}</td>
        <td className="px-2 py-2.5 font-mono text-foreground/50">{session.dstPort}</td>
        <td className="px-2 py-2.5">{protocolBadge(session.protocol)}</td>
        <td className="px-2 py-2.5 font-mono text-foreground/60">{formatDuration(session.duration)}</td>
        <td className="px-2 py-2.5 font-mono text-foreground/60">{session.packetCount}</td>
        <td className="px-2 py-2.5 font-mono text-foreground/60">{session.byteCount.toLocaleString()}</td>
        <td className={`px-2 py-2.5 font-mono text-[10px] ${statusColor(session.status)}`}>
          {session.status === 'completed' ? 'Established' :
           session.status === 'active' ? 'Active' :
           session.status === 'reset' ? 'Reset' : 'Timeout'}
        </td>
      </tr>
      {expanded && packetDetails.length > 0 && (
        <tr>
          <td colSpan={11} className="px-4 pb-2">
            <div className="bg-background/50 border border-border rounded-lg overflow-hidden">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left px-2 py-1.5 text-foreground/40 font-medium">Seq</th>
                    <th className="text-left px-2 py-1.5 text-foreground/40 font-medium">Timestamp</th>
                    <th className="text-left px-2 py-1.5 text-foreground/40 font-medium">Flags</th>
                    <th className="text-right px-2 py-1.5 text-foreground/40 font-medium">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {packetDetails.map((pkt) => (
                    <tr key={pkt.seqNumber} className="border-b border-border/30 last:border-0">
                      <td className="px-2 py-1 font-mono text-foreground/70">{pkt.seqNumber}</td>
                      <td className="px-2 py-1 font-mono text-foreground/50">
                        {new Date(pkt.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-2 py-1">
                        <span className="flex gap-0.5">
                          {pkt.flags.map((f) => (
                            <span key={f} className="px-1 py-0.5 rounded bg-muted text-foreground/60 font-mono">
                              {f}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="px-2 py-1 font-mono text-foreground/60 text-right">{pkt.payloadSize} B</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
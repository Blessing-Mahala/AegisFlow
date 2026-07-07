import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import type { PcapSession } from '../lib/mock/pcapMock';

interface PcapCapture {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  totalPackets: number;
  totalSessions: number;
  startTime: string | null;
  endTime: string | null;
  uploadedAt: string;
  teamId: string;
}

interface PcapState {
  captures: PcapCapture[];
  selectedCapture: PcapCapture | null;
  currentSessions: PcapSession[];
  uploading: boolean;

  addCapture: (capture: PcapCapture) => void;
  uploadCapture: (file: File, teamId: string) => Promise<void>;
  selectCapture: (capture: PcapCapture | null) => void;
  setSessions: (sessions: PcapSession[]) => void;
  deleteCapture: (id: string) => void;
  setUploading: (uploading: boolean) => void;
  loadCaptures: (teamId: string) => Promise<void>;
  loadSessions: (captureId: string) => Promise<void>;
  saveSessions: (captureId: string, teamId: string, sessions: PcapSession[]) => Promise<void>;
}

function mapDbCapture(row: any): PcapCapture {
  return {
    id: row.id,
    fileName: row.file_name,
    fileSize: row.file_size ?? 0,
    fileType: row.file_type ?? 'application/vnd.tcpdump.pcap',
    totalPackets: row.total_packets ?? 0,
    totalSessions: row.total_sessions ?? 0,
    startTime: row.start_time,
    endTime: row.end_time,
    uploadedAt: row.created_at,
    teamId: row.team_id,
  };
}

export const usePcapStore = create<PcapState>((set, get) => ({
  captures: [],
  selectedCapture: null,
  currentSessions: [],
  uploading: false,

  addCapture: (capture) =>
    set((state) => ({
      captures: [capture, ...state.captures],
    })),

  loadCaptures: async (teamId) => {
    const { data, error } = await supabase
      .from('pcap_captures')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load captures:', error);
      return;
    }

    set({ captures: (data ?? []).map(mapDbCapture) });
  },

  loadSessions: async (captureId) => {
    const { data, error } = await supabase
      .from('pcap_sessions')
      .select('*')
      .eq('capture_id', captureId)
      .order('start_time', { ascending: false });

    if (error) {
      console.error('Failed to load sessions:', error);
      return;
    }

    const sessions: PcapSession[] = (data ?? []).map((row: any) => ({
      id: row.id,
      srcIp: String(row.src_ip),
      dstIp: String(row.dst_ip),
      srcPort: row.src_port,
      dstPort: row.dst_port,
      protocol: row.protocol,
      duration: row.duration_ms,
      packetCount: row.packet_count,
      byteCount: row.byte_count,
      status: row.status,
      startTime: row.start_time,
    }));

    set({ currentSessions: sessions });
  },

  saveSessions: async (captureId, teamId, sessions) => {
    const { error } = await supabase.from('pcap_sessions').insert(
      sessions.map((s) => ({
        capture_id: captureId,
        team_id: teamId,
        src_ip: s.srcIp,
        dst_ip: s.dstIp,
        src_port: s.srcPort,
        dst_port: s.dstPort,
        protocol: s.protocol,
        duration_ms: s.duration,
        packet_count: s.packetCount,
        byte_count: s.byteCount,
        status: s.status,
        start_time: s.startTime,
      }))
    );

    if (error) {
      console.error('Failed to save sessions:', error);
    }
  },

  uploadCapture: async (file, teamId) => {
    set({ uploading: true });

    // Simulate upload delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const capture: PcapCapture = {
      id: `capture-${Date.now()}`,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/vnd.tcpdump.pcap',
      totalPackets: Math.floor(Math.random() * 10000) + 500,
      totalSessions: Math.floor(Math.random() * 150) + 20,
      startTime: null,
      endTime: null,
      uploadedAt: new Date().toISOString(),
      teamId,
    };

    set((state) => ({
      captures: [capture, ...state.captures],
      uploading: false,
      selectedCapture: capture,
    }));
  },

  selectCapture: (capture) =>
    set({
      selectedCapture: capture,
      currentSessions: capture ? [] : [],
    }),

  setSessions: (sessions) =>
    set({ currentSessions: sessions }),

  deleteCapture: async (id) => {
    const { error } = await supabase.from('pcap_captures').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete capture:', error);
    }
    set((state) => ({
      captures: state.captures.filter((c) => c.id !== id),
      selectedCapture:
        state.selectedCapture?.id === id ? null : state.selectedCapture,
      currentSessions:
        state.selectedCapture?.id === id ? [] : state.currentSessions,
    }));
  },

  setUploading: (uploading) => set({ uploading }),
}));

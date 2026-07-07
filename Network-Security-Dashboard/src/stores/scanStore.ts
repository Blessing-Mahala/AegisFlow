import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import type { ScanResult } from '../lib/mock/scannerMock';

export type ScanStatus = 'idle' | 'scanning' | 'complete';

interface ScanState {
  currentResults: ScanResult | null;
  scanHistory: ScanResult[];
  scanStatus: ScanStatus;
  scanProgress: number; // 0–100

  startScan: () => void;
  setResults: (results: ScanResult) => void;
  addToHistory: (result: ScanResult) => void;
  setProgress: (progress: number) => void;
  resetScan: () => void;
  loadHistory: (teamId: string) => Promise<void>;
  saveScanResult: (teamId: string, result: ScanResult) => Promise<string | null>;
}

function mapDbScanResult(row: any): ScanResult | null {
  if (!row?.results) return null;
  try {
    const results = typeof row.results === 'string' ? JSON.parse(row.results) : row.results;
    return {
      targetSubnet: results.targetSubnet ?? row.target_subnet,
      profile: results.profile ?? row.profile,
      startedAt: results.startedAt ?? row.started_at,
      completedAt: results.completedAt ?? row.completed_at,
      hosts: results.hosts ?? [],
      totalHosts: results.totalHosts ?? row.total_hosts,
      totalOpenPorts: results.totalOpenPorts ?? row.total_open_ports,
    } as ScanResult;
  } catch {
    return null;
  }
}

export const useScanStore = create<ScanState>((set) => ({
  currentResults: null,
  scanHistory: [],
  scanStatus: 'idle',
  scanProgress: 0,

  startScan: () =>
    set({
      scanStatus: 'scanning',
      scanProgress: 0,
      currentResults: null,
    }),

  setResults: (results) =>
    set({
      currentResults: results,
      scanStatus: 'complete',
      scanProgress: 100,
    }),

  addToHistory: (result) =>
    set((state) => ({
      scanHistory: [result, ...state.scanHistory].slice(0, 25),
    })),

  setProgress: (progress) =>
    set({ scanProgress: Math.min(progress, 99) }),

  resetScan: () =>
    set({
      currentResults: null,
      scanStatus: 'idle',
      scanProgress: 0,
    }),

  loadHistory: async (teamId) => {
    const { data, error } = await supabase
      .from('scan_results')
      .select('*')
      .eq('team_id', teamId)
      .eq('status', 'complete')
      .order('completed_at', { ascending: false })
      .limit(25);

    if (error) {
      console.error('Failed to load scan history:', error);
      return;
    }

    const history: ScanResult[] = [];
    for (const row of data ?? []) {
      const result = mapDbScanResult(row);
      if (result) history.push(result);
    }

    set({ scanHistory: history });
  },

  saveScanResult: async (teamId, result) => {
    const { data, error } = await supabase
      .from('scan_results')
      .insert({
        team_id: teamId,
        target_subnet: result.targetSubnet,
        profile: result.profile,
        status: 'complete',
        results: JSON.stringify(result),
        total_hosts: result.totalHosts,
        total_open_ports: result.totalOpenPorts,
        started_at: result.startedAt,
        completed_at: result.completedAt,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to save scan result:', error);
      return null;
    }

    return data?.id ?? null;
  },
}));

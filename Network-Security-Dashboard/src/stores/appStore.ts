import { create } from 'zustand';
import type { Tables } from '../lib/database.types';

type Packet = Tables<'packets'>;
type Sensor = Tables<'sensors'>;

export type KnowledgeLevel = 'undergraduate' | 'graduate' | 'professional' | 'phd';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AppState {
  selectedSensorId: string | null;
  selectedPacket: Packet | null;
  packets: Packet[];
  sensors: Sensor[];
  protocolFilter: string | null;
  ipFilter: string | null;
  copilotOpen: boolean;

  // ── Chat state ──
  chatMessages: ChatMessage[];
  knowledgeLevel: KnowledgeLevel;
  isProcessing: boolean;

  setSelectedSensorId: (id: string | null) => void;
  setSelectedPacket: (packet: Packet | null) => void;
  setPackets: (packets: Packet[]) => void;
  addPacket: (packet: Packet) => void;
  setSensors: (sensors: Sensor[]) => void;
  setProtocolFilter: (protocol: string | null) => void;
  setIpFilter: (ip: string | null) => void;
  setCopilotOpen: (open: boolean) => void;
  clearCopilot: () => void;

  // ── Chat actions ──
  addChatMessage: (msg: ChatMessage) => void;
  setKnowledgeLevel: (level: KnowledgeLevel) => void;
  setIsProcessing: (processing: boolean) => void;
  clearChat: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedSensorId: null,
  selectedPacket: null,
  packets: [],
  sensors: [],
  protocolFilter: null,
  ipFilter: null,
  copilotOpen: true,

  // ── Chat state ──
  chatMessages: [],
  knowledgeLevel: 'professional',
  isProcessing: false,

  setSelectedSensorId: (id) => set({ selectedSensorId: id }),
  setSelectedPacket: (packet) => set({ selectedPacket: packet }),
  setPackets: (packets) => set({ packets }),
  addPacket: (packet) =>
    set((state) => ({
      packets: [packet, ...state.packets].slice(0, 500),
    })),
  setSensors: (sensors) => set({ sensors }),
  setProtocolFilter: (protocol) => set({ protocolFilter: protocol }),
  setIpFilter: (ip) => set({ ipFilter: ip }),
  setCopilotOpen: (open) => set({ copilotOpen: open }),
  clearCopilot: () => set({ selectedPacket: null }),

  // ── Chat actions ──
  addChatMessage: (msg) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, msg],
    })),
  setKnowledgeLevel: (level) => set({ knowledgeLevel: level }),
  setIsProcessing: (processing) => set({ isProcessing: processing }),
  clearChat: () => set({ chatMessages: [] }),
}));
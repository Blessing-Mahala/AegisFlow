import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore, type KnowledgeLevel, type ChatMessage } from '../stores/appStore';
import { useMitigationStore } from '../stores/mitigationStore';
import { useScanStore } from '../stores/scanStore';
import { usePcapStore } from '../stores/pcapStore';
import { supabase } from '../lib/supabase/client';
import {
  X,
  Bot,
  Send,
  Sparkles,
  ChevronDown,
  Trash2,
  FileText,
  Shield,
  Zap,
} from 'lucide-react';

// ─── Knowledge Level Config ──────────────────────────────────────

const LEVEL_CONFIG: Record<KnowledgeLevel, { label: string; icon: string; color: string; description: string }> = {
  undergraduate: {
    label: 'Undergraduate',
    icon: '🔰',
    color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    description: 'Simple explanations, minimal jargon',
  },
  graduate: {
    label: 'Graduate',
    icon: '📘',
    color: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    description: 'Technical but accessible',
  },
  professional: {
    label: 'Professional',
    icon: '⚡',
    color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    description: 'Industry terminology, actionable',
  },
  phd: {
    label: 'PhD',
    icon: '🔬',
    color: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
    description: 'Deep research-level analysis',
  },
};

// ─── Quick Suggestions ───────────────────────────────────────────

const SUGGESTIONS = [
  { label: 'Summarize network', query: 'Summarize my current network status' },
  { label: 'Analyze alerts', query: 'Analyze the alert patterns and tell me what to prioritize' },
  { label: 'Security report', query: 'Generate a comprehensive security report' },
  { label: 'What should I do?', query: 'What actions should I take right now based on my network state?' },
];

// ─── Generate ID ─────────────────────────────────────────────────

function genId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Typing Indicator ────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
        <Bot className="w-4 h-4 text-accent" />
      </div>
      <div className="flex items-center gap-1.5 py-2">
        <span className="w-2 h-2 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

export default function AICoPilotPanel() {
  const {
    copilotOpen,
    setCopilotOpen,
    chatMessages,
    knowledgeLevel,
    isProcessing,
    packets,
    addChatMessage,
    setKnowledgeLevel,
    setIsProcessing,
    clearChat,
  } = useAppStore();

  const { alerts, stats: mitigationStats } = useMitigationStore();
  const { scanHistory } = useScanStore();
  const { captures } = usePcapStore();

  const [input, setInput] = useState('');
  const [levelDropdownOpen, setLevelDropdownOpen] = useState(false);
  const [mode, setMode] = useState<'ai' | 'expert'>('expert');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── Build Context Snapshot ──
  const buildContext = useCallback(() => {
    const protocolSet = new Set(packets.map((p) => p.protocol));
    const talkerCounts: Record<string, number> = {};
    packets.forEach((p) => {
      const ip = String(p.src_ip);
      talkerCounts[ip] = (talkerCounts[ip] || 0) + 1;
    });
    const topTalkers = Object.entries(talkerCounts)
      .map(([ip, count]) => ({ ip, packets: count }))
      .sort((a, b) => b.packets - a.packets)
      .slice(0, 8);

    const alertBreakdown: Record<string, number> = {};
    alerts.forEach((a) => {
      alertBreakdown[a.severity] = (alertBreakdown[a.severity] || 0) + 1;
    });

    const totalBytes = packets.reduce((sum, p) => sum + (p.payload_size ?? 0), 0);

    return {
      packetsToday: packets.length,
      activeSensors: useAppStore.getState().sensors.length,
      openAlerts: mitigationStats.openCount,
      mitigatedAlerts: mitigationStats.mitigatedCount,
      totalBytes,
      uniqueProtocols: Array.from(protocolSet),
      topTalkers,
      recentScans: scanHistory.length,
      recentPcaps: captures.length,
      activeInterceptions: 0,
      criticalAlerts: alertBreakdown.critical ?? 0,
      alertBreakdown,
    };
  }, [packets, alerts, mitigationStats, scanHistory, captures]);

  // ── Send Message ──
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isProcessing) return;

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };

    addChatMessage(userMsg);
    setInput('');
    setIsProcessing(true);

    const context = buildContext();

    try {
      const { data, error } = await supabase.functions.invoke('ai-copilot', {
        body: {
          messages: [...chatMessages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          context,
          knowledgeLevel,
        },
      });

      if (error) throw new Error(error.message);

      const responseContent = data?.content;
      if (responseContent) {
        const assistantMsg: ChatMessage = {
          id: genId(),
          role: 'assistant',
          content: responseContent,
          timestamp: Date.now(),
        };
        addChatMessage(assistantMsg);
        if (data._mode === 'ai') setMode('ai');
        else setMode('expert');
      } else {
        throw new Error('Empty response');
      }
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: genId(),
        role: 'assistant',
        content: `## Error\n\nI couldn't reach the analysis engine: ${err instanceof Error ? err.message : 'Unknown error'}\n\nPlease try again or check that the Edge Function is deployed.`,
        timestamp: Date.now(),
      };
      addChatMessage(errorMsg);
    } finally {
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  }, [chatMessages, isProcessing, knowledgeLevel, addChatMessage, setIsProcessing, buildContext]);

  // ── Handle Send ──
  const handleSend = useCallback(() => {
    if (input.trim()) sendMessage(input);
  }, [input, sendMessage]);

  // ── Handle Key Down ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ── Handle Suggestion Click ──
  const handleSuggestion = useCallback((query: string) => {
    sendMessage(query);
  }, [sendMessage]);

  if (!copilotOpen) return null;

  return (
    <>
      {/* Mobile overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-30 lg:hidden"
        onClick={() => setCopilotOpen(false)}
      />

      {/* Panel */}
      <aside
        className={`w-[380px] shrink-0 bg-[#060a12] border-l border-border flex flex-col h-full z-40 lg:static lg:z-auto fixed right-0 top-0 slide-in-right`}
      >
        {/* ── Header ── */}
        <div className="shrink-0 border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-accent" />
              </div>
              <div>
                <h2 className="font-heading font-semibold text-sm text-foreground leading-tight">
                  GUARDIUM AI
                </h2>
                <p className="text-[10px] text-foreground/40 font-mono">
                  {mode === 'ai' ? 'AI-POWERED' : 'EXPERT SYSTEM'} · {LEVEL_CONFIG[knowledgeLevel].label.toUpperCase()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => clearChat()}
                className="p-1.5 text-foreground/40 hover:text-foreground rounded-lg hover:bg-muted/50 transition-all duration-150 cursor-pointer"
                title="Clear conversation"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setCopilotOpen(false)}
                className="p-1.5 text-foreground/40 hover:text-foreground rounded-lg hover:bg-muted/50 transition-all duration-150 cursor-pointer lg:hidden"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Knowledge Level Selector */}
          <div className="px-4 pb-3 relative">
            <button
              onClick={() => setLevelDropdownOpen(!levelDropdownOpen)}
              className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/50 border border-border rounded-lg text-xs font-medium text-foreground/70 hover:text-foreground hover:border-accent/30 transition-all duration-150 cursor-pointer"
            >
              <span>{LEVEL_CONFIG[knowledgeLevel].icon}</span>
              <span className="flex-1 text-left">{LEVEL_CONFIG[knowledgeLevel].label}</span>
              <span className="text-[10px] text-foreground/40">{LEVEL_CONFIG[knowledgeLevel].description}</span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${levelDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {levelDropdownOpen && (
              <div className="absolute left-4 right-4 top-full mt-1 z-50 bg-[#0e1428] border border-border rounded-lg shadow-xl overflow-hidden">
                {(Object.entries(LEVEL_CONFIG) as [KnowledgeLevel, typeof LEVEL_CONFIG[KnowledgeLevel]][]).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setKnowledgeLevel(key);
                      setLevelDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs transition-all duration-150 cursor-pointer ${
                      knowledgeLevel === key
                        ? 'bg-accent/10 text-accent border-l-2 border-accent'
                        : 'text-foreground/60 hover:text-foreground hover:bg-muted/30 border-l-2 border-transparent'
                    }`}
                  >
                    <span>{config.icon}</span>
                    <div className="flex-1 text-left">
                      <span className="font-medium">{config.label}</span>
                      <p className="text-[10px] text-foreground/40">{config.description}</p>
                    </div>
                    {knowledgeLevel === key && (
                      <Shield className="w-3 h-3 text-accent" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Messages Area ── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {chatMessages.length === 0 ? (
            /* ── Empty State ── */
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent/5 border border-accent/10 flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-accent/60" />
              </div>
              <h3 className="font-heading font-semibold text-sm text-foreground mb-2">
                GUARDIUM AI Co-Pilot
              </h3>
              <p className="text-xs text-foreground/50 leading-relaxed mb-6 max-w-[260px]">
                Your network security analyst. Ask me anything about your network traffic, alerts, sensors, or security posture.
              </p>

              {/* Quick suggestions */}
              <div className="w-full space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => handleSuggestion(s.query)}
                    disabled={isProcessing}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/30 border border-border/60 rounded-lg text-xs text-foreground/60 hover:text-foreground hover:border-accent/30 hover:bg-accent/[0.02] transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left"
                  >
                    <Zap className="w-3 h-3 text-accent/60 shrink-0" />
                    {s.label}
                  </button>
                ))}
              </div>

              <p className="mt-6 text-[10px] text-foreground/30 font-mono">
                {mode === 'ai' ? 'AI-POWERED' : 'EXPERT SYSTEM'} · {LEVEL_CONFIG[knowledgeLevel].label.toUpperCase()}
              </p>
            </div>
          ) : (
            /* ── Message List ── */
            <div className="py-3">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 px-4 py-3 ${
                    msg.role === 'assistant'
                      ? 'bg-accent/[0.01] border-b border-border/30'
                      : 'border-b border-border/20'
                  }`}
                >
                  {/* Avatar */}
                  {msg.role === 'assistant' ? (
                    <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-accent" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-primary border border-border flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-heading font-bold text-foreground/80">
                        U
                      </span>
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none text-foreground/85 [&_h1]:text-sm [&_h1]:font-bold [&_h1]:font-heading [&_h1]:text-accent [&_h1]:mb-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:font-heading [&_h2]:text-foreground [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-foreground/90 [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:text-xs [&_p]:leading-relaxed [&_p]:mb-2 [&_ul]:text-xs [&_ul]:space-y-1 [&_ul]:mb-2 [&_ol]:text-xs [&_ol]:space-y-1 [&_ol]:mb-2 [&_li]:text-xs [&_code]:text-[11px] [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:border [&_code]:border-border/50 [&_pre]:bg-[#0a0e1a] [&_pre]:border [&_pre]:border-border/50 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:mb-3 [&_pre_code]:bg-transparent [&_pre_code]:border-0 [&_pre_code]:p-0 [&_strong]:text-foreground [&_blockquote]:border-l-2 [&_blockquote]:border-accent/30 [&_blockquote]:pl-3 [&_blockquote]:text-foreground/60 [&_blockquote]:text-xs [&_blockquote]:mb-2 [&_hr]:border-border/50 [&_hr]:my-3">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isProcessing && <TypingIndicator />}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input Area ── */}
        <div className="shrink-0 border-t border-border p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your network..."
                rows={1}
                disabled={isProcessing}
                className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-foreground/30 resize-none focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-150 disabled:opacity-50"
                style={{ minHeight: '40px', maxHeight: '120px' }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                }}
              />
              {/* Send button inside */}
              <button
                onClick={handleSend}
                disabled={!input.trim() || isProcessing}
                className="absolute right-2 bottom-2 p-1.5 rounded-lg bg-accent text-black hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Bottom hint */}
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[10px] text-foreground/30 font-mono">
              {chatMessages.length > 0 ? `${chatMessages.length} messages` : 'Ask anything'}
            </span>
            <button
              onClick={() => sendMessage('Generate a comprehensive security report')}
              disabled={isProcessing}
              className="flex items-center gap-1 text-[10px] text-foreground/40 hover:text-accent transition-colors duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <FileText className="w-3 h-3" />
              Generate Report
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
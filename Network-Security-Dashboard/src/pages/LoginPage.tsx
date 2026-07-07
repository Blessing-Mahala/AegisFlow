import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useNavigate, Link } from 'react-router-dom';
import {
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  ScanLine,
} from 'lucide-react';
import CyberParticleBackground from '../components/CyberParticleBackground';

// ─── Status ticker messages ──────────────────────────────────
const TICKER_MSGS = [
  'STATUS: DEPLOYING ZERO-TRUST ROUTING CONTROLS...',
  'INGESTION PIPES ONLINE...',
  'INTERN PORTAL STANDBY...',
  'AEGISFLOW CORE ENGAGED...',
  'THREAT TELEMETRY ACTIVE...',
  'FABRIC NODES SYNCHRONIZED...',
  'QUANTUM-READY TUNNELS ESTABLISHED...',
  'BEHAVIORAL ANOMALY ENGINE ARMED...',
];

// ─── Matrix rain characters ──────────────────────────────────
const MATRIX_CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';

// ─── Scan overlay component ────────────────────────────────
function ScanOverlay({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none" aria-hidden="true">
      {/* Scan line from top to bottom */}
      <div className="absolute inset-x-0 top-0 h-full overflow-hidden">
        <div className="w-full h-full animate-scan-wipe" />
      </div>
      {/* Flash overlay */}
      <div className="absolute inset-0 animate-scan-flash" />
    </div>
  );
}

// ─── Matrix rain effect on focused input ─────────────────────
function MatrixRain({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!active || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const cols = Math.floor(canvas.width / 12);
    const drops: number[] = Array(cols).fill(0).map(() => Math.random() * canvas.height * -1);
    const speeds: number[] = Array(cols).fill(0).map(() => 4 + Math.random() * 8);

    const draw = () => {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = '10px monospace';

      for (let i = 0; i < drops.length; i++) {
        const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
        const x = i * 12;
        const y = drops[i];

        // Fade toward bottom
        const gradient = ctx.createLinearGradient(x, y - 60, x, y);
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0)');
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0.7)');
        ctx.fillStyle = gradient;
        ctx.fillText(char, x, y);

        drops[i] += speeds[i];

        if (drops[i] > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animRef.current);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    />
  );
}

// ─── LED status ring ─────────────────────────────────────────
function LedRing({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
      </span>
      <span className="text-[10px] text-accent/70 font-heading uppercase tracking-[0.15em]">
        Secure Gateway Active
      </span>
    </span>
  );
}

// ─── Main Login Page ─────────────────────────────────────────
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [scanActive, setScanActive] = useState(false);

  const signIn = useAuthStore((s) => s.signIn);
  const navigate = useNavigate();

  // ── Diagnostic ticker ─────────────────────────────────────
  useEffect(() => {
    if (scanActive) return;
    const interval = setInterval(() => {
      setTickerIndex((i) => (i + 1) % TICKER_MSGS.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [scanActive]);

  // ── Prevent body scroll when scan overlay is active ──────
  useEffect(() => {
    if (scanActive) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [scanActive]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      // Trigger scan overlay
      setScanActive(true);

      const result = await signIn(email, password);

      if (result.error) {
        setError(result.error);
        setLoading(false);
        setScanActive(false);
      } else {
        // Wait for scan animation to complete before navigating
        setTimeout(() => {
          navigate('/');
        }, 800);
      }
    },
    [email, password, signIn, navigate]
  );

  const isEmailFocused = focusedField === 'email';
  const isPasswordFocused = focusedField === 'password';

  return (
    <>
      {/* Screen wipe scan overlay */}
      <ScanOverlay active={scanActive} />

      {/* Background layer */}
      <div className="fixed inset-0 bg-[#020617]" />
      <CyberParticleBackground />

      {/* Corner decorative server rack nodes */}
      <div className="fixed left-4 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-2 z-10" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: `rgba(34, 197, 94, ${0.15 + i * 0.12})`,
              boxShadow: `0 0 ${4 + i * 2}px rgba(34, 197, 94, ${0.08 + i * 0.04})`,
              animation: `pulse-led ${1.5 + i * 0.3}s ease-in-out infinite`,
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
      <div className="fixed right-4 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-2 z-10" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: `rgba(34, 197, 94, ${0.35 - i * 0.04})`,
              boxShadow: `0 0 ${6 - i}px rgba(34, 197, 94, ${0.2 - i * 0.025})`,
              animation: `pulse-led ${1.8 + i * 0.25}s ease-in-out infinite`,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>

      {/* Main content - centered */}
      <div className="relative z-20 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* ── Glassmorphism login card ── */}
          <div
            className={`relative rounded-2xl border transition-all duration-500 overflow-hidden ${
              isEmailFocused || isPasswordFocused
                ? 'border-accent/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
                : 'border-border/50 shadow-[0_0_20px_rgba(34,197,94,0.05)]'
            }`}
            style={{
              background:
                'linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.75) 100%)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            }}
          >
            {/* Inner glow border highlight */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-500"
              style={{
                opacity: isEmailFocused || isPasswordFocused ? 0.6 : 0,
                background:
                  'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, transparent 50%, rgba(34,197,94,0.04) 100%)',
              }}
            />

            <div className="relative p-8">
              {/* ── AEGISFLOW Branding ── */}
              <div className="text-center mb-8">
                <div className="relative inline-flex items-center justify-center mb-4">
                  {/* Outer glow ring */}
                  <div
                    className="absolute inset-0 rounded-full animate-pulse-glow"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(34,197,94,0.25) 0%, transparent 70%)',
                      filter: 'blur(8px)',
                    }}
                  />
                  {/* Shield icon */}
                  <div className="relative w-16 h-16 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center">
                    <Shield className="w-8 h-8 text-accent" />
                  </div>
                </div>
                <h1 className="text-lg font-heading font-bold text-foreground tracking-wide">
                  AEGISFLOW
                </h1>
                <p className="text-[11px] text-foreground/40 font-heading tracking-[0.2em] uppercase mt-0.5">
                  Banking Fabric Core
                </p>

                {/* Live diagnostic ticker */}
                <div className="mt-4 h-4 overflow-hidden">
                  <p
                    className="text-[10px] font-mono-custom text-accent/60 tracking-wider animate-ticker-slide"
                    key={tickerIndex}
                  >
                    {TICKER_MSGS[tickerIndex]}
                  </p>
                </div>
              </div>

              {/* ── Error display ── */}
              {error && (
                <div className="mb-4 flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive text-xs rounded-lg p-3 font-mono-custom">
                  <ScanLine className="w-3.5 h-3.5 shrink-0" />
                  <span>ERR: {error}</span>
                </div>
              )}

              {/* ── Form ── */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email / Access Key */}
                <div className="relative">
                  <label
                    htmlFor="email"
                    className="block text-xs font-heading font-medium text-foreground/60 uppercase tracking-[0.12em] mb-2"
                  >
                    Access Key
                  </label>
                  <div
                    className={`relative rounded-lg border transition-all duration-300 ${
                      isEmailFocused
                        ? 'border-accent/60 bg-accent/[0.03]'
                        : 'border-border/60 bg-background/50'
                    }`}
                  >
                    <MatrixRain active={isEmailFocused} />
                    <div className="relative z-10 flex items-center">
                      <KeyRound
                        className={`w-4 h-4 ml-3 shrink-0 transition-colors duration-300 ${
                          isEmailFocused ? 'text-accent' : 'text-foreground/30'
                        }`}
                      />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => setFocusedField('email')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full bg-transparent px-3 py-3 text-sm text-foreground placeholder-foreground/25 font-mono-custom focus:outline-none"
                        placeholder="analyst@absa.bank"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Password */}
                <div className="relative">
                  <label
                    htmlFor="password"
                    className="block text-xs font-heading font-medium text-foreground/60 uppercase tracking-[0.12em] mb-2"
                  >
                    Passcode
                  </label>
                  <div
                    className={`relative rounded-lg border transition-all duration-300 ${
                      isPasswordFocused
                        ? 'border-accent/60 bg-accent/[0.03]'
                        : 'border-border/60 bg-background/50'
                    }`}
                  >
                    <MatrixRain active={isPasswordFocused} />
                    <div className="relative z-10 flex items-center">
                      <Lock
                        className={`w-4 h-4 ml-3 shrink-0 transition-colors duration-300 ${
                          isPasswordFocused ? 'text-accent' : 'text-foreground/30'
                        }`}
                      />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full bg-transparent px-3 py-3 text-sm text-foreground placeholder-foreground/25 font-mono-custom focus:outline-none"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="mr-3 p-1 text-foreground/30 hover:text-foreground/60 transition-colors duration-200 cursor-pointer z-20"
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── AUTHENTICATE BUTTON ── */}
                <button
                  type="submit"
                  disabled={loading}
                  className="relative w-full group cursor-pointer disabled:opacity-50"
                >
                  {/* Pulse glow ring */}
                  <div
                    className={`absolute -inset-1 rounded-xl transition-opacity duration-500 ${
                      loading ? 'opacity-30' : 'opacity-0 group-hover:opacity-60'
                    }`}
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(34,197,94,0.3), rgba(16,185,129,0.3))',
                      filter: 'blur(12px)',
                    }}
                  />
                  {/* Button body */}
                  <div
                    className={`relative flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-heading font-semibold text-sm text-black overflow-hidden transition-all duration-300 ${
                      loading
                        ? 'bg-accent/60'
                        : 'bg-gradient-to-r from-accent to-emerald-400 group-hover:from-emerald-400 group-hover:to-accent'
                    }`}
                    style={{
                      boxShadow: loading
                        ? 'none'
                        : '0 4px 20px rgba(34,197,94,0.3)',
                    }}
                  >
                    {/* Pulse wave effect on hover */}
                    <div
                      className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background:
                          'repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(255,255,255,0.08) 8px, rgba(255,255,255,0.08) 16px)',
                        animation: 'pulse-wave 1s linear infinite',
                      }}
                    />
                    {/* Focus border */}
                    <div
                      className="absolute inset-0 rounded-xl border border-white/20 pointer-events-none"
                    />

                    {loading ? (
                      <>
                        <svg
                          className="animate-spin h-4 w-4 text-black"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span>AUTHORIZING…</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>AUTHENTICATE ACCESS</span>
                        <ScanLine className="w-4 h-4" />
                      </>
                    )}
                  </div>
                </button>

                {/* ── Sign up link ── */}
                <div className="pt-2 text-center">
                  <p className="text-xs text-foreground/40 font-mono-custom">
                    NO CREDENTIALS?{' '}
                    <Link
                      to="/signup"
                      className="text-accent/80 hover:text-accent transition-colors duration-200 underline underline-offset-2 decoration-accent/30"
                    >
                      REQUEST PROVISIONING
                    </Link>
                  </p>
                </div>
              </form>
            </div>
          </div>

          {/* ── LED Status indicator below card ── */}
          <div className="mt-4 flex justify-center">
            <LedRing />
          </div>
        </div>
      </div>
    </>
  );
}

import { useEffect, useRef, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
}

interface Connection {
  from: number;
  to: number;
  opacity: number;
}

export default function CyberParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const particlesRef = useRef<Particle[]>([]);
  const connectionsRef = useRef<Connection[]>([]);
  const animFrameRef = useRef<number>(0);

  const initParticles = useCallback((width: number, height: number) => {
    const count = Math.min(Math.floor((width * height) / 12000), 120);
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.6 + 0.2,
      });
    }
    particlesRef.current = particles;
  }, []);

  const updateConnections = useCallback(() => {
    const particles = particlesRef.current;
    const connections: Connection[] = [];
    const maxDist = 140;

    for (let i = 0; i < particles.length; i++) {
      // Only connect to next few particles for performance
      for (let j = i + 1; j < particles.length && j < i + 15; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          connections.push({
            from: i,
            to: j,
            opacity: (1 - dist / maxDist) * 0.35,
          });
        }
      }
    }
    connectionsRef.current = connections;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles(canvas.width, canvas.height);
      updateConnections();
    };

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const animate = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const particles = particlesRef.current;
      const mouse = mouseRef.current;

      // Update particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        // Mouse interaction: gentle repulsion/pull
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200) {
          const force = (200 - dist) / 200;
          p.vx += (dx / dist) * force * 0.02;
          p.vy += (dy / dist) * force * 0.02;
        }

        // Damping
        p.vx *= 0.99;
        p.vy *= 0.99;

        // Wrap edges
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;
      }

      updateConnections();

      // Draw connections
      const connections = connectionsRef.current;
      for (const conn of connections) {
        const a = particles[conn.from];
        const b = particles[conn.to];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(34, 197, 94, ${conn.opacity})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Draw particles
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 197, 94, ${p.opacity})`;
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 197, 94, ${p.opacity * 0.15})`;
        ctx.fill();
      }

      // Draw corner decorative brackets
      const cornerSize = 60;
      const cornerGap = 30;
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.12)';
      ctx.lineWidth = 1;

      // Top-left
      ctx.beginPath();
      ctx.moveTo(cornerGap, cornerGap + cornerSize);
      ctx.lineTo(cornerGap, cornerGap);
      ctx.lineTo(cornerGap + cornerSize, cornerGap);
      ctx.stroke();

      // Top-right
      ctx.beginPath();
      ctx.moveTo(w - cornerGap - cornerSize, cornerGap);
      ctx.lineTo(w - cornerGap, cornerGap);
      ctx.lineTo(w - cornerGap, cornerGap + cornerSize);
      ctx.stroke();

      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(cornerGap, h - cornerGap - cornerSize);
      ctx.lineTo(cornerGap, h - cornerGap);
      ctx.lineTo(cornerGap + cornerSize, h - cornerGap);
      ctx.stroke();

      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(w - cornerGap - cornerSize, h - cornerGap);
      ctx.lineTo(w - cornerGap, h - cornerGap);
      ctx.lineTo(w - cornerGap, h - cornerGap - cornerSize);
      ctx.stroke();

      animFrameRef.current = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouse);
    window.addEventListener('touchmove', handleTouch);

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouse);
      window.removeEventListener('touchmove', handleTouch);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [initParticles, updateConnections]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
}

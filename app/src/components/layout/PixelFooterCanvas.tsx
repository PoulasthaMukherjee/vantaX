import { useRef, useEffect, useState } from 'react';

/* ── PALETTE ── */
const C = {
  sky0:    '#050312',
  sky1:    '#0d0a1e',
  sky2:    '#1a1535',
  bldgA:   '#100d22',
  bldgB:   '#150f30',
  bldgC:   '#0b0918',
  gndTop:  '#221b4a',
  gndMid:  '#160f38',
  gndDark: '#0b0822',
  circuit: '#342970',
  dot:     '#f5c842',
  skin:    '#f4c490',
  hair:    '#2a1840',
  hoodie:  '#7c3aed',   // purple hoodie
  hoodieD: '#5b21b6',   // hoodie shadow
  tee:     '#ddd2ff',
  jeans:   '#1e3a5f',
  jeansD:  '#162d4a',
  shoe:    '#0f0b22',
  laptop:  '#374151',   // laptop bag
  laptopD: '#1f2937',
  screen:  '#60a5fa',   // laptop screen glow
  trophy:  '#f5c842',
  trophyD: '#c49018',
  trophyS: '#fff9c4',
  star0:   '#ffffff',
  star1:   '#f5c842',
  star2:   '#c4b8ff',
};

const CHARS = [
  '01','10','{}','[]','()','<>','//','/*','*/','=> ','->','!=','==',
  '&&','||','++','--','**','##','~~','::',';;','??','!!','%%','^^',
  'fn','if','AI','</>','null','NaN','true',
  '#','~','@','$','%','^','&','*','|','?',':','!',
  '₹','→','←','↑','★','∑','∞','π','λ','∂','∇',
];
const PARTICLE_COLORS = ['#f5c842','#f97316','#c4b8ff','#4af7b0','#ff6b9d','#7dd3fc','#ffffff'];
const CONFETTI_COLORS = ['#f5c842','#f97316','#c4b8ff','#ff6b9d','#4af7b0','#ffffff'];

const S = 3;          // pixel scale
const CANVAS_H = 170;
const WORLD_W = 4000;
const FIG_WIDTH_PX = 9 * S;  // figure is ~9 grid units wide
const FIG_WALK_SPEED = 1.5;  // pixels per frame toward cursor
const WINNER_HOLD = 220;

export default function PixelFooterCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;

    /* ── resize ── */
    function resize() {
      canvas!.width = canvas!.clientWidth;
      canvas!.height = CANVAS_H;
    }
    resize();

    /* ── mouse tracking ── */
    let mouseX = canvas.width / 2;
    let mouseActive = false;

    function onMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseActive = true;
    }
    function onMouseLeave() {
      mouseActive = false;
    }
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    /* ── stars ── */
    type Star = { x: number; y: number; sz: number; phase: number; spd: number; col: string };
    let stars: Star[] = [];
    function generateStars() {
      stars = [];
      const groundY = canvas!.height - S * 14;
      for (let i = 0; i < 90; i++) {
        stars.push({
          x: Math.random() * canvas!.width,
          y: Math.random() * (groundY - 10),
          sz: Math.random() > 0.75 ? 2 : 1,
          phase: Math.random() * Math.PI * 2,
          spd: 0.2 + Math.random() * 0.6,
          col: [C.star0, C.star1, C.star2, C.star1][Math.floor(Math.random() * 4)],
        });
      }
    }
    generateStars();

    /* ── buildings ── */
    type Win = { wx: number; wy: number; on: boolean };
    type Building = { baseX: number; w: number; h: number; col: string; wins: Win[] };
    let buildings: Building[] = [];
    function generateBuildings() {
      buildings = [];
      let x = 0;
      while (x < WORLD_W) {
        const w = (5 + Math.floor(Math.random() * 10)) * S;
        const h = (10 + Math.floor(Math.random() * 28)) * S;
        const col = [C.bldgA, C.bldgB, C.bldgC][Math.floor(Math.random() * 3)];
        const wins: Win[] = [];
        for (let wy = 2 * S; wy < h - 3 * S; wy += 4 * S) {
          for (let wx = S; wx < w - S * 2; wx += 3 * S) {
            if (Math.random() > 0.3) wins.push({ wx, wy, on: Math.random() > 0.15 });
          }
        }
        buildings.push({ baseX: x, w, h, col, wins });
        x += w + (Math.random() > 0.5 ? S : 0);
      }
    }
    generateBuildings();

    /* ── particles ── */
    type Particle = { x: number; y: number; ch: string; spd: number; alpha: number; phase: number; col: string; sz: number };
    const particles: Particle[] = Array.from({ length: 55 }, () => ({
      x: Math.random() * (canvas!.width || 1200),
      y: 5 + Math.random() * ((canvas!.height - 30) || 140),
      ch: CHARS[Math.floor(Math.random() * CHARS.length)],
      spd: 0.1 + Math.random() * 0.35,
      alpha: 0.45 + Math.random() * 0.55,
      phase: Math.random() * Math.PI * 2,
      col: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      sz: S * (2 + Math.floor(Math.random() * 3)),
    }));

    /* ── confetti ── */
    type Confetto = { x: number; y: number; vx: number; vy: number; col: string; life: number; sz: number };
    let confetti: Confetto[] = [];
    function spawnConfetti(cx: number, cy: number) {
      for (let i = 0; i < 40; i++) {
        confetti.push({
          x: cx + (Math.random() - 0.5) * 40,
          y: cy,
          vx: (Math.random() - 0.5) * 3,
          vy: -(1.5 + Math.random() * 3),
          col: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          life: 1.0,
          sz: 2 + Math.floor(Math.random() * 3),
        });
      }
    }

    /* ── helpers ── */
    function px(gx: number, gy: number, gw: number, gh: number, col: string) {
      ctx!.fillStyle = col;
      ctx!.fillRect(gx * S, gy * S, gw * S, gh * S);
    }

    function drawFigureRaw(gx: number, gy: number, frame: number) {
      // Hair / head
      px(gx+3, gy, 3, 2, C.hair);
      px(gx+3, gy+1, 3, 3, C.skin);
      // Messy hair fringe
      px(gx+2, gy, 1, 1, C.hair);
      px(gx+6, gy, 1, 1, C.hair);
      // Eyes
      px(gx+3, gy+2, 1, 1, '#2a1840');
      px(gx+5, gy+2, 1, 1, '#2a1840');
      // Hoodie with hood shape
      px(gx+2, gy+3, 1, 1, C.hoodieD);  // hood left
      px(gx+6, gy+3, 1, 1, C.hoodieD);  // hood right
      px(gx+2, gy+4, 5, 4, C.hoodie);
      // T-shirt visible at collar
      px(gx+4, gy+4, 1, 1, C.tee);
      // Hoodie pocket
      px(gx+3, gy+6, 3, 1, C.hoodieD);

      const f = frame % 4;
      // Arms + laptop bag
      if (f === 0 || f === 2) {
        px(gx+7, gy+4, 1, 4, C.hoodie);        // right arm fwd
        px(gx+1, gy+5, 1, 3, C.hoodie);         // left arm holding
        px(gx+0, gy+6, 2, 3, C.laptop);         // laptop bag
        px(gx+0, gy+7, 2, 1, C.laptopD);
        px(gx+0, gy+6, 1, 1, C.screen);         // screen glow
      } else {
        px(gx+1, gy+4, 1, 4, C.hoodie);         // left arm fwd
        px(gx+7, gy+5, 1, 3, C.hoodie);         // right arm holding
        px(gx+7, gy+6, 2, 3, C.laptop);
        px(gx+7, gy+7, 2, 1, C.laptopD);
        px(gx+8, gy+6, 1, 1, C.screen);
      }

      // Legs — jeans
      if (f === 0) {
        px(gx+3, gy+8, 2, 4, C.jeans); px(gx+5, gy+8, 2, 3, C.jeansD);
        px(gx+3, gy+12, 2, 1, C.shoe); px(gx+5, gy+11, 2, 1, C.shoe);
      } else if (f === 1) {
        px(gx+3, gy+8, 2, 3, C.jeansD); px(gx+5, gy+8, 2, 4, C.jeans);
        px(gx+3, gy+11, 2, 1, C.shoe); px(gx+5, gy+12, 2, 1, C.shoe);
      } else if (f === 2) {
        px(gx+3, gy+8, 2, 4, C.jeans); px(gx+5, gy+8, 2, 3, C.jeansD);
        px(gx+3, gy+12, 3, 1, C.shoe); px(gx+4, gy+11, 2, 1, C.shoe);
      } else {
        px(gx+3, gy+8, 2, 3, C.jeansD); px(gx+5, gy+8, 2, 4, C.jeans);
        px(gx+3, gy+11, 2, 1, C.shoe); px(gx+5, gy+12, 3, 1, C.shoe);
      }
    }

    /** Draw figure at screen pixel position, optionally flipped for walking left */
    function drawFigure(screenX: number, gy: number, frame: number, facingLeft: boolean) {
      const gx = Math.floor(screenX / S);
      if (facingLeft) {
        ctx!.save();
        const centerX = screenX + FIG_WIDTH_PX / 2;
        ctx!.translate(centerX * 2, 0);
        ctx!.scale(-1, 1);
        drawFigureRaw(gx, gy, frame);
        ctx!.restore();
      } else {
        drawFigureRaw(gx, gy, frame);
      }
    }

    function drawTrophy(gx: number, gy: number, t: number) {
      px(gx+2, gy, 4, 1, C.trophyS);
      px(gx+1, gy+1, 6, 3, C.trophy);
      px(gx+2, gy+1, 4, 3, C.trophyS);
      px(gx+2, gy+4, 4, 1, C.trophy);
      px(gx, gy+1, 1, 2, C.trophyD);
      px(gx+7, gy+1, 1, 2, C.trophyD);
      px(gx+3, gy+5, 2, 2, C.trophyD);
      px(gx+1, gy+7, 6, 1, C.trophy);
      px(gx+2, gy+8, 4, 1, C.trophyD);
      const pulse = 0.6 + 0.4 * Math.sin(t * 0.003);
      ctx!.globalAlpha = pulse;
      px(gx+3, gy-2, 2, 1, C.trophyS);
      px(gx+2, gy-1, 4, 1, C.trophyS);
      ctx!.globalAlpha = 1;
    }

    function drawWinnerRaw(gx: number, gy: number) {
      // Hair / head
      px(gx+3, gy, 3, 2, C.hair);
      px(gx+3, gy+1, 3, 3, C.skin);
      px(gx+2, gy, 1, 1, C.hair);
      px(gx+6, gy, 1, 1, C.hair);
      px(gx+3, gy+2, 1, 1, '#2a1840');
      px(gx+5, gy+2, 1, 1, '#2a1840');
      // Hoodie body
      px(gx+2, gy+3, 1, 1, C.hoodieD);
      px(gx+6, gy+3, 1, 1, C.hoodieD);
      px(gx+2, gy+4, 5, 4, C.hoodie);
      px(gx+4, gy+4, 1, 1, C.tee);
      px(gx+3, gy+6, 3, 1, C.hoodieD);
      // Arms raised up (victory!)
      px(gx+0, gy+1, 1, 3, C.hoodie);
      px(gx+8, gy+1, 1, 3, C.hoodie);
      px(gx-1, gy+0, 2, 2, C.skin);
      px(gx+8, gy+0, 2, 2, C.skin);
      // Legs straight — jeans
      px(gx+3, gy+8, 2, 4, C.jeans);
      px(gx+5, gy+8, 2, 4, C.jeans);
      px(gx+2, gy+12, 3, 1, C.shoe);
      px(gx+5, gy+12, 3, 1, C.shoe);
    }

    function drawGround(gndY: number, scrollX: number) {
      ctx!.fillStyle = C.gndTop;
      ctx!.fillRect(0, gndY, canvas!.width, S * 2);
      ctx!.fillStyle = C.gndMid;
      ctx!.fillRect(0, gndY + S * 2, canvas!.width, S * 5);
      ctx!.fillStyle = C.gndDark;
      ctx!.fillRect(0, gndY + S * 7, canvas!.width, canvas!.height);

      const seamW = S * 8;
      const seamOff = scrollX % seamW;
      ctx!.fillStyle = C.circuit;
      for (let tx = -seamOff; tx < canvas!.width; tx += seamW) {
        ctx!.fillRect(Math.round(tx), gndY, 1, S * 2);
      }
      ctx!.fillStyle = '#3d3070';
      const traceW = S * 20;
      const traceOff = scrollX % traceW;
      for (let tx = -traceOff; tx < canvas!.width; tx += traceW) {
        ctx!.fillRect(Math.round(tx), gndY + S * 3, S * 5, 1);
        ctx!.fillRect(Math.round(tx) + S * 5, gndY + S * 3, 1, S * 2);
        ctx!.fillRect(Math.round(tx) + S * 5, gndY + S * 5, S * 3, 1);
      }
      const dotW = S * 28;
      const dotOff = scrollX % dotW;
      for (let tx = -dotOff + S * 6; tx < canvas!.width; tx += dotW) {
        ctx!.fillStyle = C.dot;
        ctx!.fillRect(Math.round(tx), gndY + S * 4, 2, 2);
        ctx!.fillStyle = 'rgba(245,200,66,0.3)';
        ctx!.fillRect(Math.round(tx) - 2, gndY + S * 4 - 2, 6, 6);
      }
    }

    /* ── animation state ── */
    let t = 0;
    let frame = 0;
    let frameTimer = 0;
    let scrollX = 0;
    let figScreenX = 120;          // figure's current screen X in pixels
    let facingRight = true;
    let isWalking = false;
    const DEAD_ZONE = 8;           // stop walking when this close to cursor

    // Trophy appears at a world X far ahead
    const trophyWorldX = (canvas.width || 1200) * 2.2;
    let winnerMode = false;
    let winnerTimer = 0;
    let confettiSpawned = false;

    // Auto-walk speed when mouse is not over canvas
    const AUTO_SCROLL_SPD = 0.6;

    function draw() {
      t++;
      const GROUND_Y = canvas!.height - S * 14;
      const FIG_GY = Math.round(GROUND_Y / S) - 13;

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      /* ── figure movement ── */
      if (!winnerMode) {
        if (mouseActive) {
          // Target = cursor X, offset so figure center aligns with cursor
          const targetX = mouseX - FIG_WIDTH_PX / 2;
          const dx = targetX - figScreenX;

          if (Math.abs(dx) > DEAD_ZONE) {
            isWalking = true;
            facingRight = dx > 0;
            // Move figure toward cursor
            const step = Math.min(Math.abs(dx), FIG_WALK_SPEED);
            const dir = dx > 0 ? 1 : -1;
            figScreenX += dir * step;
            // Scroll the world in the same direction to create parallax
            scrollX += dir * step * 0.8;
          } else {
            isWalking = false;
          }
        } else {
          // No mouse — auto-walk right like the original
          isWalking = true;
          facingRight = true;
          scrollX += AUTO_SCROLL_SPD;
        }

        // Keep scrollX positive (wrap)
        if (scrollX < 0) scrollX += WORLD_W;
        scrollX = scrollX % WORLD_W;

        // Clamp figure to canvas bounds
        figScreenX = Math.max(0, Math.min(canvas!.width - FIG_WIDTH_PX, figScreenX));
      }

      /* ── walk animation ── */
      if (isWalking && !winnerMode) {
        frameTimer++;
        if (frameTimer >= 12) { frame = (frame + 1) % 4; frameTimer = 0; }
      }

      /* sky */
      const sg = ctx!.createLinearGradient(0, 0, 0, GROUND_Y);
      sg.addColorStop(0, C.sky0);
      sg.addColorStop(0.5, C.sky1);
      sg.addColorStop(1, C.sky2);
      ctx!.fillStyle = sg;
      ctx!.fillRect(0, 0, canvas!.width, GROUND_Y);

      /* stars */
      const starOff = (scrollX * 0.05) % canvas!.width;
      stars.forEach(s => {
        const sx = ((s.x - starOff) % canvas!.width + canvas!.width) % canvas!.width;
        ctx!.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.008 * s.spd + s.phase));
        ctx!.fillStyle = s.col;
        ctx!.fillRect(Math.round(sx), Math.round(s.y), s.sz, s.sz);
      });
      ctx!.globalAlpha = 1;

      /* far buildings */
      const farOff = scrollX * 0.3;
      buildings.forEach(b => {
        const sx = ((b.baseX - farOff) % WORLD_W + WORLD_W) % WORLD_W;
        if (sx > canvas!.width + b.w) return;
        const top = GROUND_Y - b.h * 0.55;
        ctx!.fillStyle = '#09071a';
        ctx!.fillRect(sx + 5, top, b.w - 4, b.h * 0.55);
      });

      /* near buildings */
      buildings.forEach(b => {
        const sx = ((b.baseX - scrollX) % WORLD_W + WORLD_W) % WORLD_W;
        if (sx > canvas!.width + b.w) return;
        const top = GROUND_Y - b.h;
        ctx!.fillStyle = b.col;
        ctx!.fillRect(sx, top, b.w, b.h);
        b.wins.forEach(w => {
          if (!w.on) return;
          let flicker = 0.5 + 0.5 * Math.sin(t * 0.04 + b.baseX * 0.07 + w.wy * 0.2);
          if (winnerMode) flicker = 0.6 + 0.4 * Math.sin(t * 0.35 + b.baseX * 0.1);
          ctx!.fillStyle = `rgba(245,200,66,${0.35 + flicker * 0.55})`;
          ctx!.fillRect(sx + w.wx, top + w.wy, S, S);
        });
      });

      /* floating code particles */
      const scrollDir = facingRight ? 1 : -1;
      particles.forEach(p => {
        p.x -= scrollDir * 0.3;
        p.y -= p.spd * 0.2;
        if (p.x < -40) { p.x = canvas!.width + 20; p.y = 5 + Math.random() * (GROUND_Y - 20); p.ch = CHARS[Math.floor(Math.random() * CHARS.length)]; }
        if (p.x > canvas!.width + 40) { p.x = -20; p.y = 5 + Math.random() * (GROUND_Y - 20); p.ch = CHARS[Math.floor(Math.random() * CHARS.length)]; }
        if (p.y < -12) { p.y = GROUND_Y - 8; }
        const alpha = p.alpha * (0.7 + 0.3 * Math.sin(t * 0.025 + p.phase));
        ctx!.globalAlpha = alpha;
        ctx!.shadowColor = p.col;
        ctx!.shadowBlur = 10;
        ctx!.fillStyle = p.col;
        ctx!.font = `bold ${p.sz}px 'Courier New', monospace`;
        ctx!.fillText(p.ch, p.x, p.y);
        ctx!.shadowBlur = 0;
      });
      ctx!.globalAlpha = 1;

      /* ground */
      drawGround(GROUND_Y, scrollX);

      /* trophy — appears at fixed world X */
      const trophyScreenX = ((trophyWorldX - scrollX) % WORLD_W + WORLD_W) % WORLD_W;
      const TGX = Math.floor(trophyScreenX / S);
      const TGY = FIG_GY + 2;

      if (trophyScreenX > -60 && trophyScreenX < canvas!.width + 60) {
        const bounceOff = winnerMode ? Math.round(Math.abs(Math.sin(t * 0.18)) * 3) : 0;
        drawTrophy(TGX, TGY - bounceOff, t);
        const glowR = winnerMode ? 80 + 30 * Math.sin(t * 0.1) : 50;
        const gr = ctx!.createRadialGradient(trophyScreenX, GROUND_Y, 0, trophyScreenX, GROUND_Y, glowR);
        gr.addColorStop(0, `rgba(245,200,66,${winnerMode ? 0.45 : 0.18})`);
        gr.addColorStop(1, 'rgba(245,200,66,0)');
        ctx!.fillStyle = gr;
        ctx!.fillRect(trophyScreenX - glowR, GROUND_Y - glowR, glowR * 2, glowR * 2);

        // Check if figure reached trophy
        if (!winnerMode && Math.abs(figScreenX + FIG_WIDTH_PX / 2 - trophyScreenX) < S * 12) {
          winnerMode = true;
          winnerTimer = 0;
          confettiSpawned = false;
        }
      }

      /* figure / winner */
      if (!winnerMode) {
        drawFigure(figScreenX, FIG_GY, frame, !facingRight);
      } else {
        winnerTimer++;
        const winGX = Math.floor(figScreenX / S);
        if (!confettiSpawned) {
          spawnConfetti(figScreenX + FIG_WIDTH_PX / 2, FIG_GY * S);
          confettiSpawned = true;
        }
        drawWinnerRaw(winGX, FIG_GY);

        /* WINNER text */
        ctx!.globalAlpha = 0.95;
        ctx!.shadowColor = '#f5c842';
        ctx!.shadowBlur = 16;
        ctx!.font = `bold ${S * 5}px 'Courier New', monospace`;
        ctx!.fillStyle = '#f5c842';
        const label = '★ WINNER! ★';
        const tw = ctx!.measureText(label).width;
        const tx = figScreenX + FIG_WIDTH_PX / 2 - tw / 2;
        const ty = FIG_GY * S - S * 4;
        ctx!.fillText(label, tx, ty + Math.sin(t * 0.12) * 3);
        ctx!.shadowBlur = 0;
        ctx!.globalAlpha = 1;

        /* confetti physics */
        confetti.forEach(c_ => { c_.x += c_.vx; c_.y += c_.vy; c_.vy += 0.12; c_.life -= 0.008; });
        confetti = confetti.filter(c_ => c_.life > 0);
        confetti.forEach(c_ => {
          ctx!.globalAlpha = c_.life;
          ctx!.fillStyle = c_.col;
          ctx!.fillRect(Math.round(c_.x), Math.round(c_.y), c_.sz, c_.sz);
        });
        ctx!.globalAlpha = 1;
        if (winnerTimer % 60 === 0) spawnConfetti(figScreenX + FIG_WIDTH_PX / 2, FIG_GY * S);

        if (winnerTimer >= WINNER_HOLD) {
          winnerMode = false;
          scrollX = 0;
          figScreenX = 120;
          confetti = [];
        }
      }

      rafId = requestAnimationFrame(draw);
    }

    draw();

    const onResize = () => { resize(); generateStars(); };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      canvas!.removeEventListener('mousemove', onMouseMove);
      canvas!.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [mounted]);

  if (!mounted) {
    return <div style={{ height: CANVAS_H, background: '#050312' }} />;
  }

  return (
    <canvas
      ref={canvasRef}
      className="block w-full cursor-none"
      style={{ height: CANVAS_H, imageRendering: 'pixelated' }}
    />
  );
}

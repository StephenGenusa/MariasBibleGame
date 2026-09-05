// Canvas particle engine. Knows how a particle moves; knows nothing about
// what fireworks look like. Presets supply that.

// The compression budget from spec section 2. Fine, fast particles turn to grey
// mush through Google Meet's encoder, so these bounds are load-bearing, not taste.
export const MIN_RADIUS = 6;
export const MAX_RADIUS = 14;
export const MAX_PARTICLES = 250;
export const MIN_DURATION = 2500;
export const MAX_DURATION = 7000;

export function makeParticle(overrides = {}) {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    r: MIN_RADIUS,
    color: "#ffffff",
    shape: "circle",
    life: 1,
    decay: 0.01,
    gravity: 0.25,
    drag: 0.99,
    spin: 0,
    rotation: 0,
    delay: 0,
    ...overrides,
  };
}

export function stepParticle(p, f = 1) {
  if (p.delay > 0) {
    p.delay = Math.max(0, p.delay - f);
    return p;
  }
  p.vy += p.gravity * f;
  const damp = Math.pow(p.drag, f);
  p.vx *= damp;
  p.vy *= damp;
  p.x += p.vx * f;
  p.y += p.vy * f;
  p.rotation += p.spin * f;
  p.life -= p.decay * f;
  return p;
}

function drawParticle(ctx, p) {
  if (p.delay > 0) return;
  ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;

  switch (p.shape) {
    case "ribbon": {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillRect(-p.r * 0.38, -p.r * 1.7, p.r * 0.76, p.r * 3.4);
      ctx.restore();
      break;
    }
    case "disc": {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.beginPath();
      // Squashing on one axis reads as a tumbling coin.
      ctx.ellipse(0, 0, p.r, p.r * Math.abs(Math.cos(p.rotation)) * 0.9 + p.r * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "shard": {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.beginPath();
      ctx.moveTo(0, -p.r);
      ctx.lineTo(p.r * 0.85, p.r * 0.7);
      ctx.lineTo(-p.r * 0.7, p.r * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case "streak": {
      ctx.lineWidth = p.r * 0.55;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 2.4, p.y - p.vy * 2.4);
      ctx.stroke();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function createEngine(canvas, stage) {
  const ctx = canvas.getContext("2d");
  const reduced = typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;

  let particles = [];
  let raf = null;
  let lastTime = 0;
  let overlayClass = null;
  let overlayTimer = null;
  let viewport = { width: 0, height: 0 };

  // The canvas is laid over the stage, not the window. The stage is a
  // letterboxed 16:9 box, so on a 4:3 iPad the window's corners sit inside the
  // black bars — emitting into window coordinates fires effects off-screen.
  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.style.left = `${rect.left}px`;
    canvas.style.top = `${rect.top}px`;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    viewport = { width: rect.width, height: rect.height };
  }

  function toHex(color) {
    const m = String(color).match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (!m) return "#e8eaf0";
    return "#" + [1, 2, 3].map(i => Number(m[i]).toString(16).padStart(2, "0")).join("");
  }

  // Render the answer to an offscreen canvas and read back where the ink is,
  // so a preset can turn the actual word into particles rather than
  // approximating it with a burst at the centre of the screen.
  function sampleAnswerInk(maxPoints) {
    const el = stage.querySelector(".answer-text");
    if (!el || !el.textContent.trim()) return null;

    const rect = el.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return null;

    const style = getComputedStyle(el);
    const w = Math.ceil(rect.width);
    const h = Math.ceil(rect.height);

    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const octx = off.getContext("2d", { willReadFrequently: true });
    if (!octx) return null;

    octx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    octx.fillStyle = "#ffffff";
    octx.fillText(el.textContent, w / 2, h / 2);

    let data;
    try {
      data = octx.getImageData(0, 0, w, h).data;
    } catch {
      return null;   // tainted or unavailable; the preset falls back
    }

    // Widen the sampling grid until the word fits inside the particle budget.
    let step = 9;
    let points = [];
    for (let attempt = 0; attempt < 7; attempt++) {
      points = [];
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          if (data[(y * w + x) * 4 + 3] > 128) points.push({ x, y });
        }
      }
      if (points.length <= maxPoints) break;
      step = Math.ceil(step * 1.28);
    }
    if (!points.length) return null;

    const originX = rect.left - stageRect.left;
    const originY = rect.top - stageRect.top;
    return {
      step,
      width: rect.width,
      color: toHex(style.color),
      points: points.map(pt => ({ x: originX + pt.x, y: originY + pt.y })),
    };
  }

  function clearOverlay() {
    if (overlayClass) stage.classList.remove(overlayClass);
    overlayClass = null;
    clearTimeout(overlayTimer);
    overlayTimer = null;
  }

  function frame(now) {
    const f = lastTime ? Math.min((now - lastTime) / (1000 / 60), 3) : 1;
    lastTime = now;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      stepParticle(p, f);
      if (p.life <= 0 || p.y - p.r > viewport.height + 80) particles.splice(i, 1);
      else drawParticle(ctx, p);
    }
    ctx.globalAlpha = 1;

    if (particles.length) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = null;
      lastTime = 0;
    }
  }

  function play(preset) {
    stop();
    if (!preset) return;

    if (preset.overlay) {
      overlayClass = preset.overlay;
      stage.classList.add(overlayClass);
      overlayTimer = setTimeout(clearOverlay, preset.duration);
    }

    // Reduced motion gets the overlay's colour wash but no particle storm.
    if (reduced) return;

    resize();
    const context = { ...viewport };
    if (preset.usesText) context.ink = sampleAnswerInk(MAX_PARTICLES - 20);
    particles = preset.emit(context).slice(0, MAX_PARTICLES);

    if (particles.length && !raf) {
      lastTime = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    lastTime = 0;
    particles = [];
    clearOverlay();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener("resize", resize);
  resize();

  return { play, stop, resize };
}

/* ---------- presets ---------- */

const GOLD = ["#ffd166", "#ffb703", "#ffe6a3", "#f7c948"];
const PARTY = ["#ff3b6b", "#ffc44d", "#33e08a", "#4db8ff", "#c99bff"];
const GREY = ["#9aa3b8", "#7b8499", "#b8bfd0", "#6f7891"];
const RAIN = ["#4a6ea8", "#3b5a8c", "#5c81bd"];
const SHARD = ["#4a5164", "#39404f", "#5d6579", "#2e3440"];

const rand = (min, max) => min + Math.random() * (max - min);
const pick = list => list[(Math.random() * list.length) | 0];
const radius = () => rand(MIN_RADIUS, MAX_RADIUS);

// A radial burst of `count` particles from a point.
function burst(x, y, count, colors, opts = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(opts.minSpeed ?? 3, opts.maxSpeed ?? 9);
    out.push(makeParticle({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (opts.lift ?? 2),
      r: radius(),
      color: pick(colors),
      decay: opts.decay ?? 0.011,
      gravity: opts.gravity ?? 0.24,
      drag: opts.drag ?? 0.985,
      shape: opts.shape ?? "circle",
      spin: rand(-0.15, 0.15),
      delay: opts.delay ?? 0,
    }));
  }
  return out;
}

export const WIN_PRESETS = [
  {
    id: "fireworks",
    label: "Fireworks",
    kind: "win",
    duration: 4200,
    overlay: null,
    emit({ width, height }) {
      const out = [];
      // Three bursts fired in sequence from the upper half.
      for (let i = 0; i < 3; i++) {
        out.push(...burst(
          rand(width * 0.2, width * 0.8),
          rand(height * 0.18, height * 0.45),
          58, PARTY,
          { delay: i * 30, decay: 0.0038 }));
      }
      return out;
    },
  },
  {
    id: "cannons",
    label: "Confetti cannons",
    kind: "win",
    duration: 5200,
    overlay: null,
    emit({ width, height }) {
      const out = [];
      // Fired from the stage's own bottom corners, angled up and inward.
      for (const [x, dir] of [[0, 1], [width, -1]]) {
        for (let i = 0; i < 62; i++) {
          const speed = rand(10, 18);
          const angle = rand(-1.2, -0.5); // radians; negative is upward
          out.push(makeParticle({
            x, y: height,
            vx: Math.cos(angle) * speed * dir,
            vy: Math.sin(angle) * speed,
            r: rand(MAX_RADIUS - 3, MAX_RADIUS),
            color: pick(PARTY),
            shape: "ribbon",
            spin: rand(-0.26, 0.26),
            decay: 0.0030,
            gravity: 0.2,
            drag: 0.991,
          }));
        }
      }
      return out;
    },
  },
  {
    id: "starburst",
    label: "Starburst",
    kind: "win",
    duration: 3600,
    overlay: null,
    emit({ width, height }) {
      // One large radial out of where the answer sits.
      return burst(width / 2, height * 0.5, 140, PARTY,
        { minSpeed: 5, maxSpeed: 15, gravity: 0.14, decay: 0.0042, lift: 0 });
    },
  },
  {
    id: "goldenrain",
    label: "Golden rain",
    kind: "win",
    duration: 4600,
    overlay: null,
    emit({ width }) {
      const out = [];
      for (let i = 0; i < 90; i++) {
        out.push(makeParticle({
          x: rand(0, width),
          y: rand(-260, -20),
          vx: rand(-0.5, 0.5),
          vy: rand(1.2, 2.8),
          r: radius(),
          color: pick(GOLD),
          shape: "disc",
          spin: rand(0.05, 0.2),
          decay: 0.0034,
          gravity: 0.05,
          drag: 0.999,
          delay: Math.random() * 40,
        }));
      }
      return out;
    },
  },
  {
    id: "shockwave",
    label: "Shockwave",
    kind: "win",
    duration: 3200,
    overlay: null,
    emit({ width, height }) {
      const out = [];
      // Rings drawn as dense circles of particles moving outward together.
      for (let ring = 0; ring < 3; ring++) {
        for (let i = 0; i < 40; i++) {
          const angle = (i / 40) * Math.PI * 2;
          const speed = 7 + ring * 1.4;
          out.push(makeParticle({
            x: width / 2, y: height * 0.5,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: rand(MIN_RADIUS, MIN_RADIUS + 3),
            color: pick(GOLD),
            decay: 0.0048,
            gravity: 0,
            drag: 0.975,
            delay: ring * 14,
          }));
        }
      }
      return out;
    },
  },
  {
    id: "streamers",
    label: "Streamers",
    kind: "win",
    duration: 5600,
    overlay: null,
    emit({ width }) {
      const out = [];
      for (let i = 0; i < 70; i++) {
        out.push(makeParticle({
          x: rand(0, width),
          y: rand(-300, -30),
          vx: rand(-1.2, 1.2),
          vy: rand(1.5, 3),
          r: rand(MAX_RADIUS - 4, MAX_RADIUS),
          color: pick(PARTY),
          shape: "ribbon",
          spin: rand(-0.22, 0.22),
          decay: 0.0028,
          gravity: 0.035,
          drag: 0.999,
          delay: Math.random() * 50,
        }));
      }
      return out;
    },
  },
];

export const LOSE_PRESETS = [
  {
    id: "ashfall",
    label: "Ashfall",
    kind: "lose",
    duration: 6000,
    overlay: null,
    emit({ width }) {
      const out = [];
      for (let i = 0; i < 80; i++) {
        out.push(makeParticle({
          x: rand(0, width),
          y: rand(-240, -20),
          vx: rand(-0.6, 0.6),
          vy: rand(0.8, 1.8),
          r: rand(MIN_RADIUS, MIN_RADIUS + 4),
          color: pick(GREY),
          // Slow decay: the flurries should drift for a good six seconds
          // rather than blinking out while everyone is still reading.
          decay: 0.0026,
          gravity: 0.012,
          drag: 0.999,
          delay: Math.random() * 45,
        }));
      }
      return out;
    },
  },
  {
    id: "deflate",
    label: "Deflate",
    kind: "lose",
    duration: 2600,
    overlay: "fx-deflate",
    emit() { return []; },
  },
  {
    id: "shatter",
    label: "Shatter",
    kind: "lose",
    duration: 4800,
    // Grey shards alone read as neutral. The overlay supplies the impact and
    // the colour drain, so nobody has to guess whether this is good news.
    overlay: "fx-shatter",
    emit({ width, height }) {
      return burst(width / 2, height * 0.5, 90, SHARD, {
        minSpeed: 2.5, maxSpeed: 8, gravity: 0.34, decay: 0.0032,
        shape: "shard", lift: 0.5,
      });
    },
  },
  {
    id: "iris",
    label: "Iris",
    kind: "lose",
    duration: 2800,
    overlay: "fx-iris",
    emit() { return []; },
  },
  {
    id: "crumble",
    label: "Crumble",
    kind: "lose",
    duration: 4200,
    overlay: "fx-crumble",
    // The engine hands over the answer's own ink, so these particles start out
    // spelling the word. Without a DOM to measure, it degrades to a burst.
    usesText: true,
    emit({ width, height, ink }) {
      if (!ink) {
        return burst(width / 2, height * 0.5, 80, SHARD, {
          minSpeed: 1, maxSpeed: 4, gravity: 0.5, decay: 0.0032, lift: -1,
        });
      }

      // Particle size follows the sampling grid so the word stays legible for
      // the moment before it goes.
      const r = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, ink.step * 0.62));

      return ink.points.map(pt => makeParticle({
        x: pt.x,
        y: pt.y,
        vx: rand(-0.35, 0.35),
        vy: rand(-0.4, 0.1),
        r,
        color: ink.color,
        shape: "circle",
        gravity: 0.52,
        drag: 0.995,
        spin: rand(-0.1, 0.1),
        decay: 0.0032,
        // Collapse left to right, so it reads as crumbling rather than
        // the whole word dropping at once.
        delay: ((pt.x / Math.max(1, ink.width + 1)) * 22) + Math.random() * 9,
      }));
    },
  },
  {
    id: "downpour",
    label: "Downpour",
    kind: "lose",
    duration: 3600,
    overlay: null,
    emit({ width }) {
      const out = [];
      for (let i = 0; i < 120; i++) {
        out.push(makeParticle({
          x: rand(-width * 0.1, width),
          y: rand(-300, -20),
          vx: 2.2,
          vy: rand(9, 14),
          r: rand(MIN_RADIUS, MIN_RADIUS + 2),
          color: pick(RAIN),
          shape: "streak",
          decay: 0.0044,
          gravity: 0.12,
          drag: 1,
          delay: Math.random() * 30,
        }));
      }
      return out;
    },
  },
];

export const PRESETS_BY_ID = Object.fromEntries(
  [...WIN_PRESETS, ...LOSE_PRESETS].map(p => [p.id, p]));

export function getPreset(id) {
  return PRESETS_BY_ID[id] ?? null;
}

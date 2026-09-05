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
      ctx.fillRect(-p.r * 0.4, -p.r * 1.3, p.r * 0.8, p.r * 2.6);
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

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      if (p.life <= 0 || p.y - p.r > window.innerHeight + 80) particles.splice(i, 1);
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
    particles = preset
      .emit({ width: window.innerWidth, height: window.innerHeight })
      .slice(0, MAX_PARTICLES);

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
    duration: 3600,
    overlay: null,
    emit({ width, height }) {
      const out = [];
      // Three bursts fired in sequence from the upper half.
      for (let i = 0; i < 3; i++) {
        out.push(...burst(
          rand(width * 0.2, width * 0.8),
          rand(height * 0.18, height * 0.45),
          58, PARTY,
          { delay: i * 26, decay: 0.012 }));
      }
      return out;
    },
  },
  {
    id: "cannons",
    label: "Confetti cannons",
    kind: "win",
    duration: 3200,
    overlay: null,
    emit({ width, height }) {
      const out = [];
      for (const [x, dir] of [[0, 1], [width, -1]]) {
        for (let i = 0; i < 55; i++) {
          const speed = rand(9, 17);
          const angle = rand(-1.15, -0.55); // up and inward
          out.push(makeParticle({
            x, y: height,
            vx: Math.cos(angle) * speed * dir,
            vy: Math.sin(angle) * speed,
            r: radius(),
            color: pick(PARTY),
            shape: "ribbon",
            spin: rand(-0.3, 0.3),
            decay: 0.008,
            gravity: 0.26,
            drag: 0.988,
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
    duration: 3000,
    overlay: null,
    emit({ width, height }) {
      // One large radial out of where the answer sits.
      return burst(width / 2, height * 0.5, 140, PARTY,
        { minSpeed: 5, maxSpeed: 15, gravity: 0.14, decay: 0.011, lift: 0 });
    },
  },
  {
    id: "goldenrain",
    label: "Golden rain",
    kind: "win",
    duration: 3800,
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
          decay: 0.005,
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
    duration: 2800,
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
            decay: 0.014,
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
    duration: 4000,
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
          decay: 0.004,
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
    duration: 3000,
    overlay: null,
    emit({ width, height }) {
      return burst(width / 2, height * 0.5, 90, GREY, {
        minSpeed: 3, maxSpeed: 10, gravity: 0.42, decay: 0.010,
        shape: "shard", lift: 1,
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
    id: "downpour",
    label: "Downpour",
    kind: "lose",
    duration: 3200,
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
          decay: 0.008,
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

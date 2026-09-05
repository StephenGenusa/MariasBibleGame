// Canvas particle engine. Knows how a particle moves; knows nothing about
// what fireworks look like. Presets supply that.

// The compression budget from spec section 2. Fine, fast particles turn to grey
// mush through Google Meet's encoder, so these bounds are load-bearing, not taste.
export const MIN_RADIUS = 6;
export const MAX_RADIUS = 14;
export const MAX_PARTICLES = 250;
export const MIN_DURATION = 2500;
export const MAX_DURATION = 4000;

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

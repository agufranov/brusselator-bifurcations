import { Chart, fmt } from '../chart';
import { divergingLut, theme } from '../colors';
import { turingTheory } from '../model';
import { RDSim } from '../rdsim';
import { state, subscribe } from '../store';
import { card, note } from '../ui';

const N = 80;

export function initSimulation(host: HTMLElement) {
  const grid = document.createElement('div');
  grid.className = 'grid2 sim-grid';
  host.append(grid);

  const b1 = card(
    grid,
    'Поле $u(x,y,t)$',
    'Прямое интегрирование (30)–(31) на квадрате $[0,L\\pi]^2$ из малого шума. При $L=1$ — область статьи; при больших $L$ мод становится больше и узоры богаче. Синий — $u<0$, красный — $u>0$.',
  );
  const bar = document.createElement('div');
  bar.className = 'sim-bar';
  const play = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Пауза' });
  const reset = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Новый шум' });
  const Lwrap = document.createElement('label');
  Lwrap.className = 'ctl small';
  const Lname = Object.assign(document.createElement('span'), { className: 'ctl-name', textContent: 'L' });
  const Lin = Object.assign(document.createElement('input'), { type: 'range', min: '1', max: '8', step: '1', value: '1' });
  const Lval = Object.assign(document.createElement('span'), { className: 'ctl-val', textContent: '1' });
  Lwrap.append(Lname, Lin, Lval);
  const Swrap = document.createElement('label');
  Swrap.className = 'ctl small';
  const Sname = Object.assign(document.createElement('span'), { className: 'ctl-name', textContent: 'скорость' });
  const Sin = Object.assign(document.createElement('input'), { type: 'range', min: '1', max: '150', step: '1', value: '30' });
  Swrap.append(Sname, Sin);
  bar.append(play, reset, Lwrap, Swrap);
  b1.append(bar);

  const field = document.createElement('div');
  field.className = 'field';
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'Поле u(x, y)');
  const readout = document.createElement('div');
  readout.className = 'readout';
  field.append(cv, readout);
  b1.append(field);

  const b2 = card(
    grid,
    'Рост амплитуды во времени',
    'При $L=1$ показан коэффициент при $\\cos x\\cos y$, к нему относится теорема 6. Пунктир — предсказание формулы (20) для текущего $\\mu$. При $L>1$ показан $\\max|u|$.',
  );
  const ch = new Chart(b2, { height: 300, label: 'Амплитуда во времени' });
  const hint = note(b2, '');

  const sim = new RDSim(N);
  let L = 1;
  sim.reset(L);
  let running = true;
  const hist: { t: number; a: number }[] = [];
  const g = cv.getContext('2d')!;
  const img = g.createImageData(N, N);

  const paint = () => {
    const lut = divergingLut();
    const m = Math.max(sim.maxAbs(), 1e-6);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const v = sim.u[j * N + i] / m;
        const li = Math.round((v * 0.5 + 0.5) * 511) * 3;
        const o = ((N - 1 - j) * N + i) * 4; // y up
        img.data[o] = lut[li];
        img.data[o + 1] = lut[li + 1];
        img.data[o + 2] = lut[li + 2];
        img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const a = L === 1 ? sim.modeAmp() : sim.maxAbs();
    readout.textContent = `t = ${sim.t.toFixed(1)}   ${L === 1 ? 'A' : 'max|u|'} = ${fmt(Math.abs(a), 4)}   шкала ±${fmt(m, 3)}`;
  };

  const predicted = () => {
    const th = turingTheory(state);
    return state.mu > th.mu0 ? Math.sqrt((state.mu - th.mu0) / th.c) : 0;
  };

  ch.draw = () => {
    const t = theme();
    const tMax = Math.max(50, hist.length ? hist[hist.length - 1].t : 0);
    const pred = L === 1 ? predicted() : 0;
    const yMax = Math.max(0.05, pred, ...hist.map((h) => h.a)) * 1.15;
    ch.frame([0, tMax], [0, yMax], { xLabel: 't', yLabel: L === 1 ? '|A(t)|' : 'max |u|' });
    ch.clip(() => {
      if (pred > 0) ch.hline(pred, t.s1, 2, [6, 5]);
      ch.path(
        hist.map((h) => h.t),
        hist.map((h) => h.a),
        t.s3,
        2,
      );
    });
    if (pred > 0) ch.text(`формула (20): ${fmt(pred, 3)}`, ch.W - ch.m.r - 6, ch.y(pred) - 10, { align: 'right' });
  };
  ch.hover = (px, py) => {
    if (!ch.inPlot(px, py) || !hist.length) return null;
    const tt = ch.x.inv(px);
    const h = hist.reduce((a, q) => (Math.abs(q.t - tt) < Math.abs(a.t - tt) ? q : a));
    return {
      title: `t = ${h.t.toFixed(1)}`,
      crossX: ch.x(h.t),
      at: [ch.x(h.t), ch.y(h.a)],
      rows: [{ color: theme().s3, value: fmt(h.a, 4), label: L === 1 ? '|A|' : 'max|u|' }],
    };
  };

  const updHint = () => {
    const th = turingTheory(state);
    hint.textContent =
      state.mu > state.a2 + 1
        ? 'μ > a² + 1: однородная мода неустойчива, ожидаются колебания всей области (при d₁ ≥ d₂ — синхронные, §6.2).'
        : state.mu > th.mu0
          ? `μ > μ₀ = ${fmt(th.mu0, 4)}: растёт мода Тьюринга.`
          : `μ < μ₀ = ${fmt(th.mu0, 4)}: возмущения затухают.`;
  };

  const restart = () => {
    sim.reset(L);
    hist.length = 0;
    paint();
    ch.render();
  };

  play.addEventListener('click', () => {
    running = !running;
    play.textContent = running ? 'Пауза' : 'Пуск';
    if (running) loop();
  });
  reset.addEventListener('click', restart);
  Lin.addEventListener('input', () => {
    L = +Lin.value;
    Lval.textContent = Lin.value;
    restart();
  });

  let visible = true;
  new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    if (visible && running) loop();
  }).observe(field);

  let raf = 0;
  const loop = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!running || !visible) return;
      sim.step(state, +Sin.value);
      if (!isFinite(sim.u[0])) restart();
      else if (sim.maxAbs() < 1e-9) sim.kick(1e-6);
      const a = L === 1 ? Math.abs(sim.modeAmp()) : sim.maxAbs();
      hist.push({ t: sim.t, a });
      if (hist.length > 4000) hist.splice(0, hist.length - 4000);
      paint();
      ch.render();
      loop();
    });
  };

  subscribe(() => {
    updHint();
    ch.render();
  });
  updHint();
  paint();
  loop();
}

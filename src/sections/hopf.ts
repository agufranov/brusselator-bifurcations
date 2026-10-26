import { Chart, fmt, legend } from '../chart';
import { theme } from '../colors';
import { hopfBranch, rhs, trajectory, type Cycle } from '../hopf';
import { debounce, state, subscribe } from '../store';
import { card } from '../ui';

const SPAN = 0.3;

export function initHopf(host: HTMLElement) {
  const grid = document.createElement('div');
  grid.className = 'grid2';
  host.append(grid);

  // ---- phase plane ----
  const b1 = card(
    grid,
    'Фазовая плоскость однородной моды $k=l=0$',
    'Система (30) без диффузии: $\\dot w=A(\\mu)w+h(w)$. Траектория выходит из выбранной точки (щелчок по графику). При $\\mu>a^2+1$ она наматывается на предельный цикл, при $\\mu<a^2+1$ скручивается к нулю.',
  );
  legend(b1, [
    { label: 'траектория', color: 'var(--series-1)', shape: 'line' },
    { label: 'начальная точка', color: 'var(--series-2)', shape: 'dot' },
    { label: 'поле направлений', color: 'var(--text-muted)', shape: 'line' },
  ]);
  const c1 = new Chart(b1, { square: true, label: 'Фазовая плоскость (u, v)' });
  let start: [number, number] = [0.05, 0];
  let tr: Float64Array<ArrayBufferLike> = new Float64Array();
  let lim = 1;

  const recomputeTraj = () => {
    tr = trajectory(state, start[0], start[1], 160, 0.01, 20);
    let m = Math.max(Math.abs(start[0]), Math.abs(start[1]));
    for (let i = 0; i < tr.length; i++) if (isFinite(tr[i])) m = Math.max(m, Math.abs(tr[i]));
    lim = Math.min(Math.max(0.3, m * 1.15), 6);
  };

  c1.draw = () => {
    const t = theme();
    const side = Math.min(c1.W - c1.m.l - c1.m.r, c1.H - c1.m.t - c1.m.b);
    c1.m.r = c1.W - c1.m.l - side;
    c1.frame([-lim, lim], [-lim, lim], { xLabel: 'u', yLabel: 'v' });
    const ctx = c1.ctx;
    c1.clip(() => {
      // direction field: short unit segments
      const n = 15;
      const step = (2 * lim) / n;
      ctx.save();
      ctx.strokeStyle = t.muted;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const u = -lim + (i + 0.5) * step;
          const v = -lim + (j + 0.5) * step;
          const [du, dv] = rhs(state, u, v);
          const X = c1.x(u);
          const Y = c1.y(v);
          const sx = c1.x(u + du) - X;
          const sy = c1.y(v + dv) - Y;
          const len = Math.hypot(sx, sy) || 1;
          const L = (c1.x(step) - c1.x(0)) * 0.38;
          ctx.moveTo(X - (sx / len) * L, Y - (sy / len) * L);
          ctx.lineTo(X + (sx / len) * L, Y + (sy / len) * L);
          ctx.arc(X + (sx / len) * L, Y + (sy / len) * L, 1, 0, 2 * Math.PI);
        }
      ctx.stroke();
      ctx.restore();
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < tr.length; i += 2) {
        xs.push(tr[i]);
        ys.push(tr[i + 1]);
      }
      c1.path(xs, ys, t.s1, 1.5);
      c1.dot(start[0], start[1], t.s2, 4);
      c1.dot(0, 0, t.ink2, 3);
    });
  };
  c1.click = (px, py) => {
    if (!c1.inPlot(px, py)) return;
    start = [c1.x.inv(px), c1.y.inv(py)];
    recomputeTraj();
    c1.render();
  };
  c1.hover = (px, py) => {
    if (!c1.inPlot(px, py)) return null;
    return {
      rows: [
        { value: `(${fmt(c1.x.inv(px), 3)}, ${fmt(c1.y.inv(py), 3)})`, label: '(u, v)' },
        { value: 'щелчок — новая начальная точка', label: '' },
      ],
    };
  };

  // ---- amplitude vs μ ----
  const b2 = card(
    grid,
    'Амплитуда цикла и период',
    'Численно: полуразмах $u$ на установившемся цикле. Пунктир — подгонка $C\\sqrt{\\mu-\\mu_0}$ по ближайшей к $\\mu_0$ точке. Теоретической кривой здесь нет: коэффициенты $\\mu_2, T_2$ теоремы 8 вычисляются по схеме работы [17].',
  );
  legend(b2, [
    { label: 'амплитуда, численно', color: 'var(--series-3)', shape: 'dot' },
    { label: 'C·√(μ − μ₀)', color: 'var(--series-1)', shape: 'dash' },
  ]);
  const c2 = new Chart(b2, { height: 300, label: 'Амплитуда цикла Андронова–Хопфа' });
  let cycles: Cycle[] = [];
  let Cfit = NaN;
  const mu0 = () => state.a2 + 1;
  c2.draw = () => {
    const t = theme();
    const m0 = mu0();
    const yMax = Math.max(0.2, ...cycles.map((c) => c.amp)) * 1.15;
    c2.frame([m0 - 0.06, m0 + SPAN], [-0.02 * yMax, yMax], { xLabel: 'μ', yLabel: 'амплитуда u' });
    c2.clip(() => {
      c2.seg(c2.x(m0 - 0.06), c2.y(0), c2.x(m0), c2.y(0), t.ink2, 2);
      c2.seg(c2.x(m0), c2.y(0), c2.x(m0 + SPAN), c2.y(0), t.ink2, 2, [6, 5]);
      if (isFinite(Cfit)) c2.fn((mu) => (mu < m0 ? NaN : Cfit * Math.sqrt(mu - m0)), t.s1, 2, [6, 5], m0, m0 + SPAN);
      for (const c of cycles) c2.dot(c.mu, c.amp, t.s3, 4);
      c2.vline(c2.x(state.mu), t.axis, 1);
    });
    c2.text(`μ₀ = a²+1 = ${fmt(m0, 4)}`, c2.x(m0) + 4, c2.y(0) - 12);
    if (isFinite(Cfit)) c2.text(`C ≈ ${fmt(Cfit, 4)}`, c2.W - c2.m.r - 6, c2.m.t + 12, { align: 'right' });
  };
  c2.hover = (px, py) => {
    if (!c2.inPlot(px, py) || !cycles.length) return null;
    const c = cycles.reduce((a, q) => (Math.abs(c2.x(q.mu) - px) < Math.abs(c2.x(a.mu) - px) ? q : a));
    return {
      title: `μ = ${fmt(c.mu, 4)}`,
      crossX: c2.x(c.mu),
      at: [c2.x(c.mu), c2.y(c.amp)],
      rows: [
        { color: theme().s3, shape: 'dot', value: fmt(c.amp, 4), label: 'амплитуда u' },
        { value: fmt(c.period, 4), label: `период (T₀ = 2π/a = ${fmt((2 * Math.PI) / Math.sqrt(state.a2), 4)})` },
      ],
    };
  };

  let key = '';
  const recomputeBranch = () => {
    if (key === String(state.a2)) return;
    key = String(state.a2);
    const m0 = mu0();
    const mus: number[] = [];
    for (let i = 1; i <= 14; i++) mus.push(m0 + SPAN * (i / 14) ** 1.5);
    cycles = hopfBranch(state, mus);
    const c0 = cycles[0];
    Cfit = c0 && c0.amp > 1e-4 ? c0.amp / Math.sqrt(c0.mu - m0) : NaN;
    c2.render();
  };
  const later = debounce(recomputeBranch, 250);

  recomputeTraj();
  recomputeBranch();
  subscribe(() => {
    recomputeTraj();
    c1.render();
    c2.render();
    later();
  });
}

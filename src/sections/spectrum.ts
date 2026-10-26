import { Chart, fmt, legend } from '../chart';
import { divColor, onThemeChange, theme } from '../colors';
import { Bmat, eig2, fmtModes, maxRe, modesOf, muHopf, muTuring, rhoSet, type RhoInfo } from '../model';
import { state, subscribe } from '../store';
import { card } from '../ui';

const RHO_MAX = 20;

function lambdaStr(rho: number): string {
  const [l1, l2] = eig2(Bmat(state, rho));
  if (l1.im === 0) return `${fmt(l1.re)}, ${fmt(l2.re)}`;
  return `${fmt(l1.re)} ± ${fmt(Math.abs(l1.im))}i`;
}

function nearestRho(set: RhoInfo[], x: number): RhoInfo {
  return set.reduce((a, b) => (Math.abs(b.rho - x) < Math.abs(a.rho - x) ? b : a));
}

export function initSpectrum(host: HTMLElement) {
  const set = rhoSet(RHO_MAX);
  const grid = document.createElement('div');
  grid.className = 'grid2';
  host.append(grid);

  // ---- 1. Dispersion: max Re λ(B_ρ) ----
  const b1 = card(
    grid,
    'Дисперсионная кривая $\\max\\operatorname{Re}\\lambda(B_\\rho)$',
    'Теоремы 2–3: спектр оператора $A+D\\Delta$ — это собственные значения матриц $B_\\rho=A-\\rho D$ по всем $\\rho\\in Z_0$. Кривая — непрерывное $\\rho$, точки — реальные моды квадрата.',
  );
  legend(b1, [
    { label: 'max Re λ(ρ)', color: 'var(--series-1)', shape: 'line' },
    { label: 'ρ ∈ Z₁ (одна мода)', color: 'var(--series-1)', shape: 'dot' },
    { label: 'ρ ∈ Z₂ (кратная)', color: 'var(--series-1)', shape: 'ring' },
  ]);
  const c1 = new Chart(b1, { height: 300, label: 'Дисперсионная кривая' });
  c1.draw = () => {
    const t = theme();
    let lo = 0;
    let hi = 0;
    for (let r = 0; r <= RHO_MAX; r += 0.05) {
      const v = maxRe(state, r);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const yMax = Math.max(0.3, hi * 1.25);
    const yMin = Math.max(lo, -3);
    c1.frame([0, RHO_MAX], [yMin, yMax], { xLabel: 'ρ = k² + l²', yLabel: 'max Re λ' });
    c1.clip(() => {
      c1.ctx.fillStyle = t.wash;
      c1.ctx.fillRect(c1.m.l, c1.y(yMax), c1.plotW, c1.y(0) - c1.y(yMax));
      c1.hline(0, t.ink2, 1);
      c1.fn((r) => maxRe(state, r), t.s1, 2);
      for (const s of set) c1.dot(s.rho, maxRe(state, s.rho), t.s1, 4, !s.simple);
    });
    c1.text('неустойчиво', c1.W - c1.m.r - 6, c1.y(yMax) + 10, { align: 'right', color: t.muted });
  };
  c1.hover = (px, py) => {
    if (!c1.inPlot(px, py)) return null;
    const s = nearestRho(set, c1.x.inv(px));
    const v = maxRe(state, s.rho);
    return {
      title: `ρ = ${s.rho}: ${fmtModes(s.modes)}`,
      at: [c1.x(s.rho), c1.y(v)],
      crossX: c1.x(s.rho),
      rows: [
        { color: theme().s1, shape: s.simple ? 'dot' : 'ring', value: fmt(v, 4), label: 'max Re λ' },
        { value: lambdaStr(s.rho), label: 'собств. значения B_ρ' },
        { value: s.simple ? 'Z₁' : `Z₂, кратность ×${s.modes.length}`, label: '' },
      ],
    };
  };

  // ---- 2. Neutral curves μ_T(ρ), μ_H(ρ) ----
  const b2 = card(
    grid,
    'Нейтральные кривые на плоскости $(\\rho,\\mu)$',
    '$\\mu_T(\\rho)$: $\\det B_\\rho=0$ (переход через $\\lambda=0$); $\\mu_H(\\rho)$: $\\operatorname{tr}B_\\rho=0$ (переход через $\\pm i\\omega$). Равновесие устойчиво, пока горизонталь $\\mu$ ниже обеих кривых во всех точках $Z_0$.',
  );
  legend(b2, [
    { label: 'μ_T(ρ), Тьюринг', color: 'var(--series-1)', shape: 'line' },
    { label: 'μ_H(ρ), Хопф', color: 'var(--series-2)', shape: 'line' },
    { label: 'текущее μ', color: 'var(--text-secondary)', shape: 'line' },
  ]);
  const c2 = new Chart(b2, { height: 300, label: 'Нейтральные кривые' });
  const yTop = () => Math.max(muHopf(state, 0) + 1.2, state.mu + 0.6, 4);
  c2.draw = () => {
    const t = theme();
    const top = yTop();
    c2.frame([0, RHO_MAX], [0, top], { xLabel: 'ρ = k² + l²', yLabel: 'μ' });
    c2.clip(() => {
      // unstable region: above min(μ_T, μ_H)
      const ctx = c2.ctx;
      ctx.beginPath();
      ctx.moveTo(c2.x(0), c2.y(top));
      for (let i = 0; i <= 400; i++) {
        const r = (RHO_MAX * i) / 400;
        ctx.lineTo(c2.x(r), c2.y(Math.min(muTuring(state, r), muHopf(state, r), top)));
      }
      ctx.lineTo(c2.x(RHO_MAX), c2.y(top));
      ctx.closePath();
      ctx.fillStyle = t.wash;
      ctx.fill();
      c2.fn((r) => muHopf(state, r), t.s2, 2);
      c2.fn((r) => muTuring(state, r), t.s1, 2, [], 0.02, RHO_MAX);
      c2.hline(state.mu, t.ink2, 1);
      for (const s of set) if (s.rho > 0) c2.dot(s.rho, muTuring(state, s.rho), t.s1, 4, !s.simple);
      c2.dot(0, muHopf(state, 0), t.s2, 4);
    });
    c2.text(`μ = ${fmt(state.mu, 4)}`, c2.W - c2.m.r - 6, c2.y(state.mu) - 10, { align: 'right', color: t.ink2 });
  };
  c2.hover = (px, py) => {
    if (!c2.inPlot(px, py)) return null;
    const s = nearestRho(set, c2.x.inv(px));
    const t = theme();
    return {
      title: `ρ = ${s.rho}: ${fmtModes(s.modes)}`,
      crossX: c2.x(s.rho),
      at: [c2.x(s.rho), py],
      rows: [
        { color: t.s1, value: fmt(muTuring(state, s.rho), 4), label: 'μ_T' },
        { color: t.s2, value: fmt(muHopf(state, s.rho), 4), label: 'μ_H' },
      ],
    };
  };

  // ---- 3. Complex plane ----
  const b3 = card(
    grid,
    'Собственные значения $B_\\rho$ на комплексной плоскости',
    'Все $\\rho\\in Z_0$, $\\rho\\le 60$. Двигайте $\\mu$: при $\\mu_0=2$ (параметры статьи) вещественное собственное значение моды $\\rho=2$ проходит через 0, при $\\mu=a^2+1$ пара $\\pm ia$ моды $\\rho=0$ пересекает мнимую ось.',
  );
  legend(b3, [
    { label: 'Re λ < 0', color: 'var(--series-1)', shape: 'dot' },
    { label: 'Re λ ≥ 0', color: 'var(--series-2)', shape: 'dot' },
  ]);
  const c3 = new Chart(b3, { height: 300, label: 'Собственные значения на комплексной плоскости' });
  const big = rhoSet(60);
  type EP = { rho: number; re: number; im: number; modes: [number, number][] };
  let eps: EP[] = [];
  c3.draw = () => {
    const t = theme();
    eps = [];
    for (const s of big) for (const l of eig2(Bmat(state, s.rho))) eps.push({ rho: s.rho, re: l.re, im: l.im, modes: s.modes });
    const reMax = Math.max(0.6, ...eps.map((e) => e.re + 0.3));
    const imMax = Math.max(1.5, ...eps.map((e) => Math.abs(e.im) * 1.2));
    c3.frame([-5, reMax], [-imMax, imMax], { xLabel: 'Re λ', yLabel: 'Im λ' });
    c3.clip(() => {
      c3.ctx.fillStyle = t.wash;
      c3.ctx.fillRect(c3.x(0), c3.m.t, c3.W - c3.m.r - c3.x(0), c3.plotH);
      c3.vline(c3.x(0), t.ink2, 1);
      for (const e of eps) c3.dot(e.re, e.im, e.re >= 0 ? t.s2 : t.s1, 4);
    });
  };
  c3.hover = (px, py) => {
    if (!c3.inPlot(px, py) || !eps.length) return null;
    let best = eps[0];
    let bd = Infinity;
    for (const e of eps) {
      const d = Math.hypot(c3.x(e.re) - px, c3.y(e.im) - py);
      if (d < bd) [best, bd] = [e, d];
    }
    if (bd > 24) return null;
    const same = eps.filter((e) => Math.abs(e.re - best.re) < 1e-9 && Math.abs(e.im - best.im) < 1e-9);
    const t = theme();
    return {
      title: same.map((e) => `ρ = ${e.rho}`).join(', '),
      at: [c3.x(best.re), c3.y(best.im)],
      rows: [
        { color: best.re >= 0 ? t.s2 : t.s1, shape: 'dot', value: `${fmt(best.re, 4)} ${best.im < 0 ? '−' : '+'} ${fmt(Math.abs(best.im), 4)}i`, label: 'λ' },
        { value: same.map((e) => fmtModes(e.modes)).join(' '), label: 'моды (k,l)' },
      ],
    };
  };

  // ---- 4. Mode map (k, l) ----
  const K = 9;
  const b4 = card(
    grid,
    'Карта мод $(k,l)$: $\\max\\operatorname{Re}\\lambda(B_{k^2+l^2})$',
    'Каждая клетка — собственная функция $\\cos kx\\cos ly$. Цвет — устойчивость (шкала сжата: $v/(|v|+0.2)$). Точка в клетке — $\\rho\\in Z_1$, т.е. мода с данным $\\rho$ единственная (теорема 4).',
  );
  const scale = document.createElement('div');
  scale.className = 'colorbar';
  b4.append(scale);
  const c4 = new Chart(b4, { square: true, label: 'Карта мод (k, l)' });
  c4.m = { l: 44, r: 12, t: 8, b: 40 };
  c4.draw = () => {
    const t = theme();
    const side = Math.min(c4.W - c4.m.l - c4.m.r, c4.H - c4.m.t - c4.m.b);
    c4.m.r = c4.W - c4.m.l - side;
    c4.frame([-0.5, K + 0.5], [-0.5, K + 0.5], {
      xLabel: 'k',
      yLabel: 'l',
      xTicks: [...Array(K + 1).keys()],
      yTicks: [...Array(K + 1).keys()],
      grid: false,
    });
    const cw = c4.x(1) - c4.x(0);
    const ctx = c4.ctx;
    for (let k = 0; k <= K; k++)
      for (let l = 0; l <= K; l++) {
        const rho = k * k + l * l;
        const v = maxRe(state, rho);
        ctx.fillStyle = divColor(v / (Math.abs(v) + 0.2));
        ctx.fillRect(c4.x(k - 0.5) + 1, c4.y(l + 0.5) + 1, cw - 2, cw - 2);
        if (modesOf(rho).length === 1) {
          ctx.beginPath();
          ctx.arc(c4.x(k), c4.y(l), Math.max(2, cw * 0.08), 0, 2 * Math.PI);
          ctx.fillStyle = t.ink;
          ctx.fill();
        }
      }
  };
  c4.hover = (px, py) => {
    const k = Math.round(c4.x.inv(px));
    const l = Math.round(c4.y.inv(py));
    if (k < 0 || l < 0 || k > K || l > K) return null;
    const rho = k * k + l * l;
    const v = maxRe(state, rho);
    const modes = modesOf(rho);
    return {
      title: `cos ${k}x · cos ${l}y`,
      at: [c4.x(k), c4.y(l)],
      rows: [
        { color: divColor(v / (Math.abs(v) + 0.2)), shape: 'cell', value: fmt(v, 4), label: 'max Re λ' },
        { value: String(rho), label: 'ρ' },
        { value: modes.length === 1 ? 'Z₁' : `Z₂: ${fmtModes(modes)}`, label: '' },
      ],
    };
  };
  const drawScale = () => {
    scale.replaceChildren();
    const bar = document.createElement('div');
    bar.className = 'colorbar-bar';
    const stops: string[] = [];
    for (let i = 0; i <= 10; i++) stops.push(divColor(-1 + i / 5));
    bar.style.background = `linear-gradient(90deg, ${stops.join(',')})`;
    const labels = document.createElement('div');
    labels.className = 'colorbar-labels';
    for (const s of ['−∞ (устойчиво)', '−0.2', '0', '+0.2', '+∞']) {
      const sp = document.createElement('span');
      sp.textContent = s;
      labels.append(sp);
    }
    scale.append(bar, labels);
  };
  drawScale();
  onThemeChange(drawScale);

  subscribe(() => {
    c1.render();
    c2.render();
    c3.render();
    c4.render();
  });
}

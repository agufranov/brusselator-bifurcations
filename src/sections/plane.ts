import { Chart, fmt, legend } from '../chart';
import { divColor, divergingLut, theme } from '../colors';
import { maxRe, rhoSet } from '../model';
import { state, subscribe, update } from '../store';
import { card } from '../ui';

const D1: [number, number] = [0.02, 1.2];
const D2: [number, number] = [0.1, 8];
const RHOS = rhoSet(200).map((s) => s.rho);

function worst(d1: number, d2: number): { v: number; rho: number } {
  const p = { ...state, d1, d2 };
  let best = { v: -Infinity, rho: 0 };
  for (const rho of RHOS) {
    const v = maxRe(p, rho);
    if (v > best.v) best = { v, rho };
  }
  return best;
}

export function initPlane(host: HTMLElement) {
  const body = card(
    host,
    'Плоскость коэффициентов диффузии $(d_1, d_2)$ при текущих $\\mu$, $a^2$',
    'Цвет — наибольшее $\\operatorname{Re}\\lambda$ по всем модам квадрата ($\\rho\\le 200$). Линии — границы $\\det B_\\rho=0$ для отдельных $\\rho$; при $\\rho=2$ это условие (32) статьи. Щелчок по карте задаёт $d_1, d_2$.',
  );
  legend(body, [
    { label: 'устойчиво', color: 'var(--div-neg)', shape: 'cell' },
    { label: 'неустойчиво', color: 'var(--div-pos)', shape: 'cell' },
    { label: 'det B₂ = 0, условие (32)', color: 'var(--text-primary)', shape: 'line' },
    { label: 'det B_ρ = 0, ρ = 1, 4, 5, 8', color: 'var(--text-muted)', shape: 'line' },
    { label: 'текущие (d₁, d₂)', color: 'var(--series-7)', shape: 'dot' },
  ]);
  const c = new Chart(body, { height: 380, label: 'Карта устойчивости на плоскости (d1, d2)' });
  const off = document.createElement('canvas');
  let key = '';

  const paintHeat = () => {
    const k = `${state.mu}|${state.a2}|${c.plotW}|${c.plotH}|${theme().divMid}`;
    if (k === key) return;
    key = k;
    const nx = 140;
    const ny = 110;
    off.width = nx;
    off.height = ny;
    const g = off.getContext('2d')!;
    const img = g.createImageData(nx, ny);
    const lut = divergingLut();
    for (let j = 0; j < ny; j++) {
      const d2 = D2[1] - ((j + 0.5) / ny) * (D2[1] - D2[0]);
      for (let i = 0; i < nx; i++) {
        const d1 = D1[0] + ((i + 0.5) / nx) * (D1[1] - D1[0]);
        const v = worst(d1, d2).v;
        const x = v / (Math.abs(v) + 0.05);
        const li = Math.round((x * 0.5 + 0.5) * 511) * 3;
        const o = (j * nx + i) * 4;
        img.data[o] = lut[li];
        img.data[o + 1] = lut[li + 1];
        img.data[o + 2] = lut[li + 2];
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  };

  /** d2 on the curve det B_ρ = 0 as a function of d1 (from det = 0 solved for d2). */
  const boundary = (rho: number) => (d1: number) => {
    const a = state.mu - 1 - rho * d1;
    if (a <= 0) return NaN;
    return ((state.mu * state.a2) / a - state.a2) / rho;
  };

  c.draw = () => {
    const t = theme();
    c.frame(D1, D2, { xLabel: 'd₁', yLabel: 'd₂', grid: false });
    paintHeat();
    const ctx = c.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, c.m.l, c.m.t, c.plotW, c.plotH);
    ctx.restore();
    c.clip(() => {
      for (const rho of [1, 4, 5, 8]) c.fn(boundary(rho), t.muted, 1);
      c.fn(boundary(2), t.ink, 2);
      c.dot(state.d1, state.d2, t.s7, 5);
    });
    if (state.mu >= state.a2 + 1)
      c.text('μ ≥ a²+1: однородная мода неустойчива при любых d', c.m.l + 8, c.m.t + 12, { color: t.ink });
  };
  c.hover = (px, py) => {
    if (!c.inPlot(px, py)) return null;
    const d1 = c.x.inv(px);
    const d2 = c.y.inv(py);
    const w = worst(d1, d2);
    return {
      title: `d₁ = ${fmt(d1, 3)}, d₂ = ${fmt(d2, 3)}`,
      rows: [
        { color: divColor(w.v / (Math.abs(w.v) + 0.05)), shape: 'cell', value: fmt(w.v, 4), label: 'max Re λ' },
        { value: String(w.rho), label: 'самая неустойчивая ρ' },
      ],
    };
  };
  c.click = (px, py) => {
    if (!c.inPlot(px, py)) return;
    update({ d1: +c.x.inv(px).toFixed(3), d2: +c.y.inv(py).toFixed(3) });
  };
  subscribe(() => c.render());
}

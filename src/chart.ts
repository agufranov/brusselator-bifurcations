// Small canvas chart: scales, hairline grid, axes, marks and a DOM tooltip.

import { onThemeChange, theme } from './colors';

export interface Scale {
  (v: number): number;
  inv(px: number): number;
  d: [number, number];
}

export function linear(d0: number, d1: number, r0: number, r1: number): Scale {
  const k = (r1 - r0) / (d1 - d0 || 1);
  const f = ((v: number) => r0 + (v - d0) * k) as Scale;
  f.inv = (px) => d0 + (px - r0) / k;
  f.d = [d0, d1];
  return f;
}

export function niceStep(span: number, count: number): number {
  const raw = span / Math.max(count, 1);
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

export function ticks(a: number, b: number, count = 5): number[] {
  const step = niceStep(b - a, count);
  const out: number[] = [];
  for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

export function fmt(v: number, digits = 3): string {
  if (!isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  const s = a >= 1e4 || a < 1e-3 ? v.toExponential(2) : v.toPrecision(digits);
  return s.replace(/\.?0+(e|$)/, '$1').replace('-', '−');
}

function tickFmt(v: number, step: number): string {
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return v.toFixed(dec).replace('-', '−');
}

export interface TipRow {
  color?: string;
  shape?: 'line' | 'dot' | 'ring' | 'cell';
  value: string;
  label: string;
}

export interface Tip {
  title?: string;
  rows: TipRow[];
  /** pixel position the tooltip points at (defaults to the pointer) */
  at?: [number, number];
  /** vertical crosshair at this pixel x */
  crossX?: number;
}

export interface FrameOpts {
  xLabel?: string;
  yLabel?: string;
  xTicks?: number[];
  yTicks?: number[];
  xTickFmt?: (v: number) => string;
  grid?: boolean;
}

const all = new Set<Chart>();
onThemeChange(() => all.forEach((c) => c.render()));

export class Chart {
  readonly root: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private tipEl: HTMLDivElement;
  W = 0;
  H = 0;
  m = { l: 56, r: 16, t: 14, b: 44 };
  x: Scale = linear(0, 1, 0, 1);
  y: Scale = linear(0, 1, 0, 1);
  draw: () => void = () => {};
  hover: ((px: number, py: number) => Tip | null) | null = null;
  click: ((px: number, py: number) => void) | null = null;
  private pending = false;
  private overlay: Tip | null = null;

  constructor(
    host: HTMLElement,
    private opts: { height?: number; square?: boolean; label: string },
  ) {
    this.root = document.createElement('div');
    this.root.className = 'chart';
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', opts.label);
    this.canvas.tabIndex = 0;
    this.ctx = this.canvas.getContext('2d')!;
    this.tipEl = document.createElement('div');
    this.tipEl.className = 'tip';
    this.tipEl.hidden = true;
    this.root.append(this.canvas, this.tipEl);
    host.append(this.root);
    new ResizeObserver(() => this.resize()).observe(this.root);
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerleave', () => this.hideTip());
    this.canvas.addEventListener('click', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.click?.(e.clientX - r.left, e.clientY - r.top);
    });
    all.add(this);
  }

  private resize() {
    const w = this.root.clientWidth;
    if (!w) return;
    const h = this.opts.square ? Math.min(w, 560) : (this.opts.height ?? 300);
    const dpr = window.devicePixelRatio || 1;
    this.W = w;
    this.H = h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  render() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.renderNow();
    });
  }

  renderNow() {
    if (!this.W) return;
    this.ctx.clearRect(0, 0, this.W, this.H);
    this.draw();
    if (this.overlay?.crossX != null) {
      const t = theme();
      this.vline(this.overlay.crossX, t.axis, 1);
    }
  }

  get plotW() {
    return this.W - this.m.l - this.m.r;
  }
  get plotH() {
    return this.H - this.m.t - this.m.b;
  }

  /** Set scales and draw grid + axes. */
  frame(xd: [number, number], yd: [number, number], o: FrameOpts = {}) {
    const { ctx, m } = this;
    const t = theme();
    this.x = linear(xd[0], xd[1], m.l, this.W - m.r);
    this.y = linear(yd[0], yd[1], this.H - m.b, m.t);
    const xt = o.xTicks ?? ticks(xd[0], xd[1], Math.max(2, Math.floor(this.plotW / 80)));
    const yt = o.yTicks ?? ticks(yd[0], yd[1], Math.max(2, Math.floor(this.plotH / 50)));
    const xs = xt.length > 1 ? xt[1] - xt[0] : 1;
    const ys = yt.length > 1 ? yt[1] - yt[0] : 1;
    ctx.save();
    ctx.lineWidth = 1;
    if (o.grid !== false) {
      ctx.strokeStyle = t.grid;
      ctx.beginPath();
      for (const v of yt) {
        const py = Math.round(this.y(v)) + 0.5;
        ctx.moveTo(m.l, py);
        ctx.lineTo(this.W - m.r, py);
      }
      for (const v of xt) {
        const px = Math.round(this.x(v)) + 0.5;
        ctx.moveTo(px, m.t);
        ctx.lineTo(px, this.H - m.b);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = t.axis;
    ctx.beginPath();
    ctx.moveTo(m.l + 0.5, m.t);
    ctx.lineTo(m.l + 0.5, this.H - m.b + 0.5);
    ctx.lineTo(this.W - m.r, this.H - m.b + 0.5);
    ctx.stroke();
    ctx.fillStyle = t.muted;
    ctx.font = '12px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const v of xt) ctx.fillText(o.xTickFmt ? o.xTickFmt(v) : tickFmt(v, xs), this.x(v), this.H - m.b + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of yt) ctx.fillText(tickFmt(v, ys), m.l - 6, this.y(v));
    ctx.fillStyle = t.ink2;
    ctx.font = '13px system-ui, -apple-system, "Segoe UI", sans-serif';
    if (o.xLabel) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(o.xLabel, m.l + this.plotW / 2, this.H - 4);
    }
    if (o.yLabel && o.yLabel.length <= 2) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.yLabel, 14, m.t + this.plotH / 2);
    } else if (o.yLabel) {
      ctx.save();
      ctx.translate(14, m.t + this.plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.yLabel, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  clip(f: () => void) {
    const { ctx, m } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.l, m.t, this.plotW, this.plotH);
    ctx.clip();
    f();
    ctx.restore();
  }

  path(xs: ArrayLike<number>, ys: ArrayLike<number>, color: string, width = 2, dash: number[] = []) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash(dash);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < xs.length; i++) {
      const X = this.x(xs[i]);
      const Y = this.y(ys[i]);
      if (!isFinite(X) || !isFinite(Y) || Math.abs(Y) > 1e5) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(X, Y);
      else ctx.moveTo(X, Y);
      pen = true;
    }
    ctx.stroke();
    ctx.restore();
  }

  fn(f: (x: number) => number, color: string, width = 2, dash: number[] = [], x0 = this.x.d[0], x1 = this.x.d[1]) {
    const N = Math.max(2, Math.round(this.plotW));
    const xs = new Float64Array(N + 1);
    const ys = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) {
      xs[i] = x0 + ((x1 - x0) * i) / N;
      ys[i] = f(xs[i]);
    }
    this.path(xs, ys, color, width, dash);
  }

  dot(x: number, y: number, color: string, r = 4, hollow = false) {
    const { ctx } = this;
    const t = theme();
    const X = this.x(x);
    const Y = this.y(y);
    ctx.beginPath();
    ctx.arc(X, Y, r + 2, 0, 2 * Math.PI);
    ctx.fillStyle = t.surface;
    ctx.fill();
    ctx.beginPath();
    if (hollow) {
      ctx.arc(X, Y, r - 1, 0, 2 * Math.PI);
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
    } else {
      ctx.arc(X, Y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  hline(v: number, color: string, width = 1, dash: number[] = []) {
    const Y = Math.round(this.y(v)) + 0.5;
    this.seg(this.m.l, Y, this.W - this.m.r, Y, color, width, dash);
  }

  vline(px: number, color: string, width = 1, dash: number[] = []) {
    const X = Math.round(px) + 0.5;
    this.seg(X, this.m.t, X, this.H - this.m.b, color, width, dash);
  }

  seg(x0: number, y0: number, x1: number, y1: number, color: string, width = 1, dash: number[] = []) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  text(s: string, px: number, py: number, o: { align?: CanvasTextAlign; base?: CanvasTextBaseline; color?: string; size?: number; halo?: boolean } = {}) {
    const { ctx } = this;
    const t = theme();
    ctx.save();
    ctx.font = `${o.size ?? 12}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = o.base ?? 'middle';
    if (o.halo !== false) {
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = t.surface;
      ctx.strokeText(s, px, py);
    }
    ctx.fillStyle = o.color ?? t.ink2;
    ctx.fillText(s, px, py);
    ctx.restore();
  }

  inPlot(px: number, py: number) {
    return px >= this.m.l && px <= this.W - this.m.r && py >= this.m.t && py <= this.H - this.m.b;
  }

  private onMove(e: PointerEvent) {
    if (!this.hover) return;
    const r = this.canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const tip = this.hover(px, py);
    if (!tip) return this.hideTip();
    this.showTip(tip, px, py);
  }

  private hideTip() {
    this.tipEl.hidden = true;
    if (this.overlay) {
      this.overlay = null;
      this.renderNow();
    }
  }

  private showTip(tip: Tip, px: number, py: number) {
    const el = this.tipEl;
    el.replaceChildren();
    if (tip.title) {
      const h = document.createElement('div');
      h.className = 'tip-title';
      h.textContent = tip.title;
      el.append(h);
    }
    for (const row of tip.rows) {
      const r = document.createElement('div');
      r.className = 'tip-row';
      const key = document.createElement('span');
      key.className = `key key-${row.shape ?? 'line'}`;
      if (row.color) key.style.setProperty('--c', row.color);
      else key.style.visibility = 'hidden';
      const v = document.createElement('b');
      v.textContent = row.value;
      const l = document.createElement('span');
      l.className = 'tip-label';
      l.textContent = row.label;
      r.append(key, v, l);
      el.append(r);
    }
    el.hidden = false;
    const [ax, ay] = tip.at ?? [px, py];
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = ax + 14;
    if (left + w > this.W) left = ax - 14 - w;
    let top = ay - h - 10;
    if (top < 0) top = ay + 14;
    el.style.left = `${Math.max(0, left)}px`;
    el.style.top = `${top}px`;
    const prev = this.overlay?.crossX;
    this.overlay = tip;
    if (prev !== tip.crossX) this.renderNow();
  }
}

/** Legend row (HTML) placed above a chart. */
export function legend(host: HTMLElement, items: { label: string; color: string; shape: 'line' | 'dot' | 'ring' | 'dash' | 'cell' }[]) {
  const el = document.createElement('div');
  el.className = 'legend';
  for (const it of items) {
    const s = document.createElement('span');
    s.className = 'legend-item';
    const k = document.createElement('span');
    k.className = `key key-${it.shape}`;
    k.style.setProperty('--c', it.color);
    const l = document.createElement('span');
    l.textContent = it.label;
    s.append(k, l);
    el.append(s);
  }
  host.append(el);
  return el;
}

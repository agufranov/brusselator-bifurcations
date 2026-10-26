// Direct simulation of (30)–(31) on [0, Lπ]² (L = 1 is the paper's square).
// Cell-centred grid, Neumann via mirrored ghost cells; reaction by Heun, diffusion by
// Peaceman–Rachford ADI (unconditionally stable, so dt is set by the kinetics), Strang-split.

import type { Params } from './model';

/** Pre-factored Thomas solver for (I − r·D2) with the 1D Neumann Laplacian D2. */
class Tridiag {
  private cp: Float64Array;
  private den: Float64Array;
  constructor(
    private N: number,
    private s: number, // r / h²
  ) {
    this.cp = new Float64Array(N);
    this.den = new Float64Array(N);
    const diag = (i: number) => 1 + (i === 0 || i === N - 1 ? 1 : 2) * s;
    let prev = 0;
    for (let i = 0; i < N; i++) {
      const d = diag(i) - (i > 0 ? -s * prev : 0);
      this.den[i] = d;
      prev = i < N - 1 ? -s / d : 0;
      this.cp[i] = prev;
    }
  }
  /** Solve in place along a strided line. */
  solve(x: Float64Array, off: number, stride: number) {
    const { N, s, cp, den } = this;
    x[off] /= den[0];
    for (let i = 1; i < N; i++) x[off + i * stride] = (x[off + i * stride] + s * x[off + (i - 1) * stride]) / den[i];
    for (let i = N - 2; i >= 0; i--) x[off + i * stride] -= cp[i] * x[off + (i + 1) * stride];
  }
}

export class RDSim {
  u: Float64Array;
  v: Float64Array;
  t = 0;
  L = 1;
  dt = 0.02;
  private w: Float64Array;
  private ku: Float64Array;
  private kv: Float64Array;
  private cache = new Map<string, Tridiag>();

  constructor(public N: number) {
    const S = N * N;
    this.u = new Float64Array(S);
    this.v = new Float64Array(S);
    this.w = new Float64Array(S);
    this.ku = new Float64Array(S);
    this.kv = new Float64Array(S);
  }

  get h() {
    return (this.L * Math.PI) / this.N;
  }

  reset(L: number, amp = 0.02, seed = Date.now()) {
    this.L = L;
    this.t = 0;
    let s = seed >>> 0 || 1;
    const rnd = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) / 4294967296) * 2 - 1;
    };
    for (let i = 0; i < this.u.length; i++) {
      this.u[i] = amp * rnd();
      this.v[i] = amp * rnd();
    }
  }

  /** Add small noise without restarting time (a "noise floor" so a decayed field can grow again). */
  kick(amp: number) {
    for (let i = 0; i < this.u.length; i++) {
      this.u[i] += amp * (Math.random() * 2 - 1);
      this.v[i] += amp * (Math.random() * 2 - 1);
    }
  }

  private solver(d: number): Tridiag {
    const s = (d * this.dt) / 2 / (this.h * this.h);
    const key = `${this.N}:${s}`;
    let T = this.cache.get(key);
    if (!T) {
      if (this.cache.size > 8) this.cache.clear();
      T = new Tridiag(this.N, s);
      this.cache.set(key, T);
    }
    return T;
  }

  private react(p: Params, dt: number) {
    const { u, v, ku, kv } = this;
    const a = p.mu - 1;
    for (let i = 0; i < u.length; i++) {
      const U = u[i];
      const V = v[i];
      const n1 = U * U * V;
      const fu1 = a * U + p.a2 * V + n1;
      const fv1 = -p.mu * U - p.a2 * V - n1;
      const U2 = U + dt * fu1;
      const V2 = V + dt * fv1;
      const n2 = U2 * U2 * V2;
      ku[i] = U + (dt / 2) * (fu1 + a * U2 + p.a2 * V2 + n2);
      kv[i] = V + (dt / 2) * (fv1 - p.mu * U2 - p.a2 * V2 - n2);
    }
    u.set(ku);
    v.set(kv);
  }

  /** One PR-ADI step of x_t = d·Δx over dt. */
  private diffuse(x: Float64Array, d: number) {
    const N = this.N;
    const T = this.solver(d);
    const s = (d * this.dt) / 2 / (this.h * this.h);
    const w = this.w;
    // (I + r·Dyy) x  → w, then solve (I − r·Dxx) along x (rows: index = j*N + i, i along x)
    const lap = (src: Float64Array, idx: number, k: number, stride: number) => {
      const c = src[idx];
      const m = k > 0 ? src[idx - stride] : c;
      const pl = k < N - 1 ? src[idx + stride] : c;
      return m - 2 * c + pl;
    };
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        w[idx] = x[idx] + s * lap(x, idx, j, N);
      }
    for (let j = 0; j < N; j++) T.solve(w, j * N, 1);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        x[idx] = w[idx] + s * lap(w, idx, i, 1);
      }
    for (let i = 0; i < N; i++) T.solve(x, i, N);
  }

  /** Strang splitting: half reaction, full diffusion, half reaction (2nd order in dt). */
  step(p: Params, steps: number) {
    for (let k = 0; k < steps; k++) {
      this.react(p, this.dt / 2);
      this.diffuse(this.u, p.d1);
      this.diffuse(this.v, p.d2);
      this.react(p, this.dt / 2);
      this.t += this.dt;
    }
  }

  /** Coefficient of cos(x/L)cos(y/L) in u (for L = 1: of cos x cos y). */
  modeAmp(): number {
    const N = this.N;
    let s = 0;
    for (let j = 0; j < N; j++) {
      const cy = Math.cos(((j + 0.5) * Math.PI) / N);
      for (let i = 0; i < N; i++) s += this.u[j * N + i] * Math.cos(((i + 0.5) * Math.PI) / N) * cy;
    }
    return (4 * s) / (N * N);
  }

  maxAbs(): number {
    let m = 0;
    for (let i = 0; i < this.u.length; i++) m = Math.max(m, Math.abs(this.u[i]));
    return m;
  }

  mean(): number {
    let s = 0;
    for (let i = 0; i < this.u.length; i++) s += this.u[i];
    return s / this.u.length;
  }
}

// Spatially homogeneous mode k = l = 0: the ODE  w' = A(μ)w + h(w)  (system (30) without Δ).

import type { Params } from './model';

export function rhs(p: Params, u: number, v: number): [number, number] {
  const n = u * u * v;
  return [(p.mu - 1) * u + p.a2 * v + n, -p.mu * u - p.a2 * v - n];
}

function rk4(p: Params, u: number, v: number, dt: number): [number, number] {
  const [k1u, k1v] = rhs(p, u, v);
  const [k2u, k2v] = rhs(p, u + (dt / 2) * k1u, v + (dt / 2) * k1v);
  const [k3u, k3v] = rhs(p, u + (dt / 2) * k2u, v + (dt / 2) * k2v);
  const [k4u, k4v] = rhs(p, u + dt * k3u, v + dt * k3v);
  return [u + (dt / 6) * (k1u + 2 * k2u + 2 * k3u + k4u), v + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v)];
}

/** Trajectory as interleaved [u0, v0, u1, v1, ...]; stops early if it leaves |w| < limit. */
export function trajectory(p: Params, u0: number, v0: number, T: number, dt = 0.01, limit = 50): Float64Array {
  const steps = Math.round(T / dt);
  const out = new Float64Array(2 * (steps + 1));
  let u = u0;
  let v = v0;
  out[0] = u;
  out[1] = v;
  let i = 1;
  for (; i <= steps; i++) {
    [u, v] = rk4(p, u, v, dt);
    if (!(Math.abs(u) < limit && Math.abs(v) < limit)) break;
    out[2 * i] = u;
    out[2 * i + 1] = v;
  }
  return out.subarray(0, 2 * i);
}

export interface Cycle {
  mu: number;
  amp: number;
  period: number;
  state: [number, number];
}

/** Settle onto the attractor from `init`, then measure the half-swing of u and the period. */
export function settleCycle(p: Params, init: [number, number], Tsettle: number, dt = 0.01): Cycle {
  let [u, v] = init;
  for (let s = 0, S = Math.round(Tsettle / dt); s < S; s++) [u, v] = rk4(p, u, v, dt);
  let lo = Infinity;
  let hi = -Infinity;
  const ups: number[] = [];
  let prevU = u;
  for (let s = 0, S = Math.round(60 / dt); s < S; s++) {
    [u, v] = rk4(p, u, v, dt);
    lo = Math.min(lo, u);
    hi = Math.max(hi, u);
    if (prevU < 0 && u >= 0) ups.push((s + prevU / (prevU - u)) * dt);
    prevU = u;
  }
  const period = ups.length > 1 ? (ups[ups.length - 1] - ups[0]) / (ups.length - 1) : NaN;
  return { mu: p.mu, amp: (hi - lo) / 2, period, state: [u, v] };
}

/** Cycle amplitude for each μ > μ_H = a² + 1, continuing from the largest μ down. */
export function hopfBranch(p: Params, mus: number[]): Cycle[] {
  const sorted = [...mus].sort((a, b) => b - a);
  let state: [number, number] = [0.5, 0];
  const out: Cycle[] = [];
  for (const mu of sorted) {
    const c = settleCycle({ ...p, mu }, state, 600);
    out.push(c);
    if (c.amp > 1e-4) state = c.state;
  }
  return out.reverse();
}

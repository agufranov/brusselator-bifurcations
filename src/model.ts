// Brusselator-type system (30) from the paper, written as (13):
//   u_t = (μ−1)u + a²v + d1Δu + u²v
//   v_t = −μu − a²v + d2Δv − u²v
// on Ω = [0,π]² with Neumann conditions. Mode cos(kx)cos(ly) has ρ = k² + l²,
// and the linearization on it is B_kl = A(μ) − ρD (formula (17)).

export interface Params {
  a2: number;
  d1: number;
  d2: number;
  mu: number;
}

export const TURING_PRESET: Params = { a2: 2, d1: 0.25, d2: 3, mu: 2.05 };
export const HOPF_PRESET: Params = { a2: 2, d1: 1, d2: 1, mu: 3.05 };

export type M2 = [number, number, number, number]; // row-major 2×2

export interface Complex {
  re: number;
  im: number;
}

export function Bmat(p: Params, rho: number): M2 {
  return [p.mu - 1 - rho * p.d1, p.a2, -p.mu, -p.a2 - rho * p.d2];
}

export function eig2(m: M2): [Complex, Complex] {
  const h = (m[0] + m[3]) / 2;
  const det = m[0] * m[3] - m[1] * m[2];
  const disc = h * h - det;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    return [{ re: h + s, im: 0 }, { re: h - s, im: 0 }];
  }
  const s = Math.sqrt(-disc);
  return [{ re: h, im: s }, { re: h, im: -s }];
}

export function maxRe(p: Params, rho: number): number {
  const [l1, l2] = eig2(Bmat(p, rho));
  return Math.max(l1.re, l2.re);
}

/** μ at which det B_ρ(μ) = 0 (Turing-type crossing through λ = 0). */
export function muTuring(p: Params, rho: number): number {
  if (rho <= 0) return Infinity;
  return ((1 + rho * p.d1) * (p.a2 + rho * p.d2)) / (rho * p.d2);
}

/** μ at which tr B_ρ(μ) = 0 (crossing through ±iω when det > 0). */
export function muHopf(p: Params, rho: number): number {
  return 1 + p.a2 + rho * (p.d1 + p.d2);
}

/** All multi-indices (k, l), k, l ≥ 0, with k² + l² = ρ. */
export function modesOf(rho: number): [number, number][] {
  const out: [number, number][] = [];
  const K = Math.floor(Math.sqrt(rho));
  for (let k = 0; k <= K; k++) {
    const l2 = rho - k * k;
    const l = Math.round(Math.sqrt(l2));
    if (l * l === l2) out.push([k, l]);
  }
  return out;
}

export interface RhoInfo {
  rho: number;
  modes: [number, number][];
  /** ρ ∈ Z1: a single multi-index, so the eigenvalue keeps the multiplicity of B_kl. */
  simple: boolean;
}

/** The set Z0 (with Z1/Z2 split) up to rhoMax. */
export function rhoSet(rhoMax: number): RhoInfo[] {
  const out: RhoInfo[] = [];
  for (let rho = 0; rho <= rhoMax; rho++) {
    const modes = modesOf(rho);
    if (modes.length) out.push({ rho, modes, simple: modes.length === 1 });
  }
  return out;
}

export function fmtModes(modes: [number, number][]): string {
  return modes.map(([k, l]) => `(${k},${l})`).join(' ');
}

/** The ρ ≥ 1 in Z0 that loses stability first as μ grows (smallest μ_T). */
export function firstTuringRho(p: Params, rhoMax = 400): { rho: number; mu: number } {
  let best = { rho: 1, mu: Infinity };
  for (const { rho } of rhoSet(rhoMax)) {
    if (rho === 0) continue;
    const m = muTuring(p, rho);
    if (m < best.mu) best = { rho, mu: m };
  }
  return best;
}

/**
 * Turing branch on the mode cos x cos y (k0 = l0 = 1, ρ0 = 2).
 * e0 is normalized like in the paper (second component −1, so e0 = (4, −1) for its
 * parameters). Formula (20) gives μ2 = −(9/16)·e1·e2, and for the amplitude A of
 * cos x cos y in u (A = ε·e1):  μ − μ0 = c·A²,  c = (9/16)·μ0/(a² + 2d2).
 */
export function turingTheory(p: Params) {
  const mu0 = muTuring(p, 2);
  const b11 = mu0 - 1 - 2 * p.d1; // > 0 whenever det B11(μ0) = 0
  const e0: [number, number] = [p.a2 / b11, -1];
  const g0: [number, number] = [mu0 / b11, 1];
  const mu2 = (-9 / 16) * e0[0] * e0[1];
  const c = ((9 / 16) * mu0) / (p.a2 + 2 * p.d2);
  return { mu0, e0, g0, mu2, c };
}

export function isPaperTuring(p: Params): boolean {
  return Math.abs(p.a2 - 2) < 1e-9 && Math.abs(p.d1 - 0.25) < 1e-9 && Math.abs(p.d2 - 3) < 1e-9;
}

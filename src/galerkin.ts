// Stationary solutions of (30)–(31) bifurcating from cos x cos y.
// The cubic nonlinearity keeps the subspace spanned by cos(kx)cos(ly) with k, l odd
// invariant, so we solve for equilibria there by Galerkin + collocation and Newton.

import type { Params } from './model';

const KS = [1, 3, 5, 7];
const n = KS.length;
const Q = 32; // collocation points per axis: exact projection of all products we meet
const DIM = 2 * n * n;

const COS: Float64Array[] = KS.map((k) => {
  const row = new Float64Array(Q);
  for (let q = 0; q < Q; q++) row[q] = Math.cos((k * (q + 0.5) * Math.PI) / Q);
  return row;
});

function synth(coef: Float64Array, off: number, out: Float64Array, tmp: Float64Array) {
  // tmp[i][q] = Σ_j c_ij cos(k_j y_q);  out[p][q] = Σ_i cos(k_i x_p) tmp[i][q]
  for (let i = 0; i < n; i++)
    for (let q = 0; q < Q; q++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += coef[off + i * n + j] * COS[j][q];
      tmp[i * Q + q] = s;
    }
  for (let p = 0; p < Q; p++)
    for (let q = 0; q < Q; q++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += COS[i][p] * tmp[i * Q + q];
      out[p * Q + q] = s;
    }
}

function project(f: Float64Array, out: Float64Array, tmp: Float64Array) {
  for (let i = 0; i < n; i++)
    for (let q = 0; q < Q; q++) {
      let s = 0;
      for (let p = 0; p < Q; p++) s += COS[i][p] * f[p * Q + q];
      tmp[i * Q + q] = s;
    }
  const w = 4 / (Q * Q);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let q = 0; q < Q; q++) s += tmp[i * Q + q] * COS[j][q];
      out[i * n + j] = w * s;
    }
}

const ug = new Float64Array(Q * Q);
const vg = new Float64Array(Q * Q);
const ng = new Float64Array(Q * Q);
const tmp = new Float64Array(n * Q);
const nc = new Float64Array(n * n);

function residual(p: Params, mu: number, z: Float64Array, out: Float64Array) {
  synth(z, 0, ug, tmp);
  synth(z, n * n, vg, tmp);
  for (let s = 0; s < Q * Q; s++) ng[s] = ug[s] * ug[s] * vg[s];
  project(ng, nc, tmp);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const rho = KS[i] * KS[i] + KS[j] * KS[j];
      const a = i * n + j;
      const U = z[a];
      const V = z[n * n + a];
      out[a] = (mu - 1 - rho * p.d1) * U + p.a2 * V + nc[a];
      out[n * n + a] = -mu * U - (p.a2 + rho * p.d2) * V - nc[a];
    }
}

function solveLinear(A: Float64Array, b: Float64Array, N: number): boolean {
  for (let c = 0; c < N; c++) {
    let piv = c;
    for (let r = c + 1; r < N; r++) if (Math.abs(A[r * N + c]) > Math.abs(A[piv * N + c])) piv = r;
    if (Math.abs(A[piv * N + c]) < 1e-300) return false;
    if (piv !== c) {
      for (let k = 0; k < N; k++) {
        const t = A[c * N + k];
        A[c * N + k] = A[piv * N + k];
        A[piv * N + k] = t;
      }
      const t = b[c];
      b[c] = b[piv];
      b[piv] = t;
    }
    for (let r = c + 1; r < N; r++) {
      const f = A[r * N + c] / A[c * N + c];
      if (f === 0) continue;
      for (let k = c; k < N; k++) A[r * N + k] -= f * A[c * N + k];
      b[r] -= f * b[c];
    }
  }
  for (let r = N - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < N; k++) s -= A[r * N + k] * b[k];
    b[r] = s / A[r * N + r];
  }
  return true;
}

function newton(p: Params, mu: number, z: Float64Array): boolean {
  const R = new Float64Array(DIM);
  const Rh = new Float64Array(DIM);
  const J = new Float64Array(DIM * DIM);
  for (let it = 0; it < 40; it++) {
    residual(p, mu, z, R);
    let norm = 0;
    for (let i = 0; i < DIM; i++) norm = Math.max(norm, Math.abs(R[i]));
    if (norm < 1e-12) return true;
    for (let c = 0; c < DIM; c++) {
      const h = 1e-7 * Math.max(1, Math.abs(z[c]));
      const keep = z[c];
      z[c] = keep + h;
      residual(p, mu, z, Rh);
      z[c] = keep;
      for (let r = 0; r < DIM; r++) J[r * DIM + c] = (Rh[r] - R[r]) / h;
    }
    for (let i = 0; i < DIM; i++) R[i] = -R[i];
    if (!solveLinear(J, R, DIM)) return false;
    for (let i = 0; i < DIM; i++) z[i] += R[i];
  }
  return false;
}

export interface BranchPoint {
  mu: number;
  /** coefficient of cos x cos y in u */
  amp: number;
  /** coefficient of cos x cos y in v */
  ampV: number;
  /** ‖higher harmonics‖ relative to amp, shows how far from the one-mode picture we are */
  tail: number;
}

/** Continuation along μ (ascending, all > μ0); seed from the asymptotics μ − μ0 = c·A². */
export function turingBranch(
  p: Params,
  mu0: number,
  c: number,
  e0: [number, number],
  mus: number[],
): BranchPoint[] {
  const z = new Float64Array(DIM);
  const out: BranchPoint[] = [];
  let prevAmp = 0;
  for (const mu of mus) {
    const guess = Math.sqrt(Math.max(mu - mu0, 0) / c);
    if (out.length === 0 || prevAmp === 0) {
      z.fill(0);
      z[0] = guess;
      z[n * n] = (guess * e0[1]) / e0[0];
    }
    if (!newton(p, mu, z) || Math.abs(z[0]) < 1e-8) {
      prevAmp = 0;
      continue;
    }
    let tail = 0;
    for (let a = 1; a < n * n; a++) tail += z[a] ** 2 + z[n * n + a] ** 2;
    out.push({ mu, amp: Math.abs(z[0]), ampV: z[n * n] * Math.sign(z[0]), tail: Math.sqrt(tail) / Math.abs(z[0]) });
    prevAmp = z[0];
  }
  return out;
}

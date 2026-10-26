import { HOPF_PRESET, TURING_PRESET, firstTuringRho, muHopf, muTuring, type Params } from './model';
import { state, subscribe, update } from './store';
import { fmt } from './chart';

const SLIDERS: { key: keyof Params; label: string; min: number; max: number; step: number }[] = [
  { key: 'mu', label: 'μ', min: 0.5, max: 4.5, step: 0.005 },
  { key: 'a2', label: 'a²', min: 0.2, max: 4, step: 0.01 },
  { key: 'd1', label: 'd₁', min: 0.02, max: 2, step: 0.005 },
  { key: 'd2', label: 'd₂', min: 0.1, max: 8, step: 0.01 },
];

export function initControls(host: HTMLElement) {
  const inputs = new Map<keyof Params, { range: HTMLInputElement; num: HTMLInputElement }>();
  const row = document.createElement('div');
  row.className = 'controls-row';
  for (const s of SLIDERS) {
    const wrap = document.createElement('label');
    wrap.className = 'ctl';
    const name = document.createElement('span');
    name.className = 'ctl-name';
    name.textContent = s.label;
    const range = document.createElement('input');
    range.type = 'range';
    Object.assign(range, { min: String(s.min), max: String(s.max), step: String(s.step) });
    const num = document.createElement('input');
    num.type = 'number';
    Object.assign(num, { min: String(s.min), max: String(s.max), step: String(s.step) });
    num.className = 'ctl-num';
    range.addEventListener('input', () => update({ [s.key]: +range.value }));
    num.addEventListener('change', () => {
      const v = +num.value;
      if (isFinite(v) && v > 0) update({ [s.key]: v });
    });
    wrap.append(name, range, num);
    row.append(wrap);
    inputs.set(s.key, { range, num });
  }

  const presets = document.createElement('div');
  presets.className = 'presets';
  const mk = (label: string, p: Params) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => update({ ...p }));
    presets.append(b);
  };
  mk('Тьюринг, §6.1 (μ = 2.05)', TURING_PRESET);
  mk('Андронов–Хопф, §6.2 (d₁ = d₂)', HOPF_PRESET);

  const status = document.createElement('div');
  status.className = 'status';

  host.append(row, presets, status);

  const sync = () => {
    for (const [k, { range, num }] of inputs) {
      range.value = String(state[k]);
      if (document.activeElement !== num) num.value = String(+state[k].toFixed(4));
    }
    const first = firstTuringRho(state);
    const muT = muTuring(state, 2);
    const muH = muHopf(state, 0);
    const unstable = Math.min(first.mu, muH) < state.mu;
    status.replaceChildren();
    const add = (k: string, v: string) => {
      const s = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = v;
      s.append(`${k} `, b);
      status.append(s);
    };
    add('μ_T(ρ=2) =', fmt(muT, 4));
    add(`первая мода Тьюринга: ρ = ${first.rho}, μ =`, fmt(first.mu, 4));
    add('μ_H = a²+1 =', fmt(muH, 4));
    add('равновесие w = 0:', unstable ? 'неустойчиво' : 'устойчиво');
  };
  subscribe(sync);
  sync();
}

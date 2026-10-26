import { Chart, fmt, legend, type TipRow } from '../chart';
import { theme } from '../colors';
import { turingBranch, type BranchPoint } from '../galerkin';
import { firstTuringRho, isPaperTuring, muHopf, turingTheory } from '../model';
import { local } from '../local';
import { debounce, state, subscribe } from '../store';
import { card, note, tex } from '../ui';

const SPAN = 0.4;

export function initBifurcation(host: HTMLElement) {
  const facts = document.createElement('div');
  facts.className = 'facts';
  host.append(facts);

  const body = card(
    host,
    'Бифуркационная диаграмма Тьюринга по моде $\\cos x\\cos y$',
    'Амплитуда $A$ — коэффициент при $\\cos x\\cos y$ в $u$. Точки — стационарные решения (30)–(31), найденные методом Ньютона в подпространстве мод $\\cos kx\\cos ly$ с нечётными $k,l\\le 7$. Линии — асимптотика теоремы 6: $\\mu-\\mu_0=\\mu_2\\varepsilon^2$, $A=\\varepsilon e_{0,1}$.',
  );
  const leg = document.createElement('div');
  body.append(leg);
  const c = new Chart(body, { height: 340, label: 'Бифуркационная диаграмма Тьюринга' });
  const warn = note(body, '', 'note warn');
  const tableWrap = document.createElement('details');
  tableWrap.className = 'table-wrap';
  const summary = document.createElement('summary');
  summary.textContent = 'Таблица значений';
  const table = document.createElement('table');
  tableWrap.append(summary, table);
  body.append(tableWrap);

  let branch: BranchPoint[] = [];
  let th = turingTheory(state);
  /** paper's own numbers for comparison: only with the local extras and the paper's parameters */
  const pt = local?.paperTuring ?? null;
  let paper = false;

  const ampTheory = (mu: number) => (mu < th.mu0 ? NaN : Math.sqrt((mu - th.mu0) / th.c));
  const ampPaper = (mu: number) => (mu < th.mu0 || !pt ? NaN : Math.sqrt((mu - th.mu0) / pt.c));

  const drawLegend = () => {
    leg.replaceChildren();
    legend(leg, [
      { label: 'численно (Ньютон)', color: 'var(--series-3)', shape: 'dot' },
      { label: 'теорема 6, μ₂ по формуле (20)', color: 'var(--series-1)', shape: 'line' },
      ...(paper && pt ? [{ label: pt.legendLabel, color: 'var(--series-2)', shape: 'line' as const }] : []),
      { label: 'w = 0: устойчиво / неустойчиво', color: 'var(--text-secondary)', shape: 'dash' as const },
    ]);
  };

  c.draw = () => {
    const t = theme();
    const x0 = th.mu0 - 0.12;
    const x1 = th.mu0 + SPAN;
    const yMax = Math.max(0.2, ...branch.map((b) => b.amp), ampTheory(x1)) * 1.12;
    c.frame([x0, x1], [-0.02 * yMax, yMax], { xLabel: 'μ', yLabel: 'амплитуда A' });
    c.clip(() => {
      const muStable = Math.min(firstTuringRho(state).mu, muHopf(state, 0));
      c.seg(c.x(x0), c.y(0), c.x(muStable), c.y(0), t.ink2, 2);
      c.seg(c.x(muStable), c.y(0), c.x(x1), c.y(0), t.ink2, 2, [6, 5]);
      if (paper) c.fn(ampPaper, t.s2, 2, [], th.mu0, x1);
      c.fn(ampTheory, t.s1, 2, [], th.mu0, x1);
      for (const b of branch) c.dot(b.mu, b.amp, t.s3, 4);
      c.vline(c.x(state.mu), t.axis, 1);
    });
    c.text(`μ₀ = ${fmt(th.mu0, 4)}`, c.x(th.mu0) + 4, c.y(0) - 12, { color: t.ink2 });
  };
  c.hover = (px, py) => {
    if (!c.inPlot(px, py) || !branch.length) return null;
    const b = branch.reduce((a, q) => (Math.abs(c.x(q.mu) - px) < Math.abs(c.x(a.mu) - px) ? q : a));
    const t = theme();
    const rows: TipRow[] = [
      { color: t.s3, shape: 'dot', value: fmt(b.amp, 4), label: 'численно' },
      { color: t.s1, value: fmt(ampTheory(b.mu), 4), label: 'формула (20)' },
    ];
    if (paper && pt) rows.push({ color: t.s2, value: fmt(ampPaper(b.mu), 4), label: pt.tipLabel });
    rows.push({ value: `${fmt(100 * b.tail, 2)} %`, label: 'доля высших гармоник' });
    return { title: `μ = ${fmt(b.mu, 4)}`, crossX: c.x(b.mu), at: [c.x(b.mu), c.y(b.amp)], rows };
  };

  const fillTable = () => {
    table.replaceChildren();
    const head = table.createTHead().insertRow();
    for (const h of ['μ', 'A, численно', 'A, формула (20)', ...(paper && pt ? [`A, ${pt.tipLabel}`] : []), 'высшие гармоники'])
      head.append(Object.assign(document.createElement('th'), { textContent: h }));
    const tb = table.createTBody();
    for (const b of branch) {
      const r = tb.insertRow();
      const cells = [fmt(b.mu, 4), fmt(b.amp, 5), fmt(ampTheory(b.mu), 5), ...(paper ? [fmt(ampPaper(b.mu), 5)] : []), `${fmt(100 * b.tail, 2)} %`];
      for (const s of cells) r.insertCell().textContent = s;
    }
  };

  const fillFacts = () => {
    // λ1 = μ2·(B0'e0, g0) (23), with g0 scaled so that (e0, g0) = 4/π² as in the paper
    const [e1, g1] = [th.e0[0], th.g0[0]];
    const C = 4 / Math.PI ** 2 / (e1 * g1 - 1);
    const lam1 = th.mu2 * C * e1 * (g1 - 1);
    facts.replaceChildren();
    const item = (label: string, value: string, sub?: string) => {
      const d = document.createElement('div');
      d.className = 'fact';
      const l = document.createElement('div');
      l.className = 'fact-label';
      tex(l, label);
      const v = document.createElement('div');
      v.className = 'fact-value';
      tex(v, value);
      d.append(l, v);
      if (sub) {
        const s = document.createElement('div');
        s.className = 'fact-sub';
        tex(s, sub);
        d.append(s);
      }
      facts.append(d);
    };
    item('Точка бифуркации $\\mu_0$ (мода $\\rho=2$)', `$${fmt(th.mu0, 5)}$`, 'из $\\det B_{11}(\\mu_0)=0$, ср. (32)');
    item('Собственный вектор $e_0$', `$(${fmt(th.e0[0], 4)},\\,-1)$`, 'нормировка как в статье');
    item(
      '$\\mu_2$ по формуле (20)',
      `$${fmt(th.mu2, 5)}$`,
      paper && pt ? pt.mu2Sub : 'в общем виде $\\mu_2=\\tfrac{9}{16}\\,a^2/(\\mu_0-1-2d_1)$',
    );
    item(
      '$\\lambda_1=\\mu_2(B_0\'e_0,g_0)$, формула (23)',
      `$${fmt(lam1, 5)}$`,
      paper && pt ? pt.lam1Sub : '$\\lambda_1>0$: ветвь устойчива (теорема 7)',
    );
    item('Тип ветви', th.mu2 > 0 ? 'суперкритическая, устойчивая' : 'субкритическая', '$\\mu_2>0$: решения при $\\mu>\\mu_0$');
  };

  const recompute = () => {
    th = turingTheory(state);
    paper = !!pt && isPaperTuring(state);
    const mus: number[] = [];
    for (let i = 1; i <= 24; i++) mus.push(th.mu0 + SPAN * (i / 24) ** 1.6);
    branch = isFinite(th.mu0) ? turingBranch(state, th.mu0, th.c, th.e0, mus) : [];
    const first = firstTuringRho(state);
    const hopf = muHopf(state, 0);
    const msgs: string[] = [];
    if (first.rho !== 2) msgs.push(`Мода $\\rho=2$ не первая: раньше, при $\\mu=${fmt(first.mu, 4)}$, теряет устойчивость $\\rho=${first.rho}$. Ветвь ниже существует, но неустойчива.`);
    if (hopf < th.mu0 + SPAN) msgs.push(`При $\\mu>a^2+1=${fmt(hopf, 4)}$ неустойчива и однородная мода (Хопф).`);
    if (paper && pt) msgs.unshift(pt.warning);
    tex(warn, msgs.join(' '));
    warn.hidden = !msgs.length;
    drawLegend();
    fillFacts();
    fillTable();
    c.render();
  };
  const later = debounce(recompute, 200);
  subscribe(() => {
    later();
    c.render();
  });
  recompute();
}

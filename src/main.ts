import 'katex/dist/katex.min.css';
import './style.css';
import { initControls } from './controls';
import { initSpectrum } from './sections/spectrum';
import { initPlane } from './sections/plane';
import { initBifurcation } from './sections/bifurcation';
import { initSimulation } from './sections/simulation';
import { initHopf } from './sections/hopf';
import { tex } from './ui';
import { local } from './local';

const $ = (id: string) => document.getElementById(id)!;

tex(
  $('lead'),
  'Система (30): $u_t=(\\mu-1)u+a^2v+d_1\\Delta u+u^2v$, $v_t=-\\mu u-a^2v+d_2\\Delta v-u^2v$ на $[0,\\pi]^2$ с условиями Неймана. Все графики пересчитываются от общих ползунков ниже. Кнопки задают параметры примеров из §6.',
);

initControls($('controls-inner'));
initSpectrum($('spectrum-body'));
initPlane($('plane-body'));
initBifurcation($('turing-body'));
initSimulation($('sim-body'));
initHopf($('hopf-body'));

if (import.meta.env.VITE_PUBLIC !== '1' && local) {
  const link = Object.assign(document.createElement('a'), { href: '#notes', textContent: local.notesLink });
  document.querySelector('.toc')!.append(link);
  const section = Object.assign(document.createElement('section'), { id: 'notes' });
  const h = Object.assign(document.createElement('h2'), { textContent: local.notesTitle });
  const ul = document.createElement('ul');
  ul.className = 'notes';
  for (const n of local.notes) {
    const li = document.createElement('li');
    const [, head, rest] = n.match(/^\*\*(.+?)\*\*\s*(.*)$/) ?? [, '', n];
    const b = document.createElement('b');
    tex(b, head ?? '');
    const span = document.createElement('span');
    tex(span, ' ' + rest);
    li.append(b, span);
    ul.append(li);
  }
  section.append(h, ul);
  document.querySelector('main')!.append(section);
}

import katex from 'katex';

/** Render $...$ fragments inside plain text into KaTeX HTML. */
export function tex(el: HTMLElement, src: string) {
  el.replaceChildren();
  src.split(/(\$[^$]+\$)/).forEach((part) => {
    if (part.startsWith('$') && part.endsWith('$')) {
      const span = document.createElement('span');
      katex.render(part.slice(1, -1), span, { throwOnError: false });
      el.append(span);
    } else if (part) el.append(part);
  });
}

export function card(host: HTMLElement, title: string, desc?: string): HTMLElement {
  const c = document.createElement('figure');
  c.className = 'card';
  const h = document.createElement('figcaption');
  const t = document.createElement('h3');
  tex(t, title);
  h.append(t);
  if (desc) {
    const p = document.createElement('p');
    tex(p, desc);
    h.append(p);
  }
  const body = document.createElement('div');
  body.className = 'card-body';
  c.append(h, body);
  host.append(c);
  return body;
}

export function note(host: HTMLElement, src: string, cls = 'note') {
  const p = document.createElement('p');
  p.className = cls;
  tex(p, src);
  host.append(p);
  return p;
}

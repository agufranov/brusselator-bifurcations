// Theme tokens are defined in style.css; charts read them at draw time so light/dark both work.

export interface Theme {
  surface: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  s1: string;
  s2: string;
  s3: string;
  s7: string;
  wash: string;
  divNeg: string;
  divMid: string;
  divPos: string;
}

let cached: Theme | null = null;

export function theme(): Theme {
  if (cached) return cached;
  const cs = getComputedStyle(document.documentElement);
  const g = (n: string) => cs.getPropertyValue(n).trim();
  cached = {
    surface: g('--surface-1'),
    ink: g('--text-primary'),
    ink2: g('--text-secondary'),
    muted: g('--text-muted'),
    grid: g('--grid'),
    axis: g('--axis'),
    s1: g('--series-1'),
    s2: g('--series-2'),
    s3: g('--series-3'),
    s7: g('--series-7'),
    wash: g('--unstable-wash'),
    divNeg: g('--div-neg'),
    divMid: g('--div-mid'),
    divPos: g('--div-pos'),
  };
  divLut = null;
  return cached;
}

const listeners = new Set<() => void>();
export function onThemeChange(f: () => void) {
  listeners.add(f);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  cached = null;
  listeners.forEach((f) => f());
});

// ---- OKLab interpolation for the diverging scale ----

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const [R, G, B] = [toLin(r), toLin(g), toLin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]: [number, number, number]): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [R, G, B].map((c) => Math.round(255 * Math.min(1, Math.max(0, toSrgb(c))))) as [number, number, number];
}

let divLut: Uint8ClampedArray | null = null;

/** 512-entry RGB LUT: index 0 → negative pole, 255.5 → neutral, 511 → positive pole. */
export function divergingLut(): Uint8ClampedArray {
  if (divLut) return divLut;
  const t = theme();
  const neg = rgbToOklab(hexToRgb(t.divNeg));
  const mid = rgbToOklab(hexToRgb(t.divMid));
  const pos = rgbToOklab(hexToRgb(t.divPos));
  const lut = new Uint8ClampedArray(512 * 3);
  for (let i = 0; i < 512; i++) {
    const x = i / 511 - 0.5; // −0.5..0.5
    const [from, k] = x < 0 ? [neg, -2 * x] : [pos, 2 * x];
    const lab = [0, 1, 2].map((c) => mid[c] + (from[c] - mid[c]) * k) as [number, number, number];
    lut.set(oklabToRgb(lab), i * 3);
  }
  divLut = lut;
  return lut;
}

/** Diverging color for value in [−1, 1]. */
export function divColor(x: number): string {
  const lut = divergingLut();
  const i = Math.round((Math.max(-1, Math.min(1, x)) * 0.5 + 0.5) * 511) * 3;
  return `rgb(${lut[i]},${lut[i + 1]},${lut[i + 2]})`;
}

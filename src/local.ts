// Optional, not-for-publication extras (remarks on the manuscript, comparison with its numbers).
// They live in src/notes.local.ts, which is git-ignored; without it, or in the public build
// (`vite build --mode pages`), the page shows only the visualizations.

export interface PaperTuring {
  /** μ − μ0 = c·A² with the paper's value of μ2 */
  c: number;
  legendLabel: string;
  tipLabel: string;
  mu2Sub: string;
  lam1Sub: string;
  warning: string;
}

export interface LocalExtras {
  notesLink: string;
  notesTitle: string;
  notes: string[];
  paperTuring: PaperTuring;
}

const mods: Record<string, LocalExtras> =
  import.meta.env.VITE_PUBLIC === '1' ? {} : import.meta.glob<LocalExtras>('./notes.local.ts', { eager: true, import: 'default' });

export const local: LocalExtras | null = Object.values(mods)[0] ?? null;

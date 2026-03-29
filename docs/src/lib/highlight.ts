import type {
  BundledLanguage,
  BundledTheme,
  Highlighter,
} from "shiki/bundle/web";

/** Dark theme aligned with the docs UI. */
const THEME: BundledTheme = "tokyo-night";

type ShikiWeb = typeof import("shiki/bundle/web");

let shikiMod: ShikiWeb | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

async function getShiki(): Promise<ShikiWeb> {
  if (!shikiMod) {
    shikiMod = await import("shiki/bundle/web");
  }
  return shikiMod;
}

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { getSingletonHighlighter } = await getShiki();
      return getSingletonHighlighter({
        themes: [THEME],
        langs: ["typescript", "tsx", "bash", "json", "shell"],
      });
    })();
  }
  return highlighterPromise;
}

const LANG_MAP: Record<string, BundledLanguage> = {
  ts: "typescript",
  typescript: "typescript",
  js: "typescript",
  javascript: "typescript",
  tsx: "tsx",
  jsx: "tsx",
  bash: "bash",
  sh: "bash",
  shell: "shell",
  terminal: "bash",
  zsh: "bash",
  json: "json",
};

/**
 * Map UI language hints to Shiki bundled language ids.
 */
export function toShikiLanguage(language: string): BundledLanguage {
  const key = language.toLowerCase().trim();
  return LANG_MAP[key] ?? "typescript";
}

/**
 * Highlight source for display (HTML string with Shiki classes / inline styles).
 */
export async function highlightToHtml(
  code: string,
  language: string,
): Promise<string> {
  const h = await getHighlighter();
  const lang = toShikiLanguage(language);
  const trimmed = code.replace(/\n$/, "");
  try {
    return h.codeToHtml(trimmed, { lang, theme: THEME });
  } catch {
    return h.codeToHtml(trimmed, { lang: "typescript", theme: THEME });
  }
}

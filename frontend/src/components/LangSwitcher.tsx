import { useLang } from "../lib/i18n";
import type { Lang } from "../lib/i18n";
import { LANGUAGES } from "../lib/i18n";

/**
 * Compact language switcher used in the header and on the auth pages.
 * Rendered as a native <select> so it works on every device with zero JS
 * dependency; styling matches the dark command-center theme.
 */
export function LangSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useLang();
  return (
    <label className="flex items-center gap-1.5" title="Language / भाषा / ভাষা">
      <span className="sr-only">Language</span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className={`bg-panel2 border border-line rounded text-[10px] font-mono text-slate-300 hover:border-emerald-600 focus:border-emerald-600 focus:outline-none transition-colors cursor-pointer ${
          compact ? "px-1.5 py-1" : "px-2 py-1.5"
        }`}
        aria-label="Select language"
      >
        {LANGUAGES.map((l) => (
          <option key={l.id} value={l.id}>
            {l.native} · {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
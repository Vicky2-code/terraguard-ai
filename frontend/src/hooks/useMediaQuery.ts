import { useEffect, useState } from "react";

/**
 * Reactive CSS media-query hook. Used to keep layout decisions
 * (e.g. sidebar drawer vs. docked rail) in sync with the viewport.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True at >= 1024px, matching Tailwind's `lg` breakpoint where the sidebar docks. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}

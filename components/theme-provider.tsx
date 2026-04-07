"use client";

import * as React from "react";
import {
  ThemeProvider as NextThemesProvider,
  useTheme as useNextTheme,
} from "next-themes";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="assessly-theme"
      disableTransitionOnChange
    >
      <ThemeProviderBridge>{children}</ThemeProviderBridge>
    </NextThemesProvider>
  );
}

function ThemeProviderBridge({ children }: { children: React.ReactNode }) {
  const { resolvedTheme, setTheme: setNextTheme } = useNextTheme();
  const theme: Theme = resolvedTheme === "dark" ? "dark" : "light";

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      setNextTheme(nextTheme);
    },
    [setNextTheme],
  );

  const toggle = React.useCallback(() => {
    setNextTheme(theme === "dark" ? "light" : "dark");
  }, [setNextTheme, theme]);

  const value = React.useMemo(
    () => ({ theme, setTheme, toggle }),
    [theme, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

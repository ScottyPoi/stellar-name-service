"use client";

import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { useServerInsertedHTML } from "next/navigation";
import { ReactNode, useState } from "react";
import { appTheme } from "@/lib/theme";

interface AppThemeProviderProps {
  children: ReactNode;
}

function EmotionCacheProvider({ children }: { children: ReactNode }) {
  const [{ cache, flush }] = useState(() => {
    const emotionCache = createCache({ key: "mui", prepend: true });
    emotionCache.compat = true;

    const prevInsert = emotionCache.insert;
    let inserted: Array<[string, string]> = [];
    emotionCache.insert = (...args) => {
      const [, serialized] = args;
      if (emotionCache.inserted[serialized.name] === undefined) {
        inserted.push([serialized.name, serialized.styles]);
      }
      return prevInsert(...args);
    };

    const flush = () => {
      const prevInserted = inserted;
      inserted = [];
      return prevInserted;
    };

    return { cache: emotionCache, flush };
  });

  useServerInsertedHTML(() => (
    (() => {
      const insertedStyles = flush();

      if (insertedStyles.length === 0) {
        return null;
      }

      return (
        <style
          data-emotion={`${cache.key} ${insertedStyles.map((item) => item[0]).join(" ")}`}
          dangerouslySetInnerHTML={{ __html: insertedStyles.map((item) => item[1]).join(" ") }}
        />
      );
    })()
  ));

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}

export function AppThemeProvider({ children }: AppThemeProviderProps) {
  return (
    <EmotionCacheProvider>
      <ThemeProvider theme={appTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </EmotionCacheProvider>
  );
}

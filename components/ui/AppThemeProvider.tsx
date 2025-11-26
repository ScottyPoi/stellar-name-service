"use client";

import { CssBaseline, StyledEngineProvider, ThemeProvider } from "@mui/material";
import { ReactNode } from "react";
import { appTheme } from "@/lib/theme";

interface AppThemeProviderProps {
  children: ReactNode;
}

export function AppThemeProvider({ children }: AppThemeProviderProps) {
  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={appTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  );
}

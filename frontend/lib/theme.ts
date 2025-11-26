import { createTheme } from "@mui/material/styles";

const backgroundPaper = "rgba(16, 24, 40, 0.72)";
const borderColor = "rgba(255, 255, 255, 0.06)";

export const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#7c9bff" },
    secondary: { main: "#c084fc" },
    background: {
      default: "#0b1021",
      paper: backgroundPaper,
    },
    text: {
      primary: "#f8fafc",
      secondary: "rgba(248, 250, 252, 0.72)",
    },
    success: { main: "#22c55e" },
    warning: { main: "#f59e0b" },
    error: { main: "#f43f5e" },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily:
      "Inter, 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
    h1: { fontWeight: 700, letterSpacing: -0.5 },
    h2: { fontWeight: 700, letterSpacing: -0.4 },
    h3: { fontWeight: 700, letterSpacing: -0.3 },
    h4: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 700 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#0b1021",
          backgroundImage:
            "radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.07) 0px, transparent 40%), radial-gradient(at 100% 100%, rgba(168, 85, 247, 0.07) 0px, transparent 42%)",
          minHeight: "100vh",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: `1px solid ${borderColor}`,
          boxShadow: "0 20px 80px rgba(0, 0, 0, 0.35)",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 18,
          border: `1px solid ${borderColor}`,
          backgroundImage:
            "linear-gradient(135deg, rgba(124, 155, 255, 0.06), rgba(192, 132, 252, 0.04))",
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 999 },
        contained: { boxShadow: "0 10px 40px rgba(124, 155, 255, 0.25)" },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderRadius: 14,
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 14, border: `1px solid ${borderColor}` },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 999, border: `1px solid ${borderColor}` },
      },
    },
  },
});

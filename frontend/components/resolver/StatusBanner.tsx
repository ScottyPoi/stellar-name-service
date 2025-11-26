import { Alert, AlertTitle, Typography } from "@mui/material";

type StatusTone = "success" | "warning" | "error";

interface StatusBannerProps {
  tone: StatusTone;
  title: string;
  message?: string;
}

export function StatusBanner({ tone, title, message }: StatusBannerProps) {
  return (
    <Alert
      severity={tone}
      variant="outlined"
      sx={{
        borderRadius: 2,
        bgcolor: "rgba(255,255,255,0.03)",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <AlertTitle sx={{ fontWeight: 700 }}>{title}</AlertTitle>
      {message ? (
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      ) : null}
    </Alert>
  );
}

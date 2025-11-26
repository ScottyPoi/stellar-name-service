import { FormEvent } from "react";
import {
  Button,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

interface SearchBoxProps {
  value: string;
  loading?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  suffix?: string;
  placeholder?: string;
  size?: "sm" | "lg";
}

export function SearchBox({
  value,
  loading = false,
  onChange,
  onSubmit,
  suffix = ".stellar",
  placeholder = "Search for a name",
  size = "sm",
}: SearchBoxProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim() || loading) {
      return;
    }
    onSubmit();
  }

  const isLarge = size === "lg";

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%" }}>
      <Paper
        elevation={0}
        sx={{
          p: isLarge ? 1.25 : 1,
          borderRadius: isLarge ? 999 : 18,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          border: "1px solid rgba(255,255,255,0.08)",
          background:
            "linear-gradient(135deg, rgba(124,155,255,0.08), rgba(192,132,252,0.06))",
        }}
      >
        <TextField
          fullWidth
          id="fqdn"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          variant="outlined"
          inputProps={{ style: { padding: isLarge ? "16px 14px" : "12px 14px" } }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Typography variant="body2" color="text.secondary">
                  {suffix}
                </Typography>
              </InputAdornment>
            ),
            sx: {
              pr: 1,
            },
          }}
          sx={{
            "& .MuiOutlinedInput-notchedOutline": { border: "none" },
          }}
        />
        <Stack direction="row" alignItems="center" spacing={1}>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !value.trim()}
            sx={{
              px: isLarge ? 3 : 2.5,
              py: isLarge ? 1.25 : 1,
              borderRadius: 999,
              background:
                "linear-gradient(135deg, rgba(124,155,255,1), rgba(192,132,252,0.95))",
            }}
          >
            {loading ? "Searching…" : "Search"}
          </Button>
        </Stack>
      </Paper>
    </form>
  );
}

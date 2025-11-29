import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography,
} from "@mui/material";

interface ResultCardProps {
  fqdn: string;
  data: Record<string, unknown>;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ResultCard({ fqdn, data }: ResultCardProps) {
  const owner = (data.owner as string | undefined) ?? null;
  const resolver = (data.resolver as string | undefined) ?? null;
  const address = (data.address as string | undefined) ?? null;
  const expiresAt = (data.expires_at as string | undefined) ?? null;
  const namehash = (data.namehash as string | undefined) ?? null;
  const recordsEntries =
    typeof data.records === "object" && data.records !== null
      ? Object.entries(data.records as Record<string, string>)
      : [];

  return (
    <Card>
      <CardHeader
        title={
          <Stack direction="row" alignItems="center" spacing={1}>
            <Chip
              label="Result"
              size="small"
              color="primary"
              sx={{ bgcolor: "rgba(124,155,255,0.2)" }}
            />
            <Typography variant="h5" fontWeight={800}>
              {fqdn}
            </Typography>
          </Stack>
        }
        subheader={
          namehash ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontFamily: "monospace" }}
            >
              namehash: {namehash}
            </Typography>
          ) : undefined
        }
        sx={{ pb: 0 }}
      />
      <CardContent>
        <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
          <InfoBlock label="Owner" value={owner ?? "—"} mono />
          <InfoBlock label="Resolver" value={resolver ?? "—"} mono />
          <InfoBlock label="Address" value={address ?? "—"} mono />
          <InfoBlock label="Expires" value={formatDate(expiresAt) ?? "—"} />
        </Grid>

        <Divider sx={{ my: 3 }} />

        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Records
        </Typography>
        {recordsEntries.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No records were found.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {recordsEntries.map(([key, value]) => (
              <Box
                key={key}
                sx={{
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 1.5,
                  px: 1.5,
                  py: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  bgcolor: "rgba(255,255,255,0.03)",
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontFamily: "monospace", letterSpacing: 0.5 }}
                >
                  {key}
                </Typography>
                <Typography variant="body2" color="text.primary">
                  {value}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function InfoBlock({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Grid size={{ xs: 12, sm: 6 }}>
      <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography
        variant="body1"
        color="text.primary"
        sx={{ fontFamily: mono ? "monospace" : undefined, wordBreak: "break-word" }}
      >
        {value}
      </Typography>
    </Grid>
  );
}

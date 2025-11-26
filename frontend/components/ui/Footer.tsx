import { Box, Container, Link, Stack, Typography } from "@mui/material";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <Box
      component="footer"
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        background:
          "linear-gradient(90deg, rgba(124,155,255,0.08), rgba(192,132,252,0.04))",
        py: 4,
        mt: "auto",
      }}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems="center"
          justifyContent="space-between"
          gap={2}
        >
          <Typography variant="body2" color="text.secondary">
            © {year} Stellar Name Service
          </Typography>
          <Stack direction="row" spacing={3}>
            <Link href="#" color="text.secondary" underline="hover" variant="body2">
              Docs
            </Link>
            <Link href="#" color="text.secondary" underline="hover" variant="body2">
              Support
            </Link>
            <Link href="#" color="text.secondary" underline="hover" variant="body2">
              GitHub
            </Link>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

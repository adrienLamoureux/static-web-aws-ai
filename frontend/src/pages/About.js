import React from "react";
import { Box, Container, Paper, Stack, Typography } from "@mui/material";

function About() {
  return (
    <Box sx={{ py: { xs: 4, md: 6 } }}>
      <Container maxWidth="md">
        <Paper elevation={0} sx={{ p: { xs: 3, md: 4 } }}>
          <Stack spacing={2}>
            <Typography variant="overline" color="text.secondary">
              About
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 600 }}>
              Static web + Bedrock experiments
            </Typography>
            <Typography color="text.secondary">
              This is a simple React app deployed to AWS with a Bedrock-backed
              API for image-to-video workflows.
            </Typography>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

export default About;

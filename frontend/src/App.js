import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  CssBaseline,
  Toolbar,
  Typography,
} from "@mui/material";
import Home from "./pages/Home";
import About from "./pages/About";

function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState("");

  useEffect(() => {
    let isMounted = true;
    fetch("/config.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data?.apiBaseUrl) return;
        setApiBaseUrl(data.apiBaseUrl);
      })
      .catch(() => {});
    const envApiUrl = process.env.REACT_APP_API_URL || "";
    if (!envApiUrl) {
      return () => {
        isMounted = false;
      };
    }
    if (window.location.hostname === "localhost") {
      setApiBaseUrl(envApiUrl);
    }
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Router>
      <CssBaseline />
      <AppBar
        position="static"
        color="transparent"
        elevation={0}
        sx={{ borderBottom: "1px solid rgba(0, 0, 0, 0.08)" }}
      >
        <Toolbar sx={{ display: "flex", gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
            Nova Reel Studio
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button component={Link} to="/" color="inherit">
              Home
            </Button>
            <Button component={Link} to="/about" color="inherit">
              About
            </Button>
          </Box>
        </Toolbar>
      </AppBar>
      <Routes>
        <Route path="/" element={<Home apiBaseUrl={apiBaseUrl} />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </Router>
  );
}

export default App;

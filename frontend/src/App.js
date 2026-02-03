import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import Whisk from "./pages/Whisk";

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
        <div className="relative min-h-screen overflow-hidden">
          <div className="pointer-events-none absolute inset-0 noise-layer opacity-60" />
        <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_center,_rgba(196,178,141,0.24),_transparent_70%)] blur-3xl" />
        <header className="relative z-10 mx-auto flex w-full max-w-[1240px] items-center justify-between px-6 py-6 md:px-10">
          <Link
            to="/"
            className="text-lg font-semibold tracking-tight text-ink font-display"
          >
            Nova Reel Studio
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium">
            <Link
              to="/"
              className="nav-link"
            >
              Home
            </Link>
            <Link
              to="/whisk"
              className="nav-link"
            >
              Whisk
            </Link>
            <Link
              to="/about"
              className="nav-link"
            >
              About
            </Link>
          </nav>
        </header>
        <main className="relative z-10">
          <Routes>
            <Route path="/" element={<Home apiBaseUrl={apiBaseUrl} />} />
            <Route path="/whisk" element={<Whisk apiBaseUrl={apiBaseUrl} />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;

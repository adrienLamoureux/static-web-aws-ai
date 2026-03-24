import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

/**
 * CharacterWalker
 * Frieren-inspired chibi walker: long silver hair, white robe, glowing staff.
 * - RAF loop + direct DOM mutation for horizontal movement (zero React re-renders)
 * - CSS @keyframes for legs, arms, body bob, eye blink
 * - framer-motion motion.g for secondary hair sway and robe hem float
 */
export default function CharacterWalker() {
  const elRef = useRef(null);

  useEffect(() => {
    const SPEED = 1.2;    // px per frame (~72px/s at 60fps)
    const CHAR_W = 48;
    const PAUSE_MS = 1800;
    let raf;
    const s = { x: 80, dir: 1, walking: true };

    const tick = () => {
      const el = elRef.current;
      if (el && s.walking) {
        s.x += SPEED * s.dir;
        const maxX = window.innerWidth - CHAR_W;

        if (s.x >= maxX || s.x <= 0) {
          s.x = s.x >= maxX ? maxX : 0;
          s.dir *= -1;
          s.walking = false;
          el.classList.add("skr-char-idle");
          setTimeout(() => {
            s.walking = true;
            if (elRef.current) elRef.current.classList.remove("skr-char-idle");
          }, PAUSE_MS);
        }

        el.style.left = s.x + "px";
        el.style.transform = s.dir === -1 ? "scaleX(-1)" : "none";
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={elRef} className="skr-character-walker">
      <svg width="48" height="82" viewBox="0 0 48 82" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="skr-cw-hair" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F0EAFF" />
            <stop offset="100%" stopColor="#A890D8" />
          </linearGradient>
          <linearGradient id="skr-cw-eye" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7B5EC4" />
            <stop offset="100%" stopColor="#2C1B6E" />
          </linearGradient>
        </defs>

        {/* ── Long trailing hair — right side (framer-motion sway) ─────── */}
        <motion.g
          animate={{ rotate: [-2, 2] }}
          transition={{ duration: 2.8, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
          style={{ transformOrigin: "24px 8px" }}
        >
          <path
            d="M 30 9 Q 44 26 42 54 Q 40 66 37 72"
            stroke="url(#skr-cw-hair)" strokeWidth="6" fill="none" strokeLinecap="round"
          />
          <path
            d="M 28 9 Q 40 24 38 50 Q 36 62 33 68"
            stroke="#C4B4F0" strokeWidth="4" fill="none" strokeLinecap="round"
          />
        </motion.g>

        {/* ── Long trailing hair — left side (phase offset) ────────────── */}
        <motion.g
          animate={{ rotate: [2, -2] }}
          transition={{ duration: 2.8, delay: 0.4, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
          style={{ transformOrigin: "24px 8px" }}
        >
          <path
            d="M 18 9 Q 6 26 8 54 Q 9 64 11 70"
            stroke="url(#skr-cw-hair)" strokeWidth="5" fill="none" strokeLinecap="round"
          />
        </motion.g>

        {/* ── Head ─────────────────────────────────────────────────────── */}
        <ellipse cx="24" cy="15" rx="11" ry="12" fill="#F5DCBF" />

        {/* Pointed ears */}
        <ellipse cx="13" cy="15" rx="2.5" ry="3.5" fill="#F0D0B0" />
        <ellipse cx="35" cy="15" rx="2.5" ry="3.5" fill="#F0D0B0" />

        {/* ── Hair top + front bangs ────────────────────────────────────── */}
        <ellipse cx="24" cy="7" rx="13" ry="9" fill="url(#skr-cw-hair)" />
        {/* Left front bang */}
        <path
          d="M 15 8 Q 11 16 13 24"
          stroke="#B8A8E8" strokeWidth="5" fill="none" strokeLinecap="round"
        />
        {/* Right front bang (shorter) */}
        <path
          d="M 29 6 Q 33 13 31 19"
          stroke="#C4B4F0" strokeWidth="4" fill="none" strokeLinecap="round"
        />

        {/* ── Eyes ─────────────────────────────────────────────────────── */}
        <g className="skr-char-eye-l">
          <ellipse cx="20" cy="16" rx="2.8" ry="3.2" fill="url(#skr-cw-eye)" />
          <circle cx="21.2" cy="14.5" r="1.1" fill="white" />
        </g>
        <g className="skr-char-eye-r">
          <ellipse cx="28" cy="16" rx="2.8" ry="3.2" fill="url(#skr-cw-eye)" />
          <circle cx="29.2" cy="14.5" r="1.1" fill="white" />
        </g>

        {/* ── Robe body ────────────────────────────────────────────────── */}
        <path
          d="M 16 27 L 10 30 L 10 52 Q 13 59 24 60 Q 35 59 38 52 L 38 30 L 32 27 Z"
          fill="#EDE8F8"
          className="skr-char-robe"
        />
        {/* Collar V */}
        <line x1="20" y1="27" x2="24" y2="33" stroke="#C084FC" strokeWidth="1.8" />
        <line x1="28" y1="27" x2="24" y2="33" stroke="#C084FC" strokeWidth="1.8" />
        {/* Sleeve cuffs */}
        <ellipse cx="10" cy="30" rx="3" ry="2" fill="#D8D0F4" />
        <ellipse cx="38" cy="30" rx="3" ry="2" fill="#D8D0F4" />
        {/* Belt/sash line */}
        <path d="M 12 44 Q 24 46 36 44" stroke="#C0B0E0" strokeWidth="1.5" fill="none" />

        {/* ── Robe hem float (framer-motion) ───────────────────────────── */}
        <motion.g
          animate={{ x: [-3, 3] }}
          transition={{ duration: 1.2, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
        >
          <path
            d="M 10 52 Q 14 64 22 66 Q 24 67 26 66 Q 34 64 38 52"
            fill="#D8CFF0"
          />
        </motion.g>

        {/* ── Staff + left arm ─────────────────────────────────────────── */}
        <g className="skr-char-arm-l">
          {/* Upper arm */}
          <line x1="14" y1="32" x2="7" y2="44" stroke="#F5DCBF" strokeWidth="3.5" strokeLinecap="round" />
          {/* Staff shaft */}
          <line x1="6" y1="40" x2="4" y2="66" stroke="#9B8060" strokeWidth="2.5" strokeLinecap="round" />
          {/* Staff crystal */}
          <circle cx="4" cy="65" r="3.5" fill="#FF6B9D" opacity="0.85" />
          <circle cx="4" cy="65" r="3.5" fill="none" stroke="#C084FC" strokeWidth="1.2" />
          <circle cx="3" cy="63.5" r="1" fill="white" opacity="0.7" />
        </g>

        {/* ── Right arm ────────────────────────────────────────────────── */}
        <line
          x1="34" y1="32" x2="42" y2="44"
          stroke="#F5DCBF" strokeWidth="3.5" strokeLinecap="round"
          className="skr-char-arm-r"
        />

        {/* ── Legs ─────────────────────────────────────────────────────── */}
        <g className="skr-char-leg-l">
          <rect x="17" y="60" width="6" height="14" rx="3" fill="#F5DCBF" />
          <ellipse cx="20" cy="75" rx="5" ry="3" fill="#FF6B9D" />
        </g>
        <g className="skr-char-leg-r">
          <rect x="25" y="60" width="6" height="14" rx="3" fill="#F5DCBF" />
          <ellipse cx="28" cy="75" rx="5" ry="3" fill="#FF6B9D" />
        </g>
      </svg>
    </div>
  );
}

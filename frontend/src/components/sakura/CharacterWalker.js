import { useEffect, useRef } from "react";

/**
 * CharacterWalker
 * A small chibi character that walks horizontally across the bottom of the screen.
 * Pure CSS animations for limbs + RAF loop for position — no library needed.
 */
export default function CharacterWalker() {
  const elRef = useRef(null);

  useEffect(() => {
    const SPEED = 1.2;      // px per frame (~72px/s at 60fps)
    const CHAR_W = 40;
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
      <svg width="40" height="60" viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg">
        {/* Long hair back layer */}
        <rect x="9" y="11" width="22" height="28" rx="4" fill="#9B7FD4" />
        {/* Head */}
        <ellipse cx="20" cy="13" rx="9" ry="9" fill="#F5DCBF" />
        {/* Hair top */}
        <ellipse cx="20" cy="7" rx="10" ry="6" fill="#C084FC" />
        {/* Side hair strands */}
        <rect x="8" y="12" width="4" height="18" rx="2" fill="#A855F7" />
        <rect x="28" y="12" width="4" height="18" rx="2" fill="#A855F7" />
        {/* Eyes */}
        <ellipse cx="15.5" cy="13.5" rx="2" ry="2.5" fill="#1E1060" />
        <ellipse cx="24.5" cy="13.5" rx="2" ry="2.5" fill="#1E1060" />
        {/* Eye highlights */}
        <circle cx="16.5" cy="12.5" r="0.8" fill="white" />
        <circle cx="25.5" cy="12.5" r="0.8" fill="white" />
        {/* Body robe */}
        <rect x="13" y="22" width="14" height="16" rx="3" fill="#EDE8F8" />
        {/* Collar V detail */}
        <line x1="17" y1="22" x2="20" y2="27" stroke="#C084FC" strokeWidth="1.5" />
        <line x1="23" y1="22" x2="20" y2="27" stroke="#C084FC" strokeWidth="1.5" />
        {/* Robe hem */}
        <ellipse cx="20" cy="38" rx="9" ry="3" fill="#D8CFF0" />
        {/* Left arm */}
        <line
          x1="13" y1="25" x2="7" y2="33"
          stroke="#F5DCBF" strokeWidth="3.5" strokeLinecap="round"
          className="skr-char-arm-l"
        />
        {/* Right arm */}
        <line
          x1="27" y1="25" x2="33" y2="33"
          stroke="#F5DCBF" strokeWidth="3.5" strokeLinecap="round"
          className="skr-char-arm-r"
        />
        {/* Left leg + shoe */}
        <g className="skr-char-leg-l">
          <rect x="14.5" y="38" width="5" height="13" rx="2.5" fill="#F5DCBF" />
          <ellipse cx="17" cy="51" rx="4" ry="2.5" fill="#FF6B9D" />
        </g>
        {/* Right leg + shoe */}
        <g className="skr-char-leg-r">
          <rect x="20.5" y="38" width="5" height="13" rx="2.5" fill="#F5DCBF" />
          <ellipse cx="23" cy="51" rx="4" ry="2.5" fill="#FF6B9D" />
        </g>
      </svg>
    </div>
  );
}

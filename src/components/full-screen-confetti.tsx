"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const COLORS = ["#9ec835", "#ffbd59", "#ff6b6b", "#4dabf7", "#f06595", "#ffd43b"];

interface Piece {
  id: number;
  left: number;
  color: string;
  delay: number;
  duration: number;
  spin: number;
  isStreamer: boolean;
}

function generatePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: COLORS[i % COLORS.length],
    delay: Math.random() * 0.6,
    duration: 2.2 + Math.random() * 1.2,
    spin: 360 + Math.random() * 360,
    isStreamer: i % 3 === 0,
  }));
}

const CLEAR_AFTER_MS = 3500;

// Full-viewport confetti/streamer burst, portaled to <body> so it always
// covers the whole screen regardless of where it's rendered from (in
// particular, above a Dialog's own z-50 stacking context — see z-[100]
// below). Re-fires whenever triggerKey changes to a new non-null value.
export function FullScreenConfetti({ triggerKey }: { triggerKey: string | null }) {
  const [mounted, setMounted] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!triggerKey) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPieces(generatePieces(70));
    const timeout = setTimeout(() => setPieces([]), CLEAR_AFTER_MS);
    return () => clearTimeout(timeout);
  }, [triggerKey]);

  if (!mounted || pieces.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 rounded-sm"
          style={
            {
              left: `${p.left}%`,
              width: p.isStreamer ? 6 : 10,
              height: p.isStreamer ? 28 : 10,
              backgroundColor: p.color,
              animation: `confetti-fall-screen ${p.duration}s ease-in forwards`,
              animationDelay: `${p.delay}s`,
              "--spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>,
    document.body
  );
}

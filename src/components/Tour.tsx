// A dismissible coach-mark tour: dims the page, spotlights the target element of
// the current step (a box-shadow cut-out), and floats a card with the lesson.
// Esc / ←/→ also drive it. The page nudges the budget per step to demonstrate.

import { useEffect, useState } from "react";

export interface TourStep {
  selector: string; // element to spotlight
  title: string;
  body: string;
}

interface Props {
  steps: TourStep[];
  index: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}

const CARD_W = 340;
const PAD = 8;

export function Tour({ steps, index, onNext, onBack, onClose }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[index];

  // Track the target's position (it moves as we scroll it into view).
  useEffect(() => {
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    const settle = setTimeout(measure, 380);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(settle);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.selector]);

  // Keyboard: Esc closes, arrows navigate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onBack]);

  const spotlight = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // Place the card below the spotlight if there's room, else above; clamp to viewport.
  let cardStyle: React.CSSProperties;
  if (spotlight) {
    const below = spotlight.top + spotlight.height + 12;
    const roomBelow = window.innerHeight - below;
    const top = roomBelow > 230 ? below : Math.max(12, spotlight.top - 244);
    const left = Math.max(16, Math.min(spotlight.left, window.innerWidth - CARD_W - 16));
    cardStyle = { top, left };
  } else {
    cardStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  const last = index === steps.length - 1;

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Guided tour">
      {spotlight ? <div className="tour-spotlight" style={spotlight} /> : <div className="tour-backdrop-full" />}
      <div className="tour-card" style={{ width: CARD_W, ...cardStyle }}>
        <div className="tour-step-count">
          Step {index + 1} of {steps.length}
        </div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        <div className="tour-dots">
          {steps.map((_, i) => (
            <span key={i} className={i === index ? "on" : ""} />
          ))}
        </div>
        <div className="tour-actions">
          <button className="tour-skip" onClick={onClose}>
            Skip tour
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {index > 0 && (
              <button className="tour-btn ghost" onClick={onBack}>
                Back
              </button>
            )}
            <button className="tour-btn" onClick={onNext}>
              {last ? "Done" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

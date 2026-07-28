"use client";

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { DiscoveryCard } from "../lib/demo-data";
import { venueLabel } from "../lib/discovery-policy";

export type SwipeDirection = "left" | "right";

type SwipeDeckProps = {
  cards: DiscoveryCard[];
  matchScore: number;
  isSaved: boolean;
  onSwipe: (direction: SwipeDirection) => void;
  onOpenDetails: () => void;
};

const SWIPE_THRESHOLD = 110;
const EXIT_DISTANCE = 520;

export function SwipeDeck({
  cards,
  matchScore,
  isSaved,
  onSwipe,
  onOpenDetails,
}: SwipeDeckProps) {
  const current = cards[0];
  const next = cards[1];
  const third = cards[2];

  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const dragRef = useRef({ x: 0, y: 0, active: false, pointerId: -1 });
  const startRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);
  const exitingRef = useRef(false);

  function resetDrag() {
    dragRef.current = { x: 0, y: 0, active: false, pointerId: -1 };
    setDrag({ x: 0, y: 0, active: false });
    movedRef.current = false;
  }

  function animateExit(direction: SwipeDirection) {
    if (exitingRef.current || !current) return;
    exitingRef.current = true;
    const x = direction === "right" ? EXIT_DISTANCE : -EXIT_DISTANCE;
    setDrag({ x, y: -24, active: false });
    window.setTimeout(() => {
      onSwipe(direction);
      resetDrag();
      exitingRef.current = false;
    }, 260);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (exitingRef.current || !current) return;
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = { x: event.clientX, y: event.clientY };
    dragRef.current = {
      x: 0,
      y: 0,
      active: true,
      pointerId: event.pointerId,
    };
    setDrag({ x: 0, y: 0, active: true });
    movedRef.current = false;
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId !== event.pointerId) return;
    const x = event.clientX - startRef.current.x;
    const y = (event.clientY - startRef.current.y) * 0.35;
    if (Math.abs(x) > 8 || Math.abs(y) > 8) movedRef.current = true;
    dragRef.current = { ...dragRef.current, x, y };
    setDrag({ x, y, active: true });
  }

  function finishDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released.
    }

    const { x } = dragRef.current;
    if (x > SWIPE_THRESHOLD) {
      animateExit("right");
      return;
    }
    if (x < -SWIPE_THRESHOLD) {
      animateExit("left");
      return;
    }

    if (!movedRef.current) {
      resetDrag();
      onOpenDetails();
      return;
    }

    resetDrag();
  }

  if (!current) return null;

  const rotation = drag.x * 0.045;
  const likeOpacity = Math.min(1, Math.max(0, drag.x / 100));
  const passOpacity = Math.min(1, Math.max(0, -drag.x / 100));
  const nextScale = 0.94 + Math.min(0.06, Math.abs(drag.x) / 1800);

  return (
    <div className="swipe-deck" aria-live="polite">
      {third && (
        <article
          className="swipe-card swipe-card--back swipe-card--far"
          aria-hidden="true"
        >
          <div
            className="swipe-card__media"
            style={{ backgroundImage: `url(${third.imageUrl})` }}
          />
        </article>
      )}
      {next && (
        <article
          className="swipe-card swipe-card--back"
          aria-hidden="true"
          style={{ transform: `scale(${nextScale})` }}
        >
          <div
            className="swipe-card__media"
            style={{ backgroundImage: `url(${next.imageUrl})` }}
          />
          <div className="swipe-card__scrim" />
          <div className="swipe-card__body">
            <h2>{next.dish}</h2>
            <p>{next.restaurant}</p>
          </div>
        </article>
      )}

      <article
        key={current.id}
        className={`swipe-card swipe-card--front${drag.active ? " is-dragging" : ""}`}
        style={{
          transform: `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${rotation}deg)`,
          transition: drag.active
            ? "none"
            : "transform 280ms cubic-bezier(.2,.8,.2,1)",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        role="button"
        tabIndex={0}
        aria-label={`${current.dish} at ${current.restaurant}. Swipe right for more like this, left for not now, or tap for details.`}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") animateExit("right");
          if (event.key === "ArrowLeft") animateExit("left");
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenDetails();
          }
        }}
      >
        <div
          className="swipe-card__media"
          style={{ backgroundImage: `url(${current.imageUrl})` }}
          role="img"
          aria-label={`Illustrative photo for ${current.dish}`}
        />
        <div className="swipe-card__scrim" />

        <div
          className="swipe-stamp swipe-stamp--like"
          style={{ opacity: likeOpacity }}
          aria-hidden="true"
        >
          YES
        </div>
        <div
          className="swipe-stamp swipe-stamp--pass"
          style={{ opacity: passOpacity }}
          aria-hidden="true"
        >
          NOPE
        </div>

        <div className="swipe-card__topline">
          <span className="match-pill">{matchScore}% MATCH</span>
          <span className="distance-pill">{current.distance}</span>
        </div>

        {isSaved && <span className="saved-badge">Saved</span>}

        <div className="swipe-card__body">
          <p className="swipe-card__meta">
            {venueLabel(current.venueType)} · {current.cuisine} · {current.price}
          </p>
          <h2>{current.dish}</h2>
          <h3>{current.restaurant}</h3>
          <small className="locality-caption">{current.localityLabel}</small>
          <div className="tag-row">
            {current.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <p className="swipe-hint">Tap for details · Swipe to decide</p>
        </div>

        <a
          className="photo-credit"
          href={current.photoCreditUrl}
          target="_blank"
          rel="noreferrer"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          Demo photo · Unsplash
        </a>
      </article>
    </div>
  );
}

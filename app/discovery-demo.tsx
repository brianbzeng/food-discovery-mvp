"use client";

import { FormEvent, useMemo, useState } from "react";
import { demoCards, type DiscoveryCard } from "./lib/demo-data";

const filters = ["Open now", "Under $25", "Vegetarian", "Delivery"];

function matchesPrompt(card: DiscoveryCard, prompt: string) {
  const value = prompt.toLowerCase();
  const searchable = [
    card.dish,
    card.cuisine,
    card.neighborhood,
    ...card.tags,
  ]
    .join(" ")
    .toLowerCase();

  const meaningfulTerms = value
    .replace(
      /\b(i|want|something|somewhere|find|me|near|nearby|open|now|under|for|with|and|a|an|the)\b/g,
      " ",
    )
    .split(/\s+/)
    .filter((term) => term.length > 2 && !/^\$?\d+$/.test(term));

  return meaningfulTerms.length === 0
    ? true
    : meaningfulTerms.some((term) => searchable.includes(term));
}

export function DiscoveryDemo() {
  const [queue, setQueue] = useState(demoCards);
  const [activeFilters, setActiveFilters] = useState<string[]>(["Open now"]);
  const [saved, setSaved] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState(
    "Starting with popular independent spots near you.",
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [signals, setSignals] = useState(0);

  const current = queue[0] ?? demoCards[0];
  const tasteProgress = Math.min(92, 18 + signals * 11);

  const supportingCards = useMemo(() => {
    const source = queue.length > 1 ? queue.slice(1) : demoCards;
    return source.slice(0, 3);
  }, [queue]);

  function moveCard(action: "pass" | "like") {
    setQueue((cards) => {
      const next = cards.length > 1 ? cards.slice(1) : demoCards;
      return next;
    });
    setSignals((value) => value + 1);
    setDetailOpen(false);
    setStatus(
      action === "like"
        ? `Got it — more ${current.cuisine.toLowerCase()} and ${current.tags[0].toLowerCase()} picks.`
        : "Noted for this moment. We will keep your broader taste profile open.",
    );
  }

  function toggleSave() {
    setSaved((items) =>
      items.includes(current.id)
        ? items.filter((id) => id !== current.id)
        : [...items, current.id],
    );
    setSignals((value) => value + 1);
    setStatus(
      saved.includes(current.id)
        ? "Removed from your shortlist."
        : `${current.restaurant} is saved to your shortlist.`,
    );
  }

  function toggleFilter(filter: string) {
    setActiveFilters((items) =>
      items.includes(filter)
        ? items.filter((item) => item !== filter)
        : [...items, filter],
    );
  }

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const matches = demoCards.filter((card) => matchesPrompt(card, trimmed));
    setQueue(matches.length > 0 ? matches : demoCards);
    setDetailOpen(false);
    setSignals((value) => value + 1);
    setStatus(
      matches.length > 0
        ? `Found ${matches.length} grounded match${matches.length === 1 ? "" : "es"} for “${trimmed}”.`
        : "No exact demo match yet, so we kept your safety settings and broadened the cuisine.",
    );
    setPrompt("");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="working-mark" href="#discover" aria-label="Food discovery home">
          <span className="mark-dot" />
          FOOD / NEARBY
          <small>working title</small>
        </a>
        <nav className="topnav" aria-label="Primary navigation">
          <a className="active" href="#discover">
            Discover
          </a>
          <a href="#shortlist">Shortlist {saved.length > 0 && `(${saved.length})`}</a>
          <button className="avatar" aria-label="Open profile">
            BZ
          </button>
        </nav>
      </header>

      <section className="workspace" id="discover">
        <aside className="intro-panel">
          <p className="eyebrow">SAN FRANCISCO · DINNER</p>
          <h1>
            Find the food
            <br />
            you mean.
          </h1>
          <p className="intro-copy">
            Swipe when you&apos;re open to ideas. Ask when you already have a
            craving. Every choice makes the next one sharper.
          </p>

          <form className="prompt-box" onSubmit={submitPrompt}>
            <label htmlFor="food-prompt">What sounds good?</label>
            <div className="prompt-row">
              <input
                id="food-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Spicy noodles under $25…"
              />
              <button type="submit" aria-label="Search">
                ↗
              </button>
            </div>
            <p>Try “cozy vegetarian dinner” or “crispy delivery.”</p>
          </form>

          <div className="filter-list" aria-label="Discovery filters">
            {filters.map((filter) => (
              <button
                className={activeFilters.includes(filter) ? "selected" : ""}
                key={filter}
                onClick={() => toggleFilter(filter)}
                type="button"
              >
                {activeFilters.includes(filter) ? "✓ " : "+ "}
                {filter}
              </button>
            ))}
          </div>

          <div className="safety-note">
            <span className="safety-icon">!</span>
            <div>
              <strong>Peanut allergy saved</strong>
              <p>Unknown information stays visible with a warning.</p>
            </div>
            <button aria-label="Edit allergy settings">Edit</button>
          </div>
        </aside>

        <section className="feed-stage" aria-label="Restaurant discovery feed">
          <div className="feed-meta">
            <div>
              <span>FOR YOU</span>
              <strong>{status}</strong>
            </div>
            <p>{queue.length} picks in this set</p>
          </div>

          <article className="food-card">
            <div
              className="food-image"
              style={{ backgroundImage: `url(${current.imageUrl})` }}
              role="img"
              aria-label={`Illustrative photo for ${current.dish}`}
            >
              <div className="card-scrim" />
              <div className="card-topline">
                <span className="match-pill">{current.match}% MATCH</span>
                <span className="distance-pill">{current.distance}</span>
              </div>
              <div className="card-copy">
                <p>
                  {current.cuisine} · {current.price}
                </p>
                <h2>{current.dish}</h2>
                <h3>{current.restaurant}</h3>
                <div className="tag-row">
                  {current.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
              <a
                className="photo-credit"
                href={current.photoCreditUrl}
                target="_blank"
                rel="noreferrer"
              >
                Demo photo · Unsplash
              </a>
            </div>

            <div className="evidence-strip">
              <div>
                <span className={current.allergyStatus === "verified" ? "verified" : "unknown"}>
                  {current.allergyStatus === "verified" ? "✓" : "!"}
                </span>
                <p>
                  <strong>{current.allergyLabel}</strong>
                  <small>{current.allergyDetail}</small>
                </p>
              </div>
              <button type="button" onClick={() => setDetailOpen((value) => !value)}>
                Evidence
              </button>
            </div>

            <div className="card-actions">
              <button
                className="pass"
                type="button"
                onClick={() => moveCard("pass")}
                aria-label="Pass for now"
              >
                ×
                <span>Not now</span>
              </button>
              <button
                className={saved.includes(current.id) ? "save saved" : "save"}
                type="button"
                onClick={toggleSave}
                aria-label="Save restaurant"
              >
                {saved.includes(current.id) ? "♥" : "♡"}
                <span>Save</span>
              </button>
              <button
                className="like"
                type="button"
                onClick={() => moveCard("like")}
                aria-label="Show more like this"
              >
                →
                <span>More like this</span>
              </button>
            </div>
          </article>
        </section>

        <aside className="taste-panel">
          <div className="taste-card">
            <div className="taste-heading">
              <p className="eyebrow">YOUR TASTE / BETA</p>
              <span>{tasteProgress}%</span>
            </div>
            <h2>Getting warmer.</h2>
            <p>
              {signals < 3
                ? "A few more choices will help separate everyday favorites from tonight’s mood."
                : "Your preference map is starting to distinguish permanent tastes from momentary cravings."}
            </p>
            <div className="progress-track">
              <span style={{ width: `${tasteProgress}%` }} />
            </div>
            <div className="taste-signals">
              <span>Spicy</span>
              <span>Noodles</span>
              <span>Independent</span>
              <span className="muted">Fine dining</span>
            </div>
          </div>

          <div className="next-list">
            <div className="section-label">
              <span>NEXT UP</span>
              <button type="button">View all</button>
            </div>
            {supportingCards.map((card, index) => (
              <button
                className="mini-card"
                key={`${card.id}-${index}`}
                type="button"
                onClick={() =>
                  setQueue([
                    card,
                    ...demoCards.filter((item) => item.id !== card.id),
                  ])
                }
              >
                <span
                  className="mini-image"
                  style={{ backgroundImage: `url(${card.imageUrl})` }}
                />
                <span>
                  <strong>{card.dish}</strong>
                  <small>
                    {card.restaurant} · {card.distance}
                  </small>
                </span>
                <b>{card.match}%</b>
              </button>
            ))}
          </div>

          <div className="product-principle">
            <span>01</span>
            <p>
              A left swipe means <strong>“not now,”</strong> not “never.” Context
              matters.
            </p>
          </div>
        </aside>
      </section>

      {detailOpen && (
        <section className="detail-drawer" aria-label="Restaurant details">
          <button
            className="drawer-close"
            type="button"
            onClick={() => setDetailOpen(false)}
            aria-label="Close restaurant details"
          >
            ×
          </button>
          <p className="eyebrow">RESTAURANT DETAILS · DEMO DATA</p>
          <h2>{current.restaurant}</h2>
          <p className="drawer-address">
            {current.neighborhood}, San Francisco · {current.distance}
          </p>
          <div className="drawer-grid">
            <div>
              <span>Hours</span>
              <strong>{current.hours}</strong>
            </div>
            <div>
              <span>Service</span>
              <strong>{current.serviceModes.join(" · ")}</strong>
            </div>
            <div>
              <span>Allergy information</span>
              <strong>{current.allergyDetail}</strong>
            </div>
            <div>
              <span>Last checked</span>
              <strong>Demo record · July 2026</strong>
            </div>
          </div>
          <div className="drawer-warning">
            <strong>Always confirm severe allergies with the restaurant.</strong>
            This prototype never treats missing information as proof of safety.
          </div>
          <div className="drawer-actions">
            <button type="button">View menu ↗</button>
            <button type="button">Call restaurant ↗</button>
            <button type="button">Directions ↗</button>
          </div>
        </section>
      )}

      <footer className="prototype-footer">
        <span>INTERACTIVE PRODUCT FOUNDATION</span>
        <p>Fictional restaurant data · San Francisco pilot</p>
      </footer>
    </main>
  );
}

"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { demoCards, type DiscoveryCard } from "./lib/demo-data";
import { venueLabel } from "./lib/discovery-policy";
import {
  rankTasteCards,
  scoreTasteCard,
  type MealOccasion,
  type TasteEventType,
} from "./lib/taste-learning";
import {
  allergenOptions,
  dietaryOptions,
  restrictionLabel,
} from "./lib/restrictions";
import { SiteFooter } from "./components/site-footer";

const filters = [
  "Open now",
  "Under $25",
  "Vegetarian",
  "Cafés",
  "Boba & tea",
];

const mealChoices: Array<{ key: MealOccasion; label: string }> = [
  { key: "breakfast", label: "Breakfast" },
  { key: "brunch", label: "Brunch" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "late-night", label: "Late night" },
  { key: "snack", label: "Snack" },
];

type PublicTasteProfile = {
  explicitPreferences: Record<string, number>;
  learnedWeights: Record<string, number>;
  occasionWeights: Record<string, Record<string, number>>;
  strongestSignals: string[];
  totalSignals: number;
  version: number;
  dietaryRestrictions: string[];
  allergens: string[];
  showUnknownAllergyMatches: boolean;
  allergenStrictness: "dish-aware" | "strict";
};

type SyncState = "loading" | "saved" | "saving" | "unavailable";
type LocationState = "idle" | "loading" | "active" | "unavailable";
type Coordinates = { latitude: number; longitude: number };

type PlaceDetails = {
  name: string;
  address: {
    line1: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
  };
  phone: string | null;
  websiteUrl: string | null;
  menuUrl: string | null;
  directionsUrl: string | null;
  verifiedAt: number | null;
  hours: Array<{
    dayOfWeek: number;
    opensAt: string | null;
    closesAt: string | null;
    isClosed: boolean;
    sourceType: string;
    verifiedAt: number | null;
  }>;
};

type AccountSummary = {
  authenticated: boolean;
  principalType: "user" | "guest";
  savedCount: number;
  interactionCount: number;
};

type FeedResponse = {
  recommendations: Array<{
    restaurantId: string;
    dishCardId: string;
    score: number;
    warnings: Array<{
      code:
        | "allergen-unknown"
        | "cross-contact"
        | "stale-source"
        | "service-unverified";
      message: string;
    }>;
    place: {
      restaurantName: string;
      title: string;
      venueType: DiscoveryCard["venueType"];
      ownershipType: DiscoveryCard["ownershipType"];
      neighborhood: string;
      cuisineTags: string[];
      dishTags: string[];
      priceDisplay?: string;
      serviceModes: string[];
      evidence: Array<{
        restrictionKey: string;
        status: "contains" | "compatible" | "accommodates" | "unknown";
        sourceType: string;
        verifiedAt?: number;
      }>;
    };
  }>;
  meta: {
    returned: number;
  };
};

type AssistantResponse = FeedResponse & {
  assistantMessage: string;
  interpretation: {
    chips: Array<{ key: string; label: string }>;
  };
};

function venueTypesForFilters(activeFilters: string[]) {
  return [
    ...(activeFilters.includes("Cafés") ? ["cafe", "bakery"] : []),
    ...(activeFilters.includes("Boba & tea") ? ["boba", "tea_house"] : []),
  ];
}

function cardsFromFeed(feed: FeedResponse): DiscoveryCard[] {
  return feed.recommendations.map((recommendation) => {
    const card =
      demoCards.find(
        (candidate) => candidate.id === recommendation.dishCardId,
      ) ??
      demoCards.find(
        (candidate) =>
          candidate.restaurantId === recommendation.restaurantId,
      ) ??
      demoCards[0];
    const place = recommendation.place;

    const unknownWarning = recommendation.warnings.find(
      (warning) => warning.code === "allergen-unknown",
    );
    const crossContactWarning = recommendation.warnings.find(
      (warning) => warning.code === "cross-contact",
    );
    const safetyWarning = unknownWarning ?? crossContactWarning;
    const evidence = recommendation.place.evidence.find(
      (item) =>
        item.status === "compatible" || item.status === "accommodates",
    );

    return {
        ...card,
        id: recommendation.dishCardId,
        restaurantId: recommendation.restaurantId,
        restaurant: place.restaurantName,
        dish: place.title,
        cuisine: place.cuisineTags[0] ?? venueLabel(place.venueType),
        venueType: place.venueType,
        ownershipType: place.ownershipType,
        localityLabel:
          place.ownershipType === "independent"
            ? "Independent local business"
            : "Small local restaurant group",
        neighborhood: place.neighborhood,
        price: place.priceDisplay ?? card.price,
        tags: place.dishTags,
        preferenceKeys: [
          `venue:${place.venueType}`,
          `locality:${place.ownershipType}`,
          `neighborhood:${place.neighborhood}`,
          ...place.cuisineTags.map((tag) => `cuisine:${tag}`),
          ...place.dishTags.map((tag) => `tag:${tag}`),
        ],
        serviceModes: place.serviceModes,
        match: recommendation.score,
        allergyStatus: safetyWarning
          ? "unknown"
          : evidence
            ? "verified"
            : card.allergyStatus,
        allergyLabel: unknownWarning
          ? "Allergy information unknown"
          : crossContactWarning
            ? "Dish evidence found; cross-contact unknown"
            : evidence
              ? `${restrictionLabel(evidence.restrictionKey)} evidence available`
              : card.allergyLabel,
        allergyDetail:
          safetyWarning?.message ??
          (evidence
            ? `${evidence.status === "compatible" ? "Marked compatible" : "Accommodation reported"} · ${evidence.sourceType.replace("_", " ")}`
            : card.allergyDetail),
        evidenceSource: evidence?.sourceType.replace("_", " "),
        evidenceVerifiedAt: evidence?.verifiedAt,
      };
  });
}

async function fetchFeedCards(
  query: string | undefined,
  filtersForRequest: string[],
  coordinates?: Coordinates,
  occasion?: MealOccasion,
): Promise<DiscoveryCard[]> {
  const url = new URL("/api/v1/feed", window.location.origin);
  if (query) url.searchParams.set("q", query);
  if (occasion) url.searchParams.set("occasion", occasion);
  for (const venueType of venueTypesForFilters(filtersForRequest)) {
    url.searchParams.append("venueType", venueType);
  }
  if (filtersForRequest.includes("Under $25")) {
    url.searchParams.append("priceTier", "1");
    url.searchParams.append("priceTier", "2");
  }
  if (filtersForRequest.includes("Vegetarian")) {
    url.searchParams.append("dietaryRestriction", "vegetarian");
  }
  if (filtersForRequest.includes("Open now")) {
    url.searchParams.set("openNow", "true");
  }
  if (coordinates) {
    url.searchParams.set("latitude", String(coordinates.latitude));
    url.searchParams.set("longitude", String(coordinates.longitude));
    url.searchParams.set("radiusMeters", "8000");
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error("Feed unavailable");
  return cardsFromFeed((await response.json()) as FeedResponse);
}

function matchesFilters(card: DiscoveryCard, activeFilters: string[]) {
  const venueFilters = activeFilters.filter(
    (filter) => filter === "Cafés" || filter === "Boba & tea",
  );
  const venueMatches =
    venueFilters.length === 0 ||
    (venueFilters.includes("Cafés") &&
      (card.venueType === "cafe" || card.venueType === "bakery")) ||
    (venueFilters.includes("Boba & tea") &&
      (card.venueType === "boba" || card.venueType === "tea_house"));

  return (
    venueMatches &&
    (!activeFilters.includes("Under $25") ||
      card.price === "$" ||
      card.price === "$$") &&
    (!activeFilters.includes("Vegetarian") ||
      card.tags.some((tag) =>
        ["vegetarian", "vegan"].includes(tag.toLowerCase()),
      ))
  );
}

function matchesPrompt(card: DiscoveryCard, prompt: string) {
  const value = prompt.toLowerCase();
  const searchable = [
    card.restaurant,
    card.dish,
    card.cuisine,
    venueLabel(card.venueType),
    card.venueType,
    card.localityLabel,
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
  const [learnedWeights, setLearnedWeights] = useState<Record<string, number>>(
    {},
  );
  const [tasteSignals, setTasteSignals] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [occasion, setOccasion] = useState<MealOccasion>();
  const [interpretedChips, setInterpretedChips] = useState<
    Array<{ key: string; label: string }>
  >([]);
  const [status, setStatus] = useState(
    "Starting with independent eateries, cafés, and drink spots near you.",
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [shortlistOpen, setShortlistOpen] = useState(false);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [showUnknownAllergyMatches, setShowUnknownAllergyMatches] =
    useState(true);
  const [allergenStrictness, setAllergenStrictness] = useState<
    "dish-aware" | "strict"
  >("dish-aware");
  const [signals, setSignals] = useState(0);
  const profileVersion = useRef(0);
  const accountPrompted = useRef(false);
  const discoveryChoices = useRef(0);
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [coordinates, setCoordinates] = useState<Coordinates | undefined>();

  const current = queue[0];
  const tasteProgress = Math.min(92, 18 + signals * 11);
  const currentMatch = current ? scoreTasteCard(current, learnedWeights) : 0;
  const visibleTasteSignals =
    tasteSignals.length > 0
      ? tasteSignals
      : ["Independent", "Neighborhood spots", "Cafés + boba"];
  const safetyTitle =
    allergens.length > 0
      ? `${restrictionLabel(allergens[0])}${allergens.length > 1 ? ` +${allergens.length - 1}` : ""} ${allergens.length === 1 ? "allergy" : "allergies"} saved`
      : dietaryRestrictions.length > 0
        ? `${restrictionLabel(dietaryRestrictions[0])} saved`
        : "No dietary filters saved";

  const supportingCards = useMemo(() => {
    const source = queue.length > 1 ? queue.slice(1) : demoCards;
    return source.slice(0, 3);
  }, [queue]);
  const savedCards = useMemo(
    () => demoCards.filter((card) => saved.includes(card.restaurantId)),
    [saved],
  );

  const requestFeed = useCallback(
    async (
      query: string | undefined,
      filtersForRequest: string[],
      coordinateOverride?: Coordinates,
      occasionOverride?: MealOccasion,
    ) => {
      try {
        const cards = await fetchFeedCards(
          query,
          filtersForRequest,
          coordinateOverride ?? coordinates,
          occasionOverride ?? occasion,
        );
        setQueue(cards);
        return cards;
      } catch {
        // The local demo catalog remains available while durable feed storage
        // reconnects. It is never used to weaken allergy or ownership policy.
        return undefined;
      }
    },
    [coordinates, occasion],
  );

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationState("unavailable");
      setStatus("Location is unavailable in this browser.");
      return;
    }

    setLocationState("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCoordinates(nextCoordinates);
        setLocationState("active");
        void requestFeed(undefined, activeFilters, nextCoordinates).then(
          (cards) => {
            setStatus(
              cards && cards.length > 0
                ? `Showing ${cards.length} eligible local ${cards.length === 1 ? "spot" : "spots"} within 5 miles.`
                : "No reviewed pilot spots are within 5 miles yet. Try the San Francisco pilot without location.",
            );
          },
        );
      },
      () => {
        setLocationState("unavailable");
        setStatus(
          "Location was not shared. The San Francisco pilot remains available.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  function chooseOccasion(nextOccasion: MealOccasion) {
    setOccasion(nextOccasion);
    setStatus(`Personalizing this set for ${nextOccasion.replace("-", " ")}.`);
    void requestFeed(
      undefined,
      activeFilters,
      coordinates,
      nextOccasion,
    ).then((cards) => {
      if (cards && cards.length > 0) {
        setStatus(
          `${cards.length} local ${cards.length === 1 ? "pick" : "picks"} for ${nextOccasion.replace("-", " ")}.`,
        );
      }
    });
  }

  useEffect(() => {
    let cancelled = false;

    void fetchFeedCards(undefined, ["Open now"])
      .then((cards) => {
        if (!cancelled && cards.length > 0) setQueue(cards);
      })
      .catch(() => {
        // The fictional eligible catalog stays visible for local development.
      });

    void fetch("/api/v1/taste-profile")
      .then(async (response) => {
        if (!response.ok) throw new Error("Taste storage unavailable");
        return (await response.json()) as { profile: PublicTasteProfile };
      })
      .then(({ profile }) => {
        if (cancelled) return;
        setLearnedWeights(profile.learnedWeights);
        setTasteSignals(profile.strongestSignals);
        setSignals(profile.totalSignals);
        profileVersion.current = profile.version;
        setAllergens(profile.allergens);
        setDietaryRestrictions(profile.dietaryRestrictions);
        setShowUnknownAllergyMatches(profile.showUnknownAllergyMatches);
        setAllergenStrictness(profile.allergenStrictness);
        setQueue((cards) => rankTasteCards(cards, profile.learnedWeights));
        setSyncState("saved");
      })
      .catch(() => {
        if (!cancelled) setSyncState("unavailable");
      });

    void fetch("/api/v1/saves")
      .then(async (response) => {
        if (!response.ok) throw new Error("Saves unavailable");
        return (await response.json()) as {
          saves: Array<{ restaurantId: string }>;
        };
      })
      .then(({ saves }) => {
        if (!cancelled) {
          setSaved(saves.map((save) => save.restaurantId));
        }
      })
      .catch(() => {
        // An unavailable shortlist does not block discovery.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function closeDrawers(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSettingsOpen(false);
      setAccountOpen(false);
      setShortlistOpen(false);
      setDetailOpen(false);
    }
    document.addEventListener("keydown", closeDrawers);
    return () => document.removeEventListener("keydown", closeDrawers);
  }, []);

  function applyProfile(profile: PublicTasteProfile) {
    if (profile.version < profileVersion.current) return;
    setLearnedWeights(profile.learnedWeights);
    setTasteSignals(profile.strongestSignals);
    setSignals(profile.totalSignals);
    profileVersion.current = profile.version;
    setAllergens(profile.allergens);
    setDietaryRestrictions(profile.dietaryRestrictions);
    setShowUnknownAllergyMatches(profile.showUnknownAllergyMatches);
    setAllergenStrictness(profile.allergenStrictness);
    setQueue((cards) => rankTasteCards(cards, profile.learnedWeights));
  }

  function toggleSetting(
    key: string,
    values: string[],
    setter: (value: string[]) => void,
  ) {
    setter(
      values.includes(key)
        ? values.filter((value) => value !== key)
        : [...values, key],
    );
  }

  async function saveSafetySettings() {
    setSettingsSaving(true);
    try {
      const response = await fetch("/api/v1/taste-profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          allergens,
          dietaryRestrictions,
          showUnknownAllergyMatches,
          allergenStrictness,
        }),
      });
      if (!response.ok) throw new Error("Settings unavailable");
      const result = (await response.json()) as {
        profile: PublicTasteProfile;
      };
      applyProfile(result.profile);
      setSettingsOpen(false);
      setSyncState("saved");
      setStatus(
        showUnknownAllergyMatches
          ? "Safety settings saved. Unknown evidence will remain visibly flagged."
          : "Safety settings saved. Places with unknown evidence are now hidden.",
      );
      void requestFeed(undefined, activeFilters);
    } catch {
      setSyncState("unavailable");
    } finally {
      setSettingsSaving(false);
    }
  }

  function openAccount() {
    setAccountOpen(true);
    setDeleteConfirm(false);
    void fetch("/api/v1/account")
      .then(async (response) => {
        if (!response.ok) throw new Error("Account unavailable");
        return (await response.json()) as { account: AccountSummary };
      })
      .then((result) => setAccount(result.account))
      .catch(() => setAccount(null));
  }

  async function deleteAccount() {
    try {
      const response = await fetch("/api/v1/account", { method: "DELETE" });
      if (!response.ok) throw new Error("Deletion unavailable");
      setAccountOpen(false);
      setAccount(null);
      setDeleteConfirm(false);
      setSaved([]);
      setLearnedWeights({});
      setTasteSignals([]);
      setSignals(0);
      discoveryChoices.current = 0;
      accountPrompted.current = false;
      setAllergens([]);
      setDietaryRestrictions([]);
      setShowUnknownAllergyMatches(true);
      setAllergenStrictness("dish-aware");
      setQueue(demoCards);
      setStatus("Your saved discovery data has been deleted.");
    } catch {
      setStatus("Your data could not be deleted yet.");
    }
  }

  function remember(
    eventType: TasteEventType,
    card: DiscoveryCard,
    reasonCode?: string,
  ) {
    setSyncState("saving");

    void fetch("/api/v1/interactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restaurantId: card.restaurantId,
        dishCardId: card.id,
        eventType,
        reasonCode,
        occasion,
        preferenceKeys: card.preferenceKeys,
        context: {
          venueType: card.venueType,
          ownershipType: card.ownershipType,
          neighborhood: card.neighborhood,
          activeFilters,
        },
      }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Interaction storage unavailable");
        return (await response.json()) as { profile: PublicTasteProfile };
      })
      .then(({ profile }) => {
        applyProfile(profile);
        setSyncState("saved");
      })
      .catch(() => setSyncState("unavailable"));
  }

  function moveCard(action: "pass" | "like") {
    if (!current) return;
    remember(action, current);
    discoveryChoices.current += 1;
    setQueue((cards) => {
      const next = cards.length > 1 ? cards.slice(1) : demoCards;
      return next;
    });
    setSignals((value) => value + 1);
    if (
      discoveryChoices.current >= 5 &&
      !account?.authenticated &&
      !accountPrompted.current
    ) {
      accountPrompted.current = true;
      openAccount();
    }
    setDetailOpen(false);
    setPlaceDetails(null);
    setStatus(
      action === "like"
        ? `Got it — more ${current.cuisine.toLowerCase()} and ${current.tags[0].toLowerCase()} picks.`
        : "Noted for this moment. We will keep your broader taste profile open.",
    );
  }

  function toggleSave(card = current) {
    if (!card) return;
    const wasSaved = saved.includes(card.restaurantId);
    setSaved((items) =>
      wasSaved
        ? items.filter((id) => id !== card.restaurantId)
        : [...items, card.restaurantId],
    );
    remember(wasSaved ? "unsave" : "save", card);
    setSignals((value) => value + 1);
    if (
      !wasSaved &&
      !account?.authenticated &&
      !accountPrompted.current
    ) {
      accountPrompted.current = true;
      openAccount();
    }
    setStatus(
      wasSaved
        ? "Removed from your shortlist."
        : `${card.restaurant} is saved to your shortlist.`,
    );

    void fetch(`/api/v1/saves/${encodeURIComponent(card.restaurantId)}`, {
      method: wasSaved ? "DELETE" : "PUT",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Shortlist unavailable");
        return (await response.json()) as {
          saves: Array<{ restaurantId: string }>;
        };
      })
      .then(({ saves }) =>
        setSaved(saves.map((save) => save.restaurantId)),
      )
      .catch(() => {
        setSaved((items) =>
          wasSaved
            ? Array.from(new Set([...items, card.restaurantId]))
            : items.filter((id) => id !== card.restaurantId),
        );
        setStatus("Your shortlist could not be updated yet.");
      });
  }

  function openDetails() {
    if (!current) return;
    if (!detailOpen) remember("detail", current);
    setDetailOpen(true);
    setPlaceDetails(null);

    void fetch(
      `/api/v1/restaurants/${encodeURIComponent(current.restaurantId)}`,
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Details unavailable");
        return (await response.json()) as { restaurant: PlaceDetails };
      })
      .then(({ restaurant }) => setPlaceDetails(restaurant))
      .catch(() => {
        // The card still exposes clearly labeled demo details.
      });
  }

  function toggleFilter(filter: string) {
    setActiveFilters((items) => {
      const nextFilters = items.includes(filter)
        ? items.filter((item) => item !== filter)
        : [...items, filter];
      const matches = demoCards.filter((card) =>
        matchesFilters(card, nextFilters),
      );
      setQueue(
        rankTasteCards(matches.length > 0 ? matches : demoCards, learnedWeights),
      );
      setStatus(
        matches.length > 0
          ? `${matches.length} local match${matches.length === 1 ? "" : "es"} fit your filters.`
          : "No local spots match every filter, so the full independent set is back.",
      );
      void requestFeed(undefined, nextFilters);
      return nextFilters;
    });
  }

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const localMatches = demoCards
      .filter((card) => matchesPrompt(card, trimmed))
      .filter((card) => matchesFilters(card, activeFilters));
    setQueue(
      rankTasteCards(
        localMatches.length > 0 ? localMatches : demoCards,
        learnedWeights,
      ),
    );
    setDetailOpen(false);
    setSignals((value) => value + 1);
    setStatus(
      localMatches.length > 0
        ? `Found ${localMatches.length} grounded match${localMatches.length === 1 ? "" : "es"} for “${trimmed}”.`
        : "No exact demo match yet, so we kept your safety settings and broadened the cuisine.",
    );
    setPrompt("");

    void fetch("/api/v1/assistant/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: trimmed,
        occasion,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        radiusMeters: coordinates ? 8_000 : undefined,
        openNow: activeFilters.includes("Open now"),
        venueTypes: venueTypesForFilters(activeFilters),
        priceTiers: activeFilters.includes("Under $25") ? [1, 2] : [],
        dietaryRestrictions: activeFilters.includes("Vegetarian")
          ? ["vegetarian"]
          : [],
      }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Search unavailable");
        return (await response.json()) as AssistantResponse;
      })
      .then((feed) => {
        const cards = cardsFromFeed(feed);
        if (cards.length > 0) setQueue(cards);
        setInterpretedChips(feed.interpretation.chips);
        setStatus(feed.assistantMessage);
      })
      .catch(() => {
        // Keep the immediate local results when the search service is offline.
      });
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
          <a href="/party">Group plan</a>
          <button type="button" onClick={() => setShortlistOpen(true)}>
            Shortlist {saved.length > 0 && `(${saved.length})`}
          </button>
          <button
            className="avatar"
            aria-label="Open profile"
            onClick={openAccount}
            type="button"
          >
            BZ
          </button>
        </nav>
      </header>

      <section className="workspace" id="discover">
        <aside className="intro-panel">
          <p className="eyebrow">SAN FRANCISCO · LOCAL DISCOVERY</p>
          <h1>
            Find the food
            <br />
            you mean.
          </h1>
          <p className="intro-copy">
            Swipe through independent restaurants, cafés, boba shops, and other
            neighborhood finds. Ask when you already have a craving. Every
            choice makes the next one sharper.
          </p>

          <div className="filter-list" aria-label="Choose a meal">
            <span className="eyebrow">HUNGRY FOR</span>
            {mealChoices.map((meal) => (
              <button
                className={occasion === meal.key ? "selected" : ""}
                key={meal.key}
                onClick={() => chooseOccasion(meal.key)}
                type="button"
                aria-pressed={occasion === meal.key}
              >
                {occasion === meal.key ? "✓ " : "+ "}
                {meal.label}
              </button>
            ))}
          </div>

          <form className="prompt-box" onSubmit={submitPrompt}>
            <label htmlFor="food-prompt">What sounds good?</label>
            <div className="prompt-row">
              <input
                id="food-prompt"
                type="search"
                autoComplete="off"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Oolong boba or a quiet café…"
              />
              <button type="submit" aria-label="Search">
                ↗
              </button>
            </div>
            <p>Try “cozy café,” “boba under $10,” or “spicy noodles.”</p>
          </form>

          {interpretedChips.length > 0 && (
            <div className="intent-chips" aria-label="Interpreted search filters">
              <span>UNDERSTOOD AS</span>
              <div>
                {interpretedChips.map((chip) => (
                  <span key={chip.key}>{chip.label}</span>
                ))}
              </div>
            </div>
          )}

          <div className="filter-list" aria-label="Discovery filters">
            {filters.map((filter) => (
              <button
                className={activeFilters.includes(filter) ? "selected" : ""}
                key={filter}
                onClick={() => toggleFilter(filter)}
                type="button"
                aria-pressed={activeFilters.includes(filter)}
              >
                {activeFilters.includes(filter) ? "✓ " : "+ "}
                {filter}
              </button>
            ))}
          </div>

          <div className="locality-rule">
            <span>LOCAL-FIRST</span>
            <p>
              Major chains and franchises are removed before recommendations
              are ranked.
            </p>
          </div>

          <button
            className={`location-button ${locationState}`}
            type="button"
            onClick={useMyLocation}
            disabled={locationState === "loading"}
          >
            <span aria-hidden="true">⌖</span>
            {locationState === "loading"
              ? "Finding your area…"
              : locationState === "active"
                ? "Using your location · refresh"
                : "Use my location"}
          </button>

          <div className="safety-note">
            <span className="safety-icon">!</span>
            <div>
              <strong>{safetyTitle}</strong>
              <p>
                {showUnknownAllergyMatches
                  ? "Unknown information stays visible with a warning."
                  : "Places with unknown information stay hidden."}
              </p>
            </div>
            <button
              aria-label="Edit allergy settings"
              onClick={() => setSettingsOpen(true)}
              type="button"
            >
              Edit
            </button>
          </div>
        </aside>

        <section className="feed-stage" aria-label="Restaurant discovery feed">
          <div className="feed-meta">
            <div>
              <span>FOR YOU</span>
              <strong role="status" aria-live="polite">
                {status}
              </strong>
            </div>
            <p>{queue.length} picks in this set</p>
          </div>

          {current ? (
            <article className="food-card">
            <div
              className="food-image"
              style={{ backgroundImage: `url(${current.imageUrl})` }}
              role="img"
              aria-label={`Illustrative photo for ${current.dish}`}
            >
              <div className="card-scrim" />
              <div className="card-topline">
                <span className="match-pill">{currentMatch}% MATCH</span>
                <span className="distance-pill">{current.distance}</span>
              </div>
              <div className="card-copy">
                <p>
                  {venueLabel(current.venueType)} · {current.cuisine} ·{" "}
                  {current.price}
                </p>
                <h2>{current.dish}</h2>
                <h3>{current.restaurant}</h3>
                <small className="locality-caption">
                  {current.localityLabel}
                </small>
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
              <button
                type="button"
                onClick={openDetails}
              >
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
                className={
                  saved.includes(current.restaurantId) ? "save saved" : "save"
                }
                type="button"
                onClick={() => toggleSave(current)}
                aria-label="Save restaurant"
                aria-pressed={saved.includes(current.restaurantId)}
              >
                {saved.includes(current.restaurantId) ? "♥" : "♡"}
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
          ) : (
            <div className="empty-feed">
              <span aria-hidden="true">○</span>
              <h2>No reviewed match in this set.</h2>
              <p>
                Your locality and safety rules stayed in place. Clear the
                location and filters to return to the San Francisco pilot.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCoordinates(undefined);
                  setLocationState("idle");
                  setActiveFilters([]);
                  setQueue(rankTasteCards(demoCards, learnedWeights));
                  setStatus("Showing the full reviewed San Francisco pilot.");
                }}
              >
                Show pilot catalog
              </button>
            </div>
          )}
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
                ? "A few more choices will help separate everyday favorites from today’s mood."
                : "Your saved taste profile now reorders the local feed across meals, coffee, and drinks."}
            </p>
            <p className={`sync-state ${syncState}`}>
              {syncState === "loading" && "Loading saved taste…"}
              {syncState === "saving" && "Saving this signal…"}
              {syncState === "saved" && "Taste memory saved"}
              {syncState === "unavailable" &&
                "Taste memory will retry when storage reconnects"}
            </p>
            <div className="progress-track">
              <span style={{ width: `${tasteProgress}%` }} />
            </div>
            <div className="taste-signals">
              {visibleTasteSignals.map((signal) => (
                <span key={signal}>{signal}</span>
              ))}
              <span className="muted">Fine dining</span>
            </div>
          </div>

          <div className="next-list">
            <div className="section-label">
              <span>MORE LOCAL PICKS</span>
              <button
                type="button"
                onClick={() => {
                  setCoordinates(undefined);
                  setLocationState("idle");
                  setQueue(rankTasteCards(demoCards, learnedWeights));
                  setStatus("Showing the full reviewed San Francisco pilot.");
                }}
              >
                View all
              </button>
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
                <b>{scoreTasteCard(card, learnedWeights)}%</b>
              </button>
            ))}
          </div>

          <div className="product-principle">
            <span>01</span>
            <p>
              Eligibility comes first. <strong>Chains and franchises stay out</strong>{" "}
              even when an algorithm predicts a match.
            </p>
          </div>
        </aside>
      </section>

      {settingsOpen && (
        <section
          className="settings-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          <button
            className="drawer-close"
            type="button"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close dietary settings"
          >
            ×
          </button>
          <p className="eyebrow">YOUR SAFETY SETTINGS</p>
          <h2 id="settings-title">What should we screen for?</h2>
          <p className="settings-intro">
            Known conflicts are always removed before ranking. This cannot
            replace confirming severe allergies directly with a business.
          </p>

          <fieldset className="settings-group">
            <legend>Allergens</legend>
            <div className="settings-options">
              {allergenOptions.map((option) => (
                <label key={option.key}>
                  <input
                    type="checkbox"
                    checked={allergens.includes(option.key)}
                    onChange={() =>
                      toggleSetting(option.key, allergens, setAllergens)
                    }
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="settings-group">
            <legend>Dietary preferences</legend>
            <div className="settings-options">
              {dietaryOptions.map((option) => (
                <label key={option.key}>
                  <input
                    type="checkbox"
                    checked={dietaryRestrictions.includes(option.key)}
                    onChange={() =>
                      toggleSetting(
                        option.key,
                        dietaryRestrictions,
                        setDietaryRestrictions,
                      )
                    }
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="unknown-toggle">
            <input
              type="checkbox"
              checked={showUnknownAllergyMatches}
              onChange={(event) =>
                setShowUnknownAllergyMatches(event.target.checked)
              }
            />
            <span>
              <strong>Show places with unknown evidence</strong>
              Keep them visible with a persistent warning instead of treating
              missing information as safe.
            </span>
          </label>

          <label className="unknown-toggle">
            <input
              type="checkbox"
              checked={allergenStrictness === "strict"}
              onChange={(event) =>
                setAllergenStrictness(
                  event.target.checked ? "strict" : "dish-aware",
                )
              }
            />
            <span>
              <strong>Strict whole-place allergy screening</strong>
              Hide a restaurant when shared-kitchen or cross-contact evidence
              is unknown. Leave this off to evaluate each dish separately and
              keep the restaurant visible with a warning.
            </span>
          </label>

          <button
            className="settings-save"
            type="button"
            onClick={() => void saveSafetySettings()}
            disabled={settingsSaving}
          >
            {settingsSaving ? "Saving…" : "Save safety settings"}
          </button>
        </section>
      )}

      {accountOpen && (
        <section
          className="account-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-title"
        >
          <button
            className="drawer-close"
            type="button"
            onClick={() => setAccountOpen(false)}
            aria-label="Close account"
          >
            ×
          </button>
          <p className="eyebrow">ACCOUNT / PRIVACY</p>
          <h2 id="account-title">Your discovery data.</h2>
          <p className="settings-intro">
            Discovery works without an account. This release keeps taste
            history and the shortlist private to this browser. Account sign-in
            is temporarily disabled until the public Worker has a verified
            authentication gateway.
          </p>

          <div className="account-stats">
            <div>
              <span>Identity</span>
              <strong>
                {account?.authenticated ? "Signed in" : "Private guest"}
              </strong>
            </div>
            <div>
              <span>Saved places</span>
              <strong>{account?.savedCount ?? saved.length}</strong>
            </div>
            <div>
              <span>Taste signals</span>
              <strong>{account?.interactionCount ?? signals}</strong>
            </div>
          </div>

          <div className="account-actions">
            {account?.authenticated ? (
              <span>Signed-in session</span>
            ) : (
              <span>Private guest mode</span>
            )}
            <a href="/api/v1/account/export">Download my data</a>
          </div>

          <div className="danger-zone">
            <strong>Delete discovery data</strong>
            <p>
              Removes your taste profile, interactions, and shortlist. This
              cannot be undone.
            </p>
            {deleteConfirm ? (
              <div>
                <button type="button" onClick={() => setDeleteConfirm(false)}>
                  Cancel
                </button>
                <button type="button" onClick={() => void deleteAccount()}>
                  Confirm permanent deletion
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setDeleteConfirm(true)}>
                Delete my data
              </button>
            )}
          </div>
        </section>
      )}

      {shortlistOpen && (
        <section
          className="shortlist-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortlist-title"
        >
          <button
            className="drawer-close"
            type="button"
            onClick={() => setShortlistOpen(false)}
            aria-label="Close shortlist"
          >
            ×
          </button>
          <p className="eyebrow">YOUR SHORTLIST</p>
          <h2 id="shortlist-title">Saved for later.</h2>
          <p className="settings-intro">
            Your picks stay private to this guest session or move with you when
            you sign in.
          </p>
          {savedCards.length === 0 ? (
            <div className="shortlist-empty">
              Save a neighborhood spot and it will appear here.
            </div>
          ) : (
            <div className="saved-list">
              {savedCards.map((card) => (
                <div className="saved-row" key={card.restaurantId}>
                  <button
                    className="saved-place"
                    type="button"
                    onClick={() => {
                      setQueue([
                        card,
                        ...demoCards.filter((item) => item.id !== card.id),
                      ]);
                      setShortlistOpen(false);
                      setStatus(`${card.restaurant} is ready to revisit.`);
                    }}
                  >
                    <span
                      className="mini-image"
                      style={{ backgroundImage: `url(${card.imageUrl})` }}
                    />
                    <span>
                      <strong>{card.restaurant}</strong>
                      <small>
                        {card.dish} · {card.neighborhood}
                      </small>
                    </span>
                  </button>
                  <button
                    className="saved-remove"
                    type="button"
                    onClick={() => toggleSave(card)}
                    aria-label={`Remove ${card.restaurant} from shortlist`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {detailOpen && current && (
        <section
          className="detail-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-title"
        >
          <button
            className="drawer-close"
            type="button"
            onClick={() => setDetailOpen(false)}
            aria-label="Close restaurant details"
          >
            ×
          </button>
          <p className="eyebrow">RESTAURANT DETAILS · DEMO DATA</p>
          <h2 id="detail-title">{current.restaurant}</h2>
          <p className="drawer-address">
            {venueLabel(current.venueType)} ·{" "}
            {placeDetails?.address.line1
              ? `${placeDetails.address.line1}, ${placeDetails.address.city ?? "San Francisco"}`
              : `${current.neighborhood}, San Francisco`}{" "}
            · {current.distance}
          </p>
          <div className="drawer-grid">
            <div>
              <span>Local ownership</span>
              <strong>{current.localityLabel}</strong>
            </div>
            <div>
              <span>Hours</span>
              <strong>
                {placeDetails?.hours.length
                  ? `${placeDetails.hours.length} verified weekly schedules`
                  : current.hours}
              </strong>
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
              <strong>
                {current.evidenceVerifiedAt
                  ? `${current.evidenceSource ?? "Evidence"} · ${new Date(current.evidenceVerifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                  : "Evidence date unavailable"}
              </strong>
            </div>
            <div>
              <span>Contact</span>
              <strong>
                {placeDetails?.phone ?? "Phone not yet verified"}
              </strong>
            </div>
            <div>
              <span>Business details checked</span>
              <strong>
                {placeDetails?.verifiedAt
                  ? new Date(placeDetails.verifiedAt).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" },
                    )
                  : "Freshness check pending"}
              </strong>
            </div>
          </div>
          <div className="drawer-warning">
            <strong>Always confirm severe allergies with the restaurant.</strong>
            This prototype never treats missing information as proof of safety.
          </div>
          <div className="drawer-actions">
            {placeDetails?.menuUrl ? (
              <a
                href={placeDetails.menuUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => remember("handoff", current, "menu")}
              >
                View menu ↗
              </a>
            ) : (
              <span>Menu unavailable</span>
            )}
            {placeDetails?.phone ? (
              <a
                href={`tel:${placeDetails.phone}`}
                onClick={() => remember("handoff", current, "call")}
              >
                Call business ↗
              </a>
            ) : (
              <span>Phone unavailable</span>
            )}
            {placeDetails?.directionsUrl ? (
              <a
                href={placeDetails.directionsUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => remember("handoff", current, "directions")}
              >
                Directions ↗
              </a>
            ) : (
              <span>Directions unavailable</span>
            )}
          </div>
        </section>
      )}

      <SiteFooter />
    </main>
  );
}

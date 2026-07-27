import type { RecommendationIntent } from "./recommendations";

export type ParsedIntent = RecommendationIntent & {
  occasion?: RecommendationIntent["occasion"];
  serviceMode?: "dine-in" | "pickup" | "delivery";
  openNow?: boolean;
  confidence: number;
  chips: Array<{
    key: string;
    label: string;
  }>;
};

const venueKeywords: Array<{
  venueType: string;
  keywords: string[];
  label: string;
}> = [
  { venueType: "cafe", keywords: ["cafe", "café", "coffee"], label: "Café" },
  {
    venueType: "boba",
    keywords: ["boba", "bubble tea", "milk tea"],
    label: "Boba",
  },
  {
    venueType: "tea_house",
    keywords: ["tea house", "tea shop"],
    label: "Tea house",
  },
  { venueType: "bakery", keywords: ["bakery", "pastry"], label: "Bakery" },
  { venueType: "dessert", keywords: ["dessert", "sweet"], label: "Dessert" },
  { venueType: "juice_bar", keywords: ["juice", "smoothie"], label: "Juice" },
];

const cuisineKeywords = [
  "chinese",
  "taiwanese",
  "mexican",
  "italian",
  "mediterranean",
  "japanese",
  "korean",
  "thai",
  "indian",
  "vietnamese",
  "ethiopian",
  "filipino",
];

const dietaryKeywords = [
  ["vegetarian", "Vegetarian"],
  ["vegan", "Vegan"],
  ["gluten-free", "Gluten-free"],
  ["gluten free", "Gluten-free"],
  ["halal", "Halal"],
  ["kosher", "Kosher"],
] as const;

const allergenKeywords = [
  ["peanut", "Peanut"],
  ["tree nut", "Tree nut"],
  ["milk", "Milk"],
  ["dairy", "Milk"],
  ["egg", "Egg"],
  ["wheat", "Wheat"],
  ["soy", "Soy"],
  ["sesame", "Sesame"],
  ["shellfish", "Shellfish"],
  ["fish", "Fish"],
] as const;

function includesPhrase(message: string, phrase: string): boolean {
  return message.includes(phrase);
}

function requestsAllergenScreen(message: string, allergen: string): boolean {
  const escaped = allergen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:allerg(?:y|ic)(?:\\s+to)?|avoid|without|no)\\s+${escaped}\\b|\\b${escaped}[- ]free\\b`,
  ).test(message);
}

function pushChip(
  chips: ParsedIntent["chips"],
  key: string,
  label: string,
) {
  if (!chips.some((chip) => chip.key === key)) chips.push({ key, label });
}

export function parseDiscoveryIntent(message: string): ParsedIntent {
  const query = message.trim().slice(0, 500);
  const normalized = query.toLowerCase();
  const chips: ParsedIntent["chips"] = [];
  const venueTypes: string[] = [];
  const dietaryRestrictions: string[] = [];
  const allergens: string[] = [];
  const priceTiers: number[] = [];

  for (const venue of venueKeywords) {
    if (venue.keywords.some((keyword) => includesPhrase(normalized, keyword))) {
      venueTypes.push(venue.venueType);
      pushChip(chips, `venue:${venue.venueType}`, venue.label);
    }
  }

  const cuisines = cuisineKeywords.filter((cuisine) =>
    includesPhrase(normalized, cuisine),
  );
  for (const cuisine of cuisines) {
    pushChip(
      chips,
      `cuisine:${cuisine}`,
      cuisine.charAt(0).toUpperCase() + cuisine.slice(1),
    );
  }

  for (const [keyword, label] of dietaryKeywords) {
    if (!includesPhrase(normalized, keyword)) continue;
    const key = keyword.replace("-", "_").replace(" ", "_");
    if (!dietaryRestrictions.includes(key)) dietaryRestrictions.push(key);
    pushChip(chips, `dietary:${key}`, label);
  }

  for (const [keyword, label] of allergenKeywords) {
    if (!requestsAllergenScreen(normalized, keyword)) continue;
    const key =
      keyword === "dairy"
        ? "milk"
        : keyword.replace(" ", "_").toLowerCase();
    if (!allergens.includes(key)) allergens.push(key);
    pushChip(chips, `allergen:${key}`, `${label} screen`);
  }

  const budgetMatch = normalized.match(
    /\b(?:under|below|less than|max(?:imum)?)\s*\$?\s*(\d{1,3})\b/,
  );
  if (budgetMatch) {
    const budget = Number(budgetMatch[1]);
    if (budget <= 15) priceTiers.push(1);
    else if (budget <= 30) priceTiers.push(1, 2);
    else if (budget <= 60) priceTiers.push(1, 2, 3);
    else priceTiers.push(1, 2, 3, 4);
    pushChip(chips, "budget", `Under $${budget}`);
  }

  let occasion: ParsedIntent["occasion"];
  if (includesPhrase(normalized, "breakfast")) occasion = "breakfast";
  else if (includesPhrase(normalized, "brunch")) occasion = "brunch";
  else if (includesPhrase(normalized, "lunch")) occasion = "lunch";
  else if (includesPhrase(normalized, "late night")) occasion = "late-night";
  else if (includesPhrase(normalized, "dinner")) occasion = "dinner";
  else if (
    includesPhrase(normalized, "snack") ||
    includesPhrase(normalized, "something small")
  ) {
    occasion = "snack";
  }
  if (occasion) {
    pushChip(
      chips,
      "occasion",
      occasion === "late-night" ? "Late night" : occasion,
    );
  }

  let serviceMode: ParsedIntent["serviceMode"];
  if (includesPhrase(normalized, "delivery")) serviceMode = "delivery";
  else if (
    includesPhrase(normalized, "pickup") ||
    includesPhrase(normalized, "takeout")
  ) {
    serviceMode = "pickup";
  } else if (
    includesPhrase(normalized, "dine in") ||
    includesPhrase(normalized, "sit down")
  ) {
    serviceMode = "dine-in";
  }
  if (serviceMode) pushChip(chips, "service", serviceMode);

  const openNow =
    includesPhrase(normalized, "open now") ||
    includesPhrase(normalized, "right now");
  if (openNow) pushChip(chips, "open", "Open now");

  const confidence = Math.min(0.98, 0.42 + chips.length * 0.09);
  return {
    query,
    venueTypes,
    priceTiers,
    allergens,
    dietaryRestrictions,
    occasion,
    serviceMode,
    openNow,
    confidence,
    chips,
  };
}

export function assistantSummary(
  intent: ParsedIntent,
  resultCount: number,
): string {
  if (resultCount === 0) {
    return "I kept your saved safety rules and local-only boundary, but did not find an eligible match. Try widening the craving or venue type.";
  }

  const interpreted =
    intent.chips.length > 0
      ? intent.chips.map((chip) => chip.label).join(", ")
      : "your current taste profile";
  return `I read that as ${interpreted}. I found ${resultCount} eligible local ${resultCount === 1 ? "match" : "matches"} without relaxing your safety settings.`;
}

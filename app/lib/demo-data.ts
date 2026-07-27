import {
  isDiscoveryEligible,
  type DiscoveryStatus,
  type OwnershipType,
  type VenueType,
} from "./discovery-policy";

export type DiscoveryCard = {
  id: string;
  restaurantId: string;
  restaurant: string;
  dish: string;
  cuisine: string;
  venueType: VenueType;
  ownershipType: OwnershipType;
  discoveryStatus: DiscoveryStatus;
  localityLabel: string;
  neighborhood: string;
  price: string;
  distance: string;
  match: number;
  tags: string[];
  preferenceKeys: string[];
  imageUrl: string;
  photoCreditUrl: string;
  allergyStatus: "verified" | "unknown";
  allergyLabel: string;
  allergyDetail: string;
  evidenceSource?: string;
  evidenceVerifiedAt?: number;
  hours: string;
  serviceModes: string[];
};

const candidateCards: DiscoveryCard[] = [
  {
    id: "demo-noodle-weather",
    restaurantId: "restaurant-noodle-weather",
    restaurant: "Noodle Weather",
    dish: "Chili crisp sesame noodles",
    cuisine: "Chinese",
    venueType: "restaurant",
    ownershipType: "independent",
    discoveryStatus: "eligible",
    localityLabel: "Independent · one location",
    neighborhood: "Mission",
    price: "$$",
    distance: "0.8 mi",
    match: 94,
    tags: ["Spicy", "Vegetarian", "Quick"],
    preferenceKeys: [
      "venue:restaurant",
      "cuisine:chinese",
      "tag:spicy",
      "tag:noodles",
      "locality:independent",
      "neighborhood:mission",
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=88",
    photoCreditUrl:
      "https://unsplash.com/photos/cooked-food-on-black-bowl-N_Y88TWmGwA",
    allergyStatus: "unknown",
    allergyLabel: "Peanut information unknown",
    allergyDetail: "No merchant-confirmed peanut information yet",
    hours: "Open until 10:30 PM",
    serviceModes: ["Dine-in", "Pickup", "Delivery"],
  },
  {
    id: "demo-day-moon",
    restaurantId: "restaurant-day-moon",
    restaurant: "Day Moon",
    dish: "Charred tomato sourdough pizza",
    cuisine: "Italian",
    venueType: "restaurant",
    ownershipType: "independent",
    discoveryStatus: "eligible",
    localityLabel: "Independent · one location",
    neighborhood: "SoMa",
    price: "$$",
    distance: "1.4 mi",
    match: 91,
    tags: ["Wood-fired", "Shareable", "Lively"],
    preferenceKeys: [
      "venue:restaurant",
      "cuisine:italian",
      "tag:wood-fired",
      "tag:shareable",
      "locality:independent",
      "neighborhood:soma",
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=1200&q=88",
    photoCreditUrl:
      "https://unsplash.com/photos/pizza-with-berries-MqT0asuoIcU",
    allergyStatus: "verified",
    allergyLabel: "Vegetarian dish verified",
    allergyDetail: "Restaurant-supplied vegetarian confirmation",
    hours: "Open until 11:00 PM",
    serviceModes: ["Dine-in", "Pickup"],
  },
  {
    id: "demo-golden-hour",
    restaurantId: "restaurant-golden-hour",
    restaurant: "Golden Hour Taquería",
    dish: "Crispy mushroom tacos",
    cuisine: "Mexican",
    venueType: "restaurant",
    ownershipType: "independent",
    discoveryStatus: "eligible",
    localityLabel: "Independent · one location",
    neighborhood: "Mission",
    price: "$",
    distance: "0.5 mi",
    match: 89,
    tags: ["Crispy", "Vegetarian", "Casual"],
    preferenceKeys: [
      "venue:restaurant",
      "cuisine:mexican",
      "tag:crispy",
      "tag:vegetarian",
      "locality:independent",
      "neighborhood:mission",
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=1200&q=88",
    photoCreditUrl:
      "https://unsplash.com/photos/two-tacos-with-lettuce-and-tomatoes-IGfIGP5ONV0",
    allergyStatus: "unknown",
    allergyLabel: "Cross-contact information unknown",
    allergyDetail: "Shared kitchen practices have not been confirmed",
    hours: "Open until midnight",
    serviceModes: ["Dine-in", "Pickup", "Delivery"],
  },
  {
    id: "demo-ember-grain",
    restaurantId: "restaurant-ember-grain",
    restaurant: "Ember & Grain",
    dish: "Smoky eggplant rice bowl",
    cuisine: "Mediterranean",
    venueType: "restaurant",
    ownershipType: "local_group",
    discoveryStatus: "eligible",
    localityLabel: "Local owner · three neighborhood spots",
    neighborhood: "Inner Richmond",
    price: "$$",
    distance: "2.1 mi",
    match: 86,
    tags: ["Smoky", "Vegan", "Comforting"],
    preferenceKeys: [
      "venue:restaurant",
      "cuisine:mediterranean",
      "tag:vegan",
      "tag:comforting",
      "locality:local-group",
      "neighborhood:inner-richmond",
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=88",
    photoCreditUrl:
      "https://unsplash.com/photos/vegetable-salad-IGfIGP5ONV0",
    allergyStatus: "verified",
    allergyLabel: "Vegan preparation verified",
    allergyDetail: "Merchant-confirmed vegan preparation; ask about cross-contact",
    hours: "Open until 9:30 PM",
    serviceModes: ["Dine-in", "Pickup"],
  },
  {
    id: "demo-fold-house",
    restaurantId: "restaurant-fold-house",
    restaurant: "Fold House",
    dish: "Ginger scallion dumplings",
    cuisine: "Chinese",
    venueType: "restaurant",
    ownershipType: "independent",
    discoveryStatus: "eligible",
    localityLabel: "Family-owned · one location",
    neighborhood: "Inner Sunset",
    price: "$",
    distance: "2.7 mi",
    match: 83,
    tags: ["Dumplings", "Cozy", "Quick"],
    preferenceKeys: [
      "venue:restaurant",
      "cuisine:chinese",
      "tag:dumplings",
      "tag:cozy",
      "locality:independent",
      "neighborhood:inner-sunset",
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=1200&q=88",
    photoCreditUrl:
      "https://unsplash.com/photos/dim-sum-on-white-bowl-V5vqWC9gyEU",
    allergyStatus: "unknown",
    allergyLabel: "Peanut information unknown",
    allergyDetail: "Ingredient and cross-contact information unavailable",
    hours: "Open until 10:00 PM",
    serviceModes: ["Dine-in", "Delivery"],
  },
  {
    id: "demo-half-light-tea",
    restaurantId: "restaurant-half-light-tea",
    restaurant: "Half-Light Tea",
    dish: "Roasted oolong brown-sugar boba",
    cuisine: "Taiwanese",
    venueType: "boba",
    ownershipType: "independent",
    discoveryStatus: "eligible",
    localityLabel: "Owner-operated · one location",
    neighborhood: "Hayes Valley",
    price: "$",
    distance: "1.1 mi",
    match: 88,
    tags: ["Boba", "Roasted tea", "Afternoon"],
    preferenceKeys: [
      "venue:boba",
      "cuisine:taiwanese",
      "tag:roasted-tea",
      "tag:sweet-drinks",
      "locality:independent",
      "neighborhood:hayes-valley",
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&w=1200&q=88",
    photoCreditUrl:
      "https://unsplash.com/photos/clear-glass-with-brown-liquid-zUNs99PGDg0",
    allergyStatus: "unknown",
    allergyLabel: "Milk and topping details unknown",
    allergyDetail: "Confirm creamer ingredients and topping preparation in store",
    hours: "Open until 8:00 PM",
    serviceModes: ["Walk-in", "Pickup"],
  },
  {
    id: "demo-juniper-cup",
    restaurantId: "restaurant-juniper-cup",
    restaurant: "Juniper Cup",
    dish: "Black sesame maple latte",
    cuisine: "Coffee & pastry",
    venueType: "cafe",
    ownershipType: "independent",
    discoveryStatus: "eligible",
    localityLabel: "Independent café · one location",
    neighborhood: "Lower Haight",
    price: "$",
    distance: "0.9 mi",
    match: 87,
    tags: ["Coffee", "Cozy", "Oat milk"],
    preferenceKeys: [
      "venue:cafe",
      "cuisine:coffee",
      "tag:cozy",
      "tag:oat-milk",
      "locality:independent",
      "neighborhood:lower-haight",
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=88",
    photoCreditUrl:
      "https://unsplash.com/photos/white-ceramic-mug-filled-with-coffee-XOhI_kW_TaM",
    allergyStatus: "verified",
    allergyLabel: "Oat-milk option confirmed",
    allergyDetail: "Merchant-supplied milk options; shared equipment is still possible",
    hours: "Open until 6:00 PM",
    serviceModes: ["Dine-in", "Walk-in", "Pickup"],
  },
];

export const demoCards = candidateCards.filter(isDiscoveryEligible);

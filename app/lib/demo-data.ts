export type DiscoveryCard = {
  id: string;
  restaurant: string;
  dish: string;
  cuisine: string;
  neighborhood: string;
  price: string;
  distance: string;
  match: number;
  tags: string[];
  imageUrl: string;
  photoCreditUrl: string;
  allergyStatus: "verified" | "unknown";
  allergyLabel: string;
  allergyDetail: string;
  hours: string;
  serviceModes: string[];
};

export const demoCards: DiscoveryCard[] = [
  {
    id: "demo-noodle-weather",
    restaurant: "Noodle Weather",
    dish: "Chili crisp sesame noodles",
    cuisine: "Chinese",
    neighborhood: "Mission",
    price: "$$",
    distance: "0.8 mi",
    match: 94,
    tags: ["Spicy", "Vegetarian", "Quick"],
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
    restaurant: "Day Moon",
    dish: "Charred tomato sourdough pizza",
    cuisine: "Italian",
    neighborhood: "SoMa",
    price: "$$",
    distance: "1.4 mi",
    match: 91,
    tags: ["Wood-fired", "Shareable", "Lively"],
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
    restaurant: "Golden Hour Taquería",
    dish: "Crispy mushroom tacos",
    cuisine: "Mexican",
    neighborhood: "Mission",
    price: "$",
    distance: "0.5 mi",
    match: 89,
    tags: ["Crispy", "Vegetarian", "Casual"],
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
    restaurant: "Ember & Grain",
    dish: "Smoky eggplant rice bowl",
    cuisine: "Mediterranean",
    neighborhood: "Inner Richmond",
    price: "$$",
    distance: "2.1 mi",
    match: 86,
    tags: ["Smoky", "Vegan", "Comforting"],
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
    restaurant: "Fold House",
    dish: "Ginger scallion dumplings",
    cuisine: "Chinese",
    neighborhood: "Inner Sunset",
    price: "$",
    distance: "2.7 mi",
    match: 83,
    tags: ["Dumplings", "Cozy", "Quick"],
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
];

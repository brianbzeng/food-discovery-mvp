import type { Metadata } from "next";
import { InformationPage } from "../components/information-page";

export const metadata: Metadata = {
  title: "About",
  description:
    "How the Food Discovery MVP combines local-first eligibility, dish-level safety evidence, and personal taste.",
};

export default function AboutPage() {
  return (
    <InformationPage
      eyebrow="ABOUT THE MVP"
      title="Find the food you mean."
      intro="Food Discovery is an early local-first product for the gap between “I should eat” and “that is exactly what I want.”"
    >
      <section>
        <h2>Local eligibility comes first</h2>
        <p>
          The pilot is designed around independent restaurants and small local
          groups. Major chains and franchises are removed before the ranking
          model considers taste, distance, meal occasion, or novelty.
        </p>
      </section>

      <section>
        <h2>Personal without requiring an account</h2>
        <p>
          You can browse as a guest. Likes, passes, saves, and other choices
          teach the taste model over time, including what works for different
          meals. The current release keeps that profile tied to the browser.
          Public account sign-in remains disabled; any future account system
          will require a cryptographically verified authentication gateway.
        </p>
      </section>

      <section>
        <h2>Safety is evidence, not a promise</h2>
        <p>
          The model evaluates allergen and dietary evidence at the dish level
          where possible. One conflicting dish does not automatically erase an
          otherwise useful restaurant, while shared-kitchen and venue-wide
          uncertainty stays visible. Users who need a stricter view can choose
          whole-place screening.
        </p>
        <p>
          No recommendation replaces a direct conversation with the restaurant
          about ingredients, preparation, and cross-contact.
        </p>
      </section>

      <section>
        <h2>What is real today</h2>
        <p>
          This is a San Francisco MVP with a limited, reviewed catalog and some
          fictional pilot content. The product includes meal-aware discovery,
          taste learning, safety settings, location-based distance, saved
          places, and data export and deletion. Catalog depth and evidence
          coverage are still being expanded.
        </p>
      </section>
    </InformationPage>
  );
}

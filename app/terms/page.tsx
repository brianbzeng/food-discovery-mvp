import type { Metadata } from "next";
import { InformationPage } from "../components/information-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "Baseline terms for using the Food Discovery MVP.",
};

export default function TermsPage() {
  return (
    <InformationPage
      eyebrow="TERMS · LAST UPDATED JULY 26, 2026"
      title="Terms for this early product."
      intro="These baseline terms describe an experimental food-discovery service. They need qualified legal review before a public commercial launch."
    >
      <section>
        <h2>Using the service</h2>
        <p>
          Food Discovery MVP helps you explore eligible local restaurants and
          dishes using your search intent, meal occasion, taste profile,
          safety settings, location when you provide it, and past activity.
          You may browse as a guest. Account sign-in is not currently offered
          in the public interface.
        </p>
        <p>
          Use the service lawfully and do not attempt to disrupt it, access
          another person’s data, bypass access controls, scrape it in a way that
          degrades the service, or submit content or requests that violate
          another person’s rights.
        </p>
      </section>

      <section>
        <h2>Experimental recommendations</h2>
        <p>
          The service is an MVP. Recommendations, scores, hours, prices,
          menus, ownership details, distances, availability, and restaurant
          information may be incomplete, outdated, or incorrect. Verify
          important details with the restaurant before traveling or ordering.
        </p>
        <p>
          A high match score is an explanation of the ranking model, not a
          guarantee that you will enjoy a restaurant or dish.
        </p>
      </section>

      <section>
        <h2>Allergens and dietary needs</h2>
        <p>
          The app’s allergen and dietary features are informational screening
          tools, not medical advice or a guarantee of safety. Dish evidence and
          shared-kitchen practices can change, and missing evidence is not proof
          that an item is safe. Always confirm ingredients, preparation, and
          cross-contact directly with the restaurant, especially for severe
          allergies or medical dietary requirements.
        </p>
      </section>

      <section>
        <h2>Your profile and choices</h2>
        <p>
          You are responsible for the accuracy of the restrictions and
          preferences you enter. Interactions can change later rankings, and a
          “never show” choice can remove a restaurant from your results. You
          can export or delete the discovery data associated with your current
          guest identity from the profile panel.
        </p>
      </section>

      <section>
        <h2>External services</h2>
        <p>
          The app may link to restaurant websites, menus, phone numbers,
          directions, maps, and source material. Those destinations are
          independent from this MVP. Their content, availability, transactions,
          and privacy practices are governed by their own terms.
        </p>
      </section>

      <section>
        <h2>Availability and changes</h2>
        <p>
          Features and catalog data may change, pause, or be removed while the
          product is being tested. The service is provided on an “as available”
          basis. To the extent permitted by applicable law, the project owner
          does not promise uninterrupted operation or the accuracy of
          third-party restaurant information.
        </p>
      </section>

      <section>
        <h2>Responsibility</h2>
        <p>
          You remain responsible for dining, travel, ordering, health, and
          purchasing decisions you make using the service. Nothing in these
          terms excludes rights or responsibilities that cannot legally be
          excluded.
        </p>
      </section>

      <aside className="information-note" aria-label="MVP terms notice">
        <strong>MVP legal baseline</strong>
        <p>
          Before broader launch, the project owner should identify the
          operating legal entity, add a verified contact and governing-law
          terms, and have these terms reviewed for the intended users and
          markets.
        </p>
      </aside>
    </InformationPage>
  );
}

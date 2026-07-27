import type { Metadata } from "next";
import { InformationPage } from "../components/information-page";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How the Food Discovery MVP handles taste, safety, location, and guest identity data.",
};

export default function PrivacyPage() {
  return (
    <InformationPage
      eyebrow="PRIVACY · LAST UPDATED JULY 26, 2026"
      title="Your discovery data, explained."
      intro="This is the privacy baseline for an early product. It describes the app as it works today and should be reviewed by qualified counsel before a public commercial launch."
    >
      <section>
        <h2>What the app stores</h2>
        <p>
          The app stores a taste profile in Cloudflare D1. That profile can
          include preferences you choose, preferences inferred from your
          activity, meal-specific taste weights, dietary restrictions,
          allergens, allergy-screening settings, places you have hidden, and
          profile version timestamps.
        </p>
        <p>
          The app also stores your saved restaurants and interaction events,
          such as views, passes, likes, saves, detail opens, shares, external
          handoffs, and “never show” choices. An event can include the
          restaurant and dish, the current meal occasion, a reason you provide,
          and limited discovery context such as venue type and neighborhood.
        </p>
      </section>

      <section>
        <h2>Guest identity</h2>
        <p>
          You can use discovery without creating an account. The app may set
          two first-party, HTTP-only cookies: a guest identifier that lasts up
          to one year and a session identifier that lasts up to four hours.
          They let the app connect your taste profile, interactions, and saves
          to the same browser.
        </p>
        <p>
          Public account sign-in is currently disabled. The app does not trust
          identity headers supplied by a browser or other caller. Future
          account sign-in will require a cryptographically verified
          authentication gateway, and this notice must be updated when that
          account design is implemented.
        </p>
      </section>

      <section>
        <h2>Location</h2>
        <p>
          Location access is optional and only requested when you choose “Use
          my location.” The browser-provided latitude and longitude are sent
          with discovery requests to calculate distance and nearby results.
          The current app does not add those coordinates to the stored taste
          profile or interaction record. You can continue with the San
          Francisco pilot without granting location access.
        </p>
      </section>

      <section>
        <h2>How the data is used</h2>
        <p>
          The app uses these records to screen recommendations, rank eligible
          restaurants and dishes, remember your shortlist, explain matches,
          improve later recommendations, and operate data export and deletion
          controls.
        </p>
        <p>
          This codebase does not currently add third-party advertising
          trackers or build advertising profiles. Cloudflare hosts the app and
          provides its D1 database and R2 media storage, so Cloudflare processes
          requests as infrastructure for the service.
        </p>
      </section>

      <section>
        <h2>Party planning</h2>
        <p>
          When you create or join a party, the app stores the party name, your
          display name, membership status, role, planning settings, and
          timestamps. Invitations use a random, expiring token. Only a one-way
          hash of that token is stored; the shareable token is returned once to
          the creator for manual sharing.
        </p>
        <p>
          Party recommendations load each accepted member&apos;s profile on the
          server. Other members do not receive your raw taste profile,
          allergens, dietary restrictions, or individual scores. They receive
          only group-level recommendation summaries; you may also receive your
          own outcome for a recommendation. Pending, declined, and revoked
          invitees do not affect group ranking.
        </p>
      </section>

      <section>
        <h2>Restaurant and map links</h2>
        <p>
          Restaurant menus, websites, phone links, directions, and source links
          may take you to third-party services. Those services control their
          own data practices. Opening an external link may share ordinary
          request information with that destination, such as your IP address,
          browser details, and the page you requested.
        </p>
      </section>

      <section>
        <h2>Export, deletion, and retention</h2>
        <p>
          Open the profile panel to download a JSON copy of your taste profile,
          saves, interactions, and party ownership or membership records. The
          same panel can permanently delete those records and expire the app’s
          guest and session cookies. Deleting a party creator&apos;s data also
          deletes parties they own; deleting another member&apos;s data removes
          that membership. Records are otherwise retained for the product to
          remember your profile; this MVP does not yet define a separate
          automatic deletion schedule.
        </p>
        <p>
          Clear or block the cookies in your browser to stop that browser from
          reconnecting to a guest profile. Clearing a cookie alone does not
          erase the matching server record, so use “Delete my data” first when
          you want the stored data removed.
        </p>
      </section>

      <section>
        <h2>Food-safety information</h2>
        <p>
          Dietary and allergen settings are used to filter or warn about
          individual dishes and restaurant-wide or shared-kitchen evidence.
          Evidence may be incomplete, stale, or unknown. The app does not treat
          missing evidence as proof of safety and cannot replace speaking
          directly with a restaurant about ingredients, preparation, and
          cross-contact.
        </p>
      </section>

      <aside className="information-note" aria-label="MVP privacy notice">
        <strong>MVP legal baseline</strong>
        <p>
          Before broader launch, the project owner should add a verified
          privacy contact, confirm retention periods and subprocessors, and
          have this notice reviewed for the places where the service operates.
        </p>
      </aside>
    </InformationPage>
  );
}

# Party planning foundation

The party foundation answers the product promise: **find something everyone
can say yes to**. It is intentionally API-first; invitation delivery and party
screens are not implemented yet.

## Current lifecycle

1. A current cookie-scoped principal creates a party and becomes its accepted
   creator member.
2. Only that creator may issue or revoke pending invitations.
3. Issuing an invitation returns a 256-bit opaque token once. D1 stores only
   its SHA-256 hash and a seven-day expiration.
4. The token holder may accept or decline for the current principal. A
   terminal response clears the stored hash, so the token cannot be replayed.
5. Only the creator or an accepted member may read a party or request its
   recommendations. Pending, declined, and revoked invitees do not participate
   in ranking.

The creator is authoritative through `parties.creator_principal_id`.
`party_members.role` is a display/audit field and cannot grant creator powers.

## Recommendation and privacy boundary

The server—not the client—loads each accepted member's current `TasteProfile`
and the eligible D1 catalog. It selects restaurants first and then loads every
published dish for those restaurants, preventing a row limit from hiding the
one suitable sibling dish.

Before scoring, the server:

- applies allergens and dietary requirements per dish;
- keeps unknown dietary evidence fail-closed;
- applies each member's allergen-uncertainty and cross-contact strictness;
- excludes any restaurant permanently hidden by an accepted member; and
- passes only accepted members to the least-misery/min-average party scorer.

The recommendation API returns group-level fairness and safety aggregates plus
the caller's own selected-dish outcome. It does **not** return another member's
principal ID, allergens, dietary requirements, preference keys, eligible dish
list, warning details, or individual satisfaction score.

Party responses use `Cache-Control: private, no-store` and `Vary: Cookie`.
Mutations reject cross-site browser requests and all JSON bodies are bounded to
16 KB.

## API surface

- `GET /api/v1/parties`
- `POST /api/v1/parties`
- `GET /api/v1/parties/{partyId}`
- `POST /api/v1/parties/{partyId}/invitations`
- `DELETE /api/v1/parties/{partyId}/invitations/{memberId}`
- `POST /api/v1/party-invitations/respond`
- `GET /api/v1/parties/{partyId}/recommendations?limit=10`

Client-provided profiles, principals, allergens, dietary restrictions, and
safety policies are not accepted by the recommendation endpoint.

## Explicit MVP limitations

- There is no email, SMS, push, or social invitation delivery.
- There is no join screen or party-management UI. The creator must manually
  share the one-time token. A future join page should put the token in a URL
  fragment rather than a query string so it is not sent in HTTP logs or
  referrers.
- Identity is currently an opaque, validated, HttpOnly guest cookie. There is
  no verified account authentication, cross-device party identity, or account
  recovery yet. Forwarded email headers are not trusted.
- Party selection/voting, scheduling, chat, notifications, creator transfer,
  member removal after acceptance, and invitation resend are not included.
- Account export includes the current principal's owned-party and membership
  records without invitation-token hashes. Account deletion removes owned
  parties and the principal's other memberships. Verified guest-to-account
  migration still needs an explicit party ownership/membership merge when
  account authentication is introduced.

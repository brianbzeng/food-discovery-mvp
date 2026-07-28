# Next phase: verified accounts, real catalog, and grounded RAG

This plan begins only after the current guest release is stable in production
and an isolated staging environment exists. It does not authorize relaxing the
existing deterministic eligibility, dish-level safety, privacy, or party
fairness boundaries.

## Dependency order

```text
Current guest core
  |-- verified accounts -----> guest/account merge -----> cross-device parties
  |
  |-- reviewed real catalog -> evidence coverage -------> grounded retrieval
                                                      \-> RAG assistant
```

Verified accounts and real-catalog ingestion can be designed in parallel.
Grounded RAG must wait for reviewed catalog evidence. It does not need to wait
for public accounts, because the existing opaque guest profile is sufficient
for a controlled pilot.

## Track A: verified accounts

### A1. Choose and document the trust boundary

Select one identity provider and one token type. For Cloudflare Access, validate
the signed Access JWT at the Worker boundary; for another provider, validate its
signed ID/access token. The implementation must verify:

- signature against a trusted, refreshed key set;
- issuer and audience;
- expiration and not-before claims;
- the intended token type and algorithm;
- a stable provider subject, not email, as the external identity key; and
- replay-sensitive state for any redirect or authorization-code flow.

Never restore the old behavior of trusting forwarded email or identity headers.
Email can be account metadata only after token verification.

### A2. Add the internal account model

Add a migration for an internal `users` record and an external-identity mapping.
Store the provider subject as a one-way keyed digest if the raw subject is not
needed operationally. Define:

- immutable internal user ID;
- provider and provider subject mapping;
- account creation and last-authenticated timestamps;
- verified email metadata only when the provider asserts verification;
- account state and deletion timestamp; and
- schema version for future merge behavior.

Keep profile, saves, interactions, parties, and memberships keyed by the
application principal, not by email.

### A3. Implement idempotent guest-to-user merge

The existing `mergeGuestIntoUser` foundation is not a public flow. Wrap it in a
transactional, idempotent operation with a merge ledger. Define conflict rules:

- explicit settings chosen by the verified user win over older guest defaults;
- allergen and dietary restrictions merge conservatively and remain editable;
- strict allergen mode wins over dish-aware mode unless the user explicitly
  changes it later;
- learned weights combine within existing score bounds;
- meal-specific weights remain meal-specific;
- permanent hides are a set union;
- saves are de-duplicated;
- interaction events retain their original context without double counting;
- owned parties and memberships move exactly once; and
- invitation tokens and other users' profiles are never copied.

Successful merge rotates the guest/session cookies. Failed merge leaves the
guest record recoverable and must be safe to retry.

### A4. Account security and lifecycle

Implement sign-in, callback, sign-out, session renewal, and recovery behavior.
Use secure, HTTP-only, same-site cookies with explicit lifetimes. Add CSRF/state
validation to redirect flows and the existing same-origin mutation boundary to
account actions.

Extend export and deletion to every new account, identity, session, merge-ledger,
party, and future assistant table. Define retention for operational logs and
deleted-account tombstones before launch.

### A5. Account acceptance gate

Do not enable public sign-in until tests cover:

- spoofed headers, invalid signatures, wrong issuer/audience, expired tokens,
  key rotation, and replay;
- first sign-in, repeat sign-in, sign-out, and cross-device recovery;
- merge retries and partial-failure recovery;
- profile, save, interaction, party-owner, and party-member merge conflicts;
- export completeness and irreversible deletion;
- no cross-account reads or writes; and
- guest discovery continuing when the identity provider is unavailable.

## Track B: reviewed real catalog

### B1. Define the launch geography and coverage bar

Choose one bounded market. Set measurable minimums for reviewed independent
venues, published dishes per venue, current hours, ownership confidence,
dietary evidence, allergen evidence, and rights-approved media. A large,
unreviewed import is not coverage.

### B2. Keep ingestion quarantined

Provider records enter raw/source tables first. Normalize into candidate records
without making them discoverable. Preserve:

- provider and source record ID;
- source URL or attribution reference;
- observed-at and expires-at timestamps;
- original field/value needed for audit;
- normalization version; and
- import batch and operator action.

Automated jobs may create or refresh candidates, but only a reviewed catalog
record with `discovery_status = eligible` can reach the feed.

### B3. Review ownership and local eligibility

Build an operator queue for unresolved ownership. Review:

- independent ownership;
- small local group policy;
- franchise or licensed operation;
- regional/national chain relationship;
- duplicate locations and renamed businesses; and
- closure or material concept change.

Record the reviewer, basis, timestamp, and next review date. Ranking,
promotions, popularity, or a model can never override an ownership exclusion.

### B4. Treat menu and safety evidence as positive claims

For every supported dietary restriction and allergen, define acceptable source
strength and freshness. Missing evidence means unknown, never safe. Store scope
separately:

- `dish` evidence affects only that item;
- `shared_kitchen` evidence can warn or exclude affected dishes/venues; and
- `venue` evidence can apply to the whole place.

A known conflict removes the item. It removes the restaurant only when no
screened sibling dish remains or venue-wide policy requires exclusion. Preserve
the existing user choice between dish-aware warnings and strict whole-place
exclusion.

### B5. Hours, contacts, and media

Track time zone, weekly hours, exceptions, source, and freshness so `openNow`
can remain a hard filter. Validate menu, call, and directions URLs before
publication.

Do not copy arbitrary restaurant or social media images. R2 publication
requires rights holder, license basis, review status, alt text, attribution when
required, and expiry when applicable.

### B6. Catalog acceptance gate

Before replacing fictional data:

- run ownership leakage and duplicate-location audits;
- verify every public restaurant and dish has provenance;
- run the synthetic safety suite plus a human-reviewed real-record fixture set;
- test a conflicting dish with a safe sibling at the same venue;
- test stale, missing, shared-kitchen, and venue-wide evidence;
- measure empty-result rates without silently widening hard filters;
- verify media rights and attribution rendering; and
- rehearse stale-data quarantine and rollback.

## Track C: grounded RAG assistant

### C1. Keep the deterministic policy engine authoritative

The assistant pipeline is:

```text
profile + intent
  -> catalog eligibility
  -> venue/shared-kitchen safety
  -> dish safety
  -> deterministic ranking
  -> retrieval within screened IDs
  -> evidence/claim validation
  -> minimized frozen model context
  -> structured model selection
  -> server revalidation and rendering
```

The model never receives authority to add a candidate, relax a restriction,
interpret unknown evidence as safe, or query D1 directly.

### C2. Create versioned retrieval documents

Index only reviewed, non-sensitive catalog text and evidence suitable for
semantic recall: cuisine, dish descriptions, ambiance, occasion fit, and
groundable public facts. Every chunk needs:

- immutable document and subject ID;
- restaurant and optional dish ID;
- source/evidence IDs;
- observed and expiry timestamps;
- catalog/evidence version;
- embedding model and dimensions; and
- tombstone or replacement behavior.

Do not embed profiles, raw interactions, guest IDs, party membership, invite
tokens, email, or another member's preferences.

### C3. Restrict semantic search to the screened set

Vectorize, if selected, improves ordering or recall only inside the
server-generated restaurant/dish allowlists. If the index cannot enforce the
allowlist efficiently, over-fetch and intersect server-side before building
claims. It must never add an out-of-policy ID.

D1 remains authoritative for current eligibility, evidence freshness, safety,
profile constraints, accepted party membership, and final admission.

### C4. Build cited claims and minimized context

Convert retrieved records into the existing `GroundedClaim` and
`EvidenceCitation` contracts. Reject missing citations, subject mismatch,
stale evidence where freshness is required, unused citations, and unknown
fields.

Solo model context contains only bounded preference summaries and current
intent. Party context contains party size, aggregate preference counts, and a
locked hard-constraint union. It never identifies which member contributed a
preference or restriction.

### C5. Use structured output and revalidate it

Ask the model only to select candidate IDs and claim IDs, compare already
screened candidates, or request a clarification. Parse the response with
`parseAssistantRecommendationSelection`. Render names, facts, citations, and
safety warnings from trusted server data after validation.

On timeout, provider failure, invalid output, or missing evidence, fall back to
the deterministic recommendation response. Do not render partially validated
model prose.

### C6. RAG acceptance gate

Build offline and staging evaluations for:

- direct and indirect prompt injection;
- attempts to relax allergens or restore a filtered dish;
- uncited or wrong-subject claims;
- stale and missing evidence;
- out-of-allowlist candidate IDs;
- raw profile or party-member leakage;
- restaurant-safe-sibling behavior;
- party hard-constraint intersection and least-satisfied-member fairness;
- model timeout, malformed output, and provider outage;
- latency and cost budgets; and
- explanation fidelity against the actual deterministic score components.

Run model tests against a frozen fixture catalog. Keep the current deterministic
suite as a release gate so a model or index change cannot weaken core behavior.

## Recommended first implementation slice

1. Provision isolated staging D1/R2 and run the complete browser suite there.
2. Choose the account identity provider and write an accepted token-validation
   threat model before changing identity code.
3. Select one launch geography and import a small, quarantined candidate batch.
4. Human-review 10-20 venues and their dish/evidence records end to end.
5. Produce grounded claims and citations for those reviewed records without an
   LLM or vector search.
6. Run the existing retrieval-contract validators on that context.
7. Add semantic retrieval only if deterministic keyword/structured retrieval
   cannot meet a documented user need.
8. Add the model last, behind a flag, with structured selection and a
   deterministic fallback.

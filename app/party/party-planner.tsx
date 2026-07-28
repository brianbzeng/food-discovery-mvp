"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SiteFooter } from "../components/site-footer";

type PartyMemberStatus = "invited" | "accepted" | "declined" | "revoked";

type PartyMember = {
  id: string;
  displayName: string;
  role: "creator" | "member";
  status: PartyMemberStatus;
  inviteExpiresAt?: number;
};

type Party = {
  id: string;
  name: string;
  status: "active" | "archived";
  requireSharedDish: boolean;
  fairnessStrategy: "least-misery" | "min-average";
  isCreator: boolean;
  members: PartyMember[];
};

type PartyRecommendation = {
  restaurantId: string;
  restaurantName: string;
  score: number;
  fairness: {
    strategy: "least-misery" | "min-average";
    leastSatisfiedScore: number;
    averageMemberScore: number;
    spread: number;
  };
  safetyStatus: "verified" | "warning";
  safetySummary: string;
  requireSharedDish: boolean;
  selectedDishIds: string[];
  explanation: string;
  yourOutcome: {
    satisfactionScore: number;
    safetyConfirmationRequired: boolean;
  };
};

type RecommendationFeed = {
  party: {
    id: string;
    name: string;
    acceptedMemberCount: number;
  };
  recommendations: PartyRecommendation[];
  meta: {
    privacy: "aggregate-results-and-current-member-outcome-only";
  };
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & ApiErrorPayload;
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? "That party action is temporarily unavailable.",
    );
  }
  return payload;
}

function statusLabel(status: PartyMemberStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function inviteTokenFromHash(): string {
  if (typeof window === "undefined") return "";
  const match = window.location.hash.match(/^#invite=([A-Za-z0-9_-]{32,128})$/);
  return match?.[1] ?? "";
}

export function PartyPlanner() {
  const [parties, setParties] = useState<Party[]>([]);
  const [activePartyId, setActivePartyId] = useState<string>();
  const [loadingParties, setLoadingParties] = useState(true);
  const [partyName, setPartyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [requireSharedDish, setRequireSharedDish] = useState(false);
  const [fairnessStrategy, setFairnessStrategy] = useState<
    "least-misery" | "min-average"
  >("least-misery");
  const [creating, setCreating] = useState(false);
  const [inviteeName, setInviteeName] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [manualInviteToken, setManualInviteToken] = useState("");
  const [joining, setJoining] = useState(false);
  const [recommendationFeed, setRecommendationFeed] =
    useState<RecommendationFeed>();
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [notice, setNotice] = useState(
    "Create a plan or open an invitation to get started.",
  );

  const activeParty = useMemo(
    () => parties.find((party) => party.id === activePartyId),
    [activePartyId, parties],
  );
  const activeRecommendationFeed =
    recommendationFeed?.party.id === activePartyId
      ? recommendationFeed
      : undefined;

  const refreshParties = useCallback(async (preferredPartyId?: string) => {
    const response = await fetch("/api/v1/parties");
    const payload = await responseJson<{ parties: Party[] }>(response);
    setParties(payload.parties);
    setActivePartyId((current) => {
      const preferred = preferredPartyId ?? current;
      if (preferred && payload.parties.some((party) => party.id === preferred)) {
        return preferred;
      }
      return payload.parties[0]?.id;
    });
    return payload.parties;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/v1/parties")
      .then((response) => responseJson<{ parties: Party[] }>(response))
      .then((payload) => {
        if (cancelled) return;
        setParties(payload.parties);
        setActivePartyId(payload.parties[0]?.id);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setNotice(
            error instanceof Error
              ? error.message
              : "Party plans are temporarily unavailable.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingParties(false);
      });

    function syncInviteToken() {
      setInviteToken(inviteTokenFromHash());
    }
    syncInviteToken();
    window.addEventListener("hashchange", syncInviteToken);

    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", syncInviteToken);
    };
  }, [refreshParties]);

  useEffect(() => {
    if (!activePartyId) return;

    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setRecommendationsLoading(true);
        return fetch(
          `/api/v1/parties/${encodeURIComponent(activePartyId)}/recommendations?limit=6`,
        );
      })
      .then((response) => responseJson<RecommendationFeed>(response))
      .then((feed) => {
        if (!cancelled) setRecommendationFeed(feed);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRecommendationFeed(undefined);
          setNotice(
            error instanceof Error
              ? error.message
              : "Group recommendations are temporarily unavailable.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setRecommendationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activePartyId, parties]);

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setShareUrl("");
    try {
      const response = await fetch("/api/v1/parties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: partyName,
          displayName,
          requireSharedDish,
          fairnessStrategy,
        }),
      });
      const { party } = await responseJson<{ party: Party }>(response);
      setParties((current) => [
        party,
        ...current.filter((item) => item.id !== party.id),
      ]);
      setActivePartyId(party.id);
      setPartyName("");
      setNotice(`${party.name} is ready. Invite someone or review the first matches.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The party could not be created.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeParty) return;

    try {
      const response = await fetch(
        `/api/v1/parties/${encodeURIComponent(activeParty.id)}/invitations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName: inviteeName }),
        },
      );
      const payload = await responseJson<{
        invitation: PartyMember;
        inviteToken: string;
      }>(response);
      const url = new URL("/party", window.location.origin);
      url.hash = `invite=${payload.inviteToken}`;
      setShareUrl(url.toString());
      setInviteeName("");
      await refreshParties(activeParty.id);
      setNotice(
        `Invitation created for ${payload.invitation.displayName}. The share link is shown once.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The invitation could not be created.",
      );
    }
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Private invitation link copied.");
    } catch {
      setNotice("Copy the private invitation link from the field.");
    }
  }

  async function revokeInvite(memberId: string) {
    if (!activeParty) return;
    try {
      const response = await fetch(
        `/api/v1/parties/${encodeURIComponent(activeParty.id)}/invitations/${encodeURIComponent(memberId)}`,
        { method: "DELETE" },
      );
      await responseJson(response);
      await refreshParties(activeParty.id);
      setShareUrl("");
      setNotice("Invitation revoked.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The invitation could not be revoked.",
      );
    }
  }

  async function respondToInvite(responseChoice: "accepted" | "declined") {
    const token = inviteToken || manualInviteToken.trim();
    if (!token) {
      setNotice("Paste a valid invitation token first.");
      return;
    }

    setJoining(true);
    try {
      const response = await fetch("/api/v1/party-invitations/respond", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inviteToken: token,
          response: responseChoice,
        }),
      });
      const payload = await responseJson<{
        partyId: string;
        membership: PartyMember;
      }>(response);
      window.history.replaceState(null, "", "/party");
      setInviteToken("");
      setManualInviteToken("");
      if (responseChoice === "accepted") {
        await refreshParties(payload.partyId);
        setNotice(
          `You joined as ${payload.membership.displayName}. Your private profile now contributes to aggregate matches.`,
        );
      } else {
        setNotice("Invitation declined. No profile data was added to the plan.");
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The invitation response could not be saved.",
      );
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="party-shell">
      <header className="topbar">
        <Link className="working-mark" href="/" aria-label="Food discovery home">
          <span className="mark-dot" aria-hidden="true" />
          FOOD / NEARBY
          <small>group planning</small>
        </Link>
        <nav className="topnav" aria-label="Primary navigation">
          <Link href="/">Discover</Link>
          <Link className="active" href="/party">
            Group plan
          </Link>
        </nav>
      </header>

      <section className="party-hero">
        <div className="party-hero__copy">
          <p className="eyebrow">PRIVATE GROUP DISCOVERY</p>
          <h1>Find something for everyone.</h1>
          <p>
            Invite friends, keep each food profile private, and rank independent
            local restaurants against everyone&apos;s hard constraints before
            balancing the group&apos;s preferences.
          </p>
          <div className="party-hero__promises">
            <span>Hard constraints first</span>
            <span>Aggregate results only</span>
            <span>Different dishes can work</span>
          </div>
        </div>
        <div
          className="party-hero__image"
          role="img"
          aria-label="A shared table with separate dishes for a group meal"
        >
          <span>PLAN TOGETHER / PROFILES STAY PRIVATE</span>
        </div>
      </section>

      {(inviteToken || manualInviteToken) && (
        <section className="party-join" aria-labelledby="party-join-title">
          <div>
            <p className="eyebrow">YOU HAVE AN INVITATION</p>
            <h2 id="party-join-title">Bring your taste, not your profile details.</h2>
            <p>
              Accepting lets the server use your saved restrictions and
              preferences for group ranking. Other members see your name,
              participation status, and aggregate outcomes only.
            </p>
          </div>
          <div className="party-join__actions">
            <button
              type="button"
              onClick={() => void respondToInvite("accepted")}
              disabled={joining}
            >
              Accept invitation
            </button>
            <button
              type="button"
              onClick={() => void respondToInvite("declined")}
              disabled={joining}
            >
              Decline
            </button>
          </div>
        </section>
      )}

      <section className="party-workspace">
        <aside className="party-sidebar">
          <form className="party-create-card" onSubmit={createPlan}>
            <p className="eyebrow">START A PLAN</p>
            <h2>Who are we feeding?</h2>
            <label htmlFor="party-name">Plan name</label>
            <input
              id="party-name"
              value={partyName}
              onChange={(event) => setPartyName(event.target.value)}
              placeholder="Friday dinner"
              maxLength={80}
              required
            />
            <label htmlFor="party-display-name">Your display name</label>
            <input
              id="party-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Brian"
              maxLength={80}
              required
            />
            <label className="party-check">
              <input
                type="checkbox"
                checked={requireSharedDish}
                onChange={(event) => setRequireSharedDish(event.target.checked)}
              />
              <span>
                <strong>One shared dish must work</strong>
                Leave off when different dishes at one restaurant are okay.
              </span>
            </label>
            <label htmlFor="party-fairness">How should ties be balanced?</label>
            <select
              id="party-fairness"
              value={fairnessStrategy}
              onChange={(event) =>
                setFairnessStrategy(
                  event.target.value === "min-average"
                    ? "min-average"
                    : "least-misery",
                )
              }
            >
              <option value="least-misery">Protect the least-satisfied person</option>
              <option value="min-average">Balance minimum and average</option>
            </select>
            <button className="party-primary" type="submit" disabled={creating}>
              {creating ? "Creating plan..." : "Create private plan"}
            </button>
          </form>

          <section className="party-list-card" aria-labelledby="your-plans-title">
            <div className="party-section-heading">
              <div>
                <p className="eyebrow">YOUR PLANS</p>
                <h2 id="your-plans-title">Pick up where you left off.</h2>
              </div>
              <button
                type="button"
                onClick={() => void refreshParties(activePartyId)}
              >
                Refresh
              </button>
            </div>
            {loadingParties ? (
              <p className="party-muted">Loading private plans...</p>
            ) : parties.length === 0 ? (
              <p className="party-muted">No plans yet. Create the first one.</p>
            ) : (
              <div className="party-list">
                {parties.map((party) => (
                  <button
                    className={party.id === activePartyId ? "active" : ""}
                    type="button"
                    key={party.id}
                    onClick={() => {
                      setActivePartyId(party.id);
                      setShareUrl("");
                    }}
                  >
                    <span>{party.name}</span>
                    <small>
                      {party.members.filter((member) => member.status === "accepted").length}{" "}
                      joined
                    </small>
                  </button>
                ))}
              </div>
            )}
          </section>

          {!inviteToken && (
            <form
              className="party-token-card"
              onSubmit={(event) => {
                event.preventDefault();
                void respondToInvite("accepted");
              }}
            >
              <label htmlFor="manual-invite-token">Have an invite token?</label>
              <input
                id="manual-invite-token"
                value={manualInviteToken}
                onChange={(event) => setManualInviteToken(event.target.value)}
                placeholder="Paste token"
              />
              <button type="submit">Join private plan</button>
            </form>
          )}
        </aside>

        <section className="party-board" aria-live="polite">
          <p className="party-notice" role="status">
            {notice}
          </p>

          {!activeParty ? (
            <div className="party-empty">
              <span aria-hidden="true">01</span>
              <h2>Start with the people.</h2>
              <p>
                Create a private plan, then send one-time invitation links. A
                member&apos;s restrictions never appear in the roster.
              </p>
            </div>
          ) : (
            <>
              <section className="party-board__header">
                <div>
                  <p className="eyebrow">
                    {activeParty.isCreator ? "YOU CREATED THIS PLAN" : "SHARED WITH YOU"}
                  </p>
                  <h2>{activeParty.name}</h2>
                </div>
                <div className="party-policy-chips">
                  <span>
                    {activeParty.requireSharedDish
                      ? "One shared dish"
                      : "Different dishes welcome"}
                  </span>
                  <span>
                    {activeParty.fairnessStrategy === "least-misery"
                      ? "Protect the least satisfied"
                      : "Balance minimum + average"}
                  </span>
                </div>
              </section>

              <section className="party-members" aria-labelledby="party-members-title">
                <div className="party-section-heading">
                  <div>
                    <p className="eyebrow">ROSTER</p>
                    <h3 id="party-members-title">
                      Names and status, never profile details.
                    </h3>
                  </div>
                  <strong>
                    {
                      activeParty.members.filter(
                        (member) => member.status === "accepted",
                      ).length
                    }{" "}
                    joined
                  </strong>
                </div>
                <div className="party-member-list">
                  {activeParty.members.map((member) => (
                    <div className="party-member" key={member.id}>
                      <span aria-hidden="true">
                        {member.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <strong>{member.displayName}</strong>
                        <small>
                          {member.role === "creator" ? "Organizer" : "Guest"} ·{" "}
                          {statusLabel(member.status)}
                        </small>
                      </div>
                      {activeParty.isCreator && member.status === "invited" && (
                        <button
                          type="button"
                          onClick={() => void revokeInvite(member.id)}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {activeParty.isCreator && (
                <section className="party-invite-card" aria-labelledby="invite-title">
                  <div>
                    <p className="eyebrow">INVITE A FRIEND</p>
                    <h3 id="invite-title">Send a one-time private link.</h3>
                    <p>
                      The raw token is shown once. Store or share it now; only
                      its hash is kept by the server.
                    </p>
                  </div>
                  <form onSubmit={createInvite}>
                    <label htmlFor="invitee-name">Friend&apos;s display name</label>
                    <div>
                      <input
                        id="invitee-name"
                        value={inviteeName}
                        onChange={(event) => setInviteeName(event.target.value)}
                        placeholder="Maya"
                        maxLength={80}
                        required
                      />
                      <button type="submit">Create invite</button>
                    </div>
                  </form>
                  {shareUrl && (
                    <div className="party-share-link">
                      <label htmlFor="party-share-url">Private share link</label>
                      <div>
                        <input id="party-share-url" value={shareUrl} readOnly />
                        <button type="button" onClick={() => void copyShareUrl()}>
                          Copy
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section
                className="party-recommendations"
                aria-labelledby="party-recommendations-title"
              >
                <div className="party-section-heading">
                  <div>
                    <p className="eyebrow">SOMETHING FOR EVERYONE</p>
                    <h3 id="party-recommendations-title">
                      Eligible for every accepted member.
                    </h3>
                  </div>
                  {activeRecommendationFeed && (
                    <strong>
                      {activeRecommendationFeed.party.acceptedMemberCount} profiles
                      screened privately
                    </strong>
                  )}
                </div>

                {recommendationsLoading ? (
                  <p className="party-muted">Balancing the group...</p>
                ) : !activeRecommendationFeed ||
                  activeRecommendationFeed.recommendations.length === 0 ? (
                  <div className="party-no-match">
                    No reviewed restaurant satisfies every accepted
                    member&apos;s current hard constraints yet.
                  </div>
                ) : (
                  <div className="party-recommendation-list">
                    {activeRecommendationFeed.recommendations.map(
                      (recommendation, index) => (
                        <article
                          className="party-recommendation"
                          key={recommendation.restaurantId}
                        >
                          <div className="party-recommendation__rank">
                            {String(index + 1).padStart(2, "0")}
                          </div>
                          <div className="party-recommendation__body">
                            <div>
                              <h4>{recommendation.restaurantName}</h4>
                              <span
                                className={`party-safety ${recommendation.safetyStatus}`}
                              >
                                {recommendation.safetyStatus === "verified"
                                  ? "Dish evidence checked"
                                  : "Confirmation needed"}
                              </span>
                            </div>
                            <p>{recommendation.explanation}</p>
                            <small>{recommendation.safetySummary}</small>
                            <div className="party-fairness">
                              <span>
                                <strong>
                                  {recommendation.fairness.leastSatisfiedScore}
                                </strong>
                                least-satisfied
                              </span>
                              <span>
                                <strong>
                                  {recommendation.fairness.averageMemberScore}
                                </strong>
                                group average
                              </span>
                              <span>
                                <strong>
                                  {recommendation.yourOutcome.satisfactionScore}
                                </strong>
                                your match
                              </span>
                              <span>
                                <strong>
                                  {recommendation.selectedDishIds.length}
                                </strong>
                                dish option
                                {recommendation.selectedDishIds.length === 1
                                  ? ""
                                  : "s"}
                              </span>
                            </div>
                          </div>
                          <strong className="party-recommendation__score">
                            {recommendation.score}
                          </strong>
                        </article>
                      ),
                    )}
                  </div>
                )}
              </section>

              <aside className="party-privacy">
                <strong>Privacy boundary</strong>
                <p>
                  The browser receives aggregate group scores and your own
                  outcome only. It never receives another member&apos;s
                  allergens, dietary restrictions, learned weights, or dish
                  warnings.
                </p>
              </aside>
            </>
          )}
        </section>
      </section>

      <SiteFooter />
    </main>
  );
}

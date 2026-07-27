import type { PartyFairnessStrategy } from "../app/lib/party-recommendations.ts";

export type PartyMemberStatus =
  | "invited"
  | "accepted"
  | "declined"
  | "revoked";

export type PublicPartyMember = {
  id: string;
  displayName: string;
  role: "creator" | "member";
  status: PartyMemberStatus;
  createdAt: number;
  updatedAt: number;
  inviteExpiresAt?: number;
};

export type PublicParty = {
  id: string;
  name: string;
  status: "active" | "archived";
  requireSharedDish: boolean;
  fairnessStrategy: PartyFairnessStrategy;
  isCreator: boolean;
  createdAt: number;
  updatedAt: number;
  members: PublicPartyMember[];
};

export type AcceptedPartyMember = {
  memberId: string;
  principalId: string;
  displayName: string;
};

export type PartyRecommendationContext = {
  party: {
    id: string;
    name: string;
    requireSharedDish: boolean;
    fairnessStrategy: PartyFairnessStrategy;
  };
  acceptedMembers: AcceptedPartyMember[];
};

export type PartyStoreRuntime = {
  database?: Cloudflare.Env["DB"];
  now?: () => number;
  idFactory?: (kind: "party" | "member") => string;
  inviteTokenFactory?: () => string;
};

export type PartyStoreErrorCode =
  | "invalid-party-input"
  | "party-not-found"
  | "party-forbidden"
  | "party-not-active"
  | "party-full"
  | "invite-not-found"
  | "invite-forbidden"
  | "invite-expired"
  | "invite-not-actionable"
  | "already-party-member";

export class PartyStoreError extends Error {
  readonly code: PartyStoreErrorCode;
  readonly status: number;

  constructor(
    code: PartyStoreErrorCode,
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "PartyStoreError";
    this.code = code;
    this.status = status;
  }
}

type PartyRow = {
  id: string;
  creator_principal_id: string;
  name: string;
  status: "active" | "archived";
  require_shared_dish: number;
  fairness_strategy: PartyFairnessStrategy;
  created_at: number;
  updated_at: number;
};

type MemberRow = {
  id: string;
  party_id: string;
  principal_id: string | null;
  display_name: string;
  role: "creator" | "member";
  status: PartyMemberStatus;
  created_at: number;
  updated_at: number;
  invite_expires_at: number | null;
};

type InviteRow = MemberRow & {
  creator_principal_id: string;
  party_status: "active" | "archived";
};

type CountRow = {
  count: number;
};

type PartyDatabase = Pick<Cloudflare.Env["DB"], "prepare" | "batch">;

const MAX_PARTY_MEMBERS = 25;
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function cleanText(value: string, maximum: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, maximum);
}

function requirePrincipalId(value: string): string {
  const principalId = cleanText(value, 200);
  if (!principalId || !principalId.includes(":")) {
    throw new PartyStoreError(
      "invalid-party-input",
      400,
      "A current principal is required.",
    );
  }
  return principalId;
}

function requireName(value: string, label: string): string {
  const name = cleanText(value, 80);
  if (!name) {
    throw new PartyStoreError(
      "invalid-party-input",
      400,
      `${label} is required.`,
    );
  }
  return name;
}

function requirePartyId(value: string): string {
  const partyId = cleanText(value, 120);
  if (!partyId) {
    throw new PartyStoreError(
      "invalid-party-input",
      400,
      "A party id is required.",
    );
  }
  return partyId;
}

function defaultIdFactory(kind: "party" | "member"): string {
  return `${kind}_${crypto.randomUUID()}`;
}

function generatedInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export async function hashPartyInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function databaseFor(
  runtime: PartyStoreRuntime,
): Promise<Cloudflare.Env["DB"]> {
  if (runtime.database) return runtime.database;
  const { getD1 } = await import("./index.ts");
  return getD1();
}

function primarySession(database: Cloudflare.Env["DB"]): PartyDatabase {
  return database.withSession("first-primary");
}

function publicMember(row: MemberRow): PublicPartyMember {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    inviteExpiresAt:
      row.status === "invited" && row.invite_expires_at
        ? Number(row.invite_expires_at)
        : undefined,
  };
}

async function partyRow(
  database: PartyDatabase,
  partyId: string,
): Promise<PartyRow | null> {
  return database
    .prepare(
      `SELECT
        id,
        creator_principal_id,
        name,
        status,
        require_shared_dish,
        fairness_strategy,
        created_at,
        updated_at
       FROM parties
       WHERE id = ?1`,
    )
    .bind(partyId)
    .first<PartyRow>();
}

async function memberRows(
  database: PartyDatabase,
  partyId: string,
): Promise<MemberRow[]> {
  const result = await database
    .prepare(
      `SELECT
        id,
        party_id,
        principal_id,
        display_name,
        role,
        status,
        created_at,
        updated_at,
        invite_expires_at
       FROM party_members
       WHERE party_id = ?1
       ORDER BY
         CASE role WHEN 'creator' THEN 0 ELSE 1 END,
         created_at,
         id`,
    )
    .bind(partyId)
    .all<MemberRow>();
  return result.results ?? [];
}

async function canViewParty(
  database: PartyDatabase,
  party: PartyRow,
  principalId: string,
): Promise<boolean> {
  if (party.creator_principal_id === principalId) return true;
  const member = await database
    .prepare(
      `SELECT id
       FROM party_members
       WHERE party_id = ?1
         AND principal_id = ?2
         AND status = 'accepted'
       LIMIT 1`,
    )
    .bind(party.id, principalId)
    .first<{ id: string }>();
  return Boolean(member);
}

async function requireCreatorParty(
  database: PartyDatabase,
  partyId: string,
  principalId: string,
): Promise<PartyRow> {
  const party = await partyRow(database, partyId);
  if (!party) {
    throw new PartyStoreError(
      "party-not-found",
      404,
      "That party was not found.",
    );
  }
  if (party.creator_principal_id !== principalId) {
    throw new PartyStoreError(
      "party-forbidden",
      403,
      "Only the party creator can manage invitations.",
    );
  }
  if (party.status !== "active") {
    throw new PartyStoreError(
      "party-not-active",
      409,
      "That party is no longer active.",
    );
  }
  return party;
}

function viewFromRows(
  party: PartyRow,
  members: MemberRow[],
  principalId: string,
): PublicParty {
  const isCreator = party.creator_principal_id === principalId;
  const visibleMembers = isCreator
    ? members
    : members.filter((member) => member.status === "accepted");

  return {
    id: party.id,
    name: party.name,
    status: party.status,
    requireSharedDish: Boolean(party.require_shared_dish),
    fairnessStrategy: party.fairness_strategy,
    isCreator,
    createdAt: Number(party.created_at),
    updatedAt: Number(party.updated_at),
    members: visibleMembers.map(publicMember),
  };
}

export async function createParty(
  input: {
    creatorPrincipalId: string;
    creatorDisplayName: string;
    name: string;
    requireSharedDish?: boolean;
    fairnessStrategy?: PartyFairnessStrategy;
  },
  runtime: PartyStoreRuntime = {},
): Promise<PublicParty> {
  const creatorPrincipalId = requirePrincipalId(input.creatorPrincipalId);
  const creatorDisplayName = requireName(
    input.creatorDisplayName,
    "Creator display name",
  );
  const name = requireName(input.name, "Party name");
  const fairnessStrategy =
    input.fairnessStrategy === "min-average"
      ? "min-average"
      : "least-misery";
  const now = (runtime.now ?? Date.now)();
  const idFactory = runtime.idFactory ?? defaultIdFactory;
  const partyId = idFactory("party");
  const creatorMemberId = idFactory("member");
  const database = await databaseFor(runtime);

  await database.batch([
    database
      .prepare(
        `INSERT INTO parties (
          id,
          creator_principal_id,
          name,
          status,
          require_shared_dish,
          fairness_strategy,
          created_at,
          updated_at
        ) VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?6)`,
      )
      .bind(
        partyId,
        creatorPrincipalId,
        name,
        input.requireSharedDish ? 1 : 0,
        fairnessStrategy,
        now,
      ),
    database
      .prepare(
        `INSERT INTO party_members (
          id,
          party_id,
          principal_id,
          display_name,
          role,
          status,
          created_at,
          updated_at,
          responded_at
        ) VALUES (?1, ?2, ?3, ?4, 'creator', 'accepted', ?5, ?5, ?5)`,
      )
      .bind(
        creatorMemberId,
        partyId,
        creatorPrincipalId,
        creatorDisplayName,
        now,
      ),
  ]);

  return {
    id: partyId,
    name,
    status: "active",
    requireSharedDish: Boolean(input.requireSharedDish),
    fairnessStrategy,
    isCreator: true,
    createdAt: now,
    updatedAt: now,
    members: [
      {
        id: creatorMemberId,
        displayName: creatorDisplayName,
        role: "creator",
        status: "accepted",
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

export async function getPartyForPrincipal(
  partyIdValue: string,
  principalIdValue: string,
  runtime: PartyStoreRuntime = {},
): Promise<PublicParty> {
  const partyId = requirePartyId(partyIdValue);
  const principalId = requirePrincipalId(principalIdValue);
  const database = primarySession(await databaseFor(runtime));
  const party = await partyRow(database, partyId);

  if (!party || !(await canViewParty(database, party, principalId))) {
    throw new PartyStoreError(
      "party-not-found",
      404,
      "That party was not found.",
    );
  }

  return viewFromRows(
    party,
    await memberRows(database, partyId),
    principalId,
  );
}

export async function listPartiesForPrincipal(
  principalIdValue: string,
  runtime: PartyStoreRuntime = {},
): Promise<PublicParty[]> {
  const principalId = requirePrincipalId(principalIdValue);
  const database = primarySession(await databaseFor(runtime));
  const result = await database
    .prepare(
      `SELECT DISTINCT
        p.id,
        p.creator_principal_id,
        p.name,
        p.status,
        p.require_shared_dish,
        p.fairness_strategy,
        p.created_at,
        p.updated_at
       FROM parties p
       LEFT JOIN party_members pm
         ON pm.party_id = p.id
        AND pm.principal_id = ?1
        AND pm.status = 'accepted'
       WHERE p.creator_principal_id = ?1 OR pm.id IS NOT NULL
       ORDER BY p.updated_at DESC, p.id
       LIMIT 50`,
    )
    .bind(principalId)
    .all<PartyRow>();

  const parties = (result.results ?? []) as PartyRow[];
  return Promise.all(
    parties.map(async (party) =>
      viewFromRows(
        party,
        await memberRows(database, party.id),
        principalId,
      ),
    ),
  );
}

export async function createPartyInvitation(
  input: {
    partyId: string;
    creatorPrincipalId: string;
    inviteeDisplayName: string;
  },
  runtime: PartyStoreRuntime = {},
): Promise<{ invitation: PublicPartyMember; inviteToken: string }> {
  const partyId = requirePartyId(input.partyId);
  const creatorPrincipalId = requirePrincipalId(input.creatorPrincipalId);
  const inviteeDisplayName = requireName(
    input.inviteeDisplayName,
    "Invitee display name",
  );
  const databaseBinding = await databaseFor(runtime);
  const database = primarySession(databaseBinding);
  await requireCreatorParty(database, partyId, creatorPrincipalId);

  const count = await database
    .prepare(
      `SELECT COUNT(*) AS count
       FROM party_members
       WHERE party_id = ?1
         AND status IN ('invited', 'accepted')`,
    )
    .bind(partyId)
    .first<CountRow>();
  if (Number(count?.count ?? 0) >= MAX_PARTY_MEMBERS) {
    throw new PartyStoreError(
      "party-full",
      409,
      `A party can have at most ${MAX_PARTY_MEMBERS} active members.`,
    );
  }

  const now = (runtime.now ?? Date.now)();
  const idFactory = runtime.idFactory ?? defaultIdFactory;
  const memberId = idFactory("member");
  const inviteToken =
    runtime.inviteTokenFactory?.() ?? generatedInviteToken();
  const inviteTokenHash = await hashPartyInviteToken(inviteToken);
  const inviteExpiresAt = now + INVITE_LIFETIME_MS;

  await databaseBinding
    .prepare(
      `INSERT INTO party_members (
        id,
        party_id,
        display_name,
        role,
        status,
        invite_token_hash,
        invite_expires_at,
        created_at,
        updated_at
      ) VALUES (?1, ?2, ?3, 'member', 'invited', ?4, ?5, ?6, ?6)`,
    )
    .bind(
      memberId,
      partyId,
      inviteeDisplayName,
      inviteTokenHash,
      inviteExpiresAt,
      now,
    )
    .run();

  return {
    invitation: {
      id: memberId,
      displayName: inviteeDisplayName,
      role: "member",
      status: "invited",
      createdAt: now,
      updatedAt: now,
      inviteExpiresAt,
    },
    inviteToken,
  };
}

export async function revokePartyInvitation(
  input: {
    partyId: string;
    memberId: string;
    creatorPrincipalId: string;
  },
  runtime: PartyStoreRuntime = {},
): Promise<PublicPartyMember> {
  const partyId = requirePartyId(input.partyId);
  const memberId = requirePartyId(input.memberId);
  const creatorPrincipalId = requirePrincipalId(input.creatorPrincipalId);
  const databaseBinding = await databaseFor(runtime);
  const database = primarySession(databaseBinding);
  await requireCreatorParty(database, partyId, creatorPrincipalId);

  const row = await database
    .prepare(
      `SELECT
        id,
        party_id,
        principal_id,
        display_name,
        role,
        status,
        created_at,
        updated_at,
        invite_expires_at
       FROM party_members
       WHERE id = ?1 AND party_id = ?2 AND role = 'member'`,
    )
    .bind(memberId, partyId)
    .first<MemberRow>();
  if (!row) {
    throw new PartyStoreError(
      "invite-not-found",
      404,
      "That invitation was not found.",
    );
  }
  if (row.status !== "invited") {
    throw new PartyStoreError(
      "invite-not-actionable",
      409,
      "Only a pending invitation can be revoked.",
    );
  }

  const now = (runtime.now ?? Date.now)();
  const result = await databaseBinding
    .prepare(
      `UPDATE party_members
       SET status = 'revoked',
           invite_token_hash = NULL,
           updated_at = ?1,
           revoked_at = ?1
       WHERE id = ?2
         AND party_id = ?3
         AND status = 'invited'`,
    )
    .bind(now, memberId, partyId)
    .run();
  if (result.meta.changes !== 1) {
    throw new PartyStoreError(
      "invite-not-actionable",
      409,
      "That invitation is no longer pending.",
    );
  }

  return publicMember({ ...row, status: "revoked", updated_at: now });
}

export async function respondToPartyInvitation(
  input: {
    principalId: string;
    inviteToken: string;
    response: "accepted" | "declined";
  },
  runtime: PartyStoreRuntime = {},
): Promise<{ partyId: string; membership: PublicPartyMember }> {
  const principalId = requirePrincipalId(input.principalId);
  const inviteToken = input.inviteToken.trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(inviteToken)) {
    throw new PartyStoreError(
      "invite-not-found",
      404,
      "That invitation is invalid or no longer available.",
    );
  }
  const tokenHash = await hashPartyInviteToken(inviteToken);
  const databaseBinding = await databaseFor(runtime);
  const database = primarySession(databaseBinding);
  const invite = await database
    .prepare(
      `SELECT
        pm.id,
        pm.party_id,
        pm.principal_id,
        pm.display_name,
        pm.role,
        pm.status,
        pm.created_at,
        pm.updated_at,
        pm.invite_expires_at,
        p.creator_principal_id,
        p.status AS party_status
       FROM party_members pm
       INNER JOIN parties p ON p.id = pm.party_id
       WHERE pm.invite_token_hash = ?1
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<InviteRow>();

  if (!invite || invite.role !== "member" || invite.status === "revoked") {
    throw new PartyStoreError(
      "invite-not-found",
      404,
      "That invitation is invalid or no longer available.",
    );
  }
  if (invite.party_status !== "active") {
    throw new PartyStoreError(
      "party-not-active",
      409,
      "That party is no longer active.",
    );
  }
  const now = (runtime.now ?? Date.now)();
  if (!invite.invite_expires_at || invite.invite_expires_at <= now) {
    throw new PartyStoreError(
      "invite-expired",
      410,
      "That invitation has expired.",
    );
  }
  if (invite.principal_id && invite.principal_id !== principalId) {
    throw new PartyStoreError(
      "invite-forbidden",
      403,
      "That invitation belongs to a different participant.",
    );
  }
  if (invite.status !== "invited") {
    throw new PartyStoreError(
      "invite-not-actionable",
      409,
      "That invitation has already been used.",
    );
  }

  const existing = await database
    .prepare(
      `SELECT id
       FROM party_members
       WHERE party_id = ?1
         AND principal_id = ?2
         AND id <> ?3
       LIMIT 1`,
    )
    .bind(invite.party_id, principalId, invite.id)
    .first<{ id: string }>();
  if (existing) {
    throw new PartyStoreError(
      "already-party-member",
      409,
      "This principal is already a member of the party.",
    );
  }

  let changes = 0;
  try {
    const result = await databaseBinding
      .prepare(
        `UPDATE party_members
         SET principal_id = ?1,
             status = ?2,
             invite_token_hash = NULL,
             updated_at = ?3,
             responded_at = ?3
         WHERE id = ?4
           AND invite_token_hash = ?5
           AND status = 'invited'
           AND (principal_id IS NULL OR principal_id = ?1)`,
      )
      .bind(
        principalId,
        input.response,
        now,
        invite.id,
        tokenHash,
      )
      .run();
    changes = result.meta.changes;
  } catch {
    throw new PartyStoreError(
      "already-party-member",
      409,
      "This principal is already a member of the party.",
    );
  }
  if (changes !== 1) {
    throw new PartyStoreError(
      "invite-not-actionable",
      409,
      "That invitation changed before it could be updated.",
    );
  }

  return {
    partyId: invite.party_id,
    membership: publicMember({
      ...invite,
      principal_id: principalId,
      status: input.response,
      updated_at: now,
      invite_expires_at: null,
    }),
  };
}

export async function getPartyRecommendationContext(
  partyIdValue: string,
  principalIdValue: string,
  runtime: PartyStoreRuntime = {},
): Promise<PartyRecommendationContext> {
  const partyId = requirePartyId(partyIdValue);
  const principalId = requirePrincipalId(principalIdValue);
  const database = primarySession(await databaseFor(runtime));
  const party = await partyRow(database, partyId);

  if (!party || !(await canViewParty(database, party, principalId))) {
    throw new PartyStoreError(
      "party-not-found",
      404,
      "That party was not found.",
    );
  }
  if (party.status !== "active") {
    throw new PartyStoreError(
      "party-not-active",
      409,
      "That party is no longer active.",
    );
  }

  const result = await database
    .prepare(
      `SELECT
        id,
        principal_id,
        display_name
       FROM party_members
       WHERE party_id = ?1
         AND status = 'accepted'
         AND principal_id IS NOT NULL
       ORDER BY
         CASE role WHEN 'creator' THEN 0 ELSE 1 END,
         created_at,
         id`,
    )
    .bind(partyId)
    .all<{
      id: string;
      principal_id: string;
      display_name: string;
    }>();

  return {
    party: {
      id: party.id,
      name: party.name,
      requireSharedDish: Boolean(party.require_shared_dish),
      fairnessStrategy: party.fairness_strategy,
    },
    acceptedMembers: (
      (result.results ?? []) as Array<{
        id: string;
        principal_id: string;
        display_name: string;
      }>
    ).map((member) => ({
      memberId: member.id,
      principalId: member.principal_id,
      displayName: member.display_name,
    })),
  };
}

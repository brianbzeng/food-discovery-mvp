import { getD1 } from "./index";

type SavedRow = {
  restaurant_id: string;
  created_at: number;
};

export async function listSavedRestaurants(principalId: string) {
  const db = await getD1();
  const result = await db
    .prepare(
      `SELECT s.restaurant_id, s.created_at
       FROM saved_restaurants s
       INNER JOIN restaurants r ON r.id = s.restaurant_id
       WHERE s.principal_id = ?1
         AND r.discovery_status = 'eligible'
         AND r.ownership_type IN ('independent', 'local_group')
       ORDER BY s.created_at DESC`,
    )
    .bind(principalId)
    .all<SavedRow>();

  return (result.results ?? []).map((row: SavedRow) => ({
    restaurantId: row.restaurant_id,
    createdAt: row.created_at,
  }));
}

export async function saveRestaurant(
  principalId: string,
  restaurantId: string,
) {
  const db = await getD1();
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO saved_restaurants (
        id,
        principal_id,
        restaurant_id,
        created_at
      )
      SELECT ?1, ?2, r.id, ?3
      FROM restaurants r
      WHERE r.id = ?4
        AND r.discovery_status = 'eligible'
        AND r.ownership_type IN ('independent', 'local_group')`,
    )
    .bind(crypto.randomUUID(), principalId, Date.now(), restaurantId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    const existing = await db
      .prepare(
        `SELECT id
         FROM saved_restaurants
         WHERE principal_id = ?1 AND restaurant_id = ?2`,
      )
      .bind(principalId, restaurantId)
      .first<{ id: string }>();
    if (!existing) throw new Error("Restaurant is not eligible to save.");
  }

  return listSavedRestaurants(principalId);
}

export async function removeSavedRestaurant(
  principalId: string,
  restaurantId: string,
) {
  const db = await getD1();
  await db
    .prepare(
      `DELETE FROM saved_restaurants
       WHERE principal_id = ?1 AND restaurant_id = ?2`,
    )
    .bind(principalId, restaurantId)
    .run();

  return listSavedRestaurants(principalId);
}

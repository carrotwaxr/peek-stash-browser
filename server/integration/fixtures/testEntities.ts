/**
 * Test Entity IDs (sweep item 83)
 *
 * The ids come from the replay fixture's manifest, where `npm run
 * fixtures:generate` picks them from the synthetic library with the criteria
 * in stash-replay/selectTestEntities.ts (a scene with performers, tags and a
 * studio; a performer, studio and tag on several scenes; a group, its scene
 * and a gallery with images and scenes; images that inherit from their
 * gallery; a scene that inherits tags). Every one is a recorded entity, so
 * it exists in the test Stash too.
 *
 * A replay run (STASH_REPLAY=1) uses the manifest's ids. A live run against
 * the test Stash sees the source ids, which are the manifest's minus
 * FIXTURE_ID_OFFSET. An empty id means "none": the tests that need it
 * discover the entity themselves.
 */
import {
  FIXTURE_ID_OFFSET,
  TEST_ENTITIES as MANIFEST_ENTITIES,
} from "../stash-replay/fixture/manifest.js";

type TestEntities = typeof MANIFEST_ENTITIES;

function liveId(id: string): string {
  return id === "" ? "" : String(Number(id) - FIXTURE_ID_OFFSET);
}

function forThisRun(entities: TestEntities): TestEntities {
  if (process.env.STASH_REPLAY === "1") return entities;
  const live = { ...entities };
  for (const key of Object.keys(live) as Array<keyof TestEntities>) {
    live[key] = liveId(live[key]);
  }
  return live;
}

export const TEST_ENTITIES = forThisRun(MANIFEST_ENTITIES);

/**
 * Test Admin Credentials
 *
 * These are used to create/login the test admin user.
 * The integration test setup will create this user if it doesn't exist.
 */
export const TEST_ADMIN = {
  username: "integration_admin",
  password: "integration_test_password_123",
};

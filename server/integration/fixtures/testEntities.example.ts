/**
 * Test Entity IDs
 *
 * Copy this file to testEntities.ts and fill in IDs from your Stash library.
 * These entities are used by integration tests to validate API behavior.
 *
 * Requirements:
 * - sceneWithRelations: A scene that has performers, tags, and a studio
 * - performerWithScenes: A performer that appears in multiple scenes
 * - studioWithScenes: A studio with multiple scenes
 * - tagWithEntities: A tag used on scenes, performers, or studios
 * - groupWithScenes: A group/collection containing scenes
 * - galleryWithImages: A gallery containing images
 * - restrictableTag: A tag that can be used for content restriction tests
 */
export const TEST_ENTITIES = {
  sceneWithRelations: "REPLACE_WITH_SCENE_ID",
  performerWithScenes: "REPLACE_WITH_PERFORMER_ID",
  studioWithScenes: "REPLACE_WITH_STUDIO_ID",
  tagWithEntities: "REPLACE_WITH_TAG_ID",
  groupWithScenes: "REPLACE_WITH_GROUP_ID",
  galleryWithImages: "REPLACE_WITH_GALLERY_ID",
  restrictableTag: "REPLACE_WITH_TAG_ID_FOR_RESTRICTIONS",
};

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

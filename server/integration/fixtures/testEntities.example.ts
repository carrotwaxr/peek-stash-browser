/**
 * Test Entity IDs
 *
 * Copy this file to testEntities.ts and fill in IDs from your Stash library.
 * These entities are used by integration tests to validate API behavior.
 *
 * Requirements:
 * - sceneWithRelations: A scene that has performers, tags, and a studio
 * - performerWithScenes: A performer that appears in multiple scenes.
 *   For rich tooltip tests, should also have tags, groups, galleries, and studios.
 * - studioWithScenes: A studio with multiple scenes.
 *   For rich tooltip tests, should also have tags, groups, galleries, and performers.
 * - tagWithEntities: A tag used on scenes, performers, studios, groups, and galleries.
 *   For rich tooltip tests, should have diverse entity associations.
 * - groupWithScenes: A group/collection containing scenes.
 *   For rich tooltip tests, should also have performers, tags, and galleries.
 * - sceneInGroup: A scene that belongs to groupWithScenes
 * - galleryWithImages: A gallery containing images
 * - galleryWithScenes: A gallery that has scenes linked to it (for scene filter tests)
 * - restrictableTag: A tag that can be used for content restriction tests
 * - galleryPerformerForInheritance: (Optional) A performer assigned to a gallery
 *   where the gallery's images do NOT have this performer directly assigned.
 *   Used to test gallery-to-image inheritance. Set to empty string to skip test.
 * - imageWithGalleryInheritance: (Optional) Image that inherits from gallery.
 *   Should be an image with no direct performers/tags that gets them from gallery.
 * - imageWithOwnProperties: (Optional) Image with its OWN properties while in a gallery.
 *   Used to verify inheritance doesn't overwrite existing image properties.
 */
export const TEST_ENTITIES = {
  sceneWithRelations: "REPLACE_WITH_SCENE_ID",
  performerWithScenes: "REPLACE_WITH_PERFORMER_ID",
  studioWithScenes: "REPLACE_WITH_STUDIO_ID",
  tagWithEntities: "REPLACE_WITH_TAG_ID",
  groupWithScenes: "REPLACE_WITH_GROUP_ID",
  sceneInGroup: "REPLACE_WITH_SCENE_ID_IN_GROUP",
  galleryWithImages: "REPLACE_WITH_GALLERY_ID",
  galleryWithScenes: "REPLACE_WITH_GALLERY_ID_WITH_SCENES",
  restrictableTag: "REPLACE_WITH_TAG_ID_FOR_RESTRICTIONS",
  galleryPerformerForInheritance: "", // Optional - leave empty to skip inheritance test
  imageWithGalleryInheritance: "", // Optional - image that inherits from gallery
  imageWithOwnProperties: "", // Optional - image with own properties in gallery
  sceneWithInheritedTags: "", // Optional - scene inheriting tags from performer/studio
  inheritedTagFromPerformerOrStudio: "", // Optional - the tag ID inherited by the scene
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

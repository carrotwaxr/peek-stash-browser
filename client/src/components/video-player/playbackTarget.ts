/**
 * Whether this browser's media elements can hand playback to an AirPlay
 * device: WebKit's, so Safari and every browser on iOS (Chrome and Edge there
 * are WebKit too). The device fetches the stream itself, without the tab's
 * cookie, so the same browsers that show the AirPlay button play the signed
 * media link's sources.
 */
export function canPlayToAirPlay(): boolean {
  return "webkitShowPlaybackTargetPicker" in HTMLVideoElement.prototype;
}

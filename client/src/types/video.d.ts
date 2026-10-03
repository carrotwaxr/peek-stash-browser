/**
 * Ambient type declarations for Video.js and related packages.
 *
 * Video.js 7.x does not ship TypeScript declarations. These minimal declarations
 * silence tsc errors without changing any runtime behavior.
 */

// ---------------------------------------------------------------------------
// video.js
// ---------------------------------------------------------------------------
declare module "video.js" {
  /** Video.js player instance (opaque — use `any` to avoid modeling the full API). */
  type Player = any;
  type Component = any;
  type Plugin = any;

  interface VideoJsStatic {
    (element: any, options?: any, ready?: () => void): Player;

    // Class / plugin registries
    getComponent(name: string): any;
    getPlugin(name: string): any;
    registerComponent(name: string, comp: any): void;
    registerPlugin(name: string, plugin: any): void;

    // Middleware
    use(type: string, middleware: any): void;
    middleware: { TERMINATOR: symbol };

    // Utilities
    dom: {
      createEl(tagName?: string, props?: any, attrs?: any): any;
      getPointerPosition(el: any, event: any): { x: number; y: number };
    };
    browser: { IS_SAFARI: boolean; [key: string]: any };
    createTimeRanges(ranges: Array<[number, number]>): any;
    log: {
      level(lvl: string): void;
      (...args: any[]): void;
    };
  }

  const videojs: VideoJsStatic;
  export default videojs;
}

// ---------------------------------------------------------------------------
// Packages that ship no types
// ---------------------------------------------------------------------------
declare module "videojs-seek-buttons" {
  // Side-effect import only
}

// ---------------------------------------------------------------------------
// Google Cast sender framework (loaded from gstatic by video-player/cast/castSdk.ts)
// Only what Peek reads; the rest of the framework stays untyped.
// ---------------------------------------------------------------------------
declare namespace cast.framework {
  interface CastOptions {
    receiverApplicationId: string;
    autoJoinPolicy: string;
  }
  interface CastContext {
    setOptions(options: CastOptions): void;
  }
  const CastContext: { getInstance(): CastContext };
}

declare namespace chrome.cast {
  const AutoJoinPolicy: { ORIGIN_SCOPED: string };
  const media: { DEFAULT_MEDIA_RECEIVER_APP_ID: string };
}

interface Window {
  __onGCastApiAvailable?: (available: boolean) => void;
}

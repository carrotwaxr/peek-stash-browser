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
declare module "crypto-js" {
  const CryptoJS: {
    SHA256(message: string): any;
    enc: { Hex: any; [key: string]: any };
    [key: string]: any;
  };
  export default CryptoJS;
}

declare module "videojs-vtt.js" {
  export const WebVTT: {
    Parser: new (window: Window, decoder: any) => {
      oncue: ((cue: any) => void) | null;
      parse(data: any): void;
      flush(): void;
    };
    StringDecoder(): any;
  };
}

declare module "@silvermine/videojs-airplay" {
  const plugin: (videojs: any) => void;
  export default plugin;
}

declare module "@silvermine/videojs-chromecast" {
  const plugin: (videojs: any) => void;
  export default plugin;
}

declare module "videojs-vr" {
  // Side-effect import only — registers itself on the player prototype
}

declare module "videojs-seek-buttons" {
  // Side-effect import only
}

declare module "localforage" {
  const localForage: {
    getItem<T = any>(key: string): Promise<T | null>;
    setItem<T = any>(key: string, value: T): Promise<T>;
    removeItem(key: string): Promise<void>;
    [key: string]: any;
  };
  export default localForage;
}

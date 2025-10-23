import { describe, it, expect } from 'vitest';
import { getVideoJsOptions } from './videoPlayerUtils';

describe('videoPlayerUtils', () => {
  describe('getVideoJsOptions', () => {
    it('should return valid Video.js configuration with provided sources', () => {
      const sources = [
        { src: 'http://example.com/video.m3u8', type: 'application/x-mpegURL' }
      ];

      const options = getVideoJsOptions(sources);

      expect(options).toHaveProperty('autoplay', true);
      expect(options).toHaveProperty('controls', true);
      expect(options).toHaveProperty('responsive', true);
      expect(options).toHaveProperty('fluid', true);
      expect(options).toHaveProperty('sources', sources);
      expect(options).toHaveProperty('liveui', false);
    });

    it('should include playback rate options only for direct play', () => {
      const sources = [];

      // Direct play - should have playback rates
      const directOptions = getVideoJsOptions(sources, true);
      expect(directOptions.playbackRates).toEqual([0.5, 1, 1.25, 1.5, 2]);

      // Transcoded - should NOT have playback rates
      const transcodedOptions = getVideoJsOptions(sources, false);
      expect(transcodedOptions.playbackRates).toBeUndefined();

      // Default (no parameter) - should NOT have playback rates
      const defaultOptions = getVideoJsOptions(sources);
      expect(defaultOptions.playbackRates).toBeUndefined();
    });

    it('should configure HLS/VHS settings', () => {
      const sources = [];
      const options = getVideoJsOptions(sources);

      expect(options.html5).toBeDefined();
      expect(options.html5.vhs).toBeDefined();
      expect(options.html5.vhs.enableLowInitialPlaylist).toBe(false);
      expect(options.html5.vhs.smoothQualityChange).toBe(true);
      expect(options.html5.vhs.useBandwidthFromLocalStorage).toBe(true);
      expect(options.html5.vhs.handlePartialData).toBe(true);
      expect(options.html5.vhs.experimentalBufferBasedABR).toBe(false);
    });

    it('should include quality levels plugin configuration', () => {
      const sources = [];
      const options = getVideoJsOptions(sources);

      expect(options.plugins).toBeDefined();
      expect(options.plugins.qualityLevels).toEqual({});
    });

    it('should disable native audio and video tracks', () => {
      const sources = [];
      const options = getVideoJsOptions(sources);

      expect(options.html5.nativeAudioTracks).toBe(false);
      expect(options.html5.nativeVideoTracks).toBe(false);
    });

    it('should handle empty sources array', () => {
      const options = getVideoJsOptions([]);

      expect(options.sources).toEqual([]);
      expect(options.autoplay).toBe(true);
    });

    it('should handle multiple sources', () => {
      const sources = [
        { src: 'http://example.com/video1.m3u8', type: 'application/x-mpegURL' },
        { src: 'http://example.com/video2.mp4', type: 'video/mp4' }
      ];

      const options = getVideoJsOptions(sources);

      expect(options.sources).toEqual(sources);
      expect(options.sources).toHaveLength(2);
    });
  });
});

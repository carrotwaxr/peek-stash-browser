import { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import http from 'http';
import https from 'https';
import { URL } from 'url';

/**
 * Proxy Stash media requests to avoid exposing API keys to clients
 * Handles images, sprites, and other static media
 */
export const proxyStashMedia = async (req: Request, res: Response) => {
  try {
    const { path } = req.query;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid path parameter' });
    }

    const stashUrl = process.env.STASH_URL?.replace('/graphql', '');
    const apiKey = process.env.STASH_API_KEY;

    if (!stashUrl || !apiKey) {
      logger.error('STASH_URL or STASH_API_KEY not configured');
      return res.status(500).json({ error: 'Stash configuration missing' });
    }

    // Construct full Stash URL with API key
    const fullUrl = `${stashUrl}${path}${path.includes('?') ? '&' : '?'}apikey=${apiKey}`;

    logger.debug('Proxying Stash media request', {
      path,
      stashUrl: fullUrl.replace(apiKey, '***'),
    });

    // Parse URL to determine protocol
    const urlObj = new URL(fullUrl);
    const httpModule = urlObj.protocol === 'https:' ? https : http;

    // Make request to Stash
    const proxyReq = httpModule.get(fullUrl, (proxyRes) => {
      // Forward response headers
      if (proxyRes.headers['content-type']) {
        res.setHeader('Content-Type', proxyRes.headers['content-type']);
      }
      if (proxyRes.headers['content-length']) {
        res.setHeader('Content-Length', proxyRes.headers['content-length']);
      }
      if (proxyRes.headers['cache-control']) {
        res.setHeader('Cache-Control', proxyRes.headers['cache-control']);
      } else {
        // Default cache policy for images
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }

      // Set status code
      res.status(proxyRes.statusCode || 200);

      // Stream response back to client
      proxyRes.pipe(res);
    });

    // Handle request errors
    proxyReq.on('error', (error: Error) => {
      logger.error('Error proxying Stash media', { error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Proxy request failed' });
      }
    });

    // Set timeout
    proxyReq.setTimeout(30000, () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Proxy request timeout' });
      }
    });

  } catch (error) {
    logger.error('Error proxying Stash media', { error });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

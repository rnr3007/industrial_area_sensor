/**
 * Reverse-proxies the CCTV HLS stream from the alia_mediamtx container to
 * authenticated browsers only, at /api/cctv/*.
 *
 * The RTSP URL (with its username/password) is configured directly on the
 * alia_mediamtx service via CCTV_RTSP_URL - it never passes through this
 * backend or the frontend bundle. This route just forwards the already
 * credential-free HLS manifest/segments MediaMTX produces, gated behind the
 * same operator-JWT `authenticate` middleware as the rest of /api, so the
 * feed isn't reachable by anyone who merely knows the URL.
 */
import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authenticate } from '../middleware/auth.js';
import config from '../config/index.js';

function makeCctvProxy(mountPrefix) {
  return createProxyMiddleware({
    // http-proxy-middleware forwards the FULL original path here
    // (e.g. /api/cctv/cctv/index.m3u8), not the router-relative req.url -
    // so the mount prefix has to be stripped explicitly, or MediaMTX sees
    // a bogus path name and rejects it as unconfigured. Confirmed by
    // MediaMTX logs: `path 'api/cctv/cctv' is not configured` before this
    // was added.
    target: config.cctv.mediamtxUrl,
    changeOrigin: true,
    pathRewrite: { [`^${mountPrefix}`]: '' },
    // MediaMTX's HLS handler 302s once per session (its cookie-support
    // check) with an absolute-path Location like '/cctv/index.m3u8?...'.
    // Left as-is, a browser follows that against the site's root - outside
    // this mount entirely - and lands on the frontend's SPA fallback
    // (index.html) instead of the manifest. Re-prefix it so the follow-up
    // redirect request comes back through this same proxy.
    // NOTE: the installed http-proxy-middleware version (2.x) uses this flat
    // onProxyRes option, NOT the nested `on: { proxyRes }` shape - that's a
    // v3.x-only API that v2.x silently ignores as an unrecognized option,
    // which is why this hook never actually ran despite looking correct.
    onProxyRes: (proxyRes) => {
      const location = proxyRes.headers.location;
      if (location && location.startsWith('/') && !location.startsWith(mountPrefix)) {
        proxyRes.headers.location = `${mountPrefix}${location}`;
      }
    }
  });
}

const router = Router();
router.use('/', authenticate, makeCctvProxy('/api/cctv'));
export default router;

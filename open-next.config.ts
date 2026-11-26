// Cloudflare Workers build config (OpenNext), read by `npm run cf:build`,
// `cf:preview` and `cf:deploy`. Plain `next build` and `next dev` ignore it.
// The defaults are enough until the app needs caching or queues.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({});

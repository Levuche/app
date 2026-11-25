import type { MetadataRoute } from 'next';

/** robots.txt: the app is for signed-in creators, so nothing is crawled. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}

/**
 * A site's handle, its address on levuche.page: 3 to 30 lowercase letters
 * and numbers, with single hyphens between them. Some names are kept back
 * (RESERVED_HANDLES); taken and held ones are refused by the database
 * (src/lib/db.ts), and /api/handles checks a name as the creator types it.
 */
export const HANDLE = { pattern: '[a-z0-9]+(-[a-z0-9]+)*', min: 3, max: 30 };

const valid = new RegExp(`^${HANDLE.pattern}$`);

export const isHandle = (value: string) =>
  value.length >= HANDLE.min && value.length <= HANDLE.max && valid.test(value);

/** Where a site lives once it's published. */
export const siteAddress = (handle: string) => `${handle}.levuche.page`;

/**
 * Names no creator can claim: Levuche's own words and addresses, words a
 * visitor could take for Levuche or for an official page, and well-known
 * brands, so nobody can pass a page off as theirs. The Levuche team can hold
 * more in the database (handles of kind 'reserved').
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // Levuche itself, and the addresses its sites use
  'levuche',
  'levuche-page',
  'levuche-app',
  'levuche-team',
  'app',
  'www',
  'web',
  'api',
  'cdn',
  'static',
  'assets',
  'img',
  'images',
  'media',
  'files',
  'upload',
  'uploads',
  'mail',
  'email',
  'smtp',
  'imap',
  'pop',
  'dns',
  'ftp',
  'ssh',
  'vpn',
  'dev',
  'staging',
  'stage',
  'test',
  'testing',
  'preview',
  'demo',
  'beta',
  'alpha',
  'sandbox',
  'local',
  'localhost',
  'internal',
  'status',
  'health',
  'metrics',
  'docs',
  'doc',
  'blog',
  'news',
  'press',
  'jobs',
  'careers',
  'about',
  'contact',
  'help',
  'support',
  'faq',
  'guide',
  'guides',
  'learn',
  'pricing',
  'price',
  'plans',
  'billing',
  'pay',
  'payment',
  'payments',
  'checkout',
  'invoice',
  'invoices',
  'shop',
  'store',
  'legal',
  'terms',
  'privacy',
  'cookies',
  'security',
  'abuse',
  'report',
  'dmca',
  'copyright',
  'trust',
  'safety',
  'admin',
  'administrator',
  'root',
  'system',
  'sysadmin',
  'staff',
  'team',
  'mod',
  'moderator',
  'owner',
  'dashboard',
  'account',
  'accounts',
  'settings',
  'profile',
  'login',
  'logout',
  'signin',
  'sign-in',
  'signout',
  'sign-out',
  'signup',
  'sign-up',
  'register',
  'auth',
  'oauth',
  'sso',
  'verify',
  'password',
  'reset',
  'new',
  'edit',
  'editor',
  'publish',
  'sites',
  'site',
  'page',
  'pages',
  'home',
  'index',
  'null',
  'undefined',
  'none',
  'official',
  'verified',
  'everyone',
  'anonymous',
  'unknown',
  'example',
  // Well-known brands
  'google',
  'gmail',
  'youtube',
  'apple',
  'icloud',
  'microsoft',
  'outlook',
  'amazon',
  'meta',
  'facebook',
  'instagram',
  'whatsapp',
  'threads',
  'twitter',
  'tiktok',
  'snapchat',
  'linkedin',
  'pinterest',
  'reddit',
  'discord',
  'twitch',
  'spotify',
  'netflix',
  'paypal',
  'stripe',
  'visa',
  'mastercard',
  'shopify',
  'patreon',
  'onlyfans',
  'substack',
  'telegram',
  'signal',
  'github',
  'openai',
  'anthropic',
  'claude',
  'buildbase',
  'cloudflare',
]);

/** Why a handle can't be claimed, before asking the database, or null. */
export function handleProblem(value: string): string | null {
  if (!isHandle(value))
    return 'Use 3 to 30 lowercase letters and numbers, with single hyphens between them.';
  if (RESERVED_HANDLES.has(value)) return `${value} is kept for Levuche.`;
  return null;
}

/**
 * Names close to `wanted` to offer when it's taken, in the order to show
 * them: each a valid handle that isn't reserved. The database still decides
 * which are free.
 */
export function handleSuggestions(wanted: string): string[] {
  const base = wanted
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, HANDLE.max - 6)
    .replace(/-$/, '');
  if (!base) return [];
  const year = new Date().getUTCFullYear();
  return [
    `${base}-page`,
    `${base}-hq`,
    `the-${base}`,
    `${base}-${year}`,
    `${base}-studio`,
    `${base}-${((base.length * 7 + 11) % 90) + 10}`,
  ].filter((name, i, all) => !handleProblem(name) && all.indexOf(name) === i);
}

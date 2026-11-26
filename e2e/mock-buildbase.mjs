// A stand-in for Buildbase's API in the end-to-end tests, so sign-in and
// workspaces can be tested without real accounts:
//
// - POST /api/v1/auth/request (the Sign in button) answers this server's own
//   /hosted page, which sends the browser straight back to the app with the
//   test code, as Buildbase's hosted page does once someone signs in.
// - POST /api/v1/auth/token with that code answers session "e2e-session".
// - GET .../profile answers the creator behind x-session-id. Any session
//   that starts "e2e-" is a creator of its own, so each test can start with
//   no sites; any other session gets 401, as Buildbase does for an ended one.
// - POST .../logout answers success.
// - GET .../<org>/settings answers the organization's settings as the
//   Buildbase development environment has them. The SDK's workspace switcher
//   waits for these: without them it keeps asking and never opens.
// - .../workspaces: list, create (409 for a name the creator already has),
//   get, permissions/me and delete, for members only (403 otherwise), with
//   the roles and permission set up in the Buildbase development environment.
// - POST /e2e/members { workspaceId, session, role } adds a teammate, as an
//   accepted invitation would. Test only.
// - .../workspaces/<id>/billing/offers lists the one add-on that sells a
//   site (#19): $9.00, paid once, switching the `site` feature on. Its
//   checkout (POST .../billing/checkout, admins only) answers this server's
//   /checkout page, whose Pay and Cancel buttons send the browser back as
//   Stripe's page does; paying switches the feature on.
// - POST /e2e/paid { workspaceId } switches it on without paying. Test only.
//
// Answers have Buildbase's shapes: the auth routes and permissions/me in its
// { success, data } wrapper, the rest bare. Anything else answers 404. Every request is logged, so the
// test output shows what the app asked for.
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

// The same values are in e2e/auth.spec.ts.
const CODE = 'E2EsignInCode0000000000000000000';
const SESSION = 'e2e-session';
const CREATOR = {
  id: 'e2e0000000000000000000c1',
  name: 'Sam Rivera',
  email: 'sam@example.com',
  role: 'user',
};

/** The creator behind a session, or undefined for an ended one. */
function creator(session) {
  if (session === SESSION) return CREATOR;
  if (!session?.startsWith('e2e-')) return undefined;
  const id = createHash('sha256').update(session).digest('hex').slice(0, 24);
  return { ...CREATOR, id, email: `${id}@example.com` };
}

// The development environment's settings (Settings > Workspaces), with what
// each role may do (app:site:edit is the app's own permission).
const SETTINGS = {
  billing: { onboarding: { mode: 'none' } },
  workspace: {
    mode: 'platform',
    roles: ['admin', 'editor', 'viewer'],
    defaultRole: 'viewer',
    autoCreateFirst: false,
    canCreateWorkspace: true,
    canInviteMembers: true,
    showSwitcher: true,
    maxWorkspaces: 20,
    maxWorkspacesPerUser: 5,
    maxWorkspaceUsers: 10,
    customPermissions: [
      { key: 'app:site:edit', label: 'Edit the site', group: 'Site' },
    ],
    permissions: {
      admin: [
        'workspace:settings:view',
        'workspace:settings:edit',
        'workspace:members:view',
        'workspace:members:invite',
        'workspace:members:remove',
        'workspace:members:role-change',
        'workspace:billing:view',
        'workspace:billing:manage',
        'app:site:edit',
      ],
      editor: [
        'workspace:settings:view',
        'workspace:members:view',
        'workspace:billing:view',
        'app:site:edit',
      ],
      viewer: ['workspace:settings:view', 'workspace:members:view'],
    },
  },
};
const PERMISSIONS = SETTINGS.workspace.permissions;

/** Workspace id -> { workspace, roles: Map of user id -> role }. */
const workspaces = new Map();
const role = (id, user) => workspaces.get(id)?.roles.get(user.id);
const mine = (user) =>
  [...workspaces.values()]
    .filter(({ roles }) => roles.has(user.id))
    .map(({ workspace }) => workspace);

// The add-on that sells a site (#19), as set up in the development
// environment's billing.
const OFFER = {
  id: 'offer-site',
  slug: 'levuche-page',
  name: 'Levuche page',
  shape: 'lifetime',
  items: [{ itemSlug: 'site', itemKind: 'feature', quantityPerUnit: 1 }],
  maxPerSubject: 1,
  price: { currency: 'usd', amount: 900 },
};
const isPaid = (id) =>
  workspaces.get(id)?.workspace.entitlement.features.site === true;
function pay(id) {
  workspaces.get(id).workspace.entitlement.features.site = true;
}
const offers = (id) => ({
  currency: 'usd',
  locked: false,
  offers: [
    isPaid(id)
      ? {
          ...OFFER,
          held: [{ id: 'grant-1' }],
          purchasable: false,
          reason: 'max_per_subject_reached',
        }
      : { ...OFFER, held: [], purchasable: true },
  ],
});

const cors = {
  'Access-Control-Allow-Origin': 'http://localhost:3100',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

function send(res, status, body) {
  res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  res.on('finish', () =>
    console.log(`[mock-buildbase] ${req.method} ${path} ${res.statusCode}`)
  );
  if (req.method === 'OPTIONS') {
    // A wildcard isn't honoured on requests that carry credentials, so the
    // headers the browser asks about are allowed by name.
    const asked = req.headers['access-control-request-headers'];
    if (asked) res.setHeader('Access-Control-Allow-Headers', asked);
    return send(res, 204);
  }
  if (path === '/health') return send(res, 200, { status: 'ok' });

  if (req.method === 'POST' && path === '/api/v1/auth/request') {
    const { state = '', redirect } = await readJson(req);
    const hosted = new URL('/hosted', 'http://localhost:3101');
    hosted.search = new URLSearchParams({
      to: redirect?.success,
      state,
    }).toString();
    return send(res, 200, {
      success: true,
      data: { redirectUrl: hosted.href },
    });
  }
  if (req.method === 'GET' && path === '/hosted') {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const back = new URL(searchParams.get('to') ?? 'http://localhost:3100/');
    back.searchParams.set('code', CODE);
    back.searchParams.set('state', searchParams.get('state') ?? '');
    res.writeHead(302, { Location: back.href });
    return res.end();
  }
  if (req.method === 'POST' && path === '/api/v1/auth/token') {
    const { code } = await readJson(req);
    return code === CODE
      ? send(res, 200, { success: true, data: { sessionId: SESSION } })
      : send(res, 400, { message: 'That sign-in code has expired' });
  }
  if (req.method === 'POST' && path === '/e2e/paid') {
    const { workspaceId } = await readJson(req);
    if (!workspaces.has(workspaceId)) return send(res, 404, {});
    pay(workspaceId);
    return send(res, 200, { success: true });
  }
  if (req.method === 'GET' && path === '/checkout') {
    // Stripe's checkout page, as far as the tests need it.
    const { searchParams } = new URL(req.url, 'http://localhost');
    const done = new URL('/checkout/done', 'http://localhost:3101');
    done.search = searchParams.toString();
    const cancel = searchParams.get('cancel') ?? '';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(
      `<!doctype html><html lang="en"><title>Test checkout</title><main><h1>Pay $9.00</h1>` +
        `<form method="post" action="${done.href.replace(/&/g, '&amp;')}"><button>Pay</button></form>` +
        `<a href="${cancel.replace(/&/g, '&amp;')}">Cancel</a></main></html>`
    );
  }
  if (req.method === 'POST' && path === '/checkout/done') {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const workspaceId = searchParams.get('workspace') ?? '';
    if (workspaces.has(workspaceId)) pay(workspaceId);
    res.writeHead(303, { Location: searchParams.get('success') ?? '/' });
    return res.end();
  }
  if (req.method === 'POST' && path === '/e2e/members') {
    const { workspaceId, session, role: given } = await readJson(req);
    const user = creator(session);
    if (!user || !workspaces.has(workspaceId)) return send(res, 404, {});
    workspaces.get(workspaceId).roles.set(user.id, given);
    return send(res, 200, { success: true });
  }

  const user = creator(req.headers['x-session-id']);
  if (
    req.method === 'GET' &&
    /^\/api\/v1\/public\/(?!workspaces\/)[\w-]+\/settings$/.test(path)
  ) {
    return send(res, 200, SETTINGS);
  }
  if (req.method === 'GET' && path.endsWith('/profile')) {
    return user
      ? send(res, 200, user)
      : send(res, 401, { message: 'Session expired' });
  }
  if (req.method === 'POST' && path.endsWith('/logout')) {
    return send(res, 200, { success: true });
  }

  const [, billingId, billing] =
    path.match(/\/workspaces\/([0-9a-f]{24})\/billing\/(offers|checkout)$/) ??
    [];
  if (billingId) {
    if (!user) return send(res, 401, { message: 'Session expired' });
    const given = role(billingId, user);
    if (!given) return send(res, 403, { message: 'Not a member' });
    if (billing === 'offers' && req.method === 'GET')
      return send(res, 200, offers(billingId));
    if (billing === 'checkout' && req.method === 'POST') {
      if (!PERMISSIONS[given].includes('workspace:billing:manage'))
        return send(res, 403, { message: 'Not allowed' });
      const { offerSlug, successUrl, cancelUrl } = await readJson(req);
      if (offerSlug !== OFFER.slug || isPaid(billingId))
        return send(res, 409, { reason: 'max_per_subject_reached' });
      const page = new URL('/checkout', 'http://localhost:3101');
      page.search = new URLSearchParams({
        workspace: billingId,
        success: successUrl,
        cancel: cancelUrl,
      }).toString();
      return send(res, 200, {
        kind: 'checkout',
        sessionId: `cs_test_${billingId}`,
        url: page.href,
      });
    }
    return send(res, 404, { message: 'Not in the test server' });
  }

  const [, id, rest = ''] =
    path.match(/\/workspaces(?:\/([0-9a-f]{24}))?(\/permissions\/me)?$/) ?? [];
  if (path.endsWith('/workspaces') || id) {
    if (!user) return send(res, 401, { message: 'Session expired' });
    if (!id && req.method === 'GET') return send(res, 200, mine(user));
    if (!id && req.method === 'POST') {
      const { name } = await readJson(req);
      if (mine(user).some((w) => w.name === name))
        return send(res, 409, { message: 'You already have that name' });
      const _id = randomBytes(12).toString('hex');
      const workspace = {
        _id,
        workspaceId: _id,
        name,
        users: [user],
        roles: SETTINGS.workspace.roles,
        createdBy: user.id,
        features: {},
        entitlement: { planSlug: null, features: {} },
      };
      workspaces.set(_id, { workspace, roles: new Map([[user.id, 'admin']]) });
      return send(res, 200, workspace);
    }
    const given = role(id, user);
    if (!given) return send(res, 403, { message: 'Not a member' });
    if (rest && req.method === 'GET') {
      const isOwner = workspaces.get(id).workspace.createdBy === user.id;
      return send(res, 200, {
        success: true,
        data: { role: given, isOwner, permissions: PERMISSIONS[given] },
      });
    }
    if (req.method === 'GET')
      return send(res, 200, workspaces.get(id).workspace);
    if (req.method === 'DELETE' && given === 'admin') {
      workspaces.delete(id);
      return send(res, 200, { deleted: true });
    }
    return send(res, 403, { message: 'Not allowed' });
  }

  send(res, 404, { message: 'Not in the test server' });
}).listen(3101);

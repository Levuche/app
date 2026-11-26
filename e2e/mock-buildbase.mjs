// A stand-in for Buildbase's API in the end-to-end tests, so sign-in can be
// tested without real accounts. It knows one code and one session:
//
// - POST /api/v1/auth/request (the Sign in button) answers this server's own
//   /hosted page, which sends the browser straight back to the app with the
//   test code, as Buildbase's hosted page does once someone signs in.
// - POST /api/v1/auth/token with that code answers session "e2e-session".
// - GET .../profile with x-session-id "e2e-session" answers the test creator;
//   any other session gets 401, as Buildbase does for an ended session.
// - POST .../logout answers 204.
//
// Anything else answers 404, and the path is logged so a new SDK call shows
// up in the test output.
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
    return send(res, 200, { data: { redirectUrl: hosted.href } });
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
      ? send(res, 200, { data: { sessionId: SESSION } })
      : send(res, 400, { message: 'That sign-in code has expired' });
  }
  if (req.method === 'GET' && path.endsWith('/profile')) {
    return req.headers['x-session-id'] === SESSION
      ? send(res, 200, CREATOR)
      : send(res, 401, { message: 'Session expired' });
  }
  if (req.method === 'POST' && path.endsWith('/logout')) return send(res, 204);

  console.log(`[mock-buildbase] no answer for ${req.method} ${path}`);
  send(res, 404, { message: 'Not in the test server' });
}).listen(3101);

// The sites Worker (#23): serves every published creator site at
// <handle>.levuche.page, apart from the app (docs/SITES.md, "Serving
// sites"). It reads the app's database and changes nothing in it.
import { render } from './render';
import { serve, type SitesEnv } from './serve';

const worker = {
  async fetch(request: Request, env: SitesEnv): Promise<Response> {
    try {
      return await serve(
        request,
        env,
        render,
        (caches as unknown as { default: Cache }).default
      );
    } catch (error) {
      console.error('A site failed to load', error);
      return new Response('Something went wrong. Try again in a moment.', {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }
  },
};

export default worker;

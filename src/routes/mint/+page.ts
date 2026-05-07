/*
 * Mint route is fully client-rendered + statically prerendered, like every
 * other app page. SSR is off globally (see `routes/+layout.ts`); the
 * prerender flag here is the "this page is reachable from the static
 * adapter manifest" hint.
 */
export const prerender = true;

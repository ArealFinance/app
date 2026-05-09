import { redirect } from '@sveltejs/kit';

// Temporary: until the landing page becomes the primary entry point,
// route '/' to the markets/dashboard view.
//
// TODO(infra): once the deploy target moves to Cloudflare Pages, this
// file becomes redundant — the edge rule in `static/_redirects` will
// short-circuit the redirect before any JS executes (~50 ms vs the
// ~300–600 ms SPA hop here). Delete this file at that migration.
// See audit finding F5 in `plan/frontend-perf-audit-2026-05-09.md`.
export const load = () => {
	redirect(307, '/markets');
};

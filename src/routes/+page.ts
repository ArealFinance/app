import { redirect } from '@sveltejs/kit';

// Temporary: until the landing page becomes the primary entry point,
// route '/' to the markets/dashboard view. The existing +page.svelte
// stays in place so we can flip back by deleting this file.
export const load = () => {
	redirect(307, '/markets');
};

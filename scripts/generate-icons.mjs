#!/usr/bin/env node
/*
 * generate-icons.mjs
 *
 * Reads icon source from @zappicon/react (installed in node_modules) and
 * generates Svelte 5 components under src/lib/icons/ for the curated list
 * in scripts/icons.json.
 *
 * Run:
 *     node scripts/generate-icons.mjs
 *
 * Re-run whenever you edit scripts/icons.json (add/remove icons) or upgrade
 * @zappicon/react.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const iconsConfig = JSON.parse(readFileSync(resolve(root, 'scripts/icons.json'), 'utf8'));
const zappiconBase = resolve(root, 'node_modules/@zappicon/react/dist/variants');
const outDir = resolve(root, 'src/lib/icons');

if (!existsSync(zappiconBase)) {
	console.error(
		'❌ @zappicon/react is not installed. Run: npm install --save-dev @zappicon/react'
	);
	process.exit(1);
}

// ---------- name conversion ----------
const toPascal = (kebab) =>
	kebab
		.split('-')
		.map((s) => s[0].toUpperCase() + s.slice(1))
		.join('');

// ---------- variants/<icon>.es.js parser ----------
//
// Source format (per variant):
//   ["regular", e.createElement(e.Fragment, null,
//     e.createElement("path", { key: 0, d: "M...", fillRule: "evenodd", clipRule: "evenodd" }))],
// or with multiple paths:
//   ["filled", e.createElement(e.Fragment, null, [
//     e.createElement("path", { key: 0, d: "M..." }),
//     e.createElement("path", { key: 1, d: "M...", opacity: ".4" })
//   ])],
const VARIANTS = ['light', 'regular', 'filled', 'duotone', 'duotone-line'];

function parseVariantsFile(source) {
	// Detect React import alias: `import * as <name> from "react"` (varies: e, c, m, a, ...)
	const aliasMatch = source.match(/import\s+\*\s+as\s+([a-zA-Z_$]+)\s+from\s+"react"/);
	const r = aliasMatch ? aliasMatch[1] : 'e';
	const escR = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	const out = {};
	const fragOpenStr = `${r}.createElement(${r}.Fragment, null,`;

	for (const variant of VARIANTS) {
		const variantStart = source.indexOf(`["${variant}",`);
		if (variantStart === -1) continue;

		const fragOpen = source.indexOf(fragOpenStr, variantStart);
		if (fragOpen === -1) continue;

		const argStart = source.indexOf(',', fragOpen + fragOpenStr.length - 1) + 1;

		let depth = 0;
		let i = fragOpen + `${r}.createElement(`.length - 1;
		while (i < source.length) {
			const c = source[i];
			if (c === '(') depth++;
			else if (c === ')') {
				depth--;
				if (depth === 0) break;
			}
			i++;
		}
		const fragmentBody = source.slice(argStart, i).trim();

		const paths = [];
		const pathRegex = new RegExp(
			`${escR}\\.createElement\\("(path|circle|rect|line|polyline|polygon|ellipse)",\\s*\\{([^}]+)\\}\\)`,
			'g'
		);
		let m;
		while ((m = pathRegex.exec(fragmentBody)) !== null) {
			const tag = m[1];
			const attrs = parseAttrs(m[2]);
			paths.push({ tag, attrs });
		}
		if (paths.length > 0) out[variant] = paths;
	}
	return out;
}

function parseAttrs(s) {
	// s looks like: key: 0, d: "M...", fillRule: "evenodd", clipRule: "evenodd", opacity: ".4"
	// We extract camelCase JS keys → JSX/HTML kebab, with their string/number values.
	const attrs = {};
	// Split on commas not inside quotes.
	const parts = [];
	let buf = '';
	let inStr = false;
	let strCh = '';
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (inStr) {
			buf += c;
			if (c === strCh && s[i - 1] !== '\\') inStr = false;
		} else if (c === '"' || c === "'") {
			inStr = true;
			strCh = c;
			buf += c;
		} else if (c === ',') {
			parts.push(buf.trim());
			buf = '';
		} else {
			buf += c;
		}
	}
	if (buf.trim()) parts.push(buf.trim());

	for (const part of parts) {
		const colon = part.indexOf(':');
		if (colon === -1) continue;
		const key = part.slice(0, colon).trim();
		let val = part.slice(colon + 1).trim();
		if (key === 'key') continue; // React-only
		// strip quotes
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
			val = val.slice(1, -1);
		}
		attrs[key] = val;
	}
	return attrs;
}

function camelToKebab(k) {
	// fillRule → fill-rule, clipRule → clip-rule
	return k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

function attrsToSvelte(attrs) {
	return Object.entries(attrs)
		.map(([k, v]) => `${camelToKebab(k)}="${v.replace(/"/g, '&quot;')}"`)
		.join(' ');
}

function pathsToMarkup(paths) {
	return paths.map((p) => `<${p.tag} ${attrsToSvelte(p.attrs)} />`).join('\n\t\t');
}

// ---------- generate ----------
function generateComponent(iconName, variants) {
	const className = toPascal(iconName);
	const default_ = iconsConfig.defaultVariant || 'regular';
	const blocks = Object.entries(variants).map(([v, paths]) => {
		const cond = `variant === '${v}'`;
		return `\t{${v === default_ ? 'else if' : '#if'} ${cond}}\n\t\t${pathsToMarkup(paths)}\n`;
	});

	// Build an if/else if chain in defaultVariant-first order:
	const ordered = [default_, ...Object.keys(variants).filter((v) => v !== default_)];
	const ifChain = ordered
		.map((v, i) => {
			const head = i === 0 ? '#if' : ':else if';
			return `\t{${head} variant === '${v}'}\n\t\t${pathsToMarkup(variants[v])}`;
		})
		.join('\n');

	return `<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	type Variant = 'light' | 'regular' | 'filled' | 'duotone' | 'duotone-line';

	type Props = {
		size?: number | string;
		variant?: Variant;
		color?: string;
	} & Omit<HTMLAttributes<SVGSVGElement>, 'children'>;

	let {
		size = 24,
		variant = '${default_}',
		color = 'currentColor',
		class: className = '',
		...rest
	}: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill={color}
	class={className}
	aria-hidden="true"
	focusable="false"
	{...rest}
>
${ifChain}
	{/if}
</svg>
`;
}

// ---------- index.ts ----------
function generateIndex(icons) {
	const lines = icons.map((name) => {
		const className = toPascal(name);
		return `export { default as ${className} } from './${className}.svelte';`;
	});
	return lines.join('\n') + '\n';
}

// ---------- main ----------
// Do NOT wipe outDir — that would delete hand-authored icons (e.g. brand
// marks not in Zappicon) and the Storybook stories file. Each generated icon
// just overwrites its own .svelte. The index.ts is rebuilt below from
// whatever .svelte files end up in the directory.
mkdirSync(outDir, { recursive: true });

const generated = [];
const missing = [];

for (const name of iconsConfig.icons) {
	const file = resolve(zappiconBase, `${name}.es.js`);
	if (!existsSync(file)) {
		missing.push(name);
		continue;
	}
	const src = readFileSync(file, 'utf8');
	const variants = parseVariantsFile(src);
	if (Object.keys(variants).length === 0) {
		console.warn(`⚠️  ${name}: parsed file but found no variants — skipping`);
		continue;
	}
	const componentSrc = generateComponent(name, variants);
	const outName = `${toPascal(name)}.svelte`;
	writeFileSync(resolve(outDir, outName), componentSrc);
	generated.push({ name, outName, variants: Object.keys(variants).length });
}

// Build index from all .svelte files actually in the directory (Zappicon-
// generated AND any hand-authored ones), minus stories/test files.
const iconFiles = readdirSync(outDir)
	.filter((f) => f.endsWith('.svelte') && !f.endsWith('.stories.svelte') && !f.endsWith('.test.svelte'))
	.map((f) => f.replace(/\.svelte$/, ''))
	.sort();
const indexLines = iconFiles.map((name) => `export { default as ${name} } from './${name}.svelte';`);
writeFileSync(resolve(outDir, 'index.ts'), indexLines.join('\n') + '\n');

console.log(`✓ generated ${generated.length} icon components in src/lib/icons/`);
for (const g of generated) console.log(`  · ${g.outName} (${g.variants} variants)`);
if (missing.length) {
	console.warn(`⚠️  ${missing.length} icons not found in @zappicon/react:`);
	for (const m of missing) console.warn(`  · ${m}`);
}

#!/usr/bin/env node
/**
 * Image optimization pipeline.
 *
 * Scans static/images/** recursively for PNG/JPG/JPEG sources and generates
 * sibling AVIF + WebP variants. Runs as a prebuild step so production bundles
 * always have the modern formats available for <picture> + image-set fallbacks.
 *
 * Idempotent: skips a target if it already exists and is newer than the source.
 * Parallel: processes files in chunks to keep memory bounded on small runners.
 */

import { readdir, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IMAGES_DIR = join(ROOT, 'static', 'images');

const SOURCE_EXT = /\.(png|jpe?g)$/i;
const CHUNK_SIZE = 4;

const AVIF_OPTIONS = { quality: 60, effort: 6 };
const WEBP_OPTIONS = { quality: 80 };

/** Recursively walk a directory and collect file paths. */
async function walk(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return walk(path);
			return [path];
		}),
	);
	return files.flat();
}

/** Returns true if target is missing or older than source. */
async function shouldRegenerate(sourcePath, targetPath) {
	if (!existsSync(targetPath)) return true;
	const [src, tgt] = await Promise.all([stat(sourcePath), stat(targetPath)]);
	return src.mtimeMs > tgt.mtimeMs;
}

/** Generate AVIF + WebP siblings for a single source. Returns log entry. */
async function processOne(sourcePath) {
	const ext = extname(sourcePath);
	const base = sourcePath.slice(0, -ext.length);
	const avifPath = `${base}.avif`;
	const webpPath = `${base}.webp`;

	const sourceStat = await stat(sourcePath);
	const sourceSize = sourceStat.size;
	const rel = relative(ROOT, sourcePath);

	const tasks = [];
	let avifGenerated = false;
	let webpGenerated = false;

	if (await shouldRegenerate(sourcePath, avifPath)) {
		tasks.push(
			sharp(sourcePath)
				.avif(AVIF_OPTIONS)
				.toFile(avifPath)
				.then(() => {
					avifGenerated = true;
				}),
		);
	}

	if (await shouldRegenerate(sourcePath, webpPath)) {
		tasks.push(
			sharp(sourcePath)
				.webp(WEBP_OPTIONS)
				.toFile(webpPath)
				.then(() => {
					webpGenerated = true;
				}),
		);
	}

	if (tasks.length === 0) {
		return { rel, status: 'skipped' };
	}

	await Promise.all(tasks);

	const [avifStat, webpStat] = await Promise.all([stat(avifPath), stat(webpPath)]);
	const avifSize = avifStat.size;
	const webpSize = webpStat.size;
	const avifSavings = ((1 - avifSize / sourceSize) * 100).toFixed(1);
	const webpSavings = ((1 - webpSize / sourceSize) * 100).toFixed(1);

	return {
		rel,
		status: 'generated',
		sourceSize,
		avifSize,
		webpSize,
		avifSavings,
		webpSavings,
		avifGenerated,
		webpGenerated,
	};
}

/** Process files in bounded-parallel chunks. */
async function processInChunks(files, chunkSize) {
	const results = [];
	for (let i = 0; i < files.length; i += chunkSize) {
		const chunk = files.slice(i, i + chunkSize);
		const chunkResults = await Promise.all(chunk.map(processOne));
		results.push(...chunkResults);
	}
	return results;
}

function formatBytes(n) {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
	if (!existsSync(IMAGES_DIR)) {
		console.error(`[optimize-images] images dir not found: ${IMAGES_DIR}`);
		process.exit(1);
	}

	const allFiles = await walk(IMAGES_DIR);
	const sources = allFiles.filter((p) => SOURCE_EXT.test(p));

	if (sources.length === 0) {
		console.log('[optimize-images] no PNG/JPG sources found');
		return;
	}

	console.log(`[optimize-images] processing ${sources.length} source images...`);
	const start = Date.now();

	const results = await processInChunks(sources, CHUNK_SIZE);

	let generated = 0;
	let skipped = 0;
	let totalSource = 0;
	let totalAvif = 0;
	let totalWebp = 0;

	for (const r of results) {
		if (r.status === 'skipped') {
			skipped++;
			console.log(`  skip   ${r.rel}`);
			continue;
		}
		generated++;
		totalSource += r.sourceSize;
		totalAvif += r.avifSize;
		totalWebp += r.webpSize;
		console.log(
			`  ok     ${r.rel}  src=${formatBytes(r.sourceSize)}  avif=${formatBytes(r.avifSize)} (-${r.avifSavings}%)  webp=${formatBytes(r.webpSize)} (-${r.webpSavings}%)`,
		);
	}

	const elapsed = ((Date.now() - start) / 1000).toFixed(2);
	console.log(
		`[optimize-images] done in ${elapsed}s — generated=${generated}, skipped=${skipped}`,
	);
	if (generated > 0) {
		const avifPct = ((1 - totalAvif / totalSource) * 100).toFixed(1);
		const webpPct = ((1 - totalWebp / totalSource) * 100).toFixed(1);
		console.log(
			`[optimize-images] totals: src=${formatBytes(totalSource)}  avif=${formatBytes(totalAvif)} (-${avifPct}%)  webp=${formatBytes(totalWebp)} (-${webpPct}%)`,
		);
	}
}

main().catch((err) => {
	console.error('[optimize-images] failed:', err);
	process.exit(1);
});

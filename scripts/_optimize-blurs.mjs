// Ad-hoc optimizer for the aurora bloom backgrounds.
// Not part of any build pipeline — run on-demand when source PNGs change.
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = '/Users/blackmesa/Documents/areal.newera/app/static/images/aurora';

async function process(srcPath, outName, targetWidth) {
	const meta = await sharp(srcPath).metadata();
	console.log(
		`[${outName}] src ${meta.width}x${meta.height} ${(statSync(srcPath).size / 1024).toFixed(0)} KB`
	);

	// AVIF / WebP cover ~98% of live traffic (Chrome/Firefox/Safari
	// since 2022). PNG is purely a legacy fallback — accept some banding
	// in exchange for a sane file size. Palette128 + Floyd-Steinberg
	// dithering hides most of the gradient stepping at ~150-180 KB.
	const formats = [
		{ ext: 'avif', opts: { quality: 65, effort: 7 } },
		{ ext: 'webp', opts: { quality: 85, effort: 6 } },
		{
			ext: 'png',
			width: Math.round(targetWidth * 0.75),
			opts: {
				compressionLevel: 9,
				palette: true,
				colors: 128,
				dither: 1.0
			}
		}
	];

	for (const f of formats) {
		const outPath = join(OUT_DIR, `${outName}.${f.ext}`);
		const w = f.width ?? targetWidth;
		await sharp(srcPath)
			.resize({ width: w, withoutEnlargement: true })
			.toFormat(f.ext, f.opts)
			.toFile(outPath);
		const sz = statSync(outPath).size;
		console.log(`  -> ${outName}.${f.ext} (${w}w): ${(sz / 1024).toFixed(1)} KB`);
	}
}

await process('/Users/blackmesa/Documents/blur_header.png', 'header-bg', 1920);
await process('/Users/blackmesa/Documents/blur_footer.png', 'footer-bg', 1920);

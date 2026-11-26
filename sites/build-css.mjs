// Builds the creator sites' stylesheet (sites/src/site.css) with Tailwind,
// minified, into sites/generated/site.css, which the sites Worker inlines
// into each page. Run by `npm run sites:css`, before the Worker is built.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwind from '@tailwindcss/postcss';
import postcss from 'postcss';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, 'src/site.css');
const to = join(here, 'generated/site.css');

const { css } = await postcss([
  tailwind({ optimize: { minify: true } }),
]).process(await readFile(from, 'utf8'), { from, to });
await mkdir(dirname(to), { recursive: true });
await writeFile(to, css);
console.log(`sites/generated/site.css: ${(css.length / 1024).toFixed(1)} KB`);

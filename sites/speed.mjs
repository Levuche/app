// How fast a creator site answers (#23): the first request after a publish
// draws the page (a cache miss), the ones after it come from the cache.
// Usage: npm run sites:speed -- https://sites-dev.levuche.com/<handle> [count]
const [url, count = '10'] = process.argv.slice(2);
if (!url) {
  console.error(
    'Give a site address, for example https://sites-dev.levuche.com/sam'
  );
  process.exit(1);
}

const times = [];
for (let i = 0; i < Number(count); i += 1) {
  const start = performance.now();
  const response = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  const body = await response.arrayBuffer();
  const ms = performance.now() - start;
  times.push(ms);
  console.log(
    `${String(i + 1).padStart(2)}  ${response.status}  ${ms.toFixed(0).padStart(5)} ms  ${String(body.byteLength).padStart(7)} bytes  cache ${response.headers.get('X-Levuche-Cache') ?? '-'}`
  );
}

const warm = times.slice(1).sort((a, b) => a - b);
if (warm.length) {
  const median = warm[Math.floor(warm.length / 2)];
  console.log(
    `first ${times[0].toFixed(0)} ms, then a median of ${median.toFixed(0)} ms`
  );
}

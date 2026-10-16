// Check the share endpoint before wiring the button to it.
import https from 'node:https';

const CANDIDATES = [
  ['service.weibo.com share', 'https://service.weibo.com/share/share.php?title=%E6%B5%8B%E8%AF%95'],
  ['service.weibo.com (no params)', 'https://service.weibo.com/share/share.php'],
  ['weibo.com share', 'https://weibo.com/share/share.php?title=%E6%B5%8B%E8%AF%95'],
];

function head(url, depth = 0) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'GET', headers: { 'user-agent': 'Mozilla/5.0' }, timeout: 20000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && depth < 4) {
        res.resume();
        return resolve(head(new URL(res.headers.location, url).href, depth + 1));
      }
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body: Buffer.concat(chunks).slice(0, 400).toString('utf8') }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 'error', error: e.message }));
    req.end();
  });
}

for (const [label, url] of CANDIDATES) {
  const r = await head(url);
  const interesting = r.status === 200
    ? (/分享|share|微博/i.test(r.body) ? '页面像分享页' : '返回了页面但内容不像分享页')
    : '';
  console.log(`${label.padEnd(28)} ${String(r.status).padEnd(8)} ${r.location || ''} ${interesting}`);
  if (r.body) console.log(`    ${r.body.replace(/\s+/g, ' ').slice(0, 160)}`);
}

// Runs on Vercel at deploy time. Copies the site into dist/ and writes config.js from Environment Variables.
// If the variables are missing it falls back to the defaults below, so the site never breaks.
const fs = require('fs');
const OUT = 'dist';
const FILES = ['index.html', 'app.js', 'styles.css', 'sw.js', 'manifest.json', 'icons'];

const url = process.env.SUPABASE_URL || 'https://bujzywnxomtrymcefnof.supabase.co';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_WbP6Ypplemmi7tMELbel6Q_9KPHqgMy';

if (/secret/i.test(key)) { console.error('ERROR: a secret key was set. Use the publishable key only.'); process.exit(1); }

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
for (const f of FILES) fs.cpSync(f, `${OUT}/${f}`, { recursive: true });
fs.writeFileSync(`${OUT}/config.js`, `window.TC_CONFIG = ${JSON.stringify({ SUPABASE_URL: url, SUPABASE_KEY: key })};\n`);
console.log('Build done. Supabase URL:', url);

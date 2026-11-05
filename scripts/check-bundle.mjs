import { readdir, readFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';

const root = resolve(process.cwd(), 'dist');
const forbidden = [
  /GEMINI_API_KEY/,
  /@google\/genai/,
  /<script\s+type=["']importmap["']/i,
  /AIza[0-9A-Za-z_-]{30,}/
];

let examined = 0;
async function scan(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      await scan(path);
      continue;
    }
    if (!['.html', '.js', '.css'].includes(extname(path))) continue;
    const content = await readFile(path, 'utf8');
    examined++;
    for (const rule of forbidden) {
      if (rule.test(content))
        throw new Error('Forbidden browser-bundle content in ' + path + ': ' + rule);
    }
    const actualKey = process.env.GEMINI_API_KEY;
    if (actualKey && content.includes(actualKey))
      throw new Error('Actual provider credential leaked into client bundle: ' + path);
  }
}
await scan(root);
if (!examined) throw new Error('No built client assets found');
console.log('Client bundle check passed (' + examined + ' files scanned).');

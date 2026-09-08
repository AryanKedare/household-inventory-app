import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const paths = [
  'ios',
  'android',
  'node_modules',
  '.bundle',
  'vendor/bundle',
].map((path) => join(root, path));

for (const path of paths) {
  if (existsSync(path)) {
    console.log(`Removing ${path}`);
    rmSync(path, { recursive: true, force: true });
  }
}

console.log('\nProject native state removed.');
console.log('Next: npm install && npm run native:bootstrap');

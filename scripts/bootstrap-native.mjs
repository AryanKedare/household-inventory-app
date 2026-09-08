import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const iosPath = join(root, 'ios');
const androidPath = join(root, 'android');

if (existsSync(iosPath) || existsSync(androidPath)) {
  console.error('ios/ or android/ already exists. Remove them first if you intentionally want to regenerate native projects.');
  process.exit(1);
}

const tempRoot = mkdtempSync(join(tmpdir(), 'homestock-native-'));
const generated = join(tempRoot, 'HomeStock');

try {
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      '@react-native-community/cli@20.1.0',
      'init',
      'HomeStock',
      '--version',
      '0.86.3',
      '--directory',
      generated,
      '--skip-install',
      '--package-name',
      'com.aryankedare.householdinventory',
    ],
    { stdio: 'inherit' },
  );

  cpSync(join(generated, 'ios'), iosPath, { recursive: true });
  cpSync(join(generated, 'android'), androidPath, { recursive: true });

  console.log('\nNative projects created successfully.');
  console.log('Next: npm install, then on macOS run npm run pods, followed by npm run ios.');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

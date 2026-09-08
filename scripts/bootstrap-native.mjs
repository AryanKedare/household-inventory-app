import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

function replaceOnce(path, search, replacement) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes(search)) {
    throw new Error(`Unable to patch generated native file: ${path}`);
  }
  writeFileSync(path, source.replace(search, replacement));
}

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

  replaceOnce(
    join(generated, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n\n    <uses-permission android:name="android.permission.CAMERA" />',
  );

  replaceOnce(
    join(generated, 'android', 'app', 'build.gradle'),
    'apply plugin: "com.facebook.react"',
    'apply plugin: "com.facebook.react"\n\napply from: project(\':react-native-config\').projectDir.getPath() + "/dotenv.gradle"',
  );

  replaceOnce(
    join(generated, 'ios', 'Podfile'),
    'platform :ios, min_ios_version_supported',
    "platform :ios, '15.5'",
  );

  replaceOnce(
    join(generated, 'ios', 'HomeStock', 'Info.plist'),
    '\t<key>NSLocationWhenInUseUsageDescription</key>\n\t<string></string>',
    '\t<key>NSCameraUsageDescription</key>\n\t<string>Allow HomeStock to scan household product barcodes.</string>',
  );

  cpSync(join(generated, 'ios'), iosPath, { recursive: true });
  cpSync(join(generated, 'android'), androidPath, { recursive: true });

  console.log('\nNative projects created successfully.');
  console.log('Next: npm install, bundle install, npm run pods, then npm run ios.');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

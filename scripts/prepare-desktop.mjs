import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staging = join(root, '.desktop-build');

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
cpSync(join(root, 'electron', 'main.cjs'), join(staging, 'main.cjs'));
cpSync(join(root, 'electron', 'preload.cjs'), join(staging, 'preload.cjs'));
cpSync(join(root, 'dist-web'), join(staging, 'dist-web'), { recursive: true });
cpSync(join(root, 'assets', 'images', 'icon.png'), join(staging, 'icon.png'));

const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const packageJson = {
  name: 'agon-surveyor-desktop',
  version: source.version,
  description: 'Agon Surveyor desktop application for Windows',
  author: 'Agon Surveyor',
  main: 'main.cjs',
  build: {
    appId: 'com.app.agonsurveyor.desktop',
    productName: 'Agon Surveyor',
    electronVersion: '44.4.3',
    directories: { output: '../release', buildResources: '.' },
  files: ['main.cjs', 'preload.cjs', 'dist-web/**/*', 'icon.png'],
    win: {
      target: [{ target: 'nsis', arch: ['x64'] }],
      icon: 'icon.png',
      artifactName: 'Agon-Surveyor-Setup-${version}-${arch}.${ext}',
    },
    nsis: {
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Agon Surveyor',
    },
  },
};
writeFileSync(join(staging, 'package.json'), JSON.stringify(packageJson, null, 2));
console.log(`Prepared Electron staging directory: ${staging}`);

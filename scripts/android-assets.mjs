import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = new URL('../', import.meta.url).pathname;
const icon = path.join(root, 'public/icon-512.png');
const res = path.join(root, 'android/app/src/main/res');
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [density, scale] of Object.entries(densities)) {
  const dir = path.join(res, `mipmap-${density}`);
  const legacy = Math.round(48 * scale);
  const foreground = Math.round(108 * scale);
  await sharp(icon).resize(legacy, legacy).png().toFile(path.join(dir, 'ic_launcher.png'));
  await sharp(icon).resize(legacy, legacy).png().toFile(path.join(dir, 'ic_launcher_round.png'));
  await sharp({ create: { width: foreground, height: foreground, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp(icon).resize(Math.round(foreground * 0.64), Math.round(foreground * 0.64)).png().toBuffer(), gravity: 'center' }])
    .png()
    .toFile(path.join(dir, 'ic_launcher_foreground.png'));
}

// Keep the original splash dimensions so Android's centreCrop maths still works.
const splashDirs = (await readdir(res)).filter(name => name.startsWith('drawable'));
for (const dirName of splashDirs) {
  const file = path.join(res, dirName, 'splash.png');
  try { await stat(file); } catch { continue; }
  const { width = 480, height = 320 } = await sharp(file).metadata();
  const iconSize = Math.round(Math.min(width, height) * 0.34);
  const roundIcon = await sharp(icon).resize(iconSize, iconSize).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: '#f6f7f3' } })
    .composite([{ input: roundIcon, gravity: 'center' }])
    .png()
    .toFile(file);
}
console.log('Android launcher icons and splash screens updated.');

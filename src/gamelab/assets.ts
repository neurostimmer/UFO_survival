// Image preloader. Names map 1:1 to filenames in /public/assets/<name>.png.
// All assets must be loaded before the first draw() call so synchronous
// setAnimation() lookups never miss.

const ASSET_NAMES: readonly string[] = [
  'coin',
  'space_1',
  'ufo_1',
  'ufo_2',
  'retroship_01_1',
  'retroship_02_1',
  'retroship_03_1',
  'retroship_04_1',
  'retroship_05_1',
  'retroship_06_1',
  'retroship_07_1',
  'retroship_08_1',
  'retroship_09_1',
  'retroship_10_1',
  'retroship_11_1',
  'retroship_12_1',
  'retroship_13_1',
  'retroship_14_1',
  'retroship_15_1',
  'retroship_16_1',
  'retroship_17_1',
  'retroship_18_1',
  'retroship_19_1',
  'retroship_20_1',
  'retroship_21_1',
];

const cache = new Map<string, HTMLImageElement>();

function assetUrl(name: string): string {
  return `${import.meta.env.BASE_URL}assets/${name}.png`;
}

function loadOne(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cache.set(name, img);
      resolve();
    };
    img.onerror = () => reject(new Error(`failed to load asset: ${name}`));
    img.src = assetUrl(name);
  });
}

export async function preloadAssets(): Promise<void> {
  await Promise.all(ASSET_NAMES.map(loadOne));
}

export function getAsset(name: string): HTMLImageElement {
  const img = cache.get(name);
  if (!img) throw new Error(`asset not preloaded: ${name}`);
  return img;
}

export function knownAssetNames(): readonly string[] {
  return ASSET_NAMES;
}

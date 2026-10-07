import type { FontStyle } from './font-loader';

/** Mirrors the @font-face declarations in 100Prints/src/index.css. */
export const PLATFORM_FONT_ASSET_ORIGIN = 'https://www.100printswith.me';
export const PLATFORM_DEFAULT_FONT = 'Inter';

export interface PlatformFontVariant {
  file: string;
  style: FontStyle;
  /** CSS @font-face descriptor, not a list of fabricated font files. */
  weight: number | readonly [number, number];
}

export const PLATFORM_FONTS: Readonly<Record<string, readonly PlatformFontVariant[]>> = {
  Inter: [
    { file: 'Inter.ttf', style: 'normal', weight: [100, 900] },
    { file: 'Inter-Italic.ttf', style: 'italic', weight: [100, 900] },
  ],
  Montserrat: [
    { file: 'Montserrat.ttf', style: 'normal', weight: [100, 900] },
    { file: 'Montserrat-Italic.ttf', style: 'italic', weight: [100, 900] },
  ],
  Roboto: [
    { file: 'Roboto.ttf', style: 'normal', weight: [100, 900] },
    { file: 'Roboto-Italic.ttf', style: 'italic', weight: [100, 900] },
  ],
  Oswald: [{ file: 'Oswald.ttf', style: 'normal', weight: [100, 900] }],
  'Playfair Display': [
    { file: 'PlayfairDisplay.ttf', style: 'normal', weight: 400 },
    { file: 'PlayfairDisplay-Italic.ttf', style: 'italic', weight: 400 },
    { file: 'PlayfairDisplay-Bold.ttf', style: 'normal', weight: 700 },
    { file: 'PlayfairDisplay-BoldItalic.ttf', style: 'italic', weight: 700 },
  ],
  Merriweather: [
    { file: 'Merriweather.ttf', style: 'normal', weight: 400 },
    { file: 'Merriweather-Italic.ttf', style: 'italic', weight: 400 },
  ],
  'JetBrains Mono': [
    { file: 'JetBrainsMono.ttf', style: 'normal', weight: [100, 900] },
    { file: 'JetBrainsMono-Italic.ttf', style: 'italic', weight: [100, 900] },
  ],
  'Bebas Neue': [{ file: 'BebasNeue.ttf', style: 'normal', weight: 400 }],
  'Dancing Script': [{ file: 'DancingScript.ttf', style: 'normal', weight: [100, 900] }],
  'Great Vibes': [{ file: 'GreatVibes.ttf', style: 'normal', weight: 400 }],
  'Colitez Serif': [{ file: 'ColitezSerif-Italic.otf', style: 'italic', weight: 400 }],
  'Embolism Spark': [{ file: 'EmbolismSpark.ttf', style: 'normal', weight: 400 }],
};

export interface ResolvedPlatformFont {
  family: string;
  url: string;
  variant: PlatformFontVariant;
  exact: boolean;
}

export function platformWeightDescriptor(variant: PlatformFontVariant): string {
  return typeof variant.weight === 'number' ? String(variant.weight) : variant.weight.join(' ');
}

function weightDistance(variant: PlatformFontVariant, requested: number): number {
  if (typeof variant.weight === 'number') return Math.abs(variant.weight - requested);
  const [minimum, maximum] = variant.weight;
  return requested < minimum ? minimum - requested : requested > maximum ? requested - maximum : 0;
}

export function resolvePlatformFont(family: string, weight: number, style: FontStyle): ResolvedPlatformFont | null {
  const name = Object.keys(PLATFORM_FONTS).find(candidate => candidate.toLowerCase() === family.toLowerCase());
  if (!name) return null;
  const variants = PLATFORM_FONTS[name];
  const sameStyle = variants.filter(variant => variant.style === style);
  const choices = sameStyle.length ? sameStyle : variants;
  const variant = [...choices].sort((a, b) =>
    weightDistance(a, weight) - weightDistance(b, weight)
      || Number(a.style !== style) - Number(b.style !== style)
      || Number(a.weight !== 400) - Number(b.weight !== 400)
  )[0];
  return {
    family: name,
    url: `${PLATFORM_FONT_ASSET_ORIGIN}/fonts/${variant.file}`,
    variant,
    exact: variant.style === style && weightDistance(variant, weight) === 0,
  };
}

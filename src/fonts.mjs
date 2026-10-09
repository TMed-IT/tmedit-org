import { fontProviders } from "astro/config";
import zenUnicode from "@fontsource/zen-kaku-gothic-new/unicode.json" with { type: "json" };
import spaceUnicode from "@fontsource-variable/space-grotesk/unicode.json" with { type: "json" };
import notoUnicode from "@fontsource-variable/noto-sans/unicode.json" with { type: "json" };

// Fontsource ships both font files and their unicode ranges in the locked npm packages.
// Keep Japanese subsets separate so browsers only download the glyphs they need.
function variants(packageName, id, unicode, weights, styles = ["normal"]) {
  return Object.entries(unicode).flatMap(([subset, range]) =>
    weights.flatMap(weight => styles.map(style => ({
      src: [`${packageName}/files/${id}-${subset.replace(/[\[\]]/g, "")}-${typeof weight === "number" ? weight : "wght"}-${style}.woff2`],
      weight,
      style,
      unicodeRange: range.split(","),
    }))),
  );
}

export const fonts = [
  {
    provider: fontProviders.local(),
    name: "Zen Kaku Gothic New",
    cssVariable: "--font-body",
    weights: [400, 500, 700, 900],
    fallbacks: ["sans-serif"],
    options: {
      variants: variants("@fontsource/zen-kaku-gothic-new", "zen-kaku-gothic-new", zenUnicode, [400, 500, 700, 900]),
    },
  },
  {
    provider: fontProviders.local(),
    name: "Space Grotesk",
    cssVariable: "--font-outlier",
    weights: ["300 700"],
    fallbacks: ["sans-serif"],
    options: {
      variants: variants("@fontsource-variable/space-grotesk", "space-grotesk", spaceUnicode, ["300 700"]),
    },
  },
  {
    provider: fontProviders.local(),
    name: "Noto Sans",
    cssVariable: "--font-emdash",
    weights: ["100 900"],
    styles: ["normal", "italic"],
    fallbacks: ["ui-sans-serif", "system-ui", "sans-serif"],
    options: {
      variants: variants("@fontsource-variable/noto-sans", "noto-sans", notoUnicode, ["100 900"], ["normal", "italic"]),
    },
  },
];

// Lokad-flavoured palette: charcoal ink, a single brand red for emphasis and the
// budget cut line, restrained neutrals. Kept in one place so charts and chrome
// stay consistent.

export const theme = {
  ink: "#2b2b2b",
  inkSoft: "#5c5c5c",
  inkFaint: "#8a8a8a",
  red: "#d81e2c",
  redSoft: "rgba(216, 30, 44, 0.12)",
  paper: "#ffffff",
  panel: "#faf9f7",
  line: "#e4e1db",
  lineFaint: "#efece7",
  // Demand vs requirement get distinct but quiet hues.
  demand: "#2b6e7a",
  demandBand: "rgba(43, 110, 122, 0.16)",
  demandBandInner: "rgba(43, 110, 122, 0.28)",
  requirement: "#7a5a2b",
  requirementBand: "rgba(122, 90, 43, 0.16)",
  requirementBandInner: "rgba(122, 90, 43, 0.30)",
  funded: "rgba(216, 30, 44, 0.06)",
} as const;

export const fonts = {
  serif: 'Georgia, "Times New Roman", "Iowan Old Style", serif',
  sans: '"Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif',
  mono: '"SFMono-Regular", "Consolas", "Liberation Mono", Menlo, monospace',
} as const;

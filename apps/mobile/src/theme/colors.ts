/**
 * Central dark-theme palette for the DocJob mobile app, derived from the web
 * app's brand tokens (`apps/web/src/app/globals.css` `.dark` block: deep
 * space blue background, vibrant cyan primary, electric magenta accent).
 * React Native has no CSS custom properties / Tailwind theme, so this module
 * is the single source of truth every screen/component imports instead of
 * hardcoding hex literals. Semantic names describe ROLE (background, surface,
 * text, primary...) not the literal color, so a future palette tweak only
 * touches this file.
 */
export const colors = {
  // Backgrounds
  background: '#050a18', // deep space blue (web --background: 222 84% 4%)
  backgroundAlt: '#0b1224', // secondary/alternate page background
  surface: '#101a30', // cards, list rows (web --card: 222 84% 8%)
  surfaceElevated: '#16213b', // inputs, modals, raised surfaces
  border: '#26324d', // web --border: 230 20% 30%

  // Text
  text: '#f5f8fc', // primary text (web --foreground: 210 40% 98%)
  textMuted: '#9aa4bd', // secondary/muted text (web --muted-foreground)
  textSubtle: '#6b768f', // tertiary/placeholder text

  // Brand
  primary: '#22d3ee', // vibrant cyan (web --primary: 180 100% 50%)
  onPrimary: '#04091a', // dark text/icon ON a primary-colored surface
  accent: '#f472d0', // electric magenta (web --accent: 320 100% 60%)

  // Status
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171', // error text on dark
  dangerSurface: '#3b1a1a', // error banner background

  // Misc
  overlay: 'rgba(0,0,0,0.6)', // modal scrims
} as const;

export type Colors = typeof colors;

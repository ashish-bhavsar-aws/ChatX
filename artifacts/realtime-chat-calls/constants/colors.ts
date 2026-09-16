/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#111B21',
    tint: '#25D366',

    // Core surfaces
    background: '#F0F2F5',
    foreground: '#111B21',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#111B21',

    // Primary action color (buttons, links, active states)
    primary: '#25D366',
    primaryForeground: '#FFFFFF',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E7FCEB',
    secondaryForeground: '#075E54',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#E9EDEF',
    mutedForeground: '#667781',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#DCF8C6',
    accentForeground: '#111B21',

    // Destructive actions (delete, error states)
    destructive: '#EA0038',
    destructiveForeground: '#FFFFFF',

    // Borders and input outlines
    border: '#E9EDEF',
    input: '#D1D7DB',
    primaryDark: '#075E54',
    headerSecondary: '#128C7E',
    onPrimary: '#FFFFFF',
  },

  dark: {
    text: '#E9EDEF',
    tint: '#25D366',
    background: '#0B141A',
    foreground: '#E9EDEF',
    card: '#202C33',
    cardForeground: '#E9EDEF',
    primary: '#25D366',
    primaryForeground: '#111B21',
    secondary: '#233138',
    secondaryForeground: '#D9FDD3',
    muted: '#202C33',
    mutedForeground: '#8696A0',
    accent: '#D9FDD3',
    accentForeground: '#111B21',
    destructive: '#EA0038',
    destructiveForeground: '#FFFFFF',
    border: '#2A3942',
    input: '#2A3942',
    primaryDark: '#202C33',
    headerSecondary: '#2A3942',
    onPrimary: '#FFFFFF',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;

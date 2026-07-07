/**
 * Semantic design tokens for the mobile app.
 *
 * Automotive diagnostic theme: deep charcoal dashboard surfaces with a
 * warm amber/ember primary accent (temperature gauge, alerts).
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: "#f2f1ee",
    tint: "#e8542c",

    // Core surfaces
    background: "#12151a",
    foreground: "#f2f1ee",

    // Cards / elevated surfaces
    card: "#1b1f26",
    cardForeground: "#f2f1ee",

    // Primary action color (buttons, links, active states)
    primary: "#e8542c",
    primaryForeground: "#12151a",

    // Secondary / less-emphasis interactive surfaces
    secondary: "#252b34",
    secondaryForeground: "#f2f1ee",

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: "#232830",
    mutedForeground: "#8b93a1",

    // Accent highlights (badges, selected items, focus rings)
    accent: "#2c3542",
    accentForeground: "#f2f1ee",

    // Destructive actions (delete, error states)
    destructive: "#ef4444",
    destructiveForeground: "#ffffff",

    // Success / normal temperature range
    success: "#22c55e",
    warning: "#f5a524",

    // Borders and input outlines
    border: "#2a2f38",
    input: "#232830",
  },

  // Border radius (in px). Applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;

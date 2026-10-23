/**
 * KTS Master Control — Design Tokens
 * Single source of truth for colors, spacing, typography, shadows, radius, motion.
 * Mirrors the KTS website (karstechsolutions.com) and extends for app density.
 */

export const tokens = {
  // =========================================================================
  // COLOR — Core palette (from website :root)
  // =========================================================================
  color: {
    // Base
    ink: '#0A1628',           // Deep navy background
    panel: '#101E33',         // Card/surface background
    panel2: '#152A47',        // Elevated surface
    line: 'rgba(139, 157, 179, 0.16)', // Borders, dividers
    muted: '#8B9DB3',         // Secondary text, icons
    off: '#EDF2F7',           // Primary text

    // Brand
    teal: '#2DD4BF',          // Primary accent (actions, success, live indicators)
    tealDim: '#1B8F82',       // Hover/pressed teal
    amber: '#F5A623',         // Secondary accent (warnings, commercial, CTAs)
    amberDim: '#C9860F',      // Hover/pressed amber

    // Semantic
    red: '#EF4444',           // Danger, errors, critical
    redDim: '#B91C1C',
    green: '#22C55E',         // Success, running, online
    greenDim: '#15803D',
    blue: '#3B82F6',          // Info, links
    blueDim: '#1D4ED8',

    // With alpha variants for overlays
    tealAlpha: (a: number) => `rgba(45, 212, 191, ${a})`,
    amberAlpha: (a: number) => `rgba(245, 166, 35, ${a})`,
    redAlpha: (a: number) => `rgba(239, 68, 68, ${a})`,
    greenAlpha: (a: number) => `rgba(34, 197, 94, ${a})`,
    blueAlpha: (a: number) => `rgba(59, 130, 246, ${a})`,
    inkAlpha: (a: number) => `rgba(10, 22, 40, ${a})`,
    panelAlpha: (a: number) => `rgba(16, 30, 51, ${a})`,
    lineAlpha: (a: number) => `rgba(139, 157, 179, ${a})`,
  },

  // =========================================================================
  // SPACING — 4px base scale
  // =========================================================================
  space: {
    0: '0',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    7: '28px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
    20: '80px',
    24: '96px',
  },

  // =========================================================================
  // TYPOGRAPHY — Font families, sizes, weights, line heights
  // =========================================================================
  font: {
    families: {
      sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
      heading: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
      mono: "'JetBrains Mono', ui-monospace, monospace",
    },
    sizes: {
      xs: '11px',      // 0.6875rem — kickers, badges, timestamps
      sm: '12.5px',    // 0.78125rem — small UI text
      base: '14px',    // 0.875rem — body text
      md: '15px',      // 0.9375rem — slightly larger body
      lg: '16.5px',    // 1.03125rem — comfortable reading
      xl: '18px',      // 1.125rem — subheadings
      '2xl': '22px',   // 1.375rem — card titles
      '3xl': '28px',   // 1.75rem — section headings
      '4xl': '36px',   // 2.25rem — page titles
      '5xl': '48px',   // 3rem — hero
      '6xl': '60px',   // 3.75rem — display
    },
    weights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeights: {
      tight: 1.1,
      snug: 1.35,
      normal: 1.6,
      relaxed: 1.75,
    },
    letterSpacing: {
      tight: '-0.02em',
      normal: '0',
      wide: '0.02em',
      wider: '0.08em',
      widest: '0.12em',
    },
  },

  // =========================================================================
  // RADIUS
  // =========================================================================
  radius: {
    none: '0',
    sm: '6px',
    base: '8px',
    md: '10px',      // Default card radius (website uses 10px)
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },

  // =========================================================================
  // SHADOWS — Layered elevation
  // =========================================================================
  shadow: {
    none: 'none',
    xs: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
    sm: '0 2px 8px -2px rgba(0, 0, 0, 0.4)',
    base: '0 4px 16px -4px rgba(0, 0, 0, 0.45)',
    md: '0 8px 24px -6px rgba(0, 0, 0, 0.5)',
    lg: '0 16px 40px -8px rgba(0, 0, 0, 0.55)',
    xl: '0 24px 64px -12px rgba(0, 0, 0, 0.6)',
    // Colored glows for brand accents
    tealGlow: '0 8px 20px -6px rgba(45, 212, 191, 0.5)',
    amberGlow: '0 8px 20px -6px rgba(245, 166, 35, 0.5)',
    redGlow: '0 8px 20px -6px rgba(239, 68, 68, 0.5)',
    greenGlow: '0 8px 20px -6px rgba(34, 197, 94, 0.5)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.3)',
  },

  // =========================================================================
  // MOTION — Durations, easings, reduced-motion respect
  // =========================================================================
  motion: {
    durations: {
      instant: '0ms',
      fast: '120ms',
      base: '180ms',
      slow: '280ms',
      slower: '400ms',
      slowest: '600ms',
    },
    easings: {
      linear: 'linear',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      // Brand spring for playful interactions
      brand: 'cubic-bezier(0.25, 1.5, 0.5, 1)',
    },
  },

  // =========================================================================
  // Z-INDEX — Layering hierarchy
  // =========================================================================
  zIndex: {
    base: 0,
    dropdown: 100,
    sticky: 200,
    modal: 400,
    popover: 500,
    tooltip: 600,
    toast: 700,
    commandPalette: 800,
    notification: 900,
  },

  // =========================================================================
  // BREAKPOINTS — Responsive thresholds
  // =========================================================================
  breakpoint: {
    sm: '640px',
    md: '860px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },

  // =========================================================================
  // ICON SIZES
  // =========================================================================
  iconSize: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '28px',
    '4xl': '32px',
  },

  // =========================================================================
  // BORDER WIDTHS
  // =========================================================================
  borderWidth: {
    none: '0',
    thin: '1px',
    base: '1px',
    thick: '2px',
    thicker: '3px',
  },

  // =========================================================================
  // OPACITY
  // =========================================================================
  opacity: {
    0: '0',
    5: '0.05',
    10: '0.1',
    20: '0.2',
    30: '0.3',
    40: '0.4',
    50: '0.5',
    60: '0.6',
    70: '0.7',
    80: '0.8',
    90: '0.9',
    100: '1',
  },
} as const;

// Type helpers for CSS-in-JS or Tailwind config generation
export type Tokens = typeof tokens;
export type ColorToken = keyof typeof tokens.color;
export type SpaceToken = keyof typeof tokens.space;
export type FontSizeToken = keyof typeof tokens.font.sizes;
export type RadiusToken = keyof typeof tokens.radius;
export type ShadowToken = keyof typeof tokens.shadow;
export type MotionDurationToken = keyof typeof tokens.motion.durations;
export type MotionEasingToken = keyof typeof tokens.motion.easings;
export type ZIndexToken = keyof typeof tokens.zIndex;
export type BreakpointToken = keyof typeof tokens.breakpoint;
export type IconSizeToken = keyof typeof tokens.iconSize;
export type BorderWidthToken = keyof typeof tokens.borderWidth;

// =========================================================================
// CSS CUSTOM PROPERTIES GENERATOR
// Use in globals.css or inject via style tag for runtime theming
// =========================================================================
export function generateCSSVariables(prefix = 'kts'): string {
  const lines: string[] = [`:root {`];

  // Colors
  Object.entries(tokens.color).forEach(([key, value]) => {
    if (typeof value === 'string') {
      lines.push(`  --${prefix}-color-${key}: ${value};`);
    }
  });

  // Spacing
  Object.entries(tokens.space).forEach(([key, value]) => {
    lines.push(`  --${prefix}-space-${key}: ${value};`);
  });

  // Font sizes
  Object.entries(tokens.font.sizes).forEach(([key, value]) => {
    lines.push(`  --${prefix}-font-size-${key}: ${value};`);
  });

  // Radius
  Object.entries(tokens.radius).forEach(([key, value]) => {
    lines.push(`  --${prefix}-radius-${key}: ${value};`);
  });

  // Shadows
  Object.entries(tokens.shadow).forEach(([key, value]) => {
    lines.push(`  --${prefix}-shadow-${key}: ${value};`);
  });

  // Motion durations
  Object.entries(tokens.motion.durations).forEach(([key, value]) => {
    lines.push(`  --${prefix}-motion-${key}: ${value};`);
  });

  // Z-index
  Object.entries(tokens.zIndex).forEach(([key, value]) => {
    lines.push(`  --${prefix}-z-${key}: ${value};`);
  });

  // Breakpoints (for container queries)
  Object.entries(tokens.breakpoint).forEach(([key, value]) => {
    lines.push(`  --${prefix}-breakpoint-${key}: ${value};`);
  });

  lines.push(`}`);
  return lines.join('\n');
}

// =========================================================================
// SEMANTIC COLOR MAPS — For component-level usage
// =========================================================================
export const semanticColors = {
  // Backgrounds
  bg: {
    primary: tokens.color.ink,
    secondary: tokens.color.panel,
    tertiary: tokens.color.panel2,
    inverse: tokens.color.off,
  },
  // Text
  text: {
    primary: tokens.color.off,
    secondary: tokens.color.muted,
    tertiary: tokens.color.line,
    inverse: tokens.color.ink,
    link: tokens.color.teal,
    linkHover: tokens.color.tealDim,
  },
  // Borders
  border: {
    default: tokens.color.line,
    strong: tokens.color.muted,
    focus: tokens.color.teal,
    error: tokens.color.red,
    warning: tokens.color.amber,
    success: tokens.color.green,
  },
  // Status indicators
  status: {
    running: tokens.color.green,
    runningBg: tokens.color.greenAlpha(0.15),
    stopped: tokens.color.muted,
    stoppedBg: tokens.color.lineAlpha(0.15),
    error: tokens.color.red,
    errorBg: tokens.color.redAlpha(0.15),
    warning: tokens.color.amber,
    warningBg: tokens.color.amberAlpha(0.15),
    pending: tokens.color.blue,
    pendingBg: tokens.color.blueAlpha(0.15),
  },
  // Brand accents
  brand: {
    primary: tokens.color.teal,
    primaryHover: tokens.color.tealDim,
    primaryBg: tokens.color.tealAlpha(0.15),
    secondary: tokens.color.amber,
    secondaryHover: tokens.color.amberDim,
    secondaryBg: tokens.color.amberAlpha(0.15),
  },
  // Interactive states
  interactive: {
    hover: tokens.color.panel2,
    active: tokens.color.lineAlpha(0.3),
    focus: tokens.color.tealAlpha(0.25),
    disabled: tokens.color.lineAlpha(0.1),
  },
} as const;
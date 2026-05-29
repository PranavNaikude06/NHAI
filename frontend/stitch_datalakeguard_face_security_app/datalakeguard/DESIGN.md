---
name: DatalakeGuard
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c1c6d6'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8b909f'
  outline-variant: '#414754'
  surface-tint: '#adc7ff'
  primary: '#adc7ff'
  on-primary: '#002e68'
  primary-container: '#1a73e8'
  on-primary-container: '#ffffff'
  inverse-primary: '#005bc0'
  secondary: '#6ddd81'
  on-secondary: '#003914'
  secondary-container: '#30a550'
  on-secondary-container: '#003210'
  tertiary: '#fbbc05'
  on-tertiary: '#402d00'
  tertiary-container: '#987000'
  on-tertiary-container: '#ffffff'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc7ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#004493'
  secondary-fixed: '#89fa9b'
  secondary-fixed-dim: '#6ddd81'
  on-secondary-fixed: '#002108'
  on-secondary-fixed-variant: '#005320'
  tertiary-fixed: '#ffdfa0'
  tertiary-fixed-dim: '#fbbc05'
  on-tertiary-fixed: '#261a00'
  on-tertiary-fixed-variant: '#5c4300'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  title-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 20px
---

## Brand & Style

The design system is engineered for high-stakes data environments, prioritizing trust, security, and immediate clarity. The brand personality is **authoritative and resilient**, designed to make the user feel protected while maintaining total control over complex data structures.

The aesthetic follows a **Modern-Corporate** approach with **Minimalist** influences. By utilizing a deep, near-black foundation, the UI eliminates visual noise, allowing critical security signals (Success, Error, Warning) to command attention without overwhelming the user. The interface should feel high-fidelity and "expensive," utilizing precision-engineered typography and subtle light-play on dark surfaces to denote hierarchy.

## Colors

This design system utilizes a high-contrast dark palette to maximize legibility in low-light environments typical of security operations centers.

- **Primary Action (Security Blue):** Used for primary calls to action, active states, and focus indicators. It represents intelligence and reliability.
- **Surface & Background:** The #0A0A0A background provides the "void" from which the #1E1E1E surfaces emerge. This distinction is critical for defining tactile boundaries without relying on heavy borders.
- **Semantic Signals:** Success (Green), Error (Red), and Warning (Yellow) are reserved strictly for system status. These colors should never be used decoratively.
- **Typography:** Pure White (#FFFFFF) is reserved for titles and critical data points. Grey (#9AA0A6) is used for metadata, captions, and secondary labels to reduce cognitive load.

## Typography

The system relies on **Inter** for its neutral, systematic, and highly legible characteristics. 

- **Weight Strategy:** Headings use Bold (700) weights to emphasize security status and system headers. Labels and secondary text use Medium (500) to ensure readability at small scales.
- **Data Display:** For encryption keys, IP addresses, or data logs, a secondary monospaced font (JetBrains Mono) is recommended to imply technical precision.
- **Hierarchy:** Ensure a clear vertical rhythm by strictly adhering to the defined line heights. Mobile-specific overrides for large headlines prevent text wrapping issues on narrow viewports.

## Layout & Spacing

This design system uses a **Fluid Grid** model based on an 8px square rhythm. 

- **Mobile Constraints:** On mobile devices, a 4-column layout is used with 20px side margins and 16px gutters.
- **Vertical Rhythm:** Elements are stacked using increments of 8px. Use 24px (lg) spacing between distinct content sections and 12px (sm) between related items within a card.
- **Touch Targets:** All interactive elements (buttons, inputs) must maintain a minimum height of 48px to ensure accessibility for high-stress security interactions.

## Elevation & Depth

In this dark-mode environment, depth is communicated through **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows.

- **Level 0 (Base):** #0A0A0A. The lowest layer, representing the background.
- **Level 1 (Surfaces):** #1E1E1E. Used for cards and persistent navigation bars.
- **Level 2 (Overlays):** #2C2C2C. Used for modals, sheets, and menus.
- **Borders:** To maintain a "sharp" professional look, surfaces use a 1px solid border of #333333 (or 10% white overlay) to define edges against the black background.
- **Interaction:** On press, surfaces should increase in brightness slightly (rather than moving "up" with a shadow) to simulate a physical backlight.

## Shapes

The shape language is **Rounded**, striking a balance between the friendliness of consumer apps and the professional structure of enterprise tools.

- **Cards & Inputs:** Use the `rounded-md` (0.5rem/8px) standard.
- **Buttons & Badges:** Use `rounded-xl` or full "Pill" shapes (32px+) to make them easily identifiable as interactive elements.
- **Security Ovals:** Biometric scan areas (Face Scan) should use a perfect 1:1.5 ratio oval with a consistent 2px stroke width.

## Components

- **Buttons:** Primary buttons are #1A73E8 with White text, using a 24px (Pill) corner radius. Secondary buttons should be ghost-style with a #333333 border.
- **Security Cards:** Dark surface (#1E1E1E) with 8px radius. Headlines inside cards should be White, Subtitles Grey. Include a subtle top-border accent color (Success/Error) to indicate card status.
- **PIN Pad:** Circular keys with #1E1E1E background. On-press, the circle fills with Security Blue. Text inside is 24px Regular.
- **Badges:** Pill-shaped, small (12px text). "Online" uses a #34A853 background with 10% opacity and solid green text.
- **Input Fields:** Semi-transparent fill with a bottom-only border or a subtle 1px frame. Focus state must trigger a Security Blue border glow.
- **Icons:** Use 24px stroke-based icons. Security-specific icons (Shields/Locks) should use a slightly heavier 2px stroke weight compared to utility icons.
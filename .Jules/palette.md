## 2024-05-14 - Header Action Buttons Accessibility
**Learning:** Found several icon-only header buttons lacking ARIA labels, missing `aria-hidden` on icons, and missing keyboard focus outlines (`focus-visible`). This makes it difficult for screen reader and keyboard-only users to understand or interact with the top bar utility actions.
**Action:** When adding utility or action icons, always include `aria-label`, add `aria-hidden="true"` to the icon itself, and use Tailwind's `focus-visible:ring-2 focus:outline-none` for proper keyboard accessibility.
## 2026-05-02 - Toggle Switch Accessibility
**Learning:** Found several custom toggle buttons lacking ARIA attributes and keyboard focus states. This makes it difficult for screen reader and keyboard-only users to understand or interact with the settings and setup toggles.
**Action:** When implementing custom toggle switches, always include `role="switch"`, dynamically update `aria-checked`, link to visible labels using `aria-labelledby`, and include `focus-visible` utility classes (e.g., `focus-visible:ring-2 focus-visible:outline-none`) for proper keyboard accessibility.

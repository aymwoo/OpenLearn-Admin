## 2024-05-14 - Header Action Buttons Accessibility
**Learning:** Found several icon-only header buttons lacking ARIA labels, missing `aria-hidden` on icons, and missing keyboard focus outlines (`focus-visible`). This makes it difficult for screen reader and keyboard-only users to understand or interact with the top bar utility actions.
**Action:** When adding utility or action icons, always include `aria-label`, add `aria-hidden="true"` to the icon itself, and use Tailwind's `focus-visible:ring-2 focus:outline-none` for proper keyboard accessibility.

## 2026-04-25 - Toggle Buttons Accessibility
**Learning:** Discovered that several custom toggle buttons in the app were built using plain `<button>` tags without communicating their state to screen readers. Relying only on visual indicators (like background color and translation) is a common accessibility trap.
**Action:** Whenever building or modifying a custom toggle button, ensure it includes `role="switch"` and an accurate `aria-checked` attribute, along with a proper `aria-label` and `focus-visible` styles.

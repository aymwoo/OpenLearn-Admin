## 2024-05-14 - Header Action Buttons Accessibility
**Learning:** Found several icon-only header buttons lacking ARIA labels, missing `aria-hidden` on icons, and missing keyboard focus outlines (`focus-visible`). This makes it difficult for screen reader and keyboard-only users to understand or interact with the top bar utility actions.
**Action:** When adding utility or action icons, always include `aria-label`, add `aria-hidden="true"` to the icon itself, and use Tailwind's `focus-visible:ring-2 focus:outline-none` for proper keyboard accessibility.

## 2024-05-15 - Custom Toggle Button Accessibility
**Learning:** Found custom toggle switches implemented as generic `<button>` elements without accessible roles or state indicators, making them invisible or confusing to screen readers and difficult to focus via keyboard.
**Action:** Always provide custom toggle buttons with `role="switch"`, dynamically bind their state using `aria-checked={boolean}`, link their visible labels using `aria-labelledby`, and ensure keyboard visibility with `focus-visible:ring-2 focus-visible:outline-none`.

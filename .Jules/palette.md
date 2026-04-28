## 2024-05-14 - Header Action Buttons Accessibility
**Learning:** Found several icon-only header buttons lacking ARIA labels, missing `aria-hidden` on icons, and missing keyboard focus outlines (`focus-visible`). This makes it difficult for screen reader and keyboard-only users to understand or interact with the top bar utility actions.
**Action:** When adding utility or action icons, always include `aria-label`, add `aria-hidden="true"` to the icon itself, and use Tailwind's `focus-visible:ring-2 focus:outline-none` for proper keyboard accessibility.
## 2024-05-18 - Add semantic roles to custom toggle switches
**Learning:** When creating custom toggle switches using `<button>` and Tailwind for styling instead of native `<input type="checkbox">`, the elements lack the semantic meaning of a switch. This is a common pattern in the app.
**Action:** Always add `role="switch"` and dynamically update `aria-checked={boolean}` to ensure screen readers announce them correctly as switches and read their state.

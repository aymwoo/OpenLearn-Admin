## 2024-05-14 - Header Action Buttons Accessibility
**Learning:** Found several icon-only header buttons lacking ARIA labels, missing `aria-hidden` on icons, and missing keyboard focus outlines (`focus-visible`). This makes it difficult for screen reader and keyboard-only users to understand or interact with the top bar utility actions.
**Action:** When adding utility or action icons, always include `aria-label`, add `aria-hidden="true"` to the icon itself, and use Tailwind's `focus-visible:ring-2 focus:outline-none` for proper keyboard accessibility.
## 2024-05-15 - Accessible Custom Switches
**Learning:** Custom div/button-based toggle switches often lack semantic meaning for screen readers, meaning users cannot tell their state.
**Action:** Always add `role="switch"`, `aria-checked={state}`, and `aria-labelledby` or `aria-label` to custom toggle components.

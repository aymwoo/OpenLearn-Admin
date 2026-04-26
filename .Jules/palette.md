## 2024-05-14 - Header Action Buttons Accessibility
**Learning:** Found several icon-only header buttons lacking ARIA labels, missing `aria-hidden` on icons, and missing keyboard focus outlines (`focus-visible`). This makes it difficult for screen reader and keyboard-only users to understand or interact with the top bar utility actions.
**Action:** When adding utility or action icons, always include `aria-label`, add `aria-hidden="true"` to the icon itself, and use Tailwind's `focus-visible:ring-2 focus:outline-none` for proper keyboard accessibility.

## 2024-05-15 - Custom Toggle Buttons Accessibility
**Learning:** Found custom toggle switch `<button>` elements that lacked `role="switch"`, `aria-checked` attributes, and explicit keyboard focus outlines (`focus-visible`). This makes it difficult for screen reader users to understand their current state and limits keyboard navigation visibility.
**Action:** Always enhance custom built toggles with `role="switch"`, dynamically bind the `aria-checked` attribute to its active state, supply a descriptive `aria-label`, and use Tailwind's `focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-primary` (or appropriate primary color variant) for proper keyboard accessibility.

## 2024-05-14 - Header Action Buttons Accessibility
**Learning:** Found several icon-only header buttons lacking ARIA labels, missing `aria-hidden` on icons, and missing keyboard focus outlines (`focus-visible`). This makes it difficult for screen reader and keyboard-only users to understand or interact with the top bar utility actions.
**Action:** When adding utility or action icons, always include `aria-label`, add `aria-hidden="true"` to the icon itself, and use Tailwind's `focus-visible:ring-2 focus:outline-none` for proper keyboard accessibility.

## 2024-05-15 - Custom Toggle Switch Accessibility
**Learning:** Found custom toggle switches built with `<button>` tags that lacked ARIA roles and keyboard focus styles. This made them inaccessible to screen readers (which couldn't announce their state) and keyboard users (who couldn't see when the toggle was focused).
**Action:** When building custom toggle switches using buttons, always include `role="switch"`, dynamically update `aria-checked`, link to visible labels using `aria-labelledby`, add `aria-hidden="true"` to inner decorative spans, and include `focus-visible` utility classes (e.g., `focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-offset-2`) to maintain screen reader and keyboard accessibility.

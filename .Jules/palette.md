## 2024-05-14 - Header Action Buttons Accessibility
**Learning:** Found several icon-only header buttons lacking ARIA labels, missing `aria-hidden` on icons, and missing keyboard focus outlines (`focus-visible`). This makes it difficult for screen reader and keyboard-only users to understand or interact with the top bar utility actions.
**Action:** When adding utility or action icons, always include `aria-label`, add `aria-hidden="true"` to the icon itself, and use Tailwind's `focus-visible:ring-2 focus:outline-none` for proper keyboard accessibility.

## 2024-05-18 - Missing switch role and focus-visible on custom toggles
**Learning:** Custom toggle switches built with Tailwind (`button` elements toggling state with a sliding circle) in this codebase are consistently missing `role="switch"`, `aria-checked` states, `aria-labelledby`, and keyboard focus visible states.
**Action:** When working on new or existing forms, ensure all custom `button`-based toggles are audited to include semantic `role="switch"`, dynamically linked `aria-checked`, explicit labels using `aria-labelledby`, and `focus-visible:ring-2 focus-visible:outline-none` classes to maintain keyboard and screen reader accessibility.

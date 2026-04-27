## 2024-05-14 - Header Action Buttons Accessibility
**Learning:** Found several icon-only header buttons lacking ARIA labels, missing `aria-hidden` on icons, and missing keyboard focus outlines (`focus-visible`). This makes it difficult for screen reader and keyboard-only users to understand or interact with the top bar utility actions.
**Action:** When adding utility or action icons, always include `aria-label`, add `aria-hidden="true"` to the icon itself, and use Tailwind's `focus-visible:ring-2 focus:outline-none` for proper keyboard accessibility.

## 2024-05-14 - Custom Toggle Buttons Accessibility
**Learning:** Found custom toggle switches built with `<button>` in `src/app/settings/page.tsx` and `src/app/setup/page.tsx` that lacked accessibility attributes. Screen reader users would just hear "button" without knowing its toggle function or state, and keyboard users lacked clear focus indication.
**Action:** Always add `role="switch"` and dynamically set `aria-checked={isToggled}` for custom toggle buttons. Add clear `aria-label`s. Ensure keyboard accessibility by adding `focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-primary` (or appropriate primary color variant) using Tailwind.

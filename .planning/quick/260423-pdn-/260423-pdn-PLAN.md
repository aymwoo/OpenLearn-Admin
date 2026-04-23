---
phase: 260423-pdn
plan: '01'
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/page.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "User sees clear error message when web service is unreachable"
    - "User knows what action to take when connection fails"
  artifacts:
    - path: src/app/page.tsx
      provides: Error state display for web service connection
      contains: webServiceConnectionError state
  key_links:
    - from: "src/app/page.tsx fetchWSInfo"
      to: "UI error display"
      via: "webServiceConnectionError state"
      pattern: "setWebServiceConnectionError"
---

<objective>
Handle web service connection errors gracefully and display them to the user.

Purpose: When the web service is unreachable, show a clear error message instead of just displaying "-" with no context.

Output: Improved error handling in Dashboard with user-visible feedback.
</objective>

<context>
@src/lib/git.ts (getWebServiceInfo throws '无法连接到 Web 服务，请检查 URL 是否正确。')
@src/app/page.tsx (Dashboard - currently catches error but only logs to console)

## Current Behavior

In src/app/page.tsx lines 234-255:
```typescript
const fetchWSInfo = async () => {
  if (!configRef.current?.webServiceUrl) return;
  try {
    const info = await getWebServiceInfo(configRef.current.webServiceUrl);
    if (mounted) {
      setWebServiceInfo(info);
    }
  } catch (err) {
    console.error("Failed to get web service info:", err);
  }
};
```

Error is caught but only logged - no UI feedback.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add web service connection error state and display</name>
  <files>src/app/page.tsx</files>
  <action>
    1. Add state for connection error: `const [webServiceConnectionError, setWebServiceConnectionError] = useState<string | null>(null);`
    2. In fetchWSInfo, capture error message: `catch (err) { const errMsg = err instanceof Error ? err.message : String(err); setWebServiceConnectionError(errMsg); }`
    3. Clear error when connection succeeds: `setWebServiceConnectionError(null);`
    4. Display error in UI at the top of the Web Service info row (line 671 area): Show a red/orange warning box with the error message and a "重试" button
  </action>
  <verify>
    <automated>grep -n "webServiceConnectionError" src/app/page.tsx | head -5</automated>
  </verify>
  <done>
    - Error state exists in component
    - Error message shows in UI when connection fails
    - Error clears when connection succeeds
  </done>
</task>

</tasks>

<verification>
After implementation, verify the Web Service info section shows an error message when the service is unreachable instead of just showing "-".
</verification>

<success_criteria>
User sees clear error message "无法连接到 Web 服务，请检查 URL 是否正确。" when web service is not running.
</success_criteria>

<output>
After completion, create `.planning/quick/260423-pdn-/260423-pdn-01-SUMMARY.md`
</output>
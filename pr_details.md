Title: 🧪 [testing improvement description]
Description:
🎯 **What:** The `pullRepo` function in `src/lib/git.ts` was missing tests, leaving a gap in coverage for the core git synchronization functionality.
📊 **Coverage:** Added test cases for `pullRepo` to cover:
  - Successful pull returning positive result.
  - Successful force pull handling when invoke returns empty string.
  - Failed pull gracefully catching standard Error objects.
  - Failed pull gracefully catching string errors.
✨ **Result:** Enhanced the test coverage and reliability of the `pullRepo` function, allowing confident future refactoring of repository syncing features. Also fixed an unescaped character regex syntax bug in `src/lib/git.ts` that was breaking `esbuild`.

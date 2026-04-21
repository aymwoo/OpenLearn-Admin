💡 **What:**
Optimized `split_sections` in `src-tauri/src/lib.rs` by storing `&str` references inside the temporary `current` vector instead of fully allocating `String`s. The string allocation is deferred until the section lines are completely collected and joined.

🎯 **Why:**
The previous implementation performed a new string allocation (`line.to_string()`) for every single line of the input parsed. Avoiding allocations during the loop significantly reduces memory churn and speeds up parsing.

📊 **Measured Improvement:**
Created an isolated benchmark processing 10,000 dates and their associated multiline changes 10 times.
- **Baseline:** ~305 ms
- **Optimized:** ~269 ms
- **Improvement:** ~11.8% faster execution time for large inputs.

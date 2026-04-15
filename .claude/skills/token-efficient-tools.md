# Token-Efficient Tools

When this skill is active, use the most token-efficient approach for all tool calls:

- **Read**: Always use `offset` + `limit` to read only the relevant section — never read an entire large file when you know the target lines.
- **Grep**: Prefer `files_with_matches` over `content` when you only need to locate files. Use `head_limit` to cap results.
- **Edit**: Make surgical edits with minimal `old_string` context — just enough to be unique. Never rewrite whole files with Write unless truly necessary.
- **Bash**: Chain related commands with `&&` in a single call instead of multiple sequential calls.
- **Agent**: Only spawn subagents for genuinely open-ended research. Never delegate a task you can answer directly.
- **Parallel tool calls**: Always batch independent tool calls in a single message (Read + Grep simultaneously, etc.).
- **No re-reads after edits**: Trust that Edit/Write succeeded. Don't read back the file to verify.
- **No redundant queries**: If a piece of information was already retrieved this session, reference it from context — don't fetch it again.

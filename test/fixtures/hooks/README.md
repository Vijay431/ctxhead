# Hook payload fixtures

Scrubbed hook stdin payloads, used by the guard adapter tests. Home paths are `/home/user`, ids are `00000000-...`, the project is `/home/user/project`.

## Real captures

Captured 2026-11-17 with a tiny hook script in a throwaway repo. Claude Code 2.1.326 (`claude -p --model haiku`) and Antigravity CLI `agy` 1.5.10 (`gemini-3.8-flash-low`).

- `claude-read.json`, `claude-shell.json`, `claude-finish.json` (Stop)
- `claude-subagent-read.json`: PreToolUse fired from a subagent. It has the same `session_id` as the parent plus `agent_id` and `agent_type`.
- `antigravity-read.json`, `antigravity-shell.json`, `antigravity-finish.json` (Stop)

Antigravity has no subagent fixture because task 1.1 does not require one.

## Doc-derived (not captured)

Codex and Gemini CLI are not installed, so these follow the vendor docs. Field values are invented. Replace them with real captures when possible.

- `codex-*.doc-derived.json`: https://developers.openai.com/codex/hooks (redirects to https://learn.chatgpt.com/docs/hooks). Codex has no read tool, so `codex-read` is a `Bash` command. `codex-subagent-read` is a guess from the SubagentStart/SubagentStop fields (`agent_id`, `agent_type`).
- `gemini-*.doc-derived.json`: https://geminicli.com/docs/hooks/reference/ and https://geminicli.com/docs/tools/file-system/. The `read_file` args (`file_path`, `offset`, `limit`) come from the tools doc. `gemini-read-many-files` fields come from `ReadManyFilesParams` in https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/tools/read-many-files.ts. The docs do not say whether subagent tool calls fire BeforeTool, so `gemini-subagent-read` is unconfirmed.

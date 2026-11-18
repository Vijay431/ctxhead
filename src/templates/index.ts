/** Single source for everything `ctxhead install` writes into agents. */

export const MARKER = 'ctxhead-managed: v1';
export const MARKER_PATTERN = /ctxhead-managed: v\d+/;
export const BLOCK_START = '<!-- ctxhead:start -->';
export const BLOCK_END = '<!-- ctxhead:end -->';

const SKILL_DESCRIPTION =
  'Refresh ctxhead file headers (short name/description frontmatter at the top of source files). ' +
  'Use when `ctxhead stale` lists files, after editing files that carry a ctxhead header, ' +
  'or when asked to update or add file headers.';

export const SKILL = `---
name: ctxhead
description: ${SKILL_DESCRIPTION}
metadata:
  ${MARKER}
---

# ctxhead

ctxhead keeps a short header at the top of each in-scope source file so agents can decide
whether to open the body. The CLI validates and stamps headers; you write the descriptions.

## Procedure

1. Run \`ctxhead stale --json\`. If it reports \`"enabled": false\`, stop: headers are off here.
2. For each listed file, read it and write a description that says what the file does and
   when to open it. Start with the verb, not "This file". Keep it under 1024 characters.
3. Run \`ctxhead write <file> --description "<text>"\`. Add \`--name <kebab-case>\` only to
   override the name derived from the file name. Never write the \`ctxhead:\` hash line yourself.
   If the exit code is 2, fix the input using the printed \`rule <id>:\` lines and retry.
4. Run \`ctxhead stale\` again until no files are listed.

Running \`ctxhead stale\` (step 1) is what lets you read the listed files during a refresh.

## Header format

\`\`\`
// ---
// name: auth-middleware
// description: Verifies JWTs on incoming requests. Open when changing login or token rules.
// ctxhead: v1 sha256:<computed by ctxhead>
// ---
\`\`\`
`;

export const COMMAND_DESCRIPTION = 'Refresh ctxhead file headers by following the ctxhead skill';
export const COMMAND_BODY = 'Follow the ctxhead skill to refresh file headers in this repository.';

export const CLAUDE_COMMAND = `---
description: ${COMMAND_DESCRIPTION}
---
<!-- ${MARKER} -->

${COMMAND_BODY}
`;

export const WORKFLOW_COMMAND = CLAUDE_COMMAND;

export const GEMINI_COMMAND = `# ${MARKER}
description = "${COMMAND_DESCRIPTION}"
prompt = "${COMMAND_BODY}"
`;

export const RULES_BODY = `## ctxhead file headers

Some source files start with a ctxhead header: a comment block between two \`---\` lines holding
\`name\`, \`description\`, and a \`ctxhead:\` hash line.

- Before opening a file, read its first lines up to the closing \`---\` of the header.
- Open the rest of the file only when the description's "when" clause matches your task.
- When ctxhead hooks are installed, the first read of a headed file's body in a session is
  denied. The deny reason shows the file's header. Decide from the header. Re-issue the same
  read only if the header does not settle the question.
- If a read stops with \`STOP: do not continue this task.\`, stop the task. Report the listed
  files to the user. Wait for them to refresh the headers and tell you to resume. Do not work
  around it.
- If a fresh header's description is wrong for its file, stop the task. Name the file to the
  user and ask them to refresh its header. Wait for them to tell you to resume.
- After you change a file that has a header, or when \`ctxhead stale\` lists files, follow the
  ctxhead skill to refresh the headers. Never edit the \`ctxhead:\` hash line by hand.`;

export const SHIM_BODY = '@AGENTS.md';

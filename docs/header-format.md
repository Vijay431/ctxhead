# Header format

A header is a block of line comments at the top of a source file, after any shebang, Python
encoding line, JavaScript directive prologue (`"use strict"`, `"use client"`, `"use server"`),
or PHP `<?php` tag.

```ts
// ---
// name: auth-middleware
// description: Verifies JWTs on incoming requests. Open when changing login or token rules.
// ctxhead: v1 sha256:b40dedde60828bf61d1fadbfc3bb7ea2e0421e9511d22f1b5fb44ae5ba07dbb3
// ---
```

Lines, in order: `---`, `name:`, `description:` (one line, or a folded `>-` block), the
`ctxhead:` line, `---`. No other fields are allowed. The hash is computed by `ctxhead write`
over the file body (everything after the header, CRLF as LF, no leading blank lines); never
write it by hand. A changed body makes the header `stale`; editing only the header does not.

Comment prefixes: `//` (ts, tsx, js, jsx, mjs, cjs, go, rs, java, kt, kts, swift, c, h, cc,
cpp, hpp, cs, scala, dart, php), `#` (py, rb, sh, bash, zsh, pl, r, ex, exs, yaml, yml, toml),
`--` (sql, lua, hs). Other file types are out of scope.

## Rules

`ctxhead write` prints one `rule <id>: <explanation>` line per broken rule and exits 2.

| Rule id              | Meaning                                                                      |
| -------------------- | ---------------------------------------------------------------------------- |
| `name-format`        | `name` uses only `a-z`, `0-9`, `-`; no leading, trailing, or doubled hyphen. |
| `name-length`        | `name` is 1-64 characters.                                                   |
| `description-length` | `description` is 1-1024 characters.                                          |
| `description-xml`    | `description` contains an XML or HTML tag.                                   |
| `description-filler` | `description` starts with filler such as "This file".                        |
| `description-wrap`   | A header line is longer than 100 characters, including the comment prefix.   |

`ctxhead check` also reports `header-format` for a malformed header (unclosed, unknown field,
missing line, bad hash line).

## Examples

Each example below is verified by `test/docs.test.ts`: the test places it above the body `export const x = 1;` (or `x = 1` for Python) and runs `ctxhead check`, so the hashes are real.

```python
# ---
# name: tool
# description: Runs the build tool. Open when changing build steps.
# ctxhead: v1 sha256:9e26bf369911c45c243c684147b23fc9e1dcfcf257d299a1c632016a6fcd33f4
# ---
```

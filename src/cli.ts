#!/usr/bin/env node
import { homedir } from 'node:os';
import * as clack from '@clack/prompts';
import { run } from './app.js';
import { defaultStateBase } from './guard/state.js';
import type { Choice, Io } from './io.js';

const io: Io = {
  cwd: process.cwd(),
  home: homedir(),
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  stateBase: defaultStateBase(process.env, homedir()),
  async readStdin() {
    if (process.stdin.isTTY) return '';
    process.stdin.setEncoding('utf8');
    let data = '';
    for await (const chunk of process.stdin) data += chunk;
    return data;
  },
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  async pick(message: string, choices: Choice[], preselected: string[]) {
    const picked = await clack.multiselect({
      message,
      options: choices.map((choice) => ({ value: choice.id, label: choice.label })),
      initialValues: preselected,
      required: false,
    });
    return clack.isCancel(picked) ? [] : (picked as string[]);
  },
};

process.exitCode = await run(process.argv.slice(2), io);

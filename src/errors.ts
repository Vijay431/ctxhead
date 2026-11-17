/** Failure reported to the user; `exitCode` follows the CLI contract (1 failure, 2 validation). */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: 1 | 2 = 1,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

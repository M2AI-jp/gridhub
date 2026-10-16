export class MasumeError extends Error {
  constructor(code, message, exitCode = 2) {
    super(message);
    this.name = 'MasumeError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

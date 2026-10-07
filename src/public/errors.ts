import type { HundredPrintsErrorCode } from './types';

export class HundredPrintsError extends Error {
  readonly code: HundredPrintsErrorCode;
  readonly details?: unknown;
  readonly cause?: unknown;

  constructor(code: HundredPrintsErrorCode, message: string, options: { details?: unknown; cause?: unknown } = {}) {
    super(message);
    this.name = 'HundredPrintsError';
    this.code = code;
    this.details = options.details;
    this.cause = options.cause;
  }
}

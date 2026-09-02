import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_BYTES = 2 * 1024 * 1024;

export interface LoggerOptions {
  /** mirror lines to stdout/stderr (development); the packaged app writes only to the file */
  console?: boolean;
}

export class Logger {
  private readonly toConsole: boolean;

  constructor(
    public readonly file: string,
    options: LoggerOptions = {},
  ) {
    this.toConsole = options.console ?? true;
    mkdirSync(dirname(file), { recursive: true });
  }

  private write(level: string, msg: string, args: unknown[]): void {
    const extra = args.length
      ? ' ' +
        args
          .map((a) => {
            if (a instanceof Error) return `${a.name}: ${a.message}`;
            if (typeof a === 'string') return a;
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          })
          .join(' ')
      : '';
    const line = `${new Date().toISOString()} [${level}] ${msg}${extra}\n`;
    if (this.toConsole) {
      if (level === 'ERROR') console.error(line.trimEnd());
      else console.log(line.trimEnd());
    }
    try {
      if (existsSync(this.file) && statSync(this.file).size > MAX_BYTES)
        renameSync(this.file, `${this.file}.1`);
      appendFileSync(this.file, line);
    } catch {
      // never crash because of logging
    }
  }

  info(msg: string, ...args: unknown[]): void {
    this.write('INFO', msg, args);
  }
  warn(msg: string, ...args: unknown[]): void {
    this.write('WARN', msg, args);
  }
  error(msg: string, ...args: unknown[]): void {
    this.write('ERROR', msg, args);
  }
}

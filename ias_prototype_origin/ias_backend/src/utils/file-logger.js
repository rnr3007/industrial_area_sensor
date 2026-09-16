import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// Defensive: works out which env vars apply even if this module happens to
// load before config/index.js does. dotenv never overwrites an already-set var.
dotenv.config();

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const streams = {
  info: fs.createWriteStream(path.join(LOG_DIR, 'info.txt'), { flags: 'a' }),
  error: fs.createWriteStream(path.join(LOG_DIR, 'error.txt'), { flags: 'a' })
};

/** Appends one line to logs/<file>.txt (file is 'info' or 'error'). */
export function writeLog(file, line) {
  streams[file]?.write(line + '\n');
}

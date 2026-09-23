import { writeLog } from './file-logger.js';

const stamp = () => new Date().toISOString();

const write = (level, args) => {
  const line = args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  const formatted = `${stamp()} [${level}] ${line}`;
  process.stdout.write(`${formatted}\n`);

  if (level === 'error') writeLog('error', formatted);
  else if (level === 'info' || level === 'warn') writeLog('info', formatted);
};

const logger = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
  debug: (...args) => {
    if (process.env.LOG_LEVEL === 'debug') write('debug', args);
  }
};

export default logger;

export interface LogItem {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

const logs: LogItem[] = [];
let listeners: Array<(logs: LogItem[]) => void> = [];

function getTimestamp(): string {
  return new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(/\//g, '-');
}

function addLog(level: LogItem['level'], message: string) {
  const log: LogItem = {
    timestamp: getTimestamp(),
    level,
    message,
  };
  logs.push(log);
  if (logs.length > 500) {
    logs.shift();
  }
  listeners.forEach((listener) => listener([...logs]));
  if (level === 'error' || level === 'warn') {
    console[level](`[${log.timestamp}] ${message}`);
  }
}

export const logger = {
  info: (message: string) => addLog('info', message),
  warn: (message: string) => addLog('warn', message),
  error: (message: string) => addLog('error', message),
  debug: (message: string) => addLog('debug', message),
  getLogs: () => [...logs],
  subscribe: (listener: (logs: LogItem[]) => void) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
  clear: () => {
    logs.length = 0;
    listeners.forEach((listener) => listener([...logs]));
  },
};

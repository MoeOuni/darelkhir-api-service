export interface Logger {
  info(message: string, data?: Record<string, any>): void;
  success(message: string, data?: Record<string, any>): void;
  error(message: string, error?: Error | any): void;
  warn(message: string, data?: Record<string, any>): void;
}

export function createLogger(traceId: string, functionName: string): Logger {
  const base = { traceId, functionName };

  return {
    info: (message, data = {}) =>
      console.log(
        JSON.stringify({ level: 'INFO', emoji: '🚀', message, ...base, ...data })
      ),

    success: (message, data = {}) =>
      console.log(
        JSON.stringify({ level: 'SUCCESS', emoji: '✅', message, ...base, ...data })
      ),

    error: (message, error) =>
      console.error(
        JSON.stringify({
          level: 'ERROR',
          emoji: '❌',
          message,
          ...base,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : error,
        })
      ),

    warn: (message, data = {}) =>
      console.warn(
        JSON.stringify({ level: 'WARN', emoji: '⚠️', message, ...base, ...data })
      ),
  };
}

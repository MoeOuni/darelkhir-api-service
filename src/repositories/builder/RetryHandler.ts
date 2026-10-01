export class RetryHandler {
  static async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (error: any) {
        const isThrottle =
          error.name === 'ProvisionedThroughputExceededException' ||
          error.name === 'RequestLimitExceeded' ||
          error.name === 'ThrottlingException';

        if (isThrottle && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 100; // 100ms, 200ms, 400ms
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempt++;
        } else {
          throw error;
        }
      }
    }
  }
}

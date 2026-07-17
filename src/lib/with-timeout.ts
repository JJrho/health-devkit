/** 逾時包裝（KB-022）：逾時視同失敗，不讓單一工作卡死呼叫端 */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`逾時（${ms}ms）`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

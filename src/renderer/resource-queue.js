/** Limit concurrent resource reads while preserving the order they were queued. */
export class ResourceQueue {
  #concurrency;
  #active = 0;
  #waiting = [];
  #disposed = false;
  #disposeReason;

  constructor(concurrency = 2) {
    if (!Number.isInteger(concurrency) || concurrency < 1)
      throw new RangeError("Resource concurrency must be a positive integer.");
    this.#concurrency = concurrency;
  }

  run(task) {
    if (typeof task !== "function")
      return Promise.reject(new TypeError("A resource task must be a function."));
    if (this.#disposed) return Promise.reject(this.#disposeReason);
    return new Promise((resolve, reject) => {
      this.#waiting.push({ task, resolve, reject });
      this.#drain();
    });
  }

  dispose(reason = new Error("Resource queue is disposed.")) {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#disposeReason = reason;
    const waiting = this.#waiting;
    this.#waiting = [];
    for (const job of waiting) job.reject(reason);
    // Running tasks retain their result. Their caller owns the AbortSignal.
  }

  #drain() {
    while (!this.#disposed && this.#active < this.#concurrency) {
      const job = this.#waiting.shift();
      if (!job) return;
      this.#active++;
      let work;
      try {
        // Start immediately so disposal can distinguish running and waiting jobs.
        work = job.task();
      } catch (error) {
        this.#active--;
        job.reject(error);
        continue;
      }
      Promise.resolve(work).then(
        (value) => {
          this.#active--;
          job.resolve(value);
          this.#drain();
        },
        (error) => {
          this.#active--;
          job.reject(error);
          this.#drain();
        },
      );
    }
  }
}

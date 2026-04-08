const startTime = Date.now();

interface HttpMetricKey {
  method: string;
  route: string;
  statusCode: number;
}

interface JobMetricKey {
  queue: string;
  status: 'success' | 'failure';
}

interface DurationBucket {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

function serializeHttpKey(key: HttpMetricKey): string {
  return `${key.method}|${key.route}|${key.statusCode}`;
}

function serializeJobKey(key: JobMetricKey): string {
  return `${key.queue}|${key.status}`;
}

function serializeDurationKey(method: string, route: string): string {
  return `${method}|${route}`;
}

function serializeJobDurationKey(queue: string): string {
  return queue;
}

function newDurationBucket(): DurationBucket {
  return { count: 0, totalMs: 0, minMs: Infinity, maxMs: 0 };
}

function recordDuration(bucket: DurationBucket, durationMs: number): void {
  bucket.count += 1;
  bucket.totalMs += durationMs;
  if (durationMs < bucket.minMs) bucket.minMs = durationMs;
  if (durationMs > bucket.maxMs) bucket.maxMs = durationMs;
}

export class MetricsCollector {
  private httpRequestCounts = new Map<string, number>();
  private httpDurations = new Map<string, DurationBucket>();
  private activeRequests = 0;
  private jobCounts = new Map<string, number>();
  private jobDurations = new Map<string, DurationBucket>();
  private jwtPreviousKeyDaysRemaining: number | null = null;
  private jwtGaugeProvider: (() => number | null) | null = null;
  private geocodingFailedCount = 0;
  private notificationHandlerErrorCount = 0;
  private notificationMissingVariableCount = 0;

  /** Register a function that returns the current JWT previous key days remaining. Called on each snapshot. */
  setJwtGaugeProvider(provider: () => number | null): void {
    this.jwtGaugeProvider = provider;
  }

  /** Update the cached count of properties in FAILED geocoding status. */
  setGeocodingFailedCount(count: number): void {
    this.geocodingFailedCount = count;
  }

  /** Increment the notification handler error counter. */
  incrementNotificationHandlerErrorCount(): void {
    this.notificationHandlerErrorCount += 1;
  }

  /** Increment the count of missing template variable occurrences. */
  incrementMissingVariableCount(count: number = 1): void {
    this.notificationMissingVariableCount += count;
  }

  httpRequestStart(): () => number {
    this.activeRequests += 1;
    const start = performance.now();
    return () => {
      const durationMs = performance.now() - start;
      return durationMs;
    };
  }

  httpRequestEnd(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number,
  ): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    // Increment request count
    const countKey = serializeHttpKey({ method, route, statusCode });
    this.httpRequestCounts.set(
      countKey,
      (this.httpRequestCounts.get(countKey) ?? 0) + 1,
    );

    // Record duration
    const durationKey = serializeDurationKey(method, route);
    if (!this.httpDurations.has(durationKey)) {
      this.httpDurations.set(durationKey, newDurationBucket());
    }
    recordDuration(this.httpDurations.get(durationKey)!, durationMs);
  }

  jobExecuted(queue: string, status: 'success' | 'failure', durationMs: number): void {
    // Increment job count
    const countKey = serializeJobKey({ queue, status });
    this.jobCounts.set(countKey, (this.jobCounts.get(countKey) ?? 0) + 1);

    // Record job duration
    const durationKey = serializeJobDurationKey(queue);
    if (!this.jobDurations.has(durationKey)) {
      this.jobDurations.set(durationKey, newDurationBucket());
    }
    recordDuration(this.jobDurations.get(durationKey)!, durationMs);
  }

  reset(): void {
    this.httpRequestCounts.clear();
    this.httpDurations.clear();
    this.activeRequests = 0;
    this.jobCounts.clear();
    this.jobDurations.clear();
    this.notificationHandlerErrorCount = 0;
    this.notificationMissingVariableCount = 0;
  }

  getSnapshot(): MetricsSnapshot {
    const httpRequests: HttpRequestMetric[] = [];
    for (const [key, count] of this.httpRequestCounts) {
      const [method, route, statusCode] = key.split('|');
      httpRequests.push({
        method: method!,
        route: route!,
        statusCode: Number(statusCode),
        count,
      });
    }

    const httpDurations: HttpDurationMetric[] = [];
    for (const [key, bucket] of this.httpDurations) {
      const [method, route] = key.split('|');
      httpDurations.push({
        method: method!,
        route: route!,
        count: bucket.count,
        totalMs: Math.round(bucket.totalMs * 100) / 100,
        avgMs: Math.round((bucket.totalMs / bucket.count) * 100) / 100,
        minMs: bucket.minMs === Infinity ? 0 : Math.round(bucket.minMs * 100) / 100,
        maxMs: Math.round(bucket.maxMs * 100) / 100,
      });
    }

    const jobs: JobMetric[] = [];
    for (const [key, count] of this.jobCounts) {
      const [queue, status] = key.split('|');
      jobs.push({
        queue: queue!,
        status: status as 'success' | 'failure',
        count,
      });
    }

    const jobDurations: JobDurationMetric[] = [];
    for (const [key, bucket] of this.jobDurations) {
      jobDurations.push({
        queue: key,
        count: bucket.count,
        totalMs: Math.round(bucket.totalMs * 100) / 100,
        avgMs: Math.round((bucket.totalMs / bucket.count) * 100) / 100,
        minMs: bucket.minMs === Infinity ? 0 : Math.round(bucket.minMs * 100) / 100,
        maxMs: Math.round(bucket.maxMs * 100) / 100,
      });
    }

    const memoryUsage = process.memoryUsage();

    return {
      uptimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      process: {
        memoryRss: memoryUsage.rss,
        memoryHeapUsed: memoryUsage.heapUsed,
        memoryHeapTotal: memoryUsage.heapTotal,
        memoryExternal: memoryUsage.external,
      },
      http: {
        activeRequests: this.activeRequests,
        requests: httpRequests,
        durations: httpDurations,
      },
      jobs: {
        executions: jobs,
        durations: jobDurations,
      },
      jwt: {
        previousKeyDaysRemaining: this.jwtGaugeProvider ? this.jwtGaugeProvider() : this.jwtPreviousKeyDaysRemaining,
      },
      geocoding: {
        failedCount: this.geocodingFailedCount,
      },
      notification: {
        handlerErrorCount: this.notificationHandlerErrorCount,
        missingVariableCount: this.notificationMissingVariableCount,
      },
    };
  }
}

export interface HttpRequestMetric {
  method: string;
  route: string;
  statusCode: number;
  count: number;
}

export interface HttpDurationMetric {
  method: string;
  route: string;
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

export interface JobMetric {
  queue: string;
  status: 'success' | 'failure';
  count: number;
}

export interface JobDurationMetric {
  queue: string;
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

export interface MetricsSnapshot {
  uptimeMs: number;
  timestamp: string;
  process: {
    memoryRss: number;
    memoryHeapUsed: number;
    memoryHeapTotal: number;
    memoryExternal: number;
  };
  http: {
    activeRequests: number;
    requests: HttpRequestMetric[];
    durations: HttpDurationMetric[];
  };
  jobs: {
    executions: JobMetric[];
    durations: JobDurationMetric[];
  };
  jwt?: {
    previousKeyDaysRemaining: number | null;
  };
  geocoding?: {
    failedCount: number;
  };
  notification?: {
    handlerErrorCount: number;
    missingVariableCount: number;
  };
}

export const metrics = new MetricsCollector();

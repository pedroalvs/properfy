import { describe, it, expect, beforeEach, vi } from 'vitest';

let metricsModule: typeof import('../../src/shared/infrastructure/metrics');

describe('MetricsCollector', () => {
  beforeEach(async () => {
    metricsModule = await import('../../src/shared/infrastructure/metrics');
    metricsModule.metrics.reset();
  });

  it('returns a valid snapshot with empty metrics', () => {
    const snapshot = metricsModule.metrics.getSnapshot();

    expect(snapshot).toHaveProperty('uptimeMs');
    expect(snapshot).toHaveProperty('timestamp');
    expect(snapshot).toHaveProperty('process');
    expect(snapshot.process).toHaveProperty('memoryRss');
    expect(snapshot.process).toHaveProperty('memoryHeapUsed');
    expect(snapshot.process).toHaveProperty('memoryHeapTotal');
    expect(snapshot.process).toHaveProperty('memoryExternal');
    expect(snapshot).toHaveProperty('http');
    expect(snapshot.http).toHaveProperty('activeRequests');
    expect(snapshot.http).toHaveProperty('requests');
    expect(snapshot.http).toHaveProperty('durations');
    expect(snapshot).toHaveProperty('jobs');
    expect(snapshot.jobs).toHaveProperty('executions');
    expect(snapshot.jobs).toHaveProperty('durations');
    expect(snapshot.uptimeMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.process.memoryRss).toBeGreaterThan(0);
  });

  it('tracks HTTP request count by method, route, and status code', () => {
    const { metrics } = metricsModule;

    metrics.httpRequestEnd('GET', '/v1/users', 200, 50);
    metrics.httpRequestEnd('GET', '/v1/users', 200, 30);
    metrics.httpRequestEnd('POST', '/v1/users', 201, 100);
    metrics.httpRequestEnd('GET', '/v1/users', 404, 10);

    const snapshot = metrics.getSnapshot();
    const get200 = snapshot.http.requests.find(
      (r) => r.method === 'GET' && r.route === '/v1/users' && r.statusCode === 200,
    );
    expect(get200).toBeDefined();
    expect(get200!.count).toBe(2);

    const post201 = snapshot.http.requests.find(
      (r) => r.method === 'POST' && r.route === '/v1/users' && r.statusCode === 201,
    );
    expect(post201).toBeDefined();
    expect(post201!.count).toBe(1);

    const get404 = snapshot.http.requests.find(
      (r) => r.method === 'GET' && r.route === '/v1/users' && r.statusCode === 404,
    );
    expect(get404).toBeDefined();
    expect(get404!.count).toBe(1);
  });

  it('tracks HTTP request duration histogram', () => {
    const { metrics } = metricsModule;

    metrics.httpRequestEnd('GET', '/v1/properties', 200, 10);
    metrics.httpRequestEnd('GET', '/v1/properties', 200, 30);
    metrics.httpRequestEnd('GET', '/v1/properties', 200, 20);

    const snapshot = metrics.getSnapshot();
    const duration = snapshot.http.durations.find(
      (d) => d.method === 'GET' && d.route === '/v1/properties',
    );

    expect(duration).toBeDefined();
    expect(duration!.count).toBe(3);
    expect(duration!.minMs).toBe(10);
    expect(duration!.maxMs).toBe(30);
    expect(duration!.avgMs).toBe(20);
    expect(duration!.totalMs).toBe(60);
  });

  it('tracks active request gauge via httpRequestStart', () => {
    const { metrics } = metricsModule;

    const timer1 = metrics.httpRequestStart();
    const timer2 = metrics.httpRequestStart();

    // Two active requests
    let snapshot = metrics.getSnapshot();
    expect(snapshot.http.activeRequests).toBe(2);

    // Complete one
    const duration1 = timer1();
    metrics.httpRequestEnd('GET', '/v1/test', 200, duration1);

    snapshot = metrics.getSnapshot();
    expect(snapshot.http.activeRequests).toBe(1);

    // Complete second
    const duration2 = timer2();
    metrics.httpRequestEnd('GET', '/v1/test', 200, duration2);

    snapshot = metrics.getSnapshot();
    expect(snapshot.http.activeRequests).toBe(0);
  });

  it('tracks job execution count by queue and status', () => {
    const { metrics } = metricsModule;

    metrics.jobExecuted('notification.send', 'success', 150);
    metrics.jobExecuted('notification.send', 'success', 200);
    metrics.jobExecuted('notification.send', 'failure', 50);
    metrics.jobExecuted('report.generate', 'success', 1000);

    const snapshot = metrics.getSnapshot();
    const notifSuccess = snapshot.jobs.executions.find(
      (j) => j.queue === 'notification.send' && j.status === 'success',
    );
    expect(notifSuccess).toBeDefined();
    expect(notifSuccess!.count).toBe(2);

    const notifFailure = snapshot.jobs.executions.find(
      (j) => j.queue === 'notification.send' && j.status === 'failure',
    );
    expect(notifFailure).toBeDefined();
    expect(notifFailure!.count).toBe(1);

    const reportSuccess = snapshot.jobs.executions.find(
      (j) => j.queue === 'report.generate' && j.status === 'success',
    );
    expect(reportSuccess).toBeDefined();
    expect(reportSuccess!.count).toBe(1);
  });

  it('tracks job execution duration by queue', () => {
    const { metrics } = metricsModule;

    metrics.jobExecuted('report.generate', 'success', 100);
    metrics.jobExecuted('report.generate', 'success', 300);
    metrics.jobExecuted('report.generate', 'failure', 200);

    const snapshot = metrics.getSnapshot();
    const duration = snapshot.jobs.durations.find(
      (d) => d.queue === 'report.generate',
    );

    expect(duration).toBeDefined();
    expect(duration!.count).toBe(3);
    expect(duration!.minMs).toBe(100);
    expect(duration!.maxMs).toBe(300);
    expect(duration!.avgMs).toBe(200);
    expect(duration!.totalMs).toBe(600);
  });

  it('httpRequestStart returns a timer that measures elapsed time', () => {
    const { metrics } = metricsModule;
    const timer = metrics.httpRequestStart();

    // Small busy-wait to ensure some time passes
    const start = performance.now();
    while (performance.now() - start < 5) {
      // wait at least 5ms
    }

    const durationMs = timer();
    expect(durationMs).toBeGreaterThanOrEqual(4); // allow small margin
  });

  it('active requests never goes below zero', () => {
    const { metrics } = metricsModule;

    // Call httpRequestEnd without a matching start
    metrics.httpRequestEnd('GET', '/v1/test', 200, 10);

    const snapshot = metrics.getSnapshot();
    expect(snapshot.http.activeRequests).toBe(0);
  });
});

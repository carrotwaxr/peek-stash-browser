import { expect } from "vitest";

export interface BenchmarkResult {
  name: string;
  iterations: number;
  avg: number;
  min: number;
  max: number;
  p95: number;
  status: "PASS" | "SLOW" | "FAIL";
}

export interface BenchmarkOptions {
  /** Number of warmup requests (default: 1) */
  warmup?: number;
  /** Number of timed iterations (default: 5) */
  iterations?: number;
  /** Threshold for PASS in ms (default: 500) */
  passThreshold?: number;
  /** Threshold for SLOW in ms (default: 1000) */
  slowThreshold?: number;
}

const DEFAULT_OPTIONS: Required<BenchmarkOptions> = {
  warmup: 1,
  iterations: 5,
  passThreshold: 500,
  slowThreshold: 1000,
};

/**
 * Measure an async operation's response time over multiple iterations.
 *
 * Runs warmup requests (not timed), then N timed iterations.
 * Computes avg/min/max/p95 and classifies as PASS/SLOW/FAIL.
 */
export async function measureEndpoint(
  name: string,
  fn: () => Promise<void>,
  options?: BenchmarkOptions
): Promise<BenchmarkResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Warmup
  for (let i = 0; i < opts.warmup; i++) {
    await fn();
  }

  // Timed iterations
  const times: number[] = [];
  for (let i = 0; i < opts.iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);

  const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
  const min = times[0];
  const max = times[times.length - 1];
  const p95Index = Math.ceil(times.length * 0.95) - 1;
  const p95 = times[p95Index];

  let status: BenchmarkResult["status"];
  if (avg <= opts.passThreshold) {
    status = "PASS";
  } else if (avg <= opts.slowThreshold) {
    status = "SLOW";
  } else {
    status = "FAIL";
  }

  const result: BenchmarkResult = {
    name,
    iterations: opts.iterations,
    avg: Math.round(avg),
    min: Math.round(min),
    max: Math.round(max),
    p95: Math.round(p95),
    status,
  };

  // Log in a parseable format
  const statusIcon = status === "PASS" ? "✓" : status === "SLOW" ? "⚠" : "✗";
  console.log(
    `  ${statusIcon} ${name}: avg=${result.avg}ms min=${result.min}ms max=${result.max}ms p95=${result.p95}ms [${status}]`
  );

  return result;
}

/**
 * Assert that a benchmark result meets its threshold.
 * Use in vitest test blocks to fail on FAIL status.
 */
export function assertBenchmark(result: BenchmarkResult): void {
  expect(
    result.status,
    `${result.name}: avg ${result.avg}ms exceeds FAIL threshold`
  ).not.toBe("FAIL");
}

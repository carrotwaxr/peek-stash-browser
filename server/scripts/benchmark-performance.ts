/**
 * Performance Benchmark Script
 *
 * Tests response times for common API endpoints to establish baselines
 * and track performance improvements.
 *
 * Usage: npx ts-node scripts/benchmark-performance.ts
 *
 * Target: All operations should complete in <500ms for sub-second page loads
 */

import { performance } from "perf_hooks";

const BASE_URL = process.env.PEEK_URL || "http://localhost:8000";

interface BenchmarkResult {
  name: string;
  endpoint: string;
  method: string;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
  iterations: number;
  status: "PASS" | "FAIL" | "SLOW";
}

const TARGET_MS = 500; // Target response time
const SLOW_MS = 1000; // Anything above this is unacceptable

async function fetchWithTiming(
  url: string,
  options: RequestInit = {}
): Promise<{ ms: number; status: number; ok: boolean }> {
  const start = performance.now();
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    const ms = performance.now() - start;
    return { ms, status: response.status, ok: response.ok };
  } catch {
    const ms = performance.now() - start;
    return { ms, status: 0, ok: false };
  }
}

async function runBenchmark(
  name: string,
  endpoint: string,
  method: string = "GET",
  body?: object,
  iterations: number = 5
): Promise<BenchmarkResult> {
  const times: number[] = [];
  const url = `${BASE_URL}${endpoint}`;

  // Warm up request (don't count)
  await fetchWithTiming(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Actual benchmark runs
  for (let i = 0; i < iterations; i++) {
    const result = await fetchWithTiming(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    });
    times.push(result.ms);

    // Small delay between requests
    await new Promise((r) => setTimeout(r, 100));
  }

  const sorted = [...times].sort((a, b) => a - b);
  const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
  const minMs = sorted[0];
  const maxMs = sorted[sorted.length - 1];
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95Ms = sorted[p95Index] || maxMs;

  let status: "PASS" | "FAIL" | "SLOW";
  if (avgMs <= TARGET_MS) {
    status = "PASS";
  } else if (avgMs <= SLOW_MS) {
    status = "SLOW";
  } else {
    status = "FAIL";
  }

  return {
    name,
    endpoint,
    method,
    avgMs: Math.round(avgMs),
    minMs: Math.round(minMs),
    maxMs: Math.round(maxMs),
    p95Ms: Math.round(p95Ms),
    iterations,
    status,
  };
}

// Unused helper - kept for future authentication benchmarks
// async function loginAndGetCookie(): Promise<string | null> {
//   const response = await fetch(`${BASE_URL}/api/auth/login`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ username: "admin", password: "admin" }),
//   });
//   const setCookie = response.headers.get("set-cookie");
//   return setCookie;
// }

async function main() {
  console.log("=".repeat(70));
  console.log("Peek Performance Benchmark");
  console.log(`Target: ${BASE_URL}`);
  console.log(`Target Response Time: <${TARGET_MS}ms`);
  console.log("=".repeat(70));
  console.log();

  // Check if server is up
  try {
    const health = await fetch(`${BASE_URL}/api/health`);
    if (!health.ok) {
      console.error("Server health check failed. Is the server running?");
      process.exit(1);
    }
  } catch {
    console.error(`Cannot connect to ${BASE_URL}. Is the server running?`);
    process.exit(1);
  }

  const results: BenchmarkResult[] = [];

  // === Scene Browsing Tests ===
  console.log("Testing Scene Browsing...");

  results.push(
    await runBenchmark(
      "Scenes List (page 1, 24 items)",
      "/api/library/scenes?page=1&perPage=24&sort=created_at&sortDirection=DESC"
    )
  );

  results.push(
    await runBenchmark(
      "Scenes List (page 2)",
      "/api/library/scenes?page=2&perPage=24&sort=created_at&sortDirection=DESC"
    )
  );

  results.push(
    await runBenchmark(
      "Scenes List (random sort)",
      "/api/library/scenes?page=1&perPage=24&sort=random&sortDirection=ASC"
    )
  );

  results.push(
    await runBenchmark(
      "Scenes with filter (has performers)",
      "/api/library/scenes?page=1&perPage=24&sort=created_at&sortDirection=DESC&hasPerformers=true"
    )
  );

  // === Entity List Tests ===
  console.log("Testing Entity Lists...");

  results.push(
    await runBenchmark(
      "Performers List (all)",
      "/api/library/performers"
    )
  );

  results.push(
    await runBenchmark(
      "Studios List (all)",
      "/api/library/studios"
    )
  );

  results.push(
    await runBenchmark(
      "Tags List (all)",
      "/api/library/tags"
    )
  );

  // === Detail Page Tests ===
  console.log("Testing Detail Pages...");

  // Get a scene ID from the first page
  const scenesResponse = await fetch(
    `${BASE_URL}/api/library/scenes?page=1&perPage=1`
  );
  const scenesData = await scenesResponse.json();
  const sceneId = scenesData?.scenes?.[0]?.id;

  if (sceneId) {
    results.push(
      await runBenchmark(
        "Scene Detail",
        `/api/library/scenes/${sceneId}`
      )
    );
  }

  // Get a performer ID
  const performersResponse = await fetch(`${BASE_URL}/api/library/performers`);
  const performersData = await performersResponse.json();
  const performerId = performersData?.performers?.[0]?.id;

  if (performerId) {
    results.push(
      await runBenchmark(
        "Performer Detail",
        `/api/library/performers/${performerId}`
      )
    );

    results.push(
      await runBenchmark(
        "Performer Scenes",
        `/api/library/scenes?performerId=${performerId}&page=1&perPage=24`
      )
    );
  }

  // === Carousel Tests ===
  console.log("Testing Carousels...");

  results.push(
    await runBenchmark(
      "Home Page Carousels",
      "/api/carousel/home"
    )
  );

  // === Search Tests ===
  console.log("Testing Search...");

  results.push(
    await runBenchmark(
      "Scene Search (title)",
      "/api/library/scenes?page=1&perPage=24&q=test"
    )
  );

  // === Print Results ===
  console.log();
  console.log("=".repeat(70));
  console.log("RESULTS");
  console.log("=".repeat(70));
  console.log();

  const passCount = results.filter((r) => r.status === "PASS").length;
  const slowCount = results.filter((r) => r.status === "SLOW").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;

  for (const result of results) {
    const statusIcon =
      result.status === "PASS" ? "✓" : result.status === "SLOW" ? "⚠" : "✗";
    const statusColor =
      result.status === "PASS" ? "\x1b[32m" : result.status === "SLOW" ? "\x1b[33m" : "\x1b[31m";
    const reset = "\x1b[0m";

    console.log(
      `${statusColor}${statusIcon}${reset} ${result.name}`
    );
    console.log(
      `   avg: ${result.avgMs}ms | min: ${result.minMs}ms | max: ${result.maxMs}ms | p95: ${result.p95Ms}ms`
    );
  }

  console.log();
  console.log("=".repeat(70));
  console.log(`Summary: ${passCount} PASS | ${slowCount} SLOW | ${failCount} FAIL`);
  console.log("=".repeat(70));

  // Exit with error code if any tests failed
  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(console.error);

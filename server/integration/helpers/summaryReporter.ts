import type { Reporter, File, Task } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESULTS_DIR = path.resolve(__dirname, "../results");

interface FailureDetail {
  file: string;
  test: string;
  error: string;
}

interface TestSummary {
  timestamp: string;
  duration_ms: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  success: boolean;
  failures: FailureDetail[];
}

function collectTests(task: Task): { passed: number; failed: number; skipped: number; failures: FailureDetail[] } {
  const result = { passed: 0, failed: 0, skipped: 0, failures: [] as FailureDetail[] };

  if (task.type === "suite") {
    for (const child of task.tasks) {
      const childResult = collectTests(child);
      result.passed += childResult.passed;
      result.failed += childResult.failed;
      result.skipped += childResult.skipped;
      result.failures.push(...childResult.failures);
    }
  } else if (task.type === "test") {
    const state = task.result?.state;
    if (state === "pass") {
      result.passed++;
    } else if (state === "fail") {
      result.failed++;
      const errorMessage = task.result?.errors?.[0]?.message ?? "Unknown error";
      result.failures.push({
        file: task.file?.name ?? "unknown",
        test: task.name,
        error: errorMessage.slice(0, 500),
      });
    } else {
      result.skipped++;
    }
  }

  return result;
}

export default class SummaryReporter implements Reporter {
  private startTime = 0;

  onInit() {
    this.startTime = Date.now();
  }

  onFinished(files?: File[]) {
    const duration_ms = Date.now() - this.startTime;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const failures: FailureDetail[] = [];

    for (const file of files ?? []) {
      for (const task of file.tasks) {
        const result = collectTests(task);
        passed += result.passed;
        failed += result.failed;
        skipped += result.skipped;
        failures.push(...result.failures);
      }
    }

    const total = passed + failed + skipped;

    const summary: TestSummary = {
      timestamp: new Date().toISOString(),
      duration_ms,
      total,
      passed,
      failed,
      skipped,
      success: failed === 0,
      failures,
    };

    fs.mkdirSync(RESULTS_DIR, { recursive: true });

    // Write latest summary (overwritten each run — agent reads this)
    const summaryPath = path.join(RESULTS_DIR, "summary.json");
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    // Write timestamped copy for history
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const historyPath = path.join(RESULTS_DIR, `summary-${ts}.json`);
    fs.writeFileSync(historyPath, JSON.stringify(summary, null, 2));

    // Print one-line summary to console for background task output
    const status = summary.success ? "PASS" : "FAIL";
    console.log(
      `\n[Integration Tests] ${status}: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped (${(duration_ms / 1000).toFixed(1)}s)`
    );
    console.log(`[Integration Tests] Summary written to ${summaryPath}`);
  }
}

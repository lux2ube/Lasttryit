import { storage } from "./storage";

interface ProcessorStats {
  totalRuns: number;
  totalProcessed: number;
  totalSucceeded: number;
  totalFailed: number;
  lastRunAt: Date | null;
  lastRunResult: { processed: number; succeeded: number; failed: number } | null;
  nextRunAt: Date | null;
  isRunning: boolean;
}

const stats: ProcessorStats = {
  totalRuns: 0,
  totalProcessed: 0,
  totalSucceeded: 0,
  totalFailed: 0,
  lastRunAt: null,
  lastRunResult: null,
  nextRunAt: null,
  isRunning: false,
};

let processInterval: ReturnType<typeof setInterval> | null = null;
let intervalMs = 60_000;

async function runProcessor() {
  if (stats.isRunning) return;
  stats.isRunning = true;
  try {
    const result = await storage.processAllPendingSmsInbox();
    stats.totalRuns++;
    stats.totalProcessed += result.processed;
    stats.totalSucceeded += result.succeeded;
    stats.totalFailed += result.failed;
    stats.lastRunAt = new Date();
    stats.lastRunResult = result;
    stats.nextRunAt = new Date(Date.now() + intervalMs);

    if (result.processed > 0) {
      console.log(
        `[SMS Processor] ✓ ${result.processed} processed — ${result.succeeded} succeeded, ${result.failed} failed`,
      );
    }
  } catch (err: any) {
    console.error(`[SMS Processor] Error: ${err.message}`);
  } finally {
    stats.isRunning = false;
  }
}

export function startSmsProcessor(intervalMsParam = 60_000) {
  if (processInterval) return;
  intervalMs = intervalMsParam;
  stats.nextRunAt = new Date(Date.now() + 5_000);

  console.log(`[SMS Processor] Started — checking for pending SMS every ${intervalMs / 1000}s`);

  // First run after 5s (let server finish starting up)
  setTimeout(() => {
    runProcessor();
    processInterval = setInterval(runProcessor, intervalMs);
  }, 5_000);
}

export function stopSmsProcessor() {
  if (processInterval) {
    clearInterval(processInterval);
    processInterval = null;
  }
}

export function getSmsProcessorStats(): ProcessorStats & { uptimeSeconds: number } {
  return {
    ...stats,
    uptimeSeconds: processInterval ? Math.floor(stats.totalRuns * (intervalMs / 1000)) : 0,
  };
}

export async function triggerSmsProcessorNow(): Promise<{ processed: number; succeeded: number; failed: number }> {
  if (stats.isRunning) {
    return stats.lastRunResult ?? { processed: 0, succeeded: 0, failed: 0 };
  }
  await runProcessor();
  return stats.lastRunResult ?? { processed: 0, succeeded: 0, failed: 0 };
}

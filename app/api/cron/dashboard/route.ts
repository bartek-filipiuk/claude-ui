import { NextResponse } from 'next/server';
import { cronScheduler } from '@/lib/cron/scheduler';
import * as jobsStore from '@/lib/cron/jobs-store';
import * as runsStore from '@/lib/cron/runs-store';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const [jobs, failures] = await Promise.all([jobsStore.readAll(), runsStore.listRecentFailures(5)]);
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const upcoming = cronScheduler.listNextRuns(5).map((n) => {
    const job = byId.get(n.jobId);
    return {
      jobId: n.jobId,
      name: job?.name ?? 'unknown',
      cronExpression: job?.cronExpression ?? '',
      targetCronTag: job?.targetCronTag ?? '',
      nextRun: n.nextRun.toISOString(),
    };
  });
  return NextResponse.json(
    { upcoming, failures },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

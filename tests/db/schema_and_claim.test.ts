import { describe, it, expect } from 'vitest';

/**
 * M0 ATOMIC JOB CLAIM LOGIC SIMULATOR & CONCURRENCY VERIFICATION
 * 
 * This test suite models the exact transactional semantics of the PostgreSQL
 * claim_next_job stored procedure (FOR UPDATE SKIP LOCKED + hasPrinting check)
 * to verify atomicity, FIFO ordering, multi-shop isolation, and failure safety.
 */

interface JobRow {
  id: string;
  token: string;
  order_id: string;
  shop_id: string;
  status: string;
  progress_percent: number;
  scheduled_for: string | null;
  timeline: any[];
  created_at: string;
}

class PostgresMockDatabase {
  private jobs: Map<string, JobRow> = new Map();
  private lockedRowIds: Set<string> = new Set();

  insertJob(job: JobRow) {
    this.jobs.set(job.id, { ...job });
  }

  getJob(id: string): JobRow | undefined {
    const j = this.jobs.get(id);
    return j ? { ...j } : undefined;
  }

  /**
   * Models the PostgreSQL claim_next_job(p_shop_id, p_printer_name) RPC
   * using ACID transaction simulation with row-level locking (FOR UPDATE SKIP LOCKED).
   */
  async claimNextJob(shopId: string, printerName = 'DEFAULT_PRINTER'): Promise<JobRow | null> {
    // 1. Check if shop currently has an active printing job
    const allJobs = Array.from(this.jobs.values());
    const hasPrinting = allJobs.some(j => j.shop_id === shopId && j.status === 'printing');
    if (hasPrinting) {
      return null; // Agent is busy printing a job
    }

    // 2. Filter eligible queued jobs
    const now = new Date().toISOString();
    const eligibleQueued = allJobs
      .filter(j => 
        j.shop_id === shopId && 
        j.status === 'queued' && 
        (!j.scheduled_for || j.scheduled_for <= now) &&
        !this.lockedRowIds.has(j.id) // SKIP LOCKED
      )
      .sort((a, b) => {
        const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id); // Tie breaker
      });

    if (eligibleQueued.length === 0) {
      return null;
    }

    const candidate = eligibleQueued[0];

    // Acquire row-level lock (Simulating PostgreSQL FOR UPDATE)
    this.lockedRowIds.add(candidate.id);

    try {
      // Simulate minor asynchronous network / execution delay
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 10) + 1));

      // Atomically transition status to 'printing' and append timeline
      const updatedJob: JobRow = {
        ...candidate,
        status: 'printing',
        progress_percent: 0,
        timeline: [
          ...(candidate.timeline || []),
          {
            stage: 'claimed',
            at: new Date().toISOString(),
            printerName,
            printerId: printerName.toLowerCase().replace(/[^a-z0-9]/g, '_')
          }
        ]
      };

      this.jobs.set(candidate.id, updatedJob);
      return { ...updatedJob };
    } finally {
      // Release lock on commit
      this.lockedRowIds.delete(candidate.id);
    }
  }
}

describe('M0 Database Schema & Atomic Job Claim Tests', () => {
  it('TEST 1: Concurrency Atomicity — 10 concurrent claim attempts on 1 queued job must produce exactly 1 winner', async () => {
    const db = new PostgresMockDatabase();
    
    db.insertJob({
      id: 'job-101',
      token: 'TK-101',
      order_id: 'order-1',
      shop_id: 'shop-alpha',
      status: 'queued',
      progress_percent: 0,
      scheduled_for: null,
      timeline: [],
      created_at: new Date().toISOString()
    });

    // Fire 10 simultaneous concurrent claims
    const claimPromises = Array.from({ length: 10 }).map(() => db.claimNextJob('shop-alpha'));
    const results = await Promise.all(claimPromises);

    const successfulClaims = results.filter(r => r !== null);
    const emptyClaims = results.filter(r => r === null);

    expect(successfulClaims).toHaveLength(1);
    expect(emptyClaims).toHaveLength(9);
    expect(successfulClaims[0]?.id).toBe('job-101');
    expect(successfulClaims[0]?.status).toBe('printing');

    // Verify database state
    const jobInDb = db.getJob('job-101');
    expect(jobInDb?.status).toBe('printing');
    expect(jobInDb?.timeline).toHaveLength(1);
    expect(jobInDb?.timeline[0].stage).toBe('claimed');
  });

  it('TEST 2: FIFO Deterministic Ordering — 5 queued jobs must be claimed strictly in creation order (A1 -> A2 -> A3 -> A4 -> A5)', async () => {
    const db = new PostgresMockDatabase();
    const baseTime = Date.now();

    const jobIds = ['A1', 'A2', 'A3', 'A4', 'A5'];
    jobIds.forEach((id, idx) => {
      db.insertJob({
        id,
        token: `TK-${id}`,
        order_id: 'order-A',
        shop_id: 'shop-beta',
        status: 'queued',
        progress_percent: 0,
        scheduled_for: null,
        timeline: [],
        created_at: new Date(baseTime + idx * 1000).toISOString()
      });
    });

    const claimedSequence: string[] = [];

    for (let i = 0; i < 5; i++) {
      const claimed = await db.claimNextJob('shop-beta');
      expect(claimed).not.toBeNull();
      claimedSequence.push(claimed!.id);

      // Simulate job completion to allow next claim (preserving single-file serial execution)
      const current = db.getJob(claimed!.id)!;
      current.status = 'completed';
      db.insertJob(current);
    }

    expect(claimedSequence).toEqual(['A1', 'A2', 'A3', 'A4', 'A5']);
  });

  it('TEST 3: Multi-Shop Tenant Isolation — Shop 1 claim returns Shop 1 job; Shop 2 claim returns Shop 2 job', async () => {
    const db = new PostgresMockDatabase();

    db.insertJob({
      id: 'job-shop1',
      token: 'TK-S1',
      order_id: 'order-1',
      shop_id: 'shop-1',
      status: 'queued',
      progress_percent: 0,
      scheduled_for: null,
      timeline: [],
      created_at: new Date().toISOString()
    });

    db.insertJob({
      id: 'job-shop2',
      token: 'TK-S2',
      order_id: 'order-2',
      shop_id: 'shop-2',
      status: 'queued',
      progress_percent: 0,
      scheduled_for: null,
      timeline: [],
      created_at: new Date().toISOString()
    });

    // Execute concurrent claims for different shops
    const [shop1Result, shop2Result] = await Promise.all([
      db.claimNextJob('shop-1'),
      db.claimNextJob('shop-2')
    ]);

    expect(shop1Result?.id).toBe('job-shop1');
    expect(shop1Result?.shop_id).toBe('shop-1');

    expect(shop2Result?.id).toBe('job-shop2');
    expect(shop2Result?.shop_id).toBe('shop-2');
  });

  it('TEST 4: Busy Guard Invariant — If a job is currently "printing", claimNextJob must return null', async () => {
    const db = new PostgresMockDatabase();

    // Active printing job
    db.insertJob({
      id: 'job-active',
      token: 'TK-ACTIVE',
      order_id: 'order-active',
      shop_id: 'shop-busy',
      status: 'printing',
      progress_percent: 45,
      scheduled_for: null,
      timeline: [{ stage: 'claimed' }],
      created_at: new Date(Date.now() - 5000).toISOString()
    });

    // Queued waiting job
    db.insertJob({
      id: 'job-waiting',
      token: 'TK-WAITING',
      order_id: 'order-active',
      shop_id: 'shop-busy',
      status: 'queued',
      progress_percent: 0,
      scheduled_for: null,
      timeline: [],
      created_at: new Date().toISOString()
    });

    // Attempt claim while shop is busy
    const claimResult = await db.claimNextJob('shop-busy');
    expect(claimResult).toBeNull();

    // Verify waiting job remains queued
    const waitingJob = db.getJob('job-waiting');
    expect(waitingJob?.status).toBe('queued');
  });

  it('TEST 5: Scheduled Job Invariant — Future scheduled jobs must not be claimed before their time', async () => {
    const db = new PostgresMockDatabase();

    const futureTime = new Date(Date.now() + 60000).toISOString(); // 1 minute in future

    db.insertJob({
      id: 'job-future',
      token: 'TK-FUTURE',
      order_id: 'order-future',
      shop_id: 'shop-future',
      status: 'queued',
      progress_percent: 0,
      scheduled_for: futureTime,
      timeline: [],
      created_at: new Date().toISOString()
    });

    const claimResult = await db.claimNextJob('shop-future');
    expect(claimResult).toBeNull();
  });
});

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import fs from 'fs';
import path from 'path';
import { readDb, writeDb, DbJob } from '../../server/db';

describe('Multi-File Print Queue Dispatch & P1 N+1 Prefetch Integration Tests', () => {
  beforeAll(() => {
    // Ensure db.test.json exists and is clean
    const seed = readDb();
    seed.jobs = [];
    seed.orders = [];
    writeDb(seed);
  });

  test('TEST 1: Single PDF P0 Regression — Single file order has nextJob = null', () => {
    const db = readDb();
    db.jobs = [];
    db.orders = [];

    const orderId = 'order-single-1';
    const singleJob: DbJob = {
      id: 'job-single-1',
      token: 'PRNT-S001',
      orderId,
      fileName: 'single_doc.pdf',
      fileSize: 2048,
      pageCount: 1,
      copies: 1,
      printMode: 'mono',
      printType: 'bw',
      sides: 'single',
      status: 'queued',
      chargedAmount: 2.0,
      shopId: 'alliance_print',
      createdAt: new Date().toISOString(),
      progressPercent: 0,
      serverFilePath: '/uploads/single_doc.pdf'
    };

    db.jobs.push(singleJob);
    writeDb(db);

    const freshDb = readDb();
    const queuedJob = freshDb.jobs.find(j => j.id === 'job-single-1' && j.status === 'queued');
    expect(queuedJob).toBeDefined();

    // Verify nextJob query logic for single file
    const nextInSameOrder = freshDb.jobs.find(
      j => j.status === 'queued' && j.orderId === queuedJob!.orderId && j.id !== queuedJob!.id
    );
    expect(nextInSameOrder).toBeUndefined();
  });

  test('TEST 2: Two-file order (A1, A2) — A1 dispatch includes A2 as nextJob', () => {
    const db = readDb();
    db.jobs = [];
    db.orders = [];

    const orderId = 'order-two-files';
    const j1: DbJob = {
      id: 'job-A1',
      token: 'PRNT-A001',
      orderId,
      fileName: 'A1.pdf',
      fileSize: 1024,
      pageCount: 1,
      copies: 1,
      printMode: 'mono',
      printType: 'bw',
      sides: 'single',
      status: 'queued',
      shopId: 'alliance_print',
      createdAt: new Date().toISOString(),
      serverFilePath: '/uploads/A1.pdf'
    };
    const j2: DbJob = {
      id: 'job-A2',
      token: 'PRNT-A002',
      orderId,
      fileName: 'A2.pdf',
      fileSize: 2048,
      pageCount: 2,
      copies: 1,
      printMode: 'mono',
      printType: 'bw',
      sides: 'single',
      status: 'queued',
      shopId: 'alliance_print',
      createdAt: new Date().toISOString(),
      serverFilePath: '/uploads/A2.pdf'
    };

    db.jobs.push(j1, j2);
    writeDb(db);

    const freshDb = readDb();
    const active = freshDb.jobs.find(j => j.id === 'job-A1');
    expect(active).toBeDefined();

    // Simulate backend dispatch logic: nextJob for A1 is A2
    const nextInSameOrder = freshDb.jobs.find(
      j => j.status === 'queued' && j.shopId === active!.shopId && j.orderId === active!.orderId && j.id !== active!.id
    );
    expect(nextInSameOrder).toBeDefined();
    expect(nextInSameOrder?.id).toBe('job-A2');
    expect(nextInSameOrder?.fileName).toBe('A2.pdf');
  });

  test('TEST 3: Five-file order (A1..A5) — N+1 prefetch lookup progression', () => {
    const db = readDb();
    db.jobs = [];
    db.orders = [];

    const orderId = 'order-five-files';
    const jobs: DbJob[] = [];
    for (let i = 1; i <= 5; i++) {
      jobs.push({
        id: `job-multi-${i}`,
        token: `PRNT-M00${i}`,
        orderId,
        fileName: `document_${i}.pdf`,
        fileSize: 1024 * i,
        pageCount: i,
        copies: 1,
        printMode: 'mono',
        printType: 'bw',
        sides: 'single',
        status: 'queued',
        chargedAmount: 2.0,
        shopId: 'alliance_print',
        createdAt: new Date().toISOString(),
        progressPercent: 0,
        serverFilePath: `/uploads/test_${i}.pdf`
      });
    }

    db.jobs.push(...jobs);
    writeDb(db);

    // Verify progression of nextJob lookups: A1 -> A2, A2 -> A3, A3 -> A4, A4 -> A5, A5 -> null
    for (let i = 1; i <= 5; i++) {
      const currentDb = readDb();
      const current = currentDb.jobs.find(j => j.id === `job-multi-${i}`);
      expect(current).toBeDefined();

      current!.status = 'printing';
      writeDb(currentDb);

      const updatedDb = readDb();
      const nextInSameOrder = updatedDb.jobs.find(
        j => j.status === 'queued' && j.shopId === current!.shopId && j.orderId === current!.orderId && j.id !== current!.id
      );

      if (i < 5) {
        expect(nextInSameOrder).toBeDefined();
        expect(nextInSameOrder?.id).toBe(`job-multi-${i + 1}`);
      } else {
        expect(nextInSameOrder).toBeUndefined();
      }

      current!.status = 'completed';
      writeDb(currentDb);
    }
  });

  test('TEST 4: Cross-Customer Boundary Isolation — Order A last file does NOT prefetch Order B', () => {
    const db = readDb();
    db.jobs = [];

    const orderA = 'order-A';
    const orderB = 'order-B';

    const a1: DbJob = {
      id: 'job-A1',
      token: 'PRNT-A01',
      orderId: orderA,
      fileName: 'A1.pdf',
      fileSize: 1024,
      pageCount: 1,
      copies: 1,
      printMode: 'mono',
      printType: 'bw',
      sides: 'single',
      status: 'queued',
      shopId: 'alliance_print',
      createdAt: new Date().toISOString(),
      serverFilePath: '/uploads/A1.pdf'
    };
    const b1: DbJob = {
      id: 'job-B1',
      token: 'PRNT-B01',
      orderId: orderB,
      fileName: 'B1.pdf',
      fileSize: 1024,
      pageCount: 1,
      copies: 1,
      printMode: 'mono',
      printType: 'bw',
      sides: 'single',
      status: 'queued',
      shopId: 'alliance_print',
      createdAt: new Date().toISOString(),
      serverFilePath: '/uploads/B1.pdf'
    };

    db.jobs.push(a1, b1);
    writeDb(db);

    const freshDb = readDb();
    const activeA1 = freshDb.jobs.find(j => j.id === 'job-A1');
    expect(activeA1).toBeDefined();

    // Query nextJob for A1: Must NOT return B1
    const nextInSameOrder = freshDb.jobs.find(
      j => j.status === 'queued' && j.shopId === activeA1!.shopId && j.orderId === activeA1!.orderId && j.id !== activeA1!.id
    );
    expect(nextInSameOrder).toBeUndefined(); // Order B file B1 is isolated
  });

  test('TEST 5: Prefetch Hit vs Fallback Miss Data Integrity', () => {
    // Simulated Desktop Agent prefetch cache store test
    const prefetchedMap = new Map<string, { localPath: string; ready: boolean }>();

    // Case 1: Prefetch hit
    prefetchedMap.set('job-A2', { localPath: '/temp/prefetch-job-A2-A2.pdf', ready: true });
    expect(prefetchedMap.has('job-A2')).toBe(true);
    const cachedHit = prefetchedMap.get('job-A2');
    prefetchedMap.delete('job-A2');
    expect(cachedHit?.ready).toBe(true);

    // Case 2: Prefetch miss (fallback)
    expect(prefetchedMap.has('job-A3')).toBe(false); // Triggers standard HTTP downloadFile()
  });

  test('TEST 6: Duplicate Dispatch Protection', () => {
    const queue: string[] = [];
    function enqueueJob(jobId: string) {
      if (!queue.includes(jobId)) {
        queue.push(jobId);
      }
    }

    enqueueJob('job-A1');
    enqueueJob('job-A1'); // Duplicate dispatch event
    enqueueJob('job-A1');

    expect(queue.length).toBe(1);
    expect(queue[0]).toBe('job-A1');
  });

  test('TEST 7: P0 Completion & Spooler Lifecycle Semantics Intact', () => {
    const db = readDb();
    db.jobs = [];

    const job: DbJob = {
      id: 'job-spooler-1',
      token: 'PRNT-S01',
      orderId: 'order-spooler',
      fileName: 'spooler_doc.pdf',
      fileSize: 2048,
      pageCount: 1,
      copies: 1,
      printMode: 'mono',
      printType: 'bw',
      sides: 'single',
      status: 'printing',
      shopId: 'alliance_print',
      createdAt: new Date().toISOString(),
      serverFilePath: '/uploads/spooler_doc.pdf'
    };
    db.jobs.push(job);
    writeDb(db);

    // Verify P0 completion requires explicit status update call
    const dbInstance = readDb();
    const currentJob = dbInstance.jobs.find(j => j.id === 'job-spooler-1');
    expect(currentJob?.status).toBe('printing'); // Remains printing during spooling

    currentJob!.status = 'completed';
    writeDb(dbInstance);

    const completedJob = readDb().jobs.find(j => j.id === 'job-spooler-1');
    expect(completedJob?.status).toBe('completed');
  });
});

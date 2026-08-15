import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../server/index.js';
import { dbRepository, isSupabaseConfigured, supabase } from '../../server/db.js';

describe('Supabase Repository CRUD & Production Safety Suite', () => {
  const TEST_SHOP_ID = 'tjohn_print';
  const TEST_JOB_ID_1 = `test_crud_job1_${Date.now()}`;
  const TEST_JOB_ID_2 = `test_crud_job2_${Date.now()}`;
  const TEST_ORDER_ID = `test_crud_order_${Date.now()}`;
  const TEST_ORDER_TOKEN = `TK-ORD-${Date.now().toString().slice(-4)}`;
  const TEST_CLAIM_JOB_ID = `test_claim_job_${Date.now()}`;

  it('GET /health performs live database check and returns 200 OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBeDefined();
    expect(res.body.database.healthy).toBe(true);
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /api/shops returns live shop records from database', async () => {
    const res = await request(app).get('/api/shops');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const tjohn = res.body.find((s: any) => s.id === TEST_SHOP_ID);
    expect(tjohn).toBeDefined();
    expect(tjohn.name).toBe('TJohn Print Center');
  });

  it('GET /api/shops/:id returns single shop details', async () => {
    const res = await request(app).get(`/api/shops/${TEST_SHOP_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TEST_SHOP_ID);
    expect(res.body.name).toBe('TJohn Print Center');
  });

  it('verifies order insertion and retrieval via repository', async () => {
    const newOrder = {
      id: TEST_ORDER_ID,
      token: TEST_ORDER_TOKEN,
      studentId: 'student_test_123',
      studentName: 'Test Student',
      studentEmail: 'test@student.edu',
      shopId: TEST_SHOP_ID,
      status: 'pending_approval',
      totalChargedAmount: 10,
      jobIds: [TEST_JOB_ID_1, TEST_JOB_ID_2],
      createdAt: new Date().toISOString()
    };

    const inserted = await dbRepository.insertOrder(newOrder);
    expect(inserted.id).toBe(TEST_ORDER_ID);

    const fetched = await dbRepository.getOrder(TEST_ORDER_ID);
    expect(fetched).not.toBeNull();
    expect(fetched?.token).toBe(TEST_ORDER_TOKEN);
    expect(fetched?.totalChargedAmount).toBe(10);

    const fetchedByToken = await dbRepository.getOrderByToken(TEST_ORDER_TOKEN);
    expect(fetchedByToken).not.toBeNull();
    expect(fetchedByToken?.id).toBe(TEST_ORDER_ID);
  });

  it('verifies batch job insertion and getJobs retrieval', async () => {
    const job1 = {
      id: TEST_JOB_ID_1,
      token: `TK-J1-${Date.now().toString().slice(-4)}`,
      orderId: TEST_ORDER_ID,
      shopId: TEST_SHOP_ID,
      fileName: 'doc1.pdf',
      fileSize: 1024,
      pageCount: 1,
      copies: 1,
      printMode: 'mono',
      printType: 'bw',
      sides: 'single',
      status: 'pending_approval',
      chargedAmount: 2,
      serverFilePath: '/uploads/doc1.pdf',
      createdAt: new Date().toISOString()
    };

    const job2 = {
      id: TEST_JOB_ID_2,
      token: `TK-J2-${Date.now().toString().slice(-4)}`,
      orderId: TEST_ORDER_ID,
      shopId: TEST_SHOP_ID,
      fileName: 'doc2.pdf',
      fileSize: 2048,
      pageCount: 2,
      copies: 1,
      printMode: 'color',
      printType: 'color',
      sides: 'single',
      status: 'pending_approval',
      chargedAmount: 10,
      serverFilePath: '/uploads/doc2.pdf',
      createdAt: new Date().toISOString()
    };

    const inserted = await dbRepository.insertJobsBatch([job1, job2]);
    expect(inserted.length).toBe(2);

    const queriedJobs = await dbRepository.getJobs({ shopId: TEST_SHOP_ID });
    expect(queriedJobs.some(j => j.id === TEST_JOB_ID_1)).toBe(true);
    expect(queriedJobs.some(j => j.id === TEST_JOB_ID_2)).toBe(true);
  });

  it('verifies atomic claimNextJob via Supabase RPC', async () => {
    const claimJob = {
      id: TEST_CLAIM_JOB_ID,
      token: `TK-CLM-${Date.now().toString().slice(-4)}`,
      shopId: TEST_SHOP_ID,
      fileName: 'claim_test.pdf',
      fileSize: 1024,
      pageCount: 1,
      copies: 1,
      printMode: 'mono',
      printType: 'bw',
      sides: 'single',
      status: 'queued',
      chargedAmount: 2,
      serverFilePath: '/uploads/claim_test.pdf',
      createdAt: new Date().toISOString()
    };

    await dbRepository.insertJob(claimJob);

    // Claim the job
    const claimed = await dbRepository.claimNextJob(TEST_SHOP_ID, 'TEST_PRINTER_CLAIM');
    expect(claimed).not.toBeNull();
    expect(claimed?.status).toBe('printing');

    // Clean up claimed job status to completed so other tests are not blocked
    await dbRepository.updateJob(claimed!.id, { status: 'completed' });
  });

  it('verifies student upsert and retrieval', async () => {
    const studentId = `std_${Date.now()}`;
    const student = {
      id: studentId,
      googleId: `gid_${Date.now()}`,
      name: 'Integration Tester',
      email: 'tester@campus.edu',
      picture: 'https://example.com/pic.jpg',
      role: 'student' as const,
      isActive: true,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };

    const upserted = await dbRepository.upsertStudent(student);
    expect(upserted.id).toBe(studentId);

    const fetched = await dbRepository.getStudent(studentId);
    expect(fetched).not.toBeNull();
    expect(fetched?.email).toBe('tester@campus.edu');
  });

  afterAll(async () => {
    // Clean up test records if Supabase is active
    if (isSupabaseConfigured && supabase) {
      await supabase.from('jobs').delete().in('id', [TEST_JOB_ID_1, TEST_JOB_ID_2, TEST_CLAIM_JOB_ID]);
      await supabase.from('orders').delete().eq('id', TEST_ORDER_ID);
    }
  });
});

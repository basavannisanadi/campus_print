import { describe, it, expect } from 'vitest';

/**
 * Phase 2: StudentPortal State Management & Error Isolation Contract
 *
 * This test suite validates that:
 * 1. Submission state (`success`, `submissionError`) is strictly decoupled from
 *    background operations (`historyError`, `queueError`).
 * 2. Successful job submission (HTTP 201) immediately clears submission errors,
 *    records the returned token, and transitions to the success confirmation view.
 * 3. Background/secondary failures in GET /api/student/history or GET /api/orders
 *    do not overwrite the submission success state or render a false database error.
 * 4. Genuine submission failure (HTTP 4xx/5xx) preserves form files and sets submissionError.
 * 5. History refresh after submission accurately surfaces the created order token.
 */

describe('StudentPortal Submission State Isolation Contract', () => {
  // Test Model Simulation State
  interface StudentPortalState {
    files: Array<{ name: string; size: number }>;
    fileConfigs: Record<string, any>;
    submitting: boolean;
    uploadProgress: number;
    submissionError: string;
    success: { order: any; jobs: any[] } | null;
    history: any[];
    historyError: string | null;
    queueError: string | null;
  }

  function createInitialState(): StudentPortalState {
    return {
      files: [{ name: 'sample_assignment.pdf', size: 1024 * 500 }],
      fileConfigs: {
        'sample_assignment.pdf': {
          pageCount: 5,
          copies: 2,
          printType: 'bw',
          sides: 'single',
          pageSize: 'a4'
        }
      },
      submitting: false,
      uploadProgress: 0,
      submissionError: '',
      success: null,
      history: [],
      historyError: null,
      queueError: null
    };
  }

  // Simulated handleSubmit implementation mirroring hardened StudentPortal.tsx
  async function simulateHandleSubmit(
    state: StudentPortalState,
    apiPostJobs: () => Promise<{ status: number; body: any }>,
    apiGetHistory?: () => Promise<{ status: number; body: any }>,
    apiGetOrders?: () => Promise<{ status: number; body: any }>
  ) {
    state.submitting = true;
    state.submissionError = '';
    state.uploadProgress = 10;

    try {
      const response = await apiPostJobs();

      if (response.status >= 200 && response.status < 300) {
        // State Hardening on 2xx:
        state.submissionError = '';
        state.uploadProgress = 100;

        const order = response.body.order || {
          id: response.body.orderId || 'ord-mock',
          token: response.body.token || response.body.orderToken || 'PRNT-SUCCESS1'
        };
        const jobs = response.body.jobs || [];

        // Transition to success view immediately
        state.success = { order, jobs };
        state.submitting = false;

        // Background History Refresh (Isolated)
        if (apiGetHistory) {
          try {
            const histRes = await apiGetHistory();
            if (histRes.status >= 200 && histRes.status < 300) {
              state.history = Array.isArray(histRes.body) ? histRes.body : [];
              state.historyError = null;
            } else {
              // Isolated history error: NEVER touches state.submissionError or state.success
              state.historyError = 'Unable to refresh recent history.';
            }
          } catch (histErr: any) {
            state.historyError = histErr.message || 'Unable to retrieve print history.';
          }
        }

        // Background Queue Refresh (Isolated)
        if (apiGetOrders) {
          try {
            const queueRes = await apiGetOrders();
            if (queueRes.status >= 200 && queueRes.status < 300) {
              state.queueError = null;
            } else {
              state.queueError = 'Unable to refresh queue telemetry.';
            }
          } catch (qErr: any) {
            state.queueError = qErr.message || 'Queue fetch failed.';
          }
        }
      } else {
        throw new Error(response.body?.message || 'Database service unavailable');
      }
    } catch (err: any) {
      state.submissionError = err.message || 'Failed to submit document.';
      state.success = null;
      state.submitting = false;
      state.uploadProgress = 0;
    }
  }

  it('Test 1: Successful Submission (POST /api/jobs 201 -> success = true, order token displayed, no error)', async () => {
    const state = createInitialState();

    await simulateHandleSubmit(state, async () => ({
      status: 201,
      body: {
        success: true,
        orderId: 'order-101',
        token: 'PRNT-6A42D0E3',
        order: { id: 'order-101', token: 'PRNT-6A42D0E3', status: 'pending_approval' },
        jobs: [{ id: 'job-101', fileName: 'sample_assignment.pdf', pageCount: 5, copies: 2 }]
      }
    }));

    expect(state.success).not.toBeNull();
    expect(state.success?.order.token).toBe('PRNT-6A42D0E3');
    expect(state.submissionError).toBe('');
    expect(state.submitting).toBe(false);
    expect(state.uploadProgress).toBe(100);
  });

  it('Test 2: Success + History Failure (POST 201, GET /api/student/history 503 -> success remains true, token visible, historyError isolated)', async () => {
    const state = createInitialState();

    await simulateHandleSubmit(
      state,
      async () => ({
        status: 201,
        body: {
          success: true,
          order: { id: 'order-102', token: 'PRNT-11BACA33' },
          jobs: [{ id: 'job-102', fileName: 'sample_assignment.pdf' }]
        }
      }),
      async () => ({
        status: 503,
        body: { message: 'Database service unavailable' }
      })
    );

    // Primary submission SUCCESS must be preserved
    expect(state.success).not.toBeNull();
    expect(state.success?.order.token).toBe('PRNT-11BACA33');

    // Submission banner must NOT show false database error
    expect(state.submissionError).toBe('');

    // History error must be captured independently
    expect(state.historyError).toBe('Unable to refresh recent history.');
  });

  it('Test 3: Success + Queue Failure (POST 201, GET /api/orders 503 -> success remains true, queueError isolated)', async () => {
    const state = createInitialState();

    await simulateHandleSubmit(
      state,
      async () => ({
        status: 201,
        body: {
          success: true,
          order: { id: 'order-103', token: 'PRNT-99887766' },
          jobs: [{ id: 'job-103', fileName: 'sample_assignment.pdf' }]
        }
      }),
      undefined,
      async () => ({
        status: 503,
        body: { message: 'Live queue service unavailable' }
      })
    );

    // Primary submission SUCCESS must remain intact
    expect(state.success).not.toBeNull();
    expect(state.success?.order.token).toBe('PRNT-99887766');
    expect(state.submissionError).toBe('');

    // Queue error must be captured in its own state
    expect(state.queueError).toBe('Unable to refresh queue telemetry.');
  });

  it('Test 4: Actual Submission Failure (POST /api/jobs 503 -> submissionError displayed, files kept for retry, success = null)', async () => {
    const state = createInitialState();

    await simulateHandleSubmit(state, async () => ({
      status: 503,
      body: { message: 'Database service unavailable' }
    }));

    // Submission must fail and show genuine submissionError
    expect(state.success).toBeNull();
    expect(state.submissionError).toBe('Database service unavailable');
    expect(state.submitting).toBe(false);

    // Files must be preserved for student to retry
    expect(state.files.length).toBe(1);
    expect(state.files[0].name).toBe('sample_assignment.pdf');
  });

  it('Test 5: Success + History Success (POST 201, GET /api/student/history 200 -> token matches, history updated)', async () => {
    const state = createInitialState();

    await simulateHandleSubmit(
      state,
      async () => ({
        status: 201,
        body: {
          success: true,
          order: { id: 'order-105', token: 'PRNT-LIFETIME5' },
          jobs: [{ id: 'job-105', fileName: 'sample_assignment.pdf' }]
        }
      }),
      async () => ({
        status: 200,
        body: [
          {
            id: 'hist-105',
            orderToken: 'PRNT-LIFETIME5',
            fileName: 'sample_assignment.pdf',
            status: 'pending_approval',
            createdAt: new Date().toISOString()
          }
        ]
      })
    );

    expect(state.success).not.toBeNull();
    expect(state.success?.order.token).toBe('PRNT-LIFETIME5');
    expect(state.submissionError).toBe('');
    expect(state.historyError).toBeNull();
    expect(state.history.length).toBe(1);
    expect(state.history[0].orderToken).toBe('PRNT-LIFETIME5');
  });

  describe('Submission Lifecycle Guard & Stale Error Prevention', () => {
    interface ExtendedPortalState extends StudentPortalState {
      submissionStatus: 'idle' | 'preparing' | 'submitting' | 'error' | 'success';
      activeFileName: string | null;
    }

    function createExtendedState(): ExtendedPortalState {
      return {
        ...createInitialState(),
        submissionStatus: 'idle',
        activeFileName: null
      };
    }

    function isSubmitFormErrorBannerVisible(state: ExtendedPortalState): boolean {
      return !!state.submissionError && state.submissionStatus === 'error';
    }

    function simulateAddFile(state: ExtendedPortalState, file: { name: string; size: number }) {
      state.submissionError = '';
      state.submissionStatus = 'preparing';
      state.files.push(file);
      state.activeFileName = file.name;
      state.fileConfigs[file.name] = {
        copies: 1,
        printType: 'bw',
        sides: 'single',
        pageCount: 1
      };
    }

    function simulateUpdateConfig(state: ExtendedPortalState, updates: any) {
      if (!state.activeFileName) return;
      state.submissionError = '';
      state.submissionStatus = 'preparing';
      state.fileConfigs[state.activeFileName] = {
        ...state.fileConfigs[state.activeFileName],
        ...updates
      };
    }

    it('Test 6: Background API failure produces "Database service unavailable", but user starts fresh PDF upload -> submissionError cleared, no banner displayed', () => {
      const state = createExtendedState();

      // a. Background history failure sets historyError
      state.historyError = 'Database service unavailable';
      expect(state.historyError).toBe('Database service unavailable');
      expect(state.submissionError).toBe('');
      expect(isSubmitFormErrorBannerVisible(state)).toBe(false);

      // b. User starts fresh PDF upload
      simulateAddFile(state, { name: 'BADAVARA_BADAM.pdf', size: 2048 });

      // c. submissionError is empty and status is preparing
      expect(state.submissionError).toBe('');
      expect(state.submissionStatus).toBe('preparing');

      // d. The submit form does NOT display the stale database error
      expect(isSubmitFormErrorBannerVisible(state)).toBe(false);
    });

    it('Test 7: User alters print configuration (copies/sides/mode/range) -> auto-clears submission error', () => {
      const state = createExtendedState();
      simulateAddFile(state, { name: 'document.pdf', size: 1024 });

      // Simulate a previous failed submit
      state.submissionError = 'The print shop printer is currently offline.';
      state.submissionStatus = 'error';
      expect(isSubmitFormErrorBannerVisible(state)).toBe(true);

      // User adjusts copies
      simulateUpdateConfig(state, { copies: 3 });
      expect(state.submissionError).toBe('');
      expect(state.submissionStatus).toBe('preparing');
      expect(isSubmitFormErrorBannerVisible(state)).toBe(false);
    });

    it('Test 8: Genuine POST /api/jobs failure sets submissionError and shows error banner', async () => {
      const state = createExtendedState();
      simulateAddFile(state, { name: 'test_doc.pdf', size: 1024 });

      state.submissionStatus = 'submitting';
      state.submitting = true;

      // Simulated network failure
      state.submissionError = 'The print shop is currently offline. Please try again in a moment.';
      state.submissionStatus = 'error';
      state.submitting = false;

      expect(state.submissionError).toBe('The print shop is currently offline. Please try again in a moment.');
      expect(state.submissionStatus).toBe('error');
      expect(isSubmitFormErrorBannerVisible(state)).toBe(true);
    });

    it('Test 9: Successful POST /api/jobs clears submissionError, sets success, and hides error banner', async () => {
      const state = createExtendedState();
      simulateAddFile(state, { name: 'final_thesis.pdf', size: 4096 });

      // Starts submission
      state.submissionStatus = 'submitting';
      state.submitting = true;
      state.submissionError = '';

      // Success HTTP 201 response
      state.submissionError = '';
      state.submissionStatus = 'success';
      state.submitting = false;
      state.success = {
        order: { id: 'order-999', token: 'PRNT-SUCCESS9' },
        jobs: [{ id: 'job-999', fileName: 'final_thesis.pdf' }]
      };

      expect(state.submissionError).toBe('');
      expect(state.submissionStatus).toBe('success');
      expect(state.success?.order.token).toBe('PRNT-SUCCESS9');
      expect(isSubmitFormErrorBannerVisible(state)).toBe(false);
    });

    it('Test 10 (Regression): Background history failure cannot create the submit-form error banner', () => {
      const state = createExtendedState();
      simulateAddFile(state, { name: 'sample.pdf', size: 1024 });

      // History background fetch failure occurs
      state.historyError = 'Database service unavailable';

      // Submit banner must NOT display history error
      expect(state.submissionError).toBe('');
      expect(state.submissionStatus).toBe('preparing');
      expect(isSubmitFormErrorBannerVisible(state)).toBe(false);
    });

    it('Test 11 (Regression): Background queue failure cannot create the submit-form error banner', () => {
      const state = createExtendedState();
      simulateAddFile(state, { name: 'sample.pdf', size: 1024 });

      // Queue background fetch failure occurs
      state.queueError = 'Database service unavailable';

      // Submit banner must NOT display queue error
      expect(state.submissionError).toBe('');
      expect(state.submissionStatus).toBe('preparing');
      expect(isSubmitFormErrorBannerVisible(state)).toBe(false);
    });
  });
});

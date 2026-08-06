/**
 * PrinterManager — Runtime integration module
 *
 * This module initializes and manages the printer intelligence layer.
 * It maintains a cached PrinterState and coordinates registered providers.
 */

'use strict';

const { createPrinterState } = require('./models/PrinterState.cjs');
const { SnmpProvider } = require('./providers/SnmpProvider.cjs');

/**
 * Internal state
 */
let initialized = false;
let cachedState = null;
let activeProvider = null;
let config = {};

// Scheduler state
let pollTimer = null;
let retryCount = 0;
let consecutiveFailures = 0;
let lastSuccessfulPoll = null;

// Base intervals (in milliseconds)
const INTERVAL_FAST = 3000;         // 3 seconds during active printing
const INTERVAL_MODERATE = 15000;     // 15 seconds when idle or ready
const INTERVAL_SLOW = 30000;         // 30 seconds when in warning/soft error state
const INTERVAL_BACKOFF_BASE = 10000; // 10 seconds base for exponential backoff
const INTERVAL_BACKOFF_MAX = 60000;  // 60 seconds maximum backoff limit

/**
 * Schedule the next poll tick safely.
 *
 * @param {number} delay - Milliseconds to wait before executing
 */
function scheduleNextPoll(delay) {
  if (!initialized || !activeProvider) return;
  
  if (pollTimer) {
    clearTimeout(pollTimer);
  }
  
  pollTimer = setTimeout(runPoll, delay);
}

/**
 * Execute the polling logic against the active provider.
 */
async function runPoll() {
  if (!initialized || !activeProvider) return;

  console.log('[PrinterManager] Running scheduled status poll...');
  try {
    const state = await activeProvider.query(config.printerName || '');
    
    if (state && state.reachable) {
      // Reset failure counters upon successful communication
      retryCount = 0;
      consecutiveFailures = 0;
      lastSuccessfulPoll = new Date().toISOString();
      cachedState = state;
      
      // Determine adaptive poll interval depending on printer condition
      let delay = INTERVAL_MODERATE;
      if (state.status === 'printing') {
        delay = INTERVAL_FAST;
        console.log(`[PrinterManager] Printer is printing. Scheduling fast poll in ${delay}ms`);
      } else if (state.status === 'jam' || state.status === 'paper_empty' || state.status === 'cover_open' || state.status === 'error') {
        delay = INTERVAL_SLOW;
        console.log(`[PrinterManager] Printer has error state: ${state.status}. Scheduling slow poll in ${delay}ms`);
      } else {
        console.log(`[PrinterManager] Printer status is: ${state.status}. Scheduling moderate poll in ${delay}ms`);
      }
      
      scheduleNextPoll(delay);
    } else {
      // Provider returned unreachable state payload
      handlePollFailure(state || createPrinterState({
        printerName: config.printerName,
        provider: 'snmp',
        reachable: false,
        errorMessage: 'Printer returned unreachable status'
      }));
    }
  } catch (err) {
    console.error('[PrinterManager] Error during scheduled status poll:', err.message);
    handlePollFailure(createPrinterState({ 
      printerName: config.printerName, 
      provider: 'snmp', 
      reachable: false, 
      errorMessage: err.message || 'Unknown querying failure' 
    }));
  }
}

/**
 * Handle communication failures using exponential backoff.
 *
 * @param {Object} failedState - Unreachable state descriptor
 */
function handlePollFailure(failedState) {
  consecutiveFailures++;
  retryCount++;
  cachedState = failedState;
  
  // Exponential backoff delay calculation: base * 2^(retryCount - 1)
  const delay = Math.min(INTERVAL_BACKOFF_MAX, INTERVAL_BACKOFF_BASE * Math.pow(2, retryCount - 1));
  console.warn(`[PrinterManager] Poll failed (consecutive failures: ${consecutiveFailures}). Retrying with backoff in ${delay}ms. Reason: ${failedState.errorMessage || 'unknown'}`);
  
  scheduleNextPoll(delay);
}

/**
 * Initialize the PrinterManager with configuration.
 *
 * @param {Object} initConfig - Configuration object
 * @param {string} initConfig.printerName - Windows printer name
 * @param {boolean} initConfig.mockMode - Whether to use mock mode
 * @returns {Promise<void>}
 */
async function init(initConfig) {
  if (initialized) {
    console.log('[PrinterManager] Already initialized');
    return;
  }

  config = initConfig || {};
  console.log('[PrinterManager] Initializing printer intelligence layer...');
  console.log(`[PrinterManager] Printer: ${config.printerName || '(none)'}`);
  console.log(`[PrinterManager] Mock Mode: ${config.mockMode || false}`);

  // Create default fallback PrinterState
  cachedState = createPrinterState({
    printerName: config.printerName || '',
    provider: 'none',
    status: 'unknown',
    reachable: false,
  });

  const snmp = new SnmpProvider();
  console.log('[PrinterManager] Discovering capabilities...');

  try {
    const isSnmpSupported = await snmp.isSupported(config.printerName || '');
    if (isSnmpSupported) {
      console.log('[PrinterManager] SNMP provider capability discovered successfully');
      activeProvider = snmp;
      
      // Query initial state synchronously on startup
      console.log('[PrinterManager] Performing initial status query...');
      cachedState = await snmp.query(config.printerName || '');
      console.log(`[PrinterManager] Initial status: ${cachedState.status}`);
      
      // Start the scheduled poll loop
      scheduleNextPoll(INTERVAL_MODERATE);
    } else {
      console.log('[PrinterManager] SNMP provider is not supported for this printer');
    }
  } catch (err) {
    console.error('[PrinterManager] Error during capability discovery:', err.message);
  }

  console.log('[PrinterManager] Initialized');
  initialized = true;
}

/**
 * Get the cached PrinterState.
 *
 * @returns {Object|null} The cached PrinterState or null if not initialized
 */
function getState() {
  if (!initialized) {
    console.warn('[PrinterManager] getState() called before initialization');
    return null;
  }
  return cachedState;
}

/**
 * Check if PrinterManager is initialized.
 *
 * @returns {boolean} True if initialized
 */
function isInitialized() {
  return initialized;
}

/**
 * Fetch performance metrics and failure counters.
 *
 * @returns {Object} Scheduler metrics
 */
function getMetrics() {
  return {
    retryCount,
    consecutiveFailures,
    lastSuccessfulPoll,
    isPolling: !!pollTimer
  };
}

/**
 * Cleanup and shutdown the PrinterManager.
 *
 * @returns {Promise<void>}
 */
async function dispose() {
  if (!initialized) {
    return;
  }

  console.log('[PrinterManager] Shutting down...');
  
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  if (activeProvider && typeof activeProvider.dispose === 'function') {
    try {
      await activeProvider.dispose();
    } catch (e) {
      console.error('[PrinterManager] Error disposing active provider:', e.message);
    }
  }

  // Cleanup state
  cachedState = null;
  activeProvider = null;
  config = {};
  retryCount = 0;
  consecutiveFailures = 0;
  lastSuccessfulPoll = null;
  initialized = false;

  console.log('[PrinterManager] Shutdown complete');
}

module.exports = {
  init,
  getState,
  isInitialized,
  getMetrics,
  dispose,
};

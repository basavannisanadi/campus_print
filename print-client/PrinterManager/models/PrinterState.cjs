/**
 * PrinterState model — the single unified object every provider must return.
 *
 * Fields are intentionally optional: providers must only populate what they
 * can reliably read. Consumers must treat every field as potentially absent.
 */

'use strict';

/**
 * @typedef {Object} ConsumableInfo
 * @property {string}  name         - e.g. 'Black Toner', 'Cyan Ink'
 * @property {number|null} levelPct - 0–100, or null when unreadable
 * @property {string}  unit         - 'percent' | 'pages' | 'unknown'
 */

/**
 * @typedef {Object} PrinterState
 *
 * --- Identity ---
 * @property {string}      printerName   - Windows printer name
 * @property {string|null} vendor        - e.g. 'HP', 'Canon', null when unknown
 * @property {string|null} model         - e.g. 'LaserJet Pro M404', null when unknown
 * @property {string|null} serialNumber  - device serial, null when unknown
 *
 * --- Status ---
 * @property {'ready'|'printing'|'jam'|'paper_empty'|'offline'|'cover_open'|'error'|'unknown'} status
 * @property {boolean} isOffline         - true when printer is unreachable / work-offline
 * @property {boolean} isJam             - true when paper jam is detected
 * @property {boolean} isPaperEmpty      - true when any tray reports paper-out
 * @property {boolean} isCoverOpen       - true when a door/cover is open
 * @property {boolean} isPrinting        - true when the device is actively printing
 *
 * --- Counters ---
 * @property {number|null} pageCount     - lifetime page counter, null when unreadable
 *
 * --- Consumables ---
 * @property {ConsumableInfo[]} consumables  - toner/ink levels (may be empty array)
 *
 * --- Capabilities ---
 * @property {string[]} supportedFeatures   - e.g. ['snmp', 'duplex', 'color']
 *
 * --- Provider metadata ---
 * @property {string}  provider            - which provider produced this state
 * @property {boolean} reachable           - false when provider could not contact printer
 * @property {string|null} errorMessage    - human-readable reason when reachable=false
 * @property {string}  timestamp           - ISO-8601 when this snapshot was taken
 */

/**
 * Creates a blank PrinterState with safe defaults.
 * Providers should spread/override only the fields they know.
 *
 * @param {Partial<import('./PrinterState').PrinterState>} overrides
 * @returns {PrinterState}
 */
function createPrinterState(overrides = {}) {
  return {
    // Identity
    printerName:      overrides.printerName      ?? '',
    vendor:           overrides.vendor           ?? null,
    model:            overrides.model            ?? null,
    serialNumber:     overrides.serialNumber     ?? null,

    // Status
    status:           overrides.status           ?? 'unknown',
    isOffline:        overrides.isOffline         ?? false,
    isJam:            overrides.isJam             ?? false,
    isPaperEmpty:     overrides.isPaperEmpty      ?? false,
    isCoverOpen:      overrides.isCoverOpen       ?? false,
    isPrinting:       overrides.isPrinting        ?? false,

    // Counters
    pageCount:        overrides.pageCount         ?? null,

    // Consumables
    consumables:      overrides.consumables       ?? [],

    // Capabilities
    supportedFeatures: overrides.supportedFeatures ?? [],

    // Provider metadata
    provider:         overrides.provider          ?? 'none',
    reachable:        overrides.reachable         ?? false,
    errorMessage:     overrides.errorMessage      ?? null,
    timestamp:        overrides.timestamp         ?? new Date().toISOString(),
  };
}

/**
 * Returns a PrinterState representing a printer that could not be reached.
 *
 * @param {string} printerName
 * @param {string} provider
 * @param {string} reason
 * @returns {PrinterState}
 */
function createUnreachableState(printerName, provider, reason) {
  return createPrinterState({
    printerName,
    provider,
    status: 'unknown',
    reachable: false,
    errorMessage: reason,
  });
}

module.exports = { createPrinterState, createUnreachableState };

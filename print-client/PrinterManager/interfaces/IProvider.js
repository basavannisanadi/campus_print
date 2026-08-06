/**
 * IProvider — contract every printer intelligence provider must satisfy.
 *
 * Providers are pure observers. They MUST:
 *   - Never modify the print queue or spooler state
 *   - Never throw synchronously (catch internally, return graceful state)
 *   - Return a PrinterState from query()
 *
 * Design intent: new providers (WMI, IPP, RAW 9100, vendor SDK, cloud API)
 * are added by implementing this interface. The PrinterManager and scheduler
 * are never modified when a new provider is introduced.
 */

'use strict';

/**
 * Abstract base class for all providers.
 *
 * JavaScript has no enforced interfaces, so this class documents the
 * contract and throws on unimplemented methods. Subclasses require()
 * this file and extend BaseProvider.
 */
class BaseProvider {
  /**
   * Unique machine-readable identifier for this provider.
   * Used in logs, capability caching, and the provider field of PrinterState.
   *
   * @returns {string}  e.g. 'snmp', 'wmi', 'ipp'
   */
  get name() {
    throw new Error(`${this.constructor.name} must implement get name()`);
  }

  /**
   * Human-readable description surfaced in logs only.
   *
   * @returns {string}
   */
  get description() {
    return `${this.name} provider`;
  }

  /**
   * Probe whether this provider can communicate with the given printer.
   *
   * Called once during capability discovery. Must never throw.
   * Must complete within a reasonable timeout (recommend ≤ 3 s).
   *
   * @param {string} printerName  - Windows printer name
   * @param {object} [context]    - optional extra context (IP address, config, etc.)
   * @returns {Promise<boolean>}  - true if the provider can reach this printer
   */
  async isSupported(printerName, context) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name} must implement isSupported()`);
  }

  /**
   * Read the current printer state. Called on every poll tick.
   *
   * Must never throw. Catch all errors internally and return a graceful
   * PrinterState with reachable=false and a descriptive errorMessage.
   *
   * Must complete within a reasonable timeout (recommend ≤ 5 s).
   *
   * @param {string} printerName  - Windows printer name
   * @param {object} [context]    - optional extra context
   * @returns {Promise<import('../models/PrinterState').PrinterState>}
   */
  async query(printerName, context) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name} must implement query()`);
  }

  /**
   * Optional: called when the PrinterManager is shutting down.
   * Providers should close any open sockets/sessions here.
   *
   * Default: no-op.
   */
  async dispose() {
    // no-op by default
  }
}

module.exports = { BaseProvider };

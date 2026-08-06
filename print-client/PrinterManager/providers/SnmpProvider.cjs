'use strict';

const dgram = require('dgram');
const cp = require('child_process');
const { BaseProvider } = require('../interfaces/IProvider.js');
const { createPrinterState, createUnreachableState } = require('../models/PrinterState.cjs');

// Standard Printer MIB OIDs
const OID_SYS_DESCR         = '1.3.6.1.2.1.1.1.0';
const OID_SYS_UPTIME         = '1.3.6.1.2.1.1.3.0';
const OID_HR_PRINTER_STATUS  = '1.3.6.1.2.1.25.3.5.1.1.1';
const OID_HR_PRINTER_ERRORS  = '1.3.6.1.2.1.25.3.5.1.2.1';
const OID_PRT_SERIAL         = '1.3.6.1.2.1.43.5.1.1.17.1';
const OID_PRT_PAGE_COUNT     = '1.3.6.1.2.1.43.10.2.1.4.1.1';
const OID_TONER_LEVEL        = '1.3.6.1.2.1.43.11.1.1.9.1.1';
const OID_TONER_MAX          = '1.3.6.1.2.1.43.11.1.1.8.1.1';
const OID_TONER_DESC         = '1.3.6.1.2.1.43.12.1.1.4.1.1';

// ---------------------------------------------------------------------------
// BER/DER encoding helpers
// ---------------------------------------------------------------------------

function encodeLength(n) {
  if (n < 128) return [n];
  const bytes = [];
  let x = n;
  while (x > 0) { bytes.unshift(x & 0xff); x >>= 8; }
  return [0x80 | bytes.length, ...bytes];
}

function encodeTLV(tag, valueBytes) {
  return Buffer.from([tag, ...encodeLength(valueBytes.length), ...valueBytes]);
}

function encodeBase128(n) {
  if (n === 0) return [0x00];
  const bytes = [];
  let x = n;
  while (x > 0) { bytes.unshift(x & 0x7f); x >>>= 7; }
  for (let i = 0; i < bytes.length - 1; i++) bytes[i] |= 0x80;
  return bytes;
}

function encodeOID(dottedString) {
  const arcs = dottedString.split('.').map(Number);
  const firstByte = arcs[0] * 40 + arcs[1];
  const rest = arcs.slice(2).flatMap(arc => encodeBase128(arc));
  return encodeTLV(0x06, [firstByte, ...rest]);
}

function encodeInteger(n) {
  // Minimal big-endian signed integer
  if (n === 0) return encodeTLV(0x02, [0x00]);
  const bytes = [];
  let x = n;
  // handle signed
  if (x > 0) {
    while (x > 0) { bytes.unshift(x & 0xff); x = Math.floor(x / 256); }
    if (bytes[0] & 0x80) bytes.unshift(0x00); // ensure positive sign bit
  } else {
    // negative
    let u = (-x) - 1;
    while (u > 0) { bytes.unshift((~u) & 0xff); u = Math.floor(u / 256); }
    if (bytes.length === 0) bytes.push(0xff);
    if (!(bytes[0] & 0x80)) bytes.unshift(0xff);
  }
  return encodeTLV(0x02, bytes);
}

function encodeOctetString(str) {
  return encodeTLV(0x04, [...Buffer.from(str)]);
}

function encodeNull() {
  return Buffer.from([0x05, 0x00]);
}

// ---------------------------------------------------------------------------
// OID decoding helper
// ---------------------------------------------------------------------------

function decodeOID(buf, offset, len) {
  const end = offset + len;
  const arcs = [];
  const firstByte = buf[offset++];
  arcs.push(Math.floor(firstByte / 40));
  arcs.push(firstByte % 40);
  while (offset < end) {
    let val = 0;
    let b;
    do {
      b = buf[offset++];
      val = (val << 7) | (b & 0x7f);
    } while (b & 0x80);
    arcs.push(val);
  }
  return arcs.join('.');
}

// ---------------------------------------------------------------------------
// TLV reader helper — reads tag, length, value from buf at offset
// Returns { tag, value: Buffer, next: number }
// ---------------------------------------------------------------------------
function readTLV(buf, offset) {
  if (offset >= buf.length) throw new Error('readTLV: out of bounds');
  const tag = buf[offset++];
  let len = buf[offset++];
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < numBytes; i++) {
      len = (len << 8) | buf[offset++];
    }
  }
  const value = buf.slice(offset, offset + len);
  return { tag, value, next: offset + len };
}

// ---------------------------------------------------------------------------
// Read a signed integer from a Buffer
// ---------------------------------------------------------------------------
function bufToInt(buf) {
  if (buf.length === 0) return 0;
  let val = buf[0] & 0x80 ? -1 : 0; // sign extension
  for (let i = 0; i < buf.length; i++) {
    val = (val * 256 + buf[i]) | 0;
  }
  return val;
}

// Read unsigned integer (Counter32, Gauge32, etc.)
function bufToUint(buf) {
  let val = 0;
  for (let i = 0; i < buf.length; i++) {
    val = val * 256 + buf[i];
  }
  return val;
}

// ---------------------------------------------------------------------------
// _buildSnmpGetRequest — build SNMP v2c GetRequest PDU
// ---------------------------------------------------------------------------
function buildSnmpGetRequest(community, requestId, oids) {
  // Build each varbind: SEQUENCE { OID, NULL }
  const varbinds = oids.map(oid => {
    const oidBuf = encodeOID(oid);
    const nullBuf = encodeNull();
    const inner = Buffer.concat([oidBuf, nullBuf]);
    return encodeTLV(0x30, [...inner]);
  });

  const varbindList = encodeTLV(0x30, [...Buffer.concat(varbinds)]);

  // GetRequest-PDU (tag 0xA0)
  const pduContents = Buffer.concat([
    encodeInteger(requestId),
    encodeInteger(0),  // error-status
    encodeInteger(0),  // error-index
    varbindList,
  ]);
  const pdu = encodeTLV(0xA0, [...pduContents]);

  // SNMP Message: SEQUENCE { version, community, pdu }
  const message = Buffer.concat([
    encodeInteger(1),  // version = 1 (v2c)
    encodeOctetString(community),
    pdu,
  ]);
  return encodeTLV(0x30, [...message]);
}

// ---------------------------------------------------------------------------
// _decodeSnmpPacket — parse SNMP GetResponse PDU
// Returns array of { oid, type, value }
// ---------------------------------------------------------------------------
function decodeSnmpPacket(buf) {
  const varbinds = [];

  // Outer SEQUENCE
  const outer = readTLV(buf, 0);
  let offset = 0;

  // version INTEGER
  const ver = readTLV(outer.value, offset);
  offset = ver.next;

  // community OCTET STRING
  const comm = readTLV(outer.value, offset);
  offset = comm.next;

  // GetResponse-PDU (tag 0xA2)
  const pduTlv = readTLV(outer.value, offset);
  if (pduTlv.tag !== 0xA2) {
    // Not a GetResponse — return empty
    return varbinds;
  }

  let pduOffset = 0;
  // requestId
  const reqId = readTLV(pduTlv.value, pduOffset);
  pduOffset = reqId.next;
  // errorStatus
  const errStatus = readTLV(pduTlv.value, pduOffset);
  pduOffset = errStatus.next;
  // errorIndex
  const errIndex = readTLV(pduTlv.value, pduOffset);
  pduOffset = errIndex.next;

  // varbindList SEQUENCE
  const vbListTlv = readTLV(pduTlv.value, pduOffset);
  let vbOffset = 0;

  while (vbOffset < vbListTlv.value.length) {
    const vbSeq = readTLV(vbListTlv.value, vbOffset);
    vbOffset = vbSeq.next;

    // OID
    let innerOffset = 0;
    const oidTlv = readTLV(vbSeq.value, innerOffset);
    if (oidTlv.tag !== 0x06) continue;
    innerOffset = oidTlv.next;
    const oid = decodeOID(oidTlv.value, 0, oidTlv.value.length);

    // Value
    const valTlv = readTLV(vbSeq.value, innerOffset);

    // Skip null-ish responses
    if (valTlv.tag === 0x05) continue;  // NULL — OID not supported
    if (valTlv.tag === 0x80) continue;  // noSuchObject
    if (valTlv.tag === 0x81) continue;  // noSuchInstance
    if (valTlv.tag === 0x82) continue;  // endOfMibView

    let decoded;
    switch (valTlv.tag) {
      case 0x02: decoded = bufToInt(valTlv.value); break;           // INTEGER
      case 0x04: decoded = valTlv.value; break;                     // OCTET STRING -> Buffer
      case 0x40: {                                                    // IpAddress
        decoded = Array.from(valTlv.value).join('.');
        break;
      }
      case 0x41: decoded = bufToUint(valTlv.value); break;          // Gauge32
      case 0x42: decoded = bufToUint(valTlv.value); break;          // Counter32
      case 0x43: decoded = bufToUint(valTlv.value); break;          // TimeTicks
      case 0x46: decoded = bufToUint(valTlv.value); break;          // Counter64
      case 0x0D: decoded = bufToUint(valTlv.value); break;          // (alt TimeTicks)
      default:   decoded = valTlv.value; break;
    }

    varbinds.push({ oid, type: valTlv.tag, value: decoded });
  }

  return varbinds;
}

// ---------------------------------------------------------------------------
// SnmpProvider class
// ---------------------------------------------------------------------------

class SnmpProvider extends BaseProvider {
  constructor() {
    super();
    this._capabilities = null;
    this._cachedIp = null;
    this._community = 'public';
  }

  get name() { return 'snmp'; }
  get description() { return 'SNMP v2c Printer MIB Provider'; }

  // -------------------------------------------------------------------------
  // _resolvePrinterIp — PowerShell lookup: Windows printer name → IP address
  // -------------------------------------------------------------------------
  async _resolvePrinterIp(printerName) {
    return new Promise((resolve) => {
      if (!printerName) return resolve(null);
      
      const script = `
        $printer = Get-Printer -Name $args[0] -ErrorAction SilentlyContinue
        if ($printer) {
          Get-PrinterPort -Name $printer.PortName -ErrorAction SilentlyContinue | Select-Object -ExpandProperty PrinterHostAddress
        }
      `;
      
      const child = cp.spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        script,
        printerName
      ], { windowsHide: true });
      
      let stdout = '';
      child.stdout.on('data', (data) => { stdout += data; });
      
      const timer = setTimeout(() => {
        try { child.kill(); } catch (_) {}
        resolve(null);
      }, 5000);
      
      child.on('close', () => {
        clearTimeout(timer);
        if (!stdout || !stdout.trim()) return resolve(null);
        const ip = stdout.trim().split(/\r?\n/)[0].trim();
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return resolve(ip);
        resolve(null);
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
  }

  // -------------------------------------------------------------------------
  // _snmpGet — send SNMP GET and receive response via UDP
  // -------------------------------------------------------------------------
  async _snmpGet(ip, community, oids, timeoutMs) {
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket('udp4');
      let settled = false;

      const done = (err, result) => {
        if (settled) return;
        settled = true;
        try { sock.close(); } catch (_) {}
        if (err) reject(err);
        else resolve(result);
      };

      const requestId = Math.floor(Math.random() * 0x7fffffff);
      const packet = buildSnmpGetRequest(community, requestId, oids);

      const timer = setTimeout(() => {
        done(new Error('SNMP timeout'));
      }, timeoutMs);

      sock.on('error', (err) => {
        clearTimeout(timer);
        done(err);
      });

      sock.on('message', (msg) => {
        clearTimeout(timer);
        try {
          const varbinds = decodeSnmpPacket(msg);
          done(null, varbinds);
        } catch (e) {
          done(e);
        }
      });

      sock.send(packet, 0, packet.length, 161, ip, (err) => {
        if (err) {
          clearTimeout(timer);
          done(err);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // _parseErrorBitmap — hrPrinterDetectedErrorState OCTET STRING bitmask
  // -------------------------------------------------------------------------
  _parseErrorBitmap(buf) {
    if (!buf || buf.length === 0) {
      return { isPaperEmpty: false, isCoverOpen: false, isJam: false, isOffline: false, isLowToner: false };
    }
    const byte0 = buf[0];
    // bit 0 = MSB = 0x80 → lowPaper
    // bit 1 = 0x40 → noPaper
    // bit 2 = 0x20 → lowToner
    // bit 3 = 0x10 → noToner
    // bit 4 = 0x08 → doorOpen
    // bit 5 = 0x04 → jammed
    // bit 6 = 0x02 → offline
    // bit 7 = 0x01 → serviceRequested
    return {
      isPaperEmpty: !!(byte0 & 0x40),
      isCoverOpen:  !!(byte0 & 0x08),
      isJam:        !!(byte0 & 0x04),
      isOffline:    !!(byte0 & 0x02),
      isLowToner:   !!(byte0 & 0x20),
    };
  }

  // -------------------------------------------------------------------------
  // _parsePrinterState — build PrinterState from SNMP varbinds
  // -------------------------------------------------------------------------
  _parsePrinterState(printerName, varbinds) {
    const byOid = {};
    for (const vb of varbinds) {
      byOid[vb.oid] = vb;
    }

    // --- Vendor / Model from sysDescr ---
    let vendor = null;
    let model = null;
    const sysDescrVb = byOid[OID_SYS_DESCR];
    if (sysDescrVb && sysDescrVb.value) {
      const desc = Buffer.isBuffer(sysDescrVb.value)
        ? sysDescrVb.value.toString('utf8')
        : String(sysDescrVb.value);
      const knownVendors = ['HP', 'Canon', 'Epson', 'Brother', 'Lexmark', 'Xerox', 'Ricoh', 'Samsung', 'Kyocera', 'Konica', 'Sharp'];
      for (const v of knownVendors) {
        if (desc.toLowerCase().includes(v.toLowerCase())) {
          vendor = v;
          break;
        }
      }
      // Try to extract model: first token that isn't a vendor name
      const tokens = desc.split(/[\s;,]+/).filter(Boolean);
      for (const t of tokens) {
        if (vendor && t.toLowerCase() === vendor.toLowerCase()) continue;
        if (t.length > 2) { model = t; break; }
      }
    }

    // --- hrPrinterStatus ---
    let status = 'unknown';
    let isPrinting = false;
    const hrStatusVb = byOid[OID_HR_PRINTER_STATUS];
    if (hrStatusVb !== undefined) {
      const s = hrStatusVb.value;
      if (s === 3) { status = 'ready'; isPrinting = false; }
      else if (s === 4) { status = 'printing'; isPrinting = true; }
      else if (s === 5) { status = 'unknown'; }
      else { status = 'unknown'; }
    }

    // --- Error bitmap ---
    let isPaperEmpty = false, isCoverOpen = false, isJam = false, isOffline = false, isLowToner = false;
    const hrErrorsVb = byOid[OID_HR_PRINTER_ERRORS];
    if (hrErrorsVb && Buffer.isBuffer(hrErrorsVb.value)) {
      const bits = this._parseErrorBitmap(hrErrorsVb.value);
      isPaperEmpty = bits.isPaperEmpty;
      isCoverOpen  = bits.isCoverOpen;
      isJam        = bits.isJam;
      isOffline    = bits.isOffline;
      isLowToner   = bits.isLowToner;
    }

    // Override status with most severe condition
    if (isOffline)    status = 'offline';
    else if (isJam)   status = 'jam';
    else if (isPaperEmpty) status = 'paper_empty';
    else if (isCoverOpen)  status = 'cover_open';

    // --- Serial number ---
    let serialNumber = null;
    const serialVb = byOid[OID_PRT_SERIAL];
    if (serialVb && serialVb.value) {
      serialNumber = Buffer.isBuffer(serialVb.value)
        ? serialVb.value.toString('utf8').trim().replace(/\0/g, '')
        : String(serialVb.value).trim();
      if (!serialNumber) serialNumber = null;
    }

    // --- Page count ---
    let pageCount = null;
    const pageVb = byOid[OID_PRT_PAGE_COUNT];
    if (pageVb !== undefined && pageVb.value !== null) {
      pageCount = Number(pageVb.value);
    }

    // --- Toner consumable ---
    const consumables = [];
    const tonerLevelVb = byOid[OID_TONER_LEVEL];
    const tonerMaxVb   = byOid[OID_TONER_MAX];
    const tonerDescVb  = byOid[OID_TONER_DESC];

    if (tonerLevelVb !== undefined) {
      const tonerLevel = Number(tonerLevelVb.value);
      const tonerMax   = tonerMaxVb ? Number(tonerMaxVb.value) : 0;
      let levelPct = null;

      if (tonerLevel === -3 || tonerLevel === -2) {
        levelPct = null;
      } else if (tonerMax > 0) {
        levelPct = Math.round((tonerLevel / tonerMax) * 100);
      }

      let tonerName = 'Toner';
      if (tonerDescVb && tonerDescVb.value) {
        const raw = Buffer.isBuffer(tonerDescVb.value)
          ? tonerDescVb.value.toString('utf8').trim().replace(/\0/g, '')
          : String(tonerDescVb.value).trim();
        if (raw) tonerName = raw;
      }

      consumables.push({ name: tonerName, levelPct, unit: 'percent' });
    }

    return createPrinterState({
      printerName,
      vendor,
      model,
      serialNumber,
      status,
      isOffline,
      isJam,
      isPaperEmpty,
      isCoverOpen,
      isPrinting,
      pageCount,
      consumables,
      supportedFeatures: ['snmp'],
      provider: 'snmp',
      reachable: true,
    });
  }

  // -------------------------------------------------------------------------
  // isSupported — probe printer via SNMP sysDescr
  // -------------------------------------------------------------------------
  async isSupported(printerName, context) {
    try {
      const community = (context && context.snmpCommunity) || this._community;
      const ip = await this._resolvePrinterIp(printerName);
      if (!ip) return false;

      const varbinds = await this._snmpGet(ip, community, [OID_SYS_DESCR], 2500);
      if (varbinds && varbinds.length > 0) {
        this._cachedIp = ip;
        this._community = community;
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // query — full SNMP poll returning PrinterState
  // -------------------------------------------------------------------------
  async query(printerName, context) {
    try {
      const community = (context && context.snmpCommunity) || this._community;
      let ip = this._cachedIp || (context && context.cachedIp) || null;

      if (!ip) {
        ip = await this._resolvePrinterIp(printerName);
      }
      if (!ip) {
        return createUnreachableState(printerName, 'snmp', 'Printer IP not resolved');
      }

      const allOids = [
        OID_SYS_DESCR,
        OID_SYS_UPTIME,
        OID_HR_PRINTER_STATUS,
        OID_HR_PRINTER_ERRORS,
        OID_PRT_SERIAL,
        OID_PRT_PAGE_COUNT,
        OID_TONER_LEVEL,
        OID_TONER_MAX,
        OID_TONER_DESC,
      ];

      let varbinds;
      try {
        varbinds = await this._snmpGet(ip, community, allOids, 4000);
      } catch (e) {
        if (e.message && e.message.includes('timeout')) {
          return createUnreachableState(printerName, 'snmp', 'SNMP timeout');
        }
        return createUnreachableState(printerName, 'snmp', e.message);
      }

      return this._parsePrinterState(printerName, varbinds);
    } catch (e) {
      return createUnreachableState(printerName, 'snmp', e.message || 'Unknown SNMP error');
    }
  }

  // -------------------------------------------------------------------------
  // dispose — no persistent sockets to clean up
  // -------------------------------------------------------------------------
  async dispose() {
    this._cachedIp = null;
    this._capabilities = null;
  }
}

module.exports = { SnmpProvider };

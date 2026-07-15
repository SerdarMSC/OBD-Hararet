/**
 * Minimal ELM327 AT-command protocol helpers for reading OBD-II PIDs over a
 * classic (SPP) Bluetooth connection.
 *
 * All formulas below are taken from the SAE J1979 standard PID table.
 */

export const ELM327_INIT_COMMANDS = [
    "ATZ",
    "ATE0",
    "ATL0",
    "ATS0",
    "ATH0",
    "ATSP0",
];

export const COOLANT_TEMP_PID = "0105";
export const BATTERY_VOLTAGE_PID = "0142";
export const OIL_TEMP_PID = "015C";
export const EGT_BANK1_PID = "0178";

function isNoDataResponse(cleaned: string): boolean {
  return !cleaned || cleaned.includes("NO DATA") || cleaned.includes("ERROR") || cleaned.includes("UNABLE");
}

/**
 * Splits a raw ELM327 response into 2-character hex byte strings.
 *
 * ATS0 (spaces off, part of our init sequence) makes the adapter send
 * responses as one continuous hex string (e.g. "410584") instead of
 * space-separated bytes ("41 05 84"). Rather than relying on whitespace to
 * delimit bytes, we strip everything down to hex characters only and
 * regroup into 2-character byte pairs ourselves — this works correctly
 * regardless of whether the adapter happens to include spaces or not.
 */
function toHexBytes(raw: string): string[] {
  const cleaned = raw.replace(/[\r\n>]/g, " ").trim().toUpperCase();
  if (isNoDataResponse(cleaned)) return [];
  const hexOnly = cleaned.replace(/[^0-9A-F]/g, "");
  const bytes: string[] = [];
  for (let i = 0; i + 1 < hexOnly.length; i += 2) {
    bytes.push(hexOnly.slice(i, i + 2));
  }
  return bytes;
}

/**
 * Locates the "41 <pidHex>" mode/PID echo in a raw response and returns the
 * data bytes that follow it (the actual payload), or null if that PID's
 * response isn't present (e.g. "NO DATA", a truncated reply, or a
 * completely unrelated response got mixed into the buffer).
 */
function extractPidPayload(raw: string, pidHex: string): string[] | null {
  const bytes = toHexBytes(raw);
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === "41" && bytes[i + 1] === pidHex) {
      return bytes.slice(i + 2);
    }
  }
  return null;
}

/** PID 0105 — Engine coolant temperature. Formula: A - 40 (°C). */
export function parseCoolantTempResponse(raw: string): number | null {
  const payload = extractPidPayload(raw, "05");
  if (!payload || payload.length < 1) return null;
  const a = parseInt(payload[0], 16);
  if (Number.isNaN(a)) return null;
  return a - 40;
}

/** PID 0142 — Control module voltage. Formula: (256*A + B) / 1000 (V). */
export function parseVoltageResponse(raw: string): number | null {
  const payload = extractPidPayload(raw, "42");
  if (!payload || payload.length < 2) return null;
  const a = parseInt(payload[0], 16);
  const b = parseInt(payload[1], 16);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const volts = (a * 256 + b) / 1000;
  return Math.round(volts * 10) / 10;
}

/** PID 015C — Engine oil temperature. Formula: A - 40 (°C). */
export function parseOilTempResponse(raw: string): number | null {
  const payload = extractPidPayload(raw, "5C");
  if (!payload || payload.length < 1) return null;
  const a = parseInt(payload[0], 16);
  if (Number.isNaN(a)) return null;
  return a - 40;
}

/**
 * PID 0178 — Exhaust gas temperature, bank 1. Returns 9 bytes: a support
 * bitmask byte, followed by up to 4 sensors' temperatures (2 bytes each).
 * We read sensor 1 only (bytes 2-3 of the payload), which is the typical
 * single EGT probe placement on most vehicles. Formula per sensor:
 * (256*A + B) / 10 - 40 (°C).
 */
export function parseEgtResponse(raw: string): number | null {
  const payload = extractPidPayload(raw, "78");
  if (!payload || payload.length < 3) return null;
  const supportByte = parseInt(payload[0], 16);
  if (Number.isNaN(supportByte) || (supportByte & 0x01) === 0) {
    // Sensor 1 not flagged as supported by this ECU.
    return null;
  }
  const a = parseInt(payload[1], 16);
  const b = parseInt(payload[2], 16);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const celsius = (a * 256 + b) / 10 - 40;
  return Math.round(celsius);
}

/** Returns true once the ELM327 has sent its end-of-response prompt. */
export function isResponseComplete(buffer: string): boolean {
  return buffer.includes(">");
}

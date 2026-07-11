/**
 * Minimal ELM327 AT-command protocol helpers for reading engine coolant
 * temperature over a classic (SPP) Bluetooth connection.
 *
 * Reference: OBD-II PID 0x05 (Engine coolant temperature).
 * Response format: "41 05 XX" where temperature(°C) = XX(hex) - 40.
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

/** Parses a raw ELM327 response string into a coolant temperature in °C. */
export function parseCoolantTempResponse(raw: string): number | null {
  const cleaned = raw
    .replace(/[\r\n>]/g, " ")
    .trim()
    .toUpperCase();

  if (!cleaned || cleaned.includes("NO DATA") || cleaned.includes("ERROR") || cleaned.includes("UNABLE")) {
    return null;
  }

  // ATS0 (spaces off, part of our init sequence) makes the adapter send
  // responses as one continuous hex string (e.g. "410584") instead of
  // space-separated bytes ("41 05 84"). Rather than relying on whitespace
  // to delimit bytes, strip everything down to hex characters only and
  // regroup into 2-character byte pairs ourselves — this works correctly
  // regardless of whether the adapter happens to include spaces or not.
  const hexOnly = cleaned.replace(/[^0-9A-F]/g, "");
  const bytes: string[] = [];
  for (let i = 0; i + 1 < hexOnly.length; i += 2) {
    bytes.push(hexOnly.slice(i, i + 2));
  }

  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] === "41" && bytes[i + 1] === "05") {
      const byteA = parseInt(bytes[i + 2], 16);
      if (!Number.isNaN(byteA)) {
        return byteA - 40;
      }
    }
  }

  return null;
}

/** Returns true once the ELM327 has sent its end-of-response prompt. */
export function isResponseComplete(buffer: string): boolean {
  return buffer.includes(">");
}

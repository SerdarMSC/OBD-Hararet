/**
 * Minimal ELM327 AT-command protocol helpers for reading engine coolant
 * temperature over a classic (SPP) Bluetooth connection.
 *
 * Reference: OBD-II PID 0x05 (Engine coolant temperature).
 * Response format: "41 05 XX" where temperature(°C) = XX(hex) - 40.
 */

export const ELM327_INIT_COMMANDS = [
  "ATZ", // reset
  "ATE0", // echo off
  "ATL0", // linefeeds off
  "ATS0", // spaces off
  "ATH0", // headers off
  "ATSP0", // auto-detect protocol
];

export const COOLANT_TEMP_PID = "0105";

/** Parses a raw ELM327 response string into a coolant temperature in °C. */
export function parseCoolantTempResponse(raw: string): number | null {
  const cleaned = raw
    .replace(/[\r\n>]/g, " ")
    .trim()
    .toUpperCase();

  if (!cleaned || cleaned.includes("NO DATA") || cleaned.includes("ERROR")) {
    return null;
  }

  const tokens = cleaned.split(/\s+/).filter((token) => /^[0-9A-F]{2}$/.test(token));

  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i] === "41" && tokens[i + 1] === "05") {
      const byteA = parseInt(tokens[i + 2], 16);
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

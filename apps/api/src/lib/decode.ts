/**
 * Decode downloaded CSV bytes with UTF-8 first and Shift_JIS fallback.
 * Japanese official statistics are often distributed as Shift_JIS CSV.
 */
export function decodeBuffer(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(buffer);
  if (!utf8.includes("\uFFFD")) return utf8.replace(/^\uFEFF/, "");
  try {
    const sjis = new TextDecoder("shift_jis").decode(buffer);
    if (!sjis.includes("\uFFFD")) return sjis.replace(/^\uFEFF/, "");
  } catch {
    // TextDecoder("shift_jis") is unavailable in some ICU-less runtimes.
  }
  return utf8.replace(/^\uFEFF/, "");
}

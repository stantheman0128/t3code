/**
 * Maps the active provider driver onto a chrome skin id.
 * Grok Bot shares Grok's surface; unknown drivers still get the generic
 * `[data-provider-chrome]` tokens.
 */
export function resolveProviderChromeDriver(driver: string | null | undefined): string | null {
  if (driver == null || driver.length === 0) return null;
  if (driver === "grokbot") return "grok";
  return driver;
}

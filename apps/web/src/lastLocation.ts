const MAX_LAST_LOCATION_PATH_CHARS = 512;
const MAX_LAST_LOCATION_SEARCH_CHARS = 256;

const EPHEMERAL_PATH_PREFIXES = ["/pair", "/connect"];

export function sanitizeLastLocationPath(pathname: string, search = ""): string | null {
  const normalizedPath = pathname.trim();
  if (
    normalizedPath.length === 0 ||
    normalizedPath === "/" ||
    !normalizedPath.startsWith("/") ||
    normalizedPath.includes("//") ||
    normalizedPath.includes("..") ||
    normalizedPath.length > MAX_LAST_LOCATION_PATH_CHARS
  ) {
    return null;
  }

  for (const prefix of EPHEMERAL_PATH_PREFIXES) {
    if (normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)) {
      return null;
    }
  }

  const normalizedSearch = search.trim();
  if (normalizedSearch.length === 0) {
    return normalizedPath;
  }
  if (
    !normalizedSearch.startsWith("?") ||
    normalizedSearch.length > MAX_LAST_LOCATION_SEARCH_CHARS ||
    /\s/.test(normalizedSearch)
  ) {
    return normalizedPath;
  }

  return `${normalizedPath}${normalizedSearch}`;
}

export function parseStoredLastLocationPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const searchIndex = value.indexOf("?");
  if (searchIndex < 0) {
    return sanitizeLastLocationPath(value);
  }
  return sanitizeLastLocationPath(value.slice(0, searchIndex), value.slice(searchIndex));
}

let lastLocationRestoreConsumed = false;
let restoredToLastLocation = false;

export function consumeLastLocationRestore(storedPath: string | null): string | null {
  if (lastLocationRestoreConsumed) {
    return null;
  }
  lastLocationRestoreConsumed = true;
  const nextPath = parseStoredLastLocationPath(storedPath);
  if (nextPath) {
    restoredToLastLocation = true;
  }
  return nextPath;
}

export function shouldSkipIndexDraftLanding(): boolean {
  return restoredToLastLocation;
}

export function resetLastLocationRestoreForTests(): void {
  lastLocationRestoreConsumed = false;
  restoredToLastLocation = false;
}

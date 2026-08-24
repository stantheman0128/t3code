export interface ClaudePulseHookPayload {
  readonly source: "t3";
  readonly session_id: string;
  readonly hook_event_name: string;
  readonly cwd: string;
  readonly model?: string;
  readonly title?: string;
  readonly notification_type?: string;
}

export function resolveClaudePulsePortFilePath(localAppData: string | undefined): string | null {
  if (!localAppData) return null;
  return `${localAppData.replaceAll("/", "\\")}\\ClaudePulse\\port.txt`;
}

export function parseClaudePulsePortFile(contents: string): number | null {
  const trimmed = contents.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const port = Number(trimmed);
  if (port < 19280 || port > 19289) return null;
  return port;
}

export function defaultClaudePulsePorts(preferred: number | null): number[] {
  const ports: number[] = [];
  if (preferred !== null) ports.push(preferred);
  for (let port = 19280; port <= 19289; port += 1) {
    if (!ports.includes(port)) ports.push(port);
  }
  return ports;
}

/** Pulse's HttpListener is bound to localhost, not 127.0.0.1 (Windows 400). */
export function claudePulseHookUrl(port: number, source = "t3"): string {
  return `http://localhost:${port}/?source=${encodeURIComponent(source)}`;
}

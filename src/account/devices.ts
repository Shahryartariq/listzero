/** "Chrome on Windows", from a user-agent string. Good enough to tell your own devices apart. */
export function describeDevice(agent: string | null | undefined): string {
  if (!agent) return "Unknown device";
  const browser = /Edg\//.test(agent) ? "Edge" : /OPR\//.test(agent) ? "Opera" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const system = /Android/.test(agent) ? "Android" : /iPhone|iPad|iPod/.test(agent) ? "iOS" : /Windows/.test(agent) ? "Windows" : /Mac OS X/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "";
  return system ? `${browser} on ${system}` : browser;
}

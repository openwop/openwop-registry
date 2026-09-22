/**
 * RFC 0203 §A.3 — the `remote` runtime's entry binding.
 *
 * When a v2 node-pack manifest carries `runtime.mcpServer` (an inline MCP
 * Registry record), `runtime.entry` MUST equal `runtime.mcpServer.remotes[0].url`;
 * a manifest where it does not is invalid (`pack_validation_failed`). JSON
 * Schema cannot compare two values, so the corpus schema cannot express this
 * and the publish validator does. Mirrors the corpus reference validator
 * `conformance/src/lib/node-pack-runtime.ts` (`remoteEntryBinding`).
 *
 * Returns null when the manifest satisfies the rule — including every manifest
 * with no `mcpServer` — or a refusal `{ code, message }`.
 *
 * @see openwop/openwop RFCS/0203-remote-runtime-mcp-registry-record.md §A.3
 * @see openwop/openwop spec/v2/core/node-pack-runtimes.md §"The MCP registry record"
 */
const rec = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null);

export function remoteEntryBinding(manifest) {
  const runtime = rec(rec(manifest)?.runtime);
  const record = rec(runtime?.mcpServer);
  if (runtime === null || record === null) return null;
  const url = Array.isArray(record.remotes) ? rec(record.remotes[0])?.url : undefined;
  if (typeof url === 'string' && runtime.entry === url) return null;
  return {
    code: 'pack_validation_failed',
    message: `runtime.entry (${JSON.stringify(runtime.entry)}) MUST equal runtime.mcpServer.remotes[0].url (${JSON.stringify(url)}) — RFC 0203 §A.3`,
  };
}

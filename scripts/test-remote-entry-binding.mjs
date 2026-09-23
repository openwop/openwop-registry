/**
 * RFC 0203 §A.3 publish-validator legs (node --test). The equality the corpus
 * schema cannot express: entry == runtime.mcpServer.remotes[0].url.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remoteEntryBinding } from './lib/remote-entry-binding.mjs';

const URL = 'https://mcp.acme.example/salesforce';
const manifest = (entry, mcpServer) => ({
  kind: 'node', name: 'vendor.acme.salesforce-tools', version: '1.4.2',
  runtime: { language: 'remote', entry, ...(mcpServer === undefined ? {} : { mcpServer }) },
});
const record = (url = URL) => ({ name: 'io.github.acme/salesforce', description: 'Salesforce objects as MCP tools', version: '1.4.2', remotes: [{ type: 'streamable-http', url }] });

test('a matching entry is accepted (the RFC 0203 positive example)', () => {
  assert.equal(remoteEntryBinding(manifest(URL, record())), null);
});

test('a manifest with no mcpServer is out of scope and accepted', () => {
  assert.equal(remoteEntryBinding(manifest(URL)), null);
  assert.equal(remoteEntryBinding({ kind: 'node', runtime: { language: 'javascript', entry: 'index.mjs' } }), null);
});

test('entry != remotes[0].url is refused with pack_validation_failed', () => {
  const r = remoteEntryBinding(manifest('https://other.acme.example/mcp', record()));
  assert.equal(r?.code, 'pack_validation_failed');
});

test('an mcpServer with no remote url is refused, never waved through', () => {
  assert.equal(remoteEntryBinding(manifest(URL, { ...record(), remotes: [] }))?.code, 'pack_validation_failed');
});

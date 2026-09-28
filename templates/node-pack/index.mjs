/**
 * {NAME} — replace with a one-line description of the pack.
 *
 * Each node is a function exported under its `typeId` in `nodes`. The host
 * validates `ctx.inputs` / `ctx.config` against the schemas `pack.json`
 * names, calls the function, and records the returned `outputs`.
 *
 * Zero dependencies: the tarball ships only pack.json, LICENSE, README.md,
 * index.mjs and schemas/. Read host services through `ctx.*`, never import
 * them, and declare each one in pack.json `peerDependencies` (see README).
 */

/**
 * {NAME}.example
 *
 * Pure and replay-safe: the same inputs give the same outputs, and nothing
 * reads the clock or the network. Replace with your real logic.
 */
export async function example(ctx) {
  const trim = ctx.config?.trim ?? true;
  const text = String(ctx.inputs.text);
  return {
    status: 'success',
    outputs: { text: (trim ? text.trim() : text).toUpperCase() },
  };
}

export const nodes = {
  '{NAME}.example': example,
};

export default nodes;

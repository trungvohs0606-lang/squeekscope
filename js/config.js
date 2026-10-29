// Everything you might want to point somewhere else lives here.
// Squeekscope only reads: no keys, no signatures, no transactions.

export const config = Object.freeze({
  // Sepolia JSON-RPC used for eth_getLogs / eth_call. Any CORS-friendly endpoint works.
  rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',

  // Public Squeekchain API (CORS *, no key). /v1/core names the live core, /v1/status is the wheel.
  apiBase: 'https://api.squeekchain.com/v1',

  // Used when /v1/core cannot be reached. This is the live SqueekCore proxy, not the one in the old docs.
  coreFallback: '0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44',
  deploymentBlockFallback: 11998937n,

  // Used only if configuration() cannot be read from the core.
  genesisFallback: 1793022600n, // 2026-10-26T13:50:00Z
  roundDurationFallback: 600n,

  // eth_getLogs window. publicnode answers 50k-block ranges; stay under it.
  logChunk: 45000n,

  explorer: 'https://sepolia.etherscan.io',

  // 19,380,094 mm of wheel travel over 22,073 work units: about 0.878 m per unit.
  metresPerWork: 0.878,

  // How often the live panel asks /v1/status (the API caches it for 1 s).
  statusEveryMs: 15000,
  // How often the round ledger looks for new settlements while the page is open.
  ledgerEveryMs: 90000,
});

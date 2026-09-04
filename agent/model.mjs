// SPDX-License-Identifier: CC0-1.0
//
// The model port. This is the seam the whole design exists to protect.
//
// FLOP's agent bucket is measured by testnet FLOP spent on inference, and that inference runs
// on a miner's GPU serving an open-weight model, not here. This box has 1 CPU and 961 MB and
// could not host a model if it wanted to, which is fine: the agent's job is to *buy* inference,
// not to serve it.
//
// So everything above this file is written against `ask()` and nothing else. Today `provider`
// is "none" and `ask()` refuses. When the testnet opens, a provider is added below and the loop
// that calls it does not change.

export function createModel(config) {
  const provider = config?.provider ?? "none";

  if (provider === "none") {
    return {
      provider,
      configured: false,
      async ask() {
        // Fail closed rather than returning a plausible empty answer. A caller that cannot
        // tell "no model" from "the model said nothing" will eventually act on the second.
        return { ok: false, reason: "no model configured", spent: null };
      },
    };
  }

  throw new Error(`unknown model provider: ${provider}`);
}

#!/usr/bin/env node
import { runLiveActivation } from '../activation/live-activation.mjs';

const result = await runLiveActivation();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(
  result.status === 'LIVE_ACTIVATION_PASS' ? 0
    : result.status === 'PARTIAL' ? 1
      : 2
);

// MAWS vNext — ZCode local interaction surface (MAWS-VN-801).
// Local stdio JSON-lines bridge ONLY: no HTTP, no SSE, no daemon, no listener.
// The ZCode session model is metadata; it never selects executors and never
// mutates routing or the bound graph (OD-18). Approved surface:
// submit_work, get_run, get_work_graph, approve, cancel.
import readline from 'node:readline';
import { newId, nowIso, FailClosedError } from '../vnext/util.mjs';

const APPROVED_METHODS = new Set(['hello', 'submit_work', 'get_run', 'get_work_graph', 'approve', 'cancel']);

export function createStdioBridge({ runSubmitter, runs = new Map(), input = process.stdin, output = process.stdout, now = nowIso }) {
  let sessionModel = null;

  function rejectUnknownMethod(id, method) {
    return { id, error: { code: 'METHOD_NOT_ALLOWED', message: `interaction host may not call ${method}` } };
  }

  async function handle(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return { error: { code: 'BAD_REQUEST', message: 'requests must be single-line JSON objects' } };
    }
    const id = message.id ?? null;
    const method = message.method;
    if (!APPROVED_METHODS.has(method)) {
      return rejectUnknownMethod(id, method);
    }
    const params = message.params || {};

    if (method === 'hello') {
      sessionModel = params.session_model ?? null;
      return { id, result: { bridge: 'maws-zcode-stdio', orchestration_owner: 'maws', session_model_is_executor: false } };
    }

    if (method === 'submit_work') {
      if (typeof params.objective !== 'string' || params.objective.trim() === '') {
        return { id, error: { code: 'BAD_REQUEST', message: 'submit_work requires an objective' } };
      }
      const runId = params.run_id || newId('run');
      const record = {
        run_id: runId,
        session_model: sessionModel,
        objective: params.objective,
        status: 'SUBMITTED',
        created_at: now()
      };
      runs.set(runId, record);
      try {
        const outcome = await runSubmitter({
          runId,
          sessionModel,
          objective: params.objective,
          requiredCapabilities: params.required_capabilities || [{ capability_id: 'cap_repository_analysis' }],
          workloadSafetyClass: params.workload_safety_class || 'safe'
        });
        const merged = runs.get(runId) || record;
        Object.assign(merged, {
          status: outcome.status,
          completion: outcome.completionDecision ? outcome.completionDecision.result : null,
          result_ref: runId
        });
        if (outcome.graph) {
          merged.graph = outcome.graph;
        }
        return { id, result: { run_id: runId, status: merged.status, completion: merged.completion } };
      } catch (error) {
        const record = runs.get(runId);
        if (record) {
          record.status = error instanceof FailClosedError ? 'BLOCKED' : 'FAILED';
          record.error = { code: error.code || 'RUN_FAILED', message: error.message };
        }
        return { id, error: { code: error.code || 'RUN_FAILED', message: error.message } };
      }
    }

    if (method === 'get_run') {
      const record = runs.get(params.run_id);
      if (!record) {
        return { id, error: { code: 'RUN_UNKNOWN', message: `no run ${params.run_id}` } };
      }
      return { id, result: record };
    }

    if (method === 'get_work_graph') {
      const record = runs.get(params.run_id);
      if (!record) {
        return { id, error: { code: 'RUN_UNKNOWN', message: `no run ${params.run_id}` } };
      }
      if (!record.graph) {
        return { id, error: { code: 'GRAPH_NOT_BOUND', message: 'run has no bound graph' } };
      }
      return { id, result: record.graph };
    }

    if (method === 'approve' || method === 'cancel') {
      const record = runs.get(params.run_id);
      if (!record) {
        return { id, error: { code: 'RUN_UNKNOWN', message: `no run ${params.run_id}` } };
      }
      // Human approval/cancel intent is recorded for the orchestrator; the
      // bridge itself grants nothing and mutates no graph.
      record[`${method}_requested_at`] = now();
      return { id, result: { run_id: params.run_id, accepted: true } };
    }

    return rejectUnknownMethod(id, method);
  }

  return {
    handle,
    start() {
      const rl = readline.createInterface({ input });
      rl.on('line', (line) => {
        handle(line).then((response) => {
          output.write(`${JSON.stringify(response)}\n`);
        });
      });
      return rl;
    },
    _sessionModel() {
      return sessionModel;
    }
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith('stdio-bridge.mjs');

if (isMain) {
  // Standalone start requires an injected run submitter; without one the
  // bridge fails closed instead of inventing orchestration.
  const bridge = createStdioBridge({
    runSubmitter: async () => {
      throw new FailClosedError('RUN_SUBMITTER_MISSING', 'start the bridge through the runtime entrypoint that wires the run engine');
    }
  });
  bridge.start();
}

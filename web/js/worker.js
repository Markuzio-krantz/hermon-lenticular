import { initEngine, runScenario, transferables } from './engine.js';

self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      self.postMessage({ type: 'ready', info: initEngine(new Float32Array(m.heights), m.res, m.ext) });
    } else if (m.type === 'run') {
      const r = runScenario(m.params);
      self.postMessage({ type: 'result', id: m.id, r }, transferables(r));
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err && err.stack || err) });
  }
};

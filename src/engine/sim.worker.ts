/// <reference lib="webworker" />
import { runSideCountSim, type SimConfig } from './sidecountSim';

self.onmessage = (e: MessageEvent<SimConfig>) => {
  const cfg = e.data;
  const result = runSideCountSim(cfg, (done) => self.postMessage({ type: 'progress', done, total: cfg.shoes }));
  self.postMessage({ type: 'result', result });
};

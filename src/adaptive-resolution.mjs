// Slow hysteresis avoids resizing GPU attachments in response to single spikes.
export function createAdaptiveResolution() {
  let scale = 1, average = 16.7, samples = 0, elapsed = 0, sinceChange = 0;
  return {
    get scale() { return scale; },
    observe(milliseconds, active = true) {
      if (!active || !Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 150) return false;
      average += (milliseconds - average) * 0.035;
      samples++;
      elapsed += milliseconds / 1000;
      sinceChange += milliseconds / 1000;
      if (elapsed < 5 || samples < 90 || sinceChange < 4) return false;
      const next = average > 23 ? Math.max(0.6, scale - 0.1)
        : average < 17.5 ? Math.min(1, scale + 0.05) : scale;
      if (Math.abs(next - scale) < 0.001) return false;
      scale = Math.round(next * 100) / 100;
      sinceChange = 0;
      return true;
    },
  };
}

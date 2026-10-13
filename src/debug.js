// The ?debug overlay: fps and worst frame over each 0.25 s window (wall clock, unclamped), draw
// calls, triangles, and the latest and worst hall build since the last cell crossing.
export class Debug {
  constructor(renderer) {
    this.renderer = renderer;
    this.t0 = this.last = performance.now(); this.frames = 0; this.worst = 0;
    this.el = document.createElement('pre');
    this.el.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:6px 8px;font:12px/1.4 ui-monospace,monospace;color:#d8d4cc;background:rgba(5,6,10,.6);pointer-events:none;z-index:10';
    document.body.appendChild(this.el);
  }
  update(world) {
    const now = performance.now();
    this.worst = Math.max(this.worst, now - this.last); this.last = now; this.frames++;
    const span = now - this.t0;
    if (span < 250) return;
    const r = this.renderer.info.render;
    this.el.textContent = `fps ${(this.frames * 1000 / span).toFixed(0)} (worst ${this.worst.toFixed(1)} ms)\ncalls ${r.calls}\ntris ${(r.triangles / 1000).toFixed(0)}k\nbuild ${world.lastBuildMs.toFixed(1)} ms (max ${world.maxBuildMs.toFixed(1)})\nqueue ${world.queue.length}`;
    this.t0 = now; this.frames = 0; this.worst = 0;
  }
}

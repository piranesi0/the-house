// The ?debug overlay: fps, draw calls, triangles and the last hall-build time.
export class Debug {
  constructor(renderer) {
    this.renderer = renderer; this.fps = 60; this.acc = 0;
    this.el = document.createElement('pre');
    this.el.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:6px 8px;font:12px/1.4 ui-monospace,monospace;color:#d8d4cc;background:rgba(5,6,10,.6);pointer-events:none;z-index:10';
    document.body.appendChild(this.el);
  }
  update(dt, world) {
    this.fps += ((1 / Math.max(dt, 1e-3)) - this.fps) * 0.05;
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const r = this.renderer.info.render;
    this.el.textContent = `fps ${this.fps.toFixed(0)}\ncalls ${r.calls}\ntris ${(r.triangles / 1000).toFixed(0)}k\nbuild ${world.lastBuildMs.toFixed(1)} ms\nqueue ${world.queue.length}`;
  }
}

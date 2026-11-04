/** Recharts (ResponsiveContainer) necesita ResizeObserver; jsdom no lo trae. */
export function mockResizeObserver(width = 360, height = 224): void {
  class RO {
    private readonly cb: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb
    }
    observe(target: Element) {
      this.cb(
        [{ target, contentRect: { width, height } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver
}

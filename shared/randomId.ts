// 使い捨ての ID。crypto.randomUUID は https か localhost で開いたページでしか使えない。エンジンは AI 戦でブラウザ（aiWorker）でも動くので、
// http の LAN・Tailscale のアドレスでスマホから開くと AI の手番で例外になり、行動できなかった（2026-11-25）。getRandomValues はどこでも使える
export function randomId(): string {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
    const b = crypto.getRandomValues(new Uint8Array(16))
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// 接続を張らずに対戦相手を待つ（サーバー側は server/src/matchTickets.ts）。
// 数秒おきに問い合わせ、相手が決まったら roomId を受け取る。socket をつなぐのは呼び出し側が roomId を受け取ってから
const POLL_MS = 3000
// 続けてこの回数失敗したら諦める（サーバーが止まっていた直後の1〜2回は起動待ちで失敗しうる）
const MAX_FAILURES = 5

export type DeckChoice = { deck: string } | { deckCards: Record<string, number> }
export type WaitHandlers = {
    onWaiting: (waiting: number) => void
    onMatched: (roomId: string) => void
    onFailed: (message: string) => void
}

// 待ちを始める。返り値を呼ぶと待ちをやめる（サーバーの列からも外す）
export function waitForOpponent(pool: string, deck: DeckChoice, handlers: WaitHandlers): () => void {
    let ticket: string | undefined
    let stopped = false
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const leave = () => {
        if (ticket) navigator.sendBeacon("/api/match/cancel", new Blob([JSON.stringify({ ticket })], { type: "application/json" }))
    }
    const stop = () => {
        stopped = true
        clearTimeout(timer)
        document.removeEventListener("visibilitychange", onVisible)
        window.removeEventListener("pagehide", leave)
    }
    const poll = async () => {
        clearTimeout(timer)
        try {
            const res = await fetch("/api/match/wait", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ticket, pool, ...deck }),
            })
            const body = (await res.json()) as { ticket?: string; waiting?: number; roomId?: string; error?: string }
            if (stopped) return
            failures = 0
            if (body.error) {
                stop()
                return handlers.onFailed(body.error)
            }
            if (body.roomId) {
                stop()
                return handlers.onMatched(body.roomId)
            }
            ticket = body.ticket
            handlers.onWaiting(body.waiting ?? 1)
        } catch {
            if (stopped) return
            if (++failures >= MAX_FAILURES) {
                stop()
                return handlers.onFailed("サーバーに接続できませんでした。もう一度お試しください")
            }
        }
        timer = setTimeout(poll, POLL_MS)
    }
    // 裏に回したタブはブラウザがタイマーを間引くので、その間に列から外れることがある。表に戻ったらすぐ並び直す
    const onVisible = () => {
        if (document.visibilityState === "visible") void poll()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("pagehide", leave)
    void poll()

    return () => {
        if (stopped) return
        stop()
        leave()
    }
}

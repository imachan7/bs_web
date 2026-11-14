// smoke パート945（接続を張らずに相手を待つ受付：先着順の組み合わせ・待ち場所の分離・期限切れ。docs/ops/DEPLOY_CLOUDRUN.md §5.2）
import { assert } from "./helpers"
import { MatchTickets, TICKET_ALIVE_MS } from "../../server/src/matchTickets"

console.log("=== 相手待ちの受付 ===")
{
    let now = 1000
    let rooms = 0
    const tickets = new MatchTickets(() => `match-${++rooms}`, () => now)
    const ticketOf = (r: ReturnType<MatchTickets["poll"]>): string => ("ticket" in r ? r.ticket : "")

    const a = tickets.poll(undefined, "random")
    assert("ticket" in a && a.waiting === 1, "1人目は待ちになり、待ち人数は自分の1人")
    const a2 = tickets.poll(ticketOf(a), "random")
    assert(ticketOf(a2) === ticketOf(a) && "waiting" in a2 && a2.waiting === 1, "同じ ticket で聞き直しても二重に並ばない")

    const r = tickets.poll(undefined, "room:abc")
    assert("ticket" in r && r.waiting === 1, "待ち場所が違えば組まれない（合言葉ルームとランダムマッチ）")

    const b = tickets.poll(undefined, "random")
    assert("roomId" in b && b.roomId === "match-1", "2人目が来たら、その場で roomId を受け取る")
    const a3 = tickets.poll(ticketOf(a), "random")
    assert("roomId" in a3 && a3.roomId === "match-1", "先に待っていた側は、次の問い合わせで同じ roomId を受け取る")
    assert(!tickets.has(ticketOf(a)), "受け取った ticket は残らない")

    const c = tickets.poll(undefined, "random")
    assert("ticket" in c && c.waiting === 1, "組まれた2人は列に残らず、次の人は待ちになる")
    now += TICKET_ALIVE_MS + 1
    const d = tickets.poll(undefined, "random")
    assert("ticket" in d && d.waiting === 1, "問い合わせが途絶えた待ち（閉じたタブ）とは組まれない")
    const c2 = tickets.poll(ticketOf(c), "random")
    assert("roomId" in c2, "期限が切れた ticket で聞くと新しく並び直し、待っている人と組まれる")

    const e = tickets.poll(undefined, "random")
    tickets.cancel(ticketOf(e))
    const f = tickets.poll(undefined, "random")
    assert("ticket" in f && f.waiting === 1, "取り消した待ちとは組まれない")

    const g1 = tickets.poll(undefined, "room:x")
    const g2 = tickets.poll(undefined, "room:x")
    const g3 = tickets.poll(undefined, "room:x")
    assert("roomId" in g2 && "ticket" in g3 && "roomId" in tickets.poll(ticketOf(g1), "room:x"), "同じ合言葉の3人目は、先の2人とは別に待つ")
}

console.log("すべてのチェックに合格しました 🎉（part945）")

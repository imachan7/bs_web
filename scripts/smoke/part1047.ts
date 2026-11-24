// smoke パート1047（ロビー表示と公開ルーム：host の掲示・joinOnly の空振り・期限切れ。server/src/matchTickets.ts）
import { assert } from "./helpers"
import { MatchTickets, TICKET_ALIVE_MS } from "../../server/src/matchTickets"

console.log("=== 公開ルームとロビー ===")
{
    let now = 1000
    let rooms = 0
    const t = new MatchTickets(() => `match-${++rooms}`, () => now)
    const ticketOf = (r: ReturnType<MatchTickets["poll"]>): string => ("ticket" in r ? r.ticket : "")

    t.poll(undefined, "random")
    const h = t.poll(undefined, "pub:aaa", { host: { name: "たろう" } })
    let l = t.lobby()
    assert(l.random === 1, "random の数は random の待ちだけ数える")
    assert(l.rooms.length === 1 && l.rooms[0]!.pool === "pub:aaa" && l.rooms[0]!.name === "たろう" && l.rooms[0]!.since === 1000, "host 付きで並ぶと名前つきで一覧に出る")

    now += 3000
    t.poll(ticketOf(h), "pub:aaa", { host: { name: "たろう" } })
    assert(t.lobby().rooms[0]!.since === 1000, "聞き直しても since は最初の時刻のまま")

    const j = t.poll(undefined, "pub:aaa", { joinOnly: true })
    assert("roomId" in j && j.roomId === "match-1", "joinOnly で来た人は待っている人と当たる")
    assert(t.lobby().rooms.length === 0, "当たった部屋は一覧から消える")
    const h2 = t.poll(ticketOf(h), "pub:aaa", { host: { name: "たろう" } })
    assert("roomId" in h2 && h2.roomId === "match-1", "待っていた側も同じ roomId を受け取る")

    const before = t.lobby()
    const g = t.poll(undefined, "pub:zzz", { joinOnly: true })
    assert("gone" in g, "誰もいない pool に joinOnly で来ると gone")
    const after = t.lobby()
    assert(after.random === before.random && after.rooms.length === 0, "gone のあと、ロビーには何も増えない")
    assert(!("gone" in t.poll(undefined, "pub:zzz", { host: { name: "x" } })), "空振りのあとでも、host なら普通に並べる")

    const g2 = t.poll(undefined, "pub:aaa", { joinOnly: true })
    assert("gone" in g2, "当たった後の3人目の joinOnly は gone")

    now += TICKET_ALIVE_MS + 1
    const l2 = t.lobby()
    assert(l2.rooms.length === 0 && l2.random === 0, "期限を過ぎた host はロビーから消える")
}

console.log("すべてのチェックに合格しました 🎉（part1047）")

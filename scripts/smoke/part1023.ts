// smoke パート1023（#631 GX24：AI は、フラッシュ効果が何もできないときは「その後コストを支払う」を断る。2026-11-20 ユーザー決定）
import { check, nmOf } from "./lib631"
import { VAN } from "./lib631"
import { scenario } from "./scenario"
import { decideAiAction } from "../../server/src/ai"

if (check("GX24", "ジャスティスバースト", "magic", 6)) {
    const dn = nmOf("GX24")
    scenario({
        name: "GX24-AI：ライフが3→2でフラッシュ効果（ライフが1のとき）が何もできないとき、払う確認を断る",
        start: {
            names: { me: "ジャスティス立花", opp: "ユウキ" }, turn: "opp", phase: "attack", interactive: true,
            me: { burst: "GX24", life: 3 },
            opp: { spirits: [{ card: VAN, label: "O" }] },
        },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.closeFlash()
            t.act("me", { type: "takeLife" })
            for (let i = 0; i < 10 && t.state.pendingChoice; i++) {
                const move = decideAiAction(t.state, t.me)
                if (move === null) break
                t.act("me", move.action)
            }
        },
        expect: ["相手.O.疲労: false → true", "自分.バースト: ジャスティスバースト → なし", "自分.ライフ: 3 → 2", "自分.リザーブ: 10 → 11", `自分.トラッシュ: なし → ${dn}`],
    })
}

console.log("すべてのチェックに合格しました 🎉（part1023）")

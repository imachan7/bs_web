// smoke パート1023（#631 GX24：AI は、バースト効果そのものが何もできないときは発動を断る。2026-11-20 ユーザー決定）
import { check } from "./lib631"
import { VAN } from "./lib631"
import { scenario } from "./scenario"
import { decideAiAction } from "../../server/src/ai"
import { BURST_POLICY } from "../../server/src/ai/policy"

if (check("GX24", "ジャスティスバースト", "magic", 6)) {
    scenario({
        name: "GX24-AI：ライフが3→2でフラッシュ効果（ライフが1のとき）が何もできないとき、バースト効果そのものが何もできないので発動を断り、バーストは伏せたまま残る",
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
                const move = decideAiAction(t.state, t.me, new Set(), BURST_POLICY)
                if (move === null) break
                t.act("me", move.action)
            }
        },
        expect: ["相手.O.疲労: false → true", "自分.ライフ: 3 → 2", "自分.リザーブ: 10 → 11"],
    })
}

console.log("すべてのチェックに合格しました 🎉（part1023）")

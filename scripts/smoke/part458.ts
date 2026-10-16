// smoke パート458（「この効果はターンに1回しか使えない」は同じカード名で1回。ユーザー提供のルール 2026-10-01）
// 「ターンに1回、Aする。」は個体ごと、「Aする。この効果はターンに1回しか使えない。」は同名全体（プレイヤーごと）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const SWORD = "SD06-011"
const BARRIER = "BS13-070"
const SLAY = "BS11-032"
const VANILLA_NAME = "ロクケラトプス" // 既定のデッキ（バニラ）

console.log("=== 前提: カードの機械確認 ===")
const burstCard = ALL_CARDS.find((c) => c.effects.some((e) => e.kind === "burst"))!
const attacker4 = ALL_CARDS.find((c) => c.type === "spirit" && c.effects.length === 0 && c.cost >= 4)!
const enemy5 = ALL_CARDS.find((c) => c.type === "spirit" && c.effects.length === 0 && c.cost >= 5)!
const coresAt = (id: string, lv: number) => getCard(id).levels.find((l) => l.level === lv)!.cores
assert(getCard(SWORD).name === "英雄皇の神剣" && getCard(SWORD).type === "nexus" && coresAt(SWORD, 2) === 2, "SWORDは英雄皇の神剣（Lv2 コア2）")
assert(getCard(BARRIER).name === "星宿の障壁" && getCard(BARRIER).type === "nexus" && coresAt(BARRIER, 2) === 2, "BARRIERは星宿の障壁（Lv2 コア2）")
assert(getCard(SLAY).name === "天王神獣スレイ・ウラノス" && getCard(SLAY).type === "spirit" && coresAt(SLAY, 2) === 2, "SLAYはスレイ・ウラノス（Lv2 コア2）")
assert(burstCard !== undefined && attacker4.cost >= 4 && enemy5.cost >= 5, `バースト持ち=${burstCard.name} / コスト4以上=${attacker4.name} / コスト5以上=${enemy5.name}`)

// 非対話の自動選択のまま、バーストをセットする
const setBurstExpect = (extra: string[] = []) => [
    `自分.手札: ${burstCard.name} → ${VANILLA_NAME}`,
    "自分.デッキ枚数: 40 → 39",
    `自分.バースト: なし → ${burstCard.name}`,
    ...extra,
]

console.log("=== 1. 神剣2枚：バーストをセットしてもドローは1枚だけ（同名で1回） ===")
scenario({
    name: "sword-two-copies",
    start: { me: { hand: [burstCard.cardId], nexuses: [{ card: SWORD, label: "神剣A", cores: 2 }, { card: SWORD, label: "神剣B", cores: 2 }] } },
    steps: (t) => t.act("me", { type: "setBurst", handIndex: 0 }),
    expect: setBurstExpect(),
})

console.log("=== 2. 対照：神剣1枚なら1枚ドローする ===")
scenario({
    name: "sword-one-copy",
    start: { me: { hand: [burstCard.cardId], nexuses: [{ card: SWORD, cores: 2 }] } },
    steps: (t) => t.act("me", { type: "setBurst", handIndex: 0 }),
    expect: setBurstExpect(),
})

console.log("=== 3. 障壁2枚：ライフを減らされても回復は1回だけ（ライフ 5→4→5 で差分なし、疲労するのは1枚だけ） ===")
{
    const expect: string[] = []
    scenario({
        name: "barrier-two-copies",
        start: {
            turn: "opp",
            me: { nexuses: [{ card: BARRIER, label: "障壁A", cores: 2 }, { card: BARRIER, label: "障壁B", cores: 2 }] },
            opp: { spirits: [{ card: attacker4.cardId, label: "アタッカー" }] },
        },
        steps(t) {
            expect.length = 0
            t.act("opp", { type: "nextPhase" })
            t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
            t.closeFlash()
            t.act("me", { type: "takeLife" })
            const rested = ["障壁A", "障壁B"].filter((l) => t.inst(l).isRested)
            assert(rested.length === 1, `疲労した障壁はちょうど1枚（実際 ${rested.length} 枚）`)
            expect.push("相手.アタッカー.疲労: false → true", "自分.リザーブ: 10 → 11") // 減ったライフのコアがリザーブへ。障壁はボイドから置くのでリザーブは減らない
            for (const l of rested) expect.push(`自分.${l}.疲労: false → true`)
        },
        expect,
    })
}

console.log("=== 4. スレイ・ウラノス2体：2体目のアタック時効果は発揮されない（同名で1回） ===")
{
    // 戻す対象は敵1を選ぶ（選択の中身ではなく、2回目に発揮されるか否かを見る）
    const drive = (t: ScenarioCtx) => {
        while (t.state.pendingChoice) {
            const pc = t.state.pendingChoice
            const side = pc.pid === t.me ? "me" : "opp"
            if (pc.kind === "option") t.act(side, { type: "resolveChoice", option: pc.options!.includes("発動する") ? "発動する" : pc.options![0]! })
            else t.act(side, { type: "resolveChoice", instanceId: pc.candidates.includes(t.inst("敵1").instanceId) ? t.inst("敵1").instanceId : pc.candidates[0]! })
        }
    }
    scenario({
        name: "slay-two-copies",
        start: {
            interactive: true,
            phase: "main",
            me: { spirits: [{ card: SLAY, label: "スレイ1", cores: 2 }, { card: SLAY, label: "スレイ2", cores: 2 }] },
            opp: { spirits: [{ card: enemy5.cardId, label: "敵1" }, { card: enemy5.cardId, label: "敵2" }] },
        },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("スレイ1") })
            drive(t)
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
            drive(t)
            t.act("me", { type: "attack", instanceId: t.id("スレイ2") })
            drive(t)
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
            drive(t)
        },
        expect: [
            "自分.スレイ1.疲労: false → true",
            "自分.スレイ2.疲労: false → true",
            "相手.敵1.場所: フィールド → なし", // 1体目のアタック時に手札へ
            `相手.手札: なし → ${enemy5.name}`, // 手札へ戻るのは1体だけ。敵2は場に残る
            "相手.ライフ: 5 → 3",
            "相手.リザーブ: 10 → 13", // ライフのコア2個＋手札へ戻った敵1のコア1個
        ],
    })
}

console.log("すべてのチェックに合格しました 🎉（part458）")

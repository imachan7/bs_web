// smoke パート455（ネクサスの効果が順番選択を挟んでも発生源を見失わない。BS08-055 竜騎集う円卓＋BS06-081 賢者の樹の実）
// 2026-10-01：順番選択のあと発生源を引き直せず色が落ち、【装甲：赤】のスピリットが円卓で破壊されていた
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const ENTAKU = "BS08-055"
const KINOMI = "BS06-081"
const ARMOR = "BS03-037" // ラタトスカ（白・Lv1 BP1000・【装甲：赤】のみ）
const VANILLA = "BS01-002" // ロクケラトプス（赤・Lv1 BP1000・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ENTAKU).name === "竜騎集う円卓" && getCard(ENTAKU).type === "nexus" && getCard(ENTAKU).colors.includes("red"), "ENTAKUは赤のネクサス竜騎集う円卓")
    assert(getCard(KINOMI).name === "賢者の樹の実" && getCard(KINOMI).type === "nexus", "KINOMIはネクサス賢者の樹の実")
    assert(getCard(ARMOR).name === "ラタトスカ" && getCard(ARMOR).effects.length === 1, "ARMORは【装甲：赤】だけのラタトスカ")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effects.length === 0, "VANILLAは効果なし")
}

// 相手のアタックをライフで受けると、円卓と樹の実が同時に誘発し、ターンプレイヤー（相手）が順番を選ぶ
function attackAndChoose(attacker: string, pick: 0 | 1) {
    return (t: Parameters<Parameters<typeof scenario>[0]["steps"]>[0]) => {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id(getCard(attacker).name) })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        const pc = t.state.pendingChoice
        assert(pc !== null && pc.kind === "option" && (pc.options ?? []).length === 2, "円卓と樹の実の順番選択が出る")
        if (pc) t.act(pc.pid === t.me ? "me" : "opp", { type: "resolveChoice", option: pc.options![pick]! })
        while (t.state.pendingChoice) {
            const next = t.state.pendingChoice
            t.act(next.pid === t.me ? "me" : "opp", next.kind === "option" ? { type: "resolveChoice", option: next.options![0]! } : { type: "resolveChoice", instanceId: next.candidates[0]! })
        }
    }
}

const nexuses = [{ card: ENTAKU, cores: 0 }, { card: KINOMI, cores: 0 }]

for (const pick of [0, 1] as const) {
    console.log(`=== 1-${pick}. 【装甲：赤】のアタッカーは円卓で破壊されない（順番選択で${pick + 1}番目を先に） ===`)
    scenario({
        name: `entaku-armor-${pick}`,
        start: { turn: "opp", interactive: true, me: { nexuses }, opp: { spirits: [{ card: ARMOR }] } },
        steps: attackAndChoose(ARMOR, pick),
        expect: [
            "相手.ラタトスカ.疲労: false → true",
            "自分.ライフ: 5 → 4",
            "自分.リザーブ: 10 → 12", // ライフのコア1個＋樹の実のボイドから1個
        ],
    })

    console.log(`=== 2-${pick}. 装甲の無いアタッカーは円卓で破壊される（対照） ===`)
    scenario({
        name: `entaku-vanilla-${pick}`,
        start: { turn: "opp", interactive: true, me: { nexuses }, opp: { spirits: [{ card: VANILLA }] } },
        steps: attackAndChoose(VANILLA, pick),
        expect: [
            "相手.ロクケラトプス.場所: フィールド → なし",
            "相手.トラッシュ: なし → ロクケラトプス",
            "相手.リザーブ: 10 → 11", // 破壊されたスピリットのコア
            "自分.ライフ: 5 → 4",
            "自分.リザーブ: 10 → 12",
        ],
    })
}

console.log("すべてのチェックに合格しました 🎉（part455）")

// smoke パート850（BS23-038 冒険天使チャール：召喚時に黄のブレイヴを手元に置いてドロー・相手のアタックステップの回復状態のアタックでライフが減らない）
// 公式Q&A Q4538〜Q4543（docs/design/BS23_PLAN.md §1）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const CHAAL = "BS23-038" // 冒険天使チャール（黄・コスト3・軽減黄1・シンボル黄1）
const PERY = "BS11-058" // 神弓鳥ペリュトーン（黄ブレイヴ・コスト5・軽減黄2白2・スピリット状態 Lv1 コア1 BP4000）
const PANDA = "BS21-063" // ぐるみパンダ（黄ブレイヴ・コスト4）
const VESPER = "BS11-052" // 魔銃ヴェスパー（紫ブレイヴ。黄でないのでオープンされない）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1。山札・手札の埋め草）
const QUAGGA = "BS19-027" // オウゴンオニクワガー（緑・Lv2 コア3。ターン最初のアタックで回復し、アタック時にリザーブへコア1個）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CHAAL).name === "冒険天使チャール" && getCard(CHAAL).cost === 3, "CHAAL")
    assert(getCard(PERY).name === "神弓鳥ペリュトーン" && getCard(PERY).type === "brave" && getCard(PERY).colors[0] === "yellow", "PERY")
    assert(getCard(PANDA).name === "ぐるみパンダ" && getCard(PANDA).type === "brave" && getCard(PANDA).colors[0] === "yellow", "PANDA")
    assert(getCard(VESPER).name === "魔銃ヴェスパー" && getCard(VESPER).colors[0] === "purple", "VESPER")
    assert(getCard(QUAGGA).name === "オウゴンオニクワガー" && getCard(VANILLA).name === "ロクケラトプス", "QUAGGA / VANILLA")
}

const names = (...n: string[]) => (n.length ? n.sort().join("、") : "なし")
const handIdx = (t: ScenarioCtx, cardId: string) => t.state.players[t.me].hand.indexOf(cardId)
const summonChaal = (t: ScenarioCtx) => t.act("me", { type: "summon", handIndex: handIdx(t, CHAAL) })
const CHAAL_LINES = (label: string) => [
    `自分.${label}.場所: なし → フィールド`, `自分.${label}.疲労: なし → false`, `自分.${label}.コア: なし → 1`,
    `自分.${label}.Lv: なし → 1`, `自分.${label}.BP: なし → 2000`,
]

console.log("=== 1. 召喚時：黄のブレイヴ（最大3枚）を手元に置き、1枚につき1枚ドロー。黄でないブレイヴは対象外 ===")
// チャールのコスト3＋維持コア1＝リザーブ4。手元のブレイヴは手札に数えない
scenario({
    name: "chaal-open-draw",
    start: { me: { reserve: 12, hand: [CHAAL, PERY, PANDA, VESPER] } },
    steps: summonChaal,
    expect: [
        ...CHAAL_LINES("冒険天使チャール"),
        `自分.手札: ${names("冒険天使チャール", "神弓鳥ペリュトーン", "ぐるみパンダ", "魔銃ヴェスパー")} → ${names("魔銃ヴェスパー", "ロクケラトプス", "ロクケラトプス")}`,
        "自分.デッキ枚数: 40 → 38", "自分.リザーブ: 12 → 8", "自分.トラッシュのコア: 0 → 3",
    ],
})

console.log("=== 2. 手元に置いたブレイヴは、ゲーム終了時まで手札と同様に使える（手元から召喚できる） ===")
// ペリュトーン：コスト5−黄シンボル（チャール）1×軽減黄 → 4、スピリット状態の維持コア1
scenario({
    name: "chaal-tegamoto-summon",
    start: { me: { reserve: 12, hand: [CHAAL, PERY, PERY] } },
    steps: (t) => {
        summonChaal(t)
        t.act("me", { type: "summon", handIndex: 0, fromTegamoto: true })
    },
    expect: [
        ...CHAAL_LINES("冒険天使チャール"),
        "自分.神弓鳥ペリュトーン.場所: なし → フィールド", "自分.神弓鳥ペリュトーン.疲労: なし → false", "自分.神弓鳥ペリュトーン.コア: なし → 1",
        "自分.神弓鳥ペリュトーン.Lv: なし → 1", "自分.神弓鳥ペリュトーン.BP: なし → 4000",
        `自分.手札: ${names("冒険天使チャール", "神弓鳥ペリュトーン", "神弓鳥ペリュトーン")} → ${names("ロクケラトプス", "ロクケラトプス")}`,
        "自分.デッキ枚数: 40 → 38", "自分.リザーブ: 12 → 3", "自分.トラッシュのコア: 0 → 7",
    ],
})

console.log("=== 3. ドローできる枚数までしかオープンできない（Q4541）。山札1枚ならオープンは1枚 ===")
scenario({
    name: "chaal-deck-limit",
    start: { me: { reserve: 12, hand: [CHAAL, PERY, PERY], deck: [VANILLA] } },
    steps: summonChaal,
    expect: [
        ...CHAAL_LINES("冒険天使チャール"),
        `自分.手札: ${names("冒険天使チャール", "神弓鳥ペリュトーン", "神弓鳥ペリュトーン")} → ${names("神弓鳥ペリュトーン", "ロクケラトプス")}`,
        "自分.デッキ枚数: 1 → 0", "自分.リザーブ: 12 → 8", "自分.トラッシュのコア: 0 → 3",
    ],
})

console.log("=== 4. この効果はターンに1回（カード名ごと＝Q4543）。2体目のチャールでは手札の黄ブレイヴを置けない ===")
// 1体目のドローでペリュトーンが手札に入る。2体目は黄シンボルで軽減され 3−1＝2 ＋維持コア1
scenario({
    name: "chaal-once-per-turn",
    start: { me: { reserve: 12, hand: [CHAAL, CHAAL, PERY], deck: [PERY, ...Array.from({ length: 39 }, () => VANILLA)] } },
    steps: (t) => {
        summonChaal(t)
        summonChaal(t)
    },
    expect: [
        ...CHAAL_LINES("冒険天使チャール"), ...CHAAL_LINES("冒険天使チャール#2"),
        `自分.手札: ${names("冒険天使チャール", "冒険天使チャール", "神弓鳥ペリュトーン")} → ${names("神弓鳥ペリュトーン")}`,
        "自分.デッキ枚数: 40 → 39", "自分.リザーブ: 12 → 5", "自分.トラッシュのコア: 0 → 5",
    ],
})

console.log("=== 5. オープンするかは選べる（Q4540）。断れば手札のまま・ドローなし ===")
scenario({
    name: "chaal-decline",
    start: { me: { reserve: 12, hand: [CHAAL, PERY], deck: [VANILLA] }, },
    steps: (t) => {
        t.state.interactiveTargets = true
        summonChaal(t)
        for (let i = 0; i < 5 && t.state.pendingChoice !== null && t.state.pendingChoice.pid === t.me; i++) t.act("me", { type: "resolveChoice" })
        assert(t.state.pendingChoice === null, "断ったあとは選択待ちが残らない")
    },
    expect: [
        ...CHAAL_LINES("冒険天使チャール"),
        `自分.手札: ${names("冒険天使チャール", "神弓鳥ペリュトーン")} → ${names("神弓鳥ペリュトーン")}`,
        "自分.リザーブ: 12 → 8", "自分.トラッシュのコア: 0 → 3",
    ],
})

console.log("=== 6. Lv2：相手の回復状態のスピリットのアタックでは自分のライフが減らない ===")
// クワガーはアタックで疲労した直後に『ターンの最初のアタック』で回復するので、ダメージ時点で回復状態。アタック時のコア1個は相手のリザーブへ
const OPP_ATTACK = (t: ScenarioCtx, attacker: string) => {
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id(attacker) })
    t.closeFlash()
    t.act("me", { type: "takeLife" })
}
scenario({
    name: "chaal-no-lifeloss-lv2",
    start: { turn: "opp", me: { spirits: [{ card: CHAAL, cores: 2 }] }, opp: { spirits: [{ card: QUAGGA, cores: 3 }] } },
    steps: (t) => OPP_ATTACK(t, "オウゴンオニクワガー"),
    expect: ["相手.リザーブ: 10 → 11"],
})
scenario({
    name: "chaal-no-lifeloss-lv3",
    start: { turn: "opp", me: { spirits: [{ card: CHAAL, cores: 3 }] }, opp: { spirits: [{ card: QUAGGA, cores: 3 }] } },
    steps: (t) => OPP_ATTACK(t, "オウゴンオニクワガー"),
    expect: ["相手.リザーブ: 10 → 11"],
})

console.log("=== 7. 効かない場面：Lv1／疲労状態のままのアタッカー ===")
scenario({
    name: "chaal-lv1-lifeloss",
    start: { turn: "opp", me: { spirits: [{ card: CHAAL, cores: 1 }] }, opp: { spirits: [{ card: QUAGGA, cores: 3 }] } },
    steps: (t) => OPP_ATTACK(t, "オウゴンオニクワガー"),
    expect: ["相手.リザーブ: 10 → 11", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "chaal-rested-attacker",
    start: { turn: "opp", me: { spirits: [{ card: CHAAL, cores: 2 }] }, opp: { spirits: [{ card: VANILLA, cores: 1 }] } },
    steps: (t) => OPP_ATTACK(t, "ロクケラトプス"),
    expect: ["相手.ロクケラトプス.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part850）")

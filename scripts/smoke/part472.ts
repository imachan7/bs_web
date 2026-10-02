// smoke パート472（ネクサスを戻す「〜することで」も、払えないなら確認を出さず理由をログに出す。COST_MODEL §10）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const TOWER = "SD02-014" // 魔法監視塔：自分のフィールド/リザーブのコア1個をトラッシュに置くことで、破壊されたネクサスを戻す
const OTHER = "BS01-112" // 破壊される側のネクサス
const JAVELIN = "BS06-091" // バスタージャベリン：ネクサス1つを破壊する

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TOWER).name === "魔法監視塔" && getCard(TOWER).type === "nexus", "TOWERは魔法監視塔")
    assert(getCard(OTHER).type === "nexus", `OTHERはネクサス（${getCard(OTHER).name}）`)
    assert(getCard(JAVELIN).name === "バスタージャベリン" && getCard(JAVELIN).cost === 3, "JAVELINはバスタージャベリン")
}

function destroyOther(t: ScenarioCtx): { confirms: number; lines: string[] } {
    const before = t.state.log.length
    let confirms = 0
    t.act("opp", { type: "castMagic", handIndex: 0 })
    for (let i = 0; i < 10 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "option" && pc.confirm) {
            confirms++
            t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        } else if (pc.kind === "option") {
            t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        } else {
            t.act(side, { type: "resolveChoice", instanceId: t.id(getCard(OTHER).name) })
        }
    }
    return { confirms, lines: t.state.log.slice(before) }
}

const name = getCard(TOWER).name
for (const interactive of [true, false]) {
    console.log(`=== ${interactive ? "対話" : "非対話"}：自分のリザーブもスピリットのコアも無い → 確認を出さず、理由をログに出す ===`)
    scenario({
        name: `tower-unpayable-${interactive}`,
        start: {
            turn: "opp",
            interactive,
            me: { reserve: 0, nexuses: [{ card: OTHER, cores: 0 }, { card: TOWER, cores: 0 }] },
            opp: { hand: [JAVELIN] },
        },
        steps(t) {
            const { confirms, lines } = destroyOther(t)
            assert(confirms === 0, `確認は出ない（実際 ${confirms} 回）`)
            const hit = lines.filter((l) => l.includes(name) && l.includes("発動しなかった"))
            assert(hit.length === 1 && hit[0]!.includes("コア"), `理由つきの不発の行が1行（${hit.join(" / ")}）`)
        },
        expect: [
            `自分.${getCard(OTHER).name}.場所: ネクサス → なし`,
            `自分.トラッシュ: なし → ${getCard(OTHER).name}`,
            "相手.手札: バスタージャベリン → ロクケラトプス",
            "相手.デッキ枚数: 40 → 39",
            "相手.トラッシュ: なし → バスタージャベリン",
            "相手.リザーブ: 10 → 7",
            "相手.トラッシュのコア: 0 → 3",
        ],
    })
}

console.log("=== 非対話：リザーブにコアがあれば払って戻る ===")
scenario({
    name: "tower-payable",
    start: {
        turn: "opp",
        me: { reserve: 1, nexuses: [{ card: OTHER, cores: 0 }, { card: TOWER, cores: 0 }] },
        opp: { hand: [JAVELIN] },
    },
    steps(t) {
        const { confirms } = destroyOther(t)
        assert(confirms === 0, `非対話なので確認は出ない（実際 ${confirms} 回）`)
    },
    expect: [
        "自分.リザーブ: 1 → 0",
        "自分.トラッシュのコア: 0 → 1",
        "相手.手札: バスタージャベリン → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → バスタージャベリン",
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュのコア: 0 → 3",
    ],
})

console.log("=== 対話：リザーブにコアがあれば確認が出て、押すと戻る。ジャベリンのドローは確認の後 ===")
scenario({
    name: "tower-payable-interactive",
    start: {
        turn: "opp",
        interactive: true,
        me: { reserve: 1, nexuses: [{ card: OTHER, cores: 0 }, { card: TOWER, cores: 0 }] },
        opp: { hand: [JAVELIN] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        // 確認待ちの間は、相手（ジャベリンの使用者）はまだドローしていない
        assert(t.state.pendingChoice?.confirm === true, "魔法監視塔の確認が出る")
        assert(t.state.players[t.opp].hand.length === 0, "確認の解決前にドローしない")
        t.act("me", { type: "resolveChoice", option: t.state.pendingChoice!.options![0]! })
        assert(t.state.pendingChoice === null, "確認は1回で終わる")
    },
    expect: [
        "自分.リザーブ: 1 → 0",
        "自分.トラッシュのコア: 0 → 1",
        "相手.手札: バスタージャベリン → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → バスタージャベリン",
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュのコア: 0 → 3",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part472）")

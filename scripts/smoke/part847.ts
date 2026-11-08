// smoke パート847（BS23 B5：072 戒めの天空の祠 Lv2 の無償召喚・053 ティンバートール。BS23_PLAN §1・Q4578・Q22556。実装前に書いた期待値テスト）
import { act, assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const HOKORA = "BS23-072" // 戒めの天空の祠（Lvコア0/5）
const TIMBER = "BS23-053" // ティンバートール（青・異合・コスト6・軽減青3緑1・Lv1コア1 BP5000／Lv2コア4 BP8000）
const DORAT = "BS20-046" // ドラットフィッシュ（青・コスト2・異合・Lv1 BP4000）
const STAGGER = "BS12-041" // スタッガー（青・コスト1・異合・Lv1 BP2000・コア1個で召喚）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・異合でない）
const BEETLE = "BS01-050" // ビートビートル（緑・コスト0・シンボル緑1）
const KAMOONE = "BS20-049" // カモオネ（青・コスト4・異合・Lv1 BP2000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TIMBER).name === "ティンバートール" && getCard(TIMBER).family.includes("異合") && getCard(TIMBER).cost === 6 && getCard(TIMBER).levels[1]!.cores === 4, "TIMBERはティンバートール（異合・コスト6・Lv2はコア4）")
    assert(getCard(HOKORA).levels[1]!.cores === 5, "HOKORAのLv2はコア5")
    assert(getCard(STAGGER).name === "スタッガー" && getCard(STAGGER).family.includes("異合"), "STAGGERは異合")
    assert(getCard(KAMOONE).name === "カモオネ" && getCard(KAMOONE).cost === 4, "KAMOONEはコスト4")
}

// 072 Lv2 の効果の使い方（起動か確認か）は効果文から決まらないので、通ったものを採る。通った効果IDを返す
function useHokora(t: ScenarioCtx): boolean {
    const id = t.id("祠")
    for (const n of [1, 2, 3, 4, 5]) {
        if (act(t.state, t.me, { type: "activateAbility", instanceId: id, effectId: `BS23-072-e${n}` }) === null) {
            for (let i = 0; i < 5 && t.state.pendingChoice; i++) {
                const pc = t.state.pendingChoice as { cardIndices?: number[]; candidates?: string[]; options?: string[] }
                if (pc.cardIndices?.[0] !== undefined) t.act("me", { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
                else if (pc.options?.[0] !== undefined) t.act("me", { type: "resolveChoice", option: pc.options[0] })
                else if (pc.candidates?.[0] !== undefined) t.act("me", { type: "resolveChoice", instanceId: pc.candidates[0] })
                else t.act("me", { type: "resolveChoice" })
            }
            return true
        }
    }
    return false
}

const dorat = [
    "自分.手札: ドラットフィッシュ → なし",
    "自分.リザーブ: 10 → 9",
    "自分.ドラットフィッシュ.場所: なし → フィールド",
    "自分.ドラットフィッシュ.疲労: なし → false",
    "自分.ドラットフィッシュ.コア: なし → 1",
    "自分.ドラットフィッシュ.Lv: なし → 1",
    "自分.ドラットフィッシュ.BP: なし → 4000",
]

console.log("=== 072 Lv2: コア5個以上のとき、手札の異合のスピリットをコストなしで召喚できる（リザーブから置くのは Lv1 のコア1個だけ） ===")
scenario({
    name: "hokora-lv2-summon",
    start: { me: { hand: [DORAT], nexuses: [{ card: HOKORA, label: "祠", cores: 5 }] } },
    steps(t) {
        assert(useHokora(t), "コア5個の祠の効果が使える")
    },
    expect: dorat,
})

console.log("=== 072 Lv2: コアが4個ではLv1のまま使えない ===")
scenario({
    name: "hokora-lv1-no-summon",
    start: { me: { hand: [DORAT], nexuses: [{ card: HOKORA, label: "祠", cores: 4 }] } },
    steps(t) {
        assert(!useHokora(t), "コア4個の祠の効果は使えない")
    },
    expect: [],
})

console.log("=== 072 Lv2: 異合でないスピリットは召喚できない ===")
scenario({
    name: "hokora-lv2-nonfamily",
    start: { me: { hand: [VAN], nexuses: [{ card: HOKORA, label: "祠", cores: 5 }] } },
    steps(t) {
        useHokora(t)
    },
    expect: [],
})

console.log("=== 072 Lv2: ターンに1回しか使えない（手札に異合が2枚あっても1枚だけ） ===")
scenario({
    name: "hokora-lv2-once",
    start: { me: { hand: [DORAT, STAGGER], nexuses: [{ card: HOKORA, label: "祠", cores: 5 }] }, interactive: true },
    steps(t) {
        assert(useHokora(t), "1回目は使える")
        assert(!useHokora(t), "2回目は使えない")
    },
    expect: dorat.map((l) => (l === "自分.手札: ドラットフィッシュ → なし" ? "自分.手札: スタッガー、ドラットフィッシュ → スタッガー" : l)),
})

console.log("=== 072 Lv2: 相手のターンには使えない（『自分のメインステップ』） ===")
scenario({
    name: "hokora-lv2-opp-turn",
    start: { turn: "opp", me: { hand: [DORAT], nexuses: [{ card: HOKORA, label: "祠", cores: 5 }] } },
    steps(t) {
        assert(!useHokora(t), "相手のターンでは使えない")
    },
    expect: [],
})

console.log("=== 053 Lv2: 自分の祠はコア5個として扱う（コア0個でも Lv2 の効果が使える。Q4578） ===")
scenario({
    name: "timber-lv2-hokora",
    start: { me: { hand: [DORAT], spirits: [{ card: TIMBER, label: "ティンバー", cores: 4 }], nexuses: [{ card: HOKORA, label: "祠", cores: 0 }] } },
    steps(t) {
        assert(useHokora(t), "053 Lv2 がいればコア0個の祠でも使える")
    },
    expect: dorat,
})

console.log("=== 053 Lv1: 扱いは変わらない（祠はコア0個のまま Lv1） ===")
scenario({
    name: "timber-lv1-hokora",
    start: { me: { hand: [DORAT], spirits: [{ card: TIMBER, label: "ティンバー", cores: 1 }], nexuses: [{ card: HOKORA, label: "祠", cores: 0 }] } },
    steps(t) {
        assert(!useHokora(t), "053 が Lv1 なら祠は使えない")
    },
    expect: [],
})

console.log("=== 053 Lv2: 相手の祠には効かない（自分の祠だけ） ===")
scenario({
    name: "timber-lv2-opp-hokora",
    start: { turn: "opp", me: { spirits: [{ card: TIMBER, label: "ティンバー", cores: 4 }] }, opp: { hand: [DORAT], nexuses: [{ card: HOKORA, label: "祠", cores: 0 }] } },
    steps(t) {
        const id = t.inst("祠").instanceId
        const ok = [1, 2, 3, 4, 5].some((n) => act(t.state, t.opp, { type: "activateAbility", instanceId: id, effectId: `BS23-072-e${n}` }) === null)
        assert(!ok, "相手の祠は053の影響を受けない")
    },
    expect: [],
})

console.log("=== 053 召喚時: コスト3以下の相手のスピリットすべてを破壊する（コスト4は残る）。緑シンボルが無ければ連鎖は発揮しない ===")
// コスト6で召喚（青シンボル無し）。リザーブ10→4、Lv1 のコア1個で→3
scenario({
    name: "timber-summon-nochain",
    start: { me: { hand: [TIMBER] }, opp: { spirits: [{ card: STAGGER, label: "小1" }, { card: VAN, label: "小2" }, { card: KAMOONE, label: "大" }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: ティンバートール → なし",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        "自分.ティンバートール.場所: なし → フィールド",
        "自分.ティンバートール.疲労: なし → false",
        "自分.ティンバートール.コア: なし → 1",
        "自分.ティンバートール.Lv: なし → 1",
        "自分.ティンバートール.BP: なし → 5000",
        "相手.小1.場所: フィールド → なし",
        "相手.小2.場所: フィールド → なし",
        "相手.トラッシュ: なし → スタッガー、ロクケラトプス",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== 053 召喚時: 緑シンボルがあれば【連鎖】で、緑の効果（ボイドからコア1個を自分のスピリットに置く）。置き先はビートビートルを選ぶ ===")
// 緑シンボル1つでコスト5（軽減：緑1）。リザーブ10→5、Lv1 のコア1個で→4
scenario({
    name: "timber-summon-chain",
    start: { me: { hand: [TIMBER], spirits: [{ card: BEETLE, label: "緑兵" }] }, opp: { spirits: [{ card: STAGGER, label: "小1" }, { card: KAMOONE, label: "大" }] }, interactive: true },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        for (let i = 0; i < 5 && t.state.pendingChoice; i++) {
            const pc = t.state.pendingChoice as { candidates?: string[]; options?: string[] }
            if (pc.candidates?.includes(t.id("緑兵"))) t.act("me", { type: "resolveChoice", instanceId: t.id("緑兵") })
            else if (pc.options?.[0] !== undefined) t.act("me", { type: "resolveChoice", option: pc.options[0] })
            else t.act("me", { type: "resolveChoice" })
        }
    },
    expect: [
        "自分.手札: ティンバートール → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.ティンバートール.場所: なし → フィールド",
        "自分.ティンバートール.疲労: なし → false",
        "自分.ティンバートール.コア: なし → 1",
        "自分.ティンバートール.Lv: なし → 1",
        "自分.ティンバートール.BP: なし → 5000",
        "自分.緑兵.コア: 1 → 2",
        "自分.緑兵.Lv: 1 → 2",
        "自分.緑兵.BP: 1000 → 2000",
        "相手.小1.場所: フィールド → なし",
        "相手.トラッシュ: なし → スタッガー",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part847）")

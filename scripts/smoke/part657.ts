// smoke パート657（BS18 紫の場面テスト：効果文だけから先に書いた期待値）
// 担当：BS18-010〜018・056・063・064・075・076・X02・X012A。実装役はこのファイルを変更しない
import { assert, effectiveBp, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { InstanceSpec, ScenarioCtx, SideSpec } from "./scenario"

const V = "BS01-002" // ロクケラトプス（赤・コスト1）
const HEL = "BS03-013" // ヘルスコルピオ（紫・コスト1・BP1000）
const FAN = "BS02-014" // ファンタズマ（紫・コスト2・Lv1 BP2000）
const HAD = "BS01-031" // デス・ハーデス（紫・コスト3・Lv1 BP4000）
const DAR = "BS03-018" // ダークレイス（紫・コスト4・呪鬼）
const FAL = "BS05-015" // フォールンパラディン（紫・コスト5・魔影）
const MEG = "BS03-020" // メガ・ハンプダンプ（紫・コスト5・Lv1 BP3000）
const MELT = "BS03-009" // 火吹きメルト（赤・コスト5・Lv1 BP4000／Lv2 cores3 BP6000）
const KUJA = "BS04-009" // 炎皇クジャラク（赤・コスト6・Lv1 cores2 BP5000／Lv2 cores3 BP6000）
const DUAL = "BS10-007" // デュアルド（赤・コスト5・古竜）
const KIRI = "BS01-065" // キリカブト（緑・コスト4・召喚時にボイドからコアを自分のスピリットへ）
const EME = "BS01-063" // エメラルドシーザー（緑・コスト4・召喚時に相手のスピリット1体を疲労）
const YURI = "BS07-040" // 百合の妖精ユリィ（黄・Lv2【聖命】アタックで相手のライフを減らしたとき、ボイドからコア1個を自分のライフへ）
const VIERGE = "BS12-X05" // 戦神乙女ヴィエルジェ（黄・コスト6・召喚時にライフ5以下ならボイドからコア1個をライフへ）
const HOP = "BS02-029" // バットホッパー（緑・アタック時にボイドからコアをこのスピリットへ）
const GATHER = "BS01-136" // ギャザーフォース（緑マジック・メインでボイドからコア1個をリザーブへ）
const KINTA = "BS14-010" // 皇牙獣キンタローグ・ベアー（赤・覇皇・召喚時にBP4000以下2体破壊）
const NASU = "BS14-020" // ナスノ・アーチャー（紫・覇皇・Lv1 BP3000）
const SEIMEI = "BS14-X02" // 呪の覇王カオティック・セイメイ（紫・バースト：相手のスピリットのコア1個をトラッシュへ、その後手札へ戻る）
const TWIN = "BS14-091" // 双光気弾（赤マジック・バースト効果を持つ）
const BIND = "BS01-134" // バインディングソーン（緑マジック・フラッシュで相手のスピリット1体を疲労）
const BALS = "BS09-014" // 闇騎士ボールス（紫・コスト4・魔影）

const ZOMBIE = "BS18-011"
const RAMO = "BS18-012"
const DON = "BS18-013"
const DANT = "BS18-014"
const MINGO = "BS18-015"
const GWEN = "BS18-016"
const PERCI = "BS18-017"
const ZORO = "BS18-018"
const EXC = "BS18-056"
const TOWER = "BS18-063"
const TWI = "BS18-064"
const MARK = "BS18-075"
const CRY = "BS18-076"
const AVALON = "BS18-X02"
const LORD = "X012A"

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string, string][] = [
        [V, "ロクケラトプス", "spirit"], [HEL, "ヘルスコルピオ", "spirit"], [FAN, "ファンタズマ", "spirit"],
        [HAD, "デス・ハーデス", "spirit"], [DAR, "ダークレイス", "spirit"], [FAL, "フォールンパラディン", "spirit"],
        [MEG, "メガ・ハンプダンプ", "spirit"], [MELT, "火吹きメルト", "spirit"], [KUJA, "炎皇クジャラク", "spirit"],
        [DUAL, "デュアルド", "spirit"], [KIRI, "キリカブト", "spirit"], [EME, "エメラルドシーザー", "spirit"],
        [HOP, "バットホッパー", "spirit"], [VIERGE, "戦神乙女ヴィエルジェ", "spirit"], [YURI, "百合の妖精ユリィ", "spirit"], [GATHER, "ギャザーフォース", "magic"], [KINTA, "皇牙獣キンタローグ・ベアー", "spirit"],
        [NASU, "ナスノ・アーチャー", "spirit"], [SEIMEI, "呪の覇王カオティック・セイメイ", "spirit"], [TWIN, "双光気弾", "magic"],
        [BIND, "バインディングソーン", "magic"], [BALS, "闇騎士ボールス", "spirit"],
        [ZOMBIE, "ゾンビ・スネーク", "spirit"], [RAMO, "闇騎士ラモラック", "spirit"], [DON, "ドン・ディエゴッド", "spirit"],
        [DANT, "冥司書ダンタリアン", "spirit"], [MINGO, "タワーミンゴ", "spirit"], [GWEN, "闇王妃グネヴィア", "spirit"],
        [PERCI, "闇騎士パーシヴァル", "spirit"], [ZORO, "冥怪傑ゾロ", "spirit"], [EXC, "聖剣竜エクス・ワイバーン", "brave"],
        [TOWER, "魂の海塔", "nexus"], [TWI, "黄昏のキャメロット城", "nexus"], [MARK, "マーク・オブ・ゾロ", "magic"],
        [CRY, "クリスタルクラック", "magic"], [AVALON, "騎神皇アヴァロ・パラディオン", "spirit"],
        [LORD, "英雄皇ロード・ドラゴン・ドミニオン", "spirit"],
    ]
    for (const [id, name, type] of names) {
        const c = getCard(id)
        assert(c.name === name && c.type === type, `${id} は ${name}（${type}）`)
    }
    assert(getCard(LORD).colors.join() === "purple" && getCard(LORD).cost === 6, "X012A は紫・コスト6")
    assert(getCard(VIERGE).cost === 6, "ヴィエルジェはコスト6")
    assert(getCard(DANT).cost === 4 && getCard(PERCI).cost === 6 && getCard(ZORO).cost === 12, "コストの確認")
}

type Ans = { skip?: boolean; pick?: string[]; cards?: string[] }
const skipAll: Ans[] = Array.from({ length: 8 }, () => ({ skip: true }))

// 選択待ちを、出てきた順に answers で答えていく（足りなければ「最初の候補／発動する」）。選択待ちが無ければ何もしない
function go(t: ScenarioCtx, answers: Ans[] = []): void {
    for (let i = 0; t.state.pendingChoice && i < 8; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        const a = answers[i] ?? {}
        if (a.skip) {
            t.act(side, { type: "resolveChoice" })
        } else if (pc.kind === "option") {
            t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        } else if (pc.kind === "target") {
            const label = a.pick?.[0]
            t.act(side, { type: "resolveChoice", instanceId: label ? t.id(label) : pc.candidates[0]! })
        } else {
            const zone = pc.cardZone === "hand" ? t.state.players[pc.cardOwner!].hand : t.state.players[pc.cardOwner!].trashCards
            if (a.cards) {
                const want = [...a.cards]
                for (const idx of pc.cardIndices ?? []) {
                    const k = want.indexOf(getCard(zone[idx]!).name)
                    if (k < 0) continue
                    want.splice(k, 1)
                    t.act(side, { type: "resolveChoice", cardIndex: idx })
                }
                if (t.state.pendingChoice === pc || t.state.pendingChoice?.prompt === pc.prompt) t.act(side, { type: "resolveChoice" })
            } else {
                t.act(side, { type: "resolveChoice", cardIndex: (pc.cardIndices ?? [0])[0]! })
            }
        }
    }
}

// 相手がアタックし、自分がブロックして、BP比較まで進める
function oppAttackBlock(t: ScenarioCtx, attacker: string, blocker: string): void {
    t.act("opp", { type: "attack", instanceId: t.id(attacker) })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id(blocker) })
    t.closeFlash()
}
function meAttackBlock(t: ScenarioCtx, attacker: string, blocker: string): void {
    t.act("me", { type: "attack", instanceId: t.id(attacker) })
    t.closeFlash()
    t.act("opp", { type: "block", instanceId: t.id(blocker) })
    t.closeFlash()
}

const sorted = (...n: string[]) => n.sort().join("、")
const appear = (who: "自分" | "相手", label: string, cores: number, lv: number, bp: number, rested = false) => [
    `${who}.${label}.場所: なし → フィールド`,
    `${who}.${label}.疲労: なし → ${rested}`,
    `${who}.${label}.コア: なし → ${cores}`,
    `${who}.${label}.Lv: なし → ${lv}`,
    `${who}.${label}.BP: なし → ${bp}`,
]
const gone = (who: "自分" | "相手", label: string) => `${who}.${label}.場所: フィールド → なし`
const REP = Array.from({ length: 5 }, () => "ロクケラトプス")

// ============ BS18-011 ゾンビ・スネーク ============
console.log("=== 011. 破壊時：古竜を持つ相手のスピリット1体を破壊 ===")
scenario({
    name: "zombie-kodragon",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: ZOMBIE }] },
        opp: { spirits: [{ card: MELT, label: "攻撃者" }, { card: DUAL }] },
    },
    steps: (t) => oppAttackBlock(t, "相手.攻撃者", "自分.ゾンビ・スネーク"),
    expect: [
        gone("自分", "ゾンビ・スネーク"), "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → ゾンビ・スネーク",
        gone("相手", "デュアルド"), "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → デュアルド", "相手.攻撃者.疲労: false → true",
    ],
})
scenario({
    name: "zombie-no-kodragon",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: ZOMBIE }, { card: DUAL, label: "味方の古竜" }] },
        opp: { spirits: [{ card: MELT, label: "攻撃者" }] },
    },
    steps: (t) => oppAttackBlock(t, "相手.攻撃者", "自分.ゾンビ・スネーク"),
    expect: [gone("自分", "ゾンビ・スネーク"), "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → ゾンビ・スネーク", "相手.攻撃者.疲労: false → true"],
})

// ============ BS18-012 闇騎士ラモラック ============
console.log("=== 012. 召喚時：手札2枚までを破棄することで、1枚につき相手のスピリット1体のコア1個を相手のトラッシュへ ===")
const ramoStart = (opp: object) => ({
    interactive: true,
    me: { hand: [RAMO, HEL, FAN] },
    opp,
})
const ramoSummon = [
    ...appear("自分", "闇騎士ラモラック", 1, 1, 2000), "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 3",
]
scenario({
    name: "ramo-discard2",
    start: ramoStart({ spirits: [{ card: MELT, cores: 3 }] }),
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        go(t, [{ cards: ["ヘルスコルピオ", "ファンタズマ"] }])
    },
    expect: [
        ...ramoSummon, "自分.手札: " + sorted("ファンタズマ", "ヘルスコルピオ", "闇騎士ラモラック") + " → なし",
        "自分.トラッシュ: なし → " + sorted("ファンタズマ", "ヘルスコルピオ"),
        "相手.火吹きメルト.コア: 3 → 1", "相手.火吹きメルト.Lv: 2 → 1", "相手.火吹きメルト.BP: 6000 → 4000", "相手.トラッシュのコア: 0 → 2",
    ],
})
scenario({
    name: "ramo-discard1",
    start: ramoStart({ spirits: [{ card: MELT, cores: 3 }] }),
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        go(t, [{ cards: ["ヘルスコルピオ"] }])
    },
    expect: [
        ...ramoSummon, "自分.手札: " + sorted("ファンタズマ", "ヘルスコルピオ", "闇騎士ラモラック") + " → ファンタズマ",
        "自分.トラッシュ: なし → ヘルスコルピオ",
        "相手.火吹きメルト.コア: 3 → 2", "相手.火吹きメルト.Lv: 2 → 1", "相手.火吹きメルト.BP: 6000 → 4000", "相手.トラッシュのコア: 0 → 1",
    ],
})
scenario({
    name: "ramo-decline",
    start: ramoStart({ spirits: [{ card: MELT, cores: 3 }] }),
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        go(t, skipAll)
    },
    expect: [...ramoSummon, "自分.手札: " + sorted("ファンタズマ", "ヘルスコルピオ", "闇騎士ラモラック") + " → " + sorted("ファンタズマ", "ヘルスコルピオ")],
})
scenario({
    name: "ramo-no-target-no-pay",
    start: ramoStart({}),
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        go(t, [{ cards: ["ヘルスコルピオ", "ファンタズマ"] }])
    },
    expect: [...ramoSummon, "自分.手札: " + sorted("ファンタズマ", "ヘルスコルピオ", "闇騎士ラモラック") + " → " + sorted("ファンタズマ", "ヘルスコルピオ")],
})

// ============ BS18-013 ドン・ディエゴッド ============
console.log("=== 013. お互いのメインステップ：スピリットの効果でボイドから増えたコアとその発生源のコアをボイドへ ===")
scenario({
    name: "don-my-main",
    start: { me: { spirits: [{ card: DON }], hand: [KIRI] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        go(t)
    },
    expect: ["自分.手札: キリカブト → なし", "自分.トラッシュ: なし → キリカブト", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4"],
})
scenario({
    name: "don-opp-main",
    start: { turn: "opp", me: { spirits: [{ card: DON }] }, opp: { hand: [KIRI] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        go(t)
    },
    expect: ["相手.手札: キリカブト → なし", "相手.トラッシュ: なし → キリカブト", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4"],
})
scenario({
    name: "don-life-core",
    start: { me: { life: 4, spirits: [{ card: DON }], hand: [VIERGE] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        go(t)
    },
    expect: ["自分.手札: 戦神乙女ヴィエルジェ → なし", "自分.トラッシュ: なし → 戦神乙女ヴィエルジェ", "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 6"],
})
scenario({
    name: "don-attack-step-not-covered",
    start: { phase: "attack", me: { spirits: [{ card: DON }, { card: HOP }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("バットホッパー") })
        go(t)
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.バットホッパー.疲労: false → true", "自分.バットホッパー.コア: 1 → 2", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "don-no-mill",
    start: { turn: "opp", me: { spirits: [{ card: DON }], nexuses: [{ card: TWI, cores: 0 }] }, opp: { hand: [V] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        go(t)
    },
    expect: [
        "相手.手札: ロクケラトプス → なし", "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 1", ...appear("相手", "ロクケラトプス", 1, 1, 1000),
    ],
})
scenario({
    name: "don-no-mill-opp-deck",
    start: { me: { spirits: [{ card: DON }], hand: [V] }, opp: { nexuses: [{ card: TWI, cores: 0 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        go(t)
    },
    expect: [
        "自分.手札: ロクケラトプス → なし", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 1", ...appear("自分", "ロクケラトプス", 1, 1, 1000),
    ],
})

// ============ BS18-014 冥司書ダンタリアン ============
console.log("=== 014. 相手のスピリットの効果で紫のスピリットが疲労するとき、デッキの上1枚をトラッシュに置いて疲労を防ぐ ===")
const dantOppSummon = [
    ...appear("相手", "エメラルドシーザー", 1, 1, 3000), "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4", "相手.手札: エメラルドシーザー → なし",
]
const dantStart = (me: object) => ({ turn: "opp" as const, interactive: true, me, opp: { hand: [EME] } })
scenario({
    name: "dant-pay",
    start: dantStart({ spirits: [{ card: DANT }] }),
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        go(t)
    },
    expect: [...dantOppSummon, "自分.デッキ枚数: 40 → 39", "自分.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "dant-decline",
    start: dantStart({ spirits: [{ card: DANT }] }),
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        go(t, skipAll)
    },
    expect: [...dantOppSummon, "自分.冥司書ダンタリアン.疲労: false → true"],
})
scenario({
    name: "dant-not-purple",
    start: dantStart({ spirits: [{ card: V }] }),
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        go(t)
    },
    expect: [...dantOppSummon, "自分.ロクケラトプス.疲労: false → true"],
})
scenario({
    name: "dant-empty-deck",
    start: dantStart({ spirits: [{ card: DANT }], deck: [] }),
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        go(t)
    },
    expect: [...dantOppSummon, "自分.冥司書ダンタリアン.疲労: false → true"],
})
scenario({
    name: "dant-deck-guarded",
    start: dantStart({ spirits: [{ card: DANT }, { card: MINGO }] }),
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        go(t, [{ pick: ["自分.冥司書ダンタリアン"] }])
    },
    expect: [...dantOppSummon, "自分.冥司書ダンタリアン.疲労: false → true"],
})
scenario({
    name: "dant-magic-not-covered",
    start: {
        turn: "opp", phase: "attack", interactive: true,
        me: { spirits: [{ card: DANT }] },
        opp: { spirits: [{ card: V }], hand: [BIND] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("自分.冥司書ダンタリアン") })
        go(t, skipAll)
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.ロクケラトプス.疲労: false → true", "相手.手札: バインディングソーン → なし", "相手.トラッシュ: なし → バインディングソーン",
        "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 2", "自分.冥司書ダンタリアン.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11",
    ],
})

// ============ BS18-015 タワーミンゴ ============
console.log("=== 015. お互いのデッキは破棄されない／【呪撃】／Lv2破壊時 ===")
scenario({
    name: "mingo-opp-deck-guarded",
    start: { me: { spirits: [{ card: MINGO }], hand: [V] }, opp: { nexuses: [{ card: TWI, cores: 0 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        go(t)
    },
    expect: ["自分.手札: ロクケラトプス → なし", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 1", ...appear("自分", "ロクケラトプス", 1, 1, 1000)],
})
scenario({
    name: "mingo-curse-strike",
    start: {
        phase: "attack",
        me: { spirits: [{ card: MINGO, cores: 3 }], hand: REP },
        opp: { spirits: [{ card: KUJA, cores: 3 }] },
    },
    steps: (t) => meAttackBlock(t, "自分.タワーミンゴ", "相手.炎皇クジャラク"),
    expect: [
        "自分.タワーミンゴ.疲労: false → true", gone("相手", "炎皇クジャラク"), "相手.リザーブ: 10 → 13", "相手.トラッシュ: なし → 炎皇クジャラク",
    ],
})
scenario({
    name: "mingo-no-block-no-curse",
    start: { phase: "attack", me: { spirits: [{ card: MINGO, cores: 3 }] }, opp: { spirits: [{ card: KUJA, cores: 3 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.タワーミンゴ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.タワーミンゴ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
const mingoDefense = (cores: number, hand: string[]) => ({
    turn: "opp" as const, phase: "attack" as const,
    me: { spirits: [{ card: MINGO, cores }], hand },
    opp: { spirits: [{ card: KUJA, cores: 3, label: "攻撃者" }] },
})
scenario({
    name: "mingo-lv2-hand5-stays",
    start: mingoDefense(3, REP),
    steps: (t) => oppAttackBlock(t, "相手.攻撃者", "自分.タワーミンゴ"),
    expect: ["自分.タワーミンゴ.疲労: false → true", "相手.攻撃者.疲労: false → true"],
})
scenario({
    name: "mingo-lv2-hand4-destroyed",
    start: mingoDefense(3, REP.slice(1)),
    steps: (t) => oppAttackBlock(t, "相手.攻撃者", "自分.タワーミンゴ"),
    expect: [gone("自分", "タワーミンゴ"), "自分.リザーブ: 10 → 13", "自分.トラッシュ: なし → タワーミンゴ", "相手.攻撃者.疲労: false → true"],
})
scenario({
    name: "mingo-lv1-hand5-destroyed",
    start: mingoDefense(1, REP),
    steps: (t) => oppAttackBlock(t, "相手.攻撃者", "自分.タワーミンゴ"),
    expect: [gone("自分", "タワーミンゴ"), "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → タワーミンゴ", "相手.攻撃者.疲労: false → true"],
})

// ============ BS18-016 闇王妃グネヴィア ============
console.log("=== 016. 相手のエンドステップ：相手が1回もアタックしていなければ、紫のバーストを条件を無視して発動できる ===")
const gwenStart = { turn: "opp" as const, interactive: true, me: { spirits: [{ card: GWEN }], burst: SEIMEI }, opp: { spirits: [{ card: MELT, cores: 4 }] } }
const newTurnForMe = ["自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 11"]
scenario({
    name: "gwen-fire",
    start: gwenStart,
    steps(t) {
        t.act("opp", { type: "endTurn" })
        go(t)
    },
    expect: [
        ...newTurnForMe, "自分.バースト: 呪の覇王カオティック・セイメイ → なし", "自分.手札: なし → " + sorted("ロクケラトプス", "呪の覇王カオティック・セイメイ"),
        "相手.火吹きメルト.コア: 4 → 3", "相手.トラッシュのコア: 0 → 1",
    ],
})
scenario({
    name: "gwen-decline",
    start: gwenStart,
    steps(t) {
        t.act("opp", { type: "endTurn" })
        go(t, skipAll)
    },
    expect: [...newTurnForMe, "自分.手札: なし → ロクケラトプス"],
})
scenario({
    name: "gwen-opp-attacked",
    start: { ...gwenStart, phase: "attack", opp: { spirits: [{ card: V }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        t.act("opp", { type: "endTurn" })
        go(t)
    },
    expect: [
        "自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 12", "自分.ライフ: 5 → 4", "自分.手札: なし → ロクケラトプス", "相手.ロクケラトプス.疲労: false → true",
    ],
})

// ============ BS18-017 闇騎士パーシヴァル ============
console.log("=== 017. 【不死：コスト3/4】／Lv2：闇騎士が相手に破壊されたとき相手のスピリット1体を疲労 ===")
const perciTrash = (spirits: InstanceSpec[], extra: SideSpec = {}) => ({
    turn: "opp" as const, phase: "attack" as const, interactive: true,
    me: { spirits, trash: [PERCI], ...extra },
    opp: { spirits: [{ card: MELT, cores: 3, label: "攻撃者" }] },
})
scenario({
    name: "perci-undying",
    start: perciTrash([{ card: HAD }]),
    steps(t) {
        oppAttackBlock(t, "相手.攻撃者", "自分.デス・ハーデス")
        go(t)
    },
    expect: [
        gone("自分", "デス・ハーデス"), ...appear("自分", "闇騎士パーシヴァル", 1, 1, 4000),
        "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 6", "自分.トラッシュ: 闇騎士パーシヴァル → デス・ハーデス", "相手.攻撃者.疲労: false → true",
    ],
})
scenario({
    name: "perci-undying-decline",
    start: perciTrash([{ card: HAD }]),
    steps(t) {
        oppAttackBlock(t, "相手.攻撃者", "自分.デス・ハーデス")
        go(t, skipAll)
    },
    expect: [
        gone("自分", "デス・ハーデス"), "自分.リザーブ: 10 → 11", "自分.トラッシュ: 闇騎士パーシヴァル → " + sorted("デス・ハーデス", "闇騎士パーシヴァル"),
        "相手.攻撃者.疲労: false → true",
    ],
})
scenario({
    name: "perci-undying-cost2-not-covered",
    start: perciTrash([{ card: FAN }]),
    steps(t) {
        oppAttackBlock(t, "相手.攻撃者", "自分.ファンタズマ")
        go(t)
    },
    expect: [
        gone("自分", "ファンタズマ"), "自分.リザーブ: 10 → 11", "自分.トラッシュ: 闇騎士パーシヴァル → " + sorted("ファンタズマ", "闇騎士パーシヴァル"),
        "相手.攻撃者.疲労: false → true",
    ],
})
const perciField = (perciCores: number, victim: string) => ({
    turn: "opp" as const, phase: "attack" as const, interactive: true,
    me: { spirits: [{ card: PERCI, cores: perciCores }, { card: victim }] },
    opp: { spirits: [{ card: MELT, cores: 3, label: "攻撃者" }, { card: V }] },
})
scenario({
    name: "perci-lv2-rest",
    start: perciField(3, BALS),
    steps(t) {
        oppAttackBlock(t, "相手.攻撃者", "自分.闇騎士ボールス")
        go(t, [{ pick: ["相手.ロクケラトプス"] }])
    },
    expect: [
        gone("自分", "闇騎士ボールス"), "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → 闇騎士ボールス",
        "相手.攻撃者.疲労: false → true", "相手.ロクケラトプス.疲労: false → true",
    ],
})
scenario({
    name: "perci-lv1-no-rest",
    start: perciField(1, BALS),
    steps(t) {
        oppAttackBlock(t, "相手.攻撃者", "自分.闇騎士ボールス")
        go(t, [{ pick: ["相手.ロクケラトプス"] }])
    },
    expect: [gone("自分", "闇騎士ボールス"), "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → 闇騎士ボールス", "相手.攻撃者.疲労: false → true"],
})
scenario({
    name: "perci-lv2-not-yamikishi",
    start: perciField(3, HAD),
    steps(t) {
        oppAttackBlock(t, "相手.攻撃者", "自分.デス・ハーデス")
        go(t, [{ pick: ["相手.ロクケラトプス"] }])
    },
    expect: [gone("自分", "デス・ハーデス"), "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → デス・ハーデス", "相手.攻撃者.疲労: false → true"],
})

// ============ BS18-018 冥怪傑ゾロ ============
console.log("=== 018. バースト：コスト5以上の赤/紫を戻して召喚／バースト召喚時に他のスピリットのコア1個ずつをリザーブへ ===")
scenario({
    name: "zoro-burst",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: FAL }, { card: V }], burst: ZORO },
        opp: { spirits: [{ card: MELT, cores: 2, label: "攻撃者" }, { card: V }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.攻撃者") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        go(t)
    },
    expect: [
        "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 12", "自分.バースト: 冥怪傑ゾロ → なし", gone("自分", "フォールンパラディン"), "自分.デッキ枚数: 40 → 41",
        gone("自分", "ロクケラトプス"), "自分.トラッシュ: なし → ロクケラトプス", ...appear("自分", "冥怪傑ゾロ", 3, 2, 12000),
        "相手.攻撃者.コア: 2 → 1", "相手.攻撃者.疲労: false → true", gone("相手", "ロクケラトプス"), "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 12",
    ],
})
scenario({
    name: "zoro-hand-summon-no-effect",
    start: { me: { hand: [ZORO], reserve: 20 }, opp: { spirits: [{ card: MELT, cores: 2 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: ["自分.手札: 冥怪傑ゾロ → なし", "自分.リザーブ: 20 → 7", "自分.トラッシュのコア: 0 → 12", ...appear("自分", "冥怪傑ゾロ", 1, 1, 8000)],
})
scenario({
    name: "zoro-burst-cannot-pay",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: DAR }, { card: V }], burst: ZORO },
        opp: { spirits: [{ card: MELT, label: "攻撃者" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.攻撃者") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        go(t)
    },
    expect: ["自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", "相手.攻撃者.疲労: false → true"],
})

// ============ BS18-056 聖剣竜エクス・ワイバーン ============
console.log("=== 056. 召喚時：相手のスピリットのコア3個をリザーブへ（0個にはできない）／合体アタックで疲労状態のスピリットを指定 ===")
const excSummon = [
    "自分.手札: 聖剣竜エクス・ワイバーン → なし", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4", ...appear("自分", "聖剣竜エクス・ワイバーン", 1, 1, 3000),
]
scenario({
    name: "exc-summon-3cores",
    start: { me: { hand: [EXC] }, opp: { spirits: [{ card: MELT, cores: 4 }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        go(t)
    },
    expect: [...excSummon, "相手.火吹きメルト.コア: 4 → 1", "相手.火吹きメルト.Lv: 2 → 1", "相手.火吹きメルト.BP: 6000 → 4000", "相手.リザーブ: 10 → 13"],
})
scenario({
    name: "exc-summon-cannot-zero",
    start: { me: { hand: [EXC] }, opp: { spirits: [{ card: MELT, cores: 2 }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        go(t)
    },
    expect: [...excSummon, "相手.火吹きメルト.コア: 2 → 1", "相手.リザーブ: 10 → 11"],
})
const excField = { me: { spirits: [{ card: FAL }, { card: EXC }] }, opp: { spirits: [{ card: V, label: "疲労V", rested: true }, { card: KUJA, label: "回復済み" }] } }
const combined = [
    "自分.聖剣竜エクス・ワイバーン.場所: フィールド → 合体", "自分.聖剣竜エクス・ワイバーン.BP: 3000 → なし", "自分.フォールンパラディン.BP: 4000 → 7000",
]
scenario({
    name: "exc-attack-rested",
    start: excField,
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("聖剣竜エクス・ワイバーン"), hostInstanceId: t.id("フォールンパラディン") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("フォールンパラディン"), targetSpiritInstanceId: t.id("相手.疲労V") })
        t.closeFlash()
    },
    expect: [...combined, "自分.フォールンパラディン.疲労: false → true", gone("相手", "疲労V"), "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "exc-attack-untapped-rejected",
    start: excField,
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("聖剣竜エクス・ワイバーン"), hostInstanceId: t.id("フォールンパラディン") })
        t.act("me", { type: "nextPhase" })
        t.actRejected("me", { type: "attack", instanceId: t.id("フォールンパラディン"), targetSpiritInstanceId: t.id("相手.回復済み") })
    },
    expect: combined,
})
scenario({
    name: "exc-not-combined-cannot-target",
    start: excField,
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.actRejected("me", { type: "attack", instanceId: t.id("フォールンパラディン"), targetSpiritInstanceId: t.id("相手.疲労V") })
    },
    expect: [],
})
scenario({
    name: "exc-combine-condition",
    start: { me: { spirits: [{ card: DAR }, { card: EXC }] } },
    steps(t) {
        t.actRejected("me", { type: "combineBrave", braveInstanceId: t.id("聖剣竜エクス・ワイバーン"), hostInstanceId: t.id("ダークレイス") })
    },
    expect: [],
})

// ============ BS18-063 魂の海塔 ============
console.log("=== 063. お互い、スピリットの効果でボイドからコアを増やせない／Lv2：手札5枚以上の間、破壊されたらドロー ===")
const hopAttackLines = ["自分.バットホッパー.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]
scenario({
    name: "tower-lock-mine",
    start: { phase: "attack", me: { spirits: [{ card: HOP }], nexuses: [{ card: TOWER, cores: 0 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("バットホッパー") })
        go(t)
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: hopAttackLines,
})
scenario({
    name: "tower-lock-opp-spirit",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: TOWER, cores: 0 }] }, opp: { spirits: [{ card: HOP }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("バットホッパー") })
        go(t)
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.バットホッパー.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "tower-control-no-nexus",
    start: { phase: "attack", me: { spirits: [{ card: HOP }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("バットホッパー") })
        go(t)
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [...hopAttackLines, "自分.バットホッパー.コア: 1 → 2"],
})
const yuriAttack = (me: SideSpec) => ({ phase: "attack" as const, me })
const yuriSteps = (t: ScenarioCtx) => {
    t.act("me", { type: "attack", instanceId: t.id("百合の妖精ユリィ") })
    go(t)
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
}
const yuriBase = ["自分.百合の妖精ユリィ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]
scenario({
    name: "tower-lock-life",
    start: yuriAttack({ spirits: [{ card: YURI, cores: 2 }], nexuses: [{ card: TOWER, cores: 0 }] }),
    steps: yuriSteps,
    expect: yuriBase,
})
scenario({
    name: "don-attack-step-life-core-not-covered",
    start: yuriAttack({ spirits: [{ card: YURI, cores: 2 }, { card: DON }] }),
    steps: yuriSteps,
    expect: [...yuriBase, "自分.ライフ: 5 → 6"],
})
scenario({
    name: "yuri-control-no-nexus",
    start: yuriAttack({ spirits: [{ card: YURI, cores: 2 }] }),
    steps: yuriSteps,
    expect: [...yuriBase, "自分.ライフ: 5 → 6"],
})
scenario({
    name: "tower-magic-not-covered",
    start: { me: { nexuses: [{ card: TOWER, cores: 0 }], hand: [GATHER] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "main" }),
    expect: ["自分.手札: ギャザーフォース → なし", "自分.トラッシュ: なし → ギャザーフォース", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 3"],
})
const towerDefense = (towerCores: number, hand: string[]) => ({
    turn: "opp" as const, phase: "attack" as const,
    me: { spirits: [{ card: V }], nexuses: [{ card: TOWER, cores: towerCores }], hand },
    opp: { spirits: [{ card: MELT, label: "攻撃者" }] },
})
const towerBlocked = [gone("自分", "ロクケラトプス"), "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → ロクケラトプス", "相手.攻撃者.疲労: false → true"]
const FIVE = Array.from({ length: 5 }, () => FAN)
scenario({
    name: "tower-lv2-hand5-draw",
    start: towerDefense(1, FIVE),
    steps: (t) => oppAttackBlock(t, "相手.攻撃者", "自分.ロクケラトプス"),
    expect: [...towerBlocked, "自分.手札: " + sorted(...FIVE) + " → " + sorted(...FIVE, "ロクケラトプス"), "自分.デッキ枚数: 40 → 39"],
})
scenario({
    name: "tower-lv2-hand4-no-draw",
    start: towerDefense(1, FIVE.slice(1)),
    steps: (t) => oppAttackBlock(t, "相手.攻撃者", "自分.ロクケラトプス"),
    expect: towerBlocked,
})
scenario({
    name: "tower-lv1-hand5-no-draw",
    start: towerDefense(0, FIVE),
    steps: (t) => oppAttackBlock(t, "相手.攻撃者", "自分.ロクケラトプス"),
    expect: towerBlocked,
})

// ============ BS18-064 黄昏のキャメロット城 ============
console.log("=== 064. 相手のメインステップ：相手のスピリットが召喚されたとき、デッキの上3枚をトラッシュに置ける／Lv2スタートステップ：魔影/雄将を手札へ ===")
const twiOppSummon = ["相手.手札: ロクケラトプス → なし", "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 1", ...appear("相手", "ロクケラトプス", 1, 1, 1000)]
scenario({
    name: "twi-mill",
    start: { turn: "opp", interactive: true, me: { nexuses: [{ card: TWI, cores: 0 }] }, opp: { hand: [V] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        go(t)
    },
    expect: [...twiOppSummon, "自分.デッキ枚数: 40 → 37", "自分.トラッシュ: なし → " + sorted("ロクケラトプス", "ロクケラトプス", "ロクケラトプス")],
})
scenario({
    name: "twi-mill-decline",
    start: { turn: "opp", interactive: true, me: { nexuses: [{ card: TWI, cores: 0 }] }, opp: { hand: [V] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        go(t, skipAll)
    },
    expect: twiOppSummon,
})
scenario({
    name: "twi-my-own-summon",
    start: { interactive: true, me: { nexuses: [{ card: TWI, cores: 0 }], hand: [V] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        go(t)
    },
    expect: ["自分.手札: ロクケラトプス → なし", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 1", ...appear("自分", "ロクケラトプス", 1, 1, 1000)],
})
const twiTurn = (cores: number, trash: string[]) => ({
    turn: "opp" as const, interactive: true,
    me: { nexuses: [{ card: TWI, cores }], trash },
})
const twiNewTurn = ["自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 11"]
scenario({
    name: "twi-lv2-recover",
    start: twiTurn(2, [BALS, V]),
    steps(t) {
        t.act("opp", { type: "endTurn" })
        go(t)
    },
    expect: [
        ...twiNewTurn, "自分.トラッシュ: " + sorted("ロクケラトプス", "闇騎士ボールス") + " → ロクケラトプス",
        "自分.手札: なし → " + sorted("ロクケラトプス", "闇騎士ボールス"),
    ],
})
scenario({
    name: "twi-lv1-no-recover",
    start: twiTurn(0, [BALS, V]),
    steps(t) {
        t.act("opp", { type: "endTurn" })
        go(t)
    },
    expect: [...twiNewTurn, "自分.手札: なし → ロクケラトプス"],
})
scenario({
    name: "twi-lv2-no-target",
    start: twiTurn(2, [V]),
    steps(t) {
        t.act("opp", { type: "endTurn" })
        go(t)
    },
    expect: [...twiNewTurn, "自分.手札: なし → ロクケラトプス"],
})

// ============ BS18-075 マーク・オブ・ゾロ ============
console.log("=== 075. バースト：1枚ドロー・相手のスピリットのコア2個をトラッシュへ、その後コストを払ってフラッシュ効果 ===")
const markStart = (reserve: number) => ({
    turn: "opp" as const, phase: "attack" as const, interactive: true,
    me: { spirits: [{ card: HEL, label: "ブロッカー" }], burst: MARK, reserve },
    opp: { spirits: [{ card: MELT, cores: 4, label: "攻撃者" }, { card: KUJA, cores: 2, label: "高コスト" }] },
})
const markCommon = [
    gone("自分", "ブロッカー"), "自分.バースト: マーク・オブ・ゾロ → なし", "自分.手札: なし → ロクケラトプス", "自分.デッキ枚数: 40 → 39",
    "相手.攻撃者.疲労: false → true", "相手.トラッシュのコア: 0 → 2",
]
scenario({
    name: "mark-pay",
    start: markStart(10),
    steps(t) {
        oppAttackBlock(t, "相手.攻撃者", "自分.ブロッカー")
        go(t, [{}, { pick: ["相手.攻撃者"] }, {}])
    },
    expect: [
        ...markCommon, "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 5", "自分.トラッシュ: なし → " + sorted("ヘルスコルピオ", "マーク・オブ・ゾロ"),
        "相手.攻撃者.コア: 4 → 1", "相手.攻撃者.Lv: 2 → 1", "相手.攻撃者.BP: 6000 → 4000", "相手.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "mark-cannot-pay",
    start: markStart(3),
    steps(t) {
        oppAttackBlock(t, "相手.攻撃者", "自分.ブロッカー")
        go(t, [{}, { pick: ["相手.攻撃者"] }, {}])
    },
    expect: [
        ...markCommon, "自分.リザーブ: 3 → 4", "自分.トラッシュ: なし → " + sorted("ヘルスコルピオ", "マーク・オブ・ゾロ"),
        "相手.攻撃者.コア: 4 → 2", "相手.攻撃者.Lv: 2 → 1", "相手.攻撃者.BP: 6000 → 4000",
    ],
})
scenario({
    name: "mark-decline-pay",
    start: markStart(10),
    steps(t) {
        oppAttackBlock(t, "相手.攻撃者", "自分.ブロッカー")
        go(t, [{}, { pick: ["相手.攻撃者"] }, { skip: true }])
    },
    expect: [
        ...markCommon, "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → " + sorted("ヘルスコルピオ", "マーク・オブ・ゾロ"),
        "相手.攻撃者.コア: 4 → 2", "相手.攻撃者.Lv: 2 → 1", "相手.攻撃者.BP: 6000 → 4000",
    ],
})

// ============ BS18-076 クリスタルクラック ============
console.log("=== 076. フラッシュ：相手のスピリット1体のコアを1個だけになるよう相手のトラッシュへ ===")
const crySpent = ["自分.手札: クリスタルクラック → なし", "自分.トラッシュ: なし → クリスタルクラック", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 5"]
scenario({
    name: "cry-cores4",
    start: { me: { hand: [CRY] }, opp: { spirits: [{ card: MELT, cores: 4 }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("火吹きメルト") }),
    expect: [...crySpent, "相手.火吹きメルト.コア: 4 → 1", "相手.火吹きメルト.Lv: 2 → 1", "相手.火吹きメルト.BP: 6000 → 4000", "相手.トラッシュのコア: 0 → 3"],
})
scenario({
    name: "cry-cores1-unchanged",
    start: { me: { hand: [CRY] }, opp: { spirits: [{ card: MELT, cores: 1 }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("火吹きメルト") }),
    expect: crySpent,
})
scenario({
    name: "cry-no-opp-spirit-rejected",
    start: { me: { hand: [CRY], spirits: [{ card: MELT, cores: 4 }] } },
    steps: (t) => t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash" }),
    expect: [],
})

// ============ BS18-X02 騎神皇アヴァロ・パラディオン ============
console.log("=== X02. 召喚時：トラッシュの覇皇を好きなだけコストなしで召喚（召喚時効果なし）／Lv2：覇皇の紫が相手のスピリットだけを破壊したらコアはトラッシュへ ===")
const avStart = { me: { hand: [AVALON], reserve: 20, trash: [NASU, V, KINTA] }, opp: { spirits: [{ card: V }] } }
const avSummon = ["自分.手札: 騎神皇アヴァロ・パラディオン → なし", "自分.トラッシュのコア: 0 → 8", ...appear("自分", "騎神皇アヴァロ・パラディオン", 1, 1, 6000)]
scenario({
    name: "avalon-summon-two",
    start: avStart,
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        go(t, [{ cards: ["ナスノ・アーチャー", "皇牙獣キンタローグ・ベアー"] }])
    },
    expect: [
        ...avSummon, "自分.リザーブ: 20 → 9", "自分.トラッシュ: " + sorted("ナスノ・アーチャー", "ロクケラトプス", "皇牙獣キンタローグ・ベアー") + " → ロクケラトプス",
        ...appear("自分", "ナスノ・アーチャー", 1, 1, 3000), ...appear("自分", "皇牙獣キンタローグ・ベアー", 1, 1, 4000),
    ],
})
scenario({
    name: "avalon-summon-none",
    start: avStart,
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        go(t, skipAll)
    },
    expect: [...avSummon, "自分.リザーブ: 20 → 11"],
})
const avAttack = (avCores: number, attacker: string, atkCores: number, blocker: string, blkCores: number) => ({
    phase: "attack" as const,
    me: { spirits: [{ card: AVALON, cores: avCores }, { card: attacker, cores: atkCores, label: "攻撃者" }] },
    opp: { spirits: [{ card: blocker, cores: blkCores, label: "防御者" }] },
})
scenario({
    name: "avalon-lv2-cores-to-trash",
    start: avAttack(3, NASU, 1, FAN, 2),
    steps: (t) => meAttackBlock(t, "自分.攻撃者", "相手.防御者"),
    expect: ["自分.攻撃者.疲労: false → true", gone("相手", "防御者"), "相手.トラッシュのコア: 0 → 2", "相手.トラッシュ: なし → ファンタズマ"],
})
scenario({
    name: "avalon-lv2-not-haou",
    start: avAttack(3, DAR, 3, FAN, 2),
    steps: (t) => meAttackBlock(t, "自分.攻撃者", "相手.防御者"),
    expect: ["自分.攻撃者.疲労: false → true", gone("相手", "防御者"), "相手.リザーブ: 10 → 12", "相手.トラッシュ: なし → ファンタズマ"],
})
scenario({
    name: "avalon-lv1-no-redirect",
    start: avAttack(1, NASU, 1, FAN, 2),
    steps: (t) => meAttackBlock(t, "自分.攻撃者", "相手.防御者"),
    expect: ["自分.攻撃者.疲労: false → true", gone("相手", "防御者"), "相手.リザーブ: 10 → 12", "相手.トラッシュ: なし → ファンタズマ"],
})
scenario({
    name: "avalon-lv2-both-destroyed",
    start: avAttack(3, NASU, 1, MEG, 1),
    steps: (t) => meAttackBlock(t, "自分.攻撃者", "相手.防御者"),
    expect: [
        gone("自分", "攻撃者"), "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → ナスノ・アーチャー",
        gone("相手", "防御者"), "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → メガ・ハンプダンプ",
    ],
})

// ============ X012A 英雄皇ロード・ドラゴン・ドミニオン ============
console.log("=== X012A. バースト：自分のライフ減少後に召喚／召喚時：手札のバースト持ちをセットしてドロー／Lv3：バースト中BP+3000 ===")
const lordLife = (hand: string[]) => ({
    turn: "opp" as const, phase: "attack" as const, interactive: true,
    me: { burst: LORD, hand },
    opp: { spirits: [{ card: V }] },
})
const lordCommon = [
    "自分.ライフ: 5 → 4", ...appear("自分", "英雄皇ロード・ドラゴン・ドミニオン", 1, 1, 5000), "相手.ロクケラトプス.疲労: false → true",
]
scenario({
    name: "lord-burst-set-draw",
    start: lordLife([TWIN]),
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        go(t)
    },
    expect: [
        ...lordCommon, "自分.バースト: 英雄皇ロード・ドラゴン・ドミニオン → 双光気弾", "自分.手札: 双光気弾 → ロクケラトプス", "自分.デッキ枚数: 40 → 39",
    ],
})
scenario({
    name: "lord-no-burst-card-in-hand",
    start: lordLife([V]),
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        go(t)
    },
    expect: [...lordCommon, "自分.バースト: 英雄皇ロード・ドラゴン・ドミニオン → なし"],
})
scenario({
    name: "lord-set-declined",
    start: lordLife([TWIN]),
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        go(t, [{}, { skip: true }])
    },
    expect: [...lordCommon, "自分.バースト: 英雄皇ロード・ドラゴン・ドミニオン → なし"],
})
const lordBp = (name: string, side: { turn?: "me" | "opp"; cores: number; burst?: string }, bp: number) =>
    scenario({
        name,
        start: {
            turn: side.turn ?? "me", phase: "attack",
            me: { spirits: [{ card: LORD, cores: side.cores }], ...(side.burst ? { burst: side.burst } : {}) },
        },
        steps: (t) => assert(effectiveBp(t.state, t.me, t.inst("英雄皇ロード・ドラゴン・ドミニオン")) === bp, `${name}: BP は ${bp}`),
        expect: [],
    })
lordBp("lord-lv3-burst-set", { cores: 5, burst: MARK }, 13000)
lordBp("lord-lv3-no-burst", { cores: 5 }, 10000)
lordBp("lord-lv2-burst-set", { cores: 3, burst: MARK }, 7000)
lordBp("lord-lv3-opp-turn", { turn: "opp", cores: 5, burst: MARK }, 10000)

console.log("すべてのチェックに合格しました 🎉（part657）")

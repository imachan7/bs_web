// smoke パート661（BS18 青の場面テスト：効果文だけから先に書いた期待値）
import { scenario } from "./scenario"
import type { InstanceSpec, ScenarioCtx } from "./scenario"
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// BS18（担当カード。名前は data/staging/BS18.json と一致）
const SHAG = "BS18-046" // シャッガイ・バグ
const ALT = "BS18-047" // アザーフェロム
const LEON = "BS18-048" // 猛将レオニダース
const AUG = "BS18-050" // アウグスドス
const MET = "BS18-051" // メテオライト・ゴレム
const HAN = "BS18-052" // 雷光将軍ハンニ・ヴァル
const NERO = "BS18-053" // タイラントール・ネロ
const SEZ = "BS18-054" // ディクタトール・シーザー
const CHAR = "BS18-060" // チャリオット・アームズ（ブレイヴ）
const SAFF = "BS18-071" // サファイアの街道（ネクサス）
const KAMA = "BS18-072" // 破壊と創造の釜（ネクサス）
const FALANX = "BS18-083" // アイアンファランクス（マジック）
const LEGION = "BS18-084" // ディクタトールレギオン（マジック）
const AZA = "BS18-X06" // 混沌魔皇アザートゥース
const DOM = "X012S" // 英雄皇ロード・ドラゴン・ドミニオン（青）

// 既存カード（BS17 以前）
const V = "BS01-002" // ロクケラトプス（赤・1・バニラ）
const BULL = "BS03-071" // 戦闘獣ブルトップ（青・0・Lv1 BP1000）
const ILU = "BS16-053" // イルルヤンカッシュ（青・6・青シンボル2つ・Lv1 BP5000）
const GUS = "BS04-060" // 戦士グスタフ（青・1・Lv1 BP2000）
const YARI = "BS03-072" // 槍兵のジェフリー（青・1・Lv1 BP2000／Lv2=4コア BP5000）
const FAL = "BS07-052" // 隼の剣士ファルコニア（青・5・【強襲：1】・Lv1 BP5000）
const DIAL = "BS10-057" // 鹿人ディアルド（青・5・Lv1 BP5000）
const MACH = "BS02-026" // マッハジー（緑・1・フラッシュ【神速】）
const YAGYU = "BS14-061" // ヤギュード・ジューベイ（青・4・系統覇皇・バーストを持つスピリット）
const TOPAZ = "BS02-085" // トパーズの流星（黄ネクサス）
const SEIDO = "BS02-084" // 祝福されし大聖堂（黄ネクサス・コスト3・軽減[黄][黄]）
const LEO = "BS16-043" // スペードビースト・レオ（黄・6・黄シンボル2つ）
const RW = "BS04-110" // レッドウォール（青マジック・2・フラッシュのみ・対象なし）
const DD = "BS01-117" // ダブルドロー（赤マジック・4・メイン2枚ドロー／フラッシュBP+2000）
const PA = "BS01-135" // パワーオーラ（緑マジック・3・フラッシュ1枚ドロー）
const ROCOMO = "BS10-054" // ロコモ・ゴレム（青・4・【粉砕】アタック時に相手デッキを Lv 枚破棄）
const METAL = "BS01-008" // メタルバーン（赤・3・バニラ）
const DIATR = "BS04-070" // 戦闘獣ディアトリマー（青・4・バニラ）
const TROLL = "BS03-078" // 暴れトロル（青・2・バニラ）
const DUN = "BS03-081" // 人馬巨兵ダンストン（青・3・バニラ）
const BMAGIC = "BS14-092" // 烈光閃刃（赤マジック・4・バースト持ち）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string, string, string][] = [
        [SHAG, "シャッガイ・バグ", "spirit", "blue"],
        [ALT, "アザーフェロム", "spirit", "blue"],
        [LEON, "猛将レオニダース", "spirit", "blue"],
        [AUG, "アウグスドス", "spirit", "blue"],
        [MET, "メテオライト・ゴレム", "spirit", "blue"],
        [HAN, "雷光将軍ハンニ・ヴァル", "spirit", "blue"],
        [NERO, "タイラントール・ネロ", "spirit", "blue"],
        [SEZ, "ディクタトール・シーザー", "spirit", "blue"],
        [CHAR, "チャリオット・アームズ", "brave", "blue"],
        [SAFF, "サファイアの街道", "nexus", "blue"],
        [KAMA, "破壊と創造の釜", "nexus", "blue"],
        [FALANX, "アイアンファランクス", "magic", "blue"],
        [LEGION, "ディクタトールレギオン", "magic", "blue"],
        [AZA, "混沌魔皇アザートゥース", "spirit", "blue"],
        [DOM, "英雄皇ロード・ドラゴン・ドミニオン", "spirit", "blue"],
        [V, "ロクケラトプス", "spirit", "red"],
        [BULL, "戦闘獣ブルトップ", "spirit", "blue"],
        [ILU, "イルルヤンカッシュ", "spirit", "blue"],
        [GUS, "戦士グスタフ", "spirit", "blue"],
        [YARI, "槍兵のジェフリー", "spirit", "blue"],
        [FAL, "隼の剣士ファルコニア", "spirit", "blue"],
        [DIAL, "鹿人ディアルド", "spirit", "blue"],
        [MACH, "マッハジー", "spirit", "green"],
        [YAGYU, "ヤギュード・ジューベイ", "spirit", "blue"],
        [TOPAZ, "トパーズの流星", "nexus", "yellow"],
        [SEIDO, "祝福されし大聖堂", "nexus", "yellow"],
        [LEO, "スペードビースト・レオ", "spirit", "yellow"],
        [RW, "レッドウォール", "magic", "blue"],
        [DD, "ダブルドロー", "magic", "red"],
        [PA, "パワーオーラ", "magic", "green"],
        [ROCOMO, "ロコモ・ゴレム", "spirit", "blue"],
        [METAL, "メタルバーン", "spirit", "red"],
        [DIATR, "戦闘獣ディアトリマー", "spirit", "blue"],
        [TROLL, "暴れトロル", "spirit", "blue"],
        [DUN, "人馬巨兵ダンストン", "spirit", "blue"],
        [BMAGIC, "烈光閃刃", "magic", "red"],
    ]
    for (const [id, name, type, color] of names) {
        const c = getCard(id)
        assert(c.name === name && c.type === type && c.colors[0] === color, `${id} は ${name}（${type}・${color}）`)
    }
    assert(getCard(DIATR).cost === 4 && getCard(DUN).cost === 3 && getCard(TROLL).cost === 2 && getCard(METAL).cost === 3, "材料のコスト")
    assert(getCard(DD).cost === 4 && getCard(RW).cost === 2 && getCard(PA).cost === 3, "マジックのコスト")
    assert(getCard(ILU).symbol?.length === 2 && getCard(LEO).symbol?.length === 2, "ILU・LEO はシンボル2つ")
}

const jn = (...n: string[]) => n.sort().join("、")
const RWN = "レッドウォール"
const BULLN = "戦闘獣ブルトップ"

// 自分が attacker で攻撃し、相手が blocker でブロックして戦闘を終える
function clash(t: ScenarioCtx, attacker: string, blocker: string): void {
    t.act("me", { type: "attack", instanceId: t.id(attacker) })
    t.closeFlash()
    t.act("opp", { type: "block", instanceId: t.id(blocker) })
    t.closeFlash()
}
// 自分が攻撃し、相手がライフで受ける
function hit(t: ScenarioCtx, attacker: string): void {
    t.act("me", { type: "attack", instanceId: t.id(attacker) })
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
}
// 戦闘で相手の青の牛が破壊されたときの盤面の変化
const BULL_DIES = ["相手.トラッシュ: なし → 戦闘獣ブルトップ", "相手.リザーブ: 10 → 11", "相手.牛.場所: フィールド → なし"]

console.log("=== BS18-046 シャッガイ・バグ ===")
// Lv2『自分のアタックステップ』シンボル2つ以上の自分のスピリットは、BPを比べ相手のスピリットだけを破壊したとき回復する
const shagStart = (shagCores: number, attacker: { card: string; label: string }) => ({
    phase: "attack" as const,
    me: { spirits: [{ card: SHAG, label: "シャッガイ", cores: shagCores }, attacker] },
    opp: { spirits: [{ card: BULL, label: "牛" }] },
})
scenario({
    name: "046-成立（Lv2・2シンボルが勝って回復する）",
    start: shagStart(3, { card: ILU, label: "二象" }),
    steps: (t) => clash(t, "二象", "牛"),
    expect: [...BULL_DIES],
})
scenario({
    name: "046-1シンボルは回復しない",
    start: shagStart(3, { card: GUS, label: "兵" }),
    steps: (t) => clash(t, "兵", "牛"),
    expect: [...BULL_DIES, "自分.兵.疲労: false → true"],
})
scenario({
    name: "046-Lv1では回復しない",
    start: shagStart(1, { card: ILU, label: "二象" }),
    steps: (t) => clash(t, "二象", "牛"),
    expect: [...BULL_DIES, "自分.二象.疲労: false → true"],
})
scenario({
    name: "046-相手のターン（ブロックして勝っても回復しない）",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: SHAG, label: "シャッガイ", cores: 3 }, { card: ILU, label: "二象" }] },
        opp: { spirits: [{ card: V, label: "ロク" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ロク") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("二象") })
        t.closeFlash()
    },
    expect: ["自分.二象.疲労: false → true", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11", "相手.ロク.場所: フィールド → なし"],
})

console.log("=== BS18-047 アザーフェロム ===")
// 手札の軽減シンボルを増やせない。場の黄シンボル3（トパーズ1＋レオ2）、大聖堂の軽減[黄][黄]に[黄][黄]が足されて全額軽減（コスト0）になる配置
const altBase = { hand: [SEIDO], reserve: 0, nexuses: [{ card: TOPAZ, label: "トパーズ" }] }
scenario({
    name: "047-対照（アザーフェロムがいなければ付与で軽減されコスト0で置ける）",
    start: { me: { ...altBase, spirits: [{ card: LEO, label: "レオ" }] } },
    steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
    expect: [
        "自分.手札: 祝福されし大聖堂 → なし",
        "自分.祝福されし大聖堂.Lv: なし → 1",
        "自分.祝福されし大聖堂.コア: なし → 0",
        "自分.祝福されし大聖堂.場所: なし → ネクサス",
        "自分.祝福されし大聖堂.疲労: なし → false",
    ],
})
scenario({
    name: "047-自分の場にいると付与が効かずコスト1になり置けない",
    start: { me: { ...altBase, spirits: [{ card: LEO, label: "レオ" }, { card: ALT, label: "アザー" }] } },
    steps: (t) => t.actRejected("me", { type: "setNexus", handIndex: 0 }),
    expect: [],
})
scenario({
    name: "047-相手の場にいても効く（お互い）",
    start: { me: { ...altBase, spirits: [{ card: LEO, label: "レオ" }] }, opp: { spirits: [{ card: ALT, label: "アザー" }] } },
    steps: (t) => t.actRejected("me", { type: "setNexus", handIndex: 0 }),
    expect: [],
})

console.log("=== BS18-048 猛将レオニダース ===")
// Lv1･Lv2 自分のネクサス1つにつきBP+1000
scenario({
    name: "048-BP（自分のネクサスの数だけ増え、相手のネクサスは数えない）",
    start: {
        me: { spirits: [{ card: LEON, label: "将" }], nexuses: [{ card: SEIDO, label: "聖堂" }] },
        opp: { nexuses: [{ card: SEIDO, label: "敵聖堂" }, { card: TOPAZ, label: "敵流星" }] },
    },
    steps(t) {
        assert(effectiveBp(t.state, t.me, t.inst("将")) === 4000, "048: ネクサス1つでBP3000+1000")
    },
    expect: [],
})
scenario({
    name: "048-BP（ネクサス2つ）",
    start: { me: { spirits: [{ card: LEON, label: "将" }], nexuses: [{ card: SEIDO, label: "聖堂" }, { card: TOPAZ, label: "流星" }] } },
    steps(t) {
        assert(effectiveBp(t.state, t.me, t.inst("将")) === 5000, "048: ネクサス2つでBP3000+2000")
    },
    expect: [],
})
const drawCast = (t: ScenarioCtx) => t.act("me", { type: "castMagic", handIndex: 0 })
const ddPaid = ["自分.トラッシュ: なし → ダブルドロー", "自分.トラッシュのコア: 0 → 4", "自分.リザーブ: 10 → 6"]
scenario({
    name: "048-対照（いなければ2枚ドローできる）",
    start: { me: { hand: [DD] } },
    steps: drawCast,
    expect: [...ddPaid, "自分.デッキ枚数: 40 → 38", "自分.手札: ダブルドロー → ロクケラトプス、ロクケラトプス"],
})
scenario({
    name: "048-自分の場にいるとドローで手札が増えない（使用は成立し、コストは払う）",
    start: { me: { hand: [DD], spirits: [{ card: LEON, label: "将" }] } },
    steps: drawCast,
    expect: ["自分.手札: ダブルドロー → なし", ...ddPaid],
})
scenario({
    name: "048-相手の場にいても止まる（お互い）",
    start: { me: { hand: [DD] }, opp: { spirits: [{ card: LEON, label: "敵将" }] } },
    steps: drawCast,
    expect: ["自分.手札: ダブルドロー → なし", ...ddPaid],
})

console.log("=== BS18-049 グラッディ・スクアーロ（効果文なし。場面なし）===")
assert(getCard("BS18-049").name === "グラッディ・スクアーロ" && !(getCard("BS18-049").effect ?? "").trim(), "049は効果文なし")

console.log("=== BS18-050 アウグスドス ===")
scenario({
    name: "050-Lv1ではアタックできない",
    start: { phase: "attack", me: { spirits: [{ card: AUG, label: "アウグスドス", cores: 1 }] } },
    steps: (t) => t.actRejected("me", { type: "attack", instanceId: t.id("アウグスドス") }),
    expect: [],
})
scenario({
    name: "050-Lv2ならアタックできる",
    start: { phase: "attack", me: { spirits: [{ card: AUG, label: "アウグスドス", cores: 4 }] } },
    steps: (t) => hit(t, "アウグスドス"),
    expect: ["自分.アウグスドス.疲労: false → true", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"],
})
const rocomoAttack = { phase: "attack" as const }
scenario({
    name: "050-対照（いなければ【粉砕】で相手のデッキが1枚破棄される）",
    start: { ...rocomoAttack, me: { spirits: [{ card: ROCOMO, label: "ロコモ" }] } },
    steps: (t) => hit(t, "ロコモ"),
    expect: [
        "自分.ロコモ.疲労: false → true",
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "050-自分の場にいると自分の【粉砕】でも破棄されない",
    start: { ...rocomoAttack, me: { spirits: [{ card: ROCOMO, label: "ロコモ" }, { card: AUG, label: "アウグスドス", cores: 1 }] } },
    steps: (t) => hit(t, "ロコモ"),
    expect: ["自分.ロコモ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "050-相手の場にいても破棄されない（お互い）",
    start: { ...rocomoAttack, me: { spirits: [{ card: ROCOMO, label: "ロコモ" }] }, opp: { spirits: [{ card: AUG, label: "敵アウグスドス", cores: 1 }] } },
    steps: (t) => hit(t, "ロコモ"),
    expect: ["自分.ロコモ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== BS18-051 メテオライト・ゴレム ===")
// 【強襲】は確認式（COST_MODEL.md。2026-10-02）。対話モードでは確認が出て、断れば回復せず回数も減らない
const kyoshuScenes = (card: string, id: string) => {
    const base = (nexuses: InstanceSpec[]) => ({ phase: "attack" as const, interactive: true, me: { spirits: [{ card, label: id }], nexuses } })
    scenario({
        name: `${id}-【強襲】確認に応じるとネクサスを疲労させて回復する`,
        start: base([{ card: SEIDO, label: "聖堂" }]),
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id(id) })
            t.act("me", { type: "resolveChoice", option: "発動する" })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.聖堂.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: `${id}-【強襲】確認を断ると回復せず、ネクサスも疲労しない`,
        start: base([{ card: SEIDO, label: "聖堂" }]),
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id(id) })
            t.act("me", { type: "resolveChoice" })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [`自分.${id}.疲労: false → true`, "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: `${id}-【強襲】ターンに1回まで（2回目のアタックでは確認が出ず回復しない）`,
        start: base([{ card: SEIDO, label: "聖堂" }]),
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id(id) })
            t.act("me", { type: "resolveChoice", option: "発動する" })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
            t.act("me", { type: "attack", instanceId: t.id(id) })
            assert(t.state.pendingChoice === null, `${id}: 2回目は確認が出ない`)
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.聖堂.疲労: false → true", `自分.${id}.疲労: false → true`, "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"],
    })
}
kyoshuScenes(MET, "メテオ")
// 【強襲：1】ネクサス1つを疲労させて回復する（ターンに1回まで）
scenario({
    name: "051-ネクサスを疲労させて回復する",
    start: { phase: "attack", me: { spirits: [{ card: MET, label: "メテオ" }], nexuses: [{ card: SEIDO, label: "聖堂" }] } },
    steps: (t) => hit(t, "メテオ"),
    expect: ["自分.聖堂.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "051-疲労させるネクサスがなければ回復できない",
    start: { phase: "attack", me: { spirits: [{ card: MET, label: "メテオ" }], nexuses: [{ card: SEIDO, label: "聖堂", rested: true }] } },
    steps: (t) => hit(t, "メテオ"),
    expect: ["自分.メテオ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== BS18-052 雷光将軍ハンニ・ヴァル ===")
// Lv2･Lv3 ブロックされたとき、系統「覇皇」の自分のスピリット1体を回復
const hanStart = (hanCores: number) => ({
    phase: "attack" as const,
    me: {
        spirits: [
            { card: HAN, label: "ハンニ", cores: hanCores },
            { card: YAGYU, label: "覇皇", rested: true },
            { card: V, label: "休み", rested: true },
        ],
    },
    opp: { spirits: [{ card: BULL, label: "牛" }, { card: YAGYU, label: "敵覇皇", rested: true }] },
})
scenario({
    name: "052-Lv2でブロックされると自分の覇皇だけ回復する",
    start: hanStart(2),
    steps: (t) => clash(t, "ハンニ", "牛"),
    expect: ["自分.ハンニ.疲労: false → true", "自分.覇皇.疲労: true → false", ...BULL_DIES],
})
scenario({
    name: "052-Lv1では回復しない",
    start: hanStart(1),
    steps: (t) => clash(t, "ハンニ", "牛"),
    expect: ["自分.ハンニ.疲労: false → true", ...BULL_DIES],
})
scenario({
    name: "052-ブロックされなければ回復しない",
    start: { phase: "attack", me: hanStart(2).me, opp: { spirits: [{ card: YAGYU, label: "敵覇皇", rested: true }] } },
    steps: (t) => hit(t, "ハンニ"),
    expect: ["自分.ハンニ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
// 手札のスピリットカードの効果が発揮されない（【神速】の召喚）
const machLines = [
    "自分.手札: マッハジー → なし",
    "自分.トラッシュのコア: 0 → 1",
    "自分.リザーブ: 10 → 8",
    "自分.マッハジー.BP: なし → 2000",
    "自分.マッハジー.Lv: なし → 1",
    "自分.マッハジー.コア: なし → 1",
    "自分.マッハジー.場所: なし → フィールド",
    "自分.マッハジー.疲労: なし → false",
]
const hanDefend = (me: object, opp: object) => ({ turn: "opp" as const, phase: "attack" as const, me: { hand: [MACH], ...me }, opp })
const oppAttackV = (t: ScenarioCtx) => t.act("opp", { type: "attack", instanceId: t.id("ロク") })
scenario({
    name: "052-対照（いなければ手札の【神速】で召喚できる）",
    start: hanDefend({}, { spirits: [{ card: V, label: "ロク" }] }),
    steps(t) {
        oppAttackV(t)
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: ["相手.ロク.疲労: false → true", ...machLines],
})
scenario({
    name: "052-自分の場にいると手札の【神速】で召喚できない",
    start: hanDefend({ spirits: [{ card: HAN, label: "ハンニ", cores: 1 }] }, { spirits: [{ card: V, label: "ロク" }] }),
    steps(t) {
        oppAttackV(t)
        t.actRejected("me", { type: "summon", handIndex: 0 })
    },
    expect: ["相手.ロク.疲労: false → true"],
})
scenario({
    name: "052-相手の場にいても召喚できない（お互い）",
    start: hanDefend({}, { spirits: [{ card: V, label: "ロク" }, { card: HAN, label: "ハンニ", cores: 1 }] }),
    steps(t) {
        oppAttackV(t)
        t.actRejected("me", { type: "summon", handIndex: 0 })
    },
    expect: ["相手.ロク.疲労: false → true"],
})
scenario({
    name: "052-通常の召喚は止めない",
    start: { me: { hand: [MACH], spirits: [{ card: HAN, label: "ハンニ", cores: 1 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...machLines],
})
scenario({
    name: "052-手札のマジックは止めない（スピリットカードだけ）",
    start: hanDefend({ hand: [RW], spirits: [{ card: HAN, label: "ハンニ", cores: 1 }] }, { spirits: [{ card: V, label: "ロク" }] }),
    steps(t) {
        oppAttackV(t)
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [
        "相手.ロク.疲労: false → true",
        "自分.手札: レッドウォール → なし",
        "自分.トラッシュ: なし → レッドウォール",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 9",
    ],
}) // ハンニの青シンボル1つで軽減1

console.log("=== BS18-053 タイラントール・ネロ ===")
// シンボル2つ以上の自分のスピリットがアタックしている間、相手は手札のマジックを使用できない
scenario({
    name: "053-2シンボルがアタックしている間、相手は手札のマジックを使えない",
    start: { phase: "attack", me: { spirits: [{ card: NERO, label: "ネロ" }, { card: ILU, label: "二象" }] }, opp: { hand: [RW] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("二象") })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: ["自分.二象.疲労: false → true"],
})
scenario({
    name: "053-1シンボルのアタックでは使える",
    start: { phase: "attack", me: { spirits: [{ card: NERO, label: "ネロ" }, { card: GUS, label: "兵" }] }, opp: { hand: [RW] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("兵") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [
        "自分.兵.疲労: false → true",
        "相手.手札: レッドウォール → なし",
        "相手.トラッシュ: なし → レッドウォール",
        "相手.トラッシュのコア: 0 → 2",
        "相手.リザーブ: 10 → 8",
    ],
})
scenario({
    name: "053-自分のマジックは止まらない",
    start: { phase: "attack", me: { hand: [RW], spirits: [{ card: NERO, label: "ネロ" }, { card: ILU, label: "二象" }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("二象") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [
        "自分.二象.疲労: false → true",
        "自分.手札: レッドウォール → なし",
        "自分.トラッシュ: なし → レッドウォール",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 9",
    ],
})
scenario({
    name: "053-相手の2シンボルのアタックには効かない（自分のスピリットではない）",
    start: {
        turn: "opp",
        phase: "attack",
        me: { hand: [RW], spirits: [{ card: NERO, label: "ネロ" }] },
        opp: { spirits: [{ card: ILU, label: "敵二象" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("敵二象") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [
        "相手.敵二象.疲労: false → true",
        "自分.手札: レッドウォール → なし",
        "自分.トラッシュ: なし → レッドウォール",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 9",
    ],
})

console.log("=== BS18-054 ディクタトール・シーザー ===")
scenario({
    name: "054-バースト（ライフが2以下になったので召喚される）",
    start: {
        turn: "opp",
        phase: "attack",
        me: { life: 3, burst: SEZ },
        opp: { spirits: [{ card: V, label: "ロク" }] },
    },
    steps(t) {
        oppAttackV(t)
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 3 → 2",
        "自分.バースト: ディクタトール・シーザー → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 8",
        "自分.ディクタトール・シーザー.BP: なし → 5000",
        "自分.ディクタトール・シーザー.Lv: なし → 1",
        "自分.ディクタトール・シーザー.コア: なし → 1",
        "自分.ディクタトール・シーザー.場所: なし → フィールド",
        "自分.ディクタトール・シーザー.疲労: なし → false",
        "相手.ロク.疲労: false → true",
    ],
})
scenario({
    name: "054-【強襲】ネクサスを疲労させて回復する",
    start: { phase: "attack", me: { spirits: [{ card: SEZ, label: "シーザー" }], nexuses: [{ card: SEIDO, label: "聖堂" }] } },
    steps: (t) => hit(t, "シーザー"),
    expect: ["自分.聖堂.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
// Lv2 BPを比べ相手のスピリットだけを破壊したとき、相手は次のターンのメインステップを行えない
kyoshuScenes(SEZ, "シーザー")
scenario({
    name: "054-バースト（ライフが3以上のままなら召喚されず、カードはトラッシュへ）",
    start: { turn: "opp", phase: "attack", me: { life: 5, burst: SEZ }, opp: { spirits: [{ card: V, label: "ロク" }] } },
    steps(t) {
        oppAttackV(t)
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
        "自分.バースト: ディクタトール・シーザー → なし",
        "自分.トラッシュ: なし → ディクタトール・シーザー",
        "相手.ロク.疲労: false → true",
    ],
})
scenario({
    name: "054-Lv2で相手のスピリットだけを破壊すると、相手は次のターンのメインステップを行えない",
    start: { phase: "attack", me: { spirits: [{ card: SEZ, label: "シーザー", cores: 4 }] }, opp: { hand: [V], spirits: [{ card: BULL, label: "牛" }] } },
    steps(t) {
        clash(t, "シーザー", "牛")
        t.act("me", { type: "endTurn" })
        t.actRejected("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.シーザー.疲労: false → true",
        "相手.牛.場所: フィールド → なし",
        "相手.トラッシュ: なし → 戦闘獣ブルトップ",
        "相手.リザーブ: 10 → 12",
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: ロクケラトプス → ロクケラトプス、ロクケラトプス",
    ],
})
scenario({
    name: "054-ライフで受けた（スピリットを破壊していない）なら相手のメインステップは行える",
    start: { phase: "attack", me: { spirits: [{ card: SEZ, label: "シーザー", cores: 4 }] }, opp: { hand: [V] } },
    steps(t) {
        hit(t, "シーザー")
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.シーザー.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュのコア: 0 → 1",
        "相手.ロクケラトプス.BP: なし → 1000",
        "相手.ロクケラトプス.Lv: なし → 1",
        "相手.ロクケラトプス.コア: なし → 1",
        "相手.ロクケラトプス.場所: なし → フィールド",
        "相手.ロクケラトプス.疲労: なし → false",
    ],
})

console.log("=== BS18-060 チャリオット・アームズ ===")
// 合体アタック時、お互いの手札にあるカードすべてのコストをこのターンの間8にする（後から手札に入ったカードにも効く）
function game060(seed: string, o: { host: string; oppReserve?: number; oppHand?: string[]; meHand?: string[]; meDeck?: string[] }): { s: GameState; host: string; brave: string } {
    const s = createGame(`bs18-060-${seed}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = s.players[pid]
        p.life = 5
        p.reserve = 10
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => V)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
        p.burst = null
        p.burstSet = false
    }
    s.players.p2.reserve = o.oppReserve ?? 10
    s.players.p2.hand = [...(o.oppHand ?? [])]
    s.players.p1.hand = [...(o.meHand ?? [])]
    if (o.meDeck) s.players.p1.deck = [...o.meDeck]
    const host = createInstance(o.host, s.turn - 1, 1)
    const brave = createInstance(CHAR, s.turn - 1, 1)
    s.players.p1.field.spirits.push(host, brave)
    refreshLevelAsOverrides(s)
    return { s, host: host.instanceId, brave: brave.instanceId }
}
const combine060 = (g: { s: GameState; host: string; brave: string }): string | null => act(g.s, "p1", { type: "combineBrave", braveInstanceId: g.brave, hostInstanceId: g.host })
const attack060 = (g: { s: GameState; host: string; brave: string }): void => {
    assert(combine060(g) === null, "060: コスト4以上のスピリットに合体できる")
    assert(act(g.s, "p1", { type: "nextPhase" }) === null, "060: アタックステップへ")
    assert(act(g.s, "p1", { type: "attack", instanceId: g.host }) === null, "060: 合体スピリットでアタック")
}
{
    const g = game060("cost3", { host: DUN })
    assert(combine060(g) !== null, "060: 合体条件（コスト4以上）を満たさない相手には合体できない")
}
{
    const g = game060("opp8", { host: DIATR, oppReserve: 8, oppHand: [RW] })
    attack060(g)
    assert(act(g.s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "060: 相手の手札はコスト8になる（リザーブ8で使える）")
    assert(g.s.players.p2.reserve === 0, "060: レッドウォールにコスト8を払った（リザーブ0）")
}
{
    const g = game060("opp7", { host: DIATR, oppReserve: 7, oppHand: [RW] })
    attack060(g)
    assert(act(g.s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }) !== null, "060: 相手の手札はコスト8になる（リザーブ7では使えない）")
}
{
    const g = game060("nocombine", { host: DIATR, oppReserve: 2, oppHand: [RW] })
    assert(act(g.s, "p1", { type: "nextPhase" }) === null, "060: 合体せずにアタックステップへ")
    assert(act(g.s, "p1", { type: "attack", instanceId: g.host }) === null, "060: 合体せずにアタック")
    assert(act(g.s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "060: 合体アタックでなければコストはそのまま（リザーブ2で使える）")
}
{
    const g = game060("later", { host: DIATR, meHand: [PA], meDeck: Array.from({ length: 40 }, () => RW) })
    attack060(g)
    assert(act(g.s, "p2", { type: "pass" }) === null, "060: 相手がパス")
    const before = g.s.players.p1.reserve
    assert(act(g.s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "060: 自分の手札もコスト8（パワーオーラ）")
    assert(g.s.players.p1.reserve === before - 8, "060: パワーオーラに8払った")
    assert(g.s.players.p1.hand.length === 1, "060: パワーオーラで1枚ドローした")
    assert(before - 8 >= 2 && before - 8 < 8, "060: 前提（残りのリザーブはレッドウォールの元のコスト2以上、8未満）")
    if (g.s.priorityPlayer === "p2") act(g.s, "p2", { type: "pass" })
    assert(act(g.s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) !== null, "060: 解決後に手札に入ったカードもコスト8になっている")
}

console.log("=== BS18-071 サファイアの街道 ===")
// 【強襲】を持つ自分のスピリットがBPを比べ相手のスピリットだけを破壊したとき、ボイドからコア1個を自分のリザーブに
scenario({
    name: "071-【強襲】のスピリットが勝つとリザーブにコアが増える",
    start: {
        phase: "attack",
        me: { spirits: [{ card: FAL, label: "隼" }], nexuses: [{ card: SAFF, label: "街道", rested: true }] },
        opp: { spirits: [{ card: BULL, label: "牛" }] },
    },
    steps: (t) => clash(t, "隼", "牛"),
    expect: ["自分.リザーブ: 10 → 11", "自分.隼.疲労: false → true", ...BULL_DIES],
})
scenario({
    name: "071-相手のターンのブロックでも働く（お互いのアタックステップ）",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: FAL, label: "隼" }], nexuses: [{ card: SAFF, label: "街道" }] },
        opp: { spirits: [{ card: V, label: "ロク" }] },
    },
    steps(t) {
        oppAttackV(t)
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("隼") })
        t.closeFlash()
    },
    expect: [
        "自分.リザーブ: 10 → 11",
        "自分.隼.疲労: false → true",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "相手.ロク.場所: フィールド → なし",
    ],
})
scenario({
    name: "071-【強襲】を持たないスピリットでは増えない",
    start: {
        phase: "attack",
        me: { spirits: [{ card: GUS, label: "兵" }], nexuses: [{ card: SAFF, label: "街道" }] },
        opp: { spirits: [{ card: BULL, label: "牛" }] },
    },
    steps: (t) => clash(t, "兵", "牛"),
    expect: ["自分.兵.疲労: false → true", ...BULL_DIES],
})
scenario({
    name: "071-相打ち（自分も破壊された）なら増えない",
    start: {
        phase: "attack",
        me: { spirits: [{ card: FAL, label: "隼" }], nexuses: [{ card: SAFF, label: "街道", rested: true }] },
        opp: { spirits: [{ card: DIAL, label: "ディアルド" }] },
    },
    steps: (t) => clash(t, "隼", "ディアルド"),
    expect: [
        "自分.トラッシュ: なし → 隼の剣士ファルコニア",
        "自分.リザーブ: 10 → 11",
        "自分.隼.場所: フィールド → なし",
        "相手.トラッシュ: なし → 鹿人ディアルド",
        "相手.リザーブ: 10 → 11",
        "相手.ディアルド.場所: フィールド → なし",
    ],
})
// Lv2『自分のエンドステップ』疲労状態の自分のネクサス1つにつき、自分のスピリット1体を回復
const oppTurnStart = ["相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11", "相手.手札: なし → ロクケラトプス"]
scenario({
    name: "071-Lv2のエンドステップに、疲労状態のネクサスの数だけ回復する",
    start: {
        me: {
            nexuses: [{ card: SAFF, label: "街道", cores: 2, rested: true }, { card: SEIDO, label: "聖堂" }],
            spirits: [{ card: V, label: "休み", rested: true }],
        },
    },
    steps: (t) => t.act("me", { type: "endTurn" }),
    expect: ["自分.休み.疲労: true → false", ...oppTurnStart],
})
scenario({
    name: "071-疲労状態のネクサスが2つなら2体回復する",
    start: {
        me: {
            nexuses: [{ card: SAFF, label: "街道", cores: 2, rested: true }, { card: SEIDO, label: "聖堂", rested: true }],
            spirits: [{ card: V, label: "休みA", rested: true }, { card: GUS, label: "休みB", rested: true }],
        },
    },
    steps: (t) => t.act("me", { type: "endTurn" }),
    expect: ["自分.休みA.疲労: true → false", "自分.休みB.疲労: true → false", ...oppTurnStart],
})
scenario({
    name: "071-Lv1では回復しない",
    start: { me: { nexuses: [{ card: SAFF, label: "街道", cores: 1, rested: true }], spirits: [{ card: V, label: "休み", rested: true }] } },
    steps: (t) => t.act("me", { type: "endTurn" }),
    expect: [...oppTurnStart],
})

console.log("=== BS18-072 破壊と創造の釜 ===")
// Lv1･Lv2 配置時、コスト3以下の相手のスピリット1体を破壊
const kamaSet = [
    "自分.手札: 破壊と創造の釜 → なし",
    "自分.リザーブ: 10 → 6",
    "自分.トラッシュのコア: 0 → 4",
    "自分.破壊と創造の釜.Lv: なし → 1",
    "自分.破壊と創造の釜.コア: なし → 0",
    "自分.破壊と創造の釜.場所: なし → ネクサス",
    "自分.破壊と創造の釜.疲労: なし → false",
]
scenario({
    name: "072-配置時にコスト3以下の相手のスピリットだけを破壊する（コスト3は破壊、4と自分のスピリットは残る）",
    start: {
        me: { hand: [KAMA], spirits: [{ card: V, label: "自軍" }] },
        opp: { spirits: [{ card: METAL, label: "メタル" }, { card: DIATR, label: "ディア" }] },
    },
    steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
    expect: [...kamaSet, "相手.トラッシュ: なし → メタルバーン", "相手.リザーブ: 10 → 11", "相手.メタル.場所: フィールド → なし"],
})
scenario({
    name: "072-コスト4以上しかいなければ何も破壊しない（配置は成立する）",
    start: { me: { hand: [KAMA] }, opp: { spirits: [{ card: DIATR, label: "ディア" }] } },
    steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
    expect: [...kamaSet],
})
// Lv2『自分のアタックステップ』コアが4個以上の自分の青のスピリットは青シンボル2つになる（シャッガイの回復で観測する）
const kamaSym = (kamaCores: number, yariCores: number) => ({
    phase: "attack" as const,
    me: {
        nexuses: [{ card: KAMA, label: "釜", cores: kamaCores }],
        spirits: [{ card: SHAG, label: "シャッガイ", cores: 3 }, { card: YARI, label: "槍", cores: yariCores }],
    },
    opp: { spirits: [{ card: BULL, label: "牛" }] },
})
scenario({
    name: "072-Lv2でコア4個の青のスピリットは2シンボル扱い（回復する）",
    start: kamaSym(3, 4),
    steps: (t) => clash(t, "槍", "牛"),
    expect: [...BULL_DIES],
})
scenario({
    name: "072-コア3個では変わらない",
    start: kamaSym(3, 3),
    steps: (t) => clash(t, "槍", "牛"),
    expect: [...BULL_DIES, "自分.槍.疲労: false → true"],
})
scenario({
    name: "072-Lv1では変わらない",
    start: kamaSym(1, 4),
    steps: (t) => clash(t, "槍", "牛"),
    expect: [...BULL_DIES, "自分.槍.疲労: false → true"],
})

console.log("=== BS18-083 アイアンファランクス ===")
// 自分の青のシンボルの合計以下のコストの相手のスピリット1体を破壊（フラッシュ）
const falanxPaid = [
    "自分.手札: アイアンファランクス → なし",
    "自分.トラッシュ: なし → アイアンファランクス",
    "自分.トラッシュのコア: 0 → 2",
    "自分.リザーブ: 10 → 8",
]
scenario({
    name: "083-青シンボル3（ILU2＋兵1）でコスト3まで破壊できる（コスト4は残る）",
    start: {
        me: { hand: [FALANX], spirits: [{ card: ILU, label: "二象" }, { card: GUS, label: "兵" }] },
        opp: { spirits: [{ card: METAL, label: "メタル" }, { card: DIATR, label: "ディア" }] },
    },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("メタル") }),
    expect: [...falanxPaid, "相手.トラッシュ: なし → メタルバーン", "相手.リザーブ: 10 → 11", "相手.メタル.場所: フィールド → なし"],
})
scenario({
    name: "083-青シンボル2ちょうどならコスト2を破壊できる",
    start: { me: { hand: [FALANX], spirits: [{ card: ILU, label: "二象" }] }, opp: { spirits: [{ card: TROLL, label: "トロル" }, { card: METAL, label: "メタル" }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("トロル") }),
    expect: [...falanxPaid, "相手.トラッシュ: なし → 暴れトロル", "相手.リザーブ: 10 → 11", "相手.トロル.場所: フィールド → なし"],
})
scenario({
    name: "083-青シンボル2ではコスト3は破壊できない",
    start: { me: { hand: [FALANX], spirits: [{ card: ILU, label: "二象" }] }, opp: { spirits: [{ card: METAL, label: "メタル" }] } },
    steps: (t) => t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("メタル") }),
    expect: [],
})
scenario({
    name: "083-相手の青シンボルは数えない",
    start: { me: { hand: [FALANX], spirits: [{ card: ILU, label: "二象" }] }, opp: { spirits: [{ card: METAL, label: "メタル" }, { card: DIAL, label: "ディアルド" }] } },
    steps: (t) => t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("メタル") }),
    expect: [],
})

console.log("=== BS18-084 ディクタトールレギオン ===")
// フラッシュ：相手のバースト1つをオープンし、スピリットカードなら破棄、それ以外は元に戻す。メインステップでは使えない
const legionStart = (oppBurst: string, extra: { reserve?: number } = {}) => ({
    turn: "opp" as const,
    phase: "attack" as const,
    me: { hand: [LEGION], spirits: [{ card: GUS, label: "兵" }], ...extra },
    opp: { burst: oppBurst, spirits: [{ card: V, label: "ロク" }] },
})
const legionPaid = [
    "相手.ロク.疲労: false → true",
    "自分.手札: ディクタトールレギオン → なし",
    "自分.トラッシュ: なし → ディクタトールレギオン",
    "自分.トラッシュのコア: 0 → 4",
    "自分.リザーブ: 10 → 6",
]
scenario({
    name: "084-フラッシュ：相手のバーストがスピリットカードなら破棄される",
    start: legionStart(YAGYU),
    steps(t) {
        oppAttackV(t)
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [...legionPaid, "相手.バースト: ヤギュード・ジューベイ → なし", "相手.トラッシュ: なし → ヤギュード・ジューベイ"],
})
scenario({
    name: "084-フラッシュ：スピリット以外のバーストは元に戻る",
    start: legionStart(BMAGIC),
    steps(t) {
        oppAttackV(t)
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [...legionPaid],
})
scenario({
    name: "084-メインステップでは使えない",
    start: { me: { hand: [LEGION] }, opp: { burst: YAGYU } },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0 })
        t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [],
})
const legionBurstStart = (reserve: number) => ({
    turn: "opp" as const,
    phase: "attack" as const,
    me: { life: 3, reserve, burst: LEGION, nexuses: [{ card: SEIDO, label: "聖堂", cores: 0 }] },
    opp: { burst: YAGYU, spirits: [{ card: V, label: "ロク" }] },
})
const legionTrigger = (t: ScenarioCtx) => {
    oppAttackV(t)
    t.closeFlash()
    t.act("me", { type: "takeLife" })
}
scenario({
    name: "084-バースト：ネクサスにコア2個、続けてコストを払うと相手のスピリットのバーストが破棄される",
    start: legionBurstStart(10),
    steps: legionTrigger,
    expect: [
        "自分.ライフ: 3 → 2",
        "自分.バースト: ディクタトールレギオン → なし",
        "自分.トラッシュ: なし → ディクタトールレギオン",
        "自分.トラッシュのコア: 0 → 5",
        "自分.リザーブ: 10 → 6",
        "自分.聖堂.コア: 0 → 2",
        "相手.バースト: ヤギュード・ジューベイ → なし",
        "相手.トラッシュ: なし → ヤギュード・ジューベイ",
        "相手.ロク.疲労: false → true",
    ],
})
scenario({
    name: "084-バースト：コストを払えなければコア2個だけで、フラッシュ効果は発揮しない",
    start: legionBurstStart(3),
    steps: legionTrigger,
    expect: [
        "自分.ライフ: 3 → 2",
        "自分.バースト: ディクタトールレギオン → なし",
        "自分.トラッシュ: なし → ディクタトールレギオン",
        "自分.リザーブ: 3 → 4",
        "自分.聖堂.コア: 0 → 2",
        "相手.ロク.疲労: false → true",
    ],
})
scenario({
    name: "084-バースト：相手にバーストが無ければ後半は解決できず、払う確認も出ずコストも減らない",
    start: { ...legionBurstStart(10), opp: { spirits: [{ card: V, label: "ロク" }] } },
    steps(t) {
        legionTrigger(t)
        assert(t.state.pendingChoice === null, "084: 払う確認は出ない")
    },
    expect: [
        "自分.ライフ: 3 → 2",
        "自分.バースト: ディクタトールレギオン → なし",
        "自分.トラッシュ: なし → ディクタトールレギオン",
        "自分.リザーブ: 10 → 11",
        "自分.聖堂.コア: 0 → 2",
        "相手.ロク.疲労: false → true",
    ],
})

console.log("=== BS18-X06 混沌魔皇アザートゥース ===")
// Lv1･Lv2･Lv3 召喚時：自分のシンボル2つのスピリット1体につき、相手のシンボル1つのスピリット1体を破壊
const azaLines = (reserveAfter: number, trashCores: number) => [
    "自分.手札: 混沌魔皇アザートゥース → なし",
    `自分.リザーブ: 10 → ${reserveAfter}`,
    `自分.トラッシュのコア: 0 → ${trashCores}`,
    "自分.混沌魔皇アザートゥース.BP: なし → 6000",
    "自分.混沌魔皇アザートゥース.Lv: なし → 1",
    "自分.混沌魔皇アザートゥース.コア: なし → 1",
    "自分.混沌魔皇アザートゥース.場所: なし → フィールド",
    "自分.混沌魔皇アザートゥース.疲労: なし → false",
]
scenario({
    name: "X06-召喚時：2シンボルが自身とILUで2体なので、相手の1シンボル2体を破壊（2シンボルは残る）",
    start: {
        me: { hand: [AZA], spirits: [{ card: ILU, label: "二象" }] },
        opp: { spirits: [{ card: V, label: "ロクA" }, { card: V, label: "ロクB" }, { card: ILU, label: "敵二象" }] },
    },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        ...azaLines(2, 7),
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ロクA.場所: フィールド → なし",
        "相手.ロクB.場所: フィールド → なし",
    ],
}) // 青シンボル2つ（ILU）で軽減2、コスト7＋置くコア1
scenario({
    name: "X06-自身だけなら1体（2シンボルの相手は破壊できない）",
    start: { me: { hand: [AZA] }, opp: { spirits: [{ card: V, label: "ロク" }, { card: ILU, label: "敵二象" }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...azaLines(0, 9), "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11", "相手.ロク.場所: フィールド → なし"],
})
scenario({
    name: "X06-自分の1シンボルのスピリットは数えない（数は1なので相手の1体だけ破壊）",
    start: { me: { hand: [AZA], spirits: [{ card: V, label: "自軍" }] }, opp: { spirits: [{ card: V, label: "ロクA" }, { card: V, label: "ロクB" }] }, interactive: true },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        assert(t.state.pendingChoice?.pid === t.me, "X06: 破壊する1体を自分が選ぶ")
        t.act("me", { type: "resolveChoice", instanceId: t.id("ロクA") })
    },
    expect: [...azaLines(0, 9), "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11", "相手.ロクA.場所: フィールド → なし"],
})
// Lv2･Lv3 アタック時：相手はブロック前のフラッシュタイミングで、手札のコスト4以上のカードを使えない
const azaAtk = (cores: number, oppHand: string[], oppSpirits: { card: string; label: string }[] = []) => ({
    phase: "attack" as const,
    me: { spirits: [{ card: AZA, label: "魔皇", cores }] },
    opp: { hand: oppHand, spirits: oppSpirits },
})
scenario({
    name: "X06-Lv2：ブロック前のフラッシュでコスト4以上の手札は使えない",
    start: azaAtk(4, [DD]),
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("魔皇") })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("魔皇") })
    },
    expect: ["自分.魔皇.疲労: false → true"],
})
scenario({
    name: "X06-Lv2：コスト3以下の手札は使える",
    start: azaAtk(4, [RW]),
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("魔皇") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [
        "自分.魔皇.疲労: false → true",
        "相手.手札: レッドウォール → なし",
        "相手.トラッシュ: なし → レッドウォール",
        "相手.トラッシュのコア: 0 → 2",
        "相手.リザーブ: 10 → 8",
    ],
})
scenario({
    name: "X06-Lv1では制限されない",
    start: azaAtk(1, [DD]),
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("魔皇") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("魔皇") })
    },
    expect: [
        "自分.魔皇.疲労: false → true",
        "自分.魔皇.BP: 6000 → 8000",
        "相手.手札: ダブルドロー → なし",
        "相手.トラッシュ: なし → ダブルドロー",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
    ],
})
scenario({
    name: "X06-Lv2：ブロック後のフラッシュタイミングなら使える（制限はブロック前だけ）",
    start: azaAtk(4, [DD], [{ card: BULL, label: "牛" }]),
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("魔皇") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("牛") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("牛") })
        t.closeFlash()
    },
    expect: [
        "自分.魔皇.疲労: false → true",
        "相手.手札: ダブルドロー → なし",
        `相手.トラッシュ: なし → ${jn("ダブルドロー", BULLN)}`,
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 7",
        "相手.牛.場所: フィールド → なし",
    ],
})
scenario({
    name: "X06-Lv2：自分の手札には効かない",
    start: { phase: "attack", me: { hand: [DD], spirits: [{ card: AZA, label: "魔皇", cores: 4 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("魔皇") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("魔皇") })
    },
    expect: [
        "自分.魔皇.疲労: false → true",
        "自分.魔皇.BP: 12000 → 14000",
        "自分.手札: ダブルドロー → なし",
        "自分.トラッシュ: なし → ダブルドロー",
        "自分.トラッシュのコア: 0 → 4",
        "自分.リザーブ: 10 → 6",
    ],
})

console.log("=== X012S 英雄皇ロード・ドラゴン・ドミニオン（青。赤 X012R と同じ効果文）===")
const DOMN = "英雄皇ロード・ドラゴン・ドミニオン"
const domField = [
    `自分.${DOMN}.BP: なし → 5000`,
    `自分.${DOMN}.Lv: なし → 1`,
    `自分.${DOMN}.コア: なし → 1`,
    `自分.${DOMN}.場所: なし → フィールド`,
    `自分.${DOMN}.疲労: なし → false`,
]
const domBurstStart = (hand: string[]) => ({
    turn: "opp" as const,
    phase: "attack" as const,
    me: { life: 3, burst: DOM, hand },
    opp: { spirits: [{ card: V, label: "ロク" }] },
})
const domTrigger = (t: ScenarioCtx) => {
    oppAttackV(t)
    t.closeFlash()
    t.act("me", { type: "takeLife" })
}
scenario({
    name: "X012S-バースト召喚→召喚時：手札のバースト持ちをセットして1枚ドロー",
    start: domBurstStart([BMAGIC]),
    steps: domTrigger,
    expect: [
        "自分.ライフ: 3 → 2",
        `自分.バースト: ${DOMN} → 烈光閃刃`,
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 6",
        "自分.手札: 烈光閃刃 → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        ...domField,
        "相手.ロク.疲労: false → true",
    ],
})
scenario({
    name: "X012S-手札にバースト持ちがなければセットもドローもしない",
    start: domBurstStart([]),
    steps: domTrigger,
    expect: [
        "自分.ライフ: 3 → 2",
        `自分.バースト: ${DOMN} → なし`,
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 6",
        ...domField,
        "相手.ロク.疲労: false → true",
    ],
})
scenario({
    name: "X012S-手札から召喚した場合も同じ",
    start: { me: { hand: [DOM, BMAGIC] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: t.state.players[t.me].hand.indexOf(DOM) }),
    expect: [
        `自分.手札: ${jn(DOMN, "烈光閃刃")} → ロクケラトプス`,
        "自分.バースト: なし → 烈光閃刃",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        ...domField,
    ],
})
// Lv3『自分のアタックステップ』自分のバーストをセットしている間BP+3000
const domBp = (phase: "main" | "attack", cores: number, burst: string | undefined, want: number, name: string) =>
    scenario({
        name,
        start: { phase, me: { ...(burst ? { burst } : {}), spirits: [{ card: DOM, label: "ドミニオン", cores }] } },
        steps(t) {
            assert(effectiveBp(t.state, t.me, t.inst("ドミニオン")) === want, `X012S: ${name}（BP${want}）`)
        },
        expect: [],
    })
domBp("attack", 5, BMAGIC, 13000, "X012S-Lv3・アタックステップ・バースト有りでBP+3000")
domBp("attack", 5, undefined, 10000, "X012S-バースト無しなら増えない")
domBp("main", 5, BMAGIC, 10000, "X012S-メインステップでは増えない（自分のアタックステップ限定）")
domBp("attack", 3, BMAGIC, 7000, "X012S-Lv2では増えない")

console.log("すべてのチェックに合格しました 🎉（part661）")

// smoke パート47（BS04クライアント連動バッチ：軽減シンボル付与・オーラの系統OR）
// 拡張A: reductionGrant の condition ownColorSpiritsAtLeast（ネクサスを数えない）— BS04-049 黒の妖精ティ・ターニャ
// 拡張B: reductionGrant の familyFilter（OR配列。対象は手札カードの静的系統）— BS04-077 七龍帝の玉座
// 拡張C: aura の familyFilter を OR 配列対応 — BS04-076 翼持つ者の空域
// ※ いずれも public/src/renderer.ts に同じ判定のクライアントミラーがある（表示用）
import { assert, createGame, createInstance, effectiveBp, effectiveCost, getCard, runTurnStart } from "./helpers"

console.log("=== 拡張A: BS04-049 ティ・ターニャ（黄スピリット3体以上でマジックに軽減[黄]。ネクサスは数えない） ===")
{
    const s = createGame("bs04-049", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits.push(createInstance("BS04-049", s.turn, 1)) // ティ・ターニャ（黄・シンボル黄）
    s.players.p1.field.spirits.push(createInstance("BS02-051", s.turn, 1)) // チュンポポ（黄・シンボル黄）
    s.players.p1.field.nexuses.push(createInstance("BS02-084", s.turn, 0)) // 祝福されし大聖堂（黄ネクサス・シンボル黄）
    const magic = getCard("BS02-105") // グレートウォール（コスト3・軽減[黄][黄]）
    // 黄スピリットは2体（ネクサスは数えない）＝条件未達。軽減は素の2つぶんのみ → 3-2=1
    assert(effectiveCost(s, "p1", magic) === 1, "黄スピリット2体＋黄ネクサス1つでは条件未達（ネクサスを数えない）")
    s.players.p1.field.spirits.push(createInstance("BS02-051", s.turn, 1)) // チュンポポをもう1体（黄スピリット3体）
    assert(effectiveCost(s, "p1", magic) === 0, "黄スピリット3体で軽減[黄]が付与され、コストが0になる")
}

console.log("=== 拡張B: BS04-077 七龍帝の玉座（手札の古竜/龍帝スピリットに軽減[赤]。OR配列） ===")
{
    const s = createGame("bs04-077", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-077", s.turn, 0)) // 七龍帝の玉座（赤ネクサス・シンボル赤）
    s.players.p1.field.spirits.push(createInstance("BS01-003", s.turn, 1)) // テラノセイバー（シンボル赤）
    s.players.p1.field.spirits.push(createInstance("BS01-003", s.turn, 1)) // テラノセイバー（シンボル赤）→ 赤シンボル計3
    const maguu = getCard("BS01-021") // 焔竜魔人マ・グー（古竜・コスト6・軽減[赤][赤]）
    assert(effectiveCost(s, "p1", maguu) === 3, "古竜のマ・グーは軽減[赤]が付与され 6-3=3（付与なしなら4）")
    const aiburn = getCard("BS01-005") // アイバーン（翼竜・コスト2・軽減[赤]）
    assert(effectiveCost(s, "p1", aiburn) === 1, "系統が一致しないアイバーンには付与されず 2-1=1（付与されれば0）")
}
{
    const s = createGame("bs04-077-ryutei", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-077", s.turn, 0)) // 玉座（シンボル赤）
    for (let i = 0; i < 4; i++) s.players.p1.field.spirits.push(createInstance("BS01-003", s.turn, 1)) // 赤シンボル計5
    const erukreru = getCard("BS04-010") // 雷帝エール・クレル（龍帝・コスト6・軽減[赤]×4）
    assert(effectiveCost(s, "p1", erukreru) === 1, "OR配列のもう一方（龍帝）にも付与され 6-5=1（付与なしなら2）")
}

console.log("=== 拡張C: BS04-076 翼持つ者の空域（自分のアタックステップに翼竜/空牙をBP+2000。OR配列） ===")
{
    const s = createGame("bs04-076", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-076", s.turn, 0)) // 翼持つ者の空域 Lv1
    const yokuryu = createInstance("BS01-005", s.turn, 1) // アイバーン（翼竜）Lv1 BP2000
    const kuga = createInstance("BS01-003", s.turn, 1) // テラノセイバー（空牙）Lv1 BP4000
    const other = createInstance("BS01-001", s.turn, 1) // ゴラドン（爬獣・非該当）Lv1 BP1000
    for (const sp of [yokuryu, kuga, other]) s.players.p1.field.spirits.push(sp)

    assert(effectiveBp(s, "p1", yokuryu) === 2000, "メインステップでは phaseTurn 不一致でバフなし")
    s.phase = "attack"
    assert(effectiveBp(s, "p1", yokuryu) === 4000, "自分のアタックステップで翼竜がBP+2000")
    assert(effectiveBp(s, "p1", kuga) === 6000, "OR配列のもう一方（空牙）もBP+2000")
    assert(effectiveBp(s, "p1", other) === 1000, "系統が一致しないゴラドンはバフなし")
}

console.log("パート47 完了")

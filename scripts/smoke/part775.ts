// smoke パート775（BS11-050／BS11-051／BS11-060／BS12-051／BS12-054／BS12-056 のブレイヴ効果。効果文から書いた期待値テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const TASKER = "BS11-050" // 激爪竜パワード・タスカー（赤ブレイヴ・機竜・コスト5・合体条件コスト5以上）
const FISHER = "BS11-051" // イビル・フィッシャー（紫ブレイヴ・幽魔・コスト4・合体条件コスト4以上）
const CANON = "BS11-060" // 雷神砲カノン・アームズ（青ブレイヴ・造兵・コスト5・合体条件コスト5以上）
const BONE = "BS12-051" // 鎧骨殻ボーン・ローダー（紫ブレイヴ・無魔・コスト4・合体条件神星/光導/星魂）
const CAT = "BS12-054" // マネキキャット（緑ブレイヴ・剣獣/機獣・コスト5・合体条件神星/光導/星魂）
const RAY = "BS12-056" // ジェット・レイ（白ブレイヴ・武装/空魚・コスト5・合体条件コスト5以上）

// 脇役
const VANILLA = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・BP1000・バニラ）
const LANCE = "SD17-010" // ランスモザウルス（赤・地竜・コスト5・BP5000・バニラ）
const GOLEM = "BS11-044" // シェル・ゴレム（青・造兵・コスト4・Lv1 BP4000・Lv2(コア4) BP7000・バニラ）
const JEFFREY = "BS03-072" // 槍兵のジェフリー（青・闘神・コスト1・BP2000・バニラ）
const CRYSTAL = "BS10-036" // 水晶魚クリスティール（白・空魚/星魂・コスト4・BP4000・バニラ）
const DANDE = "BS11-019" // ダンデラビット（緑・遊精/星魂・コスト3・BP1000・召喚時：ボイドからリザーブにコア1）
const KOGUMARU = "BS12-033" // コグマル（黄・小玩/星魂・コスト1・BP2000・バニラ）
const SIEG = "EX006" // 輝星龍ジークヴルム・デネブ（青・星竜/異合・コスト6・バニラ）
const FORTO = "BS03-068" // フォルトロス（黄・想獣・コスト7・BP5000・バニラ）
const ARENA = "SD03-014" // オリンスピア競技場（青ネクサス・コスト3）
const REDWALL = "BS04-110" // レッドウォール（青マジック・コスト2・フラッシュ）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    assert(c(TASKER).name === "激爪竜パワード・タスカー" && c(TASKER).type === "brave" && c(TASKER).colors.join() === "red" && c(TASKER).cost === 5 && c(TASKER).family.join() === "機竜" && c(TASKER).braveLevels![0]!.bp === 4000 && c(TASKER).effect.includes("コアが3個以下"), "TASKERは赤ブレイヴ機竜コスト5・合体時BP+4000・コア3個以下破壊")
    assert(c(FISHER).name === "イビル・フィッシャー" && c(FISHER).type === "brave" && c(FISHER).colors.join() === "purple" && c(FISHER).cost === 4 && c(FISHER).family.join() === "幽魔" && c(FISHER).braveLevels![0]!.bp === 2000 && c(FISHER).effect.includes("コスト6以下のスピリットカード"), "FISHERは紫ブレイヴ幽魔コスト4・合体時BP+2000・トラッシュのコスト6以下回収")
    assert(c(CANON).name === "雷神砲カノン・アームズ" && c(CANON).type === "brave" && c(CANON).colors.join() === "blue" && c(CANON).cost === 5 && c(CANON).family.join() === "造兵" && c(CANON).braveLevels![0]!.bp === 5000 && c(CANON).effect.includes("同じ色の手札のカードを使えない"), "CANONは青ブレイヴ造兵コスト5・合体時BP+5000・デッキ破棄と同色ロック")
    assert(c(BONE).name === "鎧骨殻ボーン・ローダー" && c(BONE).type === "brave" && c(BONE).colors.join() === "purple" && c(BONE).cost === 4 && c(BONE).family.join() === "無魔" && c(BONE).effect.includes("神星"), "BONEは紫ブレイヴ無魔コスト4・神星/光導/星魂回収")
    assert(c(CAT).name === "マネキキャット" && c(CAT).type === "brave" && c(CAT).colors.join() === "green" && c(CAT).cost === 5 && c(CAT).family.join() === "剣獣,機獣" && c(CAT).braveLevels![0]!.bp === 3000 && c(CAT).effect.includes("召喚時』効果は発揮されない"), "CATは緑ブレイヴ剣獣/機獣コスト5・無償召喚とバトル時疲労")
    assert(c(RAY).name === "ジェット・レイ" && c(RAY).type === "brave" && c(RAY).colors.join() === "white" && c(RAY).cost === 5 && c(RAY).family.join() === "武装,空魚" && c(RAY).braveLevels![0]!.bp === 4000 && c(RAY).effect.includes("スピリット2体を疲労させる"), "RAYは白ブレイヴ武装/空魚コスト5・ブロック時2体疲労")
    assert(c(VANILLA).name === "ロクケラトプス" && c(VANILLA).cost === 1 && c(VANILLA).effect === "" && c(VANILLA).levels![0]!.bp === 1000, "VANILLAはロクケラトプス（赤コスト1バニラ）")
    assert(c(LANCE).name === "ランスモザウルス" && c(LANCE).cost === 5 && c(LANCE).effect === "" && c(LANCE).levels![0]!.bp === 5000, "LANCEはランスモザウルス（赤コスト5バニラ・BP5000）")
    assert(c(GOLEM).name === "シェル・ゴレム" && c(GOLEM).cost === 4 && c(GOLEM).effect === "" && c(GOLEM).levels![1]!.cores === 4, "GOLEMはシェル・ゴレム（青コスト4バニラ・Lv2はコア4）")
    assert(c(JEFFREY).name === "槍兵のジェフリー" && c(JEFFREY).cost === 1 && c(JEFFREY).effect === "" && c(JEFFREY).colors.join() === "blue", "JEFFREYは槍兵のジェフリー（青コスト1バニラ）")
    assert(c(CRYSTAL).name === "水晶魚クリスティール" && c(CRYSTAL).cost === 4 && c(CRYSTAL).effect === "" && c(CRYSTAL).family.includes("星魂") && c(CRYSTAL).levels![0]!.bp === 4000, "CRYSTALはクリスティール（白コスト4・星魂・バニラ）")
    assert(c(DANDE).name === "ダンデラビット" && c(DANDE).colors.join() === "green" && c(DANDE).cost === 3 && c(DANDE).levels![0]!.bp === 1000 && c(DANDE).effect.includes("ボイドからコア1個を自分のリザーブに置く"), "DANDEはダンデラビット（緑コスト3・召喚時にリザーブへコア1）")
    assert(c(KOGUMARU).name === "コグマル" && c(KOGUMARU).family.includes("星魂") && c(KOGUMARU).effect === "", "KOGUMARUはコグマル（黄・星魂・バニラ）")
    assert(c(SIEG).name === "輝星龍ジークヴルム・デネブ" && c(SIEG).cost === 6 && c(SIEG).type === "spirit", "SIEGはジークヴルム・デネブ（コスト6のスピリット）")
    assert(c(FORTO).name === "フォルトロス" && c(FORTO).cost === 7 && c(FORTO).effect === "", "FORTOはフォルトロス（コスト7バニラ）")
    assert(c(ARENA).name === "オリンスピア競技場" && c(ARENA).type === "nexus" && c(ARENA).cost === 3, "ARENAはオリンスピア競技場（青ネクサス）")
    assert(c(REDWALL).name === "レッドウォール" && c(REDWALL).type === "magic" && c(REDWALL).colors.join() === "blue" && c(REDWALL).cost === 2 && c(REDWALL).effect.includes("フラッシュ"), "REDWALLはレッドウォール（青マジックコスト2・フラッシュ）")
}

// 対話の答え方：target は prefer のラベルを、カード選択は prefer のカード名を選ぶ。check で候補を確かめる
function resolveAll(t: ScenarioCtx, prefer: string[] = [], check?: (pc: any, names: string[]) => void): void {
    for (let i = 0; i < 20 && t.state.pendingChoice; i++) {
        const pc: any = t.state.pendingChoice
        const side: "me" | "opp" = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "target") {
            check?.(pc, pc.candidates as string[])
            const hit = prefer.map((l) => t.id(l)).find((id) => (pc.candidates as string[]).includes(id))
            t.act(side, { type: "resolveChoice", instanceId: hit ?? pc.candidates[0] })
        } else if (pc.kind === "option") {
            const hit = (pc.options as string[]).find((o) => prefer.some((p) => o.includes(p)))
            t.act(side, { type: "resolveChoice", option: hit ?? pc.options[0] })
        } else {
            const owner = pc.cardOwner as "p1" | "p2"
            const zone: string[] = pc.cardZone === "trash" ? t.state.players[owner].trashCards
                : pc.cardZone === "hand" ? t.state.players[owner].hand
                : ((t.state as any).revealedCards?.cardIds ?? []) as string[]
            const names = (pc.cardIndices as number[]).map((ix) => getCard(zone[ix]!).name)
            check?.(pc, names)
            const hit = (pc.cardIndices as number[]).find((ix) => prefer.includes(getCard(zone[ix]!).name))
            t.act(side, { type: "resolveChoice", cardIndex: hit ?? pc.cardIndices[0] })
        }
    }
}

// ============================================================
// BS11-050 激爪竜パワード・タスカー【合体時】『合体アタック時』
// ブロックされたとき、コアが3個以下しか置かれていない相手のスピリット1体を破壊する
// ============================================================

// ブロックされたとき：コア3の相手は対象・コア4のブロッカーは対象外（3個は対象・4個は対象外の境目）
scenario({
    name: "tasker-blocked-destroy-3core",
    start: {
        interactive: true,
        me: { hand: [TASKER], spirits: [{ card: LANCE, cores: 1 }] },
        opp: { spirits: [{ card: GOLEM, label: "防御ゴレム", cores: 4 }, { card: GOLEM, label: "低コアゴレム", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ランスモザウルス") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランスモザウルス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("防御ゴレム") })
        resolveAll(t, ["低コアゴレム"], (pc) => {
            const cand = pc.candidates as string[]
            assert(cand.includes(t.id("低コアゴレム")), "コア3個の相手は破壊の候補に入る")
            assert(!cand.includes(t.id("防御ゴレム")), "コア4個のブロッカーは破壊の候補に入らない")
        })
        t.closeFlash()
    },
    expect: [
        "自分.手札: 激爪竜パワード・タスカー → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ランスモザウルス.BP: 5000 → 9000",
        "自分.激爪竜パワード・タスカー.場所: なし → 合体",
        "自分.激爪竜パワード・タスカー.疲労: なし → false",
        "自分.激爪竜パワード・タスカー.コア: なし → 0",
        "自分.激爪竜パワード・タスカー.Lv: なし → 1",
        "自分.ランスモザウルス.疲労: false → true",
        "相手.低コアゴレム.場所: フィールド → なし",
        "相手.防御ゴレム.場所: フィールド → なし",
        "相手.トラッシュ: なし → シェル・ゴレム、シェル・ゴレム",
        "相手.リザーブ: 10 → 17",
    ],
})

// 境界：コア4個の相手しかいなければ破壊する対象がなく、バトルの結果だけが起きる
scenario({
    name: "tasker-blocked-4core-not-target",
    start: {
        me: { hand: [TASKER], spirits: [{ card: LANCE, cores: 1 }] },
        opp: { spirits: [{ card: GOLEM, label: "防御ゴレム", cores: 4 }, { card: GOLEM, label: "予備ゴレム", cores: 4 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ランスモザウルス") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランスモザウルス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("防御ゴレム") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: 激爪竜パワード・タスカー → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ランスモザウルス.BP: 5000 → 9000",
        "自分.激爪竜パワード・タスカー.場所: なし → 合体",
        "自分.激爪竜パワード・タスカー.疲労: なし → false",
        "自分.激爪竜パワード・タスカー.コア: なし → 0",
        "自分.激爪竜パワード・タスカー.Lv: なし → 1",
        "自分.ランスモザウルス.疲労: false → true",
        "相手.防御ゴレム.場所: フィールド → なし",
        "相手.トラッシュ: なし → シェル・ゴレム",
        "相手.リザーブ: 10 → 14",
    ],
})

// ブロックされなければ（ライフを減らすだけなら）破壊は起きない
scenario({
    name: "tasker-unblocked-no-destroy",
    start: {
        me: { hand: [TASKER], spirits: [{ card: LANCE, cores: 1 }] },
        opp: { spirits: [{ card: GOLEM, label: "低コアゴレム", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ランスモザウルス") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランスモザウルス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 激爪竜パワード・タスカー → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ランスモザウルス.BP: 5000 → 9000",
        "自分.激爪竜パワード・タスカー.場所: なし → 合体",
        "自分.激爪竜パワード・タスカー.疲労: なし → false",
        "自分.激爪竜パワード・タスカー.コア: なし → 0",
        "自分.激爪竜パワード・タスカー.Lv: なし → 1",
        "自分.ランスモザウルス.疲労: false → true",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

// ============================================================
// BS11-051 イビル・フィッシャー
// Lv1『このブレイヴの召喚時』デッキ上2枚オープン・1枚を手札に、もう1枚は破棄
// ============================================================

// 単体召喚：オープンした2枚のうち1枚を手札に加え、もう1枚は破棄する
scenario({
    name: "fisher-summon-open2-hand-trash",
    start: {
        interactive: true,
        me: { hand: [FISHER], deck: [GOLEM, LANCE, ...Array.from({ length: 38 }, () => VANILLA)] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t, ["シェル・ゴレム"], (_pc, names) => {
            assert(names.includes("シェル・ゴレム") && names.includes("ランスモザウルス"), `オープンした2枚の候補（${names.join("／")}）`)
        })
    },
    expect: [
        "自分.手札: イビル・フィッシャー → シェル・ゴレム",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.デッキ枚数: 40 → 38",
        "自分.トラッシュ: なし → ランスモザウルス",
        "自分.イビル・フィッシャー.場所: なし → フィールド",
        "自分.イビル・フィッシャー.疲労: なし → false",
        "自分.イビル・フィッシャー.コア: なし → 1",
        "自分.イビル・フィッシャー.Lv: なし → 1",
        "自分.イビル・フィッシャー.BP: なし → 2000",
    ],
})

// 【合体時】『合体アタック時』トラッシュのコスト6以下のスピリットカード1枚を手札に戻す（コスト6は対象・コスト7は対象外）
scenario({
    name: "fisher-combined-attack-recover-cost6",
    start: {
        interactive: true,
        me: {
            hand: [FISHER],
            spirits: [{ card: GOLEM, cores: 1 }],
            trash: [SIEG, FORTO],
            deck: [ARENA, ARENA, ...Array.from({ length: 38 }, () => VANILLA)],
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("シェル・ゴレム") })
        resolveAll(t, ["オリンスピア競技場"])
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("シェル・ゴレム") })
        resolveAll(t, ["輝星龍ジークヴルム・デネブ"], (_pc, names) => {
            if (names.length === 1) {
                assert(names[0] === "輝星龍ジークヴルム・デネブ", `トラッシュの候補はコスト6のスピリットカードだけ（${names.join("／")}）`)
                assert(!names.includes("フォルトロス"), "コスト7のスピリットカードは候補に入らない")
            }
        })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: イビル・フィッシャー → オリンスピア競技場、輝星龍ジークヴルム・デネブ",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.デッキ枚数: 40 → 38",
        "自分.トラッシュ: フォルトロス、輝星龍ジークヴルム・デネブ → オリンスピア競技場、フォルトロス",
        "自分.シェル・ゴレム.BP: 4000 → 6000",
        "自分.イビル・フィッシャー.場所: なし → 合体",
        "自分.イビル・フィッシャー.疲労: なし → false",
        "自分.イビル・フィッシャー.コア: なし → 0",
        "自分.イビル・フィッシャー.Lv: なし → 1",
        "自分.シェル・ゴレム.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// BS11-060 雷神砲カノン・アームズ【合体中】『このスピリットのアタック時』
// 相手のデッキを1枚破棄し、このバトルの間、破棄したカードと同じ色の手札を使えない
// ============================================================

// 破棄したカードが青なら、このバトルの間相手は青の手札（マジック）を使えない
scenario({
    name: "canon-attack-mill-blue-lock-blue-hand",
    start: {
        me: { hand: [CANON], spirits: [{ card: LANCE, cores: 1 }] },
        opp: { hand: [REDWALL], spirits: [{ card: JEFFREY, cores: 1 }], deck: [JEFFREY, ...Array.from({ length: 39 }, () => VANILLA)] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ランスモザウルス") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランスモザウルス") })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 雷神砲カノン・アームズ → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ランスモザウルス.BP: 5000 → 10000",
        "自分.雷神砲カノン・アームズ.場所: なし → 合体",
        "自分.雷神砲カノン・アームズ.疲労: なし → false",
        "自分.雷神砲カノン・アームズ.コア: なし → 0",
        "自分.雷神砲カノン・アームズ.Lv: なし → 1",
        "自分.ランスモザウルス.疲労: false → true",
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → 槍兵のジェフリー",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

// 境界：破棄したカードが赤なら青の手札は使える（色が同じでなければ縛られない）
scenario({
    name: "canon-attack-mill-red-blue-hand-usable",
    start: {
        me: { hand: [CANON], spirits: [{ card: LANCE, cores: 1 }] },
        opp: { hand: [REDWALL], spirits: [{ card: JEFFREY, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ランスモザウルス") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランスモザウルス") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 雷神砲カノン・アームズ → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ランスモザウルス.BP: 5000 → 10000",
        "自分.雷神砲カノン・アームズ.場所: なし → 合体",
        "自分.雷神砲カノン・アームズ.疲労: なし → false",
        "自分.雷神砲カノン・アームズ.コア: なし → 0",
        "自分.雷神砲カノン・アームズ.Lv: なし → 1",
        "自分.ランスモザウルス.疲労: false → true",
        "相手.手札: レッドウォール → なし",
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → レッドウォール、ロクケラトプス",
        "相手.トラッシュのコア: 0 → 1",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// BS12-051 鎧骨殻ボーン・ローダー Lv1『このブレイヴの召喚時』
// トラッシュの神星/光導/星魂を持つスピリットカード1枚を手札に戻す
// ============================================================

// 星魂のコグマルは戻り、系統を持たないロクケラトプスは対象外
scenario({
    name: "bone-loader-summon-recover-seikon",
    start: {
        interactive: true,
        me: { hand: [BONE], trash: [KOGUMARU, VANILLA] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t, ["コグマル"], (_pc, names) => {
            assert(names.includes("コグマル"), "星魂のコグマルは候補に入る")
            assert(!names.includes("ロクケラトプス"), "神星/光導/星魂を持たないロクケラトプスは候補に入らない")
        })
    },
    expect: [
        "自分.手札: 鎧骨殻ボーン・ローダー → コグマル",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: コグマル、ロクケラトプス → ロクケラトプス",
        "自分.鎧骨殻ボーン・ローダー.場所: なし → フィールド",
        "自分.鎧骨殻ボーン・ローダー.疲労: なし → false",
        "自分.鎧骨殻ボーン・ローダー.コア: なし → 1",
        "自分.鎧骨殻ボーン・ローダー.Lv: なし → 1",
        "自分.鎧骨殻ボーン・ローダー.BP: なし → 3000",
    ],
})

// 境界：トラッシュに該当がなければ何も戻らない
scenario({
    name: "bone-loader-summon-no-match",
    start: {
        me: { hand: [BONE], trash: [VANILLA] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 鎧骨殻ボーン・ローダー → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.鎧骨殻ボーン・ローダー.場所: なし → フィールド",
        "自分.鎧骨殻ボーン・ローダー.疲労: なし → false",
        "自分.鎧骨殻ボーン・ローダー.コア: なし → 1",
        "自分.鎧骨殻ボーン・ローダー.Lv: なし → 1",
        "自分.鎧骨殻ボーン・ローダー.BP: なし → 3000",
    ],
})

// ============================================================
// BS12-054 マネキキャット
// Lv1『このブレイヴの召喚時』緑/白のスピリット1枚を無償召喚・ただし『召喚時』効果は発揮されない
// ============================================================

// 緑のダンデラビットを無償召喚するが、その『召喚時』（リザーブへコア1）は発揮されない
scenario({
    name: "cat-summon-free-green-no-summon-trigger",
    start: {
        interactive: true,
        me: { hand: [CAT, DANDE, VANILLA] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t, ["ダンデラビット", "発動する"], (_pc, names) => {
            if (names.includes("ダンデラビット")) {
                assert(!names.includes("ロクケラトプス"), "緑/白でない赤のロクケラトプスは無償召喚の候補に入らない")
            }
        })
    },
    expect: [
        "自分.手札: ダンデラビット、マネキキャット、ロクケラトプス → ロクケラトプス",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 5",
        "自分.マネキキャット.場所: なし → フィールド",
        "自分.マネキキャット.疲労: なし → false",
        "自分.マネキキャット.コア: なし → 1",
        "自分.マネキキャット.Lv: なし → 1",
        "自分.マネキキャット.BP: なし → 3000",
        "自分.ダンデラビット.場所: なし → フィールド",
        "自分.ダンデラビット.疲労: なし → false",
        "自分.ダンデラビット.コア: なし → 1",
        "自分.ダンデラビット.Lv: なし → 1",
        "自分.ダンデラビット.BP: なし → 1000",
    ],
})

// 境界：手札に緑/白がなければ無償召喚は起きない
scenario({
    name: "cat-summon-no-green-white",
    start: {
        me: { hand: [CAT, VANILLA] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: マネキキャット、ロクケラトプス → ロクケラトプス",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.マネキキャット.場所: なし → フィールド",
        "自分.マネキキャット.疲労: なし → false",
        "自分.マネキキャット.コア: なし → 1",
        "自分.マネキキャット.Lv: なし → 1",
        "自分.マネキキャット.BP: なし → 3000",
    ],
})

// 【合体時】『このスピリットのバトル時』相手は、相手のスピリット1体を疲労させる
scenario({
    name: "cat-combined-battle-fatigue-one",
    start: {
        interactive: true,
        me: { hand: [CAT], spirits: [{ card: CRYSTAL, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, label: "ワン" }, { card: VANILLA, label: "ツー" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("水晶魚クリスティール") })
        resolveAll(t, [])
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("水晶魚クリスティール") })
        resolveAll(t, ["ワン"], (pc) => {
            const cand = pc.candidates as string[]
            assert(cand.includes(t.id("ワン")) && cand.includes(t.id("ツー")), "疲労させる候補に相手の回復状態のスピリット2体が出る")
        })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: マネキキャット → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.水晶魚クリスティール.BP: 4000 → 7000",
        "自分.マネキキャット.場所: なし → 合体",
        "自分.マネキキャット.疲労: なし → false",
        "自分.マネキキャット.コア: なし → 0",
        "自分.マネキキャット.Lv: なし → 1",
        "自分.水晶魚クリスティール.疲労: false → true",
        "相手.ワン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// BS12-056 ジェット・レイ【合体時】『このスピリットのブロック時』
// 相手のスピリット2体を疲労させる
// ============================================================

// ブロックしたとき：相手の回復状態のスピリット2体が疲労する
scenario({
    name: "ray-block-fatigue-two",
    start: {
        interactive: true,
        me: { hand: [RAY], spirits: [{ card: LANCE, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, label: "アタッカー" }, { card: VANILLA, label: "ワン" }, { card: VANILLA, label: "ツー" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ランスモザウルス") })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ランスモザウルス") })
        resolveAll(t, ["ワン", "ツー"])
        t.closeFlash()
    },
    expect: [
        "自分.手札: ジェット・レイ → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.ランスモザウルス.BP: 5000 → 9000",
        "自分.ジェット・レイ.場所: なし → 合体",
        "自分.ジェット・レイ.疲労: なし → false",
        "自分.ジェット・レイ.コア: なし → 0",
        "自分.ジェット・レイ.Lv: なし → 1",
        "自分.ランスモザウルス.疲労: false → true",
        "相手.アタッカー.場所: フィールド → なし",
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ワン.疲労: false → true",
        "相手.ツー.疲労: false → true",
        "相手.リザーブ: 10 → 12",
    ],
})

// 境界：疲労できる相手が1体しかいなければ、その1体だけが疲労する
scenario({
    name: "ray-block-fatigue-only-one-available",
    start: {
        interactive: true,
        me: { hand: [RAY], spirits: [{ card: LANCE, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, label: "アタッカー" }, { card: VANILLA, label: "ツー" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ランスモザウルス") })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ランスモザウルス") })
        resolveAll(t, ["ツー"])
        t.closeFlash()
    },
    expect: [
        "自分.手札: ジェット・レイ → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.ランスモザウルス.BP: 5000 → 9000",
        "自分.ジェット・レイ.場所: なし → 合体",
        "自分.ジェット・レイ.疲労: なし → false",
        "自分.ジェット・レイ.コア: なし → 0",
        "自分.ジェット・レイ.Lv: なし → 1",
        "自分.ランスモザウルス.疲労: false → true",
        "相手.アタッカー.場所: フィールド → なし",
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ツー.疲労: false → true",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part775）")

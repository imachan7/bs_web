// smoke パート758（STARTER pyg 11枚：BS01-125／BSC05-001／BSC05-020／BSC05-022／EX005／EX032／SD13-001／SD13-002／SD13-003／SD13-004／SD13-005）
// 期待値役が効果文と属性だけから書いた実装前テスト（docs/design/STARTER_PLAN.md §2・BS19_PLAN §2（連鎖）・SEMANTICS_AUDIT §3.9/3.12・TEST_STRATEGY.md §5・§6）。
// effects はまだ空なので、多くの場面は現状落ちる。例外で止まらず最後まで走ることを確認する。
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

// ---------- 対象11枚 ----------
const BALANCE = "BS01-125" // デッドリィバランス（紫マジック・コスト3・軽減紫紫）
const SOULHORSE = "BSC05-001" // ソウルホース（紫スピリット・魔影・コスト1）
const CROWN = "BSC05-020" // 星空の冠（黄ネクサス・コスト4）
const GREEDY = "BSC05-022" // グリーディコア（紫マジック・コスト5・軽減紫紫）
const VEGA = "EX005" // 蝕星龍ジークヴルム・ヴェガ（紫スピリット・星竜/無魔・コスト6）
const BUG = "EX032" // シールディバグ（緑ブレイヴ・殻虫/光虫・コスト4・合体条件コスト3以上）
const BAT = "SD13-001" // アメジスバット（紫スピリット・無魔・コスト1）
const CAT = "SD13-002" // ボーン・キャット（紫スピリット・無魔・コスト2）
const BISON = "SD13-003" // ボーン・バイソン（紫スピリット・無魔・コスト3）
const HAWK = "SD13-004" // ゾンビ・ホーク（紫スピリット・無魔・コスト4）
const DOKU = "SD13-005" // 骸龍伯ドクー・ロン（紫スピリット・無魔/妖蛇・コスト5）

// ---------- 脇役（既存の弾から。機械確認で名前・色・系統を確かめる） ----------
const VANILLA = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・BP1000・バニラ）
const SCORPIO = "BS03-013" // ヘルスコルピオ（紫・呪鬼・コスト1・BP1000・バニラ）
const SANDMAN = "BS05-010" // サンドマン（紫・幽魔・コスト1・BP2000・バニラ）
const HARDES = "BS01-031" // デス・ハーデス（紫・呪鬼・コスト3・BP4000・バニラ）
const TANYA = "BS02-053" // 妖精ターニャ（黄・楽族・コスト1・BP1000・バニラ＝黄シンボル要員）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・機人/武装・コスト4・BP3000・バニラ）
const DUALDO = "BS10-007" // デュアルド（赤・古竜/異合・コスト5・BP5000・バニラ）
const GUGA = "BS16-048" // グガランナー（青・造兵・コスト3・Lv2アタック時：コスト3以下の相手1体を破壊）
const SHIELDDRAGON = "EX011" // 銀装合体シールド・ドラゴン（白ブレイヴ・甲竜・コスト4・合体条件コスト4以上）
const AARDERFLAME = "BS17-073" // アーダーフレイム（赤マジック・コスト4・フラッシュ：BP4000以下の相手1体を破壊）
const ELIXIR = "BS01-142" // ピュアエリクサー（白マジック・コスト3・フラッシュ：自分の疲労状態すべてを回復）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    assert(c(BALANCE).name === "デッドリィバランス" && c(BALANCE).type === "magic" && c(BALANCE).colors.join() === "purple" && c(BALANCE).cost === 3 && c(BALANCE).effect.includes("それぞれのスピリット1体を破壊する"), "BALANCEは紫マジックコスト3・お互い1体破壊")
    assert(c(SOULHORSE).name === "ソウルホース" && c(SOULHORSE).type === "spirit" && c(SOULHORSE).colors.join() === "purple" && c(SOULHORSE).family.join() === "魔影" && c(SOULHORSE).cost === 1 && c(SOULHORSE).effect.includes("赤としても扱う"), "SOULHORSEは紫スピリット魔影コスト1・赤としても扱う")
    assert(c(CROWN).name === "星空の冠" && c(CROWN).type === "nexus" && c(CROWN).colors.join() === "yellow" && c(CROWN).cost === 4 && c(CROWN).effect.includes("コスト2以下のスピリットカード") && c(CROWN).effect.includes("回復した赤/緑/青"), "CROWNは黄ネクサスコスト4・ライフ減オープンと回復破壊")
    assert(c(GREEDY).name === "グリーディコア" && c(GREEDY).type === "magic" && c(GREEDY).colors.join() === "purple" && c(GREEDY).cost === 5 && c(GREEDY).effect.includes("合体していない相手のスピリットのコア2個"), "GREEDYは紫マジックコスト5・合体していない相手のコア2個")
    assert(c(VEGA).name === "蝕星龍ジークヴルム・ヴェガ" && c(VEGA).type === "spirit" && c(VEGA).colors.join() === "purple" && c(VEGA).family.join() === "星竜,無魔" && c(VEGA).cost === 6 && c(VEGA).effect.includes("疲労状態の相手のスピリット1体を指定し"), "VEGAは紫スピリット星竜/無魔コスト6・疲労状態指定アタック")
    assert(c(BUG).name === "シールディバグ" && c(BUG).type === "brave" && c(BUG).colors.join() === "green" && c(BUG).family.join() === "殻虫,光虫" && c(BUG).cost === 4 && c(BUG).effect.includes("【神速】") && c(BUG).effect.includes("合体条件：コスト3以上"), "BUGは緑ブレイヴ殻虫/光虫コスト4・神速・合体条件コスト3以上")
    assert(c(BAT).name === "アメジスバット" && c(BAT).type === "spirit" && c(BAT).colors.join() === "purple" && c(BAT).family.join() === "無魔" && c(BAT).cost === 1 && c(BAT).effect.includes("コスト3以下の相手のスピリット1体を破壊する"), "BATは紫スピリット無魔コスト1・破壊時疲労コスト3以下破壊")
    assert(c(CAT).name === "ボーン・キャット" && c(CAT).type === "spirit" && c(CAT).colors.join() === "purple" && c(CAT).family.join() === "無魔" && c(CAT).cost === 2 && c(CAT).effect.includes("コアすべてを相手のトラッシュに置く"), "CATは紫スピリット無魔コスト2・発揮元のコア全トラッシュ")
    assert(c(BISON).name === "ボーン・バイソン" && c(BISON).type === "spirit" && c(BISON).colors.join() === "purple" && c(BISON).family.join() === "無魔" && c(BISON).cost === 3 && c(BISON).effect.includes("【連鎖：条件《黄シンボル》】"), "BISONは紫スピリット無魔コスト3・破壊時疲労破壊＋黄連鎖ドロー")
    assert(c(HAWK).name === "ゾンビ・ホーク" && c(HAWK).type === "spirit" && c(HAWK).colors.join() === "purple" && c(HAWK).family.join() === "無魔" && c(HAWK).cost === 4 && c(HAWK).effect.includes("Lv1として扱う"), "HAWKは紫スピリット無魔コスト4・召喚時ドロー＋黄連鎖Lv1扱い")
    assert(c(DOKU).name === "骸龍伯ドクー・ロン" && c(DOKU).type === "spirit" && c(DOKU).colors.join() === "purple" && c(DOKU).family.join() === "無魔,妖蛇" && c(DOKU).cost === 5 && c(DOKU).effect.includes("最もLvの高い相手のスピリット1体を疲労させる"), "DOKUは紫スピリット無魔/妖蛇コスト5・召喚時ドロー＋黄連鎖疲労＋Lv2アタック時破壊")
    assert(c(VANILLA).name === "ロクケラトプス" && c(VANILLA).colors.join() === "red" && c(VANILLA).family.join() === "地竜" && c(VANILLA).cost === 1 && c(VANILLA).effect === "", "VANILLAは赤地竜コスト1バニラ（BP1000）")
    assert(c(SCORPIO).name === "ヘルスコルピオ" && c(SCORPIO).colors.join() === "purple" && c(SCORPIO).family.join() === "呪鬼" && c(SCORPIO).cost === 1 && c(SCORPIO).effect === "" && c(SCORPIO).levels?.[0]?.bp === 1000, "SCORPIOは紫呪鬼コスト1バニラ・BP1000")
    assert(c(SANDMAN).name === "サンドマン" && c(SANDMAN).colors.join() === "purple" && c(SANDMAN).family.join() === "幽魔" && c(SANDMAN).cost === 1 && c(SANDMAN).effect === "" && c(SANDMAN).levels?.[0]?.bp === 2000, "SANDMANは紫幽魔コスト1バニラ・BP2000")
    assert(c(HARDES).name === "デス・ハーデス" && c(HARDES).colors.join() === "purple" && c(HARDES).family.join() === "呪鬼" && c(HARDES).cost === 3 && c(HARDES).effect === "" && c(HARDES).levels?.[0]?.bp === 4000, "HARDESは紫呪鬼コスト3バニラ・BP4000")
    assert(c(TANYA).name === "妖精ターニャ" && c(TANYA).colors.join() === "yellow" && c(TANYA).family.join() === "楽族" && c(TANYA).cost === 1 && c(TANYA).effect === "" && c(TANYA).symbol.join() === "yellow", "TANYAは黄楽族コスト1バニラ・黄シンボル")
    assert(c(BELL).name === "デュアルキャノン・ベル" && c(BELL).colors.join() === "white" && c(BELL).family.join() === "機人,武装" && c(BELL).cost === 4 && c(BELL).effect === "" && c(BELL).levels?.[0]?.bp === 3000, "BELLは白機人/武装コスト4バニラ・BP3000")
    assert(c(DUALDO).name === "デュアルド" && c(DUALDO).colors.join() === "red" && c(DUALDO).family.join() === "古竜,異合" && c(DUALDO).cost === 5 && c(DUALDO).effect === "" && c(DUALDO).levels?.[1]?.bp === 8000, "DUALDOは赤古竜/異合コスト5バニラ・Lv2BP8000")
    assert(c(GUGA).name === "グガランナー" && c(GUGA).colors.join() === "blue" && c(GUGA).cost === 3 && c(GUGA).effect.includes("コスト3以下の相手のスピリット1体を破壊する。"), "GUGAは青コスト3・Lv2アタック時コスト3以下破壊")
    assert(c(SHIELDDRAGON).name === "銀装合体シールド・ドラゴン" && c(SHIELDDRAGON).type === "brave" && c(SHIELDDRAGON).colors.join() === "white" && c(SHIELDDRAGON).cost === 4 && c(SHIELDDRAGON).effect.includes("合体条件：コスト4以上"), "SHIELDDRAGONは白ブレイヴコスト4・合体条件コスト4以上")
    assert(c(AARDERFLAME).name === "アーダーフレイム" && c(AARDERFLAME).type === "magic" && c(AARDERFLAME).colors.join() === "red" && c(AARDERFLAME).cost === 4 && c(AARDERFLAME).effect.includes("BP4000以下の相手のスピリット1体を破壊する"), "AARDERFLAMEは赤マジックコスト4・BP4000以下破壊")
    assert(c(ELIXIR).name === "ピュアエリクサー" && c(ELIXIR).type === "magic" && c(ELIXIR).colors.join() === "white" && c(ELIXIR).cost === 3 && c(ELIXIR).effect.includes("疲労状態のすべてのスピリットを回復する"), "ELIXIRは白マジックコスト3・全回復")
}

// 選択待ちを最後まで答える（part753 と同じ形）。prefer に挙げたラベルを優先する
function resolveAll(t: ScenarioCtx, prefer: string[] = []): void {
    for (let i = 0; i < 20 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "target") {
            const hit = prefer.map((l) => t.id(l)).find((id) => pc.candidates.includes(id))
            t.act(side, { type: "resolveChoice", instanceId: hit ?? pc.candidates[0]! })
        } else if (pc.kind === "option") {
            const opts = pc.options!
            const hit = opts.find((o) => prefer.some((p) => o.includes(p)))
            t.act(side, { type: "resolveChoice", option: hit ?? opts[0]! })
        } else t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
    }
}

// ============================================================
// BSC05-001 ソウルホース
// Lv1･Lv2：このスピリットの色とシンボルは赤としても扱う。
// ============================================================

// 起きる場面：赤としても扱うシンボルで赤マジック（アーダーフレイム）が1つ軽減される（コスト4→3支払い）
scenario({
    name: "soulhorse-red-symbol-reduction",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: SOULHORSE, cores: 1 }], hand: [AARDERFLAME] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ソウルホース") })
        t.act("opp", { type: "pass" }) // フラッシュの優先権は守備側が先
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: アーダーフレイム → なし",
        "自分.リザーブ: 10 → 7", // コスト4から赤シンボル1つ（ソウルホースの赤扱い）で軽減→3支払い
        "自分.トラッシュのコア: 0 → 3",
        "自分.トラッシュ: なし → アーダーフレイム",
        "自分.ソウルホース.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12", // 破壊されたコア+1、ライフ減少+1
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面：紫シンボルだけ（バニラ）では赤マジックは軽減されない（4支払い）
scenario({
    name: "soulhorse-plain-purple-no-reduction",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: SCORPIO, cores: 1 }], hand: [AARDERFLAME] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ヘルスコルピオ") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: アーダーフレイム → なし",
        "自分.リザーブ: 10 → 6", // 軽減なし→4支払い
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → アーダーフレイム",
        "自分.ヘルスコルピオ.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

// ============================================================
// BS01-125 デッドリィバランス
// フラッシュ：お互い、それぞれのスピリット1体を破壊する。
// ============================================================

// 起きる場面：お互いにスピリットがいるので、それぞれ自分のスピリット1体ずつを破壊する
scenario({
    name: "balance-both-destroy",
    start: {
        interactive: true,
        turn: "me", phase: "main",
        me: { spirits: [{ card: SANDMAN, cores: 1 }, { card: SCORPIO, label: "スコA", cores: 1 }], hand: [BALANCE] },
        opp: { spirits: [{ card: VANILLA, label: "ロクB", cores: 1 }, { card: SCORPIO, label: "スコC", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("サンドマン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        // 発生源の持ち主（自分）がスコAを、相手がロクBを、それぞれ選んで破壊する
        t.act("me", { type: "resolveChoice", instanceId: t.id("スコA") })
        t.act("opp", { type: "resolveChoice", instanceId: t.id("ロクB") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: デッドリィバランス → なし",
        // リザーブはコスト1支払いとスコAのコア+1で相殺（差分に出ない）
        "自分.トラッシュのコア: 0 → 1",
        "自分.トラッシュ: なし → デッドリィバランス、ヘルスコルピオ",
        "自分.スコA.場所: フィールド → なし",
        "自分.サンドマン.疲労: false → true",
        "相手.ロクB.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12", // 破壊されたロクBのコア+1、ライフ減少+1
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面：相手にスピリットがいなければ、破壊されるのは自分のスピリットだけ
scenario({
    name: "balance-opp-empty",
    start: {
        interactive: true,
        turn: "me", phase: "main",
        me: { spirits: [{ card: SANDMAN, cores: 1 }, { card: SCORPIO, label: "スコA", cores: 1 }], hand: [BALANCE] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("サンドマン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        resolveAll(t, ["スコA"])
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: デッドリィバランス → なし",
        // リザーブはコスト1支払いとスコAのコア+1で相殺（差分に出ない）
        "自分.トラッシュのコア: 0 → 1",
        "自分.トラッシュ: なし → デッドリィバランス、ヘルスコルピオ",
        "自分.スコA.場所: フィールド → なし",
        "自分.サンドマン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// BSC05-020 星空の冠
// Lv1：自分のライフが減ったとき、デッキを上から1枚オープンできる。コスト2以下のスピリットカードのとき、コストを支払わずに召喚できる。残ったカードは手札に加える。
// Lv2『相手のターン』：スピリット/マジックの効果で回復した赤/緑/青のスピリットすべてを破壊する。
// ============================================================

// 節1の起きる場面：ライフが減り、オープンしたコスト2以下のスピリットカード（ロクケラトプス）を無償召喚する
scenario({
    name: "crown-lv1-free-summon",
    start: {
        turn: "opp", phase: "attack",
        me: { nexuses: [{ card: CROWN, cores: 0 }] }, // Lv1（維持コア0）
        opp: { spirits: [{ card: SANDMAN, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.サンドマン") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 5 → 4",
        // リザーブはライフのコア+1と無償召喚の維持コア1で相殺（差分に出ない）
        "自分.デッキ枚数: 40 → 39",
        "自分.ロクケラトプス.場所: なし → フィールド",
        "自分.ロクケラトプス.疲労: なし → false",
        "自分.ロクケラトプス.コア: なし → 1",
        "自分.ロクケラトプス.Lv: なし → 1",
        "自分.ロクケラトプス.BP: なし → 1000",
        "相手.サンドマン.疲労: false → true",
    ],
})

// 節1の起きない場面：オープンしたのがマジックカードなら召喚せず手札に加える
scenario({
    name: "crown-lv1-magic-to-hand",
    start: {
        turn: "opp", phase: "attack",
        me: { nexuses: [{ card: CROWN, cores: 0 }], deck: [BALANCE, ...Array.from({ length: 39 }, () => VANILLA)] },
        opp: { spirits: [{ card: SANDMAN, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.サンドマン") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → デッドリィバランス",
        "相手.サンドマン.疲労: false → true",
    ],
})

// 節2の起きる場面：相手がマジック（ピュアエリクサー）で回復させた赤のスピリットを破壊する（紫は残る）
scenario({
    name: "crown-lv2-destroy-refreshed-red",
    start: {
        turn: "opp", phase: "attack",
        me: { nexuses: [{ card: CROWN, cores: 1 }] }, // Lv2
        opp: { spirits: [{ card: SANDMAN, cores: 1 }, { card: VANILLA, label: "ロク", cores: 1, rested: true }], hand: [ELIXIR] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.サンドマン") })
        t.act("me", { type: "pass" }) // フラッシュの優先権は守備側が先
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" }) // 疲労状態のサンドマンとロクを回復
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.手札: ピュアエリクサー → なし",
        "相手.リザーブ: 10 → 8", // コスト3支払い（白シンボルなし）、破壊されたロクのコア+1
        "相手.トラッシュのコア: 0 → 3",
        "相手.トラッシュ: なし → ピュアエリクサー、ロクケラトプス",
        "相手.ロク.場所: フィールド → なし", // マジックの効果で回復した赤なので破壊
        "自分.ライフ: 5 → 4",
        // Lv1の効果はLv2でも有効：ライフ減でオープンしたロクケラトプスが無償召喚される
        "自分.デッキ枚数: 40 → 39",
        "自分.ロクケラトプス.場所: なし → フィールド",
        "自分.ロクケラトプス.疲労: なし → false",
        "自分.ロクケラトプス.コア: なし → 1",
        "自分.ロクケラトプス.Lv: なし → 1",
        "自分.ロクケラトプス.BP: なし → 1000",
    ],
})

// 節2の起きない場面：Lv1 では回復しても破壊しない（ロクは疲労が解けるだけ）
scenario({
    name: "crown-lv1-no-destroy",
    start: {
        turn: "opp", phase: "attack",
        me: { nexuses: [{ card: CROWN, cores: 0 }] },
        opp: { spirits: [{ card: SANDMAN, cores: 1 }, { card: VANILLA, label: "ロク", cores: 1, rested: true }], hand: [ELIXIR] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.サンドマン") })
        t.act("me", { type: "pass" })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.手札: ピュアエリクサー → なし",
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュのコア: 0 → 3",
        "相手.トラッシュ: なし → ピュアエリクサー",
        "相手.ロク.疲労: true → false",
        "自分.ライフ: 5 → 4",
        // Lv1の効果：ライフ減でオープンしたロクケラトプスが無償召喚される
        "自分.デッキ枚数: 40 → 39",
        "自分.ロクケラトプス.場所: なし → フィールド",
        "自分.ロクケラトプス.疲労: なし → false",
        "自分.ロクケラトプス.コア: なし → 1",
        "自分.ロクケラトプス.Lv: なし → 1",
        "自分.ロクケラトプス.BP: なし → 1000",
    ],
})

// ============================================================
// BSC05-022 グリーディコア
// フラッシュ：合体していない相手のスピリットのコア2個を相手のリザーブに置く。
// ============================================================

// 起きる場面：合体していない相手のスピリット（コア3）からコア2個を相手のリザーブへ
scenario({
    name: "greedy-uncombined-cores",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: SANDMAN, cores: 1 }], hand: [GREEDY] },
        opp: { spirits: [{ card: HARDES, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("サンドマン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.デス・ハーデス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: グリーディコア → なし",
        "自分.リザーブ: 10 → 6", // コスト5から紫シンボル1つで軽減→4支払い
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → グリーディコア",
        "自分.サンドマン.疲労: false → true",
        "相手.デス・ハーデス.コア: 3 → 1", // コア2個がリザーブへ（Lv1維持の1個は残る）
        "相手.リザーブ: 10 → 13", // コア2個＋ライフ減少+1
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面：合体している相手のスピリットは対象に選べない（詠唱自体が拒否される）
scenario({
    name: "greedy-combined-rejected",
    start: {
        turn: "opp", phase: "main",
        me: { spirits: [{ card: SCORPIO, cores: 1 }], hand: [GREEDY] },
        opp: { spirits: [{ card: BELL, cores: 1 }], hand: [SHIELDDRAGON] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("相手.デュアルキャノン・ベル") })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルキャノン・ベル") })
        t.act("me", { type: "pass" })
        t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.デュアルキャノン・ベル") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.手札: 銀装合体シールド・ドラゴン → なし",
        "相手.リザーブ: 10 → 7", // コスト4から白シンボル1つで軽減→3支払い
        "相手.トラッシュのコア: 0 → 3",
        "相手.デュアルキャノン・ベル.BP: 3000 → 6000",
        "相手.デュアルキャノン・ベル.疲労: false → true",
        "相手.銀装合体シールド・ドラゴン.場所: なし → 合体",
        "相手.銀装合体シールド・ドラゴン.疲労: なし → false",
        "相手.銀装合体シールド・ドラゴン.コア: なし → 0",
        "相手.銀装合体シールド・ドラゴン.Lv: なし → 1",
        "自分.ライフ: 5 → 3", // 合体スピリットのシンボルはホストとブレイヴの合計（白2つ）
        "自分.リザーブ: 10 → 12",
    ],
})

// ソウルコアありの場面：コア2個（うち1個はソウルコア）をリザーブに置くと0コアで消滅し、ソウルコアもリザーブへ
scenario({
    name: "greedy-soulcore",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: SANDMAN, cores: 1 }], hand: [GREEDY] },
        opp: { spirits: [{ card: HARDES, cores: 2 }], soulCore: "デス・ハーデス" },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("サンドマン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.デス・ハーデス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: グリーディコア → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → グリーディコア",
        "自分.サンドマン.疲労: false → true",
        "相手.デス・ハーデス.場所: フィールド → なし", // コア0個で消滅
        "相手.トラッシュ: なし → デス・ハーデス",
        "相手.リザーブ: 10 → 13", // コア2個（ソウルコアを含む）＋ライフ減少+1
        "相手.ソウルコア: 相手.デス・ハーデス → リザーブ",
        "相手.ライフ: 5 → 4",
    ],
})

// ============================================================
// EX005 蝕星龍ジークヴルム・ヴェガ
// Lv1･Lv2･Lv3『このスピリットのアタック時』：疲労状態の相手のスピリット1体を指定し、そのスピリットにアタックできる。
// Lv2･Lv3『このスピリットのアタック時』：BPを比べ相手のスピリットだけを破壊したとき、コア1個の相手のスピリット1体を破壊する。
// ============================================================

// 節1の起きる場面：疲労状態の相手（サンドマン）を指定してアタックし、BP比べで破壊する
scenario({
    name: "vega-attack-rested-target",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: VEGA, cores: 1 }] }, // Lv1 BP4000
        opp: { spirits: [{ card: SANDMAN, cores: 1, rested: true }] }, // BP2000
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("蝕星龍ジークヴルム・ヴェガ"), targetSpiritInstanceId: t.id("相手.サンドマン") })
        t.closeFlash()
    },
    expect: [
        "自分.蝕星龍ジークヴルム・ヴェガ.疲労: false → true",
        "相手.サンドマン.場所: フィールド → なし",
        "相手.トラッシュ: なし → サンドマン",
        "相手.リザーブ: 10 → 11",
    ],
})

// 節1の起きない場面：疲労状態でない相手は指定できない（拒否される）
scenario({
    name: "vega-target-fresh-rejected",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: VEGA, cores: 1 }] },
        opp: { spirits: [{ card: SANDMAN, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.actRejected("me", { type: "attack", instanceId: t.id("蝕星龍ジークヴルム・ヴェガ"), targetSpiritInstanceId: t.id("相手.サンドマン") })
        t.act("me", { type: "attack", instanceId: t.id("蝕星龍ジークヴルム・ヴェガ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.蝕星龍ジークヴルム・ヴェガ.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 節2の起きる場面：Lv2 でBP比べ破壊したとき、コア1個の相手（ヘルスコルピオ）をもう1体破壊する
scenario({
    name: "vega-lv2-destroy-onecore",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: VEGA, cores: 3 }] }, // Lv2 BP6000
        opp: { spirits: [{ card: BELL, cores: 1 }, { card: SCORPIO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("蝕星龍ジークヴルム・ヴェガ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.デュアルキャノン・ベル") })
        t.closeFlash()
    },
    expect: [
        "自分.蝕星龍ジークヴルム・ヴェガ.疲労: false → true",
        "相手.デュアルキャノン・ベル.場所: フィールド → なし",
        "相手.ヘルスコルピオ.場所: フィールド → なし",
        "相手.トラッシュ: なし → デュアルキャノン・ベル、ヘルスコルピオ",
        "相手.リザーブ: 10 → 12", // 破壊された2体のコア
    ],
})

// 節2の起きない場面：Lv1 ではBP比べ破壊してもコア1個の相手は破壊しない
scenario({
    name: "vega-lv1-no-bonus-destroy",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: VEGA, cores: 1 }] }, // Lv1 BP4000
        opp: { spirits: [{ card: BELL, cores: 1 }, { card: SCORPIO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("蝕星龍ジークヴルム・ヴェガ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.デュアルキャノン・ベル") })
        t.closeFlash()
    },
    expect: [
        "自分.蝕星龍ジークヴルム・ヴェガ.疲労: false → true",
        "相手.デュアルキャノン・ベル.場所: フィールド → なし",
        "相手.トラッシュ: なし → デュアルキャノン・ベル",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// EX032 シールディバグ
// フラッシュ【神速】：手札にあるこのブレイヴカードは、召喚コストの支払いと上に置くコアをリザーブから使用することで召喚できる。
// 合体条件：コスト3以上
// 【合体時】『このスピリットのバトル時』：BPを比べ相手のスピリットだけを破壊したとき、このスピリットは回復する。
// ============================================================

// 節1（キーワード単独の行）の働く場面：アタックステップのフラッシュで手札から召喚できる
scenario({
    name: "bug-soku-flash-summon",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: SANDMAN, cores: 1 }], hand: [BUG] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("サンドマン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "summon", handIndex: 0 }) // 【神速】でフラッシュに召喚（コスト4＋コア1をリザーブから）
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.サンドマン.疲労: false → true",
        "自分.手札: シールディバグ → なし",
        "自分.リザーブ: 10 → 5", // コスト4（緑シンボルなし）＋維持コア1
        "自分.トラッシュのコア: 0 → 4",
        "自分.シールディバグ.場所: なし → フィールド",
        "自分.シールディバグ.疲労: なし → false",
        "自分.シールディバグ.コア: なし → 1",
        "自分.シールディバグ.Lv: なし → 1",
        "自分.シールディバグ.BP: なし → 3000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 節2の起きる場面：合体時、BP比べで相手だけを破壊したとき合体スピリットは回復する（疲労が残らない）
scenario({
    name: "bug-combined-refresh-on-win",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: HARDES, cores: 1 }], hand: [BUG] }, // 合体条件コスト3以上：ハーデス（コスト3）
        opp: { spirits: [{ card: BELL, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("デス・ハーデス") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("デス・ハーデス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.デュアルキャノン・ベル") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: シールディバグ → なし",
        "自分.リザーブ: 10 → 6", // コスト4（緑シンボルなし）。ダイレクト合体なので維持コアは置かない
        "自分.トラッシュのコア: 0 → 4",
        "自分.デス・ハーデス.BP: 4000 → 8000",
        "自分.シールディバグ.場所: なし → 合体",
        "自分.シールディバグ.疲労: なし → false",
        "自分.シールディバグ.コア: なし → 0",
        "自分.シールディバグ.Lv: なし → 1",
        "相手.デュアルキャノン・ベル.場所: フィールド → なし",
        "相手.トラッシュ: なし → デュアルキャノン・ベル",
        "相手.リザーブ: 10 → 11",
        // 【合体時】の回復で、アタックした合体スピリットの疲労は残らない（疲労の行が無いことが期待値）
    ],
})

// 節2の起きない場面：スピリット状態のブレイヴは【合体時】を持たないので、破壊しても疲労が残る
scenario({
    name: "bug-spirit-state-no-refresh",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: BUG, cores: 1 }] }, // スピリット状態 BP3000
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("シールディバグ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.シールディバグ.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD13-001 アメジスバット
// Lv1･Lv2『このスピリットの破壊時』：疲労状態のコスト3以下の相手のスピリット1体を破壊する。
// ============================================================

// 起きる場面：BP比べで破壊されたとき、疲労状態のコスト3以下のアタッカー（サンドマン）を破壊する
scenario({
    name: "bat-destroy-rested-attacker",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: BAT, cores: 1 }] }, // BP1000
        opp: { spirits: [{ card: SANDMAN, cores: 1 }] }, // BP2000・コスト1
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.サンドマン") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("アメジスバット") })
        t.closeFlash()
    },
    expect: [
        "自分.アメジスバット.場所: フィールド → なし",
        "自分.トラッシュ: なし → アメジスバット",
        "自分.リザーブ: 10 → 11",
        "相手.サンドマン.場所: フィールド → なし", // 疲労状態のコスト1なので破壊される
        "相手.トラッシュ: なし → サンドマン",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きない場面：アタッカーのコストが4なら破壊されない（条件を1つ外す）
scenario({
    name: "bat-cost4-attacker-survives",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: BAT, cores: 1 }] },
        opp: { spirits: [{ card: BELL, cores: 1 }] }, // コスト4・BP3000
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルキャノン・ベル") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("アメジスバット") })
        t.closeFlash()
    },
    expect: [
        "自分.アメジスバット.場所: フィールド → なし",
        "自分.トラッシュ: なし → アメジスバット",
        "自分.リザーブ: 10 → 11",
        "相手.デュアルキャノン・ベル.疲労: false → true",
    ],
})

// ============================================================
// SD13-002 ボーン・キャット
// Lv1･Lv2：コスト3以下の自分の紫のスピリットが相手のスピリットの効果で破壊されたとき、その効果を発揮したスピリットのコアすべてを相手のトラッシュに置く。
// ============================================================

// 起きる場面：グガランナーの効果でヘルスコルピオが破壊されたとき、グガランナーのコア3個がトラッシュへ（0コアで消滅）
scenario({
    name: "cat-cores-to-trash",
    start: {
        interactive: true,
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: CAT, cores: 1 }, { card: SCORPIO, label: "スコ", cores: 1 }] },
        opp: { spirits: [{ card: GUGA, cores: 3 }] }, // Lv2：アタック時コスト3以下の相手1体を破壊
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.グガランナー") })
        resolveAll(t, ["スコ"]) // 破壊するのはコスト3以下の自分のスピリット（スコを指定）
        t.closeFlash()
    },
    expect: [
        "自分.スコ.場所: フィールド → なし",
        "自分.トラッシュ: なし → ヘルスコルピオ",
        "自分.リザーブ: 10 → 11",
        "相手.グガランナー.場所: フィールド → なし", // コア0個で消滅
        "相手.トラッシュ: なし → グガランナー",
        "相手.トラッシュのコア: 0 → 3",
    ],
})

// 起きない場面：破壊されたのが紫でなければ（赤のロクケラトプスなら）発揮しない
scenario({
    name: "cat-red-destroyed-no-trigger",
    start: {
        interactive: true,
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: CAT, cores: 1 }, { card: VANILLA, label: "ロク", cores: 1 }] },
        opp: { spirits: [{ card: GUGA, cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.グガランナー") })
        resolveAll(t, ["ロク"])
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ロク.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 12", // 破壊されたコア+1、ライフ減少+1
        "相手.グガランナー.疲労: false → true",
    ],
})

// ソウルコアありの場面：発揮元（グガランナー）のコアすべて（ソウルコアを含む）がトラッシュへ
scenario({
    name: "cat-soulcore",
    start: {
        interactive: true,
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: CAT, cores: 1 }, { card: SCORPIO, label: "スコ", cores: 1 }] },
        opp: { spirits: [{ card: GUGA, cores: 3 }], soulCore: "グガランナー" },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.グガランナー") })
        resolveAll(t, ["スコ"])
        t.closeFlash()
    },
    expect: [
        "自分.スコ.場所: フィールド → なし",
        "自分.トラッシュ: なし → ヘルスコルピオ",
        "自分.リザーブ: 10 → 11",
        "相手.グガランナー.場所: フィールド → なし",
        "相手.トラッシュ: なし → グガランナー",
        "相手.トラッシュのコア: 0 → 3",
        "相手.ソウルコア: 相手.グガランナー → トラッシュ",
    ],
})

// ============================================================
// SD13-003 ボーン・バイソン
// Lv2･Lv3『このスピリットの破壊時』：疲労状態の相手のスピリット1体を破壊する。
// 【連鎖：条件《黄シンボル》】[黄]：自分はデッキから1枚ドローする。
// ============================================================

// 節1＋節2の起きる場面：Lv2 で破壊されたとき疲労状態のアタッカーを破壊し、黄シンボル（ターニャ）があれば続けてドローする
scenario({
    name: "bison-lv2-rensa-yellow-draw",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: BISON, cores: 2 }, { card: TANYA, cores: 1 }] }, // バイソンLv2 BP4000
        opp: { spirits: [{ card: DUALDO, cores: 1 }] }, // BP5000
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルド") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ボーン・バイソン") })
        t.closeFlash()
    },
    expect: [
        "自分.ボーン・バイソン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ボーン・バイソン",
        "自分.リザーブ: 10 → 12", // 破壊されたバイソンのコア2個
        "自分.手札: なし → ロクケラトプス", // 連鎖[黄]：ドロー1
        "自分.デッキ枚数: 40 → 39",
        "相手.デュアルド.場所: フィールド → なし", // 疲労状態のアタッカーを破壊
        "相手.トラッシュ: なし → デュアルド",
        "相手.リザーブ: 10 → 11",
    ],
})

// 節2の起きない場面：黄シンボルがなければ破壊はするがドローしない
scenario({
    name: "bison-lv2-no-yellow-no-draw",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: BISON, cores: 2 }] },
        opp: { spirits: [{ card: DUALDO, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルド") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ボーン・バイソン") })
        t.closeFlash()
    },
    expect: [
        "自分.ボーン・バイソン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ボーン・バイソン",
        "自分.リザーブ: 10 → 12",
        "相手.デュアルド.場所: フィールド → なし",
        "相手.トラッシュ: なし → デュアルド",
        "相手.リザーブ: 10 → 11",
    ],
})

// 節1の起きない場面：Lv1 では破壊されても疲労状態の相手を破壊しない
scenario({
    name: "bison-lv1-no-destroy",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: BISON, cores: 1 }] }, // Lv1 BP2000
        opp: { spirits: [{ card: DUALDO, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルド") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ボーン・バイソン") })
        t.closeFlash()
    },
    expect: [
        "自分.ボーン・バイソン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ボーン・バイソン",
        "自分.リザーブ: 10 → 11",
        "相手.デュアルド.疲労: false → true",
    ],
})

// ============================================================
// SD13-004 ゾンビ・ホーク
// Lv1･Lv2『このスピリットの召喚時』：自分はデッキから1枚ドローする。
// 【連鎖：条件《黄シンボル》】[黄]：このターンの間、相手のスピリット1体をLv1として扱う。
// ============================================================

// 節1＋節2の起きる場面：召喚時にドローし、黄シンボルがあれば相手1体をこのターンLv1扱いする
scenario({
    name: "hawk-summon-rensa-lv1",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: TANYA, cores: 1 }], hand: [HAWK] },
        opp: { spirits: [{ card: DUALDO, cores: 3 }] }, // Lv2 BP8000
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // コスト4（紫シンボルなし）
    },
    expect: [
        "自分.手札: ゾンビ・ホーク → ロクケラトプス", // 召喚時ドロー1
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 5", // コスト4＋維持コア1
        "自分.トラッシュのコア: 0 → 4",
        "自分.ゾンビ・ホーク.場所: なし → フィールド",
        "自分.ゾンビ・ホーク.疲労: なし → false",
        "自分.ゾンビ・ホーク.コア: なし → 1",
        "自分.ゾンビ・ホーク.Lv: なし → 1",
        "自分.ゾンビ・ホーク.BP: なし → 3000",
        "相手.デュアルド.Lv: 2 → 1", // 連鎖[黄]：このターンLv1扱い
        "相手.デュアルド.BP: 8000 → 5000",
    ],
})

// 節2の起きない場面：黄シンボルがなければドローだけで、Lv1扱いはしない
scenario({
    name: "hawk-no-yellow-no-lv1",
    start: {
        turn: "me", phase: "main",
        me: { hand: [HAWK] },
        opp: { spirits: [{ card: DUALDO, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ゾンビ・ホーク → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ゾンビ・ホーク.場所: なし → フィールド",
        "自分.ゾンビ・ホーク.疲労: なし → false",
        "自分.ゾンビ・ホーク.コア: なし → 1",
        "自分.ゾンビ・ホーク.Lv: なし → 1",
        "自分.ゾンビ・ホーク.BP: なし → 3000",
    ],
})

// ============================================================
// SD13-005 骸龍伯ドクー・ロン
// Lv1･Lv2『このスピリットの召喚時』：自分はデッキから1枚ドローする。
// 【連鎖：条件《黄シンボル》】[黄]：最もLvの高い相手のスピリット1体を疲労させる。
// Lv2『このスピリットのアタック時』：疲労状態の相手のスピリット1体を破壊する。
// ============================================================

// 節1＋節2の起きる場面：召喚時にドローし、黄シンボルがあれば最もLvの高い相手（Lv2デュアルド）を疲労させる
scenario({
    name: "doku-summon-rensa-exhaust",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: TANYA, cores: 1 }], hand: [DOKU] },
        opp: { spirits: [{ card: DUALDO, cores: 3 }, { card: SCORPIO, cores: 1 }] }, // Lv2とLv1
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // コスト5（紫シンボルなし）
    },
    expect: [
        "自分.手札: 骸龍伯ドクー・ロン → ロクケラトプス", // 召喚時ドロー1
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 4", // コスト5＋維持コア1
        "自分.トラッシュのコア: 0 → 5",
        "自分.骸龍伯ドクー・ロン.場所: なし → フィールド",
        "自分.骸龍伯ドクー・ロン.疲労: なし → false",
        "自分.骸龍伯ドクー・ロン.コア: なし → 1",
        "自分.骸龍伯ドクー・ロン.Lv: なし → 1",
        "自分.骸龍伯ドクー・ロン.BP: なし → 3000",
        "相手.デュアルド.疲労: false → true", // 連鎖[黄]：最もLvの高い相手1体
    ],
})

// 節2の起きない場面：黄シンボルがなければドローだけで、疲労させない
scenario({
    name: "doku-no-yellow-no-exhaust",
    start: {
        turn: "me", phase: "main",
        me: { hand: [DOKU] },
        opp: { spirits: [{ card: DUALDO, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 骸龍伯ドクー・ロン → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.骸龍伯ドクー・ロン.場所: なし → フィールド",
        "自分.骸龍伯ドクー・ロン.疲労: なし → false",
        "自分.骸龍伯ドクー・ロン.コア: なし → 1",
        "自分.骸龍伯ドクー・ロン.Lv: なし → 1",
        "自分.骸龍伯ドクー・ロン.BP: なし → 3000",
    ],
})

// 節3の起きる場面：Lv2 のアタック時、疲労状態の相手（サンドマン）を破壊する
scenario({
    name: "doku-lv2-attack-destroy-rested",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: DOKU, cores: 3 }] }, // Lv2 BP6000
        opp: { spirits: [{ card: SANDMAN, cores: 1, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("骸龍伯ドクー・ロン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.骸龍伯ドクー・ロン.疲労: false → true",
        "相手.サンドマン.場所: フィールド → なし",
        "相手.トラッシュ: なし → サンドマン",
        "相手.リザーブ: 10 → 12", // 破壊されたコア+1、ライフ減少+1
        "相手.ライフ: 5 → 4",
    ],
})

// 節3の起きない場面：Lv1 ではアタックしても疲労状態の相手を破壊しない
scenario({
    name: "doku-lv1-attack-no-destroy",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: DOKU, cores: 1 }] }, // Lv1
        opp: { spirits: [{ card: SANDMAN, cores: 1, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("骸龍伯ドクー・ロン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.骸龍伯ドクー・ロン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part758）")

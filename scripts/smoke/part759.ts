// smoke パート759（STARTER pyg 11枚：SD13-006／SD13-007／SD13-008／SD13-X01／SD14-001／SD14-002／SD14-003／SD14-004／SD14-005／SD14-006／SD14-007）
// 期待値役が効果文と属性だけから書いた実装前テスト（docs/design/STARTER_PLAN.md §2・BS19_PLAN §2（連鎖）・SEMANTICS_AUDIT §3.8/3.9/3.12）。
// effects はまだ空なので、いまは落ちてよい（例外で止まらず最後まで走ることを確認する）。
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

// ---------- 対象11枚 ----------
const DESLION = "SD13-006" // 死獣公デスリオン（紫スピリット・無魔・コスト6・軽減紫4）
const MAIDEN = "SD13-007" // シャドウ・メイデン（紫ブレイヴ・無魔・コスト4・合体条件：無魔）
const SOULLEAP = "SD13-008" // ソウルリープ（紫マジック・コスト4・軽減紫2）
const CURSEDRAGON = "SD13-X01" // 邪龍王カースドラゴン（紫スピリット・無魔・コスト7・軽減紫3）
const ANTMAN = "SD14-001" // 槍兵アントマン（緑スピリット・怪虫/殻人・コスト1・軽減なし）
const YANYANMA = "SD14-002" // タケヤンマ（緑スピリット・怪虫・コスト2・軽減緑2）
const INAGO = "SD14-003" // イネゴバッタ（緑スピリット・怪虫・コスト3・軽減緑1・【神速】）
const WASP = "SD14-004" // ダーク・ジガワスプ（緑スピリット・怪虫・コスト3・軽減緑2・【神速】）
const TARAN = "SD14-005" // タランシダー（緑スピリット・怪虫・コスト4・軽減緑2）
const NOGI = "SD14-006" // 双刃蟲ノコギラファ（緑スピリット・怪虫/殻虫・コスト5・軽減緑2）
const KUWAGA = "SD14-007" // 飛甲虫ニトウクワガタ（緑ブレイヴ・殻虫・コスト4・軽減緑2・合体条件：怪虫・【神速】）

// ---------- 脇役（既存の弾から。機械確認で名前・色・系統を確かめる） ----------
const VANILLA = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・BP1000・バニラ）
const HIPPO = "BS07-037" // ヒッポカンプー（黄・想獣・コスト1・Lv1 BP1000／Lv2 BP4000・バニラ）
const ORYX = "BS17-046" // オリクス盗賊団（青・獣頭・コスト1・Lv1 BP2000／Lv2 BP3000・バニラ）
const DUALDO = "BS10-007" // デュアルド（赤・古竜/異合・コスト5・BP5000・バニラ）
const SHIKA = "BS16-010" // 骨鹿（紫・無魔・コスト1・BP2000・バニラ。シャドウ・メイデンの合体先）
const DREAMRIBBON = "BS01-146" // ドリームリボン（白マジック・コスト4・軽減白3・フラッシュ：相手1体を手札に戻す）
const POTION = "BS03-126" // ポーションベリー（緑マジック・コスト4・軽減緑3・フラッシュ：ボイドからコア1個をスピリット1体の上に置く）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    assert(c(DESLION).name === "死獣公デスリオン" && c(DESLION).type === "spirit" && c(DESLION).colors.join() === "purple" && c(DESLION).family.join() === "無魔" && c(DESLION).cost === 6 && c(DESLION).effect.includes("疲労状態のコスト6以下の相手のスピリット1体を破壊する") && c(DESLION).effect.includes("【連鎖：条件《黄シンボル》】"), "DESLIONは紫スピリット無魔コスト6・アタック時破壊＋黄連鎖")
    assert(c(MAIDEN).name === "シャドウ・メイデン" && c(MAIDEN).type === "brave" && c(MAIDEN).colors.join() === "purple" && c(MAIDEN).family.join() === "無魔" && c(MAIDEN).cost === 4 && c(MAIDEN).effect.includes("デッキから1枚ドローする") && c(MAIDEN).effect.includes("合体条件：無魔") && c(MAIDEN).effect.includes("疲労状態の合体していない相手のスピリット1体を破壊する"), "MAIDENは紫ブレイヴ無魔コスト4・召喚時ドロー＋合体時破壊")
    assert(c(SOULLEAP).name === "ソウルリープ" && c(SOULLEAP).type === "magic" && c(SOULLEAP).colors.join() === "purple" && c(SOULLEAP).cost === 4 && c(SOULLEAP).effect.includes("疲労状態のコスト4以下の相手のスピリット1体を破壊する") && c(SOULLEAP).effect.includes("指定した色のスピリットとして扱う"), "SOULLEAPは紫マジックコスト4・フラッシュ破壊＋黄連鎖の色指定")
    assert(c(CURSEDRAGON).name === "邪龍王カースドラゴン" && c(CURSEDRAGON).type === "spirit" && c(CURSEDRAGON).colors.join() === "purple" && c(CURSEDRAGON).family.join() === "無魔" && c(CURSEDRAGON).cost === 7 && c(CURSEDRAGON).effect.includes("疲労状態の相手のスピリット2体を破壊する") && c(CURSEDRAGON).effect.includes("コア1個ずつを相手のリザーブに置く"), "CURSEDRAGONは紫スピリット無魔コスト7・召喚時2体破壊＋アタック時コア除去")
    assert(c(ANTMAN).name === "槍兵アントマン" && c(ANTMAN).type === "spirit" && c(ANTMAN).colors.join() === "green" && c(ANTMAN).family.join() === "怪虫,殻人" && c(ANTMAN).cost === 1 && c(ANTMAN).effect.includes("自分のリザーブのコア1個につき、このスピリットをBP+1000する"), "ANTMANは緑スピリット怪虫/殻人コスト1・リザーブ数BP+")
    assert(c(YANYANMA).name === "タケヤンマ" && c(YANYANMA).type === "spirit" && c(YANYANMA).colors.join() === "green" && c(YANYANMA).family.join() === "怪虫" && c(YANYANMA).cost === 2 && c(YANYANMA).effect.includes("系統：「怪虫」を持つ自分のスピリット1体を回復させる") && c(YANYANMA).effect.includes("【連鎖：条件《青シンボル》】"), "YANYANMAは緑スピリット怪虫コスト2・破壊時回復＋青連鎖")
    assert(c(INAGO).name === "イネゴバッタ" && c(INAGO).type === "spirit" && c(INAGO).colors.join() === "green" && c(INAGO).family.join() === "怪虫" && c(INAGO).cost === 3 && c(INAGO).effect.includes("フラッシュ【神速】") && c(INAGO).effect.includes("ボイドからコア1個を自分のスピリットに置く") && c(INAGO).effect.includes("相手は白のマジックカードを使用できない"), "INAGOは緑スピリット怪虫コスト3・神速＋ボイドコア＋青連鎖")
    assert(c(WASP).name === "ダーク・ジガワスプ" && c(WASP).type === "spirit" && c(WASP).colors.join() === "green" && c(WASP).family.join() === "怪虫" && c(WASP).cost === 3 && c(WASP).effect.includes("フラッシュ【神速】") && c(WASP).effect.includes("コスト3以下の相手のスピリット1体を破壊する"), "WASPは緑スピリット怪虫コスト3・神速＋青連鎖のコスト3以下破壊")
    assert(c(TARAN).name === "タランシダー" && c(TARAN).type === "spirit" && c(TARAN).colors.join() === "green" && c(TARAN).family.join() === "怪虫" && c(TARAN).cost === 4 && c(TARAN).effect.includes("相手のスピリット1体を疲労させる") && c(TARAN).effect.includes("その数を+1個する"), "TARANは緑スピリット怪虫コスト4・召喚時疲労＋ボイドコア+1")
    assert(c(NOGI).name === "双刃蟲ノコギラファ" && c(NOGI).type === "spirit" && c(NOGI).colors.join() === "green" && c(NOGI).family.join() === "怪虫,殻虫" && c(NOGI).cost === 5 && c(NOGI).effect.includes("相手は、相手のスピリット2体を疲労させる") && c(NOGI).effect.includes("【神速】を持つ自分のスピリット2体に置く"), "NOGIは緑スピリット怪虫/殻虫コスト5・召喚時相手2体疲労＋神速持ちにコア")
    assert(c(KUWAGA).name === "飛甲虫ニトウクワガタ" && c(KUWAGA).type === "brave" && c(KUWAGA).colors.join() === "green" && c(KUWAGA).family.join() === "殻虫" && c(KUWAGA).cost === 4 && c(KUWAGA).effect.includes("フラッシュ【神速】") && c(KUWAGA).effect.includes("合体条件：怪虫") && c(KUWAGA).effect.includes("バトル終了時、ボイドからコア1個を自分のスピリットに置く"), "KUWAGAは緑ブレイヴ殻虫コスト4・神速＋合体時バトル終了コア")
    assert(c(VANILLA).name === "ロクケラトプス" && c(VANILLA).colors.join() === "red" && c(VANILLA).family.join() === "地竜" && c(VANILLA).cost === 1 && c(VANILLA).effect === "" && c(VANILLA).levels?.[0]?.bp === 1000, "VANILLAは赤地竜コスト1バニラ（BP1000）")
    assert(c(HIPPO).name === "ヒッポカンプー" && c(HIPPO).colors.join() === "yellow" && c(HIPPO).family.join() === "想獣" && c(HIPPO).cost === 1 && c(HIPPO).effect === "" && c(HIPPO).levels?.[1]?.bp === 4000, "HIPPOは黄想獣コスト1バニラ（Lv2 BP4000）")
    assert(c(ORYX).name === "オリクス盗賊団" && c(ORYX).colors.join() === "blue" && c(ORYX).family.join() === "獣頭" && c(ORYX).cost === 1 && c(ORYX).effect === "" && c(ORYX).levels?.[0]?.bp === 2000, "ORYXは青獣頭コスト1バニラ（BP2000）")
    assert(c(DUALDO).name === "デュアルド" && c(DUALDO).colors.join() === "red" && c(DUALDO).family.join() === "古竜,異合" && c(DUALDO).cost === 5 && c(DUALDO).effect === "" && c(DUALDO).levels?.[0]?.bp === 5000, "DUALDOは赤古竜/異合コスト5バニラ（BP5000）")
    assert(c(SHIKA).name === "骨鹿" && c(SHIKA).colors.join() === "purple" && c(SHIKA).family.includes("無魔") && c(SHIKA).cost === 1 && c(SHIKA).effect === "" && c(SHIKA).levels?.[0]?.bp === 2000, "SHIKAは紫無魔コスト1バニラ（BP2000）")
    assert(c(DREAMRIBBON).name === "ドリームリボン" && c(DREAMRIBBON).type === "magic" && c(DREAMRIBBON).colors.join() === "white" && c(DREAMRIBBON).cost === 4 && c(DREAMRIBBON).effect.includes("相手のスピリット1体を手札に戻す"), "DREAMRIBBONは白マジックコスト4・バウンス")
    assert(c(POTION).name === "ポーションベリー" && c(POTION).type === "magic" && c(POTION).colors.join() === "green" && c(POTION).cost === 4 && c(POTION).effect.includes("ボイドからコア1個をスピリット1体の上に置く"), "POTIONは緑マジックコスト4・ボイドからコア1個")
}

// 選択待ちを最後まで答える（part753 と同じ形）。prefer に挙げたラベル・選択肢を優先する
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
// SD13-006 死獣公デスリオン
// Lv1･Lv2『このスピリットのアタック時』疲労状態のコスト6以下の相手のスピリット1体を破壊する。
// 【連鎖：条件《黄シンボル》】[黄]：このスピリットはLv2/Lv3の相手のスピリットからブロックされない。
// ============================================================

// 起きる場面：アタック時に疲労状態のコスト6以下の相手1体を破壊する
scenario({
    name: "deslion-attack-destroy-rested",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: DESLION, cores: 2 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1, rested: true }, { card: HIPPO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("死獣公デスリオン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.死獣公デスリオン.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12", // 破壊された1コア＋ライフ減少の1コア
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面：相手が疲労状態でなければ破壊されない
scenario({
    name: "deslion-attack-not-rested",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: DESLION, cores: 2 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("死獣公デスリオン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.死獣公デスリオン.疲労: false → true",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きる場面（連鎖[黄]）：黄シンボルがあるときLv2の相手からブロックされない
scenario({
    name: "deslion-rensa-yellow-lv2-unblockable",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: DESLION, cores: 2 }, { card: HIPPO, cores: 1 }] },
        opp: { spirits: [{ card: HIPPO, cores: 3 }] }, // Lv2（BP4000）
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("死獣公デスリオン") })
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("相手.ヒッポカンプー") })
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.死獣公デスリオン.疲労: false → true",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面（連鎖[黄]）：黄シンボルがなければLv2の相手にもブロックされる
scenario({
    name: "deslion-rensa-no-yellow-blocked",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: DESLION, cores: 2 }] },
        opp: { spirits: [{ card: HIPPO, cores: 3 }] }, // Lv2（BP4000）
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("死獣公デスリオン") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.ヒッポカンプー") })
        t.closeFlash()
    },
    expect: [
        "自分.死獣公デスリオン.疲労: false → true",
        "相手.ヒッポカンプー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヒッポカンプー",
        "相手.リザーブ: 10 → 13", // ブロッカーの3コアがリザーブへ
    ],
})

// 起きない場面（連鎖[黄]）：ブロッカーがLv1なら黄シンボルがあってもブロックされる
scenario({
    name: "deslion-rensa-lv1-blocker",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: DESLION, cores: 2 }, { card: HIPPO, cores: 1 }] },
        opp: { spirits: [{ card: HIPPO, cores: 1 }] }, // Lv1（BP1000）
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("死獣公デスリオン") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.ヒッポカンプー") })
        t.closeFlash()
    },
    expect: [
        "自分.死獣公デスリオン.疲労: false → true",
        "相手.ヒッポカンプー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヒッポカンプー",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD13-007 シャドウ・メイデン
// Lv1『このブレイヴの召喚時』自分はデッキから1枚ドローする。
// 【合体時】『このスピリットの合体アタック時』疲労状態の合体していない相手のスピリット1体を破壊する。
// ============================================================

// 起きる場面：ブレイヴをスピリット状態で召喚すると1枚ドローする
scenario({
    name: "maiden-summon-draw",
    start: {
        turn: "me", phase: "main",
        me: { hand: [MAIDEN] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // スピリット状態で召喚
    },
    expect: [
        "自分.手札: シャドウ・メイデン → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 5", // コスト4（紫シンボルなし）＋維持コア1
        "自分.トラッシュのコア: 0 → 4",
        "自分.シャドウ・メイデン.場所: なし → フィールド",
        "自分.シャドウ・メイデン.疲労: なし → false",
        "自分.シャドウ・メイデン.コア: なし → 1",
        "自分.シャドウ・メイデン.Lv: なし → 1",
        "自分.シャドウ・メイデン.BP: なし → 2000",
    ],
})

// 起きる場面（合体時）：合体アタック時に疲労状態の合体していない相手1体を破壊する
scenario({
    name: "maiden-combined-attack-destroy",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: SHIKA, cores: 1 }], hand: [MAIDEN] }, // 骨鹿は無魔＝合体条件を満たす
        opp: { spirits: [{ card: VANILLA, cores: 1, rested: true }, { card: DUALDO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("骨鹿") }) // ダイレクト合体
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("骨鹿") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: シャドウ・メイデン → ロクケラトプス", // 召喚時ドロー
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 7", // コスト4から紫シンボル1つで軽減→3支払い（ダイレクト合体は維持コア不要）
        "自分.トラッシュのコア: 0 → 3",
        "自分.骨鹿.BP: 2000 → 4000", // 合体時BP+2000
        "自分.骨鹿.疲労: false → true",
        "自分.シャドウ・メイデン.場所: なし → 合体",
        "自分.シャドウ・メイデン.疲労: なし → false",
        "自分.シャドウ・メイデン.コア: なし → 0",
        "自分.シャドウ・メイデン.Lv: なし → 1",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12", // 破壊された1コア＋ライフ減少の1コア
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面（合体時）：相手が疲労状態でなければ破壊されない
scenario({
    name: "maiden-combined-attack-not-rested",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: SHIKA, cores: 1 }], hand: [MAIDEN] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] }, // 疲労していない
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("骨鹿") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("骨鹿") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: シャドウ・メイデン → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.骨鹿.BP: 2000 → 4000",
        "自分.骨鹿.疲労: false → true",
        "自分.シャドウ・メイデン.場所: なし → 合体",
        "自分.シャドウ・メイデン.疲労: なし → false",
        "自分.シャドウ・メイデン.コア: なし → 0",
        "自分.シャドウ・メイデン.Lv: なし → 1",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// ============================================================
// SD13-008 ソウルリープ
// フラッシュ：疲労状態のコスト4以下の相手のスピリット1体を破壊する。
// 【連鎖：条件《黄シンボル》】[黄]：色1色を指定する。このターンの間、自分のスピリット1体を指定した色のスピリットとして扱う。
// ============================================================

// 起きる場面：フラッシュで疲労状態のコスト4以下の相手1体を破壊する（黄シンボルなし＝連鎖不発）
scenario({
    name: "soulleap-flash-destroy",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: VANILLA, cores: 1 }], hand: [SOULLEAP] },
        opp: { spirits: [{ card: VANILLA, cores: 1, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.手札: ソウルリープ → なし",
        "自分.トラッシュ: なし → ソウルリープ",
        "自分.リザーブ: 10 → 6", // コスト4（紫シンボルなし）
        "自分.トラッシュのコア: 0 → 4",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面：疲労状態でもコスト5以上なら破壊されない
scenario({
    name: "soulleap-flash-cost5-survives",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: VANILLA, cores: 1 }], hand: [SOULLEAP] },
        opp: { spirits: [{ card: DUALDO, cores: 1, rested: true }] }, // コスト5
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.デュアルド") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.手札: ソウルリープ → なし",
        "自分.トラッシュ: なし → ソウルリープ",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きる場面（連鎖[黄]）：黄シンボルがあるとき色を指定し、その色のスピリットとして扱う（シンボルの色も変わる＝白マジックの軽減で観察）
scenario({
    name: "soulleap-rensa-yellow-color",
    start: {
        turn: "me", phase: "main", interactive: true,
        me: { spirits: [{ card: HIPPO, cores: 1 }], hand: [SOULLEAP, DREAMRIBBON] },
        opp: { spirits: [{ card: VANILLA, cores: 1, rested: true }, { card: DUALDO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ヒッポカンプー") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.ロクケラトプス") })
        resolveAll(t, ["相手.ロクケラトプス", "白"]) // 連鎖[黄]：白を指定し、ヒッポカンプーを白として扱う
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.デュアルド") })
        resolveAll(t, ["相手.デュアルド"])
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ヒッポカンプー.疲労: false → true",
        "自分.手札: ソウルリープ、ドリームリボン → なし",
        "自分.トラッシュ: なし → ソウルリープ、ドリームリボン",
        "自分.リザーブ: 10 → 3", // ソウルリープ4＋ドリームリボンは白シンボル1つ（色の置き換え）で軽減→3
        "自分.トラッシュのコア: 0 → 7",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.デュアルド.場所: フィールド → なし",
        "相手.手札: なし → デュアルド",
        "相手.リザーブ: 10 → 13", // 破壊1＋バウンスした1コア＋ライフ減少1
        "相手.ライフ: 5 → 4",
    ],
})

// ============================================================
// SD13-X01 邪龍王カースドラゴン
// Lv1･Lv2･Lv3『このスピリットの召喚時』疲労状態の相手のスピリット2体を破壊する。この効果で破壊した相手のスピリット1体につき、自分はデッキから1枚ドローする。
// Lv2･Lv3『このスピリットのアタック時』相手のスピリット2体のコア1個ずつを相手のリザーブに置く。
// ============================================================

// 起きる場面：召喚時に疲労状態の相手2体を破壊し、破壊数だけドローする
scenario({
    name: "cursedragon-summon-destroy-draw",
    start: {
        turn: "me", phase: "main",
        me: { hand: [CURSEDRAGON] },
        opp: { spirits: [{ card: VANILLA, cores: 1, rested: true }, { card: ORYX, cores: 1, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 邪龍王カースドラゴン → ロクケラトプス、ロクケラトプス", // 2体破壊→2枚ドロー
        "自分.デッキ枚数: 40 → 38",
        "自分.リザーブ: 10 → 2", // コスト7（紫シンボルなし）＋維持コア1
        "自分.トラッシュのコア: 0 → 7",
        "自分.邪龍王カースドラゴン.場所: なし → フィールド",
        "自分.邪龍王カースドラゴン.疲労: なし → false",
        "自分.邪龍王カースドラゴン.コア: なし → 1",
        "自分.邪龍王カースドラゴン.Lv: なし → 1",
        "自分.邪龍王カースドラゴン.BP: なし → 5000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.オリクス盗賊団.場所: フィールド → なし",
        "相手.トラッシュ: なし → オリクス盗賊団、ロクケラトプス",
        "相手.リザーブ: 10 → 12",
    ],
})

// 起きない場面：疲労状態の相手が1体だけなら、1体だけ破壊して1枚だけドローする
scenario({
    name: "cursedragon-summon-one-rested",
    start: {
        turn: "me", phase: "main",
        me: { hand: [CURSEDRAGON] },
        opp: { spirits: [{ card: VANILLA, cores: 1, rested: true }, { card: ORYX, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 邪龍王カースドラゴン → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 7",
        "自分.邪龍王カースドラゴン.場所: なし → フィールド",
        "自分.邪龍王カースドラゴン.疲労: なし → false",
        "自分.邪龍王カースドラゴン.コア: なし → 1",
        "自分.邪龍王カースドラゴン.Lv: なし → 1",
        "自分.邪龍王カースドラゴン.BP: なし → 5000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きる場面（Lv2）：アタック時に相手2体のコア1個ずつを相手のリザーブに置く
scenario({
    name: "cursedragon-lv2-attack-remove-cores",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: CURSEDRAGON, cores: 3 }] }, // Lv2
        opp: { spirits: [{ card: VANILLA, cores: 2 }, { card: ORYX, cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("邪龍王カースドラゴン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.邪龍王カースドラゴン.疲労: false → true",
        "相手.ロクケラトプス.コア: 2 → 1",
        "相手.ロクケラトプス.Lv: 2 → 1",
        "相手.ロクケラトプス.BP: 3000 → 1000",
        "相手.オリクス盗賊団.コア: 2 → 1",
        "相手.オリクス盗賊団.Lv: 2 → 1",
        "相手.オリクス盗賊団.BP: 3000 → 2000",
        "相手.リザーブ: 10 → 13", // 取り除いた2コア＋ライフ減少1
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面（Lv2）：Lv1ではアタック時のコア除去は発揮しない
scenario({
    name: "cursedragon-lv1-attack-no-remove",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: CURSEDRAGON, cores: 1 }] }, // Lv1
        opp: { spirits: [{ card: VANILLA, cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("邪龍王カースドラゴン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.邪龍王カースドラゴン.疲労: false → true",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// ソウルコアありの場面：取り除かれるのは通常コアだけで、ソウルコアはスピリットに残る
scenario({
    name: "cursedragon-lv2-attack-soulcore-stays",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: CURSEDRAGON, cores: 3 }] },
        opp: { spirits: [{ card: VANILLA, cores: 2 }], soulCore: "ロクケラトプス" },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("邪龍王カースドラゴン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.邪龍王カースドラゴン.疲労: false → true",
        "相手.ロクケラトプス.コア: 2 → 1",
        "相手.ロクケラトプス.Lv: 2 → 1",
        "相手.ロクケラトプス.BP: 3000 → 1000",
        "相手.リザーブ: 10 → 12", // 通常コア1個＋ライフ減少1（ソウルコアは残る）
        "相手.ライフ: 5 → 4",
    ],
})

// ============================================================
// SD14-001 槍兵アントマン
// Lv2『このスピリットのアタック時』自分のリザーブのコア1個につき、このスピリットをBP+1000する。
// ============================================================

// 起きる場面：Lv2のアタック時、リザーブ10個でバトルの間BP+10000し、BP5000のブロッカーを破壊する
scenario({
    name: "antman-lv2-attack-bp",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: ANTMAN, cores: 2 }] }, // Lv2（BP3000）
        opp: { spirits: [{ card: DUALDO, cores: 1 }] }, // BP5000
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("槍兵アントマン") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.デュアルド") })
        t.closeFlash()
    },
    expect: [
        "自分.槍兵アントマン.疲労: false → true",
        "相手.デュアルド.場所: フィールド → なし",
        "相手.トラッシュ: なし → デュアルド",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きない場面：Lv1ではBP+されず、BP5000のブロッカーに破壊される
scenario({
    name: "antman-lv1-attack-no-bp",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: ANTMAN, cores: 1 }] }, // Lv1（BP1000）
        opp: { spirits: [{ card: DUALDO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("槍兵アントマン") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.デュアルド") })
        t.closeFlash()
    },
    expect: [
        "自分.槍兵アントマン.疲労: false → true",
        "自分.槍兵アントマン.場所: フィールド → なし",
        "自分.トラッシュ: なし → 槍兵アントマン",
        "自分.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD14-002 タケヤンマ
// Lv1･Lv2『このスピリットの破壊時』系統：「怪虫」を持つ自分のスピリット1体を回復させる。
// 【連鎖：条件《青シンボル》】[青]：コスト2以下の相手のスピリット1体を破壊する。
// ============================================================

// 起きる場面：破壊されたとき、怪虫の自分のスピリット1体を回復させる
scenario({
    name: "yanyanma-destroy-refresh",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: YANYANMA, cores: 1 }, { card: INAGO, cores: 1, rested: true }] },
        opp: { spirits: [{ card: DUALDO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("タケヤンマ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.デュアルド") }) // BP2000 vs 5000 でタケヤンマが破壊される
        t.closeFlash()
    },
    expect: [
        "自分.タケヤンマ.疲労: false → true",
        "自分.タケヤンマ.場所: フィールド → なし",
        "自分.トラッシュ: なし → タケヤンマ",
        "自分.リザーブ: 10 → 11",
        "自分.イネゴバッタ.疲労: true → false", // 破壊時：怪虫1体を回復
    ],
})

// 起きる場面（連鎖[青]）：青シンボルがあるとき、破壊時にコスト2以下の相手1体を破壊する
scenario({
    name: "yanyanma-rensa-blue-destroy",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: YANYANMA, cores: 1 }, { card: ORYX, cores: 1 }, { card: INAGO, cores: 1 }] },
        opp: { spirits: [{ card: DUALDO, cores: 1 }, { card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("タケヤンマ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.デュアルド") })
        t.closeFlash()
    },
    expect: [
        "自分.タケヤンマ.疲労: false → true",
        "自分.タケヤンマ.場所: フィールド → なし",
        "自分.トラッシュ: なし → タケヤンマ",
        "自分.リザーブ: 10 → 11",
        "相手.ロクケラトプス.場所: フィールド → なし", // 連鎖[青]：コスト2以下を破壊
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きない場面（連鎖[青]）：青シンボルがなければコスト2以下の相手は破壊されない
scenario({
    name: "yanyanma-rensa-no-blue",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: YANYANMA, cores: 1 }, { card: INAGO, cores: 1 }] },
        opp: { spirits: [{ card: DUALDO, cores: 1 }, { card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("タケヤンマ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.デュアルド") })
        t.closeFlash()
    },
    expect: [
        "自分.タケヤンマ.疲労: false → true",
        "自分.タケヤンマ.場所: フィールド → なし",
        "自分.トラッシュ: なし → タケヤンマ",
        "自分.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD14-003 イネゴバッタ
// フラッシュ【神速】／Lv2『このスピリットのアタック時』ボイドからコア1個を自分のスピリットに置く。
// 【連鎖：条件《青シンボル》】[青]：このバトルの間、相手は白のマジックカードを使用できない。
// ============================================================

// 起きる場面（【神速】）：アタックステップのフラッシュで手札から召喚できる
scenario({
    name: "inago-soku-flash-summon",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: VANILLA, cores: 1 }], hand: [INAGO] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "summon", handIndex: 0 }) // フラッシュ【神速】で召喚
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.手札: イネゴバッタ → なし",
        "自分.リザーブ: 10 → 6", // コスト3（緑シンボルなし）＋維持コア1
        "自分.トラッシュのコア: 0 → 3",
        "自分.イネゴバッタ.場所: なし → フィールド",
        "自分.イネゴバッタ.疲労: なし → false",
        "自分.イネゴバッタ.コア: なし → 1",
        "自分.イネゴバッタ.Lv: なし → 1",
        "自分.イネゴバッタ.BP: なし → 2000",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きる場面（Lv2）：アタック時にボイドからコア1個を自分のスピリットに置く
scenario({
    name: "inago-lv2-attack-void-core",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: INAGO, cores: 2 }] }, // Lv2
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("イネゴバッタ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.イネゴバッタ.疲労: false → true",
        "自分.イネゴバッタ.コア: 2 → 3", // ボイドから自分（場にいるのはこれ1体）へ
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面（Lv2）：Lv1ではアタック時にコアは置かれない
scenario({
    name: "inago-lv1-attack-no-core",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: INAGO, cores: 1 }] }, // Lv1
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("イネゴバッタ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.イネゴバッタ.疲労: false → true",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きる場面（連鎖[青]）：青シンボルがあるとき、このバトルの間、相手は白のマジックカードを使用できない
scenario({
    name: "inago-rensa-blue-white-magic-banned",
    start: {
        turn: "me", phase: "main", interactive: true,
        me: { spirits: [{ card: INAGO, cores: 2 }, { card: ORYX, cores: 1 }] }, // ORYX＝青シンボル
        opp: { spirits: [{ card: DUALDO, cores: 1 }], hand: [DREAMRIBBON] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("イネゴバッタ") })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("自分.イネゴバッタ") }) // 白マジックは使用できない
        resolveAll(t, ["イネゴバッタ"]) // ボイドコアの置き先はイネゴバッタ
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.イネゴバッタ.疲労: false → true",
        "自分.イネゴバッタ.コア: 2 → 3",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面（連鎖[青]）：青シンボルがなければ相手は白のマジックカードを使用できる
scenario({
    name: "inago-rensa-no-blue-white-magic-ok",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: INAGO, cores: 2 }, { card: VANILLA, cores: 1 }] },
        opp: { spirits: [{ card: DUALDO, cores: 1 }], hand: [DREAMRIBBON] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("イネゴバッタ") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("自分.ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.イネゴバッタ.疲労: false → true",
        "自分.イネゴバッタ.コア: 2 → 3", // Lv2アタック時のボイドコア（置き先はイネゴバッタだけ）
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.手札: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11", // バウンスされたロクケラトプスの1コア
        "相手.手札: ドリームリボン → なし",
        "相手.トラッシュ: なし → ドリームリボン",
        "相手.リザーブ: 10 → 7", // コスト4（白シンボルなし）＋ライフ減少1
        "相手.トラッシュのコア: 0 → 4",
        "相手.ライフ: 5 → 4",
    ],
})

// ============================================================
// SD14-004 ダーク・ジガワスプ
// フラッシュ【神速】
// 【連鎖：条件《青シンボル》】[青]：コスト3以下の相手のスピリット1体を破壊する。（神速召喚時に発揮する連鎖）
// ============================================================

// 起きる場面（【神速】）：アタックステップのフラッシュで手札から召喚できる
scenario({
    name: "wasp-soku-flash-summon",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: VANILLA, cores: 1 }], hand: [WASP] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "summon", handIndex: 0 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.手札: ダーク・ジガワスプ → なし",
        "自分.リザーブ: 10 → 6", // コスト3（緑シンボルなし）＋維持コア1
        "自分.トラッシュのコア: 0 → 3",
        "自分.ダーク・ジガワスプ.場所: なし → フィールド",
        "自分.ダーク・ジガワスプ.疲労: なし → false",
        "自分.ダーク・ジガワスプ.コア: なし → 1",
        "自分.ダーク・ジガワスプ.Lv: なし → 1",
        "自分.ダーク・ジガワスプ.BP: なし → 1000",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きる場面（連鎖[青]）：【神速】で召喚したとき、コスト3以下の相手1体を破壊する
scenario({
    name: "wasp-soku-rensa-blue-destroy",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: ORYX, cores: 1 }, { card: VANILLA, cores: 1 }], hand: [WASP] }, // ORYX＝青シンボル
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "summon", handIndex: 0 }) // フラッシュ【神速】で召喚
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.手札: ダーク・ジガワスプ → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.ダーク・ジガワスプ.場所: なし → フィールド",
        "自分.ダーク・ジガワスプ.疲労: なし → false",
        "自分.ダーク・ジガワスプ.コア: なし → 1",
        "自分.ダーク・ジガワスプ.Lv: なし → 1",
        "自分.ダーク・ジガワスプ.BP: なし → 1000",
        "相手.ロクケラトプス.場所: フィールド → なし", // 連鎖[青]：コスト3以下を破壊
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面（連鎖[青]）：メインステップの通常の召喚では連鎖は発揮しない
scenario({
    name: "wasp-normal-summon-no-rensa",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: ORYX, cores: 1 }], hand: [WASP] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // メインステップの通常召喚
    },
    expect: [
        "自分.手札: ダーク・ジガワスプ → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.ダーク・ジガワスプ.場所: なし → フィールド",
        "自分.ダーク・ジガワスプ.疲労: なし → false",
        "自分.ダーク・ジガワスプ.コア: なし → 1",
        "自分.ダーク・ジガワスプ.Lv: なし → 1",
        "自分.ダーク・ジガワスプ.BP: なし → 1000",
    ],
})

// ============================================================
// SD14-005 タランシダー
// Lv1･Lv2『このスピリットの召喚時』相手のスピリット1体を疲労させる。
// Lv2：ボイドからこのスピリットにコアが置かれるとき、その数を+1個する。
// ============================================================

// 起きる場面：召喚時に相手のスピリット1体を疲労させる
scenario({
    name: "taran-summon-exhaust",
    start: {
        turn: "me", phase: "main",
        me: { hand: [TARAN] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: タランシダー → なし",
        "自分.リザーブ: 10 → 5", // コスト4（緑シンボルなし）＋維持コア1
        "自分.トラッシュのコア: 0 → 4",
        "自分.タランシダー.場所: なし → フィールド",
        "自分.タランシダー.疲労: なし → false",
        "自分.タランシダー.コア: なし → 1",
        "自分.タランシダー.Lv: なし → 1",
        "自分.タランシダー.BP: なし → 1000",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

// 起きない場面：相手のスピリットがいなければ、召喚時効果は不発で終わる
scenario({
    name: "taran-summon-no-target",
    start: {
        turn: "me", phase: "main",
        me: { hand: [TARAN] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: タランシダー → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.タランシダー.場所: なし → フィールド",
        "自分.タランシダー.疲労: なし → false",
        "自分.タランシダー.コア: なし → 1",
        "自分.タランシダー.Lv: なし → 1",
        "自分.タランシダー.BP: なし → 1000",
    ],
})

// 起きる場面（Lv2）：ボイドからこのスピリットにコアが置かれるとき、その数を+1個する
scenario({
    name: "taran-lv2-core-bonus",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: TARAN, cores: 2 }, { card: INAGO, cores: 1 }], hand: [POTION] }, // タランシダーLv2
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("イネゴバッタ") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("タランシダー") }) // ボイドからコア1個をタランシダーへ
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.イネゴバッタ.疲労: false → true",
        "自分.手札: ポーションベリー → なし",
        "自分.トラッシュ: なし → ポーションベリー",
        "自分.リザーブ: 10 → 8", // コスト4から緑シンボル2つで軽減→2支払い
        "自分.トラッシュのコア: 0 → 2",
        "自分.タランシダー.コア: 2 → 4", // 1個置くところを+1個して2個
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面（Lv2）：Lv1では+1個されず、置かれるのは1個だけ
scenario({
    name: "taran-lv1-no-bonus",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: TARAN, cores: 1 }, { card: INAGO, cores: 1 }], hand: [POTION] }, // タランシダーLv1
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("イネゴバッタ") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("タランシダー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.イネゴバッタ.疲労: false → true",
        "自分.手札: ポーションベリー → なし",
        "自分.トラッシュ: なし → ポーションベリー",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.タランシダー.コア: 1 → 2",
        "自分.タランシダー.Lv: 1 → 2",
        "自分.タランシダー.BP: 1000 → 5000",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// ============================================================
// SD14-006 双刃蟲ノコギラファ
// Lv1･Lv2･Lv3『このスピリットの召喚時』相手は、相手のスピリット2体を疲労させる。
// Lv2･Lv3『このスピリットのアタック時』ボイドからコア1個ずつを、【神速】を持つ自分のスピリット2体に置く。
// ============================================================

// 起きる場面：召喚時に相手は相手のスピリット2体を疲労させる
scenario({
    name: "nogi-summon-exhaust-two",
    start: {
        turn: "me", phase: "main",
        me: { hand: [NOGI] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }, { card: ORYX, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 双刃蟲ノコギラファ → なし",
        "自分.リザーブ: 10 → 4", // コスト5（緑シンボルなし）＋維持コア1
        "自分.トラッシュのコア: 0 → 5",
        "自分.双刃蟲ノコギラファ.場所: なし → フィールド",
        "自分.双刃蟲ノコギラファ.疲労: なし → false",
        "自分.双刃蟲ノコギラファ.コア: なし → 1",
        "自分.双刃蟲ノコギラファ.Lv: なし → 1",
        "自分.双刃蟲ノコギラファ.BP: なし → 4000",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.オリクス盗賊団.疲労: false → true",
    ],
})

// 起きない場面：相手のスピリットがいなければ、疲労させる対象なしで終わる
scenario({
    name: "nogi-summon-no-opp",
    start: {
        turn: "me", phase: "main",
        me: { hand: [NOGI] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 双刃蟲ノコギラファ → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.双刃蟲ノコギラファ.場所: なし → フィールド",
        "自分.双刃蟲ノコギラファ.疲労: なし → false",
        "自分.双刃蟲ノコギラファ.コア: なし → 1",
        "自分.双刃蟲ノコギラファ.Lv: なし → 1",
        "自分.双刃蟲ノコギラファ.BP: なし → 4000",
    ],
})

// 起きる場面（Lv2）：アタック時にボイドからコア1個ずつを、【神速】を持つ自分のスピリット2体に置く
scenario({
    name: "nogi-lv2-attack-cores-to-soku",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: NOGI, cores: 3 }, { card: INAGO, cores: 1 }, { card: WASP, cores: 1 }] }, // Lv2＋【神速】2体
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("双刃蟲ノコギラファ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.双刃蟲ノコギラファ.疲労: false → true",
        "自分.イネゴバッタ.コア: 1 → 2",
        "自分.イネゴバッタ.Lv: 1 → 2",
        "自分.イネゴバッタ.BP: 2000 → 3000",
        "自分.ダーク・ジガワスプ.コア: 1 → 2", // Lv2はコア3なのでLv1のまま
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面（Lv2）：Lv1ではアタック時にコアは置かれない
scenario({
    name: "nogi-lv1-attack-no-cores",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: NOGI, cores: 1 }, { card: INAGO, cores: 1 }] }, // Lv1
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("双刃蟲ノコギラファ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.双刃蟲ノコギラファ.疲労: false → true",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// ============================================================
// SD14-007 飛甲虫ニトウクワガタ
// フラッシュ【神速】／合体条件：怪虫
// 【合体時】『このスピリットのバトル時』バトル終了時、ボイドからコア1個を自分のスピリットに置く。
// ============================================================

// 起きる場面（【神速】）：アタックステップのフラッシュで手札から召喚できる（スピリット状態）
scenario({
    name: "kuwaga-soku-flash-summon",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: VANILLA, cores: 1 }], hand: [KUWAGA] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "summon", handIndex: 0 }) // フラッシュ【神速】でスピリット状態として召喚
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.手札: 飛甲虫ニトウクワガタ → なし",
        "自分.リザーブ: 10 → 5", // コスト4（緑シンボルなし）＋維持コア1
        "自分.トラッシュのコア: 0 → 4",
        "自分.飛甲虫ニトウクワガタ.場所: なし → フィールド",
        "自分.飛甲虫ニトウクワガタ.疲労: なし → false",
        "自分.飛甲虫ニトウクワガタ.コア: なし → 1",
        "自分.飛甲虫ニトウクワガタ.Lv: なし → 1",
        "自分.飛甲虫ニトウクワガタ.BP: なし → 2000",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きる場面（合体時）：合体スピリットのバトル終了時、ボイドからコア1個を自分のスピリットに置く
scenario({
    name: "kuwaga-combined-battle-end-core",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: YANYANMA, cores: 1 }], hand: [KUWAGA] }, // タケヤンマは怪虫＝合体条件を満たす
        opp: { spirits: [{ card: DUALDO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("タケヤンマ") }) // ダイレクト合体
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("タケヤンマ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 飛甲虫ニトウクワガタ → なし",
        "自分.リザーブ: 10 → 7", // コスト4から緑シンボル1つ（タケヤンマ）で軽減→3支払い
        "自分.トラッシュのコア: 0 → 3",
        "自分.タケヤンマ.BP: 2000 → 4000", // 合体時BP+2000
        "自分.タケヤンマ.疲労: false → true",
        "自分.タケヤンマ.コア: 1 → 2", // バトル終了時：ボイドから自分のスピリット（場にいるのはこれ1体）へ
        "自分.飛甲虫ニトウクワガタ.場所: なし → 合体",
        "自分.飛甲虫ニトウクワガタ.疲労: なし → false",
        "自分.飛甲虫ニトウクワガタ.コア: なし → 0",
        "自分.飛甲虫ニトウクワガタ.Lv: なし → 1",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面（合体時）：スピリット状態ではバトル終了時のコアは置かれない
scenario({
    name: "kuwaga-spirit-state-no-core",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: YANYANMA, cores: 1 }], hand: [KUWAGA] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // スピリット状態で召喚
        // 召喚した直後の個体は t.id で解決できない（開始盤面にいない）ので state から探す
        const kuwaga = t.state.players[t.me].field.spirits.find((x) => x.cardId === KUWAGA)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: kuwaga?.instanceId ?? t.id("タケヤンマ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 飛甲虫ニトウクワガタ → なし",
        "自分.リザーブ: 10 → 6", // コスト4から軽減1→3支払い＋維持コア1
        "自分.トラッシュのコア: 0 → 3",
        "自分.飛甲虫ニトウクワガタ.場所: なし → フィールド",
        "自分.飛甲虫ニトウクワガタ.疲労: なし → true",
        "自分.飛甲虫ニトウクワガタ.コア: なし → 1",
        "自分.飛甲虫ニトウクワガタ.Lv: なし → 1",
        "自分.飛甲虫ニトウクワガタ.BP: なし → 2000",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part759）")

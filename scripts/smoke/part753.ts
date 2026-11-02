// smoke パート753（STARTER white 8枚：BS01-141／BSC05-007／BSC05-009／BSC05-015／BSC05-019／EX011／SD11-001／SD11-003）
// 期待値役が効果文と属性だけから書いた実装前テスト（docs/design/STARTER_PLAN.md §2・SEMANTICS_AUDIT §3.9/3.20/3.25・BS19_PLAN §2）。
// SD11-001 Lv2「色とシンボルは緑としても扱う」は、SD11-003 の【連鎖】の場面（rensa-green / rensa-no-green）で観察する。
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

// ---------- 対象8枚 ----------
const CLOAK = "BS01-141" // インビジブルクローク（白マジック・コスト3・軽減白白）
const IGUA = "BSC05-007" // イグア・バギー（白スピリット・機獣/星魂・コスト1）
const SWORDLANDER = "BSC05-009" // 竜機合神ソードランダー（白スピリット・機獣/武装・コスト5）
const MEGABISON = "BSC05-015" // 獣装甲メガバイソン（白ブレイヴ・機獣・コスト5・合体条件コスト5以上）
const FORTRESS = "BSC05-019" // 絶望壁の要塞（白ネクサス・コスト4）
const SHIELDDRAGON = "EX011" // 銀装合体シールド・ドラゴン（白ブレイヴ・甲竜・コスト4・合体条件コスト4以上）
const SHRIKE = "SD11-001" // シュライクン（白スピリット・機獣/爪鳥・コスト1）
const CARIBOU = "SD11-003" // ダーク・カリブー（白スピリット・機獣・コスト2）

// ---------- 脇役（既存の弾から。機械確認で名前・色・系統を確かめる） ----------
const VANILLA = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・BP1000・バニラ）
const JANGARRY = "BS10-031" // ジャンガリー（白・機獣・コスト1・BP2000・バニラ）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・機人/武装・コスト4・BP3000・バニラ）
const AZARA = "BS19-041" // アザラ・バーグ（白・巨獣・コスト5・BP4000・バニラ）
const DUALDO = "BS10-007" // デュアルド（赤・古竜/異合・コスト5・BP5000・バニラ）
const AARDERFLAME = "BS17-073" // アーダーフレイム（赤マジック・コスト4・フラッシュ：BP4000以下の相手のスピリット1体を破壊）
const DREAMRIBBON = "BS01-146" // ドリームリボン（白マジック・コスト4・フラッシュ：相手のスピリット1体を手札に戻す）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    assert(c(CLOAK).name === "インビジブルクローク" && c(CLOAK).type === "magic" && c(CLOAK).colors.join() === "white" && c(CLOAK).cost === 3 && c(CLOAK).effect.includes("ブロックされない"), "CLOAKは白マジックコスト3・ブロックされない")
    assert(c(IGUA).name === "イグア・バギー" && c(IGUA).type === "spirit" && c(IGUA).colors.join() === "white" && c(IGUA).family.join() === "機獣,星魂" && c(IGUA).cost === 1 && c(IGUA).effect.includes("赤としても扱う"), "IGUAは白スピリット機獣/星魂コスト1・赤としても扱う")
    assert(c(SWORDLANDER).name === "竜機合神ソードランダー" && c(SWORDLANDER).type === "spirit" && c(SWORDLANDER).colors.join() === "white" && c(SWORDLANDER).family.join() === "機獣,武装" && c(SWORDLANDER).cost === 5 && c(SWORDLANDER).effect.includes("疲労状態でブロックできる"), "SWORDLANDERは白スピリット機獣/武装コスト5")
    assert(c(MEGABISON).name === "獣装甲メガバイソン" && c(MEGABISON).type === "brave" && c(MEGABISON).colors.join() === "white" && c(MEGABISON).family.join() === "機獣" && c(MEGABISON).cost === 5 && c(MEGABISON).effect.includes("合体条件：コスト5以上") && c(MEGABISON).effect.includes("【装甲：赤/緑/白】"), "MEGABISONは白ブレイヴ機獣コスト5・装甲赤/緑/白")
    assert(c(FORTRESS).name === "絶望壁の要塞" && c(FORTRESS).type === "nexus" && c(FORTRESS).colors.join() === "white" && c(FORTRESS).cost === 4 && c(FORTRESS).effect.includes("1までしか減らない"), "FORTRESSは白ネクサスコスト4")
    assert(c(SHIELDDRAGON).name === "銀装合体シールド・ドラゴン" && c(SHIELDDRAGON).type === "brave" && c(SHIELDDRAGON).colors.join() === "white" && c(SHIELDDRAGON).family.join() === "甲竜" && c(SHIELDDRAGON).cost === 4 && c(SHIELDDRAGON).effect.includes("合体条件：コスト4以上") && c(SHIELDDRAGON).effect.includes("【装甲：白】"), "SHIELDDRAGONは白ブレイヴ甲竜コスト4・装甲白")
    assert(c(SHRIKE).name === "シュライクン" && c(SHRIKE).type === "spirit" && c(SHRIKE).colors.join() === "white" && c(SHRIKE).family.join() === "機獣,爪鳥" && c(SHRIKE).cost === 1 && c(SHRIKE).effect.includes("【重装甲：赤】") && c(SHRIKE).effect.includes("緑としても扱う"), "SHRIKEは白スピリット機獣/爪鳥コスト1・重装甲赤・緑としても扱う")
    assert(c(CARIBOU).name === "ダーク・カリブー" && c(CARIBOU).type === "spirit" && c(CARIBOU).colors.join() === "white" && c(CARIBOU).family.join() === "機獣" && c(CARIBOU).cost === 2 && c(CARIBOU).effect.includes("BP+3000") && c(CARIBOU).effect.includes("【連鎖：条件《緑シンボル》】"), "CARIBOUは白スピリット機獣コスト2・ブロック時BP+3000・緑シンボル連鎖")
    assert(c(VANILLA).name === "ロクケラトプス" && c(VANILLA).colors.join() === "red" && c(VANILLA).family.join() === "地竜" && c(VANILLA).cost === 1 && c(VANILLA).effect === "", "VANILLAは赤地竜コスト1バニラ（BP1000）")
    assert(c(JANGARRY).name === "ジャンガリー" && c(JANGARRY).colors.join() === "white" && c(JANGARRY).family.join() === "機獣" && c(JANGARRY).cost === 1 && c(JANGARRY).effect === "" && c(JANGARRY).levels?.[0]?.bp === 2000, "JANGARRYは白機獣コスト1バニラ・BP2000")
    assert(c(BELL).name === "デュアルキャノン・ベル" && c(BELL).colors.join() === "white" && c(BELL).family.join() === "機人,武装" && c(BELL).cost === 4 && c(BELL).effect === "" && c(BELL).levels?.[0]?.bp === 3000, "BELLは白機人/武装コスト4バニラ・BP3000")
    assert(c(AZARA).name === "アザラ・バーグ" && c(AZARA).colors.join() === "white" && c(AZARA).family.join() === "巨獣" && c(AZARA).cost === 5 && c(AZARA).effect === "" && c(AZARA).levels?.[0]?.bp === 4000, "AZARAは白巨獣コスト5バニラ・BP4000")
    assert(c(DUALDO).name === "デュアルド" && c(DUALDO).colors.join() === "red" && c(DUALDO).family.join() === "古竜,異合" && c(DUALDO).cost === 5 && c(DUALDO).effect === "" && c(DUALDO).levels?.[0]?.bp === 5000, "DUALDOは赤古竜/異合コスト5バニラ・BP5000")
    assert(c(AARDERFLAME).name === "アーダーフレイム" && c(AARDERFLAME).type === "magic" && c(AARDERFLAME).colors.join() === "red" && c(AARDERFLAME).cost === 4 && c(AARDERFLAME).effect.includes("BP4000以下の相手のスピリット1体を破壊する"), "AARDERFLAMEは赤マジックコスト4・BP4000以下破壊")
    assert(c(DREAMRIBBON).name === "ドリームリボン" && c(DREAMRIBBON).type === "magic" && c(DREAMRIBBON).colors.join() === "white" && c(DREAMRIBBON).cost === 4 && c(DREAMRIBBON).effect.includes("相手のスピリット1体を手札に戻す"), "DREAMRIBBONは白マジックコスト4・バウンス")
}

// 選択待ちを最後まで答える（part717 と同じ形）。prefer に挙げたラベルを優先する
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
// BS01-141 インビジブルクローク
// フラッシュ：このターンの間、自分か相手のスピリット1体はブロックされない。
// ============================================================

// 起きる場面：自分のアタックのフラッシュで自分のスピリットに使い、相手はブロックを拒否される
scenario({
    name: "cloak-unblockable",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: BELL, cores: 1 }], hand: [CLOAK] },
        opp: { spirits: [{ card: JANGARRY, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("デュアルキャノン・ベル") })
        t.act("opp", { type: "pass" }) // フラッシュの優先権は守備側が先
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("デュアルキャノン・ベル") })
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("相手.ジャンガリー") })
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: インビジブルクローク → なし",
        "自分.トラッシュ: なし → インビジブルクローク", // 使ったマジックはトラッシュへ
        "自分.リザーブ: 10 → 8", // コスト3から白シンボル1つで軽減→2支払い
        "自分.トラッシュのコア: 0 → 2",
        "自分.デュアルキャノン・ベル.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きない場面：使わなければ相手はブロックできる（BP2000 のブロッカーが BP3000 に破壊される）
scenario({
    name: "cloak-not-cast-blocked",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: BELL, cores: 1 }] },
        opp: { spirits: [{ card: JANGARRY, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("デュアルキャノン・ベル") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.ジャンガリー") })
        t.closeFlash()
    },
    expect: [
        "自分.デュアルキャノン・ベル.疲労: false → true",
        "相手.ジャンガリー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ジャンガリー",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// BSC05-007 イグア・バギー
// Lv1･Lv2：このスピリットの色とシンボルは赤としても扱う。
// ============================================================

// 起きる場面：赤としても扱うシンボルで赤マジックが1つ軽減される（コスト4→3支払い）
scenario({
    name: "igua-red-symbol-reduction",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: IGUA, cores: 1 }], hand: [AARDERFLAME] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("イグア・バギー") })
        t.act("opp", { type: "pass" }) // フラッシュの優先権は守備側が先
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: アーダーフレイム → なし",
        "自分.トラッシュ: なし → アーダーフレイム", // 使ったマジックはトラッシュへ
        "自分.リザーブ: 10 → 7", // コスト4から赤シンボル1つ（イグア・バギー）で軽減→3支払い
        "自分.トラッシュのコア: 0 → 3",
        "自分.イグア・バギー.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12", // 破壊されたコア+1、ライフ減少+1
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面：白シンボルだけ（バニラ）では赤マジックは軽減されない（4支払い）
scenario({
    name: "igua-plain-white-no-reduction",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: JANGARRY, cores: 1 }], hand: [AARDERFLAME] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ジャンガリー") })
        t.act("opp", { type: "pass" }) // フラッシュの優先権は守備側が先
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: アーダーフレイム → なし",
        "自分.トラッシュ: なし → アーダーフレイム", // 使ったマジックはトラッシュへ
        "自分.リザーブ: 10 → 6", // 軽減なし→4支払い
        "自分.トラッシュのコア: 0 → 4",
        "自分.ジャンガリー.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

// ============================================================
// BSC05-009 竜機合神ソードランダー
// Lv1･Lv2･Lv3『相手のアタックステップ』合体していない相手のスピリットすべてを疲労状態でブロックできる。
// Lv3『このスピリットのバトル時』BPを比べ相手のスピリットだけを破壊したとき、コスト合計4まで相手のスピリットを好きなだけ手札に戻す。
// ============================================================

// 節1の起きる場面：疲労状態のまま合体していないアタッカーをブロックして破壊する
scenario({
    name: "swordlander-block-while-rested",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: SWORDLANDER, cores: 1, rested: true }] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("竜機合神ソードランダー") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// 節1の起きない場面：アタッカーが合体スピリットなら疲労状態ではブロックできない（2シンボルでライフ2減り）
scenario({
    name: "swordlander-cannot-block-combined",
    start: {
        turn: "opp", phase: "main",
        me: { spirits: [{ card: SWORDLANDER, cores: 1, rested: true }] },
        opp: { spirits: [{ card: BELL, cores: 1 }], hand: [SHIELDDRAGON] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("相手.デュアルキャノン・ベル") })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルキャノン・ベル") })
        t.closeFlash()
        t.actRejected("me", { type: "block", instanceId: t.id("竜機合神ソードランダー") })
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

// 節2の起きる場面：Lv3 で相手だけを破壊したとき、コスト合計4まで相手のスピリットを手札に戻す（コスト5のデュアルドは戻せない）
scenario({
    name: "swordlander-lv3-bounce-budget",
    start: {
        interactive: true,
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: SWORDLANDER, cores: 5 }] },
        opp: { spirits: [{ card: VANILLA, label: "ロクA", cores: 1 }, { card: VANILLA, label: "ロクB", cores: 1 }, { card: DUALDO, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクA") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("竜機合神ソードランダー") })
        t.closeFlash()
        resolveAll(t, ["相手.ロクB"]) // コスト合計4まで：ロクB（コスト1）を戻し、デュアルド（コスト5）は超過
    },
    expect: [
        "相手.ロクA.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ロクB.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12", // 破壊されたロクAのコア+1、戻したロクBのコア+1
        "自分.竜機合神ソードランダー.疲労: false → true",
    ],
})

// 節2の起きない場面：Lv2 では破壊しても手札に戻さない
scenario({
    name: "swordlander-lv2-no-bounce",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: SWORDLANDER, cores: 2 }] },
        opp: { spirits: [{ card: VANILLA, label: "ロクA", cores: 1 }, { card: VANILLA, label: "ロクB", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクA") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("竜機合神ソードランダー") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクA.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "自分.竜機合神ソードランダー.疲労: false → true",
    ],
})

// ============================================================
// BSC05-015 獣装甲メガバイソン（合体条件：コスト5以上）
// 【合体中】【装甲：赤/緑/白】このスピリットは、相手の赤/緑/白のスピリット/ネクサス/マジックの効果を受けない。
// ============================================================

// 起きる場面：合体中の合体スピリットは相手の白マジックのバウンスの対象に選べない（他にスピリットがいないので詠唱自体が拒否される）
scenario({
    name: "megabison-armor-white",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: AZARA, cores: 1 }], hand: [MEGABISON] },
        opp: { hand: [DREAMRIBBON] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("アザラ・バーグ") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アザラ・バーグ") })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("アザラ・バーグ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 獣装甲メガバイソン → なし",
        "自分.リザーブ: 10 → 6", // コスト5から白シンボル1つで軽減→4支払い
        "自分.トラッシュのコア: 0 → 4",
        "自分.アザラ・バーグ.BP: 4000 → 7000",
        "自分.アザラ・バーグ.疲労: false → true",
        "自分.獣装甲メガバイソン.場所: なし → 合体",
        "自分.獣装甲メガバイソン.疲労: なし → false",
        "自分.獣装甲メガバイソン.コア: なし → 0",
        "自分.獣装甲メガバイソン.Lv: なし → 1",
        "相手.ライフ: 5 → 3", // ホスト（白）＋ブレイヴ（白）の2シンボル
        "相手.リザーブ: 10 → 12",
    ],
})

// 起きない場面：スピリット状態のブレイヴは【合体中】の装甲を持たないので、白マジックで手札に戻る
scenario({
    name: "megabison-spirit-state-bounced",
    start: {
        interactive: true,
        turn: "me", phase: "main",
        me: { spirits: [{ card: AZARA, cores: 1 }, { card: MEGABISON, cores: 1 }] },
        opp: { hand: [DREAMRIBBON] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アザラ・バーグ") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        resolveAll(t, ["獣装甲メガバイソン"])
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.獣装甲メガバイソン.場所: フィールド → なし",
        "自分.手札: なし → 獣装甲メガバイソン",
        "自分.リザーブ: 10 → 11", // 戻されたブレイヴのコアはリザーブへ
        "自分.アザラ・バーグ.疲労: false → true",
        "相手.手札: ドリームリボン → なし",
        "相手.トラッシュ: なし → ドリームリボン", // 使ったマジックはトラッシュへ
        "相手.リザーブ: 10 → 7", // コスト4支払い、ライフ減少+1
        "相手.トラッシュのコア: 0 → 4",
        "相手.ライフ: 5 → 4",
    ],
})

// ============================================================
// BSC05-019 絶望壁の要塞
// Lv1･Lv2『相手のターン』自分のライフは、ターンごとに相手のスピリット1体から1までしか減らない。
// Lv2：自分のスピリット状態のブレイヴすべてに【装甲：赤/青】を与える。
// ============================================================

// 節1の起きる場面：シンボル2つの合体スピリットのアタックでも、このスピリット1体からは1までしか減らない
scenario({
    name: "fortress-life-cap-combined",
    start: {
        turn: "opp", phase: "main",
        me: { nexuses: [{ card: FORTRESS, cores: 0 }] },
        opp: { spirits: [{ card: BELL, cores: 1 }], hand: [SHIELDDRAGON] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("相手.デュアルキャノン・ベル") })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルキャノン・ベル") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.手札: 銀装合体シールド・ドラゴン → なし",
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュのコア: 0 → 3",
        "相手.デュアルキャノン・ベル.BP: 3000 → 6000",
        "相手.デュアルキャノン・ベル.疲労: false → true",
        "相手.銀装合体シールド・ドラゴン.場所: なし → 合体",
        "相手.銀装合体シールド・ドラゴン.疲労: なし → false",
        "相手.銀装合体シールド・ドラゴン.コア: なし → 0",
        "相手.銀装合体シールド・ドラゴン.Lv: なし → 1",
        "自分.ライフ: 5 → 4", // 2シンボルでも、このスピリット1体からは1まで
        "自分.リザーブ: 10 → 11",
    ],
})

// 節1の起きない場面：ネクサスがなければ2シンボルで2減る
scenario({
    name: "fortress-absent-life-2",
    start: {
        turn: "opp", phase: "main",
        opp: { spirits: [{ card: BELL, cores: 1 }], hand: [SHIELDDRAGON] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("相手.デュアルキャノン・ベル") })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルキャノン・ベル") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.手札: 銀装合体シールド・ドラゴン → なし",
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュのコア: 0 → 3",
        "相手.デュアルキャノン・ベル.BP: 3000 → 6000",
        "相手.デュアルキャノン・ベル.疲労: false → true",
        "相手.銀装合体シールド・ドラゴン.場所: なし → 合体",
        "相手.銀装合体シールド・ドラゴン.疲労: なし → false",
        "相手.銀装合体シールド・ドラゴン.コア: なし → 0",
        "相手.銀装合体シールド・ドラゴン.Lv: なし → 1",
        "自分.ライフ: 5 → 3",
        "自分.リザーブ: 10 → 12",
    ],
})

// 節1：上限は発生源（スピリット1体）ごとに数える。別のスピリットのアタックなら、それぞれ1ずつ減る
scenario({
    name: "fortress-cap-per-source",
    start: {
        turn: "opp", phase: "attack",
        me: { nexuses: [{ card: FORTRESS, cores: 0 }] },
        opp: { spirits: [{ card: VANILLA, label: "ロクA", cores: 1 }, { card: VANILLA, label: "ロクB", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクA") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクB") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 5 → 3", // 別々のスピリットからはそれぞれ1ずつ
        "自分.リザーブ: 10 → 12",
        "相手.ロクA.疲労: false → true",
        "相手.ロクB.疲労: false → true",
    ],
})

// 節2の起きる場面：Lv2のネクサスが、スピリット状態のブレイヴに【装甲：赤/青】を与える（赤マジックの破壊の対象に選べない）
scenario({
    name: "fortress-lv2-grant-armor-red",
    start: {
        turn: "opp", phase: "attack",
        me: { nexuses: [{ card: FORTRESS, cores: 2 }], spirits: [{ card: MEGABISON, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }], hand: [AARDERFLAME] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.act("me", { type: "pass" }) // フラッシュの優先権は守備側が先
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("獣装甲メガバイソン") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

// 節2の起きない場面：Lv1では装甲を与えないので、赤マジックで破壊される
scenario({
    name: "fortress-lv1-no-armor",
    start: {
        turn: "opp", phase: "attack",
        me: { nexuses: [{ card: FORTRESS, cores: 0 }], spirits: [{ card: MEGABISON, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }], hand: [AARDERFLAME] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.act("me", { type: "pass" }) // フラッシュの優先権は守備側が先
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("獣装甲メガバイソン") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.獣装甲メガバイソン.場所: フィールド → なし",
        "自分.トラッシュ: なし → 獣装甲メガバイソン",
        "自分.リザーブ: 10 → 12", // 破壊されたブレイヴのコア+1、ライフ減少+1
        "自分.ライフ: 5 → 4",
        "相手.手札: アーダーフレイム → なし",
        "相手.トラッシュ: なし → アーダーフレイム", // 使ったマジックはトラッシュへ
        "相手.リザーブ: 10 → 7", // コスト4から赤シンボル1つで軽減→3支払い
        "相手.トラッシュのコア: 0 → 3",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

// ============================================================
// EX011 銀装合体シールド・ドラゴン（合体条件：コスト4以上）
// 【合体時】【装甲：白】このスピリットは、相手の白のスピリット/ネクサス/マジックの効果を受けない。
// ============================================================

// 起きる場面：合体時の合体スピリットは相手の白マジックのバウンスの対象に選べない
scenario({
    name: "shielddragon-armor-white",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: BELL, cores: 1 }], hand: [SHIELDDRAGON] },
        opp: { hand: [DREAMRIBBON] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("デュアルキャノン・ベル") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("デュアルキャノン・ベル") })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("デュアルキャノン・ベル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 銀装合体シールド・ドラゴン → なし",
        "自分.リザーブ: 10 → 7", // コスト4から白シンボル1つで軽減→3支払い
        "自分.トラッシュのコア: 0 → 3",
        "自分.デュアルキャノン・ベル.BP: 3000 → 6000",
        "自分.デュアルキャノン・ベル.疲労: false → true",
        "自分.銀装合体シールド・ドラゴン.場所: なし → 合体",
        "自分.銀装合体シールド・ドラゴン.疲労: なし → false",
        "自分.銀装合体シールド・ドラゴン.コア: なし → 0",
        "自分.銀装合体シールド・ドラゴン.Lv: なし → 1",
        "相手.ライフ: 5 → 3", // ホスト（白）＋ブレイヴ（白）の2シンボル
        "相手.リザーブ: 10 → 12",
    ],
})

// 起きない場面：スピリット状態のブレイヴは【合体時】の装甲を持たないので、白マジックで手札に戻る
scenario({
    name: "shielddragon-spirit-state-bounced",
    start: {
        interactive: true,
        turn: "me", phase: "main",
        me: { spirits: [{ card: BELL, cores: 1 }, { card: SHIELDDRAGON, cores: 1 }] },
        opp: { hand: [DREAMRIBBON] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("デュアルキャノン・ベル") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        resolveAll(t, ["銀装合体シールド・ドラゴン"])
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.銀装合体シールド・ドラゴン.場所: フィールド → なし",
        "自分.手札: なし → 銀装合体シールド・ドラゴン",
        "自分.リザーブ: 10 → 11", // 戻されたブレイヴのコアはリザーブへ
        "自分.デュアルキャノン・ベル.疲労: false → true",
        "相手.手札: ドリームリボン → なし",
        "相手.トラッシュ: なし → ドリームリボン", // 使ったマジックはトラッシュへ
        "相手.リザーブ: 10 → 7", // コスト4支払い、ライフ減少+1
        "相手.トラッシュのコア: 0 → 4",
        "相手.ライフ: 5 → 4",
    ],
})

// ============================================================
// SD11-001 シュライクン
// Lv1･Lv2【重装甲：赤】このスピリットは、相手の赤のスピリット/ブレイヴ/ネクサス/マジックの効果を受けない。
// Lv2：このスピリットの色とシンボルは緑としても扱う。→ SD11-003 の【連鎖】の場面（rensa-green / rensa-no-green）で観察
// ============================================================

// 【重装甲：赤】の起きる場面：相手の赤マジックの破壊の対象に選べない（他にスピリットがいないので詠唱自体が拒否される）
scenario({
    name: "shrike-heavy-armor-red",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: SHRIKE, cores: 1 }] },
        opp: { hand: [AARDERFLAME] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("シュライクン") })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("シュライクン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.シュライクン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD11-003 ダーク・カリブー
// Lv1･Lv2『このスピリットのブロック時』このスピリットをBP+3000する。（バトルの間だけ。Lv1 のこの場面は節2の起きない場面も兼ねる）
// Lv2『このスピリットのブロック時』ボイドからコア1個をこのスピリットに置く。
// 【連鎖：条件《緑シンボル》】[緑]：相手のスピリット1体を疲労させる。
// ============================================================

// 節1の起きる場面：Lv1（BP1000）が BP3000 のアタッカーを +3000 で破壊する（バトルの後は BP1000 に戻る）
scenario({
    name: "caribou-block-bp-plus",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: CARIBOU, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 2 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ダーク・カリブー") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12", // 破壊されたスピリットのコア2個
        "自分.ダーク・カリブー.疲労: false → true",
    ],
})

// 節2の起きる場面：Lv2 でブロックしたときボイドからコア1個を置く
scenario({
    name: "caribou-lv2-block-core",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: CARIBOU, cores: 2 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ダーク・カリブー") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "自分.ダーク・カリブー.疲労: false → true",
        "自分.ダーク・カリブー.コア: 2 → 3", // ボイドから+1
    ],
})

// 節2：コアを置く場面のソウルコアあり版（ソウルコアはこのスピリットに置かれたまま動かない）
scenario({
    name: "caribou-lv2-block-core-soulcore",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: CARIBOU, cores: 2 }], soulCore: "ダーク・カリブー" },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ダーク・カリブー") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "自分.ダーク・カリブー.疲労: false → true",
        "自分.ダーク・カリブー.コア: 2 → 3",
    ],
})

// 節3（連鎖）の起きる場面：Lv2 のシュライクンが緑シンボルとして数えられ、連鎖で相手のスピリット1体を疲労させる
// （SD11-001 Lv2「色とシンボルは緑としても扱う」の起きる場面を兼ねる）
scenario({
    name: "rensa-green",
    start: {
        interactive: true,
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: CARIBOU, cores: 2 }, { card: SHRIKE, cores: 2 }] },
        opp: { spirits: [{ card: VANILLA, label: "ロクA", cores: 2 }, { card: VANILLA, label: "ロクB", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクA") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ダーク・カリブー") })
        t.closeFlash()
        resolveAll(t, ["相手.ロクB"]) // [緑]：相手のスピリット1体を疲労させる
    },
    expect: [
        "相手.ロクA.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12", // 破壊されたロクAのコア2個
        "相手.ロクB.疲労: false → true", // 連鎖で疲労
        "自分.ダーク・カリブー.疲労: false → true",
        "自分.ダーク・カリブー.コア: 2 → 3", // Lv2 のブロック時：ボイドから+1
    ],
})

// 節3（連鎖）の起きない場面：シュライクンが Lv1 では緑シンボルがないので連鎖しない
// （SD11-001 Lv2 の起きない場面を兼ねる）
scenario({
    name: "rensa-no-green",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: CARIBOU, cores: 2 }, { card: SHRIKE, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, label: "ロクA", cores: 2 }, { card: VANILLA, label: "ロクB", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクA") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ダーク・カリブー") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクA.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "自分.ダーク・カリブー.疲労: false → true",
        "自分.ダーク・カリブー.コア: 2 → 3", // 連鎖しなくても Lv2 のブロック時コアは置く
    ],
})

console.log("すべてのチェックに合格しました 🎉（part753）")

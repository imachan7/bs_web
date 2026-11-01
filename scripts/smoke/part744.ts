// smoke パート744（BS19・場面が無い4つの節：効果による破壊での回収／手札に戻ったときの破壊／入れ替わらない／合体時【強化】のデッキ破棄+1）
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

console.log("=== 前提: カードの機械確認 ===")
{
    // 主役
    assert(getCard("BS19-079").name === "星見の三連塔" && getCard("BS19-079").type === "nexus" && getCard("BS19-079").colors.includes("red"), "BS19-079は赤のネクサス星見の三連塔")
    assert(getCard("BS19-081").name === "剥がれ落ちるウロコ山" && getCard("BS19-081").type === "nexus" && getCard("BS19-081").colors.includes("red") && getCard("BS19-081").colors.includes("purple"), "BS19-081は赤紫のネクサス剥がれ落ちるウロコ山")
    assert(getCard("BS19-099").name === "フレイムフィールド" && getCard("BS19-099").type === "magic" && getCard("BS19-099").colors.includes("red") && getCard("BS19-099").cost === 5, "BS19-099は赤コスト5のマジックフレイムフィールド")
    assert(getCard("BS19-X08").name === "蒼海の大剣メイルシュトロム" && getCard("BS19-X08").type === "brave" && getCard("BS19-X08").colors.includes("blue") && getCard("BS19-X08").cost === 6, "BS19-X08は青コスト6のブレイヴ蒼海の大剣メイルシュトロム")
    // 脇役・相手役
    assert(getCard("BS19-007").name === "スタバ・ドラゴン" && getCard("BS19-007").type === "spirit" && getCard("BS19-007").family.includes("星竜"), "BS19-007は系統：星竜のスタバ・ドラゴン")
    assert(getCard("BS19-006").name === "ケファレダガー" && getCard("BS19-006").type === "spirit" && getCard("BS19-006").effect.includes("【連鎖"), "BS19-006は【連鎖】を持つケファレダガー")
    assert(getCard("BS19-009").name === "流星の剣使いダマスクス" && getCard("BS19-009").type === "spirit" && getCard("BS19-009").cost === 5, "BS19-009はコスト5の流星の剣使いダマスクス")
    assert(getCard("BS13-050").name === "輝竜シャイン・ブレイザー" && getCard("BS13-050").type === "brave" && getCard("BS13-050").colors.includes("red"), "BS13-050は赤のブレイヴ輝竜シャイン・ブレイザー")
    assert(getCard("BS01-146").name === "ドリームリボン" && getCard("BS01-146").type === "magic" && getCard("BS01-146").colors.includes("white") && getCard("BS01-146").cost === 4, "BS01-146は白コスト4のマジックドリームリボン")
    assert(getCard("BS03-144").name === "マジックハンマー" && getCard("BS03-144").type === "magic" && getCard("BS03-144").colors.includes("blue") && getCard("BS03-144").cost === 4, "BS03-144は青コスト4のマジックマジックハンマー")
    assert(getCard("BS17-082").name === "リバーシブルスパーク" && getCard("BS17-082").type === "magic" && getCard("BS17-082").colors.includes("yellow") && getCard("BS17-082").cost === 4, "BS17-082は黄コスト4のマジックリバーシブルスパーク")
    assert(getCard("BS01-001").name === "ゴラドン" && getCard("BS01-001").type === "spirit" && getCard("BS01-001").cost === 0, "BS01-001はコスト0のバニラゴラドン")
    assert(getCard("BS01-002").name === "ロクケラトプス" && getCard("BS01-002").type === "spirit" && getCard("BS01-002").cost === 1, "BS01-002はコスト1のバニラロクケラトプス")
    assert(getCard("BS01-008").name === "メタルバーン" && getCard("BS01-008").type === "spirit" && getCard("BS01-008").cost === 3, "BS01-008はコスト3のバニラメタルバーン")
}

// BS19-079 星見の三連塔 Lv2『自分のアタックステップ』
// 系統：星竜を持つ自分のスピリットが**効果で**相手のスピリットを破壊したとき（スタバ・ドラゴンのアタック時効果）、
// 自分のトラッシュのブレイヴカード1枚を手札に戻す。バトルでの破壊は別 part 済み。
console.log("=== 1. BS19-079 Lv2：星竜の効果破壊でトラッシュのブレイヴを手札に戻す ===")
scenario({
    name: "079Lv2 効果による破壊でブレイヴ回収",
    start: {
        turn: "me",
        phase: "attack",
        me: {
            nexuses: [{ card: "BS19-079", cores: 2 }], // Lv2
            spirits: [{ card: "BS19-007", cores: 2 }], // スタバ・ドラゴン Lv2（BP4000・アタック時効果はLv2から）
            trash: ["BS13-050"],
        },
        opp: {
            spirits: [{ card: "BS01-002", cores: 1 }], // ロクケラトプス BP1000
        },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("スタバ・ドラゴン") })
        // アタック時効果でBP4000以下のロクケラトプスを破壊 → 079 Lv2がトラッシュのブレイヴ1枚を手札に戻す
        t.closeFlash() // ブロッカーがいなくなり直接アタック
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.スタバ・ドラゴン.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12", // 破壊されたロクケラトプスのコア1個＋直接アタックでライフからリザーブへ1個
        "相手.ライフ: 5 → 4",
        "自分.トラッシュ: 輝竜シャイン・ブレイザー → なし",
        "自分.手札: なし → 輝竜シャイン・ブレイザー",
    ],
})

// BS19-081 剥がれ落ちるウロコ山 Lv1･Lv2『自分のアタックステップ』
// 【連鎖】を持つ自分のスピリットが相手の効果によって**手札に戻ったとき**（ドリームリボン）、相手のスピリット1体を破壊する。
console.log("=== 2. BS19-081：【連鎖】持ちが相手効果で手札に戻ったら相手のスピリットを破壊 ===")
scenario({
    name: "081 連鎖持ちが手札に戻って相手スピリット破壊",
    start: {
        turn: "me",
        phase: "attack",
        me: {
            nexuses: [{ card: "BS19-081", cores: 1 }],
            spirits: [
                { card: "BS19-006", cores: 1 }, // ケファレダガー（【連鎖】持ち）
                { card: "BS01-001", label: "アタッカー", cores: 1 }, // ゴラドン
            ],
        },
        opp: {
            hand: ["BS01-146"], // ドリームリボン（フラッシュ：相手のスピリット1体を手札に戻す）
            spirits: [{ card: "BS01-002", cores: 1 }],
        },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        // 相手がフラッシュでドリームリボン：ケファレダガーを手札に戻す → 081が相手のスピリット1体を破壊
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ケファレダガー") })
        t.closeFlash() // ブロッカーがいなくなり直接アタック
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.アタッカー.疲労: false → true",
        "自分.ケファレダガー.場所: フィールド → なし",
        "自分.手札: なし → ケファレダガー",
        "自分.リザーブ: 10 → 11", // 手札に戻ったケファレダガーのコア1個
        "相手.手札: ドリームリボン → なし",
        "相手.トラッシュ: なし → ドリームリボン、ロクケラトプス",
        "相手.トラッシュのコア: 0 → 4", // ドリームリボンのコスト4
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.リザーブ: 10 → 8", // 破壊されたロクケラトプスのコア1個＋直接アタックでライフからリザーブへ1個
        "相手.ライフ: 5 → 4",
    ],
})

// BS19-099 フレイムフィールド「お互いのスピリットすべては、お互いの効果で、…入れ替わらない」
// 「入れ替わらない」はバトルしているスピリットを入れ替える効果（BS03-138 テレポートチェンジ）に効く。
// 相手はブロッカーを疲労状態のリザードマン（BP4000）と入れ替えようとするが、フレイムフィールドで
// 入れ替わらない → ブロッカーはロクケラトプス（BP1000）のまま破壊される。
console.log("=== 3. BS19-099：場にある間、テレポートチェンジでバトル中のスピリットが入れ替わらない ===")
scenario({
    name: "099 フレイムフィールドでBP入れ替え不発",
    start: {
        turn: "me",
        phase: "attack",
        me: {
            nexuses: [{ card: "BS19-099" }], // 場に残るマジック（効果を発揮し続ける）
            spirits: [{ card: "BS01-008", cores: 1 }], // メタルバーン BP3000
        },
        opp: {
            hand: ["BS03-138"], // テレポートチェンジ（フラッシュ：バトルしている自分のスピリット1体を、疲労状態の自分のスピリット1体と入れ替える）
            spirits: [
                { card: "BS01-002", label: "ブロッカー", cores: 1 }, // ロクケラトプス BP1000
                { card: "BS01-018", cores: 1, rested: true }, // リザードマン BP4000（疲労状態・入れ替え先）
            ],
        },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("メタルバーン") })
        t.closeFlash() // 相手はこのフラッシュでブロックせず
        t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
        // 相手がテレポートチェンジを使うが、フレイムフィールドで入れ替わらない → ブロッカーはBP1000のまま
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
    },
    expect: [
        "自分.メタルバーン.疲労: false → true",
        "相手.ブロッカー.場所: フィールド → なし",
        "相手.トラッシュ: なし → テレポートチェンジ、ロクケラトプス",
        "相手.トラッシュのコア: 0 → 4", // テレポートチェンジのコスト4
        "相手.手札: テレポートチェンジ → なし",
        "相手.リザーブ: 10 → 7", // テレポートチェンジのコスト4を支払い、破壊されたロクケラトプスのコア1個が戻る
    ],
})

// BS19-X08 蒼海の大剣メイルシュトロム【合体時】【強化】
// 合体中の自分の「相手へのデッキ破棄効果」の枚数を+1枚する。マジックハンマー（5枚破棄）が6枚破棄になる。
console.log("=== 4. BS19-X08 合体時【強化】：デッキ破棄が5枚→6枚 ===")
scenario({
    name: "X08合体時強化でデッキ破棄+1",
    start: {
        turn: "me",
        phase: "main",
        me: {
            spirits: [
                { card: "BS19-009", label: "ダマスクス", cores: 1 }, // コスト5（合体条件：コスト5以上）
                { card: "BS19-X08", cores: 1 }, // スピリット状態のブレイヴ
            ],
            hand: ["BS03-144"], // マジックハンマー（メイン：相手のデッキを上から5枚破棄）
        },
    },
    steps: (t) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("蒼海の大剣メイルシュトロム"), hostInstanceId: t.id("ダマスクス") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" }) // 5枚+1枚=6枚破棄
    },
    expect: [
        "自分.蒼海の大剣メイルシュトロム.場所: フィールド → 合体",
        "自分.蒼海の大剣メイルシュトロム.コア: 1 → 0", // 合体でブレイヴのコアはリザーブへ戻る（BRAVE.md §6.4）
        "自分.蒼海の大剣メイルシュトロム.BP: 5000 → なし", // 合体の列ではBP行が出ない
        "自分.ダマスクス.BP: 4000 → 9000", // 合体中はホストとブレイヴのBP合計
        "自分.トラッシュのコア: 0 → 3", // マジックハンマーのコスト3
        "自分.手札: マジックハンマー → なし",
        "自分.トラッシュ: なし → マジックハンマー",
        "相手.デッキ枚数: 40 → 34", // 5枚+【強化】の1枚
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "自分.ダマスクス.コア: 1 → 2",
        "自分.リザーブ: 10 → 7",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part744）")

// smoke パート720（プロモ 赤の組21枚：P002 P013 P017 P020 P023 P034 P038 P044 P046 P048 P059 P067 P080 P081 P082 P083 PX01 PX07 PX12 PX14 PX18。
// 期待値役が効果文と PROMO_PLAN §2 の解釈だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const ROKU = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・BP1000）
const AIBARN = "BS01-005" // アイバーン（赤・翼竜・コスト2・Lv1 BP2000）
const SALA = "BS03-001" // 火精サラマンダート（赤・空牙・コスト1・Lv1 BP2000）
const REIN = "BS07-001" // レイニードル（赤・星竜・コスト1・BP1000）
const AMMO = "BS13-025" // アンモナイツ（白・機人・コスト1・BP1000）
const METAL = "BS01-008" // メタルバーン（赤・機竜・コスト3・Lv1 BP3000）
const ARNOLD = "BS03-089" // ディープ・アーノルド（青・異合・コスト4・Lv1 BP4000）
const WINGAL = "BS02-046" // ウィンガル（白・武装・コスト6・Lv1 BP5000／Lv2(コア2) BP6000）
const TAIGA = "BS03-099" // 虎拳士タイガ（青・コスト7・Lv1 BP5000／Lv3(コア7) BP10000）
const MJOL = "BS02-039" // 神機ミョルニール（白・コスト2・BP3000・名前に「神」）
const KETTO = "BS02-077" // 決闘台地（赤・ネクサス。相手のスタートステップに覚醒持ちを回復するだけ）
const VULM = "BS08-008" // 黒皇龍ダークヴルム（赤・コスト6・名前に「ヴルム」。自分のアタックステップに星竜を強化するだけ）

const P002 = "P002"
const P013 = "P013"
const P017 = "P017"
const P020 = "P020"
const P023 = "P023"
const P034 = "P034"
const P038 = "P038"
const P039 = "P039"
const P044 = "P044"
const P046 = "P046"
const P048 = "P048"
const P059 = "P059"
const P067 = "P067"
const P080 = "P080"
const P081 = "P081"
const P082 = "P082"
const P083 = "P083"
const PX01 = "PX01"
const PX07 = "PX07"
const PX12 = "PX12"
const PX14 = "PX14"
const PX18 = "PX18"

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    const chk = (id: string, name: string, type: string, color: string, cost: number) =>
        assert(c(id).name === name && c(id).type === type && c(id).colors.join("/") === color && c(id).cost === cost, `${id}は${color}の${type}「${name}」コスト${cost}`)
    chk(P002, "ドラグノ大隊長", "spirit", "red", 5)
    chk(P013, "ボルゲーノドラゴン", "spirit", "red", 5)
    chk(P017, "矛竜ロン・ギニアス", "spirit", "red", 5)
    chk(P020, "大龍皇ジークムンド", "spirit", "red", 6)
    chk(P023, "雷鳴竜リンド・グローム", "spirit", "red", 4)
    chk(P034, "セントロドリラー", "brave", "red", 4)
    chk(P038, "太陽飛竜フレアドラグーン", "spirit", "red", 4)
    chk(P039, "太陽伯爵ルビカンテ", "spirit", "purple", 5)
    chk(P044, "星鎧龍ジーク・ブレイヴ", "brave", "red", 4)
    chk(P046, "暴竜ティラノ・バッキー", "spirit", "red", 4)
    chk(P048, "武威煌炎刃", "magic", "red", 3)
    chk(P059, "最強竜ゴールド・ジェイクス", "spirit", "red", 5)
    chk(P067, "グランドキャニオン・ドラゴン", "spirit", "red", 7)
    chk(P080, "龍帝", "magic", "red/blue", 4)
    chk(P081, "爆神", "magic", "red/green", 6)
    chk(P082, "戦嵐", "magic", "red/white", 8)
    chk(P083, "超星", "magic", "red/green", 9)
    chk(PX01, "獅龍王レオン・ハウル", "spirit", "red", 8)
    chk(PX07, "凶龍爆神ガンディノス", "spirit", "red", 7)
    chk(PX12, "伝説龍エンシェントヴルム", "spirit", "red/white", 8)
    chk(PX14, "戦皇ゴッドスレイヤー・ドラゴン", "spirit", "red", 7)
    chk(PX18, "時統べる幻龍神アマテラス", "spirit", "red", 8)
    chk(ROKU, "ロクケラトプス", "spirit", "red", 1)
    chk(AIBARN, "アイバーン", "spirit", "red", 2)
    chk(SALA, "火精サラマンダート", "spirit", "red", 1)
    chk(REIN, "レイニードル", "spirit", "red", 1)
    chk(AMMO, "アンモナイツ", "spirit", "white", 1)
    chk(METAL, "メタルバーン", "spirit", "red", 3)
    chk(ARNOLD, "ディープ・アーノルド", "spirit", "blue", 4)
    chk(WINGAL, "ウィンガル", "spirit", "white", 6)
    chk(TAIGA, "虎拳士タイガ", "spirit", "blue", 7)
    chk(MJOL, "神機ミョルニール", "spirit", "white", 2)
    chk(KETTO, "決闘台地", "nexus", "red", 4)
    chk(VULM, "黒皇龍ダークヴルム", "spirit", "red", 6)
    const fam = (id: string, f: string) => assert(c(id).family.includes(f), `${id}は系統「${f}」`)
    fam(ROKU, "地竜"); fam(AIBARN, "翼竜"); fam(SALA, "空牙"); fam(REIN, "星竜"); fam(AMMO, "機人"); fam(METAL, "機竜")
    fam(P002, "竜人"); fam(P013, "地竜"); fam(P017, "空牙"); fam(P023, "翼竜"); fam(P046, "地竜"); fam(P038, "星竜")
    assert(c(METAL).family.includes("機人") === false && c(ARNOLD).family.join() === "異合", "METALは機人でない／ARNOLDは異合")
    assert(c(P002).levels[1]!.cores === 3 && c(P002).levels[1]!.bp === 6000 && c(P002).levels[0]!.bp === 4000, "P002はLv1 4000／Lv2(コア3) 6000")
    assert(c(P017).levels[2]!.cores === 6 && c(P017).levels[2]!.bp === 7000 && c(P017).levels[1]!.cores === 3, "P017はLv3(コア6) 7000／Lv2(コア3)")
    assert(c(P059).levels[1]!.cores === 3 && c(P059).levels[1]!.bp === 7000 && c(P059).levels[0]!.bp === 4000, "P059はLv1 4000／Lv2(コア3) 7000")
    assert(c(P067).levels[0]!.bp === 5000, "P067はLv1 BP5000")
    assert(c(PX01).levels[1]!.cores === 3 && c(PX01).levels[1]!.bp === 7000 && c(PX01).levels[0]!.bp === 5000, "PX01はLv1 5000／Lv2(コア3) 7000")
    assert(c(PX07).levels[0]!.bp === 6000, "PX07はLv1 BP6000")
    assert(c(PX12).levels[1]!.cores === 3 && c(PX12).levels[1]!.bp === 13000 && c(PX12).levels[2]!.cores === 5 && c(PX12).levels[2]!.bp === 18000, "PX12はLv2(コア3) 13000／Lv3(コア5) 18000")
    assert(c(PX14).levels[0]!.bp === 6000 && c(PX14).levels[1]!.cores === 3 && c(PX14).levels[1]!.bp === 10000, "PX14はLv1 6000／Lv2(コア3) 10000")
    assert(c(PX18).levels[2]!.cores === 5 && c(PX18).levels[2]!.bp === 15000 && c(PX18).levels[0]!.bp === 8000, "PX18はLv1 8000／Lv3(コア5) 15000")
    assert(c(P038).levels[1]!.cores === 3 && c(P038).levels[1]!.bp === 4000 && c(P038).levels[0]!.bp === 3000, "P038はLv1 3000／Lv2(コア3) 4000")
    assert(c(P034).levels[0]!.bp === 3000 && c(P034).braveLevels?.[0]?.bp === 3000, "P034はBP3000でホストに+3000")
    assert(c(P044).levels[0]!.bp === 3000 && c(P044).braveLevels?.[0]?.bp === 5000, "P044はBP3000でホストに+5000")
    assert(c(ARNOLD).levels[0]!.bp === 4000 && c(WINGAL).levels[1]!.cores === 2 && c(WINGAL).levels[1]!.bp === 6000, "ARNOLD 4000／WINGAL Lv2(コア2) 6000")
    assert(c(TAIGA).levels[2]!.cores === 7 && c(TAIGA).levels[2]!.bp === 10000, "TAIGAはLv3(コア7)でBP10000")
    assert(c(P080).flash === true && c(P081).flash === true && c(P082).flash === true && c(P083).flash === true && c(P048).flash === true, "マジックはフラッシュ")
    for (const id of [ROKU, AIBARN, SALA, REIN, AMMO, METAL, ARNOLD, WINGAL, TAIGA, MJOL]) assert(c(id).effect === "", `${id}は効果文なしのバニラ`)
}

// ==== 道具 ====
const YES = ["はい", "発動", "支払う", "使う", "回復", "する"]
const NO = ["いいえ", "しない", "支払わない", "断る", "使わない"]
// 選択待ちが残っているあいだ答える。対象は prefer の先頭から候補にある物を選ぶ。確認は accept で はい／いいえ
function resolveAll(t: ScenarioCtx, prefer: string[] = [], wantAccept = true): void {
    for (let i = 0; i < 30 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side: Side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "target") {
            const ids = prefer.flatMap((l) => {
                try {
                    return [t.id(l)]
                } catch {
                    return []
                }
            })
            t.act(side, { type: "resolveChoice", instanceId: ids.find((id) => pc.candidates.includes(id)) ?? pc.candidates[0]! })
        } else if (pc.kind === "option") {
            const opts = pc.options!
            const accept = wantAccept || !pc.prompt.includes("支払") // バースト発動の確認などは常に「発動する」。断るのは払う確認だけ
            const pick = opts.find((o) => prefer.some((p) => o.includes(p))) ?? opts.find((o) => (accept ? YES : NO).some((w) => o.includes(w)))
            // 「発動する」しか選択肢が無い確認は、断るときオプション無しで答える
            if (pick === undefined && !accept) t.act(side, { type: "resolveChoice" })
            else t.act(side, { type: "resolveChoice", option: pick ?? opts[0]! })
        } else {
            const zone = pc.cardZone === "trash" ? t.state.players[pc.cardOwner!].trashCards : t.state.players[pc.cardOwner!].hand
            const idx = pc.cardIndices!.find((i) => prefer.includes(getCard(zone[i]!).name))
            t.act(side, { type: "resolveChoice", cardIndex: idx ?? pc.cardIndices![0]! })
        }
    }
}
function settle(t: ScenarioCtx, attacker: Side): void {
    const defender: Side = attacker === "me" ? "opp" : "me"
    t.act(defender, { type: "pass" })
    t.act(attacker, { type: "pass" })
}
// 攻撃側の宣言（選択があれば答える）。メインステップからはアタックステップへ進む
function attackFromMain(t: ScenarioCtx, who: string, prefer: string[] = []): void {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id(who) })
    resolveAll(t, prefer)
}
// 合体の差分（ブレイヴは場所が「合体」になり、コアと BP をホストへ渡す）
function combineLines(brave: string, braveBp: number, host: string, hostCores: number, hostBpBefore: number, hostBpAfter: number, lv?: [number, number]): string[] {
    return [
        `自分.${brave}.BP: ${braveBp} → なし`,
        `自分.${brave}.コア: 1 → 0`,
        `自分.${brave}.場所: フィールド → 合体`,
        `自分.${host}.コア: ${hostCores} → ${hostCores + 1}`,
        `自分.${host}.BP: ${hostBpBefore} → ${hostBpAfter}`,
        ...(lv ? [`自分.${host}.Lv: ${lv[0]} → ${lv[1]}`] : []),
    ]
}
const combine = (t: ScenarioCtx, brave: string, host: string) => t.act("me", { type: "combineBrave", braveInstanceId: t.id(brave), hostInstanceId: t.id(host) })

// ================= P002 =================
console.log("=== 1. P002 Lv2『自分のアタックステップ』：系統「竜人」/「翼竜」の自分のスピリットすべてBP+1000（自身も竜人。機竜は対象外） ===")
scenario({
    name: "p002-aura",
    start: { me: { spirits: [{ card: P002, cores: 3 }, { card: AIBARN }, { card: METAL }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.ドラグノ大隊長.BP: 6000 → 7000", "自分.アイバーン.BP: 2000 → 3000"],
})
console.log("=== 2. P002：Lv1（コア1）ではBP+1000は働かない ===")
scenario({
    name: "p002-lv1",
    start: { me: { spirits: [{ card: P002 }, { card: AIBARN }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: [],
})

// ================= P013 =================
console.log("=== 3. P013『自分のアタックステップ』：系統「地竜」の自分のスピリットすべてBP+1000（自身も地竜。機竜は対象外・相手の地竜も対象外） ===")
scenario({
    name: "p013-aura",
    start: { me: { spirits: [{ card: P013 }, { card: ROKU }, { card: METAL }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.ボルゲーノドラゴン.BP: 4000 → 5000", "自分.ロクケラトプス.BP: 1000 → 2000"],
})
console.log("=== 4. P013：相手のアタックステップでは働かない ===")
scenario({
    name: "p013-opp-turn",
    start: { turn: "opp", me: { spirits: [{ card: P013 }, { card: ROKU }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => t.act("opp", { type: "nextPhase" }),
    expect: [],
})

// ================= P017 =================
console.log("=== 5. P017『自分のアタックステップ』：系統「空牙」/「神将」の自分のスピリットすべてBP+1000（自身も対象） ===")
scenario({
    name: "p017-aura",
    start: { me: { spirits: [{ card: P017 }, { card: SALA }, { card: ROKU }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.矛竜ロン・ギニアス.BP: 4000 → 5000", "自分.火精サラマンダート.BP: 2000 → 3000"],
})
console.log("=== 6. P017 Lv3【激突】：アタック時、相手は可能ならば必ずブロックする（ライフで受けられず、ブロックする） ===")
scenario({
    name: "p017-gekitotsu",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: P017, cores: 6 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("矛竜ロン・ギニアス") })
        settle(t, "me")
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: ["自分.矛竜ロン・ギニアス.疲労: false → true", "相手.ロクケラトプス.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})
console.log("=== 7. P017：Lv2（コア3）には【激突】が無い。ブロッカーがいてもライフで受けられる ===")
scenario({
    name: "p017-lv2-no-gekitotsu",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: P017, cores: 3 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("矛竜ロン・ギニアス") })
        settle(t, "me")
        t.act("opp", { type: "takeLife" })
        t.closeFlash()
    },
    expect: ["自分.矛竜ロン・ギニアス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ================= P020 =================
console.log("=== 8. P020『自分のアタックステップ』：自分のフィールドに系統「機人」のスピリットがいる間、BP+3000 ===")
scenario({
    name: "p020-with-kijin",
    start: { me: { spirits: [{ card: P020 }, { card: AMMO }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.大龍皇ジークムンド.BP: 4000 → 7000"],
})
console.log("=== 9. P020：機人がいるのが相手側だけなら+3000されない ===")
scenario({
    name: "p020-opp-kijin",
    start: { me: { spirits: [{ card: P020 }, { card: ROKU }] }, opp: { spirits: [{ card: AMMO }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: [],
})

// ================= P023 =================
console.log("=== 10. P023『自分のアタックステップ』：系統「星竜」/「翼竜」の自分のスピリットすべてBP+1000（自身も対象。地竜は対象外） ===")
scenario({
    name: "p023-aura",
    start: { me: { spirits: [{ card: P023 }, { card: AIBARN }, { card: REIN }, { card: ROKU }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.雷鳴竜リンド・グローム.BP: 3000 → 4000", "自分.アイバーン.BP: 2000 → 3000", "自分.レイニードル.BP: 1000 → 2000"],
})
console.log("=== 11. P023：相手のアタックステップでは働かない ===")
scenario({
    name: "p023-opp-turn",
    start: { turn: "opp", me: { spirits: [{ card: P023 }, { card: AIBARN }] } },
    steps: (t) => t.act("opp", { type: "nextPhase" }),
    expect: [],
})

// ================= P034 =================
// ホストはコスト4以上（ARNOLD）。P034 は場に出したブレイヴを合体させる
const P034_COMBINE = combineLines("セントロドリラー", 3000, "ディープ・アーノルド", 1, 4000, 7000)
console.log("=== 12. P034【合体時】合体アタック時：BP4000以下の相手のスピリット1体を破壊する（5000のウィンガルは対象外） ===")
scenario({
    name: "p034-destroy-spirit",
    start: { me: { spirits: [{ card: P034 }, { card: ARNOLD }] }, opp: { spirits: [{ card: ROKU }, { card: WINGAL }] }, interactive: true },
    steps: (t) => {
        combine(t, "セントロドリラー", "ディープ・アーノルド")
        attackFromMain(t, "ディープ・アーノルド", ["相手.ロクケラトプス"])
    },
    expect: [...P034_COMBINE, "自分.ディープ・アーノルド.疲労: false → true", "相手.ロクケラトプス.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})
console.log("=== 13. P034：または、相手のネクサス1つを破壊する（スピリットが対象外の5000のみなら、ネクサスを破壊する） ===")
scenario({
    name: "p034-destroy-nexus",
    start: { me: { spirits: [{ card: P034 }, { card: ARNOLD }] }, opp: { spirits: [{ card: WINGAL }], nexuses: [{ card: KETTO, cores: 0 }] }, interactive: true },
    steps: (t) => {
        combine(t, "セントロドリラー", "ディープ・アーノルド")
        attackFromMain(t, "ディープ・アーノルド", ["決闘台地", "ネクサス"])
    },
    expect: [...P034_COMBINE, "自分.ディープ・アーノルド.疲労: false → true", "相手.決闘台地.場所: ネクサス → なし", "相手.トラッシュ: なし → 決闘台地"],
})
console.log("=== 14. P034：合体していないスピリットのアタックでは働かない ===")
scenario({
    name: "p034-not-combined",
    start: { me: { spirits: [{ card: P034 }, { card: ARNOLD }] }, opp: { spirits: [{ card: ROKU }] }, interactive: true },
    steps: (t) => attackFromMain(t, "ディープ・アーノルド"),
    expect: ["自分.ディープ・アーノルド.疲労: false → true"],
})

// ================= P038 =================
console.log("=== 15. P038『このスピリットのバトル時』：このスピリットと同じBP（3000）の相手のスピリット1体を破壊する ===")
scenario({
    name: "p038-same-bp",
    start: { me: { spirits: [{ card: P038 }] }, opp: { spirits: [{ card: METAL }, { card: ROKU }] } },
    steps: (t) => attackFromMain(t, "太陽飛竜フレアドラグーン"),
    expect: ["自分.太陽飛竜フレアドラグーン.疲労: false → true", "相手.メタルバーン.場所: フィールド → なし", "相手.トラッシュ: なし → メタルバーン", "相手.リザーブ: 10 → 11"],
})
console.log("=== 16. P038：同じBPの相手がいなければ何も破壊しない ===")
scenario({
    name: "p038-no-same-bp",
    start: { me: { spirits: [{ card: P038 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => attackFromMain(t, "太陽飛竜フレアドラグーン"),
    expect: ["自分.太陽飛竜フレアドラグーン.疲労: false → true"],
})
console.log("=== 17. P038：ブロック時にも『バトル時』が働く（立っているメタルバーンを破壊。アタッカーのロクケラトプスはバトルで破壊される） ===")
scenario({
    name: "p038-block-time",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: P038 }] }, opp: { spirits: [{ card: ROKU }, { card: METAL }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        settle(t, "opp")
        t.act("me", { type: "block", instanceId: t.id("太陽飛竜フレアドラグーン") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン、ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "自分.太陽飛竜フレアドラグーン.疲労: false → true",
    ],
})
console.log("=== 18. P038【合体時】Lv2『バトル時』：名前に「太陽」と入っている自分のスピリット1体につきBP+1000（自身とルビカンテで+2000） ===")
scenario({
    name: "p038-combined-lv2",
    start: { me: { spirits: [{ card: P038, cores: 2 }, { card: P039 }, { card: P034 }] } },
    steps: (t) => {
        combine(t, "セントロドリラー", "太陽飛竜フレアドラグーン")
        attackFromMain(t, "太陽飛竜フレアドラグーン")
    },
    expect: [
        ...combineLines("セントロドリラー", 3000, "太陽飛竜フレアドラグーン", 2, 3000, 9000, [1, 2]), // Lv2の4000＋ブレイヴ3000＋アタックで+2000
        "自分.太陽飛竜フレアドラグーン.疲労: false → true",
    ],
})
console.log("=== 19. P038【合体時】：Lv1のままならBP+1000は働かない ===")
scenario({
    name: "p038-combined-lv1",
    start: { me: { spirits: [{ card: P038 }, { card: P039 }, { card: P034 }] } },
    steps: (t) => {
        combine(t, "セントロドリラー", "太陽飛竜フレアドラグーン")
        attackFromMain(t, "太陽飛竜フレアドラグーン")
    },
    expect: [...combineLines("セントロドリラー", 3000, "太陽飛竜フレアドラグーン", 1, 3000, 6000), "自分.太陽飛竜フレアドラグーン.疲労: false → true"],
})

// ================= P044 =================
const P044_COMBINE = combineLines("星鎧龍ジーク・ブレイヴ", 3000, "ディープ・アーノルド", 1, 4000, 9000)
console.log("=== 20. P044【合体時】合体アタック時：BP4000以下の相手のスピリット1体を破壊する ===")
scenario({
    name: "p044-destroy",
    start: { me: { spirits: [{ card: P044 }, { card: ARNOLD }] }, opp: { spirits: [{ card: ROKU }, { card: WINGAL }] }, interactive: true },
    steps: (t) => {
        combine(t, "星鎧龍ジーク・ブレイヴ", "ディープ・アーノルド")
        attackFromMain(t, "ディープ・アーノルド", ["相手.ロクケラトプス"])
    },
    expect: [...P044_COMBINE, "自分.ディープ・アーノルド.疲労: false → true", "相手.ロクケラトプス.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})
console.log("=== 21. P044：BP5000の相手は対象外（破壊されない） ===")
scenario({
    name: "p044-over-4000",
    start: { me: { spirits: [{ card: P044 }, { card: ARNOLD }] }, opp: { spirits: [{ card: WINGAL }] }, interactive: true },
    steps: (t) => {
        combine(t, "星鎧龍ジーク・ブレイヴ", "ディープ・アーノルド")
        attackFromMain(t, "ディープ・アーノルド")
    },
    expect: [...P044_COMBINE, "自分.ディープ・アーノルド.疲労: false → true"],
})
// 【合体時】カード名に「ジークヴルム」が入っているものとして扱う：名前を数えるカードが場面に使えない（プールに無い）ため場面テストなし

// ================= P046 =================
console.log("=== 22. P046『アタック時』：系統「地竜」の自分のスピリット1体につき、BP3000以下の相手のスピリット1体を破壊する（自身とロクケラトプスで2体） ===")
scenario({
    name: "p046-two-chiryu",
    start: { me: { spirits: [{ card: P046 }, { card: ROKU }] }, opp: { spirits: [{ card: METAL }, { card: AIBARN }, { card: ROKU }, { card: WINGAL }] }, interactive: true },
    steps: (t) => attackFromMain(t, "暴竜ティラノ・バッキー", ["相手.メタルバーン", "相手.アイバーン"]),
    expect: [
        "自分.暴竜ティラノ・バッキー.疲労: false → true",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.アイバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → アイバーン、メタルバーン",
        "相手.リザーブ: 10 → 12",
    ],
})
console.log("=== 23. P046：地竜でない味方（機竜）は数えない。自身だけの1体ぶん ===")
scenario({
    name: "p046-one-chiryu",
    start: { me: { spirits: [{ card: P046 }, { card: METAL }] }, opp: { spirits: [{ card: AIBARN }, { card: ROKU }, { card: WINGAL }] }, interactive: true },
    steps: (t) => attackFromMain(t, "暴竜ティラノ・バッキー", ["相手.アイバーン"]),
    expect: [
        "自分.暴竜ティラノ・バッキー.疲労: false → true",
        "相手.アイバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → アイバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

// ================= P048 =================
// 相手のウィンガルがアタックし、自分（スピリットなし）がライフで受けてバースト発動
const P048_OPP = { spirits: [{ card: WINGAL }, { card: METAL }, { card: AIBARN }, { card: ROKU }], nexuses: [{ card: KETTO, cores: 0 }] }
function p048Burst(t: ScenarioCtx, accept: boolean): void {
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("相手.ウィンガル") })
    t.closeFlash()
    t.act("me", { type: "takeLife" })
    resolveAll(t, ["相手.メタルバーン", "相手.アイバーン", "相手.決闘台地"], accept)
}
console.log("=== 24. P048 バースト：BP3000以下の相手のスピリット2体を破壊し、その後コスト3を払ってフラッシュ効果（相手のネクサス1つを破壊） ===")
scenario({
    name: "p048-burst-pay",
    start: { turn: "opp", interactive: true, me: { burst: P048 }, opp: P048_OPP },
    steps: (t) => p048Burst(t, true),
    expect: [
        "相手.ウィンガル.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.バースト: 武威煌炎刃 → なし",
        "自分.トラッシュ: なし → 武威煌炎刃",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 3",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.アイバーン.場所: フィールド → なし",
        "相手.決闘台地.場所: ネクサス → なし",
        "相手.トラッシュ: なし → アイバーン、メタルバーン、決闘台地",
        "相手.リザーブ: 10 → 12",
    ],
})
console.log("=== 25. P048：「ことで」なので、コストを支払わなければ相手のネクサスは破壊されない（スピリット2体は破壊済み） ===")
scenario({
    name: "p048-burst-decline",
    start: { turn: "opp", interactive: true, me: { burst: P048 }, opp: P048_OPP },
    steps: (t) => p048Burst(t, false),
    expect: [
        "相手.ウィンガル.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.バースト: 武威煌炎刃 → なし",
        "自分.トラッシュ: なし → 武威煌炎刃",
        "自分.リザーブ: 10 → 11",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.アイバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → アイバーン、メタルバーン",
        "相手.リザーブ: 10 → 12",
    ],
})
console.log("=== 26. P048 フラッシュ：相手のネクサス1つを破壊する（手札から使う。コスト3） ===")
scenario({
    name: "p048-flash",
    start: { me: { hand: [P048] }, opp: { spirits: [{ card: ROKU }], nexuses: [{ card: KETTO, cores: 0 }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" }),
    expect: [
        "自分.手札: 武威煌炎刃 → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.トラッシュ: なし → 武威煌炎刃",
        "相手.決闘台地.場所: ネクサス → なし",
        "相手.トラッシュ: なし → 決闘台地",
    ],
})

// ================= P059 =================
console.log("=== 27. P059 Lv2『アタック時』：BP+3000し、BP3000以下の相手のスピリット1体を破壊する ===")
scenario({
    name: "p059-lv2",
    start: { me: { spirits: [{ card: P059, cores: 3 }] }, opp: { spirits: [{ card: ROKU }, { card: WINGAL }] } },
    steps: (t) => attackFromMain(t, "最強竜ゴールド・ジェイクス"),
    expect: [
        "自分.最強竜ゴールド・ジェイクス.疲労: false → true",
        "自分.最強竜ゴールド・ジェイクス.BP: 7000 → 10000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 28. P059 Lv1：BP+3000だけで、破壊はLv2から ===")
scenario({
    name: "p059-lv1",
    start: { me: { spirits: [{ card: P059 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => attackFromMain(t, "最強竜ゴールド・ジェイクス"),
    expect: ["自分.最強竜ゴールド・ジェイクス.疲労: false → true", "自分.最強竜ゴールド・ジェイクス.BP: 4000 → 7000"],
})

// ================= P067 =================
console.log("=== 29. P067 Lv1『アタック時』：BP+5000 ===")
scenario({
    name: "p067-lv1",
    start: { me: { spirits: [{ card: P067 }] } },
    steps: (t) => attackFromMain(t, "グランドキャニオン・ドラゴン"),
    expect: ["自分.グランドキャニオン・ドラゴン.疲労: false → true", "自分.グランドキャニオン・ドラゴン.BP: 5000 → 10000"],
})
console.log("=== 30. P067 Lv2（コア3）でも BP+5000 ===")
scenario({
    name: "p067-lv2",
    start: { me: { spirits: [{ card: P067, cores: 3 }] } },
    steps: (t) => attackFromMain(t, "グランドキャニオン・ドラゴン"),
    expect: ["自分.グランドキャニオン・ドラゴン.疲労: false → true", "自分.グランドキャニオン・ドラゴン.BP: 8000 → 13000"],
})

// ================= P080 =================
const PAY4 = ["自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4", "自分.トラッシュ: なし → 龍帝"]
console.log("=== 31. P080 メイン：自分はデッキから1枚ドローする ===")
scenario({
    name: "p080-main",
    start: { me: { hand: [P080] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0 }),
    expect: [...PAY4, "自分.手札: 龍帝 → ロクケラトプス", "自分.デッキ枚数: 40 → 39"],
})
console.log("=== 32. P080 フラッシュ：コスト3以下の相手のスピリット1体を破壊する（コスト4のアーノルドは対象外） ===")
scenario({
    name: "p080-flash",
    start: { me: { hand: [P080] }, opp: { spirits: [{ card: ROKU }, { card: ARNOLD }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" }),
    expect: [...PAY4, "自分.手札: 龍帝 → なし", "相手.ロクケラトプス.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})
console.log("=== 33. P080 フラッシュ：コスト3以下の相手がいなければ（対象がいないので）使えない ===")
scenario({
    name: "p080-flash-none",
    start: { me: { hand: [P080] }, opp: { spirits: [{ card: ARNOLD }] } },
    steps: (t) => t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash" }),
    expect: [],
})

// ================= P081 =================
const PAY6 = ["自分.トラッシュのコア: 0 → 6", "自分.トラッシュ: なし → 爆神"]
console.log("=== 34. P081 メイン：このターン、自分のスピリットすべてに【激突】を与える（すでにいるスピリット） ===")
scenario({
    name: "p081-existing",
    start: { me: { hand: [P081], spirits: [{ card: AMMO }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アンモナイツ") })
        settle(t, "me")
        t.actRejected("opp", { type: "takeLife" })
    },
    expect: [...PAY6, "自分.リザーブ: 10 → 4", "自分.手札: 爆神 → なし", "自分.アンモナイツ.疲労: false → true"],
})
console.log("=== 35. P081：後から召喚したスピリットにも【激突】が働く ===")
scenario({
    name: "p081-later-summon",
    start: { me: { hand: [P081, AMMO], spirits: [{ card: AMMO, label: "既存" }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "nextPhase" })
        const later = t.state.players[t.me].field.spirits.find((x) => x.instanceId !== t.id("既存"))! // 召喚したばかりの個体
        t.act("me", { type: "attack", instanceId: later.instanceId })
        settle(t, "me")
        t.actRejected("opp", { type: "takeLife" })
    },
    expect: [
        "自分.トラッシュのコア: 0 → 6", // アンモナイツ（コスト1）は既存の白シンボル1つで軽減されて0
        "自分.トラッシュ: なし → 爆神",
        "自分.リザーブ: 10 → 3",
        "自分.手札: アンモナイツ、爆神 → なし",
        "自分.アンモナイツ.場所: なし → フィールド",
        "自分.アンモナイツ.疲労: なし → true",
        "自分.アンモナイツ.コア: なし → 1",
        "自分.アンモナイツ.Lv: なし → 1",
        "自分.アンモナイツ.BP: なし → 1000",
    ],
})
console.log("=== 36. P081 フラッシュ：系統1つを指定し、その系統の自分のスピリット2体を回復させる（3体のうち2体。別系統は回復しない） ===")
scenario({
    name: "p081-flash",
    start: {
        interactive: true,
        me: {
            hand: [P081],
            spirits: [
                { card: AMMO, label: "機A", rested: true },
                { card: AMMO, label: "機B", rested: true },
                { card: AMMO, label: "機C", rested: true },
                { card: ARNOLD, rested: true },
            ],
        },
    },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        resolveAll(t, ["機人", "自分.機A", "自分.機B"])
    },
    expect: [...PAY6, "自分.リザーブ: 10 → 4", "自分.手札: 爆神 → なし", "自分.機A.疲労: true → false", "自分.機B.疲労: true → false"],
})

// ================= P082 =================
const PAY8 = ["自分.リザーブ: 10 → 2", "自分.トラッシュのコア: 0 → 8", "自分.トラッシュ: なし → 戦嵐", "自分.手札: 戦嵐 → なし"]
console.log("=== 37. P082 メイン：相手のスピリット2体を手札に戻す（3体から選んだ2体。コアはリザーブへ） ===")
scenario({
    name: "p082-main",
    start: { interactive: true, me: { hand: [P082] }, opp: { spirits: [{ card: ROKU }, { card: METAL }, { card: AIBARN }] } },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 })
        resolveAll(t, ["相手.メタルバーン", "相手.アイバーン"])
    },
    expect: [
        ...PAY8,
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.アイバーン.場所: フィールド → なし",
        "相手.手札: なし → アイバーン、メタルバーン",
        "相手.リザーブ: 10 → 12",
    ],
})
console.log("=== 38. P082 フラッシュ：相手のネクサスすべてを破壊する（2つとも） ===")
scenario({
    name: "p082-flash",
    start: {
        me: { hand: [P082] },
        opp: { spirits: [{ card: ROKU }], nexuses: [{ card: KETTO, label: "決闘A", cores: 0 }, { card: KETTO, label: "決闘B", cores: 0 }] },
    },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" }),
    expect: [...PAY8, "相手.決闘A.場所: ネクサス → なし", "相手.決闘B.場所: ネクサス → なし", "相手.トラッシュ: なし → 決闘台地、決闘台地"],
})

// ================= P083 =================
const PAY9 = ["自分.リザーブ: 10 → 1", "自分.トラッシュのコア: 0 → 9", "自分.トラッシュ: なし → 超星", "自分.手札: 超星 → なし"]
console.log("=== 39. P083 メイン：BP10000以下の相手のスピリット1体を破壊する（ちょうど10000のタイガも対象） ===")
scenario({
    name: "p083-main",
    start: { interactive: true, me: { hand: [P083] }, opp: { spirits: [{ card: TAIGA, cores: 7 }, { card: ROKU }] } },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 })
        resolveAll(t, ["相手.虎拳士タイガ"])
    },
    expect: [...PAY9, "相手.虎拳士タイガ.場所: フィールド → なし", "相手.トラッシュ: なし → 虎拳士タイガ", "相手.リザーブ: 10 → 17"],
})
console.log("=== 40. P083 フラッシュ：相手は、相手のスピリット3体を疲労させる（4体から相手自身が3体を選ぶ） ===")
scenario({
    name: "p083-flash",
    start: { interactive: true, me: { hand: [P083] }, opp: { spirits: [{ card: METAL }, { card: AIBARN }, { card: ROKU }, { card: ARNOLD }] } },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        const pc = t.state.pendingChoice
        assert(pc !== null && pc.pid === t.opp, "選ぶのは相手")
        resolveAll(t, ["相手.メタルバーン", "相手.アイバーン", "相手.ロクケラトプス"])
    },
    expect: [...PAY9, "相手.メタルバーン.疲労: false → true", "相手.アイバーン.疲労: false → true", "相手.ロクケラトプス.疲労: false → true"],
})

// ================= PX01 =================
console.log("=== 41. PX01 召喚時：BP3000以下のスピリットすべて（お互いの）を破壊し、破壊した1体につき自分がドロー（3体で3枚。5000のウィンガルは残る） ===")
scenario({
    name: "px01-summon",
    start: { me: { hand: [PX01], spirits: [{ card: AMMO }] }, opp: { spirits: [{ card: ROKU }, { card: METAL }, { card: WINGAL }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 獅龍王レオン・ハウル → ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "自分.デッキ枚数: 40 → 37",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 8",
        "自分.トラッシュ: なし → アンモナイツ",
        "自分.アンモナイツ.場所: フィールド → なし",
        "自分.獅龍王レオン・ハウル.場所: なし → フィールド",
        "自分.獅龍王レオン・ハウル.疲労: なし → false",
        "自分.獅龍王レオン・ハウル.コア: なし → 1",
        "自分.獅龍王レオン・ハウル.Lv: なし → 1",
        "自分.獅龍王レオン・ハウル.BP: なし → 5000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン、ロクケラトプス",
        "相手.リザーブ: 10 → 12",
    ],
})
console.log("=== 42. PX01 Lv2『アタック時』：BP+4000 ===")
scenario({
    name: "px01-lv2-attack",
    start: { me: { spirits: [{ card: PX01, cores: 3 }] } },
    steps: (t) => attackFromMain(t, "獅龍王レオン・ハウル"),
    expect: ["自分.獅龍王レオン・ハウル.疲労: false → true", "自分.獅龍王レオン・ハウル.BP: 7000 → 11000"],
})
console.log("=== 43. PX01：Lv1（コア1）のアタックでは BP は上がらない ===")
scenario({
    name: "px01-lv1-attack",
    start: { me: { spirits: [{ card: PX01 }] } },
    steps: (t) => attackFromMain(t, "獅龍王レオン・ハウル"),
    expect: ["自分.獅龍王レオン・ハウル.疲労: false → true"],
})

// ================= PX07 =================
const PX07_NEXUS = [{ card: KETTO, label: "決闘A", cores: 0 }, { card: KETTO, label: "決闘B", cores: 0 }, { card: KETTO, label: "決闘C", cores: 0 }]
function px07Attack(t: ScenarioCtx, expectOffer: boolean): void {
    t.act("me", { type: "attack", instanceId: t.id("凶龍爆神ガンディノス") })
    if (!expectOffer) assert(t.state.pendingChoice === null, "3回目は回復の確認が出ない（ターンに2回まで）")
    resolveAll(t, ["自分.決闘A", "自分.決闘B", "自分.決闘C"])
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
    t.closeFlash()
}
console.log("=== 44. PX07【強襲：2】：ターンに2回まで、ネクサス1つを疲労させて回復できる（3回アタックして、3回目は回復できない） ===")
scenario({
    name: "px07-assault-twice",
    start: { turn: "me", phase: "attack", interactive: true, me: { spirits: [{ card: PX07 }], nexuses: PX07_NEXUS } },
    steps: (t) => {
        px07Attack(t, true)
        px07Attack(t, true)
        px07Attack(t, false)
    },
    expect: [
        "自分.凶龍爆神ガンディノス.疲労: false → true",
        "自分.決闘A.疲労: false → true",
        "自分.決闘B.疲労: false → true",
        "相手.ライフ: 5 → 2",
        "相手.リザーブ: 10 → 13",
    ],
})
console.log("=== 45. PX07『アタック時』：BP5000以下の相手のスピリット1体を破壊し、破壊したら1枚ドロー（6000のウィンガルは対象外） ===")
scenario({
    name: "px07-destroy-draw",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: PX07 }] }, opp: { spirits: [{ card: ROKU }, { card: WINGAL, cores: 2 }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("凶龍爆神ガンディノス") })
        resolveAll(t)
    },
    expect: [
        "自分.凶龍爆神ガンディノス.疲労: false → true",
        "自分.手札: なし → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 46. PX07：破壊できなければ（BP6000のみ）ドローしない ===")
scenario({
    name: "px07-no-draw",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: PX07 }] }, opp: { spirits: [{ card: WINGAL, cores: 2 }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("凶龍爆神ガンディノス") })
        resolveAll(t)
    },
    expect: ["自分.凶龍爆神ガンディノス.疲労: false → true"],
})

// ================= PX12 =================
console.log("=== 47. PX12【転召：コスト5以上/ボイド】召喚時：ヴルム1体（自身）につき相手のスピリット1体を破壊し、破壊1体につきボイドのコア1個を自分のライフに置く ===")
scenario({
    name: "px12-tensho-one",
    start: { interactive: true, me: { hand: [PX12], spirits: [{ card: TAIGA }] }, opp: { spirits: [{ card: ROKU }, { card: METAL }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, substituteInstanceId: t.id("自分.虎拳士タイガ") })
        resolveAll(t, ["相手.ロクケラトプス"])
    },
    expect: [
        "自分.手札: 伝説龍エンシェントヴルム → なし",
        "自分.リザーブ: 10 → 1",
        "自分.トラッシュのコア: 0 → 8",
        "自分.トラッシュ: なし → 虎拳士タイガ",
        "自分.虎拳士タイガ.場所: フィールド → なし",
        "自分.伝説龍エンシェントヴルム.場所: なし → フィールド",
        "自分.伝説龍エンシェントヴルム.疲労: なし → false",
        "自分.伝説龍エンシェントヴルム.コア: なし → 1",
        "自分.伝説龍エンシェントヴルム.Lv: なし → 1",
        "自分.伝説龍エンシェントヴルム.BP: なし → 8000",
        "自分.ライフ: 5 → 6",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 48. PX12：ヴルムが2体（自身とダークヴルム）なら2体破壊し、ボイドのコア2個がライフに置かれる（赤シンボル1つでコスト7） ===")
scenario({
    name: "px12-tensho-two",
    start: {
        interactive: true,
        me: { hand: [PX12], spirits: [{ card: TAIGA, cores: 2 }, { card: VULM }] },
        opp: { spirits: [{ card: ROKU }, { card: METAL }, { card: AIBARN }] },
    },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, substituteInstanceId: t.id("自分.虎拳士タイガ") })
        resolveAll(t, ["相手.メタルバーン", "相手.アイバーン"])
    },
    expect: [
        "自分.手札: 伝説龍エンシェントヴルム → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 7",
        "自分.トラッシュ: なし → 虎拳士タイガ",
        "自分.虎拳士タイガ.場所: フィールド → なし",
        "自分.伝説龍エンシェントヴルム.場所: なし → フィールド",
        "自分.伝説龍エンシェントヴルム.疲労: なし → false",
        "自分.伝説龍エンシェントヴルム.コア: なし → 1",
        "自分.伝説龍エンシェントヴルム.Lv: なし → 1",
        "自分.伝説龍エンシェントヴルム.BP: なし → 8000",
        "自分.ライフ: 5 → 7",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.アイバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → アイバーン、メタルバーン",
        "相手.リザーブ: 10 → 12",
    ],
})
console.log("=== 49. PX12【合体時】Lv3『バトル時』：BP+5000（コア4＋ブレイヴ1個でLv3になる） ===")
scenario({
    name: "px12-combined-lv3",
    start: { me: { spirits: [{ card: PX12, cores: 4 }, { card: P034 }] } },
    steps: (t) => {
        combine(t, "セントロドリラー", "伝説龍エンシェントヴルム")
        attackFromMain(t, "伝説龍エンシェントヴルム")
    },
    expect: [...combineLines("セントロドリラー", 3000, "伝説龍エンシェントヴルム", 4, 13000, 26000, [2, 3]), "自分.伝説龍エンシェントヴルム.疲労: false → true"],
})
console.log("=== 50. PX12【合体時】：Lv2のままなら BP+5000 は働かない ===")
scenario({
    name: "px12-combined-lv2",
    start: { me: { spirits: [{ card: PX12, cores: 2 }, { card: P034 }] } },
    steps: (t) => {
        combine(t, "セントロドリラー", "伝説龍エンシェントヴルム")
        attackFromMain(t, "伝説龍エンシェントヴルム")
    },
    expect: [...combineLines("セントロドリラー", 3000, "伝説龍エンシェントヴルム", 2, 8000, 16000, [1, 2]), "自分.伝説龍エンシェントヴルム.疲労: false → true"],
})

// ================= PX14 =================
console.log("=== 51. PX14『アタック時』：相手のネクサス1つを破壊し、破壊したらこのスピリットは回復する（疲労は残らない） ===")
scenario({
    name: "px14-nexus-recover",
    start: { me: { spirits: [{ card: PX14 }] }, opp: { nexuses: [{ card: KETTO, cores: 0 }] } },
    steps: (t) => attackFromMain(t, "戦皇ゴッドスレイヤー・ドラゴン"),
    expect: ["相手.決闘台地.場所: ネクサス → なし", "相手.トラッシュ: なし → 決闘台地"],
})
console.log("=== 52. PX14：ネクサスを破壊できなければ回復しない ===")
scenario({
    name: "px14-no-nexus",
    start: { me: { spirits: [{ card: PX14 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => attackFromMain(t, "戦皇ゴッドスレイヤー・ドラゴン"),
    expect: ["自分.戦皇ゴッドスレイヤー・ドラゴン.疲労: false → true"],
})
console.log("=== 53. PX14『バトル時』：カード名に「神」と入っている相手のスピリットとバトルしたとき BP+5000（ミョルニールにブロックされる） ===")
scenario({
    name: "px14-kami-battle",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: PX14 }] }, opp: { spirits: [{ card: MJOL, cores: 2 }] } }, // ミョルニールはLv1にコア2個要る
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("戦皇ゴッドスレイヤー・ドラゴン") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("神機ミョルニール") })
    },
    expect: ["自分.戦皇ゴッドスレイヤー・ドラゴン.疲労: false → true", "自分.戦皇ゴッドスレイヤー・ドラゴン.BP: 6000 → 11000", "相手.神機ミョルニール.疲労: false → true"],
})
console.log("=== 54. PX14：名前に「神」が無い相手（ロクケラトプス）とのバトルでは BP は上がらない ===")
scenario({
    name: "px14-not-kami-battle",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: PX14 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("戦皇ゴッドスレイヤー・ドラゴン") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
    },
    expect: ["自分.戦皇ゴッドスレイヤー・ドラゴン.疲労: false → true", "相手.ロクケラトプス.疲労: false → true"],
})
console.log("=== 55. PX14 Lv2『アタック時』：相手のスピリット1体を指定し、そのスピリットにアタックできる ===")
scenario({
    name: "px14-lv2-attack-spirit",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: PX14, cores: 3 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("戦皇ゴッドスレイヤー・ドラゴン"), targetSpiritInstanceId: t.id("ロクケラトプス") })
        resolveAll(t)
        t.closeFlash()
    },
    expect: [
        "自分.戦皇ゴッドスレイヤー・ドラゴン.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 56. PX14：Lv1（コア1）ではスピリットを指定してアタックできない ===")
scenario({
    name: "px14-lv1-cannot-target",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: PX14 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => t.actRejected("me", { type: "attack", instanceId: t.id("戦皇ゴッドスレイヤー・ドラゴン"), targetSpiritInstanceId: t.id("ロクケラトプス") }),
    expect: [],
})

// ================= PX18 =================
console.log("=== 57. PX18 召喚時：相手のスピリット1体を破壊する ===")
scenario({
    name: "px18-summon",
    start: { me: { hand: [PX18] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 時統べる幻龍神アマテラス → なし",
        "自分.リザーブ: 10 → 1",
        "自分.トラッシュのコア: 0 → 8",
        "自分.時統べる幻龍神アマテラス.場所: なし → フィールド",
        "自分.時統べる幻龍神アマテラス.疲労: なし → false",
        "自分.時統べる幻龍神アマテラス.コア: なし → 1",
        "自分.時統べる幻龍神アマテラス.Lv: なし → 1",
        "自分.時統べる幻龍神アマテラス.BP: なし → 8000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
const OPP_TURN_START = ["相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス"]
console.log("=== 58. PX18 Lv3『アタック時』：BPを比べ相手のスピリットだけを破壊したら、ターン終了時に赤のスピリットすべてを回復し、アタックステップを足す（白は回復しない） ===")
scenario({
    name: "px18-extra-attack-step",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: PX18, cores: 5 }, { card: ROKU, rested: true }, { card: AMMO, rested: true }] },
        opp: { spirits: [{ card: ROKU, label: "ロクA" }, { card: ROKU, label: "ロクB" }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("時統べる幻龍神アマテラス") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ロクA") })
        t.closeFlash()
        t.act("me", { type: "endTurn" })
        assert(t.state.turnPlayer === t.me && t.state.phase === "attack", "エンドステップの後に足されたアタックステップに入っている")
        t.act("me", { type: "attack", instanceId: t.id("時統べる幻龍神アマテラス") })
        settle(t, "me")
        t.act("opp", { type: "takeLife" })
        t.closeFlash()
    },
    expect: [
        "自分.時統べる幻龍神アマテラス.疲労: false → true",
        "自分.ロクケラトプス.疲労: true → false",
        "相手.ロクA.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})
console.log("=== 59. PX18：ターンに1回しか使えない。足したアタックステップで相手だけを破壊しても、さらに足さず相手のターンへ移る ===")
scenario({
    name: "px18-once-per-turn",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: PX18, cores: 5 }] },
        opp: { spirits: [{ card: ROKU, label: "ロクA" }, { card: ROKU, label: "ロクB" }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("時統べる幻龍神アマテラス") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ロクA") })
        t.closeFlash()
        t.act("me", { type: "endTurn" })
        t.act("me", { type: "attack", instanceId: t.id("時統べる幻龍神アマテラス") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ロクB") })
        t.closeFlash()
        t.act("me", { type: "endTurn" })
        assert(t.state.turnPlayer === t.opp, "2回目の相手破壊では足さず、相手のターンになる")
    },
    expect: [
        "自分.時統べる幻龍神アマテラス.疲労: false → true",
        "相手.ロクA.場所: フィールド → なし",
        "相手.ロクB.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.リザーブ: 10 → 13",
        ...OPP_TURN_START,
    ],
})
console.log("=== 60. PX18：ライフで受けた（相手のスピリットを破壊していない）ならターン終了時に何も足さない ===")
scenario({
    name: "px18-no-extra-when-life",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: PX18, cores: 5 }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("時統べる幻龍神アマテラス") })
        settle(t, "me")
        t.act("opp", { type: "takeLife" })
        t.closeFlash()
        t.act("me", { type: "endTurn" })
        assert(t.state.turnPlayer === t.opp, "アタックステップは足されず、相手のターンになる")
    },
    expect: ["自分.時統べる幻龍神アマテラス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 12", ...OPP_TURN_START],
})

console.log("すべてのチェックに合格しました 🎉（part720）")

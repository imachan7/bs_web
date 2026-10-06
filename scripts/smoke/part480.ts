// smoke パート480（BS13/BS14 未発火だった効果節の場面テスト。効果文だけから期待値を書いた）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const V = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ。Lv1 BP1000 / Lv2 2コアで BP3000）

function is(id: string, name: string, type: string, extra?: (c: ReturnType<typeof getCard>) => boolean) {
    const c = getCard(id)
    assert(c.name === name && c.type === type && (extra ? extra(c) : true), `前提: ${id} は ${name}（${type}）`)
}

const YES = ["発動する", "無効にする", "召喚する"]
const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && (pc.options ?? []).some((o) => YES.includes(o))
}

// 確認が出たら decline=false で押す／true で断る（resolveChoice に何も渡さない）。それ以外の選択は先頭の候補（トグル選択は足せなくなったら確定）。
// 出た確認の回数を返す
function drive(t: ScenarioCtx, decline = false): number {
    let confirms = 0
    let guard = 0
    while (t.state.pendingChoice) {
        const pc = t.state.pendingChoice
        if (++guard > 12) throw new Error("選択待ちが終わらない: " + pc.prompt)
        const side: Side = pc.pid === t.me ? "me" : "opp"
        if (process.env.DBG) console.log("   選択待ち:", pc.kind, pc.pid, pc.prompt, pc.options)
        if (decline && pc.optional && !isConfirm(t) && pc.kind !== "option") {
            t.act(side, { type: "resolveChoice" })
        } else if (isConfirm(t)) {
            confirms++
            t.act(side, decline ? { type: "resolveChoice" } : { type: "resolveChoice", option: pc.options!.find((o) => YES.includes(o))! })
        } else if (pc.kind === "option") {
            t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        } else if (pc.kind === "card") {
            t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
        } else {
            const pick = pc.selectedIds ? pc.candidates.find((id) => !pc.selectedIds!.includes(id)) : pc.candidates[0]
            t.act(side, pick === undefined ? { type: "resolveChoice" } : { type: "resolveChoice", instanceId: pick })
        }
    }
    return confirms
}

// フラッシュの優先権が自分に回るまで、相手にパスさせる
function myPriority(t: ScenarioCtx): void {
    while (t.state.isFlashTiming && t.state.priorityPlayer !== t.me) t.act("opp", { type: "pass" })
}

// 攻撃側 atkSide が who でアタックする。blocker があれば守備側がブロックする。確認の回数を返す
function attack(t: ScenarioCtx, atkSide: Side, who: string, o: { blocker?: string; decline?: boolean } = {}): number {
    const def: Side = atkSide === "me" ? "opp" : "me"
    t.act(atkSide, { type: "nextPhase" })
    let n = drive(t, o.decline) // ステップ開始時の誘発
    t.act(atkSide, { type: "attack", instanceId: t.id(who) })
    n += drive(t, o.decline)
    if (o.blocker && t.state.battle) {
        t.closeFlash()
        n += drive(t, o.decline)
        t.act(def, { type: "block", instanceId: t.id(o.blocker) })
        n += drive(t, o.decline)
    }
    if (t.state.battle) {
        t.closeFlash()
        n += drive(t, o.decline)
        if (t.state.battle && !t.state.pendingChoice) t.act(def, { type: "takeLife" })
        n += drive(t, o.decline)
    }
    return n
}

console.log("=== 前提 ===")
is(V, "ロクケラトプス", "spirit", (c) => c.effects.length === 0)

// ---------- BS13-053 モクバオー（合体時のバトル時：BP比べで相手だけ破壊したとき）----------
const MOKU = "BS13-053"
const MACH = "BS02-026" // マッハジー（緑・コスト1・【神速】）
const HOST = "BS01-089" // デュアルキャノン・ベル（白・コスト4・Lv1 BP3000）
is(MOKU, "モクバオー", "brave", (c) => c.cost === 3)
is(MACH, "マッハジー", "spirit")
is(HOST, "デュアルキャノン・ベル", "spirit", (c) => c.cost === 4 && c.effects.length === 0)

const mokuMe = (withMach: boolean) => ({
    spirits: [
        { card: MOKU, label: "モクバオー" },
        { card: HOST, label: "ホスト" },
        ...(withMach ? [{ card: MACH, label: "神速" }] : []),
    ],
})
const mokuOpp = { spirits: [{ card: V, label: "ブロッカー" }, { card: V, label: "待機" }] }
const mokuSteps = (decline: boolean, expectConfirm: number) => (t: ScenarioCtx) => {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("モクバオー"), hostInstanceId: t.id("ホスト") })
    const n = attack(t, "me", "ホスト", { blocker: "ブロッカー", decline })
    assert(n === expectConfirm, `確認の回数は${expectConfirm}回（実際 ${n} 回）`)
}

console.log("=== 1-1. モクバオー：相手だけ破壊したら、神速を戻して相手1体を戻す（確認1回） ===")
scenario({
    name: "moku-yes",
    start: { interactive: true, me: mokuMe(true), opp: mokuOpp },
    steps: mokuSteps(false, 1),
    expect: [
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ブロッカー.場所: フィールド → なし",
        "相手.リザーブ: 10 → 12",
        "相手.待機.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "自分.ホスト.BP: 3000 → 7000",
        "自分.ホスト.疲労: false → true",
        "自分.モクバオー.BP: 4000 → なし",
        "自分.モクバオー.コア: 1 → 0",
        "自分.モクバオー.場所: フィールド → 合体",
        "自分.リザーブ: 10 → 12",
        "自分.手札: なし → マッハジー",
        "自分.神速.場所: フィールド → なし",
    ],
})

console.log("=== 1-2. モクバオー：神速のスピリットがいなければ戻すコストを払えず、確認は出ない（相手は1体破壊されるだけ） ===")
scenario({
    name: "moku-nomach",
    start: { interactive: true, me: mokuMe(false), opp: mokuOpp },
    steps: mokuSteps(false, 0),
    expect: [
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ブロッカー.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "自分.ホスト.BP: 3000 → 7000",
        "自分.ホスト.疲労: false → true",
        "自分.モクバオー.BP: 4000 → なし",
        "自分.モクバオー.コア: 1 → 0",
        "自分.モクバオー.場所: フィールド → 合体",
        "自分.リザーブ: 10 → 11",
    ],
})
console.log("=== 1-3. モクバオー：確認を断れば戻さない（破壊だけ） ===")
scenario({
    name: "moku-decline",
    start: { interactive: true, me: mokuMe(true), opp: mokuOpp },
    steps: mokuSteps(true, 1),
    expect: [
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ブロッカー.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "自分.ホスト.BP: 3000 → 7000",
        "自分.ホスト.疲労: false → true",
        "自分.モクバオー.BP: 4000 → なし",
        "自分.モクバオー.コア: 1 → 0",
        "自分.モクバオー.場所: フィールド → 合体",
        "自分.リザーブ: 10 → 11",
    ],
})

// ---------- BS13-078 ネバーギブアップ（付与した効果：BPを比べ相手だけ破壊したら回復）----------
const NEVER = "BS13-078"
is(NEVER, "ネバーギブアップ", "magic", (c) => c.cost === 4)
const neverSteps = (blocked: boolean) => (t: ScenarioCtx) => {
    t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("アタッカー") })
    attack(t, "me", "アタッカー", blocked ? { blocker: "ブロッカー" } : {})
}
console.log("=== 2-1. ネバーギブアップ：付与されたスピリットが相手だけ破壊したら回復する ===")
scenario({
    name: "never-yes",
    start: { me: { hand: [NEVER], spirits: [{ card: V, label: "アタッカー", cores: 2 }] }, opp: { spirits: [{ card: V, label: "ブロッカー" }] } },
    steps: neverSteps(true),
    expect: [
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ブロッカー.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "自分.トラッシュ: なし → ネバーギブアップ",
        "自分.トラッシュのコア: 0 → 4",
        "自分.リザーブ: 10 → 6",
        "自分.手札: ネバーギブアップ → なし",
    ],
})
console.log("=== 2-2. ネバーギブアップ：誰も破壊しなければ回復しない（ブロックされない） ===")
scenario({
    name: "never-no",
    start: { me: { hand: [NEVER], spirits: [{ card: V, label: "アタッカー", cores: 2 }] } },
    steps: neverSteps(false),
    expect: [
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.アタッカー.疲労: false → true",
        "自分.トラッシュ: なし → ネバーギブアップ",
        "自分.トラッシュのコア: 0 → 4",
        "自分.リザーブ: 10 → 6",
        "自分.手札: ネバーギブアップ → なし",
    ],
})

// ---------- BS13-049 イリテバン（合体アタック時：他のブレイヴの合体アタック時効果を借りる）----------
const IRI = "BS13-049"
const BUSTER = "BS10-061" // 剣鎧竜バスター・ドラゴン（合体アタック時：BP合計3000まで相手のスピリットを好きなだけ破壊）
is(IRI, "イリテバン", "brave", (c) => c.cost === 4)
is(BUSTER, "剣鎧竜バスター・ドラゴン", "brave")
const iriMe = (withBuster: boolean) => ({
    spirits: [
        { card: IRI, label: "イリテバン" },
        { card: HOST, label: "ホスト" },
        ...(withBuster ? [{ card: BUSTER, label: "バスター" }] : []),
    ],
})
const iriOpp = { spirits: [{ card: V, label: "敵A" }, { card: V, label: "敵B" }] }
// 「発揮できる」は任意なので、借りる元があれば確認が1回出る（借りる元が無ければ出ない）
const iriSteps = (decline: boolean, expectedConfirms: number) => (t: ScenarioCtx) => {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("イリテバン"), hostInstanceId: t.id("ホスト") })
    const n = attack(t, "me", "ホスト", { decline })
    assert(n === expectedConfirms, `確認の回数は${expectedConfirms}回（実際 ${n} 回）`)
}
console.log("=== 3-1. イリテバン：バスターの合体アタック時効果を借りて敵2体を破壊 ===")
scenario({
    name: "iri-yes",
    start: { interactive: true, me: iriMe(true), opp: iriOpp },
    steps: iriSteps(false, 1),
    expect: [
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 14",
        "相手.敵A.場所: フィールド → なし",
        "相手.敵B.場所: フィールド → なし",
        "自分.イリテバン.BP: 4000 → なし",
        "自分.イリテバン.コア: 1 → 0",
        "自分.イリテバン.場所: フィールド → 合体",
        "自分.ホスト.BP: 3000 → 5000",
        "自分.ホスト.疲労: false → true",
        "自分.リザーブ: 10 → 11",
    ],
})
console.log("=== 3-2. イリテバン：借りる元が無ければ何も起きない ===")
scenario({
    name: "iri-none",
    start: { interactive: true, me: iriMe(false), opp: iriOpp },
    steps: iriSteps(false, 0),
    expect: [
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
        "自分.イリテバン.BP: 4000 → なし",
        "自分.イリテバン.コア: 1 → 0",
        "自分.イリテバン.場所: フィールド → 合体",
        "自分.ホスト.BP: 3000 → 5000",
        "自分.ホスト.疲労: false → true",
        "自分.リザーブ: 10 → 11",
    ],
})
console.log("=== 3-3. イリテバン：断れば敵は破壊されない ===")
scenario({
    name: "iri-decline",
    start: { interactive: true, me: iriMe(true), opp: iriOpp },
    steps: iriSteps(true, 1),
    expect: [
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
        "自分.イリテバン.BP: 4000 → なし",
        "自分.イリテバン.コア: 1 → 0",
        "自分.イリテバン.場所: フィールド → 合体",
        "自分.ホスト.BP: 3000 → 5000",
        "自分.ホスト.疲労: false → true",
        "自分.リザーブ: 10 → 11",
    ],
})

// ---------- BS13-062 光り輝く大銀河（Lv2フラッシュ：光導/神星を捨ててBP+6000と赤シンボル）----------
const GALAXY = "BS13-062"
const ARES = "BS10-008" // 火星神龍アレス・ドラグーン（神星）
is(GALAXY, "光り輝く大銀河", "nexus")
is(ARES, "火星神龍アレス・ドラグーン", "spirit", (c) => c.family.includes("神星"))
const galaxyMe = (nexusCores: number, hand: string[]) => ({ hand, nexuses: [{ card: GALAXY, cores: nexusCores }], spirits: [{ card: V, label: "アタッカー" }] })
console.log("=== 4-1. 大銀河Lv2：神星を捨てると、赤シンボルが増えてライフが2減る ===")
scenario({
    name: "galaxy-yes",
    start: { interactive: true, me: galaxyMe(2, [ARES]) },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        drive(t)
        myPriority(t)
        t.act("me", { type: "activateAbility", instanceId: t.id("光り輝く大銀河"), effectId: "BS13-062-e2" })
        drive(t)
        t.closeFlash()
        drive(t)
        if (t.state.battle) t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
        "自分.アタッカー.疲労: false → true",
        "自分.トラッシュ: なし → 火星神龍アレス・ドラグーン",
        "自分.手札: 火星神龍アレス・ドラグーン → なし",
    ],
})
console.log("=== 4-2. 大銀河Lv1：使えない ===")
scenario({
    name: "galaxy-lv1",
    start: { interactive: true, me: galaxyMe(0, [ARES]) },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        drive(t)
        myPriority(t)
        t.actRejected("me", { type: "activateAbility", instanceId: t.id("光り輝く大銀河"), effectId: "BS13-062-e2" })
    },
    expect: [
        "自分.アタッカー.疲労: false → true",
    ],
})
console.log("=== 4-3. 大銀河Lv2：手札に神星/光導のスピリットが無ければ使えない ===")
scenario({
    name: "galaxy-nocard",
    start: { interactive: true, me: galaxyMe(2, [V]) },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        drive(t)
        myPriority(t)
        t.actRejected("me", { type: "activateAbility", instanceId: t.id("光り輝く大銀河"), effectId: "BS13-062-e2" })
    },
    expect: [
        "自分.アタッカー.疲労: false → true",
    ],
})

// ---------- BS13-026 キグナ・スワンMk-II（フラッシュ：疲労して光導/星魂の自分のスピリットすべてBP+3000）----------
const CYGNUS = "BS13-026"
const KOGUMARU = "BS12-033" // コグマル（黄・星魂・Lv1 BP2000）
is(CYGNUS, "キグナ・スワンMk-II", "spirit", (c) => c.family.includes("星魂"))
is(KOGUMARU, "コグマル", "spirit", (c) => c.family.includes("星魂") && c.effects.length === 0)
const cygnusMe = (rested: boolean) => ({ spirits: [{ card: CYGNUS, rested }, { card: KOGUMARU }, { card: V, label: "アタッカー" }] })
const cygnusStart = (t: ScenarioCtx) => {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
    myPriority(t)
}
console.log("=== 5-1. キグナ：疲労して使うと、星魂の自分のスピリットすべて（自身を含む）がBP+3000。系統の無いスピリットは変わらない ===")
scenario({
    name: "cygnus-yes",
    start: { me: cygnusMe(false) },
    steps: (t) => {
        cygnusStart(t)
        t.act("me", { type: "activateAbility", instanceId: t.id("キグナ・スワンMk-II"), effectId: "BS13-026-e1" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.アタッカー.疲労: false → true",
        "自分.キグナ・スワンMk-II.BP: 2000 → 5000",
        "自分.キグナ・スワンMk-II.疲労: false → true",
        "自分.コグマル.BP: 2000 → 5000",
    ],
})
console.log("=== 5-2. キグナ：すでに疲労していれば使えない ===")
scenario({
    name: "cygnus-rested",
    start: { me: cygnusMe(true) },
    steps: (t) => {
        cygnusStart(t)
        t.actRejected("me", { type: "activateAbility", instanceId: t.id("キグナ・スワンMk-II"), effectId: "BS13-026-e1" })
    },
    expect: [
        "自分.アタッカー.疲労: false → true",
    ],
})
console.log("=== 5-3. キグナ：メインステップ（アタックステップ外）では使えない ===")
scenario({
    name: "cygnus-main",
    start: { me: cygnusMe(false) },
    steps: (t) => {
        t.actRejected("me", { type: "activateAbility", instanceId: t.id("キグナ・スワンMk-II"), effectId: "BS13-026-e1" })
    },
    expect: [],
})

// ---------- BS13-035 オク（Lv2：手札の天霊に軽減シンボル[黄]）----------
const OKU = "BS13-035"
const TENSHI = "BS10-048" // 天使パワー（黄・コスト5・天霊・軽減[黄]×4）
const CHUN = "BS02-051" // チュンポポ（黄・コスト1・黄シンボル1）
is(OKU, "オリンピアの天使オク", "spirit", (c) => c.family.includes("天霊"))
is(TENSHI, "天使パワー", "spirit", (c) => c.cost === 5 && c.family.includes("天霊") && c.reduction.length === 4)
is(CHUN, "チュンポポ", "spirit", (c) => c.effects.length === 0 && c.symbol.length === 1)
const summonOnly = (t: ScenarioCtx) => t.act("me", { type: "summon", handIndex: 0 })
const okuMe = (okuCores: number) => ({
    hand: [TENSHI],
    spirits: [{ card: OKU, cores: okuCores }, ...[1, 2, 3, 4].map((n) => ({ card: CHUN, label: `チュン${n}` }))],
})
console.log("=== 6-1. オクLv2：手札の天霊の軽減が1つ増え、黄シンボル5個で5分すべて軽減されコスト0で召喚できる ===")
scenario({ name: "oku-lv2", start: { me: okuMe(3) }, steps: summonOnly, expect: [
        "自分.リザーブ: 10 → 9",
        "自分.天使パワー.BP: なし → 3000",
        "自分.天使パワー.Lv: なし → 1",
        "自分.天使パワー.コア: なし → 1",
        "自分.天使パワー.場所: なし → フィールド",
        "自分.天使パワー.疲労: なし → false",
        "自分.手札: 天使パワー → なし",
    ] })
console.log("=== 6-2. オクLv1：付与されない（軽減は元の4つ止まり）ので1コア多く払う ===")
scenario({ name: "oku-lv1", start: { me: okuMe(1) }, steps: summonOnly, expect: [
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 8",
        "自分.天使パワー.BP: なし → 3000",
        "自分.天使パワー.Lv: なし → 1",
        "自分.天使パワー.コア: なし → 1",
        "自分.天使パワー.場所: なし → フィールド",
        "自分.天使パワー.疲労: なし → false",
        "自分.手札: 天使パワー → なし",
    ] })

// ---------- BS13-039 神獣バーロン（戯狩1体につき手札の自分に軽減[黄]）----------
const BARON = "BS13-039"
const KUDA = "BS15-037" // クダギツネン（黄・戯狩・コスト0）
is(BARON, "神獣バーロン", "spirit", (c) => c.cost === 6 && c.reduction.length === 2)
is(KUDA, "クダギツネン", "spirit", (c) => c.family.includes("戯狩") && c.effects.length === 0 && c.symbol.length === 1)
console.log("=== 7-1. バーロン：戯狩3体ぶん軽減が増え、黄シンボル4個ぶん軽減される ===")
scenario({
    name: "baron-yes",
    start: { me: { hand: [BARON], spirits: [{ card: KUDA, label: "戯狩1" }, { card: KUDA, label: "戯狩2" }, { card: KUDA, label: "戯狩3" }, { card: CHUN }] } },
    steps: summonOnly,
    expect: [
        "自分.トラッシュのコア: 0 → 2",
        "自分.リザーブ: 10 → 7",
        "自分.手札: 神獣バーロン → なし",
        "自分.神獣バーロン.BP: なし → 4000",
        "自分.神獣バーロン.Lv: なし → 1",
        "自分.神獣バーロン.コア: なし → 1",
        "自分.神獣バーロン.場所: なし → フィールド",
        "自分.神獣バーロン.疲労: なし → false",
    ],
})
console.log("=== 7-2. バーロン：戯狩がいなければ元の軽減2つ止まり（黄シンボルは同じ4個） ===")
scenario({
    name: "baron-no",
    start: { me: { hand: [BARON], spirits: [1, 2, 3, 4].map((n) => ({ card: CHUN, label: `チュン${n}` })) } },
    steps: summonOnly,
    expect: [
        "自分.トラッシュのコア: 0 → 4",
        "自分.リザーブ: 10 → 5",
        "自分.手札: 神獣バーロン → なし",
        "自分.神獣バーロン.BP: なし → 4000",
        "自分.神獣バーロン.Lv: なし → 1",
        "自分.神獣バーロン.コア: なし → 1",
        "自分.神獣バーロン.場所: なし → フィールド",
        "自分.神獣バーロン.疲労: なし → false",
    ],
})

// ---------- BS13-027 ムーンショウウオ（Lv2：相手のスピリットの効果では自分のライフが減らない）----------
const MOON = "BS13-027"
const KAISER = "BS02-036" // カイザレオン大帝（緑・Lv2 7コア BP15000：BPを比べ相手だけ破壊したとき、相手のライフのコア1個をリザーブへ）
is(MOON, "ムーンショウウオ", "spirit", (c) => c.cost === 3)
is(KAISER, "カイザレオン大帝", "spirit", (c) => c.cost === 7)
const moonStart = (moonCores: number) => ({
    interactive: true,
    turn: "opp" as Side,
    me: { spirits: [{ card: MOON, cores: moonCores }, { card: V, label: "ブロッカー" }] },
    opp: { spirits: [{ card: KAISER, cores: 7 }] },
})
const moonSteps = (t: ScenarioCtx) => {
    attack(t, "opp", "カイザレオン大帝", { blocker: "ブロッカー", decline: true })
}
console.log("=== 8-1. ムーン Lv2：相手のスピリットの効果（カイザレオンの『ライフのコアをリザーブへ』）でライフが減らない ===")
scenario({ name: "moon-lv2", start: moonStart(3), steps: moonSteps, expect: [
        "相手.カイザレオン大帝.疲労: false → true",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.リザーブ: 10 → 11",
    ] })
console.log("=== 8-2. ムーン Lv1：Lv2の効果は働かず、ライフが1減る ===")
scenario({ name: "moon-lv1", start: moonStart(1), steps: moonSteps, expect: [
        "相手.カイザレオン大帝.疲労: false → true",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 12",
    ] })

// ---------- BS13-028 誓約の女神ヴァール（氷壁：赤/緑/黄）----------
const VARL = "BS13-028"
const DOUBLE = "BS01-117" // ダブルドロー（赤・コスト4・メイン：2枚ドロー）
const HAMMER = "BS03-144" // マジックハンマー（青・コスト4・メイン：相手のデッキを上から5枚破棄）
is(VARL, "誓約の女神ヴァール", "spirit")
is(DOUBLE, "ダブルドロー", "magic", (c) => c.colors[0] === "red" && c.cost === 4)
is(HAMMER, "マジックハンマー", "magic", (c) => c.colors[0] === "blue" && c.cost === 4)
const cast = (t: ScenarioCtx, decline = false) => {
    t.act("opp", { type: "castMagic", handIndex: 0 })
    return drive(t, decline)
}
const varlStart = (varlCores: number, magic: string, rested = false) => ({
    interactive: true,
    turn: "opp" as Side,
    me: { spirits: [{ card: VARL, cores: varlCores, rested }] },
    opp: { hand: [magic] },
})
console.log("=== 9-1. ヴァール：相手の赤マジックを疲労して無効にする（確認1回。相手は2枚引けない） ===")
scenario({
    name: "varl-yes",
    start: varlStart(2, DOUBLE),
    steps: (t) => assert(cast(t) === 1, "確認は1回"),
    expect: [
        "相手.トラッシュ: なし → ダブルドロー",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "相手.手札: ダブルドロー → なし",
        "自分.誓約の女神ヴァール.疲労: false → true",
    ],
})
console.log("=== 9-2. ヴァール：断ればマジックは通る（相手が2枚引く） ===")
scenario({
    name: "varl-decline",
    start: varlStart(2, DOUBLE),
    steps: (t) => assert(cast(t, true) === 1, "確認は1回"),
    expect: [
        "相手.デッキ枚数: 40 → 38",
        "相手.トラッシュ: なし → ダブルドロー",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "相手.手札: ダブルドロー → ロクケラトプス、ロクケラトプス",
    ],
})
console.log("=== 9-3. ヴァール：青マジックは対象外（確認なし。自分のデッキが5枚破棄される） ===")
scenario({
    name: "varl-blue",
    start: varlStart(2, HAMMER),
    steps: (t) => assert(cast(t) === 0, "確認は出ない"),
    expect: [
        "相手.トラッシュ: なし → マジックハンマー",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "相手.手札: マジックハンマー → なし",
        "自分.デッキ枚数: 40 → 35",
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
    ],
})
console.log("=== 9-4. ヴァール：疲労していると使えない（確認なし。相手が2枚引く） ===")
scenario({
    name: "varl-rested",
    start: varlStart(2, DOUBLE, true),
    steps: (t) => assert(cast(t) === 0, "確認は出ない"),
    expect: [
        "相手.デッキ枚数: 40 → 38",
        "相手.トラッシュ: なし → ダブルドロー",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "相手.手札: ダブルドロー → ロクケラトプス、ロクケラトプス",
    ],
})

// ---------- BS13-040 金星神龍ヴィーナ・フェーザー（手札から：トラッシュのシンボルでも召喚コストを軽減）----------
const VENA = "BS13-040"
is(VENA, "金星神龍ヴィーナ・フェーザー", "spirit", (c) => c.cost === 7 && c.reduction.length === 5)
console.log("=== 10-1. ヴィーナ：トラッシュの黄カード5枚のシンボルで軽減できる（支払い2＋Lv1のコア1） ===")
scenario({ name: "vena-trash", start: { me: { hand: [VENA], trash: [CHUN, CHUN, CHUN, CHUN, CHUN] } }, steps: summonOnly, expect: [
        "自分.トラッシュのコア: 0 → 2",
        "自分.リザーブ: 10 → 7",
        "自分.手札: 金星神龍ヴィーナ・フェーザー → なし",
        "自分.金星神龍ヴィーナ・フェーザー.BP: なし → 4000",
        "自分.金星神龍ヴィーナ・フェーザー.Lv: なし → 1",
        "自分.金星神龍ヴィーナ・フェーザー.コア: なし → 1",
        "自分.金星神龍ヴィーナ・フェーザー.場所: なし → フィールド",
        "自分.金星神龍ヴィーナ・フェーザー.疲労: なし → false",
    ] })
console.log("=== 10-2. ヴィーナ：トラッシュが黄でなければ軽減されない（支払い7＋コア1） ===")
scenario({ name: "vena-notrash", start: { me: { hand: [VENA], trash: [V, V, V, V, V] } }, steps: summonOnly, expect: [
        "自分.トラッシュのコア: 0 → 7",
        "自分.リザーブ: 10 → 2",
        "自分.手札: 金星神龍ヴィーナ・フェーザー → なし",
        "自分.金星神龍ヴィーナ・フェーザー.BP: なし → 4000",
        "自分.金星神龍ヴィーナ・フェーザー.Lv: なし → 1",
        "自分.金星神龍ヴィーナ・フェーザー.コア: なし → 1",
        "自分.金星神龍ヴィーナ・フェーザー.場所: なし → フィールド",
        "自分.金星神龍ヴィーナ・フェーザー.疲労: なし → false",
    ] })

// ---------- BS13-006 炎獣ファイオリック（Lv2･Lv3アタック時：スピリット状態のブレイヴがいる間、赤シンボル追加）----------
const FIO = "BS13-006"
is(FIO, "炎獣ファイオリック", "spirit", (c) => c.cost === 5)
const fioSteps = (t: ScenarioCtx) => attack(t, "me", "炎獣ファイオリック")
console.log("=== 11-1. ファイオリックLv2：スピリット状態のブレイヴがいればシンボル2つでライフ2減る ===")
scenario({ name: "fio-brave", start: { me: { spirits: [{ card: FIO, cores: 3 }, { card: BUSTER, label: "ブレイヴ" }] } }, steps: fioSteps, expect: [
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
        "自分.炎獣ファイオリック.疲労: false → true",
    ] })
console.log("=== 11-2. ファイオリックLv2：ブレイヴがいなければライフ1 ===")
scenario({ name: "fio-nobrave", start: { me: { spirits: [{ card: FIO, cores: 3 }] } }, steps: fioSteps, expect: [
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.炎獣ファイオリック.疲労: false → true",
    ] })
console.log("=== 11-3. ファイオリックLv1：ブレイヴがいても追加されない（Lv2･Lv3の効果） ===")
scenario({ name: "fio-lv1", start: { me: { spirits: [{ card: FIO, cores: 1 }, { card: BUSTER, label: "ブレイヴ" }] } }, steps: fioSteps, expect: [
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.炎獣ファイオリック.疲労: false → true",
    ] })

// ---------- BS13-X04 レオ（合体中Lv3：光導/星魂の自分のスピリットすべてに白シンボル追加）----------
const LEO = "BS13-X04"
const HAWK = "BS13-056" // ホーク・ブレイカー（白・ブレイヴ・コスト5・合体条件コスト5以上）
is(LEO, "獅機龍神ストライクヴルム・レオ", "spirit", (c) => c.cost === 8)
is(HAWK, "ホーク・ブレイカー", "brave", (c) => c.cost === 5)
const leoSteps = (combine: boolean) => (t: ScenarioCtx) => {
    if (combine) t.act("me", { type: "combineBrave", braveInstanceId: t.id("ホーク・ブレイカー"), hostInstanceId: t.id("獅機龍神ストライクヴルム・レオ") })
    attack(t, "me", "コグマル")
}
const leoMe = (leoCores: number) => ({ spirits: [{ card: LEO, cores: leoCores }, { card: HAWK }, { card: KOGUMARU }] })
console.log("=== 12-1. レオ：合体中Lv3なら、星魂のコグマルのアタックでライフ2減る ===")
scenario({ name: "leo-lv3", start: { me: leoMe(4) }, steps: leoSteps(true), expect: [
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
        "自分.コグマル.疲労: false → true",
        "自分.ホーク・ブレイカー.BP: 7000 → なし",
        "自分.ホーク・ブレイカー.コア: 1 → 0",
        "自分.ホーク・ブレイカー.場所: フィールド → 合体",
        "自分.リザーブ: 10 → 11",
        "自分.獅機龍神ストライクヴルム・レオ.BP: 12000 → 15000",
    ] })
console.log("=== 12-2. レオ：合体中でもLv2なら追加されない ===")
scenario({ name: "leo-lv2", start: { me: leoMe(2) }, steps: leoSteps(true), expect: [
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.コグマル.疲労: false → true",
        "自分.ホーク・ブレイカー.BP: 7000 → なし",
        "自分.ホーク・ブレイカー.コア: 1 → 0",
        "自分.ホーク・ブレイカー.場所: フィールド → 合体",
        "自分.リザーブ: 10 → 11",
        "自分.獅機龍神ストライクヴルム・レオ.BP: 9000 → 12000",
    ] })
console.log("=== 12-3. レオ：Lv3でも合体していなければ追加されない ===")
scenario({ name: "leo-nocombine", start: { me: leoMe(4) }, steps: leoSteps(false), expect: [
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.コグマル.疲労: false → true",
    ] })

// ---------- BS13-056 ホーク・ブレイカー（スピリット状態の間、自分のスピリットすべてに【重装甲：赤】）----------
const FERARU = "BS07-068" // フェラールスラッシュ（赤・コスト4・メイン：BP2000以下の相手のスピリットすべてを破壊）
is(FERARU, "フェラールスラッシュ", "magic", (c) => c.colors[0] === "red" && c.cost === 4)
console.log("=== 13-1. ホーク：スピリット状態でいる間、相手の赤マジックで自分のスピリットが破壊されない ===")
scenario({
    name: "hawk-spirit",
    start: { turn: "opp", me: { spirits: [{ card: HAWK }, { card: V, label: "一般" }] }, opp: { hand: [FERARU] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0 }),
    expect: [
        "相手.トラッシュ: なし → フェラールスラッシュ",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "相手.手札: フェラールスラッシュ → なし",
    ],
})
console.log("=== 13-2. ホーク：いなければ同じマジックで破壊される ===")
scenario({
    name: "hawk-none",
    start: { turn: "opp", me: { spirits: [{ card: V, label: "一般" }] }, opp: { hand: [FERARU] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0 }),
    expect: [
        "相手.トラッシュ: なし → フェラールスラッシュ",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "相手.手札: フェラールスラッシュ → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
        "自分.一般.場所: フィールド → なし",
    ],
})

// ---------- BS13-034 ミノガメン／BS14-049 ペンタン（相手のデッキ破棄で破棄されたとき、コストを支払わず召喚）----------
const MINO = "BS13-034"
const PENTAN = "BS14-049"
is(MINO, "ミノガメン", "spirit", (c) => c.cost === 2)
is(PENTAN, "執事ペンタン", "spirit", (c) => c.cost === 3)
// 山札の先頭は配列の添字0。pos 番目（0始まり）に c を置く。破棄の途中で c が破棄されると、残りの破棄はその場で止まる
const deckWith = (c: string, pos: number) => Array.from({ length: 40 }, (_, i) => (i === pos ? c : V))
const milledDeck = (c: string) => deckWith(c, 4) // 5枚目なので5枚すべて破棄される
const notMilledDeck = (c: string) => Array.from({ length: 40 }, (_, i) => (i === 20 ? c : V))
const millFlow = (secondCast: boolean, decline = false) => (t: ScenarioCtx) => {
    t.act("opp", { type: "castMagic", handIndex: 0 })
    const n = drive(t, decline)
    if (secondCast) t.act("opp", { type: "castMagic", handIndex: 0 })
    return n
}
const millCommon = ["相手.トラッシュのコア: 0 → 4", "相手.リザーブ: 10 → 6", "相手.手札: マジックハンマー → なし", "自分.デッキ枚数: 40 → 35"]
const fourV = "ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス"
for (const [id, nm, label, bp] of [[MINO, "mino", "ミノガメン", 1000], [PENTAN, "pentan", "ペンタン", 3000]] as const) {
    const name = getCard(id).name
    console.log(`=== 14-${nm}-1. ${label}：5枚破棄に含まれたら確認が1回出て、押すとコストを払わず召喚される。同じターンの2回目の破棄は起きない ===`)
    scenario({
        name: `${nm}-yes`,
        start: { interactive: true, turn: "opp", me: { deck: milledDeck(id) }, opp: { hand: [HAMMER, HAMMER] } },
        steps: (t) => assert(millFlow(true)(t) === 1, "確認は1回"),
        // 召喚したスピリットのLv1のコア1個はリザーブから置かれる（推測。質問を参照）
        expect: [
            "相手.トラッシュのコア: 0 → 8",
            "相手.リザーブ: 10 → 2",
            "相手.手札: マジックハンマー、マジックハンマー → なし",
            "相手.トラッシュ: なし → マジックハンマー、マジックハンマー",
            "自分.デッキ枚数: 40 → 35",
            `自分.トラッシュ: なし → ${fourV}`,
            "自分.リザーブ: 10 → 9",
            `自分.${name}.BP: なし → ${bp}`,
            `自分.${name}.Lv: なし → 1`,
            `自分.${name}.コア: なし → 1`,
            `自分.${name}.場所: なし → フィールド`,
            `自分.${name}.疲労: なし → false`,
        ],
    })
    console.log(`=== 14-${nm}-2. ${label}：断れば召喚されず、トラッシュに残る ===`)
    scenario({
        name: `${nm}-decline`,
        start: { interactive: true, turn: "opp", me: { deck: milledDeck(id) }, opp: { hand: [HAMMER] } },
        steps: (t) => assert(millFlow(false, true)(t) === 1, "確認は1回"),
        expect: [...millCommon, "相手.トラッシュ: なし → マジックハンマー", `自分.トラッシュ: なし → ${[name, ...Array(4).fill("ロクケラトプス")].sort().join("、")}`],
    })
    console.log(`=== 14-${nm}-3. ${label}：破棄された5枚に含まれなければ何も起きない ===`)
    scenario({
        name: `${nm}-miss`,
        start: { interactive: true, turn: "opp", me: { deck: notMilledDeck(id) }, opp: { hand: [HAMMER] } },
        steps: (t) => assert(millFlow(false)(t) === 0, "確認は出ない"),
        expect: [...millCommon, "相手.トラッシュ: なし → マジックハンマー", `自分.トラッシュ: なし → ${fourV}、ロクケラトプス`],
    })
    const bpHere = bp
    const summoned = [
        `自分.${name}.BP: なし → ${bpHere}`,
        `自分.${name}.Lv: なし → 1`,
        `自分.${name}.コア: なし → 1`,
        `自分.${name}.場所: なし → フィールド`,
        `自分.${name}.疲労: なし → false`,
        "自分.リザーブ: 10 → 9",
    ]
    const oneCast = ["相手.トラッシュのコア: 0 → 4", "相手.リザーブ: 10 → 6", "相手.手札: マジックハンマー → なし", "相手.トラッシュ: なし → マジックハンマー"]
    console.log(`=== 14-${nm}-4. ${label}：上から2枚目なら破棄は2枚で止まる。召喚を受ければ手前の1枚だけがトラッシュに残る ===`)
    scenario({
        name: `${nm}-stop-yes`,
        start: { interactive: true, turn: "opp", me: { deck: deckWith(id, 1) }, opp: { hand: [HAMMER] } },
        steps: (t) => assert(millFlow(false)(t) === 1, "確認は1回"),
        expect: [...oneCast, "自分.デッキ枚数: 40 → 38", "自分.トラッシュ: なし → ロクケラトプス", ...summoned],
    })
    console.log(`=== 14-${nm}-5. ${label}：2枚目で止まる場面で召喚を断っても、破棄は2枚で止まる ===`)
    scenario({
        name: `${nm}-stop-decline`,
        start: { interactive: true, turn: "opp", me: { deck: deckWith(id, 1) }, opp: { hand: [HAMMER] } },
        steps: (t) => assert(millFlow(false, true)(t) === 1, "確認は1回"),
        expect: [...oneCast, "自分.デッキ枚数: 40 → 38", `自分.トラッシュ: なし → ${[name, "ロクケラトプス"].sort().join("、")}`],
    })
    console.log(`=== 14-${nm}-6. ${label}：召喚を断っても、同じターンの2回目の破棄は起きない ===`)
    scenario({
        name: `${nm}-decline-second`,
        start: { interactive: true, turn: "opp", me: { deck: milledDeck(id) }, opp: { hand: [HAMMER, HAMMER] } },
        steps: (t) => assert(millFlow(true, true)(t) === 1, "確認は1回"),
        expect: [
            "相手.トラッシュのコア: 0 → 8",
            "相手.リザーブ: 10 → 2",
            "相手.手札: マジックハンマー、マジックハンマー → なし",
            "相手.トラッシュ: なし → マジックハンマー、マジックハンマー",
            "自分.デッキ枚数: 40 → 35",
            `自分.トラッシュ: なし → ${[name, ...Array(4).fill("ロクケラトプス")].sort().join("、")}`,
        ],
    })
}

// ---------- BS14-070 ダイヤドカリ（スピリット状態のときアタックできない）----------
const DIA = "BS14-070"
is(DIA, "ダイヤドカリ", "brave", (c) => c.cost === 4)
console.log("=== 15-1. ダイヤドカリ：スピリット状態ではアタックできない ===")
scenario({
    name: "dia-spirit",
    start: { me: { spirits: [{ card: DIA }] } },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.actRejected("me", { type: "attack", instanceId: t.id("ダイヤドカリ") })
    },
    expect: [],
})
console.log("=== 15-2. ダイヤドカリ：合体したホストはアタックできる ===")
scenario({
    name: "dia-combined",
    start: { me: { spirits: [{ card: DIA }, { card: HOST, label: "ホスト" }] } },
    steps: (t) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ダイヤドカリ"), hostInstanceId: t.id("ホスト") })
        attack(t, "me", "ホスト")
    },
    expect: [
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
        "自分.ダイヤドカリ.BP: 7000 → なし",
        "自分.ダイヤドカリ.コア: 1 → 0",
        "自分.ダイヤドカリ.場所: フィールド → 合体",
        "自分.ホスト.BP: 3000 → 6000",
        "自分.ホスト.疲労: false → true",
        "自分.リザーブ: 10 → 11",
    ],
})

// ---------- BS14-040 リュードロイド／BS14-043 マーニ（氷壁）----------
const RYU = "BS14-040"
const MANI = "BS14-043"
const OZ = "BS16-081" // マジック・オブ・オズ（黄・コスト4・メイン：手札すべてを破棄することで3枚ドロー）
is(RYU, "勇機リュードロイド", "spirit")
is(MANI, "月光姫マーニ", "spirit")
is(OZ, "マジック・オブ・オズ", "magic", (c) => c.colors[0] === "yellow" && c.cost === 4)
const iceStart = (card: string, cores: number, hand: string[]) => ({
    interactive: true,
    turn: "opp" as Side,
    me: { spirits: [{ card, cores }] },
    opp: { hand },
})
const castAndCount = (expected: number, decline = false) => (t: ScenarioCtx) => assert(cast(t, decline) === expected, `確認は${expected}回`)
console.log("=== 16-1. リュードロイドLv2：相手の黄マジックを疲労して無効にする（相手の手札が捨てられない） ===")
scenario({ name: "ryu-yes", start: iceStart(RYU, 3, [OZ, V]), steps: castAndCount(1), expect: [
        "相手.トラッシュ: なし → マジック・オブ・オズ",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "相手.手札: マジック・オブ・オズ、ロクケラトプス → ロクケラトプス",
        "自分.勇機リュードロイド.疲労: false → true",
    ] })
console.log("=== 16-2. リュードロイドLv1：【氷壁】はLv2から。確認は出ずマジックが通る ===")
scenario({ name: "ryu-lv1", start: iceStart(RYU, 1, [OZ, V]), steps: castAndCount(0), expect: [
        "相手.デッキ枚数: 40 → 37",
        "相手.トラッシュ: なし → マジック・オブ・オズ、ロクケラトプス",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "相手.手札: マジック・オブ・オズ、ロクケラトプス → ロクケラトプス、ロクケラトプス、ロクケラトプス",
    ] })
console.log("=== 16-3. リュードロイドLv2：赤マジックは対象外 ===")
scenario({ name: "ryu-red", start: iceStart(RYU, 3, [DOUBLE]), steps: castAndCount(0), expect: [
        "相手.デッキ枚数: 40 → 38",
        "相手.トラッシュ: なし → ダブルドロー",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "相手.手札: ダブルドロー → ロクケラトプス、ロクケラトプス",
    ] })
console.log("=== 17-1. マーニ：相手の赤マジックを疲労して無効にする ===")
scenario({ name: "mani-yes", start: iceStart(MANI, 2, [DOUBLE]), steps: castAndCount(1), expect: [
        "相手.トラッシュ: なし → ダブルドロー",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "相手.手札: ダブルドロー → なし",
        "自分.月光姫マーニ.疲労: false → true",
    ] })
console.log("=== 17-2. マーニ：黄マジックは対象外 ===")
scenario({ name: "mani-yellow", start: iceStart(MANI, 2, [OZ, V]), steps: castAndCount(0), expect: [
        "相手.デッキ枚数: 40 → 37",
        "相手.トラッシュ: なし → マジック・オブ・オズ、ロクケラトプス",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "相手.手札: マジック・オブ・オズ、ロクケラトプス → ロクケラトプス、ロクケラトプス、ロクケラトプス",
    ] })

// ---------- BS14-055 ミスティック・ヒミコ（バースト：ライフ減少後、トラッシュにマジック3枚以上で召喚）----------
const HIMIKO = "BS14-055"
const WILD = "BS01-133" // ワイルドパワー（緑マジック）
is(HIMIKO, "ミスティック・ヒミコ", "spirit", (c) => c.cost === 7)
is(WILD, "ワイルドパワー", "magic")
const himikoStart = (trash: string[]) => ({
    interactive: true,
    turn: "opp" as Side,
    me: { burst: HIMIKO, trash },
    opp: { spirits: [{ card: V, label: "アタッカー" }] },
})
const himikoSteps = (expected: number, decline = false) => (t: ScenarioCtx) => assert(attack(t, "opp", "アタッカー", { decline }) === expected, `確認は${expected}回`)
console.log("=== 18-1. ヒミコ：トラッシュにマジック3枚あれば、ライフ減少後に召喚される（確認1回） ===")
scenario({ name: "himiko-yes", start: himikoStart([WILD, WILD, WILD]), steps: himikoSteps(1), expect: [
        "相手.アタッカー.疲労: false → true",
        "自分.バースト: ミスティック・ヒミコ → なし",
        "自分.ミスティック・ヒミコ.BP: なし → 4000",
        "自分.ミスティック・ヒミコ.Lv: なし → 1",
        "自分.ミスティック・ヒミコ.コア: なし → 1",
        "自分.ミスティック・ヒミコ.場所: なし → フィールド",
        "自分.ミスティック・ヒミコ.疲労: なし → false",
        "自分.ライフ: 5 → 4",
    ] })
console.log("=== 18-2. ヒミコ：マジックが2枚でも、出来事が起きたので発動確認は出る。断ればセットされたまま ===")
scenario({ name: "himiko-two", start: himikoStart([WILD, WILD, V]), steps: himikoSteps(1, true), expect: [
        "相手.アタッカー.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ] })
console.log("=== 18-2b. ヒミコ：マジックが2枚で発動すると、召喚されずバーストのカードがトラッシュに置かれる ===")
scenario({
    name: "himiko-two-accept",
    start: himikoStart([WILD, WILD, V]),
    steps: himikoSteps(1),
    expect: [
        "相手.アタッカー.疲労: false → true",
        "自分.バースト: ミスティック・ヒミコ → なし",
        "自分.トラッシュ: ロクケラトプス、ワイルドパワー、ワイルドパワー → ミスティック・ヒミコ、ロクケラトプス、ワイルドパワー、ワイルドパワー",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})
console.log("=== 18-3. ヒミコ：断れば召喚されず、バーストはセットされたまま ===")
scenario({ name: "himiko-decline", start: himikoStart([WILD, WILD, WILD]), steps: himikoSteps(1, true), expect: [
        "相手.アタッカー.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ] })

// ---------- BS14-084 永久凍土の王都（トラッシュにあるこのネクサスは一切の効果を受けない）----------
const OUTO = "BS14-084"
const TAIMA = "BS14-113" // 退魔絶刀角（青・コスト5・フラッシュ：相手のトラッシュにあるカード1枚を相手のデッキの下に戻す）
is(OUTO, "永久凍土の王都", "nexus")
is(TAIMA, "退魔絶刀角", "magic", (c) => c.colors[0] === "blue" && c.cost === 5)
console.log("=== 19-1. 王都：トラッシュにある王都は、相手の「トラッシュのカードをデッキの下に戻す」効果の対象にならない ===")
scenario({
    name: "outo-trash",
    start: { turn: "opp", me: { trash: [OUTO] }, opp: { hand: [TAIMA] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0 }),
    expect: [
        "相手.トラッシュ: なし → 退魔絶刀角",
        "相手.トラッシュのコア: 0 → 5",
        "相手.リザーブ: 10 → 5",
        "相手.手札: 退魔絶刀角 → なし",
    ],
})
console.log("=== 19-2. 王都：普通のカードがトラッシュにあれば同じ効果で戻される ===")
scenario({
    name: "outo-control",
    start: { turn: "opp", me: { trash: [V] }, opp: { hand: [TAIMA] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0 }),
    expect: [
        "相手.トラッシュ: なし → 退魔絶刀角",
        "相手.トラッシュのコア: 0 → 5",
        "相手.リザーブ: 10 → 5",
        "相手.手札: 退魔絶刀角 → なし",
        "自分.デッキ枚数: 40 → 41",
        "自分.トラッシュ: ロクケラトプス → なし",
    ],
})

//// ▼挿入位置
console.log("すべてのチェックに合格しました 🎉（part480）")

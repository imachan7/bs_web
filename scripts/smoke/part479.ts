// smoke パート479（BS10 の未発火エントリを場面テストで発火させる：期待値役が効果文だけから書いたもの）
import { assert, effectiveBp, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side, SideSpec } from "./scenario"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000）
const AIBARN = "BS01-005" // アイバーン（赤・コスト2・BP2000）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・BP3000）
const ESPADA = "BS06-008" // 刀剣魚エスパーダ（赤・コスト4・Lv1 BP4000／Lv2 3コア BP7000）
const MATA = "BS10-028" // マタンゴル（緑・コスト5・Lv1 BP6000／Lv2 3コア BP8000）
const GUGA = "BS16-048" // グガランナー（青・コスト3・Lv2『アタック時』コスト3以下を破壊）
const MALICE = "BS10-014"
const KIKAZAAL = "BS10-043"
const PHENIC = "BS10-062"
const KAKUREIN = "BS10-069"
const FENRIR = "BS10-071"
const ONIYURIN = "BS10-075"
const BAZOOKA = "BS10-076"
const KUMATTER = "BS10-074"
const GYOKURYUN = "BS10-077"
const DESK = "BS10-079" // そびえる机山群
const AURA = "BS10-106" // プロテクトオーラ
const GOLEM = "BS10-059"
const GAIASURA = "BS10-X01"
const NEXUS = "BS01-099" // 百識の谷（ドローステップ限定の効果のみ。盤面には影響しない）
const CORESTEAL = "BS10-102" // コアスティール（紫・コスト4）
const DREAMRIBBON = "BS01-146" // ドリームリボン（白・コスト4）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, name: string, type: string, cost: number) => {
        const c = getCard(id)
        assert(c.name === name && c.type === type && c.cost === cost, `${id} は ${name}（${type}・コスト${cost}）`)
    }
    chk(VAN, "ロクケラトプス", "spirit", 1)
    chk(AIBARN, "アイバーン", "spirit", 2)
    chk(METAL, "メタルバーン", "spirit", 3)
    chk(ESPADA, "刀剣魚エスパーダ", "spirit", 4)
    chk(MATA, "マタンゴル", "spirit", 5)
    chk(GUGA, "グガランナー", "spirit", 3)
    chk(MALICE, "闇騎士マリス", "spirit", 3)
    chk(KIKAZAAL, "キカザール", "spirit", 2)
    chk(PHENIC, "砲凰竜フェニック・キャノン", "brave", 5)
    chk(KAKUREIN, "千刀鳥カクレイン", "brave", 5)
    chk(FENRIR, "フェンリルキャノンType-B", "brave", 4)
    chk(ONIYURIN, "オニユリン", "brave", 5)
    chk(BAZOOKA, "バズーカ・アームズ", "brave", 3)
    chk(KUMATTER, "きぐるみクマッター", "brave", 4)
    chk(GYOKURYUN, "ギョクリューン", "brave", 4)
    chk(DESK, "そびえる机山群", "nexus", 3)
    chk(AURA, "プロテクトオーラ", "magic", 3)
    chk(GOLEM, "フォート・ゴレム", "spirit", 6)
    chk(GAIASURA, "幻羅星龍ガイ・アスラ", "spirit", 10)
    chk(NEXUS, "百識の谷", "nexus", 4)
    chk(CORESTEAL, "コアスティール", "magic", 4)
    chk(DREAMRIBBON, "ドリームリボン", "magic", 4)
    assert(getCard(VAN).effects.length === 0 && getCard(AIBARN).effects.length === 0 && getCard(METAL).effects.length === 0, "脇役はバニラ")
    assert(getCard(ESPADA).effects.length === 0 && getCard(MATA).effects.length === 0, "ホスト役はバニラ")
}

const pidOf = (t: ScenarioCtx, side: Side) => (side === "me" ? t.me : t.opp)
const other = (side: Side): Side => (side === "me" ? "opp" : "me")

const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && (pc.options ?? []).includes("発動する")
}

// 確認が出たら押す。出た回数を返す
function drive(t: ScenarioCtx): number {
    let confirms = 0
    while (t.state.pendingChoice) {
        const pc = t.state.pendingChoice
        const side: Side = pc.pid === t.me ? "me" : "opp"
        if (!isConfirm(t)) throw new Error(`確認以外の選択待ち: ${pc.prompt}`)
        confirms++
        t.act(side, { type: "resolveChoice", option: "発動する" })
        if (confirms > 5) throw new Error("確認が繰り返し出ている")
    }
    return confirms
}

// カードIDで渡されたらカード名（ラベルの既定）に直す
const L = (x: string) => (/^[A-Z]+\d*-/.test(x) ? getCard(x).name : x)

function combine(t: ScenarioCtx, brave: string, host: string) {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id(L(brave)), hostInstanceId: t.id(L(host)) })
}

function attackAs(t: ScenarioCtx, side: Side, who: string) {
    t.act(side, { type: "nextPhase" })
    t.act(side, { type: "attack", instanceId: t.id(L(who)) })
}

// フラッシュ①で side が優先権を持つ状態にする
function takePriority(t: ScenarioCtx, side: Side) {
    assert(t.state.isFlashTiming && t.state.battle !== null, "フラッシュタイミング中")
    if (t.state.priorityPlayer !== pidOf(t, side)) t.act(t.state.priorityPlayer === t.me ? "me" : "opp", { type: "pass" })
    assert(t.state.isFlashTiming && t.state.priorityPlayer === pidOf(t, side), `${side} が優先権を持つ`)
}

// 防御側が「ライフで受ける」→フラッシュを閉じる
function takeLife(t: ScenarioCtx, defender: Side) {
    t.closeFlash()
    t.act(defender, { type: "takeLife" })
    t.closeFlash()
}

// 防御側が blocker でブロックする→フラッシュを閉じる
function blockWith(t: ScenarioCtx, defender: Side, blocker: string) {
    t.closeFlash()
    t.act(defender, { type: "block", instanceId: t.id(L(blocker)) })
    t.closeFlash()
}

// 合体の結果の盤面（ブレイヴは合体の列へ移ってBPの行が消え、ホストのBPは合体時BPぶん増える）
const combined = (side: "自分" | "相手", brave: string, host: string, hostBp: number, braveBp: number, braveBpBefore = 0) => [
    `${side}.${brave}.場所: フィールド → 合体`,
    `${side}.${brave}.BP: ${braveBpBefore} → なし`, // コア0のブレイヴは写像上 Lv0・BP0。合体の列に移ると BP の行が消え、Lv は1と数える
    `${side}.${brave}.Lv: 0 → 1`,
    `${side}.${host}.BP: ${hostBp} → ${hostBp + braveBp}`,
]

// ============================================================
// BS10-014 闇騎士マリス：Lv2 相手のスピリットの効果で破壊されたとき、その効果を発揮したスピリット上のコアすべてを相手のトラッシュに置く
// ============================================================
console.log("=== マリス1. Lv2：相手のスピリット（グガランナー）の効果で破壊→グガランナー上のコアすべてが相手のトラッシュへ（0コアで消える） ===")
scenario({
    name: "malice-lv2-by-effect",
    start: {
        turn: "opp",
        me: { spirits: [{ card: MALICE, cores: 3 }] },
        opp: { spirits: [{ card: GUGA, cores: 3 }] },
    },
    steps: (t) => {
        attackAs(t, "opp", GUGA)
        t.closeFlash()
        if (t.state.battle) takeLife(t, "me")
    },
    expect: [
        "自分.闇騎士マリス.場所: フィールド → なし",
        "自分.トラッシュ: なし → 闇騎士マリス",
        "自分.リザーブ: 10 → 13",
        "相手.グガランナー.場所: フィールド → なし",
        "相手.トラッシュ: なし → グガランナー",
        "相手.トラッシュのコア: 0 → 3",
    ],
})

console.log("=== マリス2. Lv1 では発揮しない：グガランナーのコアはそのまま ===")
scenario({
    name: "malice-lv1",
    start: {
        turn: "opp",
        me: { spirits: [{ card: MALICE, cores: 1 }] },
        opp: { spirits: [{ card: GUGA, cores: 3 }] },
    },
    steps: (t) => {
        attackAs(t, "opp", GUGA)
        t.closeFlash()
        if (t.state.battle) takeLife(t, "me")
    },
    expect: [
        "自分.闇騎士マリス.場所: フィールド → なし",
        "自分.トラッシュ: なし → 闇騎士マリス",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 12",
        "相手.グガランナー.疲労: false → true",
    ],
})

console.log("=== マリス3. Lv2 でも BP バトルで破壊されたのは相手のスピリットの効果ではない ===")
scenario({
    name: "malice-lv2-by-battle",
    start: {
        turn: "opp",
        me: { spirits: [{ card: MALICE, cores: 3 }] },
        opp: { spirits: [{ card: MATA, cores: 1 }] },
    },
    steps: (t) => {
        attackAs(t, "opp", MATA)
        blockWith(t, "me", MALICE)
    },
    expect: [
        "自分.闇騎士マリス.場所: フィールド → なし",
        "自分.トラッシュ: なし → 闇騎士マリス",
        "自分.リザーブ: 10 → 13",
        "相手.マタンゴル.疲労: false → true",
    ],
})

// ============================================================
// BS10-043 キカザール：お互いのアタックステップ、コスト2の自分のスピリットが破壊されたとき1枚ドロー
// ============================================================
const kikaOpp = { turn: "opp" as const, me: { spirits: [{ card: KIKAZAAL }, { card: AIBARN, label: "ブロッカー" }] }, opp: { spirits: [{ card: MATA, cores: 1 }] } }

console.log("=== キカザール1. 相手のアタック中、コスト2の自分のスピリットがブロックして破壊→1枚ドロー ===")
scenario({
    name: "kika-cost2",
    start: kikaOpp,
    steps: (t) => {
        attackAs(t, "opp", MATA)
        blockWith(t, "me", "ブロッカー")
    },
    expect: [
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → アイバーン",
        "自分.リザーブ: 10 → 11",
        "自分.手札: なし → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "相手.マタンゴル.疲労: false → true",
    ],
})

console.log("=== キカザール2. コスト1のスピリットが破壊されてもドローしない ===")
scenario({
    name: "kika-cost1",
    start: { ...kikaOpp, me: { spirits: [{ card: KIKAZAAL }, { card: VAN, label: "ブロッカー" }] } },
    steps: (t) => {
        attackAs(t, "opp", MATA)
        blockWith(t, "me", "ブロッカー")
    },
    expect: [
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
        "相手.マタンゴル.疲労: false → true",
    ],
})

console.log("=== キカザール3. 相手のコスト2のスピリットが破壊されても自分はドローしない ===")
scenario({
    name: "kika-opp-side",
    start: { turn: "me", me: { spirits: [{ card: KIKAZAAL }, { card: MATA, cores: 1 }] }, opp: { spirits: [{ card: AIBARN, label: "ブロッカー" }] } },
    steps: (t) => {
        attackAs(t, "me", MATA)
        blockWith(t, "opp", "ブロッカー")
    },
    expect: [
        "自分.マタンゴル.疲労: false → true",
        "相手.ブロッカー.場所: フィールド → なし",
        "相手.トラッシュ: なし → アイバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== キカザール4. 自分のアタックステップでも働く（自分のターンに自分のコスト2がブロックされて破壊） ===")
scenario({
    name: "kika-own-attack-step",
    start: { turn: "me", me: { spirits: [{ card: KIKAZAAL }, { card: AIBARN, label: "アタッカー" }] }, opp: { spirits: [{ card: MATA, cores: 1 }] } },
    steps: (t) => {
        attackAs(t, "me", "アタッカー")
        blockWith(t, "opp", MATA)
    },
    expect: [
        "自分.アタッカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → アイバーン",
        "自分.リザーブ: 10 → 11",
        "自分.手札: なし → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "相手.マタンゴル.疲労: false → true",
    ],
})

// ============================================================
// BS10-062 砲凰竜フェニック・キャノン：【合体時】【激突】『アタック時』相手は可能ならスピリットでブロックする
// ============================================================
const phenicMe = { spirits: [{ card: METAL, label: "ホスト" }, { card: PHENIC, cores: 0, label: "ブレイヴ" }] }

console.log("=== フェニック1. 合体アタック：ブロックできるスピリットがいればライフでは受けられず、ブロックする ===")
scenario({
    name: "phenic-forced-block",
    start: { me: phenicMe, opp: { spirits: [{ card: VAN, label: "防御" }] } },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        attackAs(t, "me", "ホスト")
        t.closeFlash()
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("防御") })
        t.closeFlash()
    },
    expect: [
        ...combined("自分", "ブレイヴ", "ホスト", 3000, 3000),
        "自分.ホスト.疲労: false → true",
        "相手.防御.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== フェニック2. ブロックできるスピリットがいない（全員疲労）ならライフで受けられる ===")
scenario({
    name: "phenic-no-blocker",
    start: { me: phenicMe, opp: { spirits: [{ card: VAN, label: "防御", rested: true }] } },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        attackAs(t, "me", "ホスト")
        takeLife(t, "opp")
    },
    expect: [
        ...combined("自分", "ブレイヴ", "ホスト", 3000, 3000),
        "自分.ホスト.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== フェニック3. 合体していなければ強制されない（ブロックできる相手がいてもライフで受けられる） ===")
scenario({
    name: "phenic-not-combined",
    start: { me: phenicMe, opp: { spirits: [{ card: VAN, label: "防御" }] } },
    steps: (t) => {
        attackAs(t, "me", "ホスト")
        takeLife(t, "opp")
    },
    expect: ["自分.ホスト.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ============================================================
// BS10-069 千刀鳥カクレイン：【合体時】【暴風：2】『合体アタック時』ブロックされたとき、相手は相手のスピリット2体を疲労させる
// ============================================================
const kakuMe = { spirits: [{ card: MATA, cores: 1, label: "ホスト" }, { card: KAKUREIN, cores: 0, label: "ブレイヴ" }] }
const kakuOpp = { spirits: [{ card: VAN, label: "防御" }, { card: VAN, label: "余り" }] }

console.log("=== カクレイン1. 合体アタックがブロックされると、相手のスピリット2体（ブロックした個体と余りの1体）が疲労する ===")
scenario({
    name: "kaku-blocked",
    start: { me: kakuMe, opp: kakuOpp },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        attackAs(t, "me", "ホスト")
        blockWith(t, "opp", "防御")
    },
    expect: [
        ...combined("自分", "ブレイヴ", "ホスト", 6000, 5000),
        "自分.ホスト.疲労: false → true",
        "相手.余り.疲労: false → true",
        "相手.防御.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== カクレイン2. ブロックされなければ疲労させない ===")
scenario({
    name: "kaku-unblocked",
    start: { me: kakuMe, opp: kakuOpp },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        attackAs(t, "me", "ホスト")
        takeLife(t, "opp")
    },
    expect: [
        ...combined("自分", "ブレイヴ", "ホスト", 6000, 5000),
        "自分.ホスト.疲労: false → true",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== カクレイン3. 合体していなければ、ブロックされても疲労させない ===")
scenario({
    name: "kaku-not-combined",
    start: { me: kakuMe, opp: kakuOpp },
    steps: (t) => {
        attackAs(t, "me", "ホスト")
        blockWith(t, "opp", "防御")
    },
    expect: [
        "自分.ホスト.疲労: false → true",
        "相手.防御.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// BS10-071 フェンリルキャノンType-B：【合体時】【装甲：赤/紫】相手の赤/紫のスピリット/ネクサス/マジックの効果を受けない
// ============================================================
const fenMe = { spirits: [{ card: ESPADA, cores: 3, label: "ホスト" }, { card: FENRIR, cores: 0, label: "ブレイヴ" }] }
const stealer = { reserve: 10, hand: [CORESTEAL] }

console.log("=== フェンリル1. 合体中は相手の紫マジック（コアスティール）の効果を受けない ===")
scenario({
    name: "fenrir-armor",
    start: { me: fenMe, opp: stealer },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        attackAs(t, "me", "ホスト")
        takePriority(t, "opp")
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ホスト") })
        takeLife(t, "opp")
    },
    expect: [
        ...combined("自分", "ブレイヴ", "ホスト", 7000, 3000),
        "自分.ホスト.疲労: false → true",
        "相手.手札: コアスティール → なし",
        "相手.トラッシュ: なし → コアスティール",
        "相手.トラッシュのコア: 0 → 4",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 8",
    ],
})

console.log("=== フェンリル2. 合体していなければ（ブレイヴ無し）同じマジックの効果を受ける ===")
scenario({
    name: "fenrir-no-armor",
    start: { me: { spirits: [{ card: ESPADA, cores: 3, label: "ホスト" }] }, opp: stealer },
    steps: (t) => {
        attackAs(t, "me", "ホスト")
        takePriority(t, "opp")
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ホスト") })
        takeLife(t, "opp")
    },
    expect: [
        "自分.ホスト.疲労: false → true",
        "自分.ホスト.コア: 3 → 1",
        "自分.ホスト.Lv: 2 → 1",
        "自分.ホスト.BP: 7000 → 4000",
        "自分.リザーブ: 10 → 12",
        "相手.手札: コアスティール → なし",
        "相手.トラッシュ: なし → コアスティール",
        "相手.トラッシュのコア: 0 → 4",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 7",
    ],
})

// ============================================================
// BS10-075 オニユリン：【合体時】【聖命】『合体アタック時』このスピリットのアタックで相手のライフを減らしたとき、ボイドからコア1個を自分のライフに置く
// ============================================================
const oniMe = { spirits: [{ card: MATA, cores: 1, label: "ホスト" }, { card: ONIYURIN, cores: 0, label: "ブレイヴ" }] }

console.log("=== オニユリン1. 合体アタックで相手のライフを減らしたら、自分のライフが1増える ===")
scenario({
    name: "oni-lifegain",
    start: { me: oniMe },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        attackAs(t, "me", "ホスト")
        takeLife(t, "opp")
    },
    expect: [
        ...combined("自分", "ブレイヴ", "ホスト", 6000, 3000),
        "自分.ホスト.疲労: false → true",
        "自分.ライフ: 5 → 6",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== オニユリン2. ブロックされてライフが減らなければ増えない ===")
scenario({
    name: "oni-blocked",
    start: { me: oniMe, opp: { spirits: [{ card: VAN, label: "防御" }] } },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        attackAs(t, "me", "ホスト")
        blockWith(t, "opp", "防御")
    },
    expect: [
        ...combined("自分", "ブレイヴ", "ホスト", 6000, 3000),
        "自分.ホスト.疲労: false → true",
        "相手.防御.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== オニユリン3. 合体していなければ増えない ===")
scenario({
    name: "oni-not-combined",
    start: { me: oniMe },
    steps: (t) => {
        attackAs(t, "me", "ホスト")
        takeLife(t, "opp")
    },
    expect: ["自分.ホスト.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ============================================================
// BS10-076 バズーカ・アームズ：【合体時】【強襲：1】『合体アタック時』ターン中に1回まで、自分のネクサス1つを疲労させることで回復できる
// ============================================================
const bazMe = (nexusRested?: boolean): SideSpec => ({
    spirits: [{ card: VAN, label: "ホスト" }, { card: BAZOOKA, cores: 0, label: "ブレイヴ" }],
    nexuses: [{ card: NEXUS, cores: 0, label: "ネクサス", rested: nexusRested ?? false }],
})
const bazAttack = (t: ScenarioCtx) => {
    combine(t, "ブレイヴ", "ホスト")
    attackAs(t, "me", "ホスト")
}
const bazBase = [...combined("自分", "ブレイヴ", "ホスト", 1000, 2000), "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]

console.log("=== バズーカ1. 対話：ネクサスを疲労させて回復する（確認は1回） ===")
scenario({
    name: "bazooka-accept",
    start: { interactive: true, me: bazMe() },
    steps: (t) => {
        bazAttack(t)
        assert(drive(t) === 1, "確認は1回")
        takeLife(t, "opp")
    },
    expect: [...bazBase, "自分.ネクサス.疲労: false → true"],
})

console.log("=== バズーカ2. 対話：断ればネクサスも疲労せず、ホストは回復しない ===")
scenario({
    name: "bazooka-decline",
    start: { interactive: true, me: bazMe() },
    steps: (t) => {
        bazAttack(t)
        assert(isConfirm(t), "確認が出る")
        t.act("me", { type: "resolveChoice" })
        assert(t.state.pendingChoice === null, "断ったら選択待ちは残らない")
        takeLife(t, "opp")
    },
    expect: [...bazBase, "自分.ホスト.疲労: false → true"],
})

console.log("=== バズーカ3. 非対話：払えるなら自動で払って回復する ===")
scenario({
    name: "bazooka-auto",
    start: { me: bazMe() },
    steps: (t) => {
        bazAttack(t)
        takeLife(t, "opp")
    },
    expect: [...bazBase, "自分.ネクサス.疲労: false → true"],
})

console.log("=== バズーカ4. 対話：ネクサスが既に疲労していれば確認を出さず、回復しない ===")
scenario({
    name: "bazooka-nexus-rested",
    start: { interactive: true, me: bazMe(true) },
    steps: (t) => {
        bazAttack(t)
        assert(t.state.pendingChoice === null, "確認は出ない")
        takeLife(t, "opp")
    },
    expect: [...bazBase, "自分.ホスト.疲労: false → true"],
})

console.log("=== バズーカ5. 対話：ネクサスが無ければ確認を出さず、回復しない ===")
scenario({
    name: "bazooka-no-nexus",
    start: { interactive: true, me: { spirits: [{ card: VAN, label: "ホスト" }, { card: BAZOOKA, cores: 0, label: "ブレイヴ" }] } },
    steps: (t) => {
        bazAttack(t)
        assert(t.state.pendingChoice === null, "確認は出ない")
        takeLife(t, "opp")
    },
    expect: [...bazBase, "自分.ホスト.疲労: false → true"],
})

console.log("=== バズーカ6. 合体していなければ強襲は無い（確認なし・回復しない） ===")
scenario({
    name: "bazooka-not-combined",
    start: { interactive: true, me: bazMe() },
    steps: (t) => {
        attackAs(t, "me", "ホスト")
        assert(t.state.pendingChoice === null, "確認は出ない")
        takeLife(t, "opp")
    },
    expect: ["自分.ホスト.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ============================================================
// BS10-074 きぐるみクマッター：【合体時】『バトル時』相手のネクサスすべてを疲労させる。疲労状態のネクサスすべての効果は発揮されない
// ============================================================
const kumaMe = {
    spirits: [{ card: ESPADA, label: "ホスト" }, { card: KUMATTER, cores: 0, label: "ブレイヴ" }, { card: VAN, label: "別" }],
    nexuses: [{ card: DESK, cores: 0, label: "机山群", rested: true }], // 自分のターンに自分のスピリットすべてBP+1000（疲労状態）
}
const kumaOpp = { nexuses: [{ card: NEXUS, cores: 0, label: "相手ネクサス" }] }

console.log("=== クマッター1. 合体アタックのバトル時、相手のネクサスが疲労し、疲労状態のネクサス（自分の机山群を含む）の効果は発揮されない ===")
scenario({
    name: "kuma-combined",
    start: { me: kumaMe, opp: kumaOpp },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        attackAs(t, "me", "ホスト")
        assert(t.inst("相手ネクサス").isRested, "相手のネクサスが疲労した")
        assert(effectiveBp(t.state, t.me, t.inst("別")) === 1000, "疲労状態の机山群のBP+1000は発揮されない（別のBPは素の1000）")
        takeLife(t, "opp")
    },
    expect: [
        ...combined("自分", "ブレイヴ", "ホスト", 5000, 4000, 1000),
        "自分.ホスト.疲労: false → true",
        "相手.相手ネクサス.疲労: false → true",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== クマッター2. 合体していなければ、相手のネクサスは疲労せず、机山群の効果も働いたまま ===")
scenario({
    name: "kuma-not-combined",
    start: { me: kumaMe, opp: kumaOpp },
    steps: (t) => {
        attackAs(t, "me", "ホスト")
        assert(!t.inst("相手ネクサス").isRested, "相手のネクサスは疲労しない")
        assert(effectiveBp(t.state, t.me, t.inst("別")) === 2000, "疲労状態でも机山群のBP+1000は発揮される前提のまま（別は2000）")
        takeLife(t, "opp")
    },
    expect: ["自分.ホスト.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ============================================================
// BS10-077 ギョクリューン：【合体時】『バトル時』相手はマジックの効果を使用するとき、2コスト余分に支払わなければならない
// ============================================================
const gyoMe = { spirits: [{ card: ESPADA, label: "ホスト" }, { card: GYOKURYUN, cores: 0, label: "ブレイヴ" }] }
const castAura = (t: ScenarioCtx) => {
    takePriority(t, "opp")
    t.act("opp", { type: "castMagic", handIndex: 0 })
}

console.log("=== ギョクリューン1. 合体アタックのバトル時：コスト3のマジックはリザーブ5で使えて、5コア払う ===")
scenario({
    name: "gyoku-pay5",
    start: { me: gyoMe, opp: { reserve: 5, hand: [AURA] } },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        attackAs(t, "me", "ホスト")
        castAura(t)
        takeLife(t, "opp")
    },
    expect: [
        ...combined("自分", "ブレイヴ", "ホスト", 4000, 3000),
        "自分.ホスト.疲労: false → true",
        "相手.手札: プロテクトオーラ → なし",
        "相手.トラッシュ: なし → プロテクトオーラ",
        "相手.トラッシュのコア: 0 → 5",
        "相手.リザーブ: 5 → 2",
        "相手.ライフ: 5 → 3",
    ],
})

console.log("=== ギョクリューン2. リザーブ4ではコスト3のマジックを使えない（2コスト余分に必要） ===")
scenario({
    name: "gyoku-short",
    start: { me: gyoMe, opp: { reserve: 4, hand: [AURA] } },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        attackAs(t, "me", "ホスト")
        takePriority(t, "opp")
        t.actRejected("opp", { type: "castMagic", handIndex: 0 })
        takeLife(t, "opp")
    },
    expect: [
        ...combined("自分", "ブレイヴ", "ホスト", 4000, 3000),
        "自分.ホスト.疲労: false → true",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 4 → 6",
    ],
})

console.log("=== ギョクリューン3. 合体していなければ、リザーブ3でコスト3のマジックを使える ===")
scenario({
    name: "gyoku-not-combined",
    start: { me: gyoMe, opp: { reserve: 3, hand: [AURA] } },
    steps: (t) => {
        attackAs(t, "me", "ホスト")
        castAura(t)
        takeLife(t, "opp")
    },
    expect: [
        "自分.ホスト.疲労: false → true",
        "相手.手札: プロテクトオーラ → なし",
        "相手.トラッシュ: なし → プロテクトオーラ",
        "相手.トラッシュのコア: 0 → 3",
        "相手.リザーブ: 3 → 1",
        "相手.ライフ: 5 → 4",
    ],
})

// ============================================================
// BS10-079 そびえる机山群：Lv2 自分の合体スピリットすべては、相手の効果ではフィールドから手札に戻らない
// ============================================================
const deskMe = (lv2: boolean) => ({
    spirits: [{ card: METAL, label: "ホスト" }, { card: PHENIC, cores: 0, label: "ブレイヴ" }, { card: VAN, label: "別" }],
    nexuses: [{ card: DESK, cores: lv2 ? 1 : 0, label: "机山群" }],
})
const ribbon = { reserve: 10, hand: [DREAMRIBBON] }
// 机山群（自分のターン）のBP+1000が全スピリットに乗っている前提。合体で 4000 → 7000
const deskCombined = combined("自分", "ブレイヴ", "ホスト", 4000, 3000, 1000)
const ribbonPaid = [
    "相手.手札: ドリームリボン → なし",
    "相手.トラッシュ: なし → ドリームリボン",
    "相手.トラッシュのコア: 0 → 4",
]

console.log("=== 机山群1. Lv2：相手のマジック（手札に戻す）を受けても合体スピリットはフィールドに残る ===")
scenario({
    name: "desk-lv2-combined",
    start: { me: deskMe(true), opp: ribbon },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        attackAs(t, "me", "ホスト")
        takePriority(t, "opp")
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ホスト") })
        takeLife(t, "opp")
    },
    expect: [...deskCombined, "自分.ホスト.疲労: false → true", ...ribbonPaid, "相手.リザーブ: 10 → 7", "相手.ライフ: 5 → 4"],
})

console.log("=== 机山群2. Lv2 でも、合体していないスピリットは手札に戻る ===")
scenario({
    name: "desk-lv2-plain",
    start: { me: deskMe(true), opp: ribbon },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        attackAs(t, "me", "ホスト")
        takePriority(t, "opp")
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("別") })
        takeLife(t, "opp")
    },
    expect: [
        ...deskCombined,
        "自分.ホスト.疲労: false → true",
        "自分.別.場所: フィールド → なし",
        "自分.手札: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
        ...ribbonPaid,
        "相手.リザーブ: 10 → 7",
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== 机山群3. Lv1 では守られず、合体スピリットのホストが手札に戻る（ブレイヴはフィールドに残る前提） ===")
scenario({
    name: "desk-lv1-combined",
    start: { me: deskMe(false), opp: ribbon },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        attackAs(t, "me", "ホスト")
        takePriority(t, "opp")
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ホスト") })
        t.closeFlash()
    },
    expect: [
        "自分.ホスト.場所: フィールド → なし",
        "自分.手札: なし → メタルバーン",
        "自分.リザーブ: 10 → 11",
        ...ribbonPaid,
        "相手.リザーブ: 10 → 6",
    ],
})

// ============================================================
// BS10-106 プロテクトオーラ：このターンの間、ブロックしている自分のスピリットすべてをBP+2000。さらにブロックしている自分の合体スピリットすべてをBP+3000
// ============================================================
const auraPaid = [
    "自分.手札: プロテクトオーラ → なし",
    "自分.トラッシュ: なし → プロテクトオーラ",
    "自分.トラッシュのコア: 0 → 3",
    "自分.リザーブ: 10 → 7",
]

console.log("=== オーラ1. ブロックしているスピリットだけ+2000。待機中のスピリットは上がらず、BP2000でBP3000のアタッカーに勝つ ===")
scenario({
    name: "aura-blocker",
    start: {
        turn: "opp",
        me: { hand: [AURA], spirits: [{ card: AIBARN, label: "ブロッカー" }, { card: AIBARN, label: "待機" }] },
        opp: { spirits: [{ card: METAL, label: "アタッカー" }] },
    },
    steps: (t) => {
        attackAs(t, "opp", "アタッカー")
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ブロッカー") })
        takePriority(t, "me")
        t.act("me", { type: "castMagic", handIndex: 0 })
        assert(effectiveBp(t.state, t.me, t.inst("ブロッカー")) === 4000, "ブロックしているスピリットは+2000（4000）")
        assert(effectiveBp(t.state, t.me, t.inst("待機")) === 2000, "ブロックしていないスピリットは上がらない（2000）")
        t.closeFlash()
    },
    expect: [
        ...auraPaid,
        "自分.ブロッカー.疲労: false → true",
        "相手.アタッカー.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== オーラ2. ブロックしている合体スピリットは合計+5000（BP3000→8000）でBP6000のアタッカーに勝つ ===")
scenario({
    name: "aura-combined-blocker",
    start: {
        turn: "me",
        me: { hand: [AURA], spirits: [{ card: VAN, label: "ホスト" }, { card: BAZOOKA, cores: 0, label: "ブレイヴ" }] },
        opp: { spirits: [{ card: MATA, cores: 1, label: "アタッカー" }] },
    },
    steps: (t) => {
        combine(t, "ブレイヴ", "ホスト")
        t.act("me", { type: "endTurn" })
        attackAs(t, "opp", "アタッカー")
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ホスト") })
        takePriority(t, "me")
        t.act("me", { type: "castMagic", handIndex: 0 })
        assert(effectiveBp(t.state, t.me, t.inst("ホスト")) === 8000, "ブロックしている合体スピリットは+2000+3000（3000→8000）")
        t.closeFlash()
    },
    expect: [
        ...combined("自分", "ブレイヴ", "ホスト", 1000, 2000),
        ...auraPaid,
        "相手.手札: なし → ロクケラトプス", // 自分のターンを終えた後の相手のドロー
        "相手.デッキ枚数: 40 → 39",
        "自分.ホスト.疲労: false → true",
        "相手.アタッカー.場所: フィールド → なし",
        "相手.トラッシュ: なし → マタンゴル",
        "相手.リザーブ: 10 → 12", // ターン開始のコア+1とアタッカーのコア+1
    ],
})

// ============================================================
// BS10-059 フォート・ゴレム：自分のネクサスがある間、手札にあるこのスピリットカードのコストを4にする
// ============================================================
console.log("=== ゴレム1. 自分のネクサスがあれば、リザーブ5（コスト4＋スピリットに置く1）で召喚できる ===")
scenario({
    name: "golem-with-nexus",
    start: { me: { reserve: 5, hand: [GOLEM], nexuses: [{ card: NEXUS, cores: 0 }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, level: 1 })
    },
    expect: [
        "自分.手札: フォート・ゴレム → なし",
        "自分.リザーブ: 5 → 0",
        "自分.トラッシュのコア: 0 → 4",
        "自分.フォート・ゴレム.場所: なし → フィールド",
        "自分.フォート・ゴレム.疲労: なし → false",
        "自分.フォート・ゴレム.コア: なし → 1",
        "自分.フォート・ゴレム.Lv: なし → 1",
        "自分.フォート・ゴレム.BP: なし → 4000",
    ],
})

console.log("=== ゴレム2. ネクサスが無ければコスト6のままで、リザーブ5では召喚できない ===")
scenario({
    name: "golem-no-nexus",
    start: { me: { reserve: 5, hand: [GOLEM] } },
    steps: (t) => {
        t.actRejected("me", { type: "summon", handIndex: 0, level: 1 })
    },
    expect: [],
})

console.log("=== ゴレム3. 相手のネクサスでは4にならない（リザーブ5では召喚できない） ===")
scenario({
    name: "golem-opp-nexus",
    start: { me: { reserve: 5, hand: [GOLEM] }, opp: { nexuses: [{ card: NEXUS, cores: 0 }] } },
    steps: (t) => {
        t.actRejected("me", { type: "summon", handIndex: 0, level: 1 })
    },
    expect: [],
})

// ============================================================
// BS10-X01 幻羅星龍ガイ・アスラ：フラッシュ【超覚醒】自分のスピリットのコアを好きなだけこのスピリットに置ける。置いたとき、このスピリットは回復する
// ============================================================
const gaiMe = {
    spirits: [
        { card: GAIASURA, label: "ガイ", cores: 1, rested: true },
        { card: VAN, label: "A", cores: 3 },
        { card: VAN, label: "B", cores: 2 },
    ],
}
const gaiOpp = { spirits: [{ card: VAN, label: "アタッカー" }] }
const gaiBattleEnd = [
    "自分.ライフ: 5 → 4",
    "自分.リザーブ: 10 → 11",
    "相手.アタッカー.疲労: false → true",
]

console.log("=== ガイ1. フラッシュで自分のスピリットからコアを置くと、ガイが回復する ===")
scenario({
    name: "gai-one-source",
    start: { turn: "opp", me: gaiMe, opp: gaiOpp },
    steps: (t) => {
        attackAs(t, "opp", "アタッカー")
        takePriority(t, "me")
        t.act("me", { type: "awaken", instanceId: t.id("ガイ"), fromInstanceId: t.id("A"), count: 2 })
        takeLife(t, "me")
    },
    expect: [
        "自分.ガイ.コア: 1 → 3",
        "自分.ガイ.Lv: 1 → 2",
        "自分.ガイ.BP: 8000 → 10000",
        "自分.ガイ.疲労: true → false",
        "自分.A.コア: 3 → 1",
        "自分.A.Lv: 3 → 1",
        "自分.A.BP: 4000 → 1000",
        ...gaiBattleEnd,
    ],
})

console.log("=== ガイ2. 相手のスピリットのコアは置けない（自分のスピリットのコアだけ） ===")
scenario({
    name: "gai-opp-core",
    start: { turn: "opp", me: gaiMe, opp: { spirits: [{ card: VAN, label: "アタッカー" }, { card: VAN, label: "相手のA", cores: 3 }] } },
    steps: (t) => {
        attackAs(t, "opp", "アタッカー")
        takePriority(t, "me")
        t.actRejected("me", { type: "awaken", instanceId: t.id("ガイ"), fromInstanceId: t.id("相手のA"), count: 2 })
        takeLife(t, "me")
    },
    expect: gaiBattleEnd,
})

console.log("すべてのチェックに合格しました 🎉（part479）")

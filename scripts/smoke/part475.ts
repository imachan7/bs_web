// smoke パート475（BS15 の未発火エントリ：効果文だけから書いた場面テスト。期待値役）
// 実装は見ずに書いている。落ちた場面は実装側を疑う（期待値を実装に合わせて変えないこと）
import { act, assert, currentLevel, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side, SideSpec } from "./scenario"
import type { GameAction } from "./helpers"

const FANFA = "BS15-003" // ファイアファンサウル（赤・コスト3）
const YOKU = "BS15-017" // エンプレス・ヨウクィーン（紫・コスト7）
const HYDRA = "BS15-051" // 虚海獣エメヒドラル（青・コスト4）
const RIVER = "BS15-065" // 大河と絶壁（緑ネクサス）
const CRYSTAL = "BS15-067" // 雪の結晶樹（白ネクサス）
const CHAMP = "BS15-005"
const IBOS = "BS15-014"
const AOI = "BS15-021"
const GBEAR = "BS15-031"
const ALATRON = "BS15-042"
const CATA = "BS15-009"
const HOO = "BS15-027"
const VOLS = "BS15-036"
const NETHER = "BS15-X02"
const ESAR = "BS15-015"
const FENE = "BS15-028"
const ROVEN = "BS15-030"
const MIBLOCK = "BS15-034"
const SAKUEL = "BS15-044"
const TSUN = "BS15-049"
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）
const MARIS = "BS10-014" // 闇騎士マリス（紫・【不死】）
const GAHERIS = "BS11-010" // 闇騎士ガヘリス（紫・【不死】）
const SHEIRON = "BS01-046" // 幻龍シェイロン（紫・Lv2アタック時に「ブロックされない」）
const ROCKGOLEM = "BS03-080" // ロック・ゴレム（青・【粉砕】）
const GENDRILL = "BS08-032" // 知将ゲンドリル（白・【氷壁：赤】）
const DOUBLE = "BS16-025" // タランドーズ（緑・コスト6・シンボル2つ・効果なし・Lv1でBP6000）
const BEETLE = "BS01-050" // ビートビートル（緑・コスト0・効果なし）
const SHOCK = "BS01-054" // ショックイーター（緑・コスト2・軽減[緑]・効果なし）
const GABU = "BS06-028" // ガブノハシ（緑・コスト3・軽減[緑]・【暴風】）
const DDRAW = "BS01-117" // ダブルドロー（赤マジック・メイン：2枚ドロー）
const BURSTCARD = "BS14-099" // 武迅衝（バーストをセットしている状態を作るだけのカード）

console.log("=== 前提: カードの機械確認 ===")
{
    const name = (id: string, n: string, t: string) => assert(getCard(id).name === n && getCard(id).type === t, `${id}は${n}（${t}）`)
    name(FANFA, "ファイアファンサウル", "spirit")
    name(YOKU, "エンプレス・ヨウクィーン", "spirit")
    name(HYDRA, "虚海獣エメヒドラル", "spirit")
    name(RIVER, "大河と絶壁", "nexus")
    name(CRYSTAL, "雪の結晶樹", "nexus")
    name(CHAMP, "虚獣チャンプボンゴル", "spirit")
    name(IBOS, "冥虚獣イボス", "spirit")
    name(AOI, "虚兵アオイ・スビン", "spirit")
    name(GBEAR, "虚獣グラスベア", "spirit")
    name(ALATRON, "オリンピアの天使アラトロン", "spirit")
    name(CATA, "虚龍帝カタストロフドラゴン", "spirit")
    name(HOO, "虚天帝ホウオウガ", "spirit")
    name(VOLS, "虚械帝インフェニット・ヴォルス", "spirit")
    name(NETHER, "虚皇帝ネザード・バァラル", "spirit")
    name(ESAR, "吸血令嬢エサルフリーダ", "spirit")
    name(FENE, "フェネボラック", "spirit")
    name(ROVEN, "愛の女神ロヴン", "spirit")
    name(MIBLOCK, "ミブロック・ジーナス", "spirit")
    name(SAKUEL, "天使サクエル", "spirit")
    name(TSUN, "ツンドッグ・ゴレム", "spirit")
    name(ROKU, "ロクケラトプス", "spirit")
    name(MARIS, "闇騎士マリス", "spirit")
    name(GAHERIS, "闇騎士ガヘリス", "spirit")
    name(SHEIRON, "幻龍シェイロン", "spirit")
    name(ROCKGOLEM, "ロック・ゴレム", "spirit")
    name(GENDRILL, "知将ゲンドリル", "spirit")
    name(DOUBLE, "タランドーズ", "spirit")
    name(BEETLE, "ビートビートル", "spirit")
    name(SHOCK, "ショックイーター", "spirit")
    name(GABU, "ガブノハシ", "spirit")
    name(DDRAW, "ダブルドロー", "magic")
    name(BURSTCARD, "武迅衝", "magic")
    for (const id of [ROKU, DOUBLE, BEETLE, SHOCK]) assert(getCard(id).effects.length === 0, `${getCard(id).name}は効果なし`)
    assert((getCard(DOUBLE).symbol ?? []).length === 2, "タランドーズはシンボル2つ")
    assert(getCard(DOUBLE).levels[0]!.bp === 6000, "タランドーズはLv1でBP6000")
}

// ---------- 共通の道具 ----------
const pidOf = (t: ScenarioCtx, side: Side) => (side === "me" ? t.me : t.opp)
// 拒否されてもよい操作（拒否されるのが正しい場面で使う）
function tryAct(t: ScenarioCtx, side: Side, action: GameAction): string | null {
    return act(t.state, pidOf(t, side), action)
}

const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && (pc.options ?? []).includes("発動する")
}
// 選択待ちがなくなるまで答える。確認が出たら押して回数を返す。それ以外は先頭の候補
function drive(t: ScenarioCtx): number {
    let confirms = 0
    let guard = 0
    while (t.state.pendingChoice) {
        if (guard++ > 20) throw new Error(`選択が終わらない: ${t.state.pendingChoice.prompt}`)
        const pc = t.state.pendingChoice
        const side: Side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            confirms++
            t.act(side, { type: "resolveChoice", option: "発動する" })
        } else if (pc.kind === "option") {
            t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        } else {
            const idxs = (pc as unknown as { cardIndices?: number[] }).cardIndices
            if (pc.candidates && pc.candidates.length > 0) t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0]! })
            else t.act(side, { type: "resolveChoice", cardIndex: idxs![0]! })
        }
    }
    return confirms
}

// 相手がアタックを宣言する（メイン → アタックステップ → 宣言）。確認の回数を返す
function oppAttack(t: ScenarioCtx, who: string): number {
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id(who) })
    return drive(t)
}
// バトルを最後まで進める（自分は takeLife で受ける）
function finishBattle(t: ScenarioCtx): number {
    let n = 0
    if (t.state.battle) {
        t.closeFlash()
        n += drive(t)
        if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" })
        n += drive(t)
    }
    return n
}

const jp = (ids: string[]) => ids.map((c) => getCard(c).name).sort().join("、")

// ================= BS15-003 ファイアファンサウル（起動：手札1枚破棄＋疲労 → 相手のネクサス1つ破壊） =================
console.log("=== BS15-003 ファイアファンサウル ===")
{
    const act1 = (t: ScenarioCtx) => tryAct(t, "me", { type: "activateAbility", instanceId: t.id("ファイアファンサウル"), effectId: "BS15-003-e1" })
    const paid = [
        "自分.ファイアファンサウル.疲労: false → true",
        "自分.手札: ロクケラトプス → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
    ]
    console.log("--- 1. 手札1枚・相手にネクサス → 破棄して疲労し、ネクサスが壊れる ---")
    scenario({
        name: "fanfa-ok",
        start: { me: { hand: [ROKU], spirits: [{ card: FANFA }] }, opp: { nexuses: [{ card: RIVER, cores: 0 }] } },
        steps: (t) => { assert(act1(t) === null, "起動できる") },
        expect: [...paid, "相手.大河と絶壁.場所: ネクサス → なし", "相手.トラッシュ: なし → 大河と絶壁"],
    })
    console.log("--- 2. Lv2でも同じ ---")
    scenario({
        name: "fanfa-lv2",
        start: { me: { hand: [ROKU], spirits: [{ card: FANFA, cores: 3 }] }, opp: { nexuses: [{ card: RIVER, cores: 0 }] } },
        steps: (t) => { assert(act1(t) === null, "起動できる") },
        expect: [...paid, "相手.大河と絶壁.場所: ネクサス → なし", "相手.トラッシュ: なし → 大河と絶壁"],
    })
    console.log("--- 3. 相手にネクサスがいない → 払えず何も起きない ---")
    scenario({
        name: "fanfa-no-nexus",
        start: { me: { hand: [ROKU], spirits: [{ card: FANFA }] } },
        steps: (t) => { act1(t) },
        expect: [],
    })
    console.log("--- 4. 手札が無い → 何も起きない ---")
    scenario({
        name: "fanfa-no-hand",
        start: { me: { spirits: [{ card: FANFA }] }, opp: { nexuses: [{ card: RIVER, cores: 0 }] } },
        steps: (t) => { act1(t) },
        expect: [],
    })
    console.log("--- 5. 既に疲労している → 何も起きない ---")
    scenario({
        name: "fanfa-rested",
        start: { me: { hand: [ROKU], spirits: [{ card: FANFA, rested: true }] }, opp: { nexuses: [{ card: RIVER, cores: 0 }] } },
        steps: (t) => { act1(t) },
        expect: [],
    })
    console.log("--- 6. 自分のネクサスは壊せない（相手のネクサスだけが対象） ---")
    scenario({
        name: "fanfa-own-nexus",
        start: { me: { hand: [ROKU], spirits: [{ card: FANFA }], nexuses: [{ card: RIVER, cores: 0 }] } },
        steps: (t) => { act1(t) },
        expect: [],
    })
}

// ================= BS15-017 エンプレス・ヨウクィーン =================
console.log("=== BS15-017 エンプレス・ヨウクィーン ===")
{
    // バースト：相手による自分のスピリット破壊後。手札5枚以上なら召喚
    const hand5 = [ROKU, ROKU, ROKU, ROKU, ROKU]
    const battleDestroy = (t: ScenarioCtx) => {
        let n = oppAttack(t, "攻撃")
        t.closeFlash()
        n += drive(t)
        t.act("me", { type: "block", instanceId: t.id("盾") })
        n += drive(t)
        t.closeFlash()
        n += drive(t)
        assert(!t.state.battle, "バトルが終わっている")
        return n
    }
    const base = [
        "相手.攻撃.疲労: false → true",
        "自分.盾.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
    ]
    console.log("--- 1. 対話・手札5枚：破壊後に確認1回、押すと召喚される（「召喚する」だけのバーストはコストを払わない。BURST.md 85行。Lv1の1コアだけ置く） ---")
    scenario({
        name: "yoku-burst-ok",
        start: {
            turn: "opp", interactive: true,
            me: { hand: hand5, spirits: [{ card: ROKU, label: "盾" }], burst: YOKU },
            opp: { spirits: [{ card: FANFA, label: "攻撃", cores: 3 }] },
        },
        steps: (t) => { const n = battleDestroy(t); assert(n === 1, `確認は1回（実際 ${n}）`) },
        expect: [
            ...base,
            "自分.バースト: エンプレス・ヨウクィーン → なし",
            "自分.エンプレス・ヨウクィーン.場所: なし → フィールド",
            "自分.エンプレス・ヨウクィーン.疲労: なし → false",
            "自分.エンプレス・ヨウクィーン.コア: なし → 1",
            "自分.エンプレス・ヨウクィーン.Lv: なし → 1",
            "自分.エンプレス・ヨウクィーン.BP: なし → 4000",
        ].filter((l) => l !== "自分.リザーブ: 10 → 11"),
    })
    console.log("--- 2. 手札が4枚 → 召喚されない（バースト自体は発動して捨て札へ） ---")
    scenario({
        name: "yoku-burst-hand4",
        start: {
            turn: "opp", interactive: true,
            me: { hand: [ROKU, ROKU, ROKU, ROKU], spirits: [{ card: ROKU, label: "盾" }], burst: YOKU },
            opp: { spirits: [{ card: FANFA, label: "攻撃", cores: 3 }] },
        },
        steps: (t) => { battleDestroy(t) },
        expect: [...base.filter((l) => l !== "自分.トラッシュ: なし → ロクケラトプス"), "自分.バースト: エンプレス・ヨウクィーン → なし", "自分.トラッシュ: なし → エンプレス・ヨウクィーン、ロクケラトプス"],
    })
    console.log("--- 3. 非対話・手札5枚：条件を満たすので自動で召喚される ---")
    scenario({
        name: "yoku-burst-auto",
        start: {
            turn: "opp",
            me: { hand: hand5, spirits: [{ card: ROKU, label: "盾" }], burst: YOKU },
            opp: { spirits: [{ card: FANFA, label: "攻撃", cores: 3 }] },
        },
        steps: (t) => { battleDestroy(t) },
        expect: [
            "相手.攻撃.疲労: false → true",
            "自分.盾.場所: フィールド → なし",
            "自分.トラッシュ: なし → ロクケラトプス",
            "自分.バースト: エンプレス・ヨウクィーン → なし",
            "自分.エンプレス・ヨウクィーン.場所: なし → フィールド",
            "自分.エンプレス・ヨウクィーン.疲労: なし → false",
            "自分.エンプレス・ヨウクィーン.コア: なし → 1",
            "自分.エンプレス・ヨウクィーン.Lv: なし → 1",
            "自分.エンプレス・ヨウクィーン.BP: なし → 4000",
        ],
    })

    // Lv2『相手のエンドステップ』：手札の【不死】スピリット1枚を破棄することで、トラッシュの紫のスピリット1枚を手札へ
    // 相手がターンを終えると自分のターンが始まるので、ドロー・コア増加の変化も写像に出る
    const nextTurnNoise = [
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 11",
    ]
    console.log("--- 4. 対話：Lv2・手札に【不死】・トラッシュに紫 → 確認1回、手札とトラッシュが入れ替わる ---")
    scenario({
        name: "yoku-end-ok",
        start: {
            turn: "opp", interactive: true,
            me: { hand: [MARIS], trash: [GAHERIS], spirits: [{ card: YOKU, cores: 3 }] },
            opp: {},
        },
        steps: (t) => { t.act("opp", { type: "endTurn" }); const n = drive(t); assert(n === 1, `確認は1回（実際 ${n}）`) },
        expect: [
            ...nextTurnNoise,
            "自分.手札: 闇騎士マリス → ロクケラトプス、闇騎士ガヘリス",
            "自分.トラッシュ: 闇騎士ガヘリス → 闇騎士マリス",
        ],
    })
    console.log("--- 5. Lv1 → 発揮しない ---")
    scenario({
        name: "yoku-end-lv1",
        start: {
            turn: "opp", interactive: true,
            me: { hand: [MARIS], trash: [GAHERIS], spirits: [{ card: YOKU, cores: 1 }] },
            opp: {},
        },
        steps: (t) => { t.act("opp", { type: "endTurn" }); drive(t) },
        expect: [...nextTurnNoise, "自分.手札: 闇騎士マリス → ロクケラトプス、闇騎士マリス"],
    })
    console.log("--- 6. 手札に【不死】が無い → 確認を出さず何も起きない ---")
    scenario({
        name: "yoku-end-nohand",
        start: {
            turn: "opp", interactive: true,
            me: { hand: [ROKU], trash: [GAHERIS], spirits: [{ card: YOKU, cores: 3 }] },
            opp: {},
        },
        steps: (t) => { t.act("opp", { type: "endTurn" }); const n = drive(t); assert(n === 0, `確認は0回（実際 ${n}）`) },
        expect: [...nextTurnNoise, "自分.手札: ロクケラトプス → ロクケラトプス、ロクケラトプス"],
    })
    console.log("--- 7. トラッシュに紫のスピリットが無い → 確認を出さず何も起きない ---")
    scenario({
        name: "yoku-end-notrash",
        start: {
            turn: "opp", interactive: true,
            me: { hand: [MARIS], spirits: [{ card: YOKU, cores: 3 }] },
            opp: {},
        },
        steps: (t) => { t.act("opp", { type: "endTurn" }); const n = drive(t); assert(n === 0, `確認は0回（実際 ${n}）`) },
        expect: [...nextTurnNoise, "自分.手札: 闇騎士マリス → ロクケラトプス、闇騎士マリス"],
    })
    console.log("--- 8. 自分のエンドステップでは発揮しない（相手のエンドステップ限定） ---")
    scenario({
        name: "yoku-end-own",
        start: {
            turn: "me", interactive: true,
            me: { hand: [MARIS], trash: [GAHERIS], spirits: [{ card: YOKU, cores: 3 }] },
            opp: {},
        },
        steps: (t) => { t.act("me", { type: "endTurn" }); const n = drive(t); assert(n === 0, `確認は0回（実際 ${n}）`) },
        expect: ["相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11", "相手.手札: なし → ロクケラトプス"],
    })
}


// ================= BS15-051 虚海獣エメヒドラル（フラッシュ：コア1個を払い、「ブロックされない」効果を持つ相手のスピリット1体を破壊） =================
console.log("=== BS15-051 虚海獣エメヒドラル ===")
{
    const flash = (t: ScenarioCtx) => tryAct(t, "me", { type: "activateAbility", instanceId: t.id("虚海獣エメヒドラル"), effectId: "BS15-051-e2" })
    const attacked = ["相手.attacker.疲労: false → true"]
    console.log("--- 1. Lv2・相手が「ブロックされない」効果のアタック中 → コア1個をトラッシュへ置き、そのスピリットを破壊 ---")
    scenario({
        name: "hydra-ok",
        start: { turn: "opp", me: { spirits: [{ card: HYDRA, cores: 3 }] }, opp: { spirits: [{ card: SHEIRON, label: "attacker", cores: 3 }] } },
        steps: (t) => { oppAttack(t, "attacker"); assert(flash(t) === null, "使える") },
        expect: [
            "自分.虚海獣エメヒドラル.コア: 3 → 2",
            "自分.虚海獣エメヒドラル.Lv: 2 → 1",
            "自分.虚海獣エメヒドラル.BP: 6000 → 4000",
            "自分.トラッシュのコア: 0 → 1",
            "相手.attacker.場所: フィールド → なし",
            "相手.トラッシュ: なし → 幻龍シェイロン",
            "相手.リザーブ: 10 → 13",
        ],
    })
    console.log("--- 2. Lv1（コア1個）→ 使えず何も起きない ---")
    scenario({
        name: "hydra-lv1",
        start: { turn: "opp", me: { spirits: [{ card: HYDRA, cores: 1 }] }, opp: { spirits: [{ card: SHEIRON, label: "attacker", cores: 3 }] } },
        steps: (t) => { oppAttack(t, "attacker"); flash(t) },
        expect: [...attacked],
    })
    console.log("--- 3. 相手のアタッカーに「ブロックされない」効果が無い → 何も起きない ---")
    scenario({
        name: "hydra-no-unblockable",
        start: { turn: "opp", me: { spirits: [{ card: HYDRA, cores: 3 }] }, opp: { spirits: [{ card: ROKU, label: "attacker" }] } },
        steps: (t) => { oppAttack(t, "attacker"); flash(t) },
        expect: [...attacked],
    })
    console.log("--- 4. シェイロンがLv1（アタック時の効果が無い）→ 何も起きない ---")
    scenario({
        name: "hydra-sheiron-lv1",
        start: { turn: "opp", me: { spirits: [{ card: HYDRA, cores: 3 }] }, opp: { spirits: [{ card: SHEIRON, label: "attacker", cores: 1 }] } },
        steps: (t) => { oppAttack(t, "attacker"); flash(t) },
        expect: [...attacked],
    })
}

// ================= BS15-065 大河と絶壁 =================
console.log("=== BS15-065 大河と絶壁 ===")
{
    const beetles = [{ card: BEETLE, label: "虫A" }, { card: BEETLE, label: "虫B" }]
    console.log("--- 1. 手札の【暴風】に緑の軽減が付く：緑シンボル2つ・ガブノハシ（コスト3・軽減[緑]）がコスト1で出る ---")
    scenario({
        name: "river-grant-ok",
        start: { me: { reserve: 2, hand: [GABU], spirits: beetles, nexuses: [{ card: RIVER, cores: 0 }] } },
        steps: (t) => { t.act("me", { type: "summon", handIndex: 0 }) },
        expect: [
            "自分.リザーブ: 2 → 0",
            "自分.トラッシュのコア: 0 → 1",
            "自分.手札: ガブノハシ → なし",
            "自分.ガブノハシ.場所: なし → フィールド",
            "自分.ガブノハシ.疲労: なし → false",
            "自分.ガブノハシ.コア: なし → 1",
            "自分.ガブノハシ.Lv: なし → 1",
            "自分.ガブノハシ.BP: なし → 1000",
        ],
    })
    console.log("--- 2. ネクサスが無い → コスト2＋置くコア1個で3個要るので、コア2個では出せない ---")
    scenario({
        name: "river-grant-none",
        start: { me: { reserve: 2, hand: [GABU], spirits: beetles } },
        steps: (t) => { tryAct(t, "me", { type: "summon", handIndex: 0 }) },
        expect: [],
    })
    console.log("--- 3. 【暴風】を持たないスピリット（ショックイーター：コスト2・軽減[緑]）には付かない → コスト1＋置くコア1個で2個要るので、コア1個では出せない ---")
    scenario({
        name: "river-grant-nonstorm",
        start: { me: { reserve: 1, hand: [SHOCK], spirits: beetles, nexuses: [{ card: RIVER, cores: 0 }] } },
        steps: (t) => { tryAct(t, "me", { type: "summon", handIndex: 0 }) },
        expect: [],
    })

    // Lv2『自分のスタートステップ』：相手がバーストをセットしているとき、相手のスピリット1体を疲労させる
    const myTurnNoise = ["自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 11", "自分.手札: なし → ロクケラトプス"]
    console.log("--- 4. Lv2・相手がバーストをセット → 自分のスタートステップで相手のスピリットが疲労する ---")
    scenario({
        name: "river-start-ok",
        start: { turn: "opp", me: { nexuses: [{ card: RIVER, cores: 1 }] }, opp: { spirits: [{ card: ROKU, label: "標的" }], burst: BURSTCARD } },
        steps: (t) => { t.act("opp", { type: "endTurn" }); drive(t) },
        expect: [...myTurnNoise, "相手.標的.疲労: false → true"],
    })
    console.log("--- 5. 相手がバーストをセットしていない → 何も起きない ---")
    scenario({
        name: "river-start-noburst",
        start: { turn: "opp", me: { nexuses: [{ card: RIVER, cores: 1 }] }, opp: { spirits: [{ card: ROKU, label: "標的" }] } },
        steps: (t) => { t.act("opp", { type: "endTurn" }); drive(t) },
        expect: [...myTurnNoise],
    })
    console.log("--- 6. Lv1（コア0個）→ 何も起きない ---")
    scenario({
        name: "river-start-lv1",
        start: { turn: "opp", me: { nexuses: [{ card: RIVER, cores: 0 }] }, opp: { spirits: [{ card: ROKU, label: "標的" }], burst: BURSTCARD } },
        steps: (t) => { t.act("opp", { type: "endTurn" }); drive(t) },
        expect: [...myTurnNoise],
    })
    console.log("--- 7. 自分がバーストをセットしているだけ（相手はセットしていない）→ 何も起きない ---")
    scenario({
        name: "river-start-ownburst",
        start: { turn: "opp", me: { nexuses: [{ card: RIVER, cores: 1 }], burst: BURSTCARD }, opp: { spirits: [{ card: ROKU, label: "標的" }] } },
        steps: (t) => { t.act("opp", { type: "endTurn" }); drive(t) },
        expect: [...myTurnNoise],
    })
}

// ================= BS15-067 雪の結晶樹 =================
console.log("=== BS15-067 雪の結晶樹 ===")
{
    console.log("--- 1. 相手が1回もアタックしないままアタックステップを終える → コア1個がリザーブへ（＋自分のターンのコア） ---")
    scenario({
        name: "crystal-noattack",
        start: { turn: "opp", me: { nexuses: [{ card: CRYSTAL, cores: 0 }] }, opp: { spirits: [{ card: ROKU }] } },
        steps: (t) => { t.act("opp", { type: "nextPhase" }); t.act("opp", { type: "endTurn" }); drive(t) },
        expect: ["自分.リザーブ: 10 → 12", "自分.デッキ枚数: 40 → 39", "自分.手札: なし → ロクケラトプス"],
    })
    console.log("--- 2. 相手がアタックした → 増えない（ライフのコアと自分のターンのコアだけ） ---")
    scenario({
        name: "crystal-attacked",
        start: { turn: "opp", me: { nexuses: [{ card: CRYSTAL, cores: 0 }] }, opp: { spirits: [{ card: ROKU, label: "攻撃" }] } },
        steps: (t) => {
            oppAttack(t, "攻撃")
            finishBattle(t)
            t.act("opp", { type: "endTurn" })
            drive(t)
        },
        expect: ["自分.リザーブ: 10 → 12", "自分.ライフ: 5 → 4", "自分.デッキ枚数: 40 → 39", "自分.手札: なし → ロクケラトプス", "相手.攻撃.疲労: false → true"],
    })
    console.log("--- 3. Lv2（コア1個）でも同じ ---")
    scenario({
        name: "crystal-noattack-lv2",
        start: { turn: "opp", me: { nexuses: [{ card: CRYSTAL, cores: 1 }] }, opp: { spirits: [{ card: ROKU }] } },
        steps: (t) => { t.act("opp", { type: "nextPhase" }); t.act("opp", { type: "endTurn" }); drive(t) },
        expect: ["自分.リザーブ: 10 → 12", "自分.デッキ枚数: 40 → 39", "自分.手札: なし → ロクケラトプス"],
    })
    console.log("--- 4. 自分のターンのアタックステップでは働かない ---")
    scenario({
        name: "crystal-own-turn",
        start: { turn: "me", me: { nexuses: [{ card: CRYSTAL, cores: 0 }] } },
        steps: (t) => { t.act("me", { type: "nextPhase" }); t.act("me", { type: "endTurn" }); drive(t) },
        expect: ["相手.リザーブ: 10 → 11", "相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス"],
    })

    // Lv2『相手のターン』：自分のスピリットが【氷壁】を使用したとき、ネクサスのコア1個を払って、そのスピリットを回復させる
    const oppMagic = [
        "相手.手札: ダブルドロー → なし",
        "相手.トラッシュ: なし → ダブルドロー",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "自分.ゲンドリル.疲労: false → true".replace("ゲンドリル", "知将ゲンドリル"),
    ]
    const castDDraw = (t: ScenarioCtx) => { t.act("opp", { type: "castMagic", handIndex: 0 }); return drive(t) }
    console.log("--- 5. 対話・Lv2：相手の赤マジックに【氷壁】を使い、ネクサスのコアを払って回復する → ゲンドリルは疲労のまま残らない ---")
    scenario({
        name: "crystal-ice-ok",
        start: {
            turn: "opp", interactive: true,
            me: { spirits: [{ card: GENDRILL, cores: 2 }], nexuses: [{ card: CRYSTAL, cores: 1 }] },
            opp: { hand: [DDRAW] },
        },
        steps: (t) => { castDDraw(t) },
        expect: [
            ...oppMagic.filter((l) => !l.startsWith("自分.")),
            "自分.雪の結晶樹.コア: 1 → 0",
            "自分.雪の結晶樹.Lv: 2 → 1",
            "自分.トラッシュのコア: 0 → 1",
        ],
    })
    console.log("--- 6. Lv1（コア0個）→ 回復できず、ゲンドリルは疲労のまま ---")
    scenario({
        name: "crystal-ice-lv1",
        start: {
            turn: "opp", interactive: true,
            me: { spirits: [{ card: GENDRILL, cores: 2 }], nexuses: [{ card: CRYSTAL, cores: 0 }] },
            opp: { hand: [DDRAW] },
        },
        steps: (t) => { castDDraw(t) },
        expect: [...oppMagic],
    })
}

// ================= ライフ減少の制限（BS15-005 / 014 / 021 / 031 / 042 共通） =================
// 「自分のバーストをセットしている間、お互いのライフは、ターンごとにスピリット1体から1までしか減らされない」
console.log("=== ライフ減少の制限（5枚共通） ===")
for (const card of [CHAMP, IBOS, AOI, GBEAR, ALATRON]) {
    const nm = getCard(card).name
    console.log(`--- ${nm} ---`)
    const hit = (t: ScenarioCtx) => { oppAttack(t, "攻撃"); t.closeFlash(); drive(t); if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" }); drive(t) }
    const myAttack = (t: ScenarioCtx) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("攻撃") })
        drive(t)
        t.closeFlash()
        drive(t)
        if (t.state.battle && !t.state.pendingChoice) t.act("opp", { type: "takeLife" })
        drive(t)
    }
    scenario({
        name: `lifecap-${card}-defend`,
        start: { turn: "opp", me: { spirits: [{ card }], burst: BURSTCARD }, opp: { spirits: [{ card: DOUBLE, label: "攻撃" }] } },
        steps: hit,
        expect: ["相手.攻撃.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
    })
    scenario({
        name: `lifecap-${card}-nodefend-noburst`,
        start: { turn: "opp", me: { spirits: [{ card }] }, opp: { spirits: [{ card: DOUBLE, label: "攻撃" }] } },
        steps: hit,
        expect: ["相手.攻撃.疲労: false → true", "自分.ライフ: 5 → 3", "自分.リザーブ: 10 → 12"],
    })
    scenario({
        name: `lifecap-${card}-attack`,
        start: { turn: "me", me: { spirits: [{ card }, { card: DOUBLE, label: "攻撃" }], burst: BURSTCARD } },
        steps: myAttack,
        expect: ["自分.攻撃.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: `lifecap-${card}-attack-noburst`,
        start: { turn: "me", me: { spirits: [{ card }, { card: DOUBLE, label: "攻撃" }] } },
        steps: myAttack,
        expect: ["自分.攻撃.疲労: false → true", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"],
    })
}
console.log("--- 別々のスピリット2体のアタックならそれぞれ1ずつ減る（チャンプボンゴル） ---")
scenario({
    name: "lifecap-two-attackers",
    start: { turn: "opp", me: { spirits: [{ card: CHAMP }], burst: BURSTCARD }, opp: { spirits: [{ card: DOUBLE, label: "攻撃A" }, { card: DOUBLE, label: "攻撃B" }] } },
    steps: (t) => {
        oppAttack(t, "攻撃A"); t.closeFlash(); drive(t); if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" }); drive(t)
        t.act("opp", { type: "attack", instanceId: t.id("攻撃B") }); drive(t); t.closeFlash(); drive(t); if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" }); drive(t)
    },
    expect: ["相手.攻撃A.疲労: false → true", "相手.攻撃B.疲労: false → true", "自分.ライフ: 5 → 3", "自分.リザーブ: 10 → 12"],
})

// ================= コスト7になる虚神（BS15-009 / 027 / 036）と、バースト無しでコスト11になるX02 =================
console.log("=== 虚神のコスト ===")
{
    const appears = (label: string, id: string, reserveBefore: number, trashCores: number) => [
        `自分.手札: ${getCard(id).name} → なし`,
        `自分.リザーブ: ${reserveBefore} → 0`,
        `自分.トラッシュのコア: 0 → ${trashCores}`,
        `自分.${label}.場所: なし → フィールド`,
        `自分.${label}.疲労: なし → false`,
        `自分.${label}.コア: なし → 1`,
        `自分.${label}.Lv: なし → 1`,
        `自分.${label}.BP: なし → ${getCard(id).levels[0]!.bp}`,
    ]
    for (const card of [CATA, HOO, VOLS]) {
        const nm = getCard(card).name
        const put = (reserve: number, burst: boolean): { reserve: number; hand: string[]; burst?: string } => ({ reserve, hand: [card], ...(burst ? { burst: BURSTCARD } : {}) })
        console.log(`--- ${nm}（コスト11だが、バーストがあれば7）---`)
        scenario({
            name: `cost7-${card}-ok`,
            start: { me: put(8, true) },
            steps: (t) => { t.act("me", { type: "summon", handIndex: 0 }) },
            expect: appears(nm, card, 8, 7),
        })
        scenario({
            name: `cost7-${card}-noburst`,
            start: { me: put(8, false) },
            steps: (t) => { tryAct(t, "me", { type: "summon", handIndex: 0 }) },
            expect: [],
        })
        scenario({
            name: `cost7-${card}-short`,
            start: { me: put(7, true) },
            steps: (t) => { tryAct(t, "me", { type: "summon", handIndex: 0 }) },
            expect: [],
        })
    }
    const nn = getCard(NETHER).name
    console.log(`--- ${nn}（バーストが無い間コスト11、あればコスト7）---`)
    scenario({
        name: "nether-burst",
        start: { me: { reserve: 8, hand: [NETHER], burst: BURSTCARD } },
        steps: (t) => { t.act("me", { type: "summon", handIndex: 0 }) },
        expect: appears(nn, NETHER, 8, 7),
    })
    scenario({
        name: "nether-noburst-short",
        start: { me: { reserve: 11, hand: [NETHER] } },
        steps: (t) => { tryAct(t, "me", { type: "summon", handIndex: 0 }) },
        expect: [],
    })
    scenario({
        name: "nether-noburst-11",
        start: { me: { reserve: 12, hand: [NETHER] } },
        steps: (t) => { t.act("me", { type: "summon", handIndex: 0 }) },
        expect: appears(nn, NETHER, 12, 11),
    })
    scenario({
        name: "nether-burst-short",
        start: { me: { reserve: 7, hand: [NETHER], burst: BURSTCARD } },
        steps: (t) => { tryAct(t, "me", { type: "summon", handIndex: 0 }) },
        expect: [],
    })
}

// ================= BS15-015 エサルフリーダ（Lv2･Lv3：相手のネクサスすべてのLvコスト+1） =================
console.log("=== BS15-015 吸血令嬢エサルフリーダ ===")
{
    console.log("--- 1. Lv2になると、コア1個のLv2だった相手のネクサスがLv1に落ちる ---")
    scenario({
        name: "esar-up",
        start: { me: { spirits: [{ card: ESAR, cores: 1 }] }, opp: { nexuses: [{ card: RIVER, cores: 1 }] } },
        steps: (t) => { t.act("me", { type: "moveCore", instanceId: t.id("吸血令嬢エサルフリーダ"), direction: "add" }) },
        expect: [
            "自分.リザーブ: 10 → 9",
            "自分.吸血令嬢エサルフリーダ.コア: 1 → 2",
            "自分.吸血令嬢エサルフリーダ.Lv: 1 → 2",
            "自分.吸血令嬢エサルフリーダ.BP: 3000 → 5000",
            "相手.大河と絶壁.Lv: 2 → 1",
        ],
    })
    console.log("--- 2. Lv1のあいだは働かない ---")
    scenario({
        name: "esar-lv1",
        start: { me: { spirits: [{ card: ESAR, cores: 1 }] }, opp: { nexuses: [{ card: RIVER, cores: 1 }] } },
        steps: (t) => { assert(currentLevel(t.inst("相手.大河と絶壁")).level === 2, "相手のネクサスはLv2のまま") },
        expect: [],
    })
    console.log("--- 3. 自分のネクサスは対象外（Lv2のまま） ---")
    scenario({
        name: "esar-own-nexus",
        start: { me: { spirits: [{ card: ESAR, cores: 1 }], nexuses: [{ card: RIVER, cores: 1 }] } },
        steps: (t) => { t.act("me", { type: "moveCore", instanceId: t.id("吸血令嬢エサルフリーダ"), direction: "add" }) },
        expect: [
            "自分.リザーブ: 10 → 9",
            "自分.吸血令嬢エサルフリーダ.コア: 1 → 2",
            "自分.吸血令嬢エサルフリーダ.Lv: 1 → 2",
            "自分.吸血令嬢エサルフリーダ.BP: 3000 → 5000",
        ],
    })
    console.log("--- 4. 相手のネクサスのコアが2個あればLv2のまま ---")
    scenario({
        name: "esar-two-cores",
        start: { me: { spirits: [{ card: ESAR, cores: 2 }] }, opp: { nexuses: [{ card: RIVER, cores: 2 }] } },
        steps: (t) => { assert(currentLevel(t.inst("相手.大河と絶壁")).level === 2, "コア2個ならLv2") },
        expect: [],
    })
}

// ================= BS15-028 フェネボラック / BS15-030 愛の女神ロヴン（デッキ破棄の無効） =================
console.log("=== デッキ破棄の無効（フェネボラック／ロヴン） ===")
for (const [card, cores, nm] of [[FENE, 2, "フェネボラック"], [ROVEN, 1, "愛の女神ロヴン"]] as const) {
    console.log(`--- ${nm} ---`)
    const atk = (t: ScenarioCtx) => { const n = oppAttack(t, "粉砕"); return n }
    const base = ["相手.粉砕.疲労: false → true"]
    scenario({
        name: `mill-${card}-ok`,
        start: { turn: "opp", interactive: true, me: { spirits: [{ card, cores }] }, opp: { spirits: [{ card: ROCKGOLEM, label: "粉砕" }] } },
        steps: (t) => { const n = atk(t); assert(n === 1, `確認は1回（実際 ${n}）`) },
        expect: [...base, `自分.${nm}.疲労: false → true`],
    })
    scenario({
        name: `mill-${card}-auto`,
        start: { turn: "opp", me: { spirits: [{ card, cores }] }, opp: { spirits: [{ card: ROCKGOLEM, label: "粉砕" }] } },
        steps: (t) => { atk(t) },
        expect: [...base, `自分.${nm}.疲労: false → true`],
    })
    scenario({
        name: `mill-${card}-rested`,
        start: { turn: "opp", interactive: true, me: { spirits: [{ card, cores, rested: true }] }, opp: { spirits: [{ card: ROCKGOLEM, label: "粉砕" }] } },
        steps: (t) => { const n = atk(t); assert(n === 0, `確認は0回（実際 ${n}）`) },
        expect: [...base, "自分.デッキ枚数: 40 → 39", "自分.トラッシュ: なし → ロクケラトプス"],
    })
    scenario({
        name: `mill-${card}-myturn`,
        start: { turn: "me", interactive: true, me: { spirits: [{ card, cores }, { card: ROCKGOLEM, label: "粉砕" }] }, opp: {} },
        steps: (t) => {
            t.act("me", { type: "nextPhase" }); t.act("me", { type: "attack", instanceId: t.id("粉砕") })
            drive(t)
        },
        expect: ["自分.粉砕.疲労: false → true", "相手.デッキ枚数: 40 → 39", "相手.トラッシュ: なし → ロクケラトプス"],
    })
}
console.log("--- フェネボラックがLv1（コア1個）→ 発揮せずデッキが破棄される ---")
scenario({
    name: "mill-fene-lv1",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: FENE, cores: 1 }] }, opp: { spirits: [{ card: ROCKGOLEM, label: "粉砕" }] } },
    steps: (t) => { const n = oppAttack(t, "粉砕"); assert(n === 0, `確認は0回（実際 ${n}）`) },
    expect: ["相手.粉砕.疲労: false → true", "自分.デッキ枚数: 40 → 39", "自分.トラッシュ: なし → ロクケラトプス"],
})

// ================= BS15-034 ミブロック・ジーナス（白のスピリット/ネクサスしか無い間、ネクサスすべての効果は発揮されない） =================
console.log("=== BS15-034 ミブロック・ジーナス ===")
{
    const noAttackTurn = (t: ScenarioCtx) => { t.act("opp", { type: "nextPhase" }); t.act("opp", { type: "endTurn" }); drive(t) }
    const myNoise = ["自分.デッキ枚数: 40 → 39", "自分.手札: なし → ロクケラトプス"]
    console.log("--- 1. 自分の場が白だけ → 自分の雪の結晶樹の効果が発揮されない（コアは自分のターンの分だけ） ---")
    scenario({
        name: "miblock-own-nexus",
        start: { turn: "opp", me: { spirits: [{ card: MIBLOCK }], nexuses: [{ card: CRYSTAL, cores: 0 }] }, opp: {} },
        steps: noAttackTurn,
        expect: [...myNoise, "自分.リザーブ: 10 → 11"],
    })
    console.log("--- 2. 白以外のスピリットがいる → 雪の結晶樹の効果は発揮される ---")
    scenario({
        name: "miblock-own-nexus-red",
        start: { turn: "opp", me: { spirits: [{ card: MIBLOCK }, { card: ROKU }], nexuses: [{ card: CRYSTAL, cores: 0 }] }, opp: {} },
        steps: noAttackTurn,
        expect: [...myNoise, "自分.リザーブ: 10 → 12"],
    })
    const oppNoise = ["相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"]
    console.log("--- 3. 相手のネクサスの効果も発揮されない：相手の大河と絶壁（自分のバーストがあれば自分のスピリットを疲労）が働かない ---")
    scenario({
        name: "miblock-opp-nexus",
        start: { turn: "me", me: { spirits: [{ card: MIBLOCK }], burst: BURSTCARD }, opp: { nexuses: [{ card: RIVER, cores: 1 }] } },
        steps: (t) => { t.act("me", { type: "endTurn" }); drive(t) },
        expect: [...oppNoise],
    })
    console.log("--- 4. 対照：ミブロックがいなければ相手の大河と絶壁が働いてスピリットが疲労する ---")
    scenario({
        name: "miblock-opp-nexus-control",
        start: { turn: "me", me: { spirits: [{ card: ROKU, label: "標的" }], burst: BURSTCARD }, opp: { nexuses: [{ card: RIVER, cores: 1 }] } },
        steps: (t) => { t.act("me", { type: "endTurn" }); drive(t) },
        expect: [...oppNoise, "自分.標的.疲労: false → true"],
    })
}

// ================= BS15-044 天使サクエル（Lv2･Lv3 バトル時：手札のバースト持ち黄マジックのフラッシュ効果をコスト無しで） =================
console.log("=== BS15-044 天使サクエル ===")
{
    const GEFRUSTER = "BS16-082" // マギアゲフリュスター（黄・コスト6・バースト持ち。フラッシュ：このターン、バトル解決時はBPのかわりにLvを比べる）
    assert(getCard(GEFRUSTER).name === "マギアゲフリュスター" && getCard(GEFRUSTER).type === "magic" && getCard(GEFRUSTER).cost === 6, "GEFRUSTERはコスト6のマギアゲフリュスター")
    const battle = (t: ScenarioCtx, useFree: boolean) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("天使サクエル") })
        drive(t)
        let r: string | null = null
        if (useFree) t.act("opp", { type: "pass" }) // フラッシュの優先権は守る側（相手）から
        if (useFree) r = tryAct(t, "me", { type: "castMagic", handIndex: 0 })
        drive(t)
        t.closeFlash()
        drive(t)
        if (t.state.battle) t.act("opp", { type: "block", instanceId: t.id("相手.タランドーズ") })
        drive(t)
        t.closeFlash()
        drive(t)
        return r
    }
    console.log("--- 1. Lv2・手札のバースト持ち黄マジック：コスト0でフラッシュ効果を使い、Lv比べで高Lvのサクエルが勝つ ---")
    scenario({
        name: "sakuel-ok",
        start: { turn: "me", me: { reserve: 0, hand: [GEFRUSTER], spirits: [{ card: SAKUEL, cores: 2 }] }, opp: { spirits: [{ card: DOUBLE }] } },
        steps: (t) => { const r = battle(t, true); assert(r === null, `マジックが使える（${r}）`) },
        expect: [
            "自分.天使サクエル.疲労: false → true",
            "自分.手札: マギアゲフリュスター → なし",
            "自分.トラッシュ: なし → マギアゲフリュスター",
            "相手.タランドーズ.場所: フィールド → なし",
            "相手.トラッシュ: なし → タランドーズ",
            "相手.リザーブ: 10 → 11",
        ],
    })
    console.log("--- 2. 対照：マジックを使わなければBPで負けて、サクエルが破壊される ---")
    scenario({
        name: "sakuel-nouse",
        start: { turn: "me", me: { reserve: 0, hand: [GEFRUSTER], spirits: [{ card: SAKUEL, cores: 2 }] }, opp: { spirits: [{ card: DOUBLE }] } },
        steps: (t) => { battle(t, false) },
        expect: [
            "自分.天使サクエル.場所: フィールド → なし",
            "自分.トラッシュ: なし → 天使サクエル",
            "自分.リザーブ: 0 → 2",
            "相手.タランドーズ.疲労: false → true",
        ],
    })
    console.log("--- 3. Lv1（コア1個）→ 無償にならず、コアが無いので使えない ---")
    scenario({
        name: "sakuel-lv1",
        start: { turn: "me", me: { reserve: 0, hand: [GEFRUSTER], spirits: [{ card: SAKUEL, cores: 1 }] }, opp: { spirits: [{ card: DOUBLE }] } },
        steps: (t) => { const r = battle(t, true); assert(r !== null, "拒否されるはず") },
        expect: [
            "自分.天使サクエル.場所: フィールド → なし",
            "自分.トラッシュ: なし → 天使サクエル",
            "自分.リザーブ: 0 → 1",
            "相手.タランドーズ.疲労: false → true",
        ],
    })
    console.log("--- 4. 手札が赤マジック（バースト効果なし）→ 無償にならない ---")
    scenario({
        name: "sakuel-notburst",
        start: { turn: "me", me: { reserve: 0, hand: [DDRAW], spirits: [{ card: SAKUEL, cores: 2 }] }, opp: { spirits: [{ card: DOUBLE }] } },
        steps: (t) => { const r = battle(t, true); assert(r !== null, "拒否されるはず") },
        expect: [
            "自分.天使サクエル.場所: フィールド → なし",
            "自分.トラッシュ: なし → 天使サクエル",
            "自分.リザーブ: 0 → 2",
            "相手.タランドーズ.疲労: false → true",
        ],
    })
}

// ================= BS15-049 ツンドッグ・ゴレム（召喚時：このターン【粉砕】/【大粉砕】持ちが、BPを比べ相手のスピリットに破壊されたら疲労状態で残す） =================
console.log("=== BS15-049 ツンドッグ・ゴレム ===")
{
    const lose = (t: ScenarioCtx, summon: boolean) => {
        if (summon) t.act("me", { type: "summon", handIndex: 0 })
        drive(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("攻撃") })
        drive(t)
        t.closeFlash()
        drive(t)
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        drive(t)
        t.closeFlash()
        drive(t)
    }
    const wall = { card: FANFA, label: "壁", cores: 3 }
    const tsunAppearsBase = [
        "自分.手札: ツンドッグ・ゴレム → なし",
        "自分.ツンドッグ・ゴレム.場所: なし → フィールド",
        "自分.ツンドッグ・ゴレム.疲労: なし → false",
        "自分.ツンドッグ・ゴレム.コア: なし → 1",
        "自分.ツンドッグ・ゴレム.Lv: なし → 1",
        "自分.ツンドッグ・ゴレム.BP: なし → 3000",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 2",
    ]
    const tsunAppears = [...tsunAppearsBase]
    const milled = ["相手.デッキ枚数: 40 → 39", "相手.トラッシュ: なし → ロクケラトプス"]
    console.log("--- 1. 召喚したターン、【粉砕】のロック・ゴレムがBP負けで破壊される → 疲労状態で残る ---")
    scenario({
        name: "tsun-ok",
        start: { me: { hand: [TSUN], spirits: [{ card: ROCKGOLEM, label: "攻撃" }] }, opp: { spirits: [wall] } },
        steps: (t) => lose(t, true),
        expect: [...tsunAppears, ...milled, "自分.攻撃.疲労: false → true", "相手.壁.疲労: false → true"],
    })
    console.log("--- 2. 【粉砕】を持たないスピリットは普通に破壊される ---")
    scenario({
        name: "tsun-nokeyword",
        start: { me: { hand: [TSUN], spirits: [{ card: ROKU, label: "攻撃" }] }, opp: { spirits: [wall] } },
        steps: (t) => lose(t, true),
        expect: [...tsunAppears.filter((l) => l !== "自分.トラッシュのコア: 0 → 2"), "自分.攻撃.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス", "自分.トラッシュのコア: 2 → 3".replace("2 → 3", "0 → 3"), "相手.壁.疲労: false → true"],
    })
    console.log("--- 3. 召喚していない（元から場にいる）→ 効果は働かず破壊される ---")
    scenario({
        name: "tsun-onfield",
        start: { me: { spirits: [{ card: TSUN }, { card: ROCKGOLEM, label: "攻撃" }] }, opp: { spirits: [wall] } },
        steps: (t) => lose(t, false),
        expect: [...milled, "自分.攻撃.場所: フィールド → なし", "自分.トラッシュ: なし → ロック・ゴレム", "自分.リザーブ: 10 → 11", "相手.壁.疲労: false → true"],
    })
}

console.log("すべてのチェックに合格しました 🎉（part475）")

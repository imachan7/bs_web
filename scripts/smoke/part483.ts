// smoke パート483（BS15 の未発火エントリ：期待値役が効果文だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const VAN = "BS01-002" // ロクケラトプス（赤・1/1000）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・1/4000）
const CAMEL = "BS07-023" // ラクダチョウ（緑・暴風1・1/1000）
const DORA = "BS07-004" // 怒石竜ドラゴロック（赤・激突・Lv1にコア2・4000）
const ASH = "BS07-010" // アシュタル（紫・夜族・1/1000）
const GAHE = "BS11-010" // 闇騎士ガヘリス（紫・不死：コスト3・1/1000）
const PAN = "BS02-066" // アルカナドール・パン（黄・召喚時に相手のスピリット1体を疲労）
const LUGAU = "BS06-018" // 人狼ルー・ガウル（紫・召喚時に相手のスピリット1体のコアを1個残して他をリザーブへ）
const PLAZ = "BS07-012" // プラズバット（紫・破壊時に相手のスピリット上のコア1個をリザーブへ）
const BURST = "BS14-099" // 武迅衝（緑マジック・バースト：相手の召喚時発揮後）
const NEXUS = "BS02-080" // エメラルドに輝く鍾乳洞（緑・Lv1にコア0）
const TARAN = "BS16-025" // タランドーズ（緑・シンボル2・1/6000）
const IRU = "BS16-053" // イルルヤンカッシュ（青・シンボル2・1/5000）

const CATA = "BS15-009"
const SHOKA = "BS15-026"
const HOUOU = "BS15-027"
const CRADLE = "BS15-061"
const X02 = "BS15-X02"
const X03 = "BS15-X03"
const ANAGUMA = "BS15-022"
const STAIRS = "BS15-066"
const WARE = "BS15-012"
const GAWAIN = "BS15-016"
const GRASS = "BS15-031"
const MEGA = "BS15-035"
const X06 = "BS15-X06"
const EME = "BS15-051"
const OCEAN = "BS15-072"

const nm = (id: string) => getCard(id).name
const jn = (...ids: string[]) => ids.map(nm).sort().join("、") || "なし"

console.log("=== 前提: カードの機械確認 ===")
{
    const expectName: [string, string][] = [
        [VAN, "ロクケラトプス"], [HERA, "ヘラクレス・ジオ"], [CAMEL, "ラクダチョウ"], [DORA, "怒石竜ドラゴロック"],
        [ASH, "アシュタル"], [GAHE, "闇騎士ガヘリス"], [PAN, "アルカナドール・パン"], [LUGAU, "人狼ルー・ガウル"],
        [PLAZ, "プラズバット"], [BURST, "武迅衝"], [NEXUS, "エメラルドに輝く鍾乳洞"], [TARAN, "タランドーズ"], [IRU, "イルルヤンカッシュ"],
        [CATA, "虚龍帝カタストロフドラゴン"], [SHOKA, "軍師鳥ショカツリョー"], [HOUOU, "虚天帝ホウオウガ"], [CRADLE, "幼竜の揺り籠"],
        [X02, "虚皇帝ネザード・バァラル"], [X03, "鳥武帝スザクロス・ソウソー"], [ANAGUMA, "アナグマッド・デビル"], [STAIRS, "廃寺の無限階段"],
        [WARE, "ワーウルフ・コマンド"], [GAWAIN, "闇騎士ガウェイン"], [GRASS, "虚獣グラスベア"], [MEGA, "軍神機メガ・テュール"],
        [X06, "鉄の覇王サイゴード・ゴレム"], [EME, "虚海獣エメヒドラル"], [OCEAN, "渦巻く大海峡"],
    ]
    for (const [id, name] of expectName) assert(getCard(id).name === name, `${id} は ${name}`)
    for (const id of [CRADLE, STAIRS, OCEAN, NEXUS]) assert(getCard(id).type === "nexus", `${id} はネクサス`)
    assert(getCard(VAN).effects.length === 0, "VAN は効果なし")
    assert(getCard(TARAN).symbol.length === 2 && getCard(IRU).symbol.length === 2, "TARAN/IRU はシンボル2")
}

const isOption = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option"
}

// 確認（発動する／召喚する）が出たら accept に従って答える。出た回数を返す。確認以外は先頭の候補で答える
function drive(t: ScenarioCtx, accept = true): number {
    let confirms = 0
    while (t.state.pendingChoice) {
        const pc = t.state.pendingChoice
        const side: Side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "option") {
            const opts = pc.options ?? []
            const yes = opts.find((o) => o.includes("発動する")) ?? opts.find((o) => o.includes("召喚"))
            if (yes !== undefined) {
                confirms++
                t.act(side, accept ? { type: "resolveChoice", option: yes } : { type: "resolveChoice" })
            } else {
                t.act(side, { type: "resolveChoice", option: opts[0]! })
            }
        } else {
            t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0]! })
        }
        if (confirms > 5) throw new Error("確認が繰り返し出ている")
    }
    return confirms
}

// アタック宣言から解決まで。blocker があれば防御側がそれでブロックし、無ければライフで受ける。確認の回数を返す
function runAttack(t: ScenarioCtx, atk: Side, who: string, blocker?: string, accept = true): number {
    const def: Side = atk === "me" ? "opp" : "me"
    t.act(atk, { type: "attack", instanceId: t.id(who) })
    let n = drive(t, accept)
    if (t.state.battle) {
        t.closeFlash()
        n += drive(t, accept)
        if (t.state.battle && !t.state.pendingChoice) {
            if (blocker !== undefined) t.act(def, { type: "block", instanceId: t.id(blocker) })
            else t.act(def, { type: "takeLife" })
        }
        n += drive(t, accept)
        if (t.state.battle) {
            t.closeFlash()
            n += drive(t, accept)
        }
    }
    return n
}

const cnt = (n: number, expected: number) => assert(n === expected, `確認の回数は${expected}回（実際 ${n} 回）`)

// 防御側がライフで受けた（ライフ1・そのコアはリザーブへ）ときの共通の変化
const lifeHit = (side: "自分" | "相手", by = 1) => [`${side}.ライフ: 5 → ${5 - by}`, `${side}.リザーブ: 10 → ${10 + by}`]

// ===================================================================
console.log("=== 虚龍帝カタストロフドラゴン：【激突】を持つ他のスピリットがアタックしたとき回復（Lv2以上） ===")
{
    const meSide = (lv2: boolean, atk: string) => ({
        spirits: [{ card: CATA, cores: lv2 ? 4 : 1, rested: true }, { card: atk, cores: atk === DORA ? 2 : 1 }],
    })
    scenario({
        name: "cata-lv2-clash",
        start: { phase: "attack", me: meSide(true, DORA) },
        steps: (t) => runAttack(t, "me", nm(DORA)),
        expect: ["自分.怒石竜ドラゴロック.疲労: false → true", "自分.虚龍帝カタストロフドラゴン.疲労: true → false", ...lifeHit("相手")],
    })
    scenario({
        name: "cata-lv1-clash",
        start: { phase: "attack", me: meSide(false, DORA) },
        steps: (t) => runAttack(t, "me", nm(DORA)),
        expect: ["自分.怒石竜ドラゴロック.疲労: false → true", ...lifeHit("相手")],
    })
    scenario({
        name: "cata-lv2-vanilla",
        start: { phase: "attack", me: meSide(true, VAN) },
        steps: (t) => runAttack(t, "me", nm(VAN)),
        expect: ["自分.ロクケラトプス.疲労: false → true", ...lifeHit("相手")],
    })
}

// ===================================================================
console.log("=== 軍師鳥ショカツリョー：【暴風】スピリットのアタック時、コアを払って相手を疲労（Lv2） ===")
{
    const oppSide = { spirits: [{ card: VAN, label: "標的" }] }
    const meSide = (lv2: boolean, atk: string, reserve = 10) => ({
        reserve,
        spirits: [{ card: SHOKA, cores: lv2 ? 3 : 1 }, { card: atk }],
    })
    const paid = (atk: string) => [
        `自分.${nm(atk)}.疲労: false → true`, "自分.リザーブ: 10 → 9", "自分.トラッシュのコア: 0 → 1", "相手.標的.疲労: false → true", ...lifeHit("相手"),
    ]
    scenario({
        name: "shoka-auto",
        start: { phase: "attack", me: meSide(true, CAMEL), opp: oppSide },
        steps: (t) => runAttack(t, "me", nm(CAMEL)),
        expect: paid(CAMEL),
    })
    scenario({
        name: "shoka-interactive",
        start: { phase: "attack", interactive: true, me: meSide(true, CAMEL), opp: oppSide },
        steps: (t) => cnt(runAttack(t, "me", nm(CAMEL)), 1),
        expect: paid(CAMEL),
    })
    scenario({
        name: "shoka-decline",
        start: { phase: "attack", interactive: true, me: meSide(true, CAMEL), opp: oppSide },
        steps: (t) => cnt(runAttack(t, "me", nm(CAMEL), undefined, false), 1),
        expect: [`自分.${nm(CAMEL)}.疲労: false → true`, ...lifeHit("相手")],
    })
    scenario({
        name: "shoka-lv1",
        start: { phase: "attack", interactive: true, me: meSide(false, CAMEL), opp: oppSide },
        steps: (t) => cnt(runAttack(t, "me", nm(CAMEL)), 0),
        expect: [`自分.${nm(CAMEL)}.疲労: false → true`, ...lifeHit("相手")],
    })
    scenario({
        name: "shoka-no-storm",
        start: { phase: "attack", interactive: true, me: meSide(true, VAN), opp: oppSide },
        steps: (t) => cnt(runAttack(t, "me", nm(VAN)), 0),
        expect: [`自分.${nm(VAN)}.疲労: false → true`, ...lifeHit("相手")],
    })
    scenario({
        name: "shoka-cannot-pay",
        start: { phase: "attack", interactive: true, me: meSide(true, CAMEL, 0), opp: oppSide },
        steps: (t) => cnt(runAttack(t, "me", nm(CAMEL)), 0),
        expect: [`自分.${nm(CAMEL)}.疲労: false → true`, ...lifeHit("相手")],
    })
}

// ===================================================================
console.log("=== 虚天帝ホウオウガ：アタックでライフを減らしたら追加でライフのコアをボイドへ／暴風スピリットの破壊で相手を手札に戻す ===")
{
    const extra = ["相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 11"]
    scenario({
        name: "houou-self-attack",
        start: { phase: "attack", me: { spirits: [{ card: HOUOU }] } },
        steps: (t) => runAttack(t, "me", nm(HOUOU)),
        expect: [`自分.${nm(HOUOU)}.疲労: false → true`, ...extra],
    })
    scenario({
        name: "houou-storm-attack",
        start: { phase: "attack", me: { spirits: [{ card: HOUOU }, { card: CAMEL }] } },
        steps: (t) => runAttack(t, "me", nm(CAMEL)),
        expect: [`自分.${nm(CAMEL)}.疲労: false → true`, ...extra],
    })
    scenario({
        name: "houou-vanilla-attack",
        start: { phase: "attack", me: { spirits: [{ card: HOUOU }, { card: VAN }] } },
        steps: (t) => runAttack(t, "me", nm(VAN)),
        expect: [`自分.${nm(VAN)}.疲労: false → true`, ...lifeHit("相手")],
    })
    scenario({
        name: "houou-opp-storm-attack",
        start: { turn: "opp", phase: "attack", me: { spirits: [{ card: HOUOU }] }, opp: { spirits: [{ card: CAMEL }] } },
        steps: (t) => runAttack(t, "opp", nm(CAMEL)),
        expect: [`相手.${nm(CAMEL)}.疲労: false → true`, ...lifeHit("自分")],
    })
    // 相手のヘラクレス（BP4000）にラクダチョウ（BP1000）がブロックして破壊される
    const stormDestroyed = (blocker: string) => [
        `自分.${nm(blocker)}.場所: フィールド → なし`,
        `自分.トラッシュ: なし → ${nm(blocker)}`,
        "自分.リザーブ: 10 → 11",
    ]
    const oppAtk = { spirits: [{ card: HERA }] }
    scenario({
        name: "houou-lv2-storm-destroyed",
        start: { turn: "opp", phase: "attack", me: { spirits: [{ card: HOUOU, cores: 4 }, { card: CAMEL }] }, opp: oppAtk },
        steps: (t) => runAttack(t, "opp", nm(HERA), nm(CAMEL)),
        expect: [...stormDestroyed(CAMEL), `相手.${nm(HERA)}.場所: フィールド → なし`, `相手.手札: なし → ${nm(HERA)}`, "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "houou-lv1-storm-destroyed",
        start: { turn: "opp", phase: "attack", me: { spirits: [{ card: HOUOU, cores: 1 }, { card: CAMEL }] }, opp: oppAtk },
        steps: (t) => runAttack(t, "opp", nm(HERA), nm(CAMEL)),
        expect: [...stormDestroyed(CAMEL), `相手.${nm(HERA)}.疲労: false → true`],
    })
    scenario({
        name: "houou-lv2-vanilla-destroyed",
        start: { turn: "opp", phase: "attack", me: { spirits: [{ card: HOUOU, cores: 4 }, { card: VAN }] }, opp: oppAtk },
        steps: (t) => runAttack(t, "opp", nm(HERA), nm(VAN)),
        expect: [...stormDestroyed(VAN), `相手.${nm(HERA)}.疲労: false → true`],
    })
}

// ===================================================================
console.log("=== 幼竜の揺り籠：相手によって自分のスピリットが破壊されたら、破壊された1体につき相手のネクサス1つを破壊（Lv2） ===")
{
    const oppSide = { spirits: [{ card: HERA }], nexuses: [{ card: NEXUS, cores: 0 }] }
    const lost = [`自分.${nm(VAN)}.場所: フィールド → なし`, `自分.トラッシュ: なし → ${nm(VAN)}`, "自分.リザーブ: 10 → 11"]
    scenario({
        name: "cradle-lv2",
        start: { turn: "opp", phase: "attack", me: { spirits: [{ card: VAN }], nexuses: [{ card: CRADLE, cores: 1 }] }, opp: oppSide },
        steps: (t) => runAttack(t, "opp", nm(HERA), nm(VAN)),
        expect: [...lost, `相手.${nm(HERA)}.疲労: false → true`, `相手.${nm(NEXUS)}.場所: ネクサス → なし`, `相手.トラッシュ: なし → ${nm(NEXUS)}`],
    })
    scenario({
        name: "cradle-lv1",
        start: { turn: "opp", phase: "attack", me: { spirits: [{ card: VAN }], nexuses: [{ card: CRADLE, cores: 0 }] }, opp: oppSide },
        steps: (t) => runAttack(t, "opp", nm(HERA), nm(VAN)),
        expect: [...lost, `相手.${nm(HERA)}.疲労: false → true`],
    })
    scenario({
        name: "cradle-opp-spirit-destroyed",
        start: { phase: "attack", me: { spirits: [{ card: HERA }], nexuses: [{ card: CRADLE, cores: 1 }] }, opp: { spirits: [{ card: VAN }], nexuses: [{ card: NEXUS, cores: 0 }] } },
        steps: (t) => runAttack(t, "me", nm(HERA), nm(VAN)),
        expect: [`自分.${nm(HERA)}.疲労: false → true`, `相手.${nm(VAN)}.場所: フィールド → なし`, `相手.トラッシュ: なし → ${nm(VAN)}`, "相手.リザーブ: 10 → 11"],
    })
}

// ===================================================================
console.log("=== 虚皇帝ネザード・バァラル：【不死】スピリットのアタック時に相手のフィールドのコア2個をトラッシュへ（Lv2以上） ===")
{
    const oppSide = { spirits: [{ card: HERA, cores: 4 }] }
    const hit = (atk: string) => [`自分.${nm(atk)}.疲労: false → true`, ...lifeHit("相手")]
    scenario({
        name: "x02-lv2-revive-attacker",
        start: { phase: "attack", me: { spirits: [{ card: X02, cores: 3 }, { card: GAHE }] }, opp: oppSide },
        steps: (t) => runAttack(t, "me", nm(GAHE)),
        expect: [...hit(GAHE), `相手.${nm(HERA)}.コア: 4 → 2`, `相手.${nm(HERA)}.Lv: 2 → 1`, `相手.${nm(HERA)}.BP: 6000 → 4000`, "相手.トラッシュのコア: 0 → 2"],
    })
    scenario({
        name: "x02-lv1",
        start: { phase: "attack", me: { spirits: [{ card: X02, cores: 1 }, { card: GAHE }] }, opp: oppSide },
        steps: (t) => runAttack(t, "me", nm(GAHE)),
        expect: hit(GAHE),
    })
    scenario({
        name: "x02-lv2-vanilla-attacker",
        start: { phase: "attack", me: { spirits: [{ card: X02, cores: 3 }, { card: VAN }] }, opp: oppSide },
        steps: (t) => runAttack(t, "me", nm(VAN)),
        expect: hit(VAN),
    })
}

// ===================================================================
console.log("=== 鳥武帝スザクロス・ソウソー：相手のスピリットが疲労したとき回復（Lv2） ===")
{
    const meSide = (cores: number) => ({ spirits: [{ card: X03, cores, rested: true }, { card: HERA }] })
    const oppSide = { spirits: [{ card: VAN }] }
    const blocked = [`自分.${nm(HERA)}.疲労: false → true`, `相手.${nm(VAN)}.場所: フィールド → なし`, `相手.トラッシュ: なし → ${nm(VAN)}`, "相手.リザーブ: 10 → 11"]
    scenario({
        name: "x03-lv2-opp-blocks",
        start: { phase: "attack", me: meSide(3), opp: oppSide },
        steps: (t) => runAttack(t, "me", nm(HERA), nm(VAN)),
        expect: [...blocked, `自分.${nm(X03)}.疲労: true → false`],
    })
    scenario({
        name: "x03-lv2-unblocked",
        start: { phase: "attack", me: meSide(3), opp: oppSide },
        steps: (t) => runAttack(t, "me", nm(HERA)),
        expect: [`自分.${nm(HERA)}.疲労: false → true`, ...lifeHit("相手")],
    })
    scenario({
        name: "x03-lv1-opp-blocks",
        start: { phase: "attack", me: meSide(1), opp: oppSide },
        steps: (t) => runAttack(t, "me", nm(HERA), nm(VAN)),
        expect: blocked,
    })
}

// ===================================================================
console.log("=== アナグマッド・デビル：緑しかないときコア1個＋バースト1つを破棄してさらにコア1個 ===")
{
    const base = [`自分.${nm(ANAGUMA)}.疲労: false → true`, ...lifeHit("相手")]
    const core1 = `自分.${nm(ANAGUMA)}.コア: 1 → 2`
    const bothCores = [`自分.${nm(ANAGUMA)}.コア: 1 → 3`, `自分.${nm(ANAGUMA)}.Lv: 1 → 2`, `自分.${nm(ANAGUMA)}.BP: 2000 → 4000`]
    const burstGone = [`自分.バースト: ${nm(BURST)} → なし`, `自分.トラッシュ: なし → ${nm(BURST)}`]
    scenario({
        name: "anaguma-green-only",
        start: { phase: "attack", me: { spirits: [{ card: ANAGUMA }] } },
        steps: (t) => runAttack(t, "me", nm(ANAGUMA)),
        expect: [...base, core1],
    })
    scenario({
        name: "anaguma-green-burst-interactive",
        start: { phase: "attack", interactive: true, me: { spirits: [{ card: ANAGUMA }], burst: BURST } },
        steps: (t) => cnt(runAttack(t, "me", nm(ANAGUMA)), 1),
        expect: [...base, ...bothCores, ...burstGone],
    })
    scenario({
        name: "anaguma-green-burst-auto",
        start: { phase: "attack", me: { spirits: [{ card: ANAGUMA }], burst: BURST } },
        steps: (t) => runAttack(t, "me", nm(ANAGUMA)),
        expect: [...base, ...bothCores, ...burstGone],
    })
    scenario({
        name: "anaguma-green-burst-decline",
        start: { phase: "attack", interactive: true, me: { spirits: [{ card: ANAGUMA }], burst: BURST } },
        steps: (t) => cnt(runAttack(t, "me", nm(ANAGUMA), undefined, false), 1),
        expect: [...base, core1],
    })
    scenario({
        name: "anaguma-red-present-no-burst",
        start: { phase: "attack", me: { spirits: [{ card: ANAGUMA }, { card: VAN }] } },
        steps: (t) => runAttack(t, "me", nm(ANAGUMA)),
        expect: base,
    })
    // 「さらに」は同時で、緑しかない条件は1つ目の文だけにかかる、と読んだ（質問1）
    scenario({
        name: "anaguma-red-present-burst",
        start: { phase: "attack", me: { spirits: [{ card: ANAGUMA }, { card: VAN }], burst: BURST } },
        steps: (t) => runAttack(t, "me", nm(ANAGUMA)),
        expect: [...base, core1, ...burstGone],
    })
    scenario({
        name: "anaguma-no-burst-no-second-core",
        start: { phase: "attack", interactive: true, me: { spirits: [{ card: ANAGUMA }] } },
        steps: (t) => cnt(runAttack(t, "me", nm(ANAGUMA)), 0),
        expect: [...base, core1],
    })
}

// ===================================================================
console.log("=== 廃寺の無限階段：緑しかない間、相手のスピリットだけを破壊したスピリットを回復（お互いのアタックステップ） ===")
{
    const killed = [`相手.${nm(VAN)}.場所: フィールド → なし`, `相手.トラッシュ: なし → ${nm(VAN)}`, "相手.リザーブ: 10 → 11"]
    scenario({
        name: "stairs-green-only-attack",
        start: { phase: "attack", me: { spirits: [{ card: HERA }], nexuses: [{ card: STAIRS, cores: 0 }] }, opp: { spirits: [{ card: VAN }] } },
        steps: (t) => {
            runAttack(t, "me", nm(HERA), nm(VAN))
            assert(!t.inst(nm(HERA)).isRested, "勝った緑スピリットは回復している")
        },
        expect: killed,
    })
    scenario({
        name: "stairs-red-present",
        start: { phase: "attack", me: { spirits: [{ card: HERA }, { card: VAN, label: "味方" }], nexuses: [{ card: STAIRS, cores: 0 }] }, opp: { spirits: [{ card: VAN, label: "敵" }] } },
        steps: (t) => runAttack(t, "me", nm(HERA), "敵"),
        expect: [`自分.${nm(HERA)}.疲労: false → true`, "相手.敵.場所: フィールド → なし", `相手.トラッシュ: なし → ${nm(VAN)}`, "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "stairs-opp-attack-blocker-wins",
        start: { turn: "opp", phase: "attack", me: { spirits: [{ card: HERA }], nexuses: [{ card: STAIRS, cores: 0 }] }, opp: { spirits: [{ card: VAN }] } },
        steps: (t) => {
            runAttack(t, "opp", nm(VAN), nm(HERA))
            assert(!t.inst(nm(HERA)).isRested, "ブロックして勝った緑スピリットは回復している")
        },
        expect: killed,
    })
}

// ===================================================================
console.log("=== 【不死：夜族】（ワーウルフ・コマンド／闇騎士ガウェイン／虚皇帝ネザード・バァラル）：夜族が破壊されたとき召喚できる ===")
{
    // 相手のヘラクレスにアシュタル（夜族・BP1000）がブロックして破壊される。ヘラクレスのコアは2個（ネザードのLvコスト+1でも Lv1 のまま）
    const oppSide = { spirits: [{ card: HERA, cores: 2 }] }
    const ashDies = (undead: string) => [
        `自分.${nm(ASH)}.場所: フィールド → なし`,
        `相手.${nm(HERA)}.疲労: false → true`,
    ]
    const revive = (id: string, cost: number, lv: number, bp: number) => [
        ...ashDies(id),
        `自分.トラッシュ: ${nm(id)} → ${nm(ASH)}`,
        `自分.リザーブ: 10 → ${10 + 1 - (cost - 1) - 1}`,
        `自分.トラッシュのコア: 0 → ${cost - 1}`,
        `自分.${nm(id)}.場所: なし → フィールド`,
        `自分.${nm(id)}.疲労: なし → false`,
        `自分.${nm(id)}.コア: なし → 1`,
        `自分.${nm(id)}.Lv: なし → ${lv}`,
        `自分.${nm(id)}.BP: なし → ${bp}`,
    ]
    const stay = (id: string, died: string) => [
        `自分.${nm(died)}.場所: フィールド → なし`,
        `自分.トラッシュ: ${nm(id)} → ${jn(id, died)}`,
        "自分.リザーブ: 10 → 11",
        `相手.${nm(HERA)}.疲労: false → true`,
    ]
    const cases: [string, number, number, number][] = [[WARE, 3, 1, 1000], [GAWAIN, 6, 3, 9000], [X02, 7, 1, 4000]]
    for (const [id, cost, lv, bp] of cases) {
        scenario({
            name: `undead-${id}-night`,
            start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: ASH }], trash: [id] }, opp: oppSide },
            steps: (t) => cnt(runAttack(t, "opp", nm(HERA), nm(ASH)), 1),
            expect: revive(id, cost, lv, bp),
        })
        scenario({
            name: `undead-${id}-not-night`,
            start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: VAN }], trash: [id] }, opp: oppSide },
            steps: (t) => cnt(runAttack(t, "opp", nm(HERA), nm(VAN)), 0),
            expect: stay(id, VAN),
        })
    }
    scenario({
        name: "undead-gawain-decline",
        start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: ASH }], trash: [GAWAIN] }, opp: oppSide },
        steps: (t) => cnt(runAttack(t, "opp", nm(HERA), nm(ASH), false), 1),
        expect: stay(GAWAIN, ASH),
    })
}

// ===================================================================
console.log("=== 虚獣グラスベア／軍神機メガ・テュール：【重装甲】は指定色の相手のスピリット効果を受けない（Lv2） ===")
{
    const summonedPan = [
        `相手.${nm(PAN)}.場所: なし → フィールド`, `相手.${nm(PAN)}.疲労: なし → false`, `相手.${nm(PAN)}.コア: なし → 1`,
        `相手.${nm(PAN)}.Lv: なし → 1`, `相手.${nm(PAN)}.BP: なし → 2000`, `相手.手札: ${nm(PAN)} → なし`,
    ]
    const summonedLugau = [
        `相手.${nm(LUGAU)}.場所: なし → フィールド`, `相手.${nm(LUGAU)}.疲労: なし → false`, `相手.${nm(LUGAU)}.コア: なし → 1`,
        `相手.${nm(LUGAU)}.Lv: なし → 1`, `相手.${nm(LUGAU)}.BP: なし → 3000`, `相手.手札: ${nm(LUGAU)} → なし`,
    ]
    const cast = (card: string) => (t: ScenarioCtx) => t.act("opp", { type: "summon", handIndex: 0 })
    // 召喚コストは軽減なしで cost、さらにスピリットに置くコア1個
    const paid = (cost: number) => [`相手.リザーブ: 10 → ${10 - cost - 1}`, `相手.トラッシュのコア: 0 → ${cost}`]
    scenario({
        name: "grass-lv2-yellow-immune",
        start: { turn: "opp", me: { spirits: [{ card: GRASS, cores: 3 }] }, opp: { hand: [PAN] } },
        steps: cast(PAN),
        expect: [...summonedPan, ...paid(4)],
    })
    scenario({
        name: "grass-lv1-yellow-hits",
        start: { turn: "opp", me: { spirits: [{ card: GRASS, cores: 1 }] }, opp: { hand: [PAN] } },
        steps: cast(PAN),
        expect: [...summonedPan, ...paid(4), `自分.${nm(GRASS)}.疲労: false → true`],
    })
    scenario({
        name: "mega-lv2-purple-immune",
        start: { turn: "opp", me: { spirits: [{ card: MEGA, cores: 3 }] }, opp: { hand: [LUGAU] } },
        steps: cast(LUGAU),
        expect: [...summonedLugau, ...paid(4)],
    })
    scenario({
        name: "mega-lv1-purple-hits",
        start: { turn: "opp", me: { spirits: [{ card: MEGA, cores: 2 }] }, opp: { hand: [LUGAU] } },
        steps: cast(LUGAU),
        expect: [...summonedLugau, ...paid(4), `自分.${nm(MEGA)}.コア: 2 → 1`, "自分.リザーブ: 10 → 11"],
    })
}

// ===================================================================
console.log("=== 鉄の覇王サイゴード・ゴレム：【大粉砕】アタック時にLv×5枚破棄し、バースト効果持ちが破棄されたら相手のスピリット1体を破壊 ===")
{
    const vans = (n: number) => Array.from({ length: n }, () => VAN)
    const oppSide = (deck: string[]) => ({ deck, spirits: [{ card: VAN, label: "標的" }] })
    const hitLife = ["相手.ライフ: 5 → 4"]
    scenario({
        name: "x06-lv2-burst-in-top10",
        start: { phase: "attack", me: { spirits: [{ card: X06, cores: 4 }] }, opp: oppSide([...vans(4), BURST, ...vans(5)]) },
        steps: (t) => runAttack(t, "me", nm(X06)),
        expect: [
            `自分.${nm(X06)}.疲労: false → true`, "相手.デッキ枚数: 10 → 0", `相手.トラッシュ: なし → ${jn(...vans(10), BURST)}`,
            "相手.標的.場所: フィールド → なし", "相手.リザーブ: 10 → 12", ...hitLife,
        ],
    })
    scenario({
        name: "x06-lv2-no-burst",
        start: { phase: "attack", me: { spirits: [{ card: X06, cores: 4 }] }, opp: oppSide(vans(10)) },
        steps: (t) => runAttack(t, "me", nm(X06)),
        expect: [`自分.${nm(X06)}.疲労: false → true`, "相手.デッキ枚数: 10 → 0", `相手.トラッシュ: なし → ${jn(...vans(10))}`, "相手.リザーブ: 10 → 11", ...hitLife],
    })
    // Lv1 は5枚。バーストカードは上から6枚目以降（デッキの上＝配列の先頭と仮定。質問2）
    scenario({
        name: "x06-lv1-burst-below-top5",
        start: { phase: "attack", me: { spirits: [{ card: X06, cores: 1 }] }, opp: oppSide([...vans(9), BURST]) },
        steps: (t) => runAttack(t, "me", nm(X06)),
        expect: [`自分.${nm(X06)}.疲労: false → true`, "相手.デッキ枚数: 10 → 5", `相手.トラッシュ: なし → ${jn(...vans(5))}`, "相手.リザーブ: 10 → 11", ...hitLife],
    })
    scenario({
        name: "x06-lv1-burst-in-top5",
        start: { phase: "attack", me: { spirits: [{ card: X06, cores: 1 }] }, opp: oppSide([BURST, ...vans(4)]) },
        steps: (t) => runAttack(t, "me", nm(X06)),
        expect: [
            `自分.${nm(X06)}.疲労: false → true`, "相手.デッキ枚数: 5 → 0", `相手.トラッシュ: なし → ${jn(...vans(5), BURST)}`,
            "相手.標的.場所: フィールド → なし", "相手.リザーブ: 10 → 12", ...hitLife,
        ],
    })
}

// ===================================================================
console.log("=== 虚海獣エメヒドラル：自分のバーストをセットしている間、お互いのライフはターンごとにスピリット1体から1までしか減らない ===")
{
    scenario({
        name: "eme-burst-opp-double-attack",
        start: { turn: "opp", phase: "attack", me: { spirits: [{ card: EME }], burst: BURST }, opp: { spirits: [{ card: TARAN }] } },
        steps: (t) => runAttack(t, "opp", nm(TARAN)),
        expect: [`相手.${nm(TARAN)}.疲労: false → true`, ...lifeHit("自分")],
    })
    scenario({
        name: "eme-no-burst-opp-double-attack",
        start: { turn: "opp", phase: "attack", me: { spirits: [{ card: EME }] }, opp: { spirits: [{ card: TARAN }] } },
        steps: (t) => runAttack(t, "opp", nm(TARAN)),
        expect: [`相手.${nm(TARAN)}.疲労: false → true`, ...lifeHit("自分", 2)],
    })
    scenario({
        name: "eme-burst-my-double-attack",
        start: { phase: "attack", me: { spirits: [{ card: EME }, { card: IRU }], burst: BURST } },
        steps: (t) => runAttack(t, "me", nm(IRU)),
        expect: [`自分.${nm(IRU)}.疲労: false → true`, ...lifeHit("相手")],
    })
    scenario({
        name: "eme-opp-has-burst-not-me",
        start: { phase: "attack", me: { spirits: [{ card: EME }, { card: IRU }] }, opp: { burst: BURST } },
        steps: (t) => runAttack(t, "me", nm(IRU)),
        expect: [`自分.${nm(IRU)}.疲労: false → true`, ...lifeHit("相手", 2)],
    })
}

// ===================================================================
console.log("=== 渦巻く大海峡：自分のバーストをセットしている間、『このスピリットの破壊時』効果は発揮されない（Lv2） ===")
{
    // 相手のヘラクレス（コア2）にプラズバットがブロックして破壊される。破壊時は「相手のスピリット上のコア1個を相手のリザーブへ」
    const oppSide = { spirits: [{ card: HERA, cores: 2 }] }
    const mePlaz = (nexusCores: number, burst?: string) => ({ spirits: [{ card: PLAZ }], nexuses: [{ card: OCEAN, cores: nexusCores }], ...(burst ? { burst } : {}) })
    const plazDies = [`自分.${nm(PLAZ)}.場所: フィールド → なし`, `自分.トラッシュ: なし → ${nm(PLAZ)}`, "自分.リザーブ: 10 → 11", `相手.${nm(HERA)}.疲労: false → true`]
    const plazFires = [`相手.${nm(HERA)}.コア: 2 → 1`, "相手.リザーブ: 10 → 11"]
    scenario({
        name: "ocean-lv2-burst-suppressed",
        start: { turn: "opp", phase: "attack", me: mePlaz(2, BURST), opp: oppSide },
        steps: (t) => runAttack(t, "opp", nm(HERA), nm(PLAZ)),
        expect: plazDies,
    })
    scenario({
        name: "ocean-lv2-no-burst-fires",
        start: { turn: "opp", phase: "attack", me: mePlaz(2), opp: oppSide },
        steps: (t) => runAttack(t, "opp", nm(HERA), nm(PLAZ)),
        expect: [...plazDies, ...plazFires],
    })
    scenario({
        name: "ocean-lv1-burst-fires",
        start: { turn: "opp", phase: "attack", me: mePlaz(0, BURST), opp: oppSide },
        steps: (t) => runAttack(t, "opp", nm(HERA), nm(PLAZ)),
        expect: [...plazDies, ...plazFires],
    })
    // 文面に「自分の」が無いので相手のスピリットの破壊時も止まる、と読んだ（質問3）
    const oppPlaz = { turn: "opp" as const, phase: "attack" as const, opp: { spirits: [{ card: PLAZ }] } }
    const oppPlazDies = [`相手.${nm(PLAZ)}.場所: フィールド → なし`, `相手.トラッシュ: なし → ${nm(PLAZ)}`, "相手.リザーブ: 10 → 11", `自分.${nm(HERA)}.疲労: false → true`]
    scenario({
        name: "ocean-lv2-burst-opp-spirit-suppressed",
        start: { ...oppPlaz, me: { spirits: [{ card: HERA, cores: 2 }], nexuses: [{ card: OCEAN, cores: 2 }], burst: BURST } },
        steps: (t) => runAttack(t, "opp", nm(PLAZ), nm(HERA)),
        expect: oppPlazDies,
    })
    scenario({
        name: "ocean-lv2-no-burst-opp-spirit-fires",
        start: { ...oppPlaz, me: { spirits: [{ card: HERA, cores: 2 }], nexuses: [{ card: OCEAN, cores: 2 }] } },
        steps: (t) => runAttack(t, "opp", nm(PLAZ), nm(HERA)),
        expect: [...oppPlazDies, `自分.${nm(HERA)}.コア: 2 → 1`, "自分.リザーブ: 10 → 11"],
    })
}

console.log("すべてのチェックに合格しました 🎉（part483）")

// 効果エントリの実行時カバレッジ計測（npm run coverage:effects）
//
// 目的: **「実装されているが誰も通っていない経路」を実測で洗い出す**（HANDOFF_DESIGN.md §4.3）。
// 【激突】と turnStartResumeStep は、どちらも「実装済みなのにテストが一度も通っていない」形で
// 実バグを抱えていた。静的な棚卸し（cards.json を grep して機構の使用カードを探す）では
// **「カードは smoke に登場するのに、その効果エントリだけ一度も発火していない」**層が見えない。
// 例: Lv3 効果しか持たない行が、テストが Lv1 でしか召喚しないため無言で未検証のまま——という形。
// 実績: この計測で returnSelfToHand（実行実績0）を発見し、part71 §C で塞いだ。
//
// 仕組み:
//   1. HEAD の使い捨て worktree を作る（**共有ツリーには一切触らない**。実装担当と同じツリーを
//      共有しているため。未コミットの作業中変更は計測対象に入らない＝再現可能な基準になる）
//   2. その中だけに計測コードを差し込む（下記の PATCH 一覧）
//   3. smoke を1回走らせ、記録を cards.json 側の全エントリと突き合わせる
//   4. worktree を消す
//
// 差し込みは「1箇所だけ一致すること」を必ず検査する。エンジンの形が変わって差し込みに失敗したら
// **黙って全緑にならず、その場で落ちる**（計測そのものが no-op になる事故を防ぐ）。
//
// 記録は「一度でも通ったか」だけを見るので、**Set に入れて重複を捨てる**（hasKeyword のような
// 高頻度の経路を1件ずつ書き出すと計測が重くなるため）。書き出しはプロセス終了時に1回。
import { execFileSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

const REPO = path.resolve(__dirname, "..")

// action を持つ（＝resolveAction を通る）効果 kind
const ACTION_BEARING_KINDS = new Set([
    "triggered",
    "magic",
    "step",
    "fieldEvent",
    "battleWon",
    "activated",
])

// 継続効果のうち**この計測が対応済み**の kind（走査側に計測点を入れたもの）。
//   aura           → effectiveBp（全37件が aura.type:"bp" なのでこれで網羅できる）
//   constraint     → activeConstraints ＋ isUntargetableByOpponent（**別経路が1つある**）
//   reviveOnDestroy→ tryReviveOnDestroy（実際に復活が確定した時点。経路は2つ）
//
// 2026-07-30 拡張: 残り21 kind（121件）のうち20 kindに計測点を追加した（下記リストの
// costMod以降）。原則は共通: 「**走査された時点**（.some()/.filter()に載った時点）ではなく、
// **その効果固有の条件をすべて通過して値/挙動に反映される時点**」に __covRecord を置く
// （aura の `total += auraAmount` と同じ基準）。
//
// `keyword`（64件）だけは特別扱い: カードデータ上は「保持宣言」でしかなく、挙動は
// 8つのキーワードごとに全く別の関数から読まれる（hasKeyword 自体は levels を見ないため、
// 呼ばれた時点で記録すると「持っているだけ」を「効いた」と誤読する）。そのため
// 8キーワードそれぞれの**挙動解決点**に個別の計測コードを差し込んだ:
//   soku(神速)  → RuleValidator.validateSummon（フラッシュ召喚が実際に許可された分岐）
//   awaken(覚醒)→ GameEngine.doAwaken（覚醒が実行された時点。canAwaken の true 判定ではない）
//   armor(装甲) → shared/rules.hasArmorAgainst（静的装甲が true を返す時点）
//   jugeki(呪撃)→ GameEngine（バトル終了時、装甲に防がれず実際に破壊する時点）
//   funsai(粉砕)→ EffectModules.resolveFunsai（hasFunsai が確定した時点）
//   kobo(光芒)  → EffectModules.resolveKoboOnBattleEnd（静的光芒が確定した時点）
//   clash(激突) → RuleValidator.validateTakeLife（ライフ受けが拒否される時点）
//   tensho(転召)→ EffectModules.resolveTensho（転召の解決時点）
const MEASURED_CONTINUOUS_KINDS = new Set([
    "aura",
    "constraint",
    "reviveOnDestroy",
    "costMod", // costModTotal（加算）と costSetOverride（置換）の2経路
    "reductionGrant", // reductionGrantSymbols
    "magicRestriction", // hasMagicRestriction
    "keywordGrant", // spiritHasKeyword の継続付与分岐
    "keyword", // 8キーワードそれぞれの挙動解決点（上記コメント参照）
    "globalConstraint", // hasGlobalConstraint / costCantAct / millCapFor / isBattlingCoreProtected / hasOwnNexusIndestructible / maxSpiritsOnField
    "levelAs", // refreshLevelAsOverrides の5つのlevelAsContinuous代入点
    "effectGrant", // 付与された誘発効果が実際にresolveActionへ渡る時点（__eidが継承されるため既存のact計測がそのまま拾う）
    "coreBonus", // coreBonusFor の集計点
    "immunityGrant", // hasMagicImmunity の true 判定
    "exhaustOnManualCoreAdd", // checkExhaustOnCoreChange が実際に疲労させる時点
    "constraintGrant", // activeConstraints の granted.push 時点
    "lifeDamageNegate", // hasLifeDamageNegate の true 判定
    "funsaiOnBlock", // hasFunsaiOnBlock の true 判定
    "colorAs", // refreshLevelAsOverrides の colorsAsContinuous 代入点
    "funsaiBonus", // funsaiBonusTotal の集計点
    "mustBlockGrant", // hasMustBlockAgainst の true 判定
    "magicBuffBonus", // applyMagicBuffBonus の tempBpBuff 加算点
    "familyGrant", // spiritHasFamily の true 判定
    "magicFreeGrant", // hasMagicFreeGrant の true 判定
    "coreStepBonus", // coreStepBonusFor の集計点
    "drawDouble", // drawDoubleMultiplier の return 2 判定
    "exhaustImmunityGrant", // isExhaustImmune の true 判定
    "triggerSuppression", // isTriggerSuppressed の true 判定
])

type Measurability = "action" | "continuous" | "unmeasured"

interface EffectEntry {
    cardId: string
    cardName: string
    eid: string
    kind: string
    measurability: Measurability
    actionTypes: string[]
}

function collectActionTypes(node: unknown, out: string[]): void {
    if (Array.isArray(node)) {
        for (const v of node) collectActionTypes(v, out)
        return
    }
    if (node === null || typeof node !== "object") return
    const obj = node as Record<string, unknown>
    if (typeof obj["type"] === "string") out.push(obj["type"])
    for (const v of Object.values(obj)) collectActionTypes(v, out)
}

function loadEntries(): EffectEntry[] {
    const cards = JSON.parse(
        fs.readFileSync(path.join(REPO, "data/cards.json"), "utf-8"),
    ) as { cardId: string; name: string; effects?: { id?: string; kind?: string }[] }[]
    const entries: EffectEntry[] = []
    for (const c of cards) {
        const effects = c.effects ?? []
        for (let i = 0; i < effects.length; i++) {
            const e = effects[i]
            if (!e || !e.kind) continue
            const measurability: Measurability = ACTION_BEARING_KINDS.has(e.kind)
                ? "action"
                : MEASURED_CONTINUOUS_KINDS.has(e.kind)
                  ? "continuous"
                  : "unmeasured"
            const types: string[] = []
            collectActionTypes(e, types)
            entries.push({
                cardId: c.cardId,
                cardName: c.name,
                eid: e.id ?? `${c.cardId}#${i}`,
                kind: e.kind,
                measurability,
                actionTypes: [...new Set(types)],
            })
        }
    }
    return entries
}

function patch(file: string, needle: string, replacement: string): void {
    const body = fs.readFileSync(file, "utf-8")
    const hits = body.split(needle).length - 1
    if (hits !== 1) {
        throw new Error(
            `計測コードの差し込み先が1箇所に定まりません（${hits}箇所）: ${path.basename(file)}\n` +
                `対象: ${needle.slice(0, 100)}…\n` +
                `エンジンの形が変わった可能性があります。scripts/coverage-effects.ts を追随させてください。`,
        )
    }
    fs.writeFileSync(file, body.replace(needle, replacement))
}

// server 側（GameState / EffectModules）とは別に、shared/ 用の記録器を用意する。
// shared/ は node:fs や server/ に依存しない設計なので、計測用の依存を持ち込まず
// **この worktree の中だけで**自前の記録器を定義し、別ファイルへ書き出す
function instrumentShared(tree: string, out: string): void {
    const f = path.join(tree, "shared/rules.ts")
    const header = `// [計測] 継続効果の適用を記録する（coverage-effects.ts が差し込む。共有ツリーには存在しない）
const __covSet2 = new Set<string>()
const __covRec2 = (line: string): void => { __covSet2.add(line) }
process.on("exit", () => {
    try { require("fs").writeFileSync(${JSON.stringify(out + ".shared")}, [...__covSet2].join("\\n")) } catch { /* 計測失敗は無視 */ }
})
const __covEid = (e: unknown): string =>
    String((e as Record<string, unknown> | null)?.["__eid"] ?? "?")

`
    // rules.ts だけの追加ヘルパー: keyword は __eid を持つオブジェクトが手元に無い経路
    // （hasArmorAgainst の .some() 等）が多いため、cardId+keyword名から対象の効果エントリの
    // __eid を引く。card() は cardDb.ts の遅延注入だが、この関数自体は呼ばれた時点で評価されるため
    // ファイル先頭に置いても import 順の問題は起きない（既存の __covEid と同じ考え方）
    const keywordHelper = `const __covKeywordEid2 = (cid: string, keyword: string, level?: number): string => {
    const effects = (card(cid).effects as unknown as Record<string, unknown>[]).filter(
        (e) => e["kind"] === "keyword" && e["keyword"] === keyword,
    )
    const found = level === undefined
        ? effects[0]
        : (effects.find((e) => {
              const levels = e["levels"] as number[] | null
              return levels === null || levels.includes(level)
          }) ?? effects[0])
    return String(found?.["__eid"] ?? "?")
}

`
    fs.writeFileSync(f, header + keywordHelper + fs.readFileSync(f, "utf-8"))

    // shared/cost.ts 側にも同じ記録器を注入する（別ファイルなので import せず自前で持つ）
    const fc = f.replace("rules.ts", "cost.ts")
    const headerC = header
        .replace(/__covSet2/g, "__covSet2C")
        .replace(/__covRec2/g, "__covRec2C")
        .replace(/__covEid/g, "__covEid2C")
        .replace(JSON.stringify(out + ".shared"), JSON.stringify(out + ".cost"))
    fs.writeFileSync(fc, headerC + fs.readFileSync(fc, "utf-8"))

    // aura: effectiveBp が実際に加算する時点（全フィルタ通過後）
    patch(
        f,
        `                total += auraAmount(board, pid, effect.aura, inst)`,
        `                __covRec2("cont\\t" + __covEid(effect))
                total += auraAmount(board, pid, effect.aura, inst)`,
    )
    // constraint: activeConstraints が自身の制約として採用する時点
    patch(
        f,
        `        .map((e) => (e as { constraint: ConstraintDef }).constraint)`,
        `        .map((e) => { __covRec2("cont\\t" + __covEid(e)); return (e as { constraint: ConstraintDef }).constraint })`,
    )
    // costMod（加算）: 実際にコストへ加算する時点
    patch(
        f.replace("rules.ts", "cost.ts"),
        `                total += effect.amount`,
        `                __covRec2C("cont\t" + __covEid2C(effect))
                total += effect.amount`,
    )
    // costMod（置換 mode:"set"）: 採用値を決める時点
    patch(
        f.replace("rules.ts", "cost.ts"),
        `            if (result === undefined || effect.setTo < result) result = effect.setTo`,
        `            __covRec2C("cont\t" + __covEid2C(effect))
            if (result === undefined || effect.setTo < result) result = effect.setTo`,
    )
    // reductionGrant: 軽減シンボルを実際に足す時点
    patch(
        f.replace("rules.ts", "cost.ts"),
        `            extra.push(...effect.symbols)`,
        `            __covRec2C("cont\t" + __covEid2C(effect))
            extra.push(...effect.symbols)`,
    )
    // magicRestriction: 制限が成立して true を返す時点
    patch(
        f.replace("rules.ts", "cost.ts"),
        `                if (effect.turn === "opponent" && ownerPid === board.turnPlayer) continue
                return true`,
        `                if (effect.turn === "opponent" && ownerPid === board.turnPlayer) continue
                __covRec2C("cont\t" + __covEid2C(effect))
                return true`,
    )
    // keywordGrant: 継続付与が成立して true を返す時点
    // （2026-07-31: vanillaFilter の追加で最終行が変わったためアンカーを差し替え）
    patch(
        f,
        `            if (effect.vanillaFilter && !isVanillaCard(card(inst.cardId))) continue
            return true`,
        `            if (effect.vanillaFilter && !isVanillaCard(card(inst.cardId))) continue
            __covRec2("cont\t" + __covEid(effect))
            return true`,
    )
    // constraint（別経路）: untargetableByOpponent は activeConstraints を通らず
    // isUntargetableByOpponent が直接 effects を走査する。ここを入れないと
    // 「ワルキューレの制約が一度も適用されていない」という誤検出が出る
    patch(
        f,
        `    return card(inst.cardId).effects.some(
        (e) =>
            e.kind === "constraint" &&
            e.constraint.type === "untargetableByOpponent" &&
            effectActiveAtLevel(e.levels, level),
    )`,
        `    return card(inst.cardId).effects.some((e) => {
        if (
            e.kind !== "constraint" ||
            e.constraint.type !== "untargetableByOpponent" ||
            !effectActiveAtLevel(e.levels, level)
        ) {
            return false
        }
        __covRec2("cont\\t" + __covEid(e))
        return true
    })`,
    )
    // familyGrant: spiritHasFamily が継続付与を採用して true を返す時点
    patch(
        f,
        `                const { color, count } = effect.condition.ownColorTotalAtLeast
                const onField = [...player.field.spirits, ...player.field.nexuses]
                const total = onField.filter((s) => instHasColor(s, color)).length
                if (total < count) continue
            }
            return true`,
        `                const { color, count } = effect.condition.ownColorTotalAtLeast
                const onField = [...player.field.spirits, ...player.field.nexuses]
                const total = onField.filter((s) => instHasColor(s, color)).length
                if (total < count) continue
            }
            __covRec2("cont\\t" + __covEid(effect))
            return true`,
    )
    // constraintGrant: activeConstraints が付与制約を合成する時点
    patch(
        f,
        `            granted.push(effect.constraint)`,
        `            __covRec2("cont\\t" + __covEid(effect))
            granted.push(effect.constraint)`,
    )
    // keyword「装甲」: hasArmorAgainst の静的判定が true を返す時点
    // （.some() の中は effect を取り出せないため、cid+keyword+level から専用ヘルパーで引き直す）
    patch(
        f,
        `    if (staticArmor) return true`,
        `    if (staticArmor) {
        __covRec2("cont\\t" + __covKeywordEid2(inst.cardId, "armor", level))
        return true
    }`,
    )
    // globalConstraint（singleCoreCantAct / nexusIndestructible）: hasGlobalConstraint の true 判定
    patch(
        f,
        `            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== type) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                return true
            }`,
        `            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== type) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                __covRec2("cont\\t" + __covEid(effect))
                return true
            }`,
    )
    // globalConstraint（costCantAct）: しきい値を実際に満たして true を返す時点
    patch(
        f,
        `                if (cost <= effect.constraint.maxCost) return true`,
        `                if (cost <= effect.constraint.maxCost) {
                    __covRec2("cont\\t" + __covEid(effect))
                    return true
                }`,
    )
    // immunityGrant: hasMagicImmunity が true を返す時点
    patch(
        f,
        `            if (effect.condition) {
                const { cost, count } = effect.condition.ownCostCountAtLeast
                const matchCount = player.field.spirits.filter((s) => card(s.cardId).cost === cost).length
                if (matchCount < count) continue
            }
            return true`,
        `            if (effect.condition) {
                const { cost, count } = effect.condition.ownCostCountAtLeast
                const matchCount = player.field.spirits.filter((s) => card(s.cardId).cost === cost).length
                if (matchCount < count) continue
            }
            __covRec2("cont\\t" + __covEid(effect))
            return true`,
    )
    // magicFreeGrant: hasMagicFreeGrant が true を返す時点（shared/cost.ts）
    patch(
        fc,
        `            return true
        }
    }
    return false
}
// pidのフィールド（スピリット＋ネクサス）が持つシンボルの色集合`,
        `            __covRec2C("cont\\t" + __covEid2C(effect))
            return true
        }
    }
    return false
}
// pidのフィールド（スピリット＋ネクサス）が持つシンボルの色集合`,
    )
}

function main(): void {
    const entries = loadEntries()
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "bsweb-cov-"))
    const tree = path.join(work, "tree")
    const outFile = path.join(work, "records.txt")

    try {
        execFileSync("git", ["worktree", "add", "--detach", tree, "HEAD"], {
            cwd: REPO,
            stdio: "pipe",
        })
        fs.symlinkSync(path.join(REPO, "node_modules"), path.join(tree, "node_modules"))

        // (1) カードマスタ読み込み直後に、各効果エントリと配下の action へ由来 id を刻む。
        //     継続効果はエントリ自身に、action を持つ効果は配下の action オブジェクトにも刻む
        patch(
            path.join(tree, "server/src/logic/GameState.ts"),
            `export function getCard(cardId: string): CardData {`,
            `// [計測] 効果エントリとその配下の action オブジェクトに由来 id を刻む
const __covTag = (node: unknown, eid: string): void => {
    if (Array.isArray(node)) { for (const v of node) __covTag(v, eid); return }
    if (node === null || typeof node !== "object") return
    const obj = node as Record<string, unknown>
    obj["__eid"] = eid
    for (const v of Object.values(obj)) __covTag(v, eid)
}
for (const [cardId, card] of CARD_DB) {
    const effects = (card.effects ?? []) as { id?: string }[]
    for (let i = 0; i < effects.length; i++) __covTag(effects[i], effects[i]?.id ?? cardId + "#" + i)
}

export function getCard(cardId: string): CardData {`,
        )

        // (2) 記録器（重複は Set で捨て、プロセス終了時に1回だけ書き出す）
        patch(
            path.join(tree, "server/src/logic/GameState.ts"),
            `let instanceSeq = 0`,
            `let instanceSeq = 0
// [計測] 実行された効果エントリと、場に出たカードを記録する
const __covOut = process.env["COV_OUT"]
const __covSet = new Set<string>()
export const __covRecord = (line: string): void => { __covSet.add(line) }
process.on("exit", () => {
    if (__covOut !== undefined) {
        try { fs.writeFileSync(__covOut, [...__covSet].join("\\n")) } catch { /* 計測失敗は無視 */ }
    }
})`,
        )

        // (3) resolveAction: どの効果エントリ由来の action かを記録する
        patch(
            path.join(tree, "server/src/logic/EffectModules.ts"),
            `    const handler = ACTION_HANDLERS[action.type] as (c: ActionCtx, a: EffectAction) => void`,
            `    // [計測] この action がどの効果エントリ由来か
    __covRecord("act\\t" + String((action as unknown as Record<string, unknown>)["__eid"] ?? "?") + "\\t" + action.type)
    const handler = ACTION_HANDLERS[action.type] as (c: ActionCtx, a: EffectAction) => void`,
        )

        // (4) reviveOnDestroy: 実際に復活が確定した時点。
        //     **経路は2つある**（inst 自身が持つ reviveOnDestroy と、フィールドの他カード由来）。
        //     インデントで区別して両方に入れる（片方だけだと「復活したのに未計測」が出る）
        for (const indent of ["        ", "            "]) {
            patch(
                path.join(tree, "server/src/logic/EffectModules.ts"),
                `${indent}const name = getCard(inst.cardId).name\n${indent}applyRevived(effect.revived)`,
                `${indent}const name = getCard(inst.cardId).name\n` +
                    `${indent}__covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))\n` +
                    `${indent}applyRevived(effect.revived)`,
            )
        }

        // (4.5) keywordGrant（装甲）は shared/ の hasContinuousKeywordGrant を通らない。
        //     refreshLevelAsOverrides が CardInstance.armorColorsGranted へ毎回再計算して
        //     materialize する別経路なので、そこにも計測点を入れる（片方だけだと
        //     「侵されざる聖域／白夜の虚空の装甲付与が一度も適用されていない」という誤検出が出る）
        patch(
            path.join(tree, "server/src/logic/EffectModules.ts"),
            `                        if (!spirit.armorColorsGranted) spirit.armorColorsGranted = []`,
            `                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        if (!spirit.armorColorsGranted) spirit.armorColorsGranted = []`,
        )

        // (5) EffectModules 側で __covRecord を使うための import 追記
        patch(
            path.join(tree, "server/src/logic/EffectModules.ts"),
            `    minLevelCores,`,
            `    minLevelCores,\n    __covRecord,`,
        )

        // (5a) EffectModules.ts 内の残り継続 kind（2026-07-30 拡張）。
        //     いずれも「.some()/.filter() に載った時点」ではなく「その効果固有の条件を
        //     すべて通過して値/挙動に反映される時点」に置く（aura の total += auraAmount と同じ基準）
        const em = path.join(tree, "server/src/logic/EffectModules.ts")
        // globalConstraint「ownNexusIndestructible」: hasOwnNexusIndestructible の true 判定
        patch(
            em,
            `            if (effect.condition) {
                const vanillaCount = player.field.spirits.filter((s) =>
                    isVanillaCard(getCard(s.cardId)),
                ).length
                if (vanillaCount < effect.condition.ownVanillaSpiritsAtLeast) continue
            }
            return true`,
            `            if (effect.condition) {
                const vanillaCount = player.field.spirits.filter((s) =>
                    isVanillaCard(getCard(s.cardId)),
                ).length
                if (vanillaCount < effect.condition.ownVanillaSpiritsAtLeast) continue
            }
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return true`,
        )
        // globalConstraint「battlingCoresProtected」: isBattlingCoreProtected の true 判定
        patch(
            em,
            `                if (effect.constraint.type !== "battlingCoresProtected") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                return true`,
            `                if (effect.constraint.type !== "battlingCoresProtected") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                return true`,
        )
        // globalConstraint「millCap」: millCapFor の集計点（perTurn有無を問わずすべてのmillCap効果を通る）
        patch(
            em,
            `            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "millCap") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            cap = Math.min(cap, effect.constraint.maxCount)`,
            `            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "millCap") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            cap = Math.min(cap, effect.constraint.maxCount)`,
        )
        // coreBonus: coreBonusFor の集計点
        patch(
            em,
            `        if (!effectActiveAtLevel(e.levels, level)) continue
        bonus += e.amount`,
            `        if (!effectActiveAtLevel(e.levels, level)) continue
        __covRecord("cont\\t" + String((e as unknown as Record<string, unknown>)["__eid"] ?? "?"))
        bonus += e.amount`,
        )
        // coreStepBonus: coreStepBonusFor の集計点
        patch(
            em,
            `            bonus += effect.amount`,
            `            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            bonus += effect.amount`,
        )
        // exhaustImmunityGrant: isExhaustImmune が true を返す時点
        patch(
            em,
            `                if (effect.phaseTurn.turn === "own" && targetOwnerPid !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && targetOwnerPid === state.turnPlayer) continue
            }
            return true`,
            `                if (effect.phaseTurn.turn === "own" && targetOwnerPid !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && targetOwnerPid === state.turnPlayer) continue
            }
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return true`,
        )
        // lifeDamageNegate: hasLifeDamageNegate が true を返す時点
        patch(
            em,
            `            if (attackerBp <= effectiveBp(state, defenderPid, source)) return true`,
            `            if (attackerBp <= effectiveBp(state, defenderPid, source)) {
                __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                return true
            }`,
        )
        // funsaiOnBlock: hasFunsaiOnBlock が true を返す時点
        patch(
            em,
            `            if (effect.kind !== "funsaiOnBlock") continue
            if (effectActiveAtLevel(effect.levels, level)) return true`,
            `            if (effect.kind !== "funsaiOnBlock") continue
            if (effectActiveAtLevel(effect.levels, level)) {
                __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                return true
            }`,
        )
        // funsaiBonus: funsaiBonusTotal の集計点
        patch(
            em,
            `            if (effect.kind !== "funsaiBonus") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            total += effect.amount`,
            `            if (effect.kind !== "funsaiBonus") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            total += effect.amount`,
        )
        // keyword「粉砕」: resolveFunsai で粉砕保持が確定した時点。
        // 2026-07-31: 判定が静的 hasKeyword から状態対応の spiritHasKeyword へ変わったため
        // アンカーを差し替えた（貸与による付与も対象になる）。
        // 静的 keyword エントリが無い個体（keywordGrant による付与のみ）では記録しない
        patch(
            em,
            `    const level = currentLevel(spirit).level
    const bonus = funsaiBonusTotal(state, ownerPid)`,
            `    const level = currentLevel(spirit).level
    const __funsaiEntry = getCard(spirit.cardId).effects.find(
        (e) => e.kind === "keyword" && e.keyword === "funsai" && effectActiveAtLevel(e.levels, level),
    )
    if (__funsaiEntry) __covRecord("cont\\t" + String((__funsaiEntry as unknown as Record<string, unknown>)["__eid"] ?? "?"))
    const bonus = funsaiBonusTotal(state, ownerPid)`,
        )
        // keyword「光芒」: resolveKoboOnBattleEnd で静的光芒が確定した時点（一時付与・継続付与は対象外）
        patch(
            em,
            `    if (!hasKobo) return
    const player = state.players[attackerPid]`,
            `    if (!hasKobo) return
    if (hasStaticKobo) {
        const __koboEntry = getCard(attacker.cardId).effects.find(
            (e) => e.kind === "keyword" && e.keyword === "kobo" && effectActiveAtLevel(e.levels, attackerLevel),
        )
        if (__koboEntry) __covRecord("cont\\t" + String((__koboEntry as unknown as Record<string, unknown>)["__eid"] ?? "?"))
    }
    const player = state.players[attackerPid]`,
        )
        // keyword「転召」: resolveTensho の解決時点（effect が既に対象の keyword エントリそのもの）
        patch(
            em,
            `    if (!effect || effect.kind !== "keyword") return
    const minCost = effect.minCost ?? 0`,
            `    if (!effect || effect.kind !== "keyword") return
    __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
    const minCost = effect.minCost ?? 0`,
        )
        // colorAs: refreshLevelAsOverrides の colorsAsContinuous 代入点
        patch(
            em,
            `                    if (effect.lentOnly && !isVirtualSource(source)) continue
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    // 仮想発生源は場に実在しないため、target:"self" の対象にはできない（TURN_EFFECT_SOURCES.md §4.1）
                    const targets = effect.target === "ownAll" ? player.field.spirits : [source]`,
            `                    if (effect.lentOnly && !isVirtualSource(source)) continue
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                    // 仮想発生源は場に実在しないため、target:"self" の対象にはできない（TURN_EFFECT_SOURCES.md §4.1）
                    const targets = effect.target === "ownAll" ? player.field.spirits : [source]`,
        )
        // levelAs: refreshLevelAsOverrides の5つの levelAsContinuous 代入点（target ごと）
        patch(
            em,
            `                if (effect.target === "self") {
                    source.levelAsContinuous = resolveTreatAs(effect.treatAs, source)
                } else if (effect.target === "ownNexusesAll") {`,
            `                if (effect.target === "self") {
                    __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                    source.levelAsContinuous = resolveTreatAs(effect.treatAs, source)
                } else if (effect.target === "ownNexusesAll") {`,
        )
        patch(
            em,
            `                } else if (effect.target === "ownNexusesAll") {
                    for (const nexus of player.field.nexuses) {
                        nexus.levelAsContinuous = resolveTreatAs(effect.treatAs, nexus)
                    }
                } else if (effect.target === "opponentNexusesAll") {`,
            `                } else if (effect.target === "ownNexusesAll") {
                    for (const nexus of player.field.nexuses) {
                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        nexus.levelAsContinuous = resolveTreatAs(effect.treatAs, nexus)
                    }
                } else if (effect.target === "opponentNexusesAll") {`,
        )
        patch(
            em,
            `                    for (const nexus of state.players[opponentOf(pid)].field.nexuses) {
                        nexus.levelAsContinuous = resolveTreatAs(effect.treatAs, nexus)
                    }
                } else if (effect.target === "ownSpiritsByKeyword") {`,
            `                    for (const nexus of state.players[opponentOf(pid)].field.nexuses) {
                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        nexus.levelAsContinuous = resolveTreatAs(effect.treatAs, nexus)
                    }
                } else if (effect.target === "ownSpiritsByKeyword") {`,
        )
        patch(
            em,
            `                        if (!hasStaticKeyword) continue
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "ownSpiritsVanilla") {`,
            `                        if (!hasStaticKeyword) continue
                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "ownSpiritsVanilla") {`,
        )
        patch(
            em,
            `                } else if (effect.target === "ownSpiritsVanilla") {
                    // カードに効果の記述を持たない（バニラ）持ち主のスピリットすべて（サファイアの城壁）
                    for (const spirit of player.field.spirits) {
                        if (!isVanillaCard(getCard(spirit.cardId))) continue
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                }`,
            `                } else if (effect.target === "ownSpiritsVanilla") {
                    // カードに効果の記述を持たない（バニラ）持ち主のスピリットすべて（サファイアの城壁）
                    for (const spirit of player.field.spirits) {
                        if (!isVanillaCard(getCard(spirit.cardId))) continue
                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                }`,
        )
        // magicBuffBonus: applyMagicBuffBonus が tempBpBuff を実際に加算する時点
        patch(
            em,
            `            target.tempBpBuff += effect.amountBonus`,
            `            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            target.tempBpBuff += effect.amountBonus`,
        )
        // drawDouble: drawDoubleMultiplier の return 2 判定
        patch(
            em,
            `            if (state.phase !== effect.phaseTurn.phase) continue
            if (effect.phaseTurn.turn === "own" && owner !== state.turnPlayer) continue
            return 2`,
            `            if (state.phase !== effect.phaseTurn.phase) continue
            if (effect.phaseTurn.turn === "own" && owner !== state.turnPlayer) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return 2`,
        )
        // triggerSuppression: isTriggerSuppressed が true を返す時点
        patch(
            em,
            `                if (effect.turn === "own" && sourcePid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && sourcePid === state.turnPlayer) continue
                return true`,
            `                if (effect.turn === "own" && sourcePid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && sourcePid === state.turnPlayer) continue
                __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                return true`,
        )
        // exhaustOnManualCoreAdd: checkExhaustOnCoreChange が実際に疲労させる時点
        patch(
            em,
            `            if (opts.viaEffect && opts.isRemoval && !effect.onRemove) continue
            affectedInst.isRested = true`,
            `            if (opts.viaEffect && opts.isRemoval && !effect.onRemove) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            affectedInst.isRested = true`,
        )

        // (5b) RuleValidator.ts: 強制ブロック・激突・スピリット数上限・神速召喚（keyword「神速」）
        const rv = path.join(tree, "server/src/logic/RuleValidator.ts")
        patch(
            rv,
            `    getCard,\n    minLevelCores,\n    opponentOf,\n} from "./GameState"`,
            `    getCard,\n    minLevelCores,\n    opponentOf,\n    __covRecord,\n} from "./GameState"`,
        )
        // globalConstraint「maxSpiritsOnField」: 値の集計点
        patch(
            rv,
            `                const max = effect.constraint.max
                cap = cap === null ? max : Math.min(cap, max)`,
            `                __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                const max = effect.constraint.max
                cap = cap === null ? max : Math.min(cap, max)`,
        )
        // keyword「神速」: フラッシュタイミングで静的神速により召喚が許可される分岐
        patch(
            rv,
            `    const flashSummon = state.isFlashTiming && (hasKeyword(cardId, "soku") || hasTempSoku)`,
            `    const __staticSoku = hasKeyword(cardId, "soku")
    if (state.isFlashTiming && __staticSoku) {
        const __sokuEntry = getCard(cardId).effects.find((e) => e.kind === "keyword" && e.keyword === "soku")
        if (__sokuEntry) __covRecord("cont\\t" + String((__sokuEntry as unknown as Record<string, unknown>)["__eid"] ?? "?"))
    }
    const flashSummon = state.isFlashTiming && (__staticSoku || hasTempSoku)`,
        )
        // mustBlockGrant: hasMustBlockAgainst が true を返す時点
        patch(
            rv,
            `            if (
                effect.familyFilter !== undefined &&
                !matchesFamilyFilter(state, attackerPid, attacker, effect.familyFilter)
            ) {
                continue
            }
            return true`,
            `            if (
                effect.familyFilter !== undefined &&
                !matchesFamilyFilter(state, attackerPid, attacker, effect.familyFilter)
            ) {
                continue
            }
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return true`,
        )
        // keyword「激突」: 【激突】によりライフ受けが実際に拒否される時点
        patch(
            rv,
            `    ) {
        return "【激突】によりブロックしなければなりません"
    }`,
            `    ) {
        if (hasKeyword(attacker.cardId, "clash")) {
            const __clashEntry = getCard(attacker.cardId).effects.find((e) => e.kind === "keyword" && e.keyword === "clash")
            if (__clashEntry) __covRecord("cont\\t" + String((__clashEntry as unknown as Record<string, unknown>)["__eid"] ?? "?"))
        }
        return "【激突】によりブロックしなければなりません"
    }`,
        )

        // (5c) GameEngine.ts: keyword「覚醒」（実行された時点）・keyword「呪撃」（バトル終了時の破壊）
        const ge = path.join(tree, "server/src/logic/GameEngine.ts")
        patch(
            ge,
            `    getCard,\n    log,\n    minLevelCores,\n    opponentOf,\n} from "./GameState"`,
            `    getCard,\n    log,\n    minLevelCores,\n    opponentOf,\n    __covRecord,\n} from "./GameState"`,
        )
        patch(
            ge,
            `    if (!target || !from) return "対象のスピリットが見つかりません"

    from.cores -= count`,
            `    if (!target || !from) return "対象のスピリットが見つかりません"

    const __awakenLevel = currentLevel(target).level
    const __awakenEntry = getCard(target.cardId).effects.find(
        (e) => e.kind === "keyword" && e.keyword === "awaken" && effectActiveAtLevel(e.levels, __awakenLevel),
    )
    if (__awakenEntry) __covRecord("cont\\t" + String((__awakenEntry as unknown as Record<string, unknown>)["__eid"] ?? "?"))

    from.cores -= count`,
        )
        patch(
            ge,
            `            } else {
                log(
                    state,
                    \`\${getCard(attacker.cardId).name}の【呪撃】：\${getCard(blocker.cardId).name}を破壊した。\`,
                )
                destroySpirit(state, defenderPid, blocker.instanceId, "destroy", {`,
            `            } else {
                log(
                    state,
                    \`\${getCard(attacker.cardId).name}の【呪撃】：\${getCard(blocker.cardId).name}を破壊した。\`,
                )
                const __jugekiEntry = getCard(attacker.cardId).effects.find(
                    (e) => e.kind === "keyword" && e.keyword === "jugeki" && effectActiveAtLevel(e.levels, attackerLevel),
                )
                if (__jugekiEntry) __covRecord("cont\\t" + String((__jugekiEntry as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                destroySpirit(state, defenderPid, blocker.instanceId, "destroy", {`,
        )

        // (6) createInstance 本体の先頭に「場に出たカード」の記録を挿す
        //     （引数リストが複数行なので、関数名の後の "):" 以降の最初の "{" を本体開始とみなす）
        const gsPath = path.join(tree, "server/src/logic/GameState.ts")
        const gs = fs.readFileSync(gsPath, "utf-8")
        const ciIdx = gs.indexOf("export function createInstance(")
        if (ciIdx < 0) throw new Error("createInstance が見つかりません（計測コードを追随させてください）")
        const bodyStart = gs.indexOf("{", gs.indexOf("):", ciIdx))
        if (bodyStart < 0) throw new Error("createInstance の本体開始位置を特定できません")
        fs.writeFileSync(
            gsPath,
            gs.slice(0, bodyStart + 1) + `\n    __covRecord("inst\\t" + cardId)` + gs.slice(bodyStart + 1),
        )

        // (7) 継続効果（aura / constraint / keyword）は shared/ 側に計測点を入れる
        instrumentShared(tree, outFile)

        execFileSync("npx", ["tsx", "scripts/smoke.ts", "--quiet"], {
            cwd: tree,
            env: { ...process.env, COV_OUT: outFile },
            stdio: "pipe",
        })

        const firedEids = new Set<string>()
        const firedTypes = new Set<string>()
        // カードデータ由来（id が刻まれている）で実行された action.type。
        // テストが手で組んだ action（id なし）だけで動いている型は、
        // 「機構は通っているがカードのデータ経由では一度も通っていない」＝データ側が未検証
        const firedTypesFromCards = new Set<string>()
        const directOnlyTypes = new Set<string>()
        const instantiated = new Set<string>()

        const readRecords = (file: string): string[] =>
            fs.existsSync(file) ? fs.readFileSync(file, "utf-8").split("\n") : []
        for (const line of [
            ...readRecords(outFile),
            ...readRecords(outFile + ".shared"),
            ...readRecords(outFile + ".cost"),
        ]) {
            const [tag, a, b] = line.split("\t")
            if (tag === "act") {
                if (a === "?" || a === undefined) {
                    if (b !== undefined) directOnlyTypes.add(b)
                } else {
                    firedEids.add(a)
                    if (b !== undefined) firedTypesFromCards.add(b)
                }
                if (b !== undefined) firedTypes.add(b)
            } else if (tag === "cont" && a !== undefined && a !== "?") {
                firedEids.add(a)
            } else if (tag === "inst" && a !== undefined) {
                instantiated.add(a)
            }
        }
        if (firedEids.size === 0) {
            throw new Error("記録が空です。計測コードの差し込みが効いていません（no-op 事故）")
        }

        report(entries, firedEids, firedTypes, firedTypesFromCards, instantiated, directOnlyTypes)
    } finally {
        try {
            execFileSync("git", ["worktree", "remove", "--force", tree], { cwd: REPO, stdio: "pipe" })
        } catch {
            /* 後片付けの失敗は本題ではない */
        }
        fs.rmSync(work, { recursive: true, force: true })
    }
}

function summarize(label: string, entries: EffectEntry[], firedEids: Set<string>): EffectEntry[] {
    const notFired = entries.filter((e) => !firedEids.has(e.eid))
    const fired = entries.length - notFired.length
    const pct = entries.length === 0 ? "-" : ((fired / entries.length) * 100).toFixed(1)
    console.log(`${label}: ${entries.length}件中 ${fired}件が実行済み（${pct}%）／未実行 ${notFired.length}件`)
    return notFired
}

function report(
    entries: EffectEntry[],
    firedEids: Set<string>,
    firedTypes: Set<string>,
    firedTypesFromCards: Set<string>,
    instantiated: Set<string>,
    directOnlyTypes: Set<string>,
): void {
    const actionEntries = entries.filter((e) => e.measurability === "action")
    const contEntries = entries.filter((e) => e.measurability === "continuous")
    const unmeasured = entries.filter((e) => e.measurability === "unmeasured")

    console.log(`効果エントリ 総数 ${entries.length}件`)
    const notFiredAction = summarize("  action を持つ効果", actionEntries, firedEids)
    const notFiredCont = summarize("  継続効果（計測対応済み）", contEntries, firedEids)
    console.log(
        `  継続効果（未計測の kind）: ${unmeasured.length}件 ` +
            `※ 2026-07-30時点で全kindに計測点を追加済みのため通常0件。0でなければ新しいkindが追加されている`,
    )

    // 未適用の内訳（kind 別）。どの層が薄いのかを一目で見るため
    const byKind = (list: EffectEntry[]): string => {
        const c = new Map<string, number>()
        for (const e of list) c.set(e.kind, (c.get(e.kind) ?? 0) + 1)
        return [...c.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => `${k}=${n}`)
            .join(" / ")
    }
    console.log(`  未実行の内訳: ${byKind([...notFiredAction, ...notFiredCont])}`)

    // ★ 最重要: 場に出ている（＝テストに登場する）のに、その効果だけ発火していないもの。
    // 「カードごと未登場」は単に未テストなだけだが、こちらは**通っているつもりで通っていない**形。
    // kind ごとにまとめて出す（全件を並べると読めないため、各 kind 先頭8件まで。--all で全件）
    const showAll = process.argv.includes("--all")
    const silent = [...notFiredAction, ...notFiredCont].filter((e) => instantiated.has(e.cardId))
    console.log(`\n★ 場に出ているのに一度も適用されていない効果: ${silent.length}件（${byKind(silent)}）`)
    const kinds = [...new Set(silent.map((e) => e.kind))]
    for (const kind of kinds) {
        const list = silent.filter((e) => e.kind === kind)
        console.log(`  [${kind}] ${list.length}件`)
        for (const e of showAll ? list : list.slice(0, 8)) {
            const detail = e.actionTypes.length > 0 ? ` → ${e.actionTypes.join(", ")}` : ""
            console.log(`    ${e.cardId} ${e.cardName} ${e.eid}${detail}`)
        }
        if (!showAll && list.length > 8) console.log(`    …ほか${list.length - 8}件（全件は --all）`)
    }

    // action.type 単位の機構カバレッジ。2段階で見る:
    //   (a) 一度も実行されていない＝機構そのものが未検証（【激突】と同型。最優先）
    //   (b) テストが手で組んだ action でしか実行されていない＝**カードデータ経由が未検証**
    //       （effects の書き方の誤り——レベル指定漏れ・フィルタの取り違え——はここでしか出ない）
    const allTypes = new Set<string>()
    for (const e of actionEntries) for (const t of e.actionTypes) allTypes.add(t)
    const usersOf = (t: string): string[] =>
        actionEntries.filter((e) => e.actionTypes.includes(t)).map((e) => e.cardId)
    const deadTypes = [...allTypes].filter((t) => !firedTypes.has(t)).sort()
    const onlyDirect = [...allTypes].filter((t) => firedTypes.has(t) && !firedTypesFromCards.has(t)).sort()

    console.log(`\n(a) 一度も実行されていない action.type: ${deadTypes.length}種`)
    for (const t of deadTypes) {
        const u = usersOf(t)
        console.log(`  ${t}（使用: ${u.slice(0, 4).join(", ")}${u.length > 4 ? " ほか" : ""}）`)
    }
    console.log(
        `\n(b) テストが手で組んだ action でしか実行されていない（カードデータ経由が未検証）: ${onlyDirect.length}種`,
    )
    for (const t of onlyDirect) {
        const u = usersOf(t)
        console.log(`  ${t}（使用: ${u.slice(0, 4).join(", ")}${u.length > 4 ? " ほか" : ""}）`)
    }
    if (directOnlyTypes.size > 0) {
        console.log(
            `\n（参考）テストが手で組んだ action の種類数: ${directOnlyTypes.size}種` +
                `——カードに載っていない action をテストが直接叩いた分`,
        )
    }
}

main()

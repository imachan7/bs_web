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
import { loadAllCards } from "../data/loadCards"

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
    "alsoCostGrant", // instHasCost / instMatchesCostFilter が alsoCostsContinuous でマッチした時点（読む側で計測）
    // ここから 2026-08-24 追加。それまで「未計測の kind」として発火を測れていなかった層
    "familySuppression", // isFamilySuppressed の true 判定
    "bpBuffSuppression", // isBpBuffSuppressed の true 判定
    "sokuPaySourceGrant", // sokuPayableInstanceIds が支払い元を許可した時点
    "nexusEffectsDisabled", // areNexusEffectsDisabled の true 判定
    "handKeywordGrant", // hasHandKeywordGrant の true 判定
    "countAsMultiple", // countSpiritsWeighted が N 体分として数えた時点
    "constraintSuppression", // activeConstraints が制約を取り除く時点
    "awakenFromReserve", // canAwakenFromReserve の true 判定
    "vanillaAsGrant", // treatedAsVanillaContinuous の代入点
    "levelCostMod", // levelCostBonusContinuous の加算点
    "spiritEffectsDisabledGrant", // effectsDisabledContinuous の代入点
    "nameAsGrant", // namesAsContinuous の追加点
    "symbolFix", // symbolsOverrideContinuous の代入点
    "magicNegate", // payMagicNegate（無効化のコストを実際に払った時点）
    "magicTargetRedirect", // setTargetRedirect が絞り込みを立てた時点
    "bothSidesTargetRedirect", // 発生源として確定した時点
    "battleBpAsLevel", // バトルのBP比較で別レベルのBPを返した時点
    "destroyedCoresToTrash", // destroyedCoresGoToTrash の true 判定
    "onMilledFromDeck", // 破棄されたカード自身の効果が発揮された時点
    "millCapBonus", // millCapBonusFor の加算点
    "bofuCountBonus", // bofuCountBonusTotal の加算点
    "kyoshuOnBlock", // hasKyoshuOnBlock の true 判定
    "bofuOnBlock", // hasBofuOnBlock の true 判定
    "bofuChooserSelf", // hasBofuChooserSelf の true 判定
    "lifeDamageMillGuard", // 実際にデッキを1枚削って守りに入った時点
    "summonedExhaustGrant", // hasSummonedExhaustGrant の true 判定
    "koboOnBlock", // hasKoboOnBlock の true 判定
    "blockTriggersAsAttackGrant", // hasBlockTriggersAsAttack の true 判定
    "attackTriggersAsBlockGrant", // hasAttackTriggersAsBlock の true 判定
    "targetNegateByHandDiscard", // 手札を破棄して効果を防いだ時点
    "milledMagicToTegamoto", // 破棄されたマジックを手元へ移した時点
    "deckMillNegate", // 無効化できる発生源として確定した時点
    "coreReturnBonus", // coreReturnBonusFor の加算点
    "freeSummonFromHandOnDiscardedByOpponent", // 条件を満たして召喚へ進んだ時点
    "freeSummonFromHandOnLifeDamaged", // 条件を満たして召喚へ進んだ時点
    "jugekiCoreToVoid", // 【呪撃】でコアをボイドへ置いた時点
    "magicNegatePayByNexusGrant", // ネクサスでの肩代わりを許可した時点
    "magicNegateTurnOverrideGrant", // 発揮タイミングを置き換えた時点
    "magicRepeatGrant", // もう一度発揮させる発生源として確定した時点
    "flashLockWhileAttackingFamily", // フラッシュ封印が成立した時点
    "nexusCostMillPay", // デッキ破棄での支払いが可能と判定した時点
    "summonCostHandDiscardPay", // 手札破棄での支払いが可能と判定した時点
    "jugekiOnBlockReplace", // hasJugekiOnBlockReplace の true 判定
    "tenshoSelfCostBonus", // 【転召】のコストへ加算した時点（自身版・ownAll版の2経路）
    "battleSwapSummon", // 入れ替え召喚が成立した時点
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
    const cards = loadAllCards() as unknown as {
        cardId: string
        name: string
        effects?: { id?: string; kind?: string }[]
    }[]
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

// 検査モード（checkPatchTargets）: ファイルを書き換えず、差し込み先が1箇所に定まるかだけを見る。
// 見つからない／複数あるときは投げずに DRY_ERRORS へ積む（全件をまとめて報告するため）
let DRY_RUN = false
const DRY_ERRORS: string[] = []

function patch(file: string, needle: string, replacement: string): void {
    const body = fs.readFileSync(file, "utf-8")
    const hits = body.split(needle).length - 1
    if (hits !== 1) {
        const message =
            `計測コードの差し込み先が1箇所に定まりません（${hits}箇所）: ${path.basename(file)}\n` +
            `対象: ${needle.slice(0, 100)}…\n` +
            `エンジンの形が変わった可能性があります。scripts/coverage-effects.ts を追随させてください。`
        if (DRY_RUN) {
            DRY_ERRORS.push(message)
            return
        }
        throw new Error(message)
    }
    if (DRY_RUN) return
    fs.writeFileSync(file, body.replace(needle, replacement))
}

// 差し込み先が今も1箇所ずつ存在するかを、**worktree も smoke も使わずに**検査する。
// 作業ツリーのファイルをそのまま読むだけで、書き換えは DRY_RUN がすべて止める。
// 戻り値は問題のメッセージ一覧（空なら健全）。smoke から呼んで計測が腐るのを防ぐ
export function checkPatchTargets(): string[] {
    DRY_RUN = true
    DRY_ERRORS.length = 0
    try {
        instrumentServer(REPO, path.join(os.tmpdir(), "bsweb-cov-check"))
    } catch (e) {
        DRY_ERRORS.push(e instanceof Error ? e.message : String(e))
    } finally {
        DRY_RUN = false
    }
    return [...DRY_ERRORS]
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
    if (!DRY_RUN) fs.writeFileSync(f, header + keywordHelper + fs.readFileSync(f, "utf-8"))

    // shared/cost.ts 側にも同じ記録器を注入する（別ファイルなので import せず自前で持つ）
    const fc = f.replace("rules.ts", "cost.ts")
    const headerC = header
        .replace(/__covSet2/g, "__covSet2C")
        .replace(/__covRec2/g, "__covRec2C")
        .replace(/__covEid/g, "__covEid2C")
        .replace(JSON.stringify(out + ".shared"), JSON.stringify(out + ".cost"))
    if (!DRY_RUN) fs.writeFileSync(fc, headerC + fs.readFileSync(fc, "utf-8"))

    // aura: effectiveBp が実際に加算する時点（全フィルタ通過後）
    patch(
        f,
        // ※ 2026-08-08: bpBuffSuppressed（BPバフ無効化）の導入で
        //    「auraAmount を求める行」と「加算する行」が分かれた。
        //    計測点は**抑止を通過して実際に加算する時点**に置く
        `                if (bpBuffSuppressed && amount > 0) continue
                total += amount`,
        `                if (bpBuffSuppressed && amount > 0) continue
                __covRec2("cont\\t" + __covEid(effect))
                total += amount`,
    )
    // exhaustImmunityGrant: isExhaustImmuneOnBoard が true を返す時点。
    // ※ 2026-08-10 の耐性一本化で、判定本体が EffectModules.isExhaustImmune から
    //    shared/rules.isExhaustImmuneOnBoard へ移った（差し込み先もこちらへ移設）
    patch(
        f,
        `                if (effect.phaseTurn.turn === "own" && targetOwnerPid !== board.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && targetOwnerPid === board.turnPlayer) continue
            }
            return true`,
        `                if (effect.phaseTurn.turn === "own" && targetOwnerPid !== board.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && targetOwnerPid === board.turnPlayer) continue
            }
            __covRec2("cont\\t" + __covEid(effect))
            return true`,
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
    // （2026-08-14: setToCounter の追加で置換値の計算が1行増えたためアンカーを追随させた）
    patch(
        f.replace("rules.ts", "cost.ts"),
        `            if (result === undefined || setTo < result) result = setTo`,
        `            __covRec2C("cont\t" + __covEid2C(effect))
            if (result === undefined || setTo < result) result = setTo`,
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
    // magicRestriction（costLimitAll）: hasMagicCostLock 経由で制限が成立する時点。
    // **上の hasMagicRestriction とは別の関数**なので、こちらにも計測点が要る
    // （BS05-065 青嵐の虚空 がこちらだけを通り、動作しているのに「未実行」と出ていた。2026-08-16）
    patch(
        f.replace("rules.ts", "cost.ts"),
        `                        spiritHasKeyword(board, ownerPid, s, effect.requireOwnKeyword!),
                    )
                ) {
                    continue
                }
                return true`,
        `                        spiritHasKeyword(board, ownerPid, s, effect.requireOwnKeyword!),
                    )
                ) {
                    continue
                }
                __covRec2C("cont\t" + __covEid2C(effect))
                return true`,
    )
    // keywordGrant: 継続付与が成立して指定数を返す時点
    // （2026-07-31: vanillaFilter の追加で最終行が変わったためアンカーを差し替え）
    // （2026-08-09: hasContinuousKeywordGrant が continuousKeywordGrantCount へ実体を移し、
    //   返り値が true から effect.count ?? 1 に変わったためアンカーを追随させた）
    // （2026-08-14: keywordGrant.minBp の追加で最終行の直前が変わったためアンカーを追随させた）
    patch(
        f,
        `            return effect.count ?? 1`,
        `            __covRec2("cont\t" + __covEid(effect))
            return effect.count ?? 1`,
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
    // alsoCostGrant: instHasCost / instMatchesCostFilter が alsoCostsContinuous を採用して true を返す時点。
    // 付与元の __eid は EffectModules 側の差し込みが __covAlsoCostEid として載せている
    patch(
        f,
        `    if (inst.tempAlsoCosts.includes(cost)) return true
    return (inst.alsoCostsContinuous ?? []).includes(cost)`,
        `    if (inst.tempAlsoCosts.includes(cost)) return true
    const __covHit = (inst.alsoCostsContinuous ?? []).includes(cost)
    if (__covHit) __covRec2("cont\\t" + String((inst as unknown as Record<string, unknown>)["__covAlsoCostEid"] ?? "?"))
    return __covHit`,
    )
    patch(
        f,
        `    if (inst.tempAlsoCosts.some((c) => matchesCostFilter(c, costFilter))) return true
    return (inst.alsoCostsContinuous ?? []).some((c) => matchesCostFilter(c, costFilter))`,
        `    if (inst.tempAlsoCosts.some((c) => matchesCostFilter(c, costFilter))) return true
    const __covHit2 = (inst.alsoCostsContinuous ?? []).some((c) => matchesCostFilter(c, costFilter))
    if (__covHit2) __covRec2("cont\\t" + String((inst as unknown as Record<string, unknown>)["__covAlsoCostEid"] ?? "?"))
    return __covHit2`,
    )
    // constraintGrant: activeConstraints が付与制約を合成する時点
    patch(
        f,
        `            granted.push({ constraint: effect.constraint, sourceInstanceId: source.instanceId })`,
        `            __covRec2("cont\\t" + __covEid(effect))
            granted.push({ constraint: effect.constraint, sourceInstanceId: source.instanceId })`,
    )
    // constraintGrant（colorFromChosen）: 「指定した色」を解決して積む分岐は**別の push** を通るため、
    // 上の計測点を迂回する（BS09-081 サマーソルトターンが動作しているのに「未実行」と出ていた。2026-08-16）
    patch(
        f,
        `                const { colorFromChosen: _flag, ...rest } = c
                granted.push({ constraint: { ...rest, colorFilter: chosen }, sourceInstanceId: source.instanceId })`,
        `                const { colorFromChosen: _flag, ...rest } = c
                __covRec2("cont\\t" + __covEid(effect))
                granted.push({ constraint: { ...rest, colorFilter: chosen }, sourceInstanceId: source.instanceId })`,
    )
    // familySuppression: 系統を「持たない」と判定して true を返す時点（BS03暗礁海域Lv1）
    patch(
        f,
        `                if (effect.kind !== "familySuppression") continue
                if (effect.lentOnly && !isVirtualSource(source)) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.turn === "own" && ownerPid !== board.turnPlayer) continue
                if (effect.turn === "opponent" && ownerPid === board.turnPlayer) continue
                if (effect.maxCores !== undefined && inst.cores > effect.maxCores) continue`,
        `                if (effect.kind !== "familySuppression") continue
                if (effect.lentOnly && !isVirtualSource(source)) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.turn === "own" && ownerPid !== board.turnPlayer) continue
                if (effect.turn === "opponent" && ownerPid === board.turnPlayer) continue
                if (effect.maxCores !== undefined && inst.cores > effect.maxCores) continue
                __covRec2("cont\\t" + __covEid(effect))`,
    )
    // bpBuffSuppression: 「BPを+する効果は発揮されない」と判定する時点（BS04古代闘技場Lv1）
    patch(
        f,
        `            if (effect.kind !== "bpBuffSuppression") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (effect.turn === "own" && sourcePid !== board.turnPlayer) continue
            if (effect.turn === "opponent" && sourcePid === board.turnPlayer) continue
            return true`,
        `            if (effect.kind !== "bpBuffSuppression") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (effect.turn === "own" && sourcePid !== board.turnPlayer) continue
            if (effect.turn === "opponent" && sourcePid === board.turnPlayer) continue
            __covRec2("cont\\t" + __covEid(effect))
            return true`,
    )
    // sokuPaySourceGrant: 【神速】召喚の支払い元としてフィールドを許可する時点
    patch(
        f,
        `            if (effect.kind !== "sokuPaySourceGrant") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (effect.turn === "own" && pid !== board.turnPlayer) continue`,
        `            if (effect.kind !== "sokuPaySourceGrant") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (effect.turn === "own" && pid !== board.turnPlayer) continue
            __covRec2("cont\\t" + __covEid(effect))`,
    )
    // nexusEffectsDisabled: 相手のネクサスの効果を止めると判定した時点（BS05ネクサスブロケイド）
    patch(
        f,
        `            if (effect.kind !== "nexusEffectsDisabled") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            return true`,
        `            if (effect.kind !== "nexusEffectsDisabled") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            __covRec2("cont\\t" + __covEid(effect))
            return true`,
    )
    // handKeywordGrant: 手札のカードにキーワードを与えていると判定した時点（BS02緑芽吹く原野Lv2）
    patch(
        f,
        `            if (effect.kind !== "handKeywordGrant") continue
            if (effect.keyword !== keyword) continue`,
        `            if (effect.kind !== "handKeywordGrant") continue
            if (effect.keyword !== keyword) continue
            __covRec2("cont\\t" + __covEid(effect))`,
    )
    // countAsMultiple: 「数えるとき N 体分」を実際に適用した時点（BS05シーサーズLv2）
    patch(
        f,
        `            if (effect.kind !== "countAsMultiple") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(inst).level)) continue
            if (!typeAllowed(effect.sourceTypes)) continue
            weight = Math.max(weight, effect.count)`,
        `            if (effect.kind !== "countAsMultiple") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(inst).level)) continue
            if (!typeAllowed(effect.sourceTypes)) continue
            __covRec2("cont\\t" + __covEid(effect))
            weight = Math.max(weight, effect.count)`,
    )
    // constraintSuppression: 制約を発揮させないと判定した時点（BS04獣使いドヴェルグ）
    patch(
        f,
        `            if (effect.kind !== "constraintSuppression") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (effect.turn === "own" && pid !== board.turnPlayer) continue
            if (effect.turn === "opponent" && pid === board.turnPlayer) continue
            if (effect.nameContains !== undefined && !cardNameContains(inst, effect.nameContains)) continue
            suppressed.add(effect.constraintType)`,
        `            if (effect.kind !== "constraintSuppression") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (effect.turn === "own" && pid !== board.turnPlayer) continue
            if (effect.turn === "opponent" && pid === board.turnPlayer) continue
            if (effect.nameContains !== undefined && !cardNameContains(inst, effect.nameContains)) continue
            __covRec2("cont\\t" + __covEid(effect))
            suppressed.add(effect.constraintType)`,
    )
    // awakenFromReserve: 【覚醒】の移動元にリザーブを許可した時点（BS05合成恐竜ディノゾール）
    patch(
        f,
        `            if (effect.kind !== "awakenFromReserve") continue
            if (effectActiveAtLevel(effect.levels, level)) return true`,
        `            if (effect.kind !== "awakenFromReserve") continue
            if (effectActiveAtLevel(effect.levels, level)) {
                __covRec2("cont\\t" + __covEid(effect))
                return true
            }`,
    )
    // flashLockWhileAttackingFamily（BS07ウィリアンスラッシュ）：フラッシュ封印が成立した時点
    patch(
        f,
        `            if (effect.kind !== "flashLockWhileAttackingFamily") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (matchesFamilyFilter(board, opp, attacker, effect.familyFilter)) return true`,
        `            if (effect.kind !== "flashLockWhileAttackingFamily") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (matchesFamilyFilter(board, opp, attacker, effect.familyFilter)) {
                __covRec2("cont\\t" + __covEid(effect))
                return true
            }`,
    )
    // nexusCostMillPay（BS04栄光の表彰台Lv1）：デッキ破棄での支払いが可能と判定した時点
    patch(
        f.replace("rules.ts", "cost.ts"),
        `            if (effect.kind !== "nexusCostMillPay") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue`,
        `            if (effect.kind !== "nexusCostMillPay") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            __covRec2C("cont\\t" + __covEid2C(effect))`,
    )
    // summonCostHandDiscardPay（BS08ビクティム）：手札破棄での支払いが可能と判定した時点
    patch(
        f.replace("rules.ts", "cost.ts"),
        `            if (effect.kind !== "summonCostHandDiscardPay") continue
            return true`,
        `            if (effect.kind !== "summonCostHandDiscardPay") continue
            __covRec2C("cont\\t" + __covEid2C(effect))
            return true`,
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
        // ※ 2026-08-08: costs（コスト完全一致・グレートウォール）の追加で判定式が変わった
        `                if (costs !== undefined ? costs.includes(cost) : maxCost !== undefined && cost <= maxCost) {
                    return true
                }`,
        `                if (costs !== undefined ? costs.includes(cost) : maxCost !== undefined && cost <= maxCost) {
                    __covRec2("cont\\t" + __covEid(effect))
                    return true
                }`,
    )
    // immunityGrant: hasMagicImmunity が true を返す時点
    patch(
        f,
        // ※ 2026-08-08: 集計が countSpiritsWeighted + instHasCost（道化師クランの付与コスト対応）へ変わった
        // ※ 2026-08-10: 数える側の発生源種別（card(source.cardId).type）を渡すようになり複数行に整形された
        `                if (matchCount < count) continue
            }
            return true`,
        `                if (matchCount < count) continue
            }
            __covRec2("cont\\t" + __covEid(effect))
            return true`,
    )
    // magicFreeGrant: 発生源を確定させる時点（shared/cost.ts）。
    // ※ 無償化は「true を返す」形から「発生源の instanceId を返す」形（findMagicFreeGrantSource）へ
    //   変わっている。差し込み先はエンジンの現在の形に追随させること
    patch(
        fc,
        `            if (effect.condition === "selfInBattle" && !isSelfInBattle(board, source.instanceId)) continue
            return source.instanceId`,
        `            if (effect.condition === "selfInBattle" && !isSelfInBattle(board, source.instanceId)) continue
            __covRec2C("cont\\t" + __covEid2C(effect))
            return source.instanceId`,
    )
}

// 計測コードの差し込みをまとめて行う。**main() から切り出してあるのは、
// checkPatchTargets（差し込み先が今も1箇所ずつ存在するかの検査）が同じ列を再利用するため**。
// この検査を smoke に載せておかないと、エンジンの形が変わったときに coverage:effects が
// 壊れたまま何日も放置される（2026-08-10 に実際に3件たまっていた）。
//
// ⚠️ 中身の字下げは main() にあった当時のまま（8スペース）。needle は複数行の
//    テンプレートリテラルなので、**整形で1文字でもずらすと差し込み先に一致しなくなる**
function instrumentServer(tree: string, outFile: string): void {
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
// ※ 書き出しは require("fs") で行う（GameState.ts は node:fs を import していない。
//    2026-08-03 にカード読み込みが data/loadCards.ts へ移って fs 参照が消えたため、
//    fs.writeFileSync と書いていた版は ReferenceError で無言のまま記録0になっていた）
const __covOut = process.env["COV_OUT"]
const __covSet = new Set<string>()
export const __covRecord = (line: string): void => { __covSet.add(line) }
process.on("exit", () => {
    if (__covOut !== undefined) {
        require("fs").writeFileSync(__covOut, [...__covSet].join("\\n"))
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
        //     BS07ブラックリチュアルの fireDestroyTriggerFirst で両経路に1行挟まったため、
        //     アンカーは applyRevived の行だけにした。**先頭の改行は必須**：これが無いと
        //     8スペース版のパターンが12スペース版の一部にも一致して「2箇所」になる
        //     ※ 2026-08-10: tryReviveOnDestroy は EffectModules.ts から removal.ts へ移設された
        for (const indent of ["        ", "            "]) {
            patch(
                path.join(tree, "server/src/logic/removal.ts"),
                `\n${indent}applyRevived(effect.revived)`,
                `\n${indent}__covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))\n` +
                    `${indent}applyRevived(effect.revived)`,
            )
        }

        // (4.-1) keyword のうち【強襲】【氷壁】【聖命】【不死】は、2026-07-30 に8キーワードへ
        //     計測点を入れた後で追加されたため計測点が無く、**永久に「未実行」と出ていた**
        //     （2026-08-15 追加）。いずれも「宣言」であり挙動は別エントリが持つので、
        //     **そのキーワードでなければ通らない解決点**に置く
        const kwEid = (expr: string, keyword: string): string =>
            `String(((getCard(${expr}).effects as unknown as Record<string, unknown>[]).find((e) => e["kind"] === "keyword" && e["keyword"] === "${keyword}")?.["__eid"]) ?? "?")`
        // 強襲：ネクサスを疲労させて実際に回復した時点
        patch(
            path.join(tree, "server/src/logic/actions/exhaustRefresh.ts"),
            `import { currentLevel, getCard, instMinLevelCores, log, minLevelCores } from "../GameState"`,
            `import { currentLevel, getCard, instMinLevelCores, log, minLevelCores, __covRecord } from "../GameState"`,
        )
        patch(
            path.join(tree, "server/src/logic/actions/exhaustRefresh.ts"),
            `    self.kyoshuUsed = { turn: state.turn, count: used + 1 }`,
            `    __covRecord("cont\t" + ${kwEid("self.cardId", "kyoshu")})
    self.kyoshuUsed = { turn: state.turn, count: used + 1 }`,
        )
        // 聖命：【聖命】持ちがボイドからライフにコアを置いた時点
        patch(
            path.join(tree, "server/src/logic/actions/cores.ts"),
            `            if (self && spiritHasKeyword(state, owner, self, "seimei")) {`,
            `            if (self && spiritHasKeyword(state, owner, self, "seimei")) {
                __covRecord("cont\t" + ${kwEid("self.cardId", "seimei")})`,
        )
        // 氷壁：【氷壁】を持つ発生源が無効化元として確定した時点
        patch(
            path.join(tree, "server/src/logic/triggers.ts"),
            `            return payer && "exhaustSelf" in effect.cost`,
            `            if (isHyoheki) __covRecord("cont\t" + ${kwEid("inst.cardId", "hyoheki")})
            return payer && "exhaustSelf" in effect.cost`,
        )
        // 不死：トラッシュのカードが【不死】の引き金条件を満たして候補になった時点
        patch(
            path.join(tree, "server/src/logic/removal.ts"),
            `        found.push(i)`,
            `        __covRecord("cont\t" + ${kwEid("cardId", "fushi")})
        found.push(i)`,
        )

        // (4.0) triggers.ts 側で __covRecord を使うための import 追記。
        //     triggerSuppression 等の計測点がここにあるので、無いと ReferenceError で落ちる
        //     （2026-08-14: 移設時に入れ忘れていたぶんを補った）
        patch(
            path.join(tree, "server/src/logic/triggers.ts"),
            `    rawLevel,\n    pushResumeFrames,`,
            `    rawLevel,\n    pushResumeFrames,\n    __covRecord,`,
        )

        // (4.1) removal.ts 側で __covRecord を使うための import 追記。
        //     (4) の applyRevived 計測はここが無いと ReferenceError で落ちる
        //     （2026-08-14: tryReviveOnDestroy の移設時に入れ忘れていたぶんを補った）
        patch(
            path.join(tree, "server/src/logic/removal.ts"),
            `    rawLevel,`,
            `    rawLevel,\n    __covRecord,`,
        )

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

        // (4.6) 【装甲：∞】（keyword armor の colorsFrom:"opponentFieldSymbols"。BS06鎧神機ヴァルハランス）も
        //     armorColorsGranted 経由で materialize される別経路。hasArmorAgainst の静的判定（e.colors）を
        //     通らないため、(4.5) と同じ書き込み時点で記録する。
        //     ※ 読む側（hasArmorAgainst の granted 分岐）は keywordGrant 由来と区別できないため、
        //       ここだけは「相手フィールドにシンボルがある状態で場に居た」で実行済みとする
        patch(
            path.join(tree, "server/src/logic/EffectModules.ts"),
            `                        if (!source.armorColorsGranted) source.armorColorsGranted = []`,
            `                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        if (!source.armorColorsGranted) source.armorColorsGranted = []`,
        )

        // (4.7) keyword「暴風」: **挙動そのものは対になる triggered エントリ（onBlocked の exhaust）が持つ**ため、
        //     keyword エントリ自体が読まれるのは颶風高原（voidCoreToSelfPerBofuCount）が指定数を引く1箇所だけ。
        //     そこを計測点にする（「暴風を持っている」ではなく「指定数が実際に使われた」時点）
        const coresFile = path.join(tree, "server/src/logic/actions/cores.ts")
        patch(
            coresFile,
            `import { coresForLevel, draw, getCard, instMinLevelCores, log, minLevelCores } from "../GameState"`,
            `import { coresForLevel, draw, getCard, instMinLevelCores, log, minLevelCores, __covRecord } from "../GameState"`,
        )
        patch(
            coresFile,
            `        const count = entry && entry.kind === "keyword" ? (entry.count ?? 1) : 0`,
            `        const count = entry && entry.kind === "keyword" ? (entry.count ?? 1) : 0
        if (entry && count > 0) __covRecord("cont\\t" + String((entry as unknown as Record<string, unknown>)["__eid"] ?? "?"))`,
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
            // ※ 2026-08-10: この処理は EffectModules.ts から removal.ts へ移設された
            path.join(tree, "server/src/logic/removal.ts"),
            // ※ 2026-08-07 にバニラ判定が instIsVanilla(s) へ一本化された（isVanillaCard(getCard(...)) から変更）。
            //    差し込み先はエンジンの現在の形に追随させること
            // ※ 2026-09-02: condition が「バニラ数」と「ネクサスの色」の2軸になったため、
            //    差し込み先は **return true の直前** だけに縮めてある（条件式そのものを写さない）
            `                if (!player.field.nexuses.every((n) => instHasColor(n, color))) continue
            }
            return true`,
            `                if (!player.field.nexuses.every((n) => instHasColor(n, color))) continue
            }
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return true`,
        )
        // globalConstraint「battlingCoresProtected」「battlingEffectImmune」: true 判定
        // ※ 2026-08-08: 2つのインライン走査が hasActiveGlobalConstraint(state, type) へ一本化された。
        //    共通ループを1箇所差し込めば両方を記録できる（記録するのは実際に成立した効果エントリ）
        patch(
            // ※ 2026-08-10: この処理は EffectModules.ts から removal.ts へ移設された
            path.join(tree, "server/src/logic/removal.ts"),
            `                if (effect.constraint.type !== type) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                return true`,
            `                if (effect.constraint.type !== type) continue
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
        // coreStepBonus: coreStepBonusFor の集計点。
        // ※ `bonus += effect.amount` だけだと tenshoSelfCostBonus の同じ行と衝突する
        //   （2026-08-09 の赤き砂の座Lv2 で2箇所になった）。直前の condition 判定まで含めて一意にする
        patch(
            em,
            `                if (!ok) continue
            }
            bonus += effect.amount`,
            `                if (!ok) continue
            }
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            bonus += effect.amount`,
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
            // ※ 2026-08-08: lentOnly（BS06デモリッシュ＝貸与時のみ有効）の判定が間に入った
            // ※ 2026-08-09: 加算式に amountPerSymbolColor（BS08オリハルコン・ゴレム）の分岐が入ったため、
            //    アンカーを絞り込み側の3行だけにして加算式そのものを含めないようにした
            `            if (effect.kind !== "funsaiBonus") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue`,
            `            if (effect.kind !== "funsaiBonus") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))`,
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
            `    if (!spec) return
    const { minCost, dest } = spec`,
            `    if (!spec) return
    __covRecord("cont\\t" + String((spec.entry as unknown as Record<string, unknown>)["__eid"] ?? "?"))
    const { minCost, dest } = spec`,
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
        // alsoCostGrant: 付与時点ではなく**読む側**（rules.ts の instHasCost / instMatchesCostFilter）で
        // 計測する。ただし alsoCostsContinuous は付与元を残さないため、ここで付与元の __eid を
        // 対象インスタンスへ載せておき、読む側がそれを引く（tempFamilies の教訓＝書くだけの状態を実行済みにしない）
        patch(
            em,
            `                        const values = effect.costs ?? (value !== undefined ? [value] : [])`,
            `                        ;(spirit as unknown as Record<string, unknown>)["__covAlsoCostEid"] =
                            String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?")
                        const values = effect.costs ?? (value !== undefined ? [value] : [])`,
        )
        // levelAs: refreshLevelAsOverrides の8つの levelAsContinuous 代入点（target ごと）
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
                        if (effect.effectsOnly) nexus.levelAsEffectsOnly = true
                    }
                } else if (effect.target === "ownSpiritsAll") {`,
            `                    for (const nexus of state.players[opponentOf(pid)].field.nexuses) {
                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        nexus.levelAsContinuous = resolveTreatAs(effect.treatAs, nexus)
                        if (effect.effectsOnly) nexus.levelAsEffectsOnly = true
                    }
                } else if (effect.target === "ownSpiritsAll") {`,
        )
        patch(
            em,
            `                    for (const spirit of player.field.spirits) {
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "ownSpiritsByKeyword") {`,
            `                    for (const spirit of player.field.spirits) {
                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "ownSpiritsByKeyword") {`,
        )
        // ※ 2026-08-08: 分岐が5つ→8つに増えた（ownSpiritsByFamily / opponentSpiritsAll /
        //    allSpiritsByChosenColor が後から追加された）。計測点を入れ忘れると
        //    「実装済みなのに実行実績0」と誤報するので、分岐を足したらここも足すこと
        patch(
            em,
            `                        if (!hasStaticKeyword) continue
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "ownSpiritsByFamily") {`,
            `                        if (!hasStaticKeyword) continue
                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "ownSpiritsByFamily") {`,
        )
        patch(
            em,
            `                        if (effect.familyFilter && !matchesFamilyFilter(state, pid, spirit, effect.familyFilter)) continue
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)`,
            `                        if (effect.familyFilter && !matchesFamilyFilter(state, pid, spirit, effect.familyFilter)) continue
                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)`,
        )
        patch(
            em,
            `                        if (!instIsVanilla(spirit)) continue
                        if (effect.summonedThisTurnOnly && spirit.summonedTurn !== state.turn) continue
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)`,
            `                        if (!instIsVanilla(spirit)) continue
                        if (effect.summonedThisTurnOnly && spirit.summonedTurn !== state.turn) continue
                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)`,
        )
        patch(
            em,
            `                    for (const spirit of state.players[opponentOf(pid)].field.spirits) {
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "opponentBlockersOfOwnKeyword") {`,
            `                    for (const spirit of state.players[opponentOf(pid)].field.spirits) {
                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "opponentBlockersOfOwnKeyword") {`,
        )
        // levelAs target:"opponentBlockersOfOwnKeyword"（SD02-005 天使ヘルヴィム）。
        // 上の分岐とは別の代入点なので、計測点も別に要る
        patch(
            em,
            `                            if (blocker) blocker.levelAsContinuous = resolveTreatAs(effect.treatAs, blocker)`,
            `                            if (blocker) {
                                __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                                blocker.levelAsContinuous = resolveTreatAs(effect.treatAs, blocker)
                            }`,
        )
        patch(
            em,
            `                            if (!instHasColor(spirit, chosenColor)) continue
                            spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)`,
            `                            if (!instHasColor(spirit, chosenColor)) continue
                            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                            spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)`,
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
        // ※ 2026-08-10: この関数は EffectModules.ts から triggers.ts へ移設された
        patch(
            path.join(tree, "server/src/logic/triggers.ts"),
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
            // ※ 2026-08-07 に疲労の代入が exhaustSpirit() へ一元化された（誘発点を1箇所にするため）
            `                exhaustSpirit(state, affectedPid, affectedInst)
                return`,
            `                __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                exhaustSpirit(state, affectedPid, affectedInst)
                return`,
        )

        // (5a-2) refreshLevelAsOverrides が再構築する継続付与のうち、2026-07-30 の拡張後に
        //     追加された kind（2026-08-24 に計測点を追加）。levelAs と同じく「対象へ実際に
        //     書き込む時点」に置く（対象が0体なら記録されない＝「効いていない」と分かる）
        // vanillaAsGrant（BS04スイッチヒッター）
        patch(
            em,
            `                        spirit.treatedAsVanillaContinuous = true`,
            `                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        spirit.treatedAsVanillaContinuous = true`,
        )
        // levelCostMod（BS09蛇凰神バァラルLv2-3）
        patch(
            em,
            `                        spirit.levelCostBonusContinuous =
                            (spirit.levelCostBonusContinuous ?? 0) + effect.amount`,
            `                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        spirit.levelCostBonusContinuous =
                            (spirit.levelCostBonusContinuous ?? 0) + effect.amount`,
        )
        // spiritEffectsDisabledGrant（BS07ルナースラッシュ）
        patch(
            em,
            `                        spirit.effectsDisabledContinuous = true`,
            `                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        spirit.effectsDisabledContinuous = true`,
        )
        // nameAsGrant（アルカナプリンス・オベロLv2ほか）
        patch(
            em,
            `                        if (!spirit.namesAsContinuous.includes(effect.nameIncludes)) {`,
            `                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        if (!spirit.namesAsContinuous.includes(effect.nameIncludes)) {`,
        )
        // symbolFix（BS08海底に眠りし古代都市Lv2ほか）
        patch(
            em,
            `                        spirit.symbolsOverrideContinuous = new Array(effect.count).fill(baseColor)`,
            `                        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                        spirit.symbolsOverrideContinuous = new Array(effect.count).fill(baseColor)`,
        )

        // (5a-3) triggers.ts の継続 kind（2026-08-24 に計測点を追加）
        // magicNegate: **実際に無効化のコストを払った時点**（候補に挙がっただけでは記録しない）
        patch(
            path.join(tree, "server/src/logic/triggers.ts"),
            `    const { pid, inst, effect } = found`,
            `    const { pid, inst, effect } = found
    __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))`,
        )
        // magicTargetRedirect: 絞り込みを実際に立てた時点（「〜にできる」を断ったときは通らない）
        patch(
            path.join(tree, "server/src/logic/triggers.ts"),
            `    state.magicRedirectTo = { pid: opponentOf(casterPid), instanceId: found.instanceId }`,
            `    __covRecord("cont\\t" + String(((getCard(found.cardId).effects as unknown as Record<string, unknown>[]).find((e) => e["kind"] === "magicTargetRedirect")?.["__eid"]) ?? "?"))
    state.magicRedirectTo = { pid: opponentOf(casterPid), instanceId: found.instanceId }`,
        )
        // bothSidesTargetRedirect: 発生源として確定した時点（封印された魔導書Lv1）
        patch(
            path.join(tree, "server/src/logic/triggers.ts"),
            `                if (effect.kind !== "bothSidesTargetRedirect") continue
                if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
                return { pid: ownerPid, inst: source }`,
            `                if (effect.kind !== "bothSidesTargetRedirect") continue
                if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
                __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                return { pid: ownerPid, inst: source }`,
        )
        // battleBpAsLevel: バトルのBP比較で実際に別レベルのBPを返した時点（BS03果て無き地平線Lv1）
        patch(
            path.join(tree, "server/src/logic/triggers.ts"),
            `            if (!from || !use) continue
            return base + (use.bp - from.bp)`,
            `            if (!from || !use) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return base + (use.bp - from.bp)`,
        )

        // (5a-4) EffectModules.ts の残り継続 kind（2026-08-24 に計測点を追加）
        // destroyedCoresToTrash（BS01古龍の縄張り）
        patch(
            em,
            `                if (effect.kind !== "destroyedCoresToTrash") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                return true`,
            `                if (effect.kind !== "destroyedCoresToTrash") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                return true`,
        )
        // onMilledFromDeck（BS08鳳翼の聖剣ほか）：破棄されたカード自身の効果が実際に発揮された時点
        patch(
            em,
            `            player.trashCards.splice(idx, 1)
            const name = getCard(cardId).name`,
            `            player.trashCards.splice(idx, 1)
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            const name = getCard(cardId).name`,
        )
        // millCapBonus（BS06マキシマムブレイク）：破棄枚数の上限に実際に加算した時点
        patch(
            em,
            `            if (effect.kind !== "millCapBonus") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            total += effect.amount`,
            `            if (effect.kind !== "millCapBonus") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            total += effect.amount`,
        )

        // bofuCountBonus（BS08ゲラン准将Lv2）
        patch(
            em,
            `            if (effect.kind !== "bofuCountBonus") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            total += effect.amount`,
            `            if (effect.kind !== "bofuCountBonus") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            total += effect.amount`,
        )
        // kyoshuOnBlock（BS07蹴撃の戦場跡Lv2）
        patch(
            em,
            `            if (effect.kind !== "kyoshuOnBlock") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            return true`,
            `            if (effect.kind !== "kyoshuOnBlock") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return true`,
        )
        // bofuOnBlock（BS07大風車の丘Lv2）
        patch(
            em,
            `            if (effect.kind !== "bofuOnBlock") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
            return true`,
            `            if (effect.kind !== "bofuOnBlock") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return true`,
        )
        // bofuChooserSelf（BS07ワールウィンド／BS09緑翼の大樹Lv2）
        patch(
            em,
            `            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            return true
        }
    }
    return false
}

// 召喚が済んだ後にまとめて走る処理`,
            `            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return true
        }
    }
    return false
}

// 召喚が済んだ後にまとめて走る処理`,
        )
        // lifeDamageMillGuard（BS07六花の司書長サーガ）：実際にデッキを1枚削った時点
        patch(
            em,
            `            const cardId = player.deck.shift()
            if (cardId === undefined) {`,
            `            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            const cardId = player.deck.shift()
            if (cardId === undefined) {`,
        )

        // summonedExhaustGrant（BS06天使長ファニム）
        patch(
            em,
            `            if (effect.kind !== "summonedExhaustGrant") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.condition?.selfRested && !source.isRested) continue
            return true`,
            `            if (effect.kind !== "summonedExhaustGrant") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.condition?.selfRested && !source.isRested) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return true`,
        )
        // koboOnBlock（BS03星降る巡礼地Lv2）
        patch(
            em,
            `            if (effect.kind !== "koboOnBlock") continue
            if (effectActiveAtLevel(effect.levels, level)) return true`,
            `            if (effect.kind !== "koboOnBlock") continue
            if (effectActiveAtLevel(effect.levels, level)) {
                __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                return true
            }`,
        )
        // blockTriggersAsAttackGrant（BS07大械獣ギガ・テリウム）
        patch(
            em,
            `            if (effect.familyFilter && !matchesFamilyFilter(state, ownerPid, inst, effect.familyFilter)) {
                continue
            }
            return true`,
            `            if (effect.familyFilter && !matchesFamilyFilter(state, ownerPid, inst, effect.familyFilter)) {
                continue
            }
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return true`,
        )
        // attackTriggersAsBlockGrant（BS04ドラグノ近衛兵）
        patch(
            em,
            `                if (
                    effect.familyFilter &&
                    !matchesFamilyFilter(state, ownerPid, inst, effect.familyFilter)
                ) {
                    continue
                }`,
            `                if (
                    effect.familyFilter &&
                    !matchesFamilyFilter(state, ownerPid, inst, effect.familyFilter)
                ) {
                    continue
                }
                __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))`,
        )

        // targetNegateByHandDiscard（BS08竜騎集う円卓Lv2）：実際に手札を破棄して効果を防いだ時点
        patch(
            em,
            `            const discarded = player.hand.splice(player.hand.length - effect.discardCount, effect.discardCount)`,
            `            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            const discarded = player.hand.splice(player.hand.length - effect.discardCount, effect.discardCount)`,
        )
        // milledMagicToTegamoto（BS06混迷する魔法実験場Lv2）：手元へ実際に移した時点。
        // 発生源の判定が .some() の中なので、有効な発生源から __eid を引き直す
        patch(
            em,
            `        player.tegamoto.push(cardId)
        player.tegamotoPlayable.push(cardId)`,
            `        __covRecord("cont\\t" + String(effectSources(state, pid).flatMap((s) => getCard(s.cardId).effects as unknown as Record<string, unknown>[]).find((e) => e["kind"] === "milledMagicToTegamoto")?.["__eid"] ?? "?"))
        player.tegamoto.push(cardId)
        player.tegamotoPlayable.push(cardId)`,
        )
        // deckMillNegate（BS08鳳翼の聖剣Lv2）：無効化できる発生源として確定した時点
        patch(
            em,
            `            if (state.players[pid].life < effect.costOwnLifeToReserve) continue
            return { source, effect }`,
            `            if (state.players[pid].life < effect.costOwnLifeToReserve) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return { source, effect }`,
        )

        // coreReturnBonus（BS02チャウーLv2）：リザーブへ戻るコアに実際に加算した時点
        patch(
            path.join(tree, "server/src/logic/removal.ts"),
            `                if (e.kind !== "coreReturnBonus") continue
                if (!effectActiveAtLevel(e.levels, level)) continue
                bonus += e.amount`,
            `                if (e.kind !== "coreReturnBonus") continue
                if (!effectActiveAtLevel(e.levels, level)) continue
                __covRecord("cont\\t" + String((e as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                bonus += e.amount`,
        )
        // freeSummonFromHandOnDiscardedByOpponent（BS09忍者サルトベ）：条件を満たして召喚に進む時点
        patch(
            path.join(tree, "server/src/logic/removal.ts"),
            `    const index = player.trashCards.lastIndexOf(cardId)
    if (index === -1) return false`,
            `    const index = player.trashCards.lastIndexOf(cardId)
    if (index === -1) return false
    __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))`,
        )
        // freeSummonFromHandOnLifeDamaged（BS08猫娘アニー／BS09巨獣皇スミドロード）
        patch(
            path.join(tree, "server/src/logic/removal.ts"),
            `        // 維持コアを置けないなら召喚できないので、確認自体を出さない
        if (player.reserve < minLevelCores(getCard(cardId))) continue`,
            `        // 維持コアを置けないなら召喚できないので、確認自体を出さない
        if (player.reserve < minLevelCores(getCard(cardId))) continue
        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))`,
        )
        // jugekiCoreToVoid（BS04魔影街Lv1）：実際にコアをボイドへ置いた時点
        patch(
            path.join(tree, "server/src/logic/triggers.ts"),
            `            const removed = Math.min(effect.count, victim.cores)
            if (removed === 0) continue
            victim.cores -= removed`,
            `            const removed = Math.min(effect.count, victim.cores)
            if (removed === 0) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            victim.cores -= removed`,
        )
        // magicNegatePayByNexusGrant（BS09ノルンの泉）
        patch(
            path.join(tree, "server/src/logic/triggers.ts"),
            `            if (effect.kind !== "magicNegatePayByNexusGrant") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
            granted = true`,
            `            if (effect.kind !== "magicNegatePayByNexusGrant") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            granted = true`,
        )
        // magicNegateTurnOverrideGrant（BS09アイスバーグ）
        patch(
            path.join(tree, "server/src/logic/triggers.ts"),
            `            if (effect.kind !== "magicNegateTurnOverrideGrant") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            return effect.turn`,
            `            if (effect.kind !== "magicNegateTurnOverrideGrant") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return effect.turn`,
        )
        // magicRepeatGrant（BS07大天使イスフィール）：もう一度発揮させる発生源として確定した時点
        patch(
            path.join(tree, "server/src/logic/triggers.ts"),
            `            if (effect.oncePerBattle) {
                if (!state.battle) continue // バトル外では消費を記録できないので成立させない
                if ((state.battle.oncePerBattleMagicRepeatUsed ?? []).includes(source.instanceId)) continue
            }
            return source`,
            `            if (effect.oncePerBattle) {
                if (!state.battle) continue // バトル外では消費を記録できないので成立させない
                if ((state.battle.oncePerBattleMagicRepeatUsed ?? []).includes(source.instanceId)) continue
            }
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return source`,
        )

        // jugekiOnBlockReplace（BS06カウンターカース）
        patch(
            em,
            `            if (effect.kind !== "jugekiOnBlockReplace") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (effectActiveAtLevel(effect.levels, level)) return true`,
            `            if (effect.kind !== "jugekiOnBlockReplace") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (effectActiveAtLevel(effect.levels, level)) {
                __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
                return true
            }`,
        )
        // tenshoSelfCostBonus（BS08冥機グングニル／赤き砂の座）：【転召】のコストに実際に加算した時点。
        // 自身のエントリ版（①）と ownAll 版（②）の2経路があるので両方に置く
        patch(
            em,
            `        if (effect.kind !== "tenshoSelfCostBonus") continue
        if (effect.target === "ownAll") continue // 自身のエントリでも ownAll 版は②で数える
        if (!effectActiveAtLevel(effect.levels, instLevel)) continue
        bonus += effect.amount`,
            `        if (effect.kind !== "tenshoSelfCostBonus") continue
        if (effect.target === "ownAll") continue // 自身のエントリでも ownAll 版は②で数える
        if (!effectActiveAtLevel(effect.levels, instLevel)) continue
        __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
        bonus += effect.amount`,
        )
        patch(
            em,
            `            if (effect.kind !== "tenshoSelfCostBonus") continue
            if (effect.target !== "ownAll") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.familyFilter && !matchesFamilyFilter(state, ownerPid, inst, effect.familyFilter)) continue
            bonus += effect.amount`,
            `            if (effect.kind !== "tenshoSelfCostBonus") continue
            if (effect.target !== "ownAll") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.familyFilter && !matchesFamilyFilter(state, ownerPid, inst, effect.familyFilter)) continue
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            bonus += effect.amount`,
        )
        // battleSwapSummon（BS07ブラックカラカロッサム）：入れ替え召喚が実際に成立した時点。
        // 判定は shared/summon.ts だが記録器を持たないので、実行側（GameEngine）に置く
        patch(
            path.join(tree, "server/src/logic/GameEngine.ts"),
            `    const cost = effectiveCost(state, pid, card)
    returnSpiritToHand(state, pid, substitute)`,
            `    __covRecord("cont\\t" + String(((card.effects as unknown as Record<string, unknown>[]).find((e) => e["kind"] === "battleSwapSummon")?.["__eid"]) ?? "?"))
    const cost = effectiveCost(state, pid, card)
    returnSpiritToHand(state, pid, substitute)`,
        )

        // (5b) RuleValidator.ts: 強制ブロック・激突・スピリット数上限・神速召喚（keyword「神速」）
        const rv = path.join(tree, "server/src/logic/RuleValidator.ts")
        patch(
            rv,
            `    getCard,\n    instMinLevelCores,\n    minLevelCores,\n    opponentOf,\n} from "./GameState"`,
            `    getCard,\n    instMinLevelCores,\n    minLevelCores,\n    opponentOf,\n    __covRecord,\n} from "./GameState"`,
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
            // ※ 2026-08-08: hasFieldSoku（緑芽吹く原野Lv2＝手札のカードへの継続付与）が加わった
            `    const flashSummon = state.isFlashTiming && (hasKeyword(cardId, "soku") || hasTempSoku || hasFieldSoku)`,
            `    const __staticSoku = hasKeyword(cardId, "soku")
    if (state.isFlashTiming && __staticSoku) {
        const __sokuEntry = getCard(cardId).effects.find((e) => e.kind === "keyword" && e.keyword === "soku")
        if (__sokuEntry) __covRecord("cont\\t" + String((__sokuEntry as unknown as Record<string, unknown>)["__eid"] ?? "?"))
    }
    const flashSummon = state.isFlashTiming && (__staticSoku || hasTempSoku || hasFieldSoku)`,
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
            return effect.blockerMaxBp === undefined
                ? { source: inst }
                : { blockerMaxBp: effect.blockerMaxBp, source: inst }`,
            `            if (
                effect.familyFilter !== undefined &&
                !matchesFamilyFilter(state, attackerPid, attacker, effect.familyFilter)
            ) {
                continue
            }
            __covRecord("cont\\t" + String((effect as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            return effect.blockerMaxBp === undefined
                ? { source: inst }
                : { blockerMaxBp: effect.blockerMaxBp, source: inst }`,
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
            `    getCard,\n    log,\n    instMinLevelCores,\n    minLevelCores,\n    opponentOf,\n    checkNoMutationAfterSuspend,\n    noteHandleActionEntry,\n    pushResumeFrames,\n    suspend,\n    resumeTriggerBatch,\n} from "./GameState"`,
            `    getCard,\n    log,\n    instMinLevelCores,\n    minLevelCores,\n    opponentOf,\n    checkNoMutationAfterSuspend,\n    noteHandleActionEntry,\n    pushResumeFrames,\n    suspend,\n    resumeTriggerBatch,\n    __covRecord,\n} from "./GameState"`,
        )
        // ※ 2026-08-08: リザーブからの【覚醒】（ディノゾールLv2）が分岐として増え、
        //    コア移動の実行点が2つになった。両方に同じ記録を入れる（記録関数を1つ差し込んで共有）
        patch(
            ge,
            `    // リザーブからの【覚醒】（ディノゾールLv2で書き換えられた場合）。移動元スピリットの消滅判定は不要
    if (fromInstanceId === AWAKEN_FROM_RESERVE) {
        player.reserve -= count`,
            `    const __recAwaken = () => {
        const __awakenLevel = currentLevel(target).level
        const __awakenEntry = getCard(target.cardId).effects.find(
            (e) => e.kind === "keyword" && e.keyword === "awaken" && effectActiveAtLevel(e.levels, __awakenLevel),
        )
        if (__awakenEntry) __covRecord("cont\\t" + String((__awakenEntry as unknown as Record<string, unknown>)["__eid"] ?? "?"))
    }
    // リザーブからの【覚醒】（ディノゾールLv2で書き換えられた場合）。移動元スピリットの消滅判定は不要
    if (fromInstanceId === AWAKEN_FROM_RESERVE) {
        __recAwaken()
        player.reserve -= count`,
        )
        patch(
            ge,
            `    if (!from) return "対象のスピリットが見つかりません"

    from.cores -= count`,
            `    if (!from) return "対象のスピリットが見つかりません"

    __recAwaken()
    from.cores -= count`,
        )
        // ※ 2026-08-14: バトル解決を再開可能なステップ列（runBattleStep）に割ったため、
        //    【呪撃】の破壊は case 5 の中へ移動した。差し込み先もその形に合わせる
        patch(
            ge,
            `            // 魔影街Lv1：破壊の直前に、そのスピリット上のコアをボイドへ（リザーブに戻らなくなる）
            applyJugekiCoreToVoid(state, attackerPid, defenderPid, stillOnField)`,
            `            const __jugekiEntry = getCard(attacker.cardId).effects.find(
                (e) => e.kind === "keyword" && e.keyword === "jugeki" && effectActiveAtLevel(e.levels, f.attackerLevel),
            )
            if (__jugekiEntry) __covRecord("cont\\t" + String((__jugekiEntry as unknown as Record<string, unknown>)["__eid"] ?? "?"))
            // 魔影街Lv1：破壊の直前に、そのスピリット上のコアをボイドへ（リザーブに戻らなくなる）
            applyJugekiCoreToVoid(state, attackerPid, defenderPid, stillOnField)`,
        )

        // (6) createInstance 本体の先頭に「場に出たカード」の記録を挿す
        //     （引数リストが複数行なので、関数名の後の "):" 以降の最初の "{" を本体開始とみなす）
        const gsPath = path.join(tree, "server/src/logic/GameState.ts")
        const gs = fs.readFileSync(gsPath, "utf-8")
        const ciIdx = gs.indexOf("export function createInstance(")
        if (ciIdx < 0) throw new Error("createInstance が見つかりません（計測コードを追随させてください）")
        const bodyStart = gs.indexOf("{", gs.indexOf("):", ciIdx))
        if (bodyStart < 0) throw new Error("createInstance の本体開始位置を特定できません")
        if (!DRY_RUN) {
            fs.writeFileSync(
                gsPath,
                gs.slice(0, bodyStart + 1) + `\n    __covRecord("inst\\t" + cardId)` + gs.slice(bodyStart + 1),
            )
        }

        // (7) 継続効果（aura / constraint / keyword）は shared/ 側に計測点を入れる
        instrumentShared(tree, outFile)
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

        instrumentServer(tree, outFile)

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

        // 3つの記録ファイルは**すべて**出ていなければならない。1つでも欠けていたら
        // その計測系統が丸ごと no-op になっている（記録の一部だけが生きていると
        // 「実行実績0」の山として現れ、実装漏れの誤報になる。2026-08-08 に act/inst 側で実際に発生）
        for (const f of [outFile, outFile + ".shared", outFile + ".cost"]) {
            if (!fs.existsSync(f)) {
                throw new Error(
                    `記録ファイルが出ていません: ${path.basename(f)}\n` +
                        `計測コードの差し込みが no-op になっています。scripts/coverage-effects.ts を追随させてください。`,
                )
            }
        }
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
    // 未計測＝計測点が無いので「発火したか分からない」層。
    // 2026-07-30 時点では0件だったが、その後に追加された kind には計測点が付いていない。
    // **数だけでは何が見えていないのか分からない**ので kind 別に出す（2026-08-24）
    console.log(`  継続効果（未計測の kind）: ${unmeasured.length}件 ※ 計測点が無く、発火したか分からない層`)
    if (unmeasured.length > 0) {
        const kinds = new Map<string, string[]>()
        for (const e of unmeasured) {
            const list = kinds.get(e.kind) ?? []
            if (list.length < 2) list.push(`${e.cardId} ${e.cardName}`)
            kinds.set(e.kind, list)
        }
        const sorted = [...kinds.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        console.log(`    （${sorted.length}種）計測点を足せば、この層も「書いたが一度も発火していない」を検出できる:`)
        for (const [kind, sample] of sorted) {
            console.log(`      ${kind.padEnd(34)} 例: ${sample.join(" / ")}`)
        }
    }

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

// 直接実行されたときだけ計測を走らせる
// （checkPatchTargets を import する smoke 側で main() が動いてしまわないようにする）
if (require.main === module) main()

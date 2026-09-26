// 継続効果を個体へ書き戻す再計算（refreshLevelAsOverrides）と、期間つき効果の記録
import { countEffectCounter } from "../EffectModules"
import type { CardInstance, Color, GameState, PlayerId, ResolvedTargetFilter, TimedRecord, PlayerRuleDef } from "../../type"
import { currentLevel, findInstanceAnywhere, getCard, opponentOf, rawLevel } from "../GameState"
import { ownFieldSymbolColors } from "../../../../shared/cost"
import {
    effectActiveAtLevel,
    effectActiveOn,
    effectiveBp,
    effectSources,
    hasKeyword,
    instAllCosts,
    instColors,
    instHasColor,
    instHasCost,
    instIsVanilla,
    isVirtualSource,
    cardNameContains,
    matchesTarget,
    timedContentsOn,
    instMatchesCostFilter,
    matchesFamilyFilter,
    spiritHasFamily,
    spiritHasKeyword,
    bravesOf,
    hostsOf,
    instIsCombined,
    opponentFieldColorCount,
} from "../../../../shared/rules"

// 期間つき効果を一覧に記録する（docs/design/TIMED_EFFECTS.md）。一覧への追加はここだけにし、記録したら必ず個体の写しを作り直す
export function recordTimed(state: GameState, record: TimedRecord): void {
    state.timedEffects.push(record)
    refreshLevelAsOverrides(state)
}

// 一覧から個体の写し（timed〜）をゼロから作り直す。盤面を受け取らない読み取り関数（instHasColor 等）はこの写しを読む
// 「すべて」の記録の照合は、期間つきの写しを含まない状態で行う（期間つきで青にした個体は、別の「青のスピリットすべて」の記録の照合では青に数えない）。
// そう読むべきか割れるカードが出たら、ユーザーと相談して決める（2026-09-25 時点で該当カードなし）
function applyTimedCopies(state: GameState): void {
    const all: CardInstance[] = []
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const field = state.players[pid].field
        for (const inst of [...field.spirits, ...field.nexuses, ...field.combinedBraves]) {
            inst.timedColors = []
            inst.tempBpBuff = 0
            delete inst.battleBpBuff
            delete inst.battleBpAs
            delete inst.colorlessThisBattle
            inst.immuneToOpponentThisTurn = false
            delete inst.countAsThisTurn
            delete inst.lifeDamageNegatedFor
            delete inst.timedLevel
            delete inst.timedExtraSymbols
            delete inst.timedCostDelta
            delete inst.timedSymbolsOverride
            delete inst.timedSymbolLoss
        }
        all.push(...field.spirits, ...field.nexuses)
    }
    // 照合は写しを空にした状態で全員ぶん先に済ませる（写しを書きながら照合すると処理順で結果が変わるため）
    const hits = all.map((inst) => [inst, timedContentsOn(state, inst)] as const)
    for (const [inst, contents] of hits) {
        // 記録順に処理する＝後から掛けた Lv が勝つ
        for (const c of contents) {
            if (c.type === "color" && c.color !== undefined && !inst.timedColors.includes(c.color)) inst.timedColors.push(c.color)
            if (c.type === "level") {
                const levels = getCard(inst.cardId).levels
                if (c.requireLevelExists && c.set !== undefined && !levels.some((l) => l.level === c.set)) continue
                const to = c.max ? levels.reduce((m, l) => Math.max(m, l.level), 1) : c.set
                if (to !== undefined) inst.timedLevel = to
            }
            if (c.type === "symbolAdd") inst.timedExtraSymbols = (inst.timedExtraSymbols ?? 0) + 1
            if (c.type === "cost") inst.timedCostDelta = (inst.timedCostDelta ?? 0) + c.amount
            if (c.type === "symbolSet") inst.timedSymbolsOverride = new Array<Color>(c.count).fill(c.color)
            if (c.type === "symbolLoss" && c.color !== undefined) (inst.timedSymbolLoss ??= []).push(c.color)
        }
    }
    // 1体に掛けた記録を写す。BP+ は一定量だけ（「すべて」と「1体につき」の量は effectiveBp が読むたびに数え直す＝timedRuleBp）
    const byId = new Map(all.map((inst) => [inst.instanceId, inst]))
    for (const r of state.timedEffects) {
        const inst = r.target.kind === "instance" ? byId.get(r.target.instanceId) : undefined
        if (!inst) continue
        for (const c of r.content) {
            if (c.type === "bp" && c.amountCounter === undefined) {
                if (r.until === "battle") inst.battleBpBuff = (inst.battleBpBuff ?? 0) + c.amount
                else inst.tempBpBuff += c.amount
            }
            // 記録を出した側（ownerPid）が意味を持つ内容はここで写す（timedContentsOn では誰が出したかが消えるため）
            if (c.type === "bpAs") inst.battleBpAs = { levels: [...c.levels], amount: c.amount }
            if (c.type === "colorless") inst.colorlessThisBattle = true
            if (c.type === "immune") inst.immuneToOpponentThisTurn = true
            if (c.type === "countAs") inst.countAsThisTurn = { pid: r.ownerPid, count: c.count, ...(c.sourceTypes ? { sourceTypes: c.sourceTypes } : {}) }
            if (c.type === "noLifeDamage") inst.lifeDamageNegatedFor = r.ownerPid
        }
    }
}

// pid にこのターンの間の制約を掛ける（効果の中の「さらに、このターンの間〜」から書く）
export function recordPlayerRule(state: GameState, pid: PlayerId, rule: PlayerRuleDef): void {
    recordTimed(state, { content: [{ type: "playerRule", rule }], target: { kind: "player", pid }, until: "turn", ownerPid: pid })
}

// 1体を BP+（このターン／このバトルの間）。ownerPid＝効果を出した側
export function recordBp(state: GameState, ownerPid: PlayerId, inst: CardInstance, amount: number, until: "turn" | "battle"): void {
    recordTimed(state, { content: [{ type: "bp", amount }], target: { kind: "instance", instanceId: inst.instanceId }, until, ownerPid })
}

export function refreshLevelAsOverrides(state: GameState): void {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const inst of [
            ...state.players[pid].field.spirits,
            ...state.players[pid].field.nexuses,
            ...state.players[pid].field.combinedBraves,
        ]) {
            delete inst.levelAsContinuous
            delete inst.bpAsContinuous
            delete inst.bpEqualizeContinuous
            delete inst.levelAsEffectsOnly
            delete inst.levelCostBonusContinuous
            delete inst.namesAsContinuous
            delete inst.colorsAsContinuous
            delete inst.symbolsOverrideContinuous
            delete inst.symbolsAddedContinuous
            delete inst.symbolsForSummonReduction
            delete inst.armorColorsGranted
            delete inst.heavyArmorColorsGranted
            delete inst.braveImmuneAll
            delete inst.braveImmuneMatchArmorColors
            delete inst.grantedMagicNegate
            delete inst.alsoCostsContinuous
            delete inst.costDeltaContinuous
            delete inst.alsoCostsWhenDestroyed
            delete inst.treatedAsVanillaContinuous
            delete inst.effectsDisabledContinuous
            delete inst.braveComposite
            delete inst.braveStatsAsContinuous
            // 合体中のブレイヴ側の目印。coresOverride は**ここでしか使っていない**ときだけ消す
            // （クロスシザースのネクサスコア数リンクは field.nexuses に載るので混ざらない）
            if (inst.braveCombined === true) {
                delete inst.braveCombined
                delete inst.coresOverride
            }
        }
    }
    applyTimedCopies(state)
    // 合体しているブレイヴがホストへ足すぶんを組み直す（docs/design/BRAVE.md §3）。
    // **レベルに依らない値だけ**（コスト・色・シンボル）。「合体時BP+」はホストのコア数で変わるので
    // ここには入れず、shared/rules.ts の effectiveBp が都度引く
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        for (const host of player.field.spirits) {
            const braves = bravesOf(player, host)
            if (braves.length === 0) continue
            const composite = { cost: 0, colors: [] as Color[], symbols: [] as Color[] }
            for (const brave of braves) {
                const master = getCard(brave.cardId)
                composite.cost += master.cost
                for (const c of master.colors) if (!composite.colors.includes(c)) composite.colors.push(c)
                composite.symbols.push(...master.symbol)
            }
            host.braveComposite = composite
            for (const brave of braves) {
                // 合体状態のレベル表を引かせる目印と、判定に使うコア数（＝ホストのコア数）。
                // ⚠️ ホストの levelCostBonusContinuous（バァラル型「Lvコスト+N」）は**写さない**
                // （§12 の5。上がるのはホストのLvコストだけ）
                brave.braveCombined = true
                brave.coresOverride = host.coresOverride ?? host.cores
                // ブレイヴが持つ静的【装甲】もホストへ反映する（hasArmorAgainstはstateを受け取らない
                // 純粋述語で、ホストのカード自身しか見ないため。BS10フェンリルキャノンType-B）
                const braveLevel = currentLevel(brave).level
                for (const effect of getCard(brave.cardId).effects) {
                    if (effect.kind !== "keyword") continue
                    if (effect.keyword !== "armor" && effect.keyword !== "heavyArmor") continue
                    if (!effectActiveAtLevel(effect.levels, braveLevel)) continue
                    // 【重装甲】も同じ理由でホストへ写す（hasHeavyArmorAgainst も state を受け取らない純粋述語。
                    // BS12-055 ゲッコ・グライダー＝【合体時】【重装甲：紫/黄】）
                    const granted =
                        effect.keyword === "heavyArmor"
                            ? (host.heavyArmorColorsGranted ??= [])
                            : (host.armorColorsGranted ??= [])
                    for (const c of effect.colors ?? []) {
                        if (!granted.includes(c)) granted.push(c)
                    }
                }
            }
        }
    }
    // treatAs "max" は対象インスタンス自身のカードが持つ最高Lvに解決する（斬竜刀のガイ／崩壊する戦線：
    // 対象ごとに異なりうるため、発生源でなく対象カードのlevelsを参照する）。
    // "coresScaled" はコア数で換算する（1個→Lv1、2個→Lv2、3個以上→"max"と同じ。サファイアの城壁）
    const resolveTreatAs = (
        treatAs: number | "max" | "coresScaled" | { plus: number },
        inst: CardInstance,
    ): number => {
        const maxLevel = () => getCard(inst.cardId).levels.reduce((max, lv) => Math.max(max, lv.level), 0)
        if (treatAs === "max") return maxLevel()
        if (treatAs === "coresScaled") {
            if (inst.cores >= 3) return maxLevel()
            if (inst.cores === 2) return 2
            return 1
        }
        if (typeof treatAs === "object") {
            // 相対シフト（「Lvを1つ上のものとして扱う」）。**いまのレベル**を起点にする。
            // 起点は素の currentLevel（この関数は refreshLevelAsOverrides の中で呼ばれ、
            // levelAsContinuous を消したあとなので、コア数から求まる本来のレベルになっている）。
            // そのカードの最高Lvで頭打ち（レベル表に無い値を入れると置き換えが黙って無視される）
            return Math.min(maxLevel(), currentLevel(inst).level + treatAs.plus)
        }
        return treatAs
    }
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        // effectSources() でこのターンだけの仮想発生源（マジックが貸した継続効果。lendSelfThisTurn。
        // BS02-101リフレクションアーマー）も含める。keywordGrant/colorAs/levelAsはいずれも
        // 「誰が継続効果を出しているか」を問うA分類の走査のため、TURN_EFFECT_SOURCES.md §1 に沿う
        const sources = effectSources(state, pid)
        for (const source of sources) {
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind === "keywordGrant" && (effect.keyword === "armor" || effect.keyword === "heavyArmor")) {
                    // 継続付与の装甲（BS05白夜の虚空Lv2：転召持ちに装甲：赤/紫/緑/白を付与）／重装甲（器AP。BS13-056ホーク・ブレイカー）。
                    // hasArmorAgainst/hasHeavyArmorAgainstはstateを受け取らない設計のため、対象スピリットのCardInstance.
                    // armorColorsGranted/heavyArmorColorsGrantedへ毎回再計算して反映する（levelAsContinuous等と同じ「都度再構築」方式）
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    // onlyWhileSpiritState：発生源自身が合体しているときは発揮しない（BS13-056：「このブレイヴがスピリット状態の間」）
                    if (effect.onlyWhileSpiritState && instIsCombined(source)) continue
                    if (effect.phase !== undefined && state.phase !== effect.phase) continue
                    for (const spirit of player.field.spirits) {
                        if (effect.familyFilter && !matchesFamilyFilter(state, pid, spirit, effect.familyFilter)) continue
                        if (effect.colorFilter && !instHasColor(spirit, effect.colorFilter)) continue
                        if (effect.keywordFilter && !spiritHasKeyword(state, pid, spirit, effect.keywordFilter)) continue
                        if (
                            effect.keywordFilterAny &&
                            !effect.keywordFilterAny.some((k) => spiritHasKeyword(state, pid, spirit, k))
                        ) {
                            continue
                        }
                        // 実コストに加えて tempAlsoCosts（道化師クランの「コスト2としても扱う」）も見る
                        if (effect.costFilter && !instMatchesCostFilter(spirit, effect.costFilter)) continue
                        if (effect.keyword === "heavyArmor") {
                            // 器AP：重装甲の継続付与（BS13-056ホーク・ブレイカー）
                            if (!spirit.heavyArmorColorsGranted) spirit.heavyArmorColorsGranted = []
                            for (const c of effect.colors ?? []) {
                                if (!spirit.heavyArmorColorsGranted.includes(c)) spirit.heavyArmorColorsGranted.push(c)
                            }
                            continue
                        }
                        if (!spirit.armorColorsGranted) spirit.armorColorsGranted = []
                        for (const c of effect.colors ?? []) {
                            if (!spirit.armorColorsGranted.includes(c)) spirit.armorColorsGranted.push(c)
                        }
                    }
                    continue
                }
                if (effect.kind === "keyword" && effect.keyword === "armor" && effect.colorsFrom === "opponentFieldSymbols") {
                    // 【装甲：∞】：持ち主から見た相手フィールドのシンボル色を毎回算出して自身へ反映する
                    // （hasArmorAgainstはstateを受け取らない純粋述語のため、armorColorsGrantedへ都度全消去→再構築で渡す。
                    // BS06鎧神機ヴァルハランス。sourceは実在するカード自身＝effectSourcesが返す実フィールド発生源）
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    const oppColors = ownFieldSymbolColors(state, opponentOf(pid))
                    if (oppColors.size > 0) {
                        if (!source.armorColorsGranted) source.armorColorsGranted = []
                        for (const c of oppColors) {
                            if (!source.armorColorsGranted.includes(c)) source.armorColorsGranted.push(c)
                        }
                    }
                    continue
                }
                if (effect.kind === "braveImmuneGrant") {
                    // 第3の耐性軸（BS12初出）：相手のブレイヴの効果を受けない。target:"self"は発生源自身、
                    // target:"ownAll"は持ち主のスピリットすべて（colorFilter/keywordFilter/phase/turnで絞る）
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    if (effect.phase !== undefined && state.phase !== effect.phase) continue
                    if (effect.turn === "own" && pid !== state.turnPlayer) continue
                    if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                    const targets = effect.target === "self" ? [source] : player.field.spirits
                    for (const spirit of targets) {
                        if (effect.colorFilter !== undefined && !instHasColor(spirit, effect.colorFilter)) continue
                        if (effect.keywordFilter && !spiritHasKeyword(state, pid, spirit, effect.keywordFilter)) continue
                        if (effect.scope === "all") spirit.braveImmuneAll = true
                        else spirit.braveImmuneMatchArmorColors = true
                    }
                    continue
                }
                if (effect.kind === "effectEntryGrant") {
                    // 誘発でなく効果エントリ本体を継続付与する（BS12-068光の聖剣Lv1）。
                    // grantedMagicNegateへ積み、triggers.findMagicNegateSourceがcard自身のeffectsと合わせて走査する
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    for (const spirit of player.field.spirits) {
                        if (
                            effect.keywordFilterAny &&
                            !effect.keywordFilterAny.some((k) => spiritHasKeyword(state, pid, spirit, k))
                        ) {
                            continue
                        }
                        if (effect.familyFilter && !matchesFamilyFilter(state, pid, spirit, effect.familyFilter)) {
                            continue
                        }
                        ;(spirit.grantedMagicNegate ??= []).push(effect.granted)
                    }
                    continue
                }
                if (effect.kind === "keyword" && effect.keyword === "heavyArmor" && effect.colorsFrom === "selfColors") {
                    // 【重装甲：可変】＝「このスピリットの色の相手の効果を受けない」（BS12-X04 月光神龍ルナテック・
                    // ストライクヴルム）。**付与色も含めて毎回算出する**（2026-09-03 ユーザー確認。BS12-027 Lv2 が
                    // 「自分の[ルナテック]すべてを紫/緑のスピリットとしても扱う」と組む）。
                    // 【装甲：∞】の colorsFrom:"opponentFieldSymbols" と同じ都度再構築
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    const own = (source.heavyArmorColorsGranted ??= [])
                    for (const c of instColors(source)) if (!own.includes(c)) own.push(c)
                    continue
                }
                if (effect.kind === "vanillaAsGrant") {
                    // 「系統：『造兵』を持つ自分のスピリットすべてを、カードに効果の記述を持たない
                    // スピリットとしても扱う」（BS04スイッチヒッター）。instIsVanilla は state を受け取らない
                    // 純粋述語なので、対象の CardInstance.treatedAsVanillaContinuous へ毎回再構築して反映する
                    if (effect.lentOnly && !isVirtualSource(source)) continue
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    // chosenInstance（BS12-081メロディアスハープ）：陣営を問わず選んだ1体だけ
                    if (effect.target === "chosenInstance") {
                        const chosenId = source.lentChoiceInstanceId
                        const chosen =
                            chosenId === undefined
                                ? undefined
                                : (state.players.p1.field.spirits.find((s) => s.instanceId === chosenId) ??
                                  state.players.p2.field.spirits.find((s) => s.instanceId === chosenId))
                        if (chosen) chosen.treatedAsVanillaContinuous = true
                        continue
                    }
                    // self（BS12-046ナタ・ゴレム／BS12-059ショゴルス）：発生源自身。
                    // 合体中ブレイヴ自身の効果なら「このスピリット」はホストを指す（BRAVE.md §12.3。destroyAsMaxLevelGrantと同じ考え方）
                    if (effect.target === "self") {
                        if (effect.whileCombined && !instIsCombined(source)) continue
                        const isBrave = player.field.combinedBraves.some((b) => b.instanceId === source.instanceId)
                        if (isBrave) {
                            for (const host of hostsOf(player, source)) host.treatedAsVanillaContinuous = true
                        } else {
                            source.treatedAsVanillaContinuous = true
                        }
                        continue
                    }
                    for (const spirit of player.field.spirits) {
                        if (
                            effect.familyFilter &&
                            !matchesFamilyFilter(state, pid, spirit, effect.familyFilter)
                        ) {
                            continue
                        }
                        if (effect.colorFilter !== undefined && !instHasColor(spirit, effect.colorFilter)) continue
                        spirit.treatedAsVanillaContinuous = true
                    }
                    continue
                }
                if (effect.kind === "levelCostMod") {
                    // 「相手のスピリットすべてのLvコストを+1する」（BS09-017蛇凰神バァラルLv2-3）。
                    // 加算は重ねられる（同名を2体並べたら+2）。維持コア割れの掃除は
                    // GameEngine.handleAction の事後フック（sweepLevelCostDepletion）が行う
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    if (effect.target === "opponentNexusesAll") {
                        // BS15-015吸血令嬢エサルフリーダ：相手のネクサスすべての「Lvコスト」を+amount
                        for (const nexus of state.players[opponentOf(pid)].field.nexuses) {
                            nexus.levelCostBonusContinuous = (nexus.levelCostBonusContinuous ?? 0) + effect.amount
                        }
                        continue
                    }
                    const targetPid = effect.target === "opponentAll" ? opponentOf(pid) : pid
                    for (const spirit of state.players[targetPid].field.spirits) {
                        spirit.levelCostBonusContinuous =
                            (spirit.levelCostBonusContinuous ?? 0) + effect.amount
                    }
                    continue
                }
                if (effect.kind === "spiritEffectsDisabledGrant") {
                    // 「自分のスピリットをブロックした【転召】を持たない相手のスピリットが持つ効果すべては
                    // 発揮されない」（BS07ルナースラッシュ）。treatedAsVanillaContinuous（＝対象判定用の述語）とは別物で、
                    // こちらは effectSources / activeConstraints / spiritHasKeyword / fireTrigger の
                    // 4か所が CardInstance.effectsDisabledContinuous を見て実際に発揮を止める
                    if (effect.lentOnly && !isVirtualSource(source)) continue
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    // chosenInstance（BS12-081メロディアスハープ）：陣営を問わず選んだ1体だけ
                    if (effect.target === "chosenInstance") {
                        const chosenId = source.lentChoiceInstanceId
                        const chosen =
                            chosenId === undefined
                                ? undefined
                                : (state.players.p1.field.spirits.find((s) => s.instanceId === chosenId) ??
                                  state.players.p2.field.spirits.find((s) => s.instanceId === chosenId))
                        if (chosen) chosen.effectsDisabledContinuous = true
                        continue
                    }
                    const targetPid = effect.target === "opponentAll" ? opponentOf(pid) : pid
                    for (const spirit of state.players[targetPid].field.spirits) {
                        if (
                            effect.familyFilter &&
                            !matchesFamilyFilter(state, targetPid, spirit, effect.familyFilter)
                        ) {
                            continue
                        }
                        // 【転召】を持たない相手のみ。除外判定にはこのスピリットの静的キーワードだけを見る
                        // （spiritHasKeyword は effectsDisabledContinuous を見るため、ここで使うと
                        //   「無効化したせいでキーワードが消え、次の再構築でも無効化され続ける」自己参照になる）
                        if (
                            effect.keywordExclude !== undefined &&
                            hasKeyword(spirit.cardId, effect.keywordExclude)
                        ) {
                            continue
                        }
                        // 「自分のスピリットをブロックした相手のスピリット」＝現在のバトルのブロッカーのみ
                        if (effect.blockingOnly && state.battle?.blockerInstanceId !== spirit.instanceId) continue
                        spirit.effectsDisabledContinuous = true
                    }
                    continue
                }
                if (effect.kind === "nameAsGrant") {
                    // 「コストNの自分のスピリットすべては、カード名に『◯◯』が入っているものとして扱う」
                    // （アルカナプリンス・オベロLv2／アルカナプリンセス・アンLv2）。
                    // cardNameContains は state を受け取らない純粋述語なので、colorsAsContinuous と同じく
                    // 対象の CardInstance.namesAsContinuous へ毎回再構築して反映する
                    if (effect.lentOnly && !isVirtualSource(source)) continue
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    for (const spirit of player.field.spirits) {
                        // 器BK：target:"self"は発生源自身にだけ付与する
                        if (effect.target === "self" && spirit.instanceId !== source.instanceId) continue
                        // 「コストNの自分のスピリット」は付与コスト（道化師クラン）も込みで判定する
                        if (effect.costFilter !== undefined && !instHasCost(spirit, effect.costFilter)) continue
                        if (effect.colorFilter !== undefined && !instHasColor(spirit, effect.colorFilter)) continue
                        if (!spirit.namesAsContinuous) spirit.namesAsContinuous = []
                        if (!spirit.namesAsContinuous.includes(effect.nameIncludes)) {
                            spirit.namesAsContinuous.push(effect.nameIncludes)
                        }
                    }
                    continue
                }
                if (effect.kind === "colorAs") {
                    // 発生源自身（target:"ownAll" は持ち主のスピリットすべて）が指定色としても扱われる
                    // （継続。百面相のフラットフェイス／妖精ティングリー）
                    if (effect.lentOnly && !isVirtualSource(source)) continue
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    // 仮想発生源は場に実在しないため、target:"self" の対象にはできない（TURN_EFFECT_SOURCES.md §4.1）
                    const targets =
                        effect.target === "ownAll"
                            ? player.field.spirits
                            : effect.target === "ownNexusesAll"
                              ? player.field.nexuses
                              : [source]
                    if (effect.turn === "own" && pid !== state.turnPlayer) continue
                    if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                    for (const target of targets) {
                        if (effect.nameIncludes !== undefined && !cardNameContains(target, effect.nameIncludes)) continue
                        if (!target.colorsAsContinuous) target.colorsAsContinuous = []
                        for (const c of effect.colors) {
                            if (!target.colorsAsContinuous.includes(c)) target.colorsAsContinuous.push(c)
                        }
                    }
                    continue
                }
                if (effect.kind === "symbolAddGrant") {
                    // 継続的な「シンボルを追加する」（BS12初出。BS12-006竜拳士アルディ・バロン／
                    // BS12-X01金牛龍神ドラゴニック・タウラス）。盤面のシンボル数に効く（軽減計算・ライフダメージ両方）
                    if (!effectActiveOn(source, effect, currentLevel(source).level)) continue
                    // condition.ownFieldHasBraveInSpiritState（BS13-006炎獣ファイオリックLv2-3）：
                    // 持ち主のフィールドにスピリット状態のブレイヴが**いる間**だけ有効
                    if (
                        effect.condition &&
                        "ownFieldHasBraveInSpiritState" in effect.condition &&
                        !player.field.spirits.some((sp) => getCard(sp.cardId).type === "brave")
                    ) {
                        continue
                    }
                    // 器BS16：condition.ownBurstSet（BS16-063釣魂台）：発生源の持ち主が自分の
                    // バーストエリアにカードをセットしている間だけ有効
                    if (effect.condition && "ownBurstSet" in effect.condition && !player.burstSet) {
                        continue
                    }
                    if (effect.phaseTurn) {
                        if (state.phase !== effect.phaseTurn.phase) continue
                        if (effect.phaseTurn.turn === "own" && pid !== state.turnPlayer) continue
                        if (effect.phaseTurn.turn === "opponent" && pid === state.turnPlayer) continue
                    }
                    const count =
                        effect.counter !== undefined
                            ? countEffectCounter(state, pid, source, effect.counter, undefined)
                            : (effect.count ?? 1)
                    if (count <= 0) continue
                    const targets =
                        effect.target === "ownAll"
                            ? player.field.spirits.filter((sp) => matchesTarget(state, pid, sp, effect.filter as ResolvedTargetFilter | undefined))
                            : [source]
                    for (const target of targets) {
                        if (!target.symbolsAddedContinuous) target.symbolsAddedContinuous = []
                        for (let i = 0; i < count; i++) target.symbolsAddedContinuous.push(effect.color)
                    }
                    continue
                }
                if (effect.kind === "costDelta") {
                    // 継続的な「コスト+N」（BS11-017 ムシャツバメLv2-3）
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    if (effect.phaseTurn) {
                        if (state.phase !== effect.phaseTurn.phase) continue
                        if (effect.phaseTurn.turn === "own" && pid !== state.turnPlayer) continue
                        if (effect.phaseTurn.turn === "opponent" && pid === state.turnPlayer) continue
                    }
                    for (const spirit of effect.target === "self" ? [source] : player.field.spirits) {
                        spirit.costDeltaContinuous = (spirit.costDeltaContinuous ?? 0) + effect.amount
                    }
                    continue
                }
                if (effect.kind === "symbolFix") {
                    // 持ち主の対象スピリット（familyFilter一致）のシンボルを、そのスピリット元々の
                    // シンボル1色目でcount個に固定する（継続。BS08海底に眠りし古代都市Lv2）
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    // phaseTurn（BS09-008炎皇帝アグニフォンLv2-3＝『自分のアタックステップ』）
                    if (effect.phaseTurn) {
                        if (state.phase !== effect.phaseTurn.phase) continue
                        if (effect.phaseTurn.turn === "own" && pid !== state.turnPlayer) continue
                        if (effect.phaseTurn.turn === "opponent" && pid === state.turnPlayer) continue
                    }
                    // target:"self" は発生源自身だけ（BS11-039 天使ティアエル）
                    const symbolFixTargets = effect.target === "self" ? [source] : player.field.spirits
                    for (const spirit of symbolFixTargets) {
                        if (effect.familyFilter && !matchesFamilyFilter(state, pid, spirit, effect.familyFilter)) continue
                        // color 指定時はその色に固定する（省略時は対象が元々持つシンボルの1色目）
                        const baseColor = effect.color ?? getCard(spirit.cardId).symbol[0]
                        if (!baseColor) continue
                        const fixed = new Array<Color>(effect.count).fill(baseColor)
                        // summonReductionOnly：スピリット召喚の軽減計算のあいだだけ使う置き場へ入れる
                        if (effect.summonReductionOnly) spirit.symbolsForSummonReduction = fixed
                        else spirit.symbolsOverrideContinuous = fixed
                    }
                    continue
                }
                if (effect.kind === "braveStatsAs") {
                    // 「自分のスピリット状態のブレイヴすべてを"コスト◯/系統：◯/Lv1 BP◯"の
                    // スピリット状態のブレイヴとして扱う」（継続。BS10-X06天蠍神騎スコル・スピア）。
                    // 対象は field.spirits にいる card.type==="brave" の個体のみ（合体中のブレイヴは
                    // field.combinedBraves にいるため自然に対象外＝BRAVE.md §12.7）。
                    // ステータスだけを上書きし、そのブレイヴが元から持つ効果は残す（effectsDisabledContinuousは立てない）
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    for (const spirit of player.field.spirits) {
                        if (getCard(spirit.cardId).type !== "brave") continue
                        spirit.braveStatsAsContinuous = {
                            cost: effect.cost,
                            family: effect.family,
                            braveLevels: effect.braveLevels,
                        }
                        // ⚠️ **シンボルの色とカードの色は別の値**（シンボルの色がカードの色と違う
                        // スピリットが実在する。2026-08-29 ユーザー指摘）。カードのcolorsからシンボル色を
                        // 導いてはいけない。ここは**発生源自身のシンボル色**で固定する（2026-08-29 ユーザー確認）。
                        // テキストが定めているのは「コスト◯/系統◯/シンボル1個/Lv1 BP◯」という1つの型で、
                        // シンボルの色も発生源が定める（ブレイヴごとに変わるなら一律に書けない）。
                        // そのため**元々シンボルを持たないブレイヴにも1個与えられる**。
                        // 別の色のシンボルを定める効果が出てきたら、そのときに色の軸をEffectDefへ足す
                        const baseColor = getCard(source.cardId).symbol[0]
                        if (!baseColor) continue
                        spirit.symbolsOverrideContinuous = new Array(effect.symbolCount).fill(baseColor)
                    }
                    continue
                }
                if (effect.kind === "alsoCostGrant") {
                    // 持ち主のスピリットすべてを「コストNとしても扱う」（継続。道化師クラン）。
                    // instHasCost / instMatchesCostFilter は state を受け取らない設計のため、
                    // 対象の CardInstance.alsoCostsContinuous へ毎回再計算して反映する
                    if (effect.lentOnly && !isVirtualSource(source)) continue
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    for (const spirit of player.field.spirits) {
                        // familyFilter（SD02-013 転召の祭壇Lv2＝召喚するカードと同じ系統のみ）
                        if (effect.familyFilter && !matchesFamilyFilter(state, pid, spirit, effect.familyFilter)) continue
                        // 器AY：combinedOnly（BS13-069星空のコンサートホールLv2）＝合体スピリットのみ対象
                        if (effect.combinedOnly && !instIsCombined(spirit)) continue
                        // plus 指定時は「元のコスト+plus としても扱う」（相対値版。固定値の cost と排他）
                        const value = effect.plus !== undefined
                            ? getCard(spirit.cardId).cost + effect.plus
                            : effect.cost
                        // costs（複数値。BS11-064 闇の聖剣＝コスト3/4）と cost/plus（単一値）を1本にまとめる
                        const values = effect.costs ?? (value !== undefined ? [value] : [])
                        if (values.length === 0) continue
                        // whenDestroyedOnly：破壊されたときの判定にだけ効く（置き場を分ける）
                        const key = effect.whenDestroyedOnly ? "alsoCostsWhenDestroyed" : "alsoCostsContinuous"
                        for (const v of values) {
                            if (!spirit[key]) spirit[key] = []
                            if (!spirit[key].includes(v)) spirit[key].push(v)
                        }
                    }
                    continue
                }
                if (effect.kind === "bpAs") {
                    // 継続的な「BPを◯として扱う」（levelAsのBP版。器Q。BS13-X011）
                    if (effect.whileCombined === true && !instIsCombined(source)) continue
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    for (const spirit of player.field.spirits) {
                        if (!matchesFamilyFilter(state, pid, spirit, effect.familyFilter)) continue
                        spirit.bpAsContinuous = effect.amount
                    }
                    continue
                }
                if (effect.kind === "bpEqualizeFamily") {
                    // 器BS16：他の同系統スピリットのLv別BPを、発生源自身の**現在の実効BP**と同じとして
                    // 扱う（全面上書き。対象側のBP+は加算されない）。BS16-009百地ダイル
                    if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                    if (effect.phaseTurn) {
                        if (state.phase !== effect.phaseTurn.phase) continue
                        if (effect.phaseTurn.turn === "own" && pid !== state.turnPlayer) continue
                        if (effect.phaseTurn.turn === "opponent" && pid === state.turnPlayer) continue
                    }
                    const sourceBp = effectiveBp(state, pid, source)
                    for (const spirit of player.field.spirits) {
                        if (spirit.instanceId === source.instanceId) continue
                        if (!matchesFamilyFilter(state, pid, spirit, effect.familyFilter)) continue
                        spirit.bpEqualizeContinuous = sourceBp
                    }
                    continue
                }
                if (effect.kind !== "levelAs") continue
                if (effect.lentOnly && !isVirtualSource(source)) continue
                // 【合体時】：発生源が合体しているときだけ（BS10-078 聖鎧獣アメミード）
                if (effect.whileCombined === true && !instIsCombined(source)) continue
                if (
                    effect.sourceMinLevel !== undefined &&
                    rawLevel(source) < effect.sourceMinLevel
                ) {
                    continue
                }
                if (
                    effect.sourceLevels !== undefined &&
                    !effect.sourceLevels.includes(rawLevel(source))
                ) {
                    continue
                }
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                if (effect.condition) {
                    if ("maxOwnSpirits" in effect.condition) {
                        if (player.field.spirits.length > effect.condition.maxOwnSpirits) continue
                    } else if ("ownFieldHasFamily" in effect.condition) {
                        // 鼠人チューリヒ：発生源の持ち主のフィールドに指定系統を持つスピリットがいる間有効
                        const family = effect.condition.ownFieldHasFamily
                        if (!player.field.spirits.some((s) => spiritHasFamily(state, pid, s, family))) continue
                    } else if ("ownSpiritCountBelowOpponent" in effect.condition) {
                        // BS08ダークチュンポポLv2：自分のスピリットの体数が相手より少ない間だけ有効
                        const oppCount = state.players[opponentOf(pid)].field.spirits.length
                        if (player.field.spirits.length >= oppCount) continue
                    } else if ("ownFieldHasCombinedSpirit" in effect.condition) {
                        // BS10-002首長竜人ブラッキオ：自分のフィールドに合体スピリットがいる間だけ有効
                        if (!player.field.spirits.some((s) => instIsCombined(s))) continue
                    } else if ("ownBurstSet" in effect.condition) {
                        // SD06-003ワン・ケンゴー：自分がバーストをセットしている間だけ有効
                        if (!player.burstSet) continue
                    } else if ("ownLifeAtLeast" in effect.condition) {
                        // BS15-016闇騎士ガウェイン：自分のライフが3以上の間だけ有効
                        if (player.life < effect.condition.ownLifeAtLeast) continue
                    } else if ("opponentFieldColorsAtLeast" in effect.condition) {
                        // BS15共通器：BS15-047パンクマウス
                        if (
                            opponentFieldColorCount(state, pid, effect.condition.spiritsOnly === true) <
                            effect.condition.opponentFieldColorsAtLeast
                        ) {
                            continue
                        }
                    } else {
                        // 斬竜刀のガイ：自分か相手のどちらかのフィールドに指定色のスピリットがいる間有効
                        const color = effect.condition.anyFieldHasColorSpirit
                        const anySpirits = [
                            ...state.players.p1.field.spirits,
                            ...state.players.p2.field.spirits,
                        ]
                        if (!anySpirits.some((s) => instHasColor(s, color))) continue
                    }
                }
                if (effect.target === "self") {
                    source.levelAsContinuous = resolveTreatAs(effect.treatAs, source)
                } else if (effect.target === "ownNexusesAll") {
                    // nameContains指定時はカード名にこの文字列を含む自分のネクサスのみ（BS13-072未完成の古代戦艦：羅針盤Lv2）
                    for (const nexus of player.field.nexuses) {
                        if (effect.nameContains !== undefined && !cardNameContains(nexus, effect.nameContains)) continue
                        nexus.levelAsContinuous = resolveTreatAs(effect.treatAs, nexus)
                    }
                } else if (effect.target === "opponentNexusesAll") {
                    // 発生源の持ち主の相手の全ネクサス（ウッド・ゴレム）。
                    // effectsOnly 指定時は**効果の発揮判定にだけ効く**置き換えなので、
                    // 表示や「Lv1のネクサスを破壊する」の判定には当たらない（displayLevel が無視する）
                    for (const nexus of state.players[opponentOf(pid)].field.nexuses) {
                        nexus.levelAsContinuous = resolveTreatAs(effect.treatAs, nexus)
                        if (effect.effectsOnly) nexus.levelAsEffectsOnly = true
                    }
                } else if (effect.target === "ownSpiritsAll") {
                    // 発生源の持ち主のスピリットすべて（修飾なし。BS10-056蒼天大聖モンゴクウ）。
                    // 都度全消去→再構築（このファイル冒頭のコメント参照）なので、解決より後に召喚された
                    // スピリットにもこのターン中ずっと自然に効く（levelAs は個体への印ではなく走査のたびに再適用されるため）
                    for (const spirit of player.field.spirits) {
                        // costMinFilter（BS11-047 海王神獣トライ・ポセイドス＝コスト7以上）
                        if (
                            effect.costMinFilter !== undefined &&
                            !instAllCosts(spirit).some((c) => c >= effect.costMinFilter!)
                        ) {
                            continue
                        }
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "ownSpiritsByKeyword") {
                    // キーワード判定はカード静的のみ（getCard(s.cardId).effectsにkind"keyword"かつ
                    // keyword一致のエントリがあるか。レベル・付与は見ない）
                    for (const spirit of player.field.spirits) {
                        const hasStaticKeyword = getCard(spirit.cardId).effects.some(
                            (e) => e.kind === "keyword" && e.keyword === effect.keywordFilter,
                        )
                        if (!hasStaticKeyword) continue
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "ownSpiritsByFamily") {
                    // マッスルチャージ：familyFilterの系統（配列＝OR）を持つ持ち主のスピリットすべてを
                    // それぞれの最高Lvとして扱う（BS06。matchesFamilyFilterはtempKeywords等の付与も考慮する）
                    for (const spirit of player.field.spirits) {
                        if (effect.familyFilter && !matchesFamilyFilter(state, pid, spirit, effect.familyFilter)) continue
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "ownSpiritsVanilla") {
                    // カードに効果の記述を持たない（バニラ）持ち主のスピリットすべて（サファイアの城壁）。
                    // summonedThisTurnOnly 指定時は「召喚されたターンの間」だけ（BS04心臓破りの巨大坂Lv2）
                    for (const spirit of player.field.spirits) {
                        if (!instIsVanilla(spirit)) continue
                        if (effect.summonedThisTurnOnly && spirit.summonedTurn !== state.turn) continue
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "opponentSpiritsAll") {
                    // 発生源の持ち主の相手のスピリットすべて（BS03フォーカード／BS04ジャッジメントライツ）
                    for (const spirit of state.players[opponentOf(pid)].field.spirits) {
                        spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                    }
                } else if (effect.target === "opponentBlockersOfOwnKeyword") {
                    // SD02-005 天使ヘルヴィムLv2-3：**このキーワードを持つ自分のスピリット**を
                    // ブロックしている相手をLv1として扱う。バトルは同時に1つしか起きないので対象は最大1体だが、
                    // 効果文の「すべて」に合わせて集合として扱う
                    const battle = state.battle
                    const kw = effect.keywordFilter
                    if (battle && battle.blockerInstanceId && kw) {
                        const attacker = state.players[pid].field.spirits.find(
                            (sp) => sp.instanceId === battle.attackerInstanceId,
                        )
                        if (attacker && spiritHasKeyword(state, pid, attacker, kw)) {
                            const blocker = state.players[opponentOf(pid)].field.spirits.find(
                                (sp) => sp.instanceId === battle.blockerInstanceId,
                            )
                            if (blocker) blocker.levelAsContinuous = resolveTreatAs(effect.treatAs, blocker)
                        }
                    }
                } else if (effect.target === "allSpiritsByChosenColor") {
                    // 両陣営の、貸与時に選ばれた色（仮想発生源のlentChoiceColor）のスピリットすべてを
                    // それぞれの最高Lvとして扱う（BS02-111スピリットイリュージョン）。
                    // 封印された魔導書Lv1で片側のみに変更されていたら（lentKeepPid）、その側だけに効く。
                    // 答えは貸与時に写してあるので、マジックの解決が終わった後もターン中ずっと効く
                    const chosenColor = source.lentChoiceColor
                    if (chosenColor) {
                        const keepPid = source.lentKeepPid
                        const targets =
                            keepPid !== undefined
                                ? [...state.players[keepPid].field.spirits]
                                : [...state.players.p1.field.spirits, ...state.players.p2.field.spirits]
                        for (const spirit of targets) {
                            if (!instHasColor(spirit, chosenColor)) continue
                            spirit.levelAsContinuous = resolveTreatAs(effect.treatAs, spirit)
                        }
                    }
                }
            }
        }
    }
    // ---- 2パス目：armorEffectiveGrant（BS12-031メカニフォンLv2） ----
    // 「このスピリットが持つ【装甲】（付与された分も含めた実効の色）を自分のスピリットすべてに与える」。
    // ①の静的＋通常付与（armorColorsGranted/heavyArmorColorsGrantedの再構築）が全て終わったあとに
    // 発生源自身の実効【装甲】色を算出して配る（②は①の結果だけを読み、②が書いた結果は読まない＝循環回避）
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        for (const source of effectSources(state, pid)) {
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "armorEffectiveGrant") continue
                if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                if (effect.whileCombined === true && !instIsCombined(source)) continue
                const level = currentLevel(source).level
                const ownArmorColors: Color[] = []
                for (const e of getCard(source.cardId).effects) {
                    if (e.kind !== "keyword" || e.keyword !== "armor") continue
                    if (!effectActiveAtLevel(e.levels, level)) continue
                    for (const c of e.colors ?? []) if (!ownArmorColors.includes(c)) ownArmorColors.push(c)
                }
                for (const c of source.armorColorsGranted ?? []) if (!ownArmorColors.includes(c)) ownArmorColors.push(c)
                if (ownArmorColors.length === 0) continue
                for (const spirit of player.field.spirits) {
                    const granted = (spirit.armorColorsGranted ??= [])
                    for (const c of ownArmorColors) if (!granted.includes(c)) granted.push(c)
                }
            }
        }
    }
    // クロスシザースのネクサス⇔コア数リンク（coresLinkedTo）を同期する。
    // リンク元スピリットが消えていれば両フィールドをクリアする
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const nexus of state.players[pid].field.nexuses) {
            if (!nexus.coresLinkedTo) continue
            const source = findInstanceAnywhere(state, nexus.coresLinkedTo)
            if (!source) {
                delete nexus.coresLinkedTo
                delete nexus.coresOverride
                continue
            }
            nexus.coresOverride = source.cores
        }
    }
}

// 場にある1枚の個体 CardInstance（コア・疲労・合体・期間つきの印など）
import type { EffectDef } from "./effectDef"
import { PlayerId, Color, CardType, LevelDef, DestroyContext } from "../type"

// 盤面インスタンス（可変）。data.md 6.2 に対応
export interface CardInstance {
    instanceId: string
    cardId: string
    cores: number
    // [ソウルコア]がこの個体に載っているかの写し（真格コアの所在ポインタ PlayerState.soulCore のミラー）。
    // ポインタを書き換えてよい moveSoulCore / placeSoulCoreOnSummoned だけが保守する。
    // levelOf は shared 側で PlayerState を見られないため、真界放Lvの免除判定はこの写しを見る
    soulCoreOn?: true
    isRested: boolean
    // 重疲労状態（26系）。立つときは isRested も必ず true（重疲労は疲労状態の一種）。
    // 回復ステップ・回復効果では回復せず疲労状態へ1段戻る（2026-10-08 ユーザー確定）。入口は heavyExhaustSpirit / refreshSpirit だけ
    heavyRested?: true
    summonedTurn: number
    // この個体がどう召喚されたかの永続フラグ（26系【Fチェンジ】参照用）。
    // "summon"=通常GameAction召喚／"fchange"=【Fチェンジ】／"freeEffect"=その他の効果による無償召喚。未指定=記録なし
    summonedBy?: string
    tempBpBuff: number // ターン終了時まで有効なBP増減
    battleBpBuff?: number // このバトルの間だけ有効なBP増減（bpBuff の scope:"battle"）。clearBattle でリセットする。
    colorlessThisBattle?: true // 期間つき効果の一覧（colorless）から作り直す写し。色とシンボルを無いものとして扱う
    bpAsContinuous?: number // 継続的な「BPを◯として扱う」上書き（kind:"bpAs"。levelAsのBP版。EffectModules.refreshLevelAsOverridesが毎回再計算する。器Q。BS13-X011）
    bpEqualizeContinuous?: number // 継続的な「Lv1/Lv2/Lv3BPを、発生源のBPと同じとして扱う」（kind:"bpEqualizeFamily"）。扱いは bpAsContinuous と同じ
    battleBpAs?: { levels: number[]; amount: number } // 期間つき効果の一覧（bpAs）から作り直す写し
    battleSymbolsAdded?: Color[] // このバトルの間だけ追加されるシンボル（bpBuff.thenAddSymbolThisBattleが積む。symbolsAddedContinuousの「このバトルの間」版。clearBattleでリセット。BS13-062光り輝く大銀河Lv2）
    timedSymbolsOverride?: Color[] // このバトルの間「シンボルを◯色◯つとして扱う」（一覧 timedEffects から refreshLevelAsOverrides だけが作り直す写し。直接書かない）
    borrowedAttackEffectOnce?: true // borrowCombinedAttackEffectの再帰ガード（内部専用。cards.jsonには書かない）。
    // 「自身を選べば同じ効果がそのアタックで2回発揮される」（2026-09-08ユーザー確認）を文字どおり2回で
    // 止めるための印。自身を選んで発揮する間だけ立て、次に同じ効果を借りようとしたときは自身を候補から外す
    // （無限再帰の防止。BS13-049イリテバン）
    destroyAsMaxLevel?: true // 破壊処理中、このスピリットのLvを一時的に「そのカードのレベル表の最大Lv」として扱う（levelOf/currentLevelが読む）。destroyAsMaxLevelGrant（器N）によるコア0破壊のときだけdestroySpiritが立てる。すぐトラッシュへ移るインスタンスなので後始末は不要
    // 効果テキストが「このバトルの間、BP+」と明示しているものだけがこちら（BS07ニードルショット）。無記述のBP+はターン終了時まで＝tempBpBuff
    noRefreshUntilOwnEndSteps?: number // 値が1以上の間、この個体はリフレッシュステップ・効果のいずれでも回復しない（refreshSpiritの唯一の入口で判定）。持ち主のエンドステップごとに1減らし、0になったら通常どおり回復する（BS12-078カシオペアシール：「『自分のエンドステップ』を5回行うまで、そのスピリットは回復できない」）
    immuneToOpponentThisTurn: boolean // 期間つき効果の一覧（immune）から作り直す写し
    untargetableByOpponentMagicTimed?: true // 期間つき効果（untargetableByOpponentMagic）から作り直す写し
    blockConstraintNegatedThisTurn: boolean // このターンの間、自身の cantBlock/cantBlockLowerBp を無効化（バーストファイア）
    destroyAtBattleEnd?: true // 器BS16：バトル参加者としてonBattleEndまで生き残ったら、そこで破壊される（GameEngine.runBattleStep case8/9が判定）。summonFromTrashFree.destroyAtBattleEndが召喚時に立てる（BS16-075スケープゴート：「バトル終了時、この効果で召喚されたスピリットは破壊される」＝チャンプブロック用の一時召喚）
    countAsThisTurn?: { pid: PlayerId; count: number; sourceTypes?: CardType[] } // 期間つき効果の一覧（countAs）から作り直す写し。pid＝記録を出した側
    activatedUsedTurn?: Record<string, number> // kind:"activated" の oncePerTurn 用。effectId -> 最後に発動したターン番号（state.turn と一致する間は再発動できない。BS08帝竜騎サイクル）
    magicNegateUsedTurn?: number // kind:"magicNegate" の oncePerTurn 用。この個体が最後にマジックを無効にしたターン番号（state.turn と一致する間は再使用できない。BS02鏡の回廊Lv2）
    reviveOnDestroyUsedTurn?: number // kind:"reviveOnDestroy" の oncePerTurn 用。この発生源が最後に復活を成立させたターン番号（magicNegateUsedTurnと同型。BS06暴かれた墓石Lv2）
    attackedThisTurn?: boolean // このターンに既にアタックを宣言したか（GameEngineがアタック宣言時に立て、ターン終了でリセット）。globalConstraint "attackOncePerTurnBySymbolCount" だけが見る（BS13-068遥かなる衛星砲）
    magicFreeUseTurn?: number // BS11-X05 魔導双神ジェミナイズ Lv2-3用。magicFreeUseCount が最後に更新されたターン番号（一致しない間はcount実質0扱い＝ターンをまたいだ暗黙のリセット。magicNegateUsedTurnと同じ形）
    magicFreeUseCount?: number // 同上：magicFreeUseTurn === state.turn の間だけ有効な、そのターンに実際に無償使用した回数（「ターンに2回しか使えない」の実測カウント。confirmで断った・候補が無かった場合は増えない）
    triggeredUsedTurn?: Record<string, number> // kind:"triggered" の oncePerTurn 用。effectId -> 最後に発揮したターン番号（stepUsedTurnと同型。BS11-032 天王神獣スレイ・ウラノス）
    stepUsedTurn?: Record<string, number> // kind:"step" の oncePerTurn 用。effectId -> 最後に発揮したターン番号（activatedUsedTurnと同型。BS10-008 火星神龍アレス・ドラグーン）
    tempAlsoCosts: number[] // このターンの間、実コストに加えてこれらのコストとしても扱われる（ターン終了でリセット。道化師クラン）
    costDeltaContinuous?: number // 継続的なコストの増減（kind:"costDelta"。EffectModules.refreshLevelAsOverridesが毎回再計算し、shared/rules.instCostDelta が読む。BS11-017 ムシャツバメ）
    timedCostDelta?: number // このターンの間のコストの増減（一覧 timedEffects から refreshLevelAsOverrides だけが作り直す写し。直接書かない）。shared/rules.ts の instCostDelta が読む
    // **tempAlsoCosts とは別物**：あちらは「そのコストとしても扱う」（元のコストも残る）、こちらは増減（元のコストは残らない）
    timedColors: Color[] // 期間つき効果で与えられた色の写し（一覧 timedEffects から refreshLevelAsOverrides だけが作り直す。直接書かない）
    // **破壊待機状態**（docs/design/TIMING_CHART.md §1.5）。破壊が決まってから、
    // 破壊時の誘発を解決し終えてトラッシュに置かれるまでの間だけ立つ。
    // この間もカードはフィールドに存在し、コアも乗ったままで、**カードの効果の対象に取れる**
    // （数・シンボル・【転召】の生贄にも数える）。
    // 一方で**疲労／回復はできず、ここからさらに破壊されることもない**
    pendingDestruction?: true
    // pendingDestruction のうち**消滅**（維持コア割れ）によるもの。シンボルを軽減に使えない点だけが
    // 破壊待機と違う（RULES_BATSPI_WIKI.md §2）。pendingDestruction と一緒のときだけ意味を持つ
    pendingVanishByOpponent?: true // pendingVanish のうち、相手の効果（currentEffectSource が相手側）で消滅したもの。byOpponentVanishOnly が読む
    pendingVanish?: true
    // **バウンス待機状態**（バトスピ Wiki「バウンスについて」。2020年5月のルール改定）。
    // 手札／デッキへ戻す効果を解決してから、実際にその場所へ移るまでの間だけ立つ。
    // この間もカードはフィールドに留まるが、**破壊待機状態とは扱いが違う**:
    //   - シンボルを**軽減に使えない**（破壊待機は使える）
    //   - 「手札／デッキに戻ることに関する効果」以外は**発揮できず、その対象にもならない**
    //   - 発揮できるのは「フィールドを離れるとき」「手札／デッキに戻るとき」だけ
    // これらの誘発は**バウンス効果の解決が終わってから**まとめて発揮する（割り込ませない）
    pendingBounce?: { to: "hand" | "deckTop" | "deckBottom" }
    coresAtDestruction?: number // 破壊直前に置かれていたコア数（destroySpiritが記録。漆黒鳥ヤタグロス）
    // 破壊待機状態の間だけ持つ、その破壊のコンテキストと確認の出し方（destroySpiritが記録し、
    // commitPendingDestruction が「フィールドに残る」の判定に使う。cards.jsonには書かない内部専用）。
    // 「フィールドに残る」は破壊待機からトラッシュへ置かれる**代わり**に働くので、
    // 判定はトラッシュ行きの確定地点まで持ち越す必要がある（TIMING_CHART.md「『フィールドに残る／戻る』と『破壊時』」）
    pendingDestroyContext?: DestroyContext
    pendingDestroyAllowSuspend?: true
    skipReviveOnCommit?: true // 消滅（維持コア割れ）・skipRevive 指定の破壊では「フィールドに残る」を見ない印
    // 破壊待機状態の間だけ持つ、破壊後バースト（kind:"burst".event:"ownSpiritDestroyed"）用の控え。
    // destroySpiritが破壊直前に計算した値をここに残し、commitPendingDestructionが読んでpendingBurstDestroyQueueへ積む
    // （破壊後バーストはトラッシュ行き確定の後に発火するため、確定前の値をここで持ち越す。BS16バッチ0）
    pendingDestroyBurstInfo?: { byOpponentEffect: boolean; bp: number }
    levelCostBonusContinuous?: number // 継続的な「Lvコストを+Nする」。各レベルに必要なコア数がこの数だけ増える（維持コア＝Lv1のコストも上がるので、下回った個体は消滅する）。EffectModules.refreshLevelAsOverridesが毎回再計算し、shared/rules.instLevels が反映する（BS09-017蛇凰神バァラルLv2-3。2026-08-14 ユーザー確認）
    levelAsContinuous?: number // 継続的な「Lv◯として扱う」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（ナイフ投げのジャグリーン／トパーズの流星）
    timedLevel?: number // 期間つき効果の「Lv◯として扱う」の写し（一覧 timedEffects から refreshLevelAsOverrides だけが作り直す。直接書かない）
    lifeCapThisTurn?: number // 期間つき効果（lifeCap）から作り直す写し。このスピリットがこのターンに相手のライフを減らせる合計の上限（アタック・効果の両方。lifeDealtThisTurn と比べる。26RBS03-079）
    lifeDamageNegatedFor?: PlayerId // 期間つき効果の一覧（noLifeDamage）から作り直す写し。守られるプレイヤー＝記録を出した側
    coresLinkedTo?: string // このネクサスのコア数を、リンク元スピリット（instanceId）のコア数と同じものとして扱う
    // （クロスシザース。本来は再指定まで永続だが、このターンの間だけの簡略化。ターン終了でリセット）
    coresOverride?: number // coresLinkedTo設定時、EffectModules.refreshLevelAsOverridesがリンク元スピリットの
    // 現在コア数から毎回同期する。currentLevelはこの値をcoresの代わりに使う（ターン終了でリセット）
    namesAsContinuous?: string[] // 継続的な「カード名に〜が入っているものとして扱う」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（BS02アルカナプリンス・オベロ／BS03アルカナプリンセス・アン）
    colorsAsContinuous?: Color[] // 継続的な「〜の色としても扱う」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（百面相のフラットフェイス／妖精ティングリー）
    symbolsForSummonReduction?: Color[] // 「スピリット召喚の軽減計算のあいだだけ」置き換わるシンボル（kind:"symbolFix" の summonReductionOnly。countSymbols が forSummon のときだけ読む。BS11-039 天使ティアエル）
    symbolsOverrideContinuous?: Color[] // 継続的な「シンボルを◯個に固定する」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（kind:"symbolFix"）。instanceSymbolCount / countSymbols が、カード静的なsymbolの代わりにこちらを見る（BS08海底に眠りし古代都市）
    symbolsAddedContinuous?: Color[] // 継続的な「シンボルを追加する」（kind:"symbolAddGrant"。BS12初出）。symbolsOverrideContinuousと異なり**加算**で、固定値が有る個体でも固定値+追加分になる。instanceSymbolCount / countSymbols の両方がこの配列の長さぶんを加算する
    extraSymbolsPermanent?: Color[] // 永続的に蓄積する「シンボルを追加する」（kind:"addSymbolPermanent"。BS13初出）。symbolsAddedContinuousと違い継続付与の再計算では消えず、トリガーのたびに加算されたまま残る。instanceSymbolCount / countSymbols の両方がこの配列の長さぶんを加算する（BS13-003カメレオプス）
    alsoCostsWhenDestroyed?: number[] // 「破壊されたとき、このコストとしても扱う」値（kind:"alsoCostGrant" の whenDestroyedOnly。【不死】の引き金コスト判定だけが読む。BS11-064 闇の聖剣Lv1）
    alsoCostsContinuous?: number[] // 継続付与された「このコストとしても扱う」値（kind:"alsoCostGrant"。EffectModules.refreshLevelAsOverridesが毎回全消去→再構築し、instHasCost / instMatchesCostFilter が参照する。道化師クラン）
    lentChoiceFamily?: string // 貸与（lendSelfThisTurn 相当）の際にプレイヤーが選んだ系統。仮想発生源にのみ載り、kind:"familyGrant" の familyFromChoice が読む（音鳥クルーク）
    lentChoiceInstanceId?: string // 貸与（targetChoiceLendThisTurn）の際にプレイヤーが選んだ対象インスタンスID（陣営を問わない）。仮想発生源にのみ載り、kind:"vanillaAsGrant"/"spiritEffectsDisabledGrant" のtarget:"chosenInstance"が読む（BS12-081メロディアスハープ）
    levelAsEffectsOnly?: true // levelAsContinuous による置き換えが**効果の発揮判定にだけ効く**目印（kind:"levelAs" の effectsOnly）。
    // 立っていると shared/rules.ts の displayLevel（表示・他カードから見えるレベル）はこの置き換えを無視する。
    // BS03ウッド・ゴレム「相手のネクサスすべてのLv2効果は発揮されない」＝Lv1にするわけではない
    lentBuffTargetId?: string // 同じマジックの**直前の効果でBP増加した相手**のinstanceId。仮想発生源にのみ載り、
    // kind:"battleWon" の winnerIsLentBuffTarget が読む。効果文が「**そのスピリットが**、BPを比べ〜したとき」と
    // 前の文を指しているカード用（BS07ニードルショット）。GameState.lastBpBuffTargetId 経由で受け取る
    kyoshuUsed?: { turn: number; count: number } // 【強襲】をこのターン何回使ったか（turnがstate.turnと一致する間だけ有効。BS07）
    timedSymbolsAdded?: Color[] // このターンの間の色指定の追加シンボル（timedExtraSymbols と同じく写し。symbolAdd.color）
    timedExtraSymbols?: number // このターンの間の追加シンボル数（一覧 timedEffects から refreshLevelAsOverrides だけが作り直す写し。直接書かない）
    lifeDealtThisTurn?: number // このスピリットがこのターンに与えたライフダメージの累計（globalConstraint "ownLifeDamageCapPerSourcePerTurn" 用。ライフダメージ解決時に加算し、ターン終了でリセット。SD06-010）
    // （ブロック時には発揮しない。ターン終了でリセット。fireTriggerが参照。GameState の同名フラグは両陣営全体版で、こちらは個体単位。BS07マクラーンスラッシュ）
    heavyArmorColorsGranted?: Color[] // 【重装甲】の対象色のうち、**毎回算出が要るもの**（合体中のブレイヴが持つ静的【重装甲】のホストへの反映と、colorsFrom:"selfColors"＝【重装甲：可変】）。
    // armorColorsGranted と同じくEffectModules.refreshLevelAsOverridesが毎回全消去→再構築し、hasHeavyArmorAgainstが参照する。
    // ⚠️ 静的な【重装甲：紫】等はカードのeffectsから直接読むのでここには入らない
    armorColorsGranted?: Color[] // 継続付与された装甲の対象色（kind:"keywordGrant"のkeyword:"armor"。
    // EffectModules.refreshLevelAsOverridesが毎回全消去→再構築する。hasArmorAgainstが参照する（BS05白夜の虚空Lv2）
    braveImmuneAll?: true // kind:"braveImmuneGrant"のscope:"all"分。相手のブレイヴの効果を色不問で受けない。EffectModules.refreshLevelAsOverridesが毎回全消去→再構築し、shared/rules.hasBraveImmuneAgainstが参照する（BS12-028セイルフィッシュLv2）
    braveImmuneMatchArmorColors?: true // kind:"braveImmuneGrant"のscope:"matchArmorColors"分。自身が持つ【装甲】の色と一致する相手のブレイヴの効果だけ受けない（BS12-067月光集める塔Lv2）
    grantedMagicNegate?: Extract<EffectDef, { kind: "magicNegate" }>[] // kind:"effectEntryGrant"で継続付与されたmagicNegateエントリ。EffectModules.refreshLevelAsOverridesが毎回全消去→再構築し、triggers.findMagicNegateSourceがcard自身のeffectsと合わせて走査する（BS12-068光の聖剣Lv1）
    timedSymbolLoss?: Color[] // このターンの間、指定色のシンボルを1つ失う（一覧 timedEffects から refreshLevelAsOverrides だけが作り直す写し。直接書かない）。その色のシンボルを持たなければ無変化
    returnToDeckBottomAtEndStep?: boolean // このスピリットはエンドステップに持ち主のデッキの下へ戻る
    // （action:"reveal" の returnToDeckBottomAtEndStep が立てる。PhaseManager.endTurn がステップ誘発の直後に処理する）
    treatedAsVanillaContinuous?: boolean // 継続付与された「カードに効果の記述を持たないスピリットとしても扱う」（kind:"vanillaAsGrant"）。
    // EffectModules.refreshLevelAsOverrides が毎回全消去→再構築し、instIsVanilla が参照する（BS04スイッチヒッター）
    effectsDisabledContinuous?: boolean // このスピリットが持つ効果すべてを発揮させない（kind:"spiritEffectsDisabledGrant"）。
    // EffectModules.refreshLevelAsOverrides が毎回全消去→再構築し、shared/rules の effectSources・activeConstraints・
    // spiritHasKeyword と EffectModules.fireTrigger が参照する（BS07ルナースラッシュ）
    asSpiritThisTurn?: { cost: number; family: string[]; levels: LevelDef[] }
    // このターンの間だけ「スピリットとして扱われている」ネクサスに載る上書き（action:"treatOwnNexusesAsSpiritsThisTurn"。BS03ゴーレムクラフト）。
    // **付くのは field.nexuses から field.spirits へ移されたネクサスのインスタンスだけ**で、ターン終了時に元へ戻す目印も兼ねる。
    // スピリットの器（アタック・ブロック・BP比較・体数カウント・対象選択）は field.spirits に入れるだけで全部手に入るので、
    // ここが担うのは「カードの静的な値では出せないぶん」だけ:
    //   - currentLevel / instMinLevelCores が master.levels の代わりに levels を見る（ネクサスのLv1コアは全カード0のため、
    //     これが無いとコア0になっても消滅しない）
    //   - instHasCost / instAllCosts が cost を、spiritHasFamily が family を追加で見る
    //   - instEffectsSuppressed が true を返す（＝「ネクサスとしての効果を失い」。effectSources・activeConstraints・
    //     spiritHasKeyword・fireTrigger の4か所が発揮を止める）／instIsVanilla も true（＝「効果の記述なし」）
    // シンボルは上書きしない（効果文が触れていないため、ネクサス本来のシンボルのまま）
    asSpiritBattleScoped?: true // 上の印と併せて付く。戻すのがステップの終わりではなくバトルの終わり（clearBattle。「このバトル中スピリットとして扱う」26RBS02-092）
    asSpiritAttackStepScoped?: true // 器BJ：上のasSpiritThisTurnの上書きが**そのステップの終わりに**戻される対象であることを示す目印（アルゴ・ゴレムはアタックステップ。「このステップ中スピリットとして扱う」もこれを使い、どのステップでも endStepScoped が戻す）
    // （kind:"nexusAsSpiritDuringAttackStep"。BS13-048古代戦艦アルゴ・ゴレムLv2）。中身はasSpiritThisTurnと同型の
    // 上書きをそのまま流用する（instBaseCost/instFamilies/instLevels/instEffectsSuppressed/instIsVanillaは
    // asSpiritThisTurnの有無だけを見るのでそのまま効く）。戻すタイミングだけがこのフラグの有無で分岐する:
    // PhaseManager.applyAttackStepNexusAsSpirit/revertAttackStepNexusAsSpiritがアタックステップの開始/終了で
    // これが付いた個体だけを移す・戻す（付いていないasSpiritThisTurn＝通常のターン限定はPhaseManager.endTurnの
    // 既存ループがターン終了時に戻す。両方が同時に立つことはない＝変換時にasSpiritThisTurn未設定のネクサスだけを対象にする）
    braveStatsAsContinuous?: { cost: number; family: string[]; braveLevels: LevelDef[] }
    // 継続的な「スピリット状態のブレイヴのステータスを◯として扱う」上書き（kind:"braveStatsAs"）。
    // asSpiritThisTurn と同型（cost/family/レベル表を差し替える）だが**別のフィールド**にしてある:
    // instEffectsSuppressed は asSpiritThisTurn !== undefined を「効果無効」の判定に使っており、
    // asSpiritThisTurn を流用すると「そのブレイヴが元から持つ効果は残す」という確定事項
    // （BRAVE.md §12.7）に反してしまう。**instEffectsSuppressed には足さないこと**。
    // EffectModules.refreshLevelAsOverrides が毎回全消去→再構築する。
    // shared/rules.ts の instBaseCost / instFamilies / instLevels が asSpiritThisTurn より先にこちらを見る
    noRefreshTargetInstanceId?: string // このスピリットが「回復できない」と指定した**相手**スピリットのinstanceId（action:"markNoRefreshTarget"）。
    // このスピリット自身が疲労状態でフィールドにいる間だけ効く（EffectModules.isRefreshBlockedByMark が判定。スクルディア）。
    // 疲労し直すたびに上書きされる。指定先が場を離れても残るが、instanceId が一致しなくなるだけで無害
    braveCombined?: true
    // **合体中のブレイヴ側**に載る目印（docs/design/BRAVE.md §4）。
    // EffectModules.refreshLevelAsOverrides が毎回全消去→再構築し、あわせて coresOverride に
    // **ホストのコア数**を写す。この2つで shared/rules の instLevels が合体状態のレベル表
    // （CardData.braveLevels）を返し、currentLevel がホストのコア数で正しいレベルを出す。
    // ⚠️ ここを素の levels のままにすると、合体中のブレイヴはコア0なので **Lv0 になり、
    // 【合体中】効果が無言で発火しない**（TURN_EFFECT_SOURCES.md §3.3 と同型の事故）
    braveComposite?: { cost: number; colors: Color[]; symbols: Color[] }
    // **合体しているブレイヴがホストへ足すぶん**（docs/design/BRAVE.md §3）。
    // EffectModules.refreshLevelAsOverrides が毎回全消去→再構築する（他の継続上書きと同じ扱い）。
    // ここに入るのは**レベルに依らない値だけ**：コスト・色・シンボル。
    // 「合体時BP+」はホストのコア数で変わる（合体状態のレベル表を引く）ので**ここには入れない**。
    // BP は shared/rules.ts の effectiveBp が board から実体を引いてその場で足す
    braveRefs?: { slot: "left" | "right" | "single"; instanceId: string }[]
    // **合体しているブレイヴへの参照**（ホスト側に載る。docs/design/BRAVE.md §2.3）。実体は field.combinedBraves にあり、
    // ここは instanceId で指すだけ。通常のブレイヴは slot:"single" の1本。異魔神ブレイヴ（1枚がスピリット2体に合体）は
    // **実体1つ・参照2本**になるので、入れ子（host.braves）にせず参照方式にしてある（§11.2）
}

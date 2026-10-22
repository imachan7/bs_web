// 場全体に掛かる制約 GlobalConstraintDef（kind:"globalConstraint" の constraint の種類）
import type { EffectAction } from "./effectAction";
import { Phase, Color, CardType, FamilyFilter, TriggerEvent, Keyword } from "../type";

// kind: "constraint" は発生源自身への制約だが、こちらは発生源の持ち主に関係なく両陣営のスピリット／ネクサスすべてに効く
// （RuleValidator.hasGlobalConstraint 経由）。片側限定の型は「発生源の持ち主」「相手」と明記してある。
export type GlobalConstraintDef =
    | { type: "singleCoreCantAct" } // コア1個のスピリットはアタックもブロックもできない（両陣営）
    | { type: "singleCoreCantAttack" } // アタックのみ不可（ブロックは可。両陣営）
    | { type: "opponentCantAttackByCost"; costs: number[] } // 発生源の持ち主から見た相手のスピリットのうち、コストが配列のいずれかと一致するものはアタック不可（ブロックは可。片側限定）
    | { type: "opponentCantAttackByCores"; cores: number } // コア数がちょうどこの数の相手のスピリットはアタック不可（ブロックは可）
    | { type: "cantAttackByCost"; costs: number[] } // opponentCantAttackByCost の両陣営版
    | { type: "cantBlockByCost"; costs: number[] } // cantAttackByCost のブロック版（両陣営）
    | { type: "allSpiritsCantBounce" } // 両陣営とも、あらゆる原因でスピリットがフィールドから手札に戻らない（markBounce が冒頭で止める＝戻すはずのスピリットは場に残る）。phase/turn と組み合わせて使う
    | { type: "noLifeDamageByCost"; maxCost?: number; costs?: number[]; keywordExclude?: Keyword; maxBp?: number; symbolCount?: number; combinedOnly?: true; ownOnly?: true; attackerLevel?: number; attackerCores?: number } // 既定は、コストが maxCost 以下のスピリットのアタックでお互いのライフが減らない（両陣営）。costs＝maxCost の代わりにコスト完全一致。keywordExclude＝そのキーワードを持つアタッカーは保護しない。maxBp＝実効BPで縛る。symbolCount+combinedOnly＝シンボル数ちょうどかつ合体スピリットのアタックでのみ保護（maxCost 等とは併用しない）。symbolCount のみ＝シンボル数ちょうど一致のアタックのみ保護。ownOnly＝発生源の持ち主だけを守る。attackerLevel＝maxCost と両方満たすときだけ保護（AND）
    | { type: "opponentNexusesUnexhaustable"; phase?: Phase } // 発生源の持ち主から見た相手のネクサスは疲労させられない（【強襲】の疲労元等も止める）。phase 指定時はそのステップ中のみ
    | { type: "cantReduceOpponentLifeWhileSelfRefreshed" } // 発生源が回復状態の間、発生源の持ち主は相手のライフを減らせない（片側のみ。2026-09-02 ユーザー確認で「文面どおり」）
    | { type: "noDrawInMain" } // 両陣営とも、メインステップの間はドローできない
    | { type: "noHandDiscardInMain" } // 両陣営とも、メインステップの間は手札を破棄できない（判定は shared/rules.ts の canDiscardHand。コストとしての破棄も止まる＝COST_MODEL.md §1）
    | { type: "noDeckMillInMain" } // 両陣営とも、メインステップの間はデッキが破棄されない（自分の効果によるものも止める＝noDeckMillByOpponent と異なり陣営を問わない）
    | { type: "noRefreshByNexusOrMagic" } // 両陣営のスピリットは、ネクサス/マジックの効果では回復しない（スピリットの効果とリフレッシュステップは通る）
    | { type: "noRefreshByAnyEffect" } // 両陣営とも、疲労状態のスピリットは効果（種別を問わず）では回復しない（リフレッシュステップだけが通る）
    | { type: "noHandDiscardByEffect" } // 両陣営とも、効果では手札を破棄できない（canDiscardHand の関門で止める＝「手札を破棄することで」のコストも払えなくなる。破棄する効果自体は発揮するが1枚も破棄されない）
    | { type: "noHandGainByEffect" } // 両陣営とも、効果（draw／returnToHand によるスピリットの手札戻し）では手札が増えない（ドロー・バウンス自体が発揮されない＝バウンスされるはずのスピリットは場に残る。ドロー枚数を増やす継続効果自体は止めない）
    | { type: "burstAltEventFromOpponentSummon" } // 発生源の持ち主だけ：バースト条件が opponentSummonEffectResolved のバーストは ownLifeDamaged でも発動できる（triggers.ts のバースト走査が通常の event 一致に加えてこの読み替えを見る）
    | { type: "refreshOnlyOneUncombined" } // 両陣営とも、リフレッシュステップで合体していないスピリットは1体しか回復できない（どれかはそのステップのプレイヤーが選ぶ）
    | { type: "nexusesCantRefresh" } // 両陣営とも、リフレッシュステップでネクサスは回復しない
    | { type: "opponentCombinedCantRefresh" } // 発生源の持ち主から見た相手の合体スピリットは、リフレッシュステップで回復しない（片側のみ）
    | { type: "opponentCantSpiritStateBrave" } // 発生源の持ち主から見た相手は、ブレイヴをスピリット状態にできない（片側のみ）。止めるのは3経路：メインステップの任意分離／場を離れるときの「残す」／ブレイヴ単体（合体先なし）の召喚
    | { type: "ownLifeDamageToTrashByKeyword"; keyword: Keyword } // 発生源の持ち主の、指定キーワードを持つスピリットのアタックで減る相手のライフのコアは、リザーブでなく相手のトラッシュに置かれる（battleResolve のライフ受けが見る）
    | { type: "noBpCompareDestroy" } // 両陣営のスピリットはBP比べでは破壊されない（バトル自体は成立し、効果による破壊は通常どおり）
    | { type: "nexusIndestructible" } // すべてのネクサスは破壊されない（両陣営）
    | { type: "braveBpBonusZero" } // 両陣営の合体スピリットの「合体時BP+」（braveBpBonus）を0にする。ブレイヴ自体のLv判定は変えない＝加算値だけ無視する。主語が無いので両陣営が対象
    | { type: "lifeDamagePerSpiritPerTurn"; max: number } // 両陣営とも、スピリット1体がそのターンに減らせるライフの合計は max まで（アタック・効果を合算。CardInstance.lifeDealtThisTurn で判定。ownLifeDamageCapPerSourcePerTurn と同じ記録だが、こちらは発生源の陣営を問わずお互いに効く）。effect.whileOwnBurstSet で絞れる。shared/rules.lifeDamagePerSpiritRemaining
    | { type: "ownLifeDamageCapPerSourcePerTurn"; max: number } // 発生源の持ち主だけを守る片側型。相手のスピリット1体（アタッカー個体）ごとのターン累計で max までしか減らされない（1回のアタックで max 個ずつの capLifeDamageThisTurn とは別物）。ターン終了でリセット。shared/rules.ownLifeDamageCapRemaining
    | { type: "ownLifeFloor"; floor: number; costSelfToTrash?: true; then?: EffectAction } // 発生源の持ち主だけのライフは floor を下回らない（片側のみ。condition:{ownFamilyCountAtLeast} と組み合わせて使う）。
    // costSelfToTrash 指定時：ライフが実際に0になる瞬間だけ発揮する任意コスト版（tryOwnLifeFloorByCost が life<=0 判定の直後で処理）。
    // 発生源自身を持ち主のトラッシュへ置くことで floor を適用する。払わなければ即敗北で、払わない理由が無いため、
    // 対話確認を省いて自動で支払う簡略化（COST_MODEL.md）。then 指定時は支払い成立後にそのアクションを1回発揮する

    | { type: "ownLifeImmuneToSpiritEffects" } // 発生源の持ち主だけ：相手のスピリットの効果（lifeCrush 系）ではライフが減らない。バトルの攻撃ダメージは含まない（negateLifeDamageFromTarget が別途カバー）。shared/rules.ownLifeImmuneToOpponentSpiritEffects
    | { type: "attackOncePerTurnBySymbolCount"; symbolCount: number } // 両陣営とも、シンボル数がちょうど symbolCount のスピリットはターンに1回しかアタックできない（CardInstance.attackedThisTurn で判定。RuleValidator.validateAttack）
    | { type: "attackOncePerTurnTotalByCost"; maxCost: number } // attackOncePerTurnByCost の合計版：コストが maxCost 以下のスピリットは、そのプレイヤーの該当スピリット全体でターンに合計1回しかアタックできない（PlayerState.minAttackCostThisTurn で判定。両陣営それぞれ。2026-10-11 ユーザー指示の解釈）
    | { type: "attackOncePerTurnByCost"; maxCost: number } // attackOncePerTurnBySymbolCount のコスト版（両陣営。instHasCost で判定＝付与コストも見る）
    | { type: "ownNexusIndestructible"; colors?: Color[]; nameIncludes?: string; sourceColors?: Color[]; sourceTypes?: CardType[] } // 発生源の持ち主のネクサスは、相手の効果によって破壊されない。colors＝そのいずれかの色のネクサスだけ守る。nameIncludes＝カード名にこの文字列を含むネクサスだけ守る（対象が分からないときは守らない側に倒す）。
    // sourceColors / sourceTypes 指定時は、破壊しようとしている効果の発生源をさらに絞る。
    // どちらかを指定した場合は DestroyContext が要り、発生源が不明なときは守らない側に倒す（colors と同じ方針）。
    // 「相手の」を明示している効果なので、指定時は sourcePid が持ち主と異なることも求める
      // （hasGlobalConstraint の両陣営走査とは異なり、destroyNexus が破壊対象ネクサスの持ち主のフィールドのみを判定する）
    | { type: "maxSpiritsOnField"; max: number } // 両陣営とも、フィールドのスピリットが max 体以上のときは召喚できない（メインステップの通常召喚のみ）
    | { type: "levelCantAct"; levels: number[] } // currentLevel がこのリストに含まれるスピリットは、アタックもブロックもできない（両陣営）
    | { type: "costCantAct"; maxCost?: number; costs?: number[] } // コストが maxCost 以下のスピリットは、アタックもブロックもできない（両陣営。shared/rules.ts の costCantAct が参照）。costs＝maxCost の代わりに完全一致するコストのみ対象
    | { type: "millCap"; maxCount: number; perTurn?: boolean; mutual?: true; bothSides?: true } // 発生源の持ち主のデッキは、相手の効果によるミルで maxCount 枚を超えて破棄されない
      // （発生源の持ち主のみに効く。EffectModules.millCapFor が effectSources 経由で判定＝lendSelfThisTurn で貸与可。
      // perTurn 省略時は1回のミルにつき maxCount 枚まで。perTurn:true はターン累計（GameState.millCountThisTurn）
      // mutual 指定時は「相手の効果によるミルだけ」という既定を外れ、お互いのデッキを発生源の持ち主自身の効果によるミルも含めて
      // maxCount 枚（perTurn 前提）まで守る（GameState.millCountThisTurnMutual。EffectModules.mutualMillCapRemainingFor が両陣営の effectSources を見る）
      // bothSides 指定時は、mutual と違い自分の効果によるミルは含めない（相手の効果によるミルだけを見る既定判定のまま）。
      // 発生源がどちらの陣営にあっても、発生源の持ち主から見た相手と、発生源の持ち主自身のデッキの両方を同じ maxCount で守る。
      // millCapPerTurnRemaining が perTurn とあわせて両陣営の effectSources を走査する
    | { type: "battlingCoresProtected" } // 現在バトルをしている両陣営のスピリット上のコアは、効果（コア除去アクション）によって取り除かれない
    | { type: "battlingEffectImmune" } // 現在バトルをしている両陣営のスピリットは、お互いのスピリット/マジックの効果を受けない（ネクサスの効果は通る。EffectModules.isEffectBlocked が参照）
    | { type: "coresToOpponentReserveGoToTrash" } // 発生源の持ち主から見た相手のリザーブへ、スピリット/ブレイヴ/マジックの効果で置かれるコアはその相手のトラッシュへ振り替えられる（両陣営の発生源が効く＝主語なし）。ネクサスの効果・ルール処理は対象外。removeCores〈removal.ts〉の共通フックで判定
      // （removeCores/removeCoresToTrash/removeCoresToVoid の共通フックで判定。coreSqueezeAll/One・coreDrainAllOthers・coreToVoidOwn など
      // 直接コアを操作する一部アクションはこの経路を通らないため対象外＝簡略化）
    | { type: "noTrashRecovery" } // お互い、トラッシュからカードを手札に戻せない（recoverSpiritFromTrash / recoverMagicFromTrash / recoverAllMagicFromTrashByColorChoice の各ハンドラ冒頭で判定）
    | { type: "noOpponentTriggerByColor"; color?: Color; triggers: TriggerEvent[]; bothSides?: true } // 発生源の持ち主から見た相手の、指定色のスピリットの、指定した『〇〇時』効果は発揮されない（color 省略時は色を問わない）。bothSides 指定時は「相手」限定を外し、発生源の持ち主自身のスピリットも含めて両陣営が対象（主語の無い効果文＝CONJUNCTION.md／SEMANTICS_AUDIT.md §3.17の既存規則）
    // （noSummonTriggerByCost と違い両陣営ではなく片側だけ）。
    // ⚠️ 封じられるのは『』でカテゴライズされた効果＝`kind:"triggered"` だけで、
    // ネクサス等の常在効果による「破壊されたときフィールドに残る」（`kind:"reviveOnDestroy"`）は封じられない
    // （2026-08-16 ユーザー確認。docs/design/CONJUNCTION.md「効果ブロック（『』）の範囲」）。
    // fireTrigger の入口で判定するため、この2つが自然に分かれる
    | { type: "opponentMagicCostIncrease"; amount: number } // 発生源の持ち主の相手は、マジックの効果を使用するとき amount コスト余分に支払う。
    // opponentSummonCostIncrease のマジック版。shared/cost.ts の effectiveCost が読む
    | { type: "opponentSummonCostIncrease"; amount: number; maxCost?: number; keywordExclude?: Keyword } // 発生源の持ち主の相手は、
    // 条件を満たすスピリットカードを召喚するときコストを amount だけ余分に支払う
    // （maxCost＝カード記載コストがこれ以下のもの限定／keywordExclude＝そのキーワードを持たないもの限定）
    | { type: "noSummonTriggerByCost"; maxCost?: number; side?: "opponent" } // お互い、コストが maxCost 以下のスピリットの『このスピリットの召喚時』効果は発揮されない（召喚時トリガーの発火直前に判定して落とす）。maxCost 省略時はコストを問わずすべて。エントリの phase / turn を書けばその区間だけ有効。side:"opponent" 指定時は発生源の持ち主から見た相手のスピリット/ブレイヴだけが対象（既定は両陣営）
    | { type: "coreGainCap"; max: number; sourceTypes: ("spirit" | "brave" | "nexus")[]; from: ("void" | "trash")[]; to: ("life" | "field" | "reserve")[]; side?: "opponent" | "both" } // side:"both" で発生源の持ち主にも掛かる（省略時は相手だけ）。max:0 はコアが1個も増えない（ボイド→ライフも対象。2026-10-23確認）。発生源の持ち主の相手が、sourceTypes の効果で自分の from から自分の to へ置くコアは、ターンに合計 max 個まで（coreGainCap.ts。置けたぶんだけ置く）
    | { type: "noVoidToLife" } // お互い、ボイドからライフにコアを置けない（placeCores の void→life を落とす。【聖命】も止まる）
    | { type: "noReductionBySummonCost"; maxCost: number } // お互い、コストが maxCost 以下のスピリットカードを召喚するとき、軽減シンボルによるコスト軽減ができない（カード静的なコスト＝軽減前の値で判定）
    | { type: "bp0DestroyedToDeckBottom"; maxCost: number } // 発生源の持ち主の相手のスピリットが、破壊直前の実効BPが0でコストが maxCost 以下のまま破壊されたとき、トラッシュに置くかわりに持ち主のデッキの下へ戻す（commitPendingDestruction が読む）。複数体の「好きな順」は選ばせず破壊順
    | { type: "coreFloorWhileBlockingKeyword"; keyword: Keyword; floor: number } // 発生源の持ち主の、keyword を持つスピリットをブロックしている相手のスピリット上のコアは、効果で floor 個より少なくならない（コアの動かし方を問わない。coreFloorFor が読む）
    | { type: "coreFloorOwnNamedByOpponent"; nameContains: string; floor: number } // 発生源自身と、持ち主のカード名に nameContains を含むスピリットのコアは、相手の効果では floor 個より少なくならない（actorPid が相手のときだけ床を張る。coreFloorFor が読む）
    | { type: "coreFloorByCost"; ownOnly?: true; colorFilter?: Color; byOpponentOnly?: true } // 両陣営のスピリット上のコアは、効果によってそのカードのコスト（Lv1コスト）を下回るまで取り除けない。「Lv1コスト」＝Lv1に必要なコア数（レベル表の表記。2026-08-14 ユーザー確認）。ownOnly＝発生源の持ち主のスピリットだけ。colorFilter＝この色のスピリットだけ。removeCores/removeCoresToTrash/removeCoresToVoid の共通処理で判定し、コアの動かし方を問わず効く＝移動（moveCoresLeavingOne）と入れ替え（swapOpponentCores）も下限を割れない。入れ替えは同時の1つの動きなので、割るときは入れ替え自体を行わない（2026-08-24 ユーザー確認）
    | { type: "coresCantBeRemovedByOpponent"; nameContains: string } // 発生源の持ち主の、カード名に nameContains を含むスピリット上のコアは、相手のスピリット/ブレイヴ/マジックの効果では取り除けない（coresCantBeRemoved と違い片側限定。判定は boardResistanceAgainst の coreRemove 経路）
    | { type: "coresCantBeRemovedAll"; side: "opponent" | "both"; exceptOwnerEffects?: true } // coresCantBeRemoved（自身のコアだけ）を広げたフィールド全体版。side:"opponent"＝発生源から見た相手のスピリットのコアだけ、"both"＝両陣営すべて。exceptOwnerEffects 指定時は持ち主自身の効果・操作（自分のコストの支払いも含む）は例外で通す。未指定時は持ち主自身も含めて完全に止める（自分のコストも払えない）。「【転召】以外」の例外は dumpAllCoresTensho がこのチェックを経由しないため自動的に満たされる。phase/turn で区間を絞れる
    | { type: "summonExhausted"; self?: true; cardTypes?: CardType[]; familyExclude?: FamilyFilter; costFilter?: { max?: number; min?: number } } // お互い、条件を満たすカードを召喚するとき、疲労状態で召喚する。ダイレクトブレイヴでは合体先のスピリットが疲労する（BS13_PLAN.md §1 #14）。「疲労する」であって「疲労状態になる」ではないため ownSpiritExhausted は発火せず、【装甲】等の耐性でも防げない（同 #24）。phase で「メインステップ」に絞る＝神速による召喚は対象外
    | { type: "handImmuneForPid"; includeNexus?: true } // 発生源の持ち主の手札は、相手のスピリット/ブレイヴ/マジックの効果を受けない（ネクサスの効果は防がない＝効果文に列挙が無いため意図的。EffectModules.handImmuneFor が判定し、discardOpponent 等の手札を対象に取る処理の冒頭で弾く）。includeNexus 指定時はネクサスの効果も防ぐ
    | { type: "noDeckMillByOpponent"; whileSourceDeployedTurnOnly?: true } // 相手の効果では、この発生源の持ち主のデッキは破棄されない（millDeck の冒頭で判定。両陣営ではなく持ち主だけを守る＝millCap と同じ向き。自分自身の効果・コスト支払いによる破棄は止めない）。whileSourceDeployedTurnOnly 指定時は、発生源がこのターンに場へ出た（summonedTurn === state.turn）ときのみ有効
    | { type: "noDrawOutsideDrawStep" } // お互い、ドローステップ以外でドローできない（GameState.draw の共通経路冒頭で判定。ドローステップ自身は fromDrawStep 引数で除外）
    | { type: "summonLimitByCostForOpponent"; maxCost: number; limit: number } // 発生源の持ち主から見た相手は、コストが maxCost 以下のスピリットをターンに limit 体までしか召喚できない（RuleValidator.validateSummon が、相手フィールドの CardInstance.summonedTurn で自分のこのターンの該当召喚数を数えて判定。神速召喚も対象）
    | { type: "summonLimitByEffectForOpponent"; limit: number } // summonLimitByCostForOpponent の兄弟：コストでなく効果の記述を持つ（isVanillaCard が false）スピリットカードでターンに limit 体までしか召喚できない
    | { type: "voidCoreBlockedOutsideCoreStep" } // お互い、コアステップ以外でボイドからフィールド/リザーブにコアを置けない（ライフ・トラッシュへは対象外）。
    // ボイドから直接置く各アクションが冒頭で EffectModules.voidCorePlacementBlocked を呼ぶ（コアステップ自身の `player.reserve += 1` はガード不要）
    | { type: "noSummonByEffect" } // お互い、スピリット/ブレイヴ/ネクサス/マジックの効果でスピリット/ブレイヴを召喚できない（通常の doSummon 経由は対象外。主語なし）。
    // エントリの phase を書けばその区間だけ有効。summonByEffectBlocked が判定し、
    // summonFreeFromHandIndex/summonFreeFromTrashIndex/summonRevealedFree（効果による召喚の共通経路）の冒頭で弾く
    | { type: "attackPayToll"; count: number; attackerLevel: number; noStack?: true } // 発生源の持ち主から見た相手の、現在のLvが attackerLevel のスピリットがアタックするとき、持ち主のリザーブのコア count 個をトラッシュに置かなければアタックできない（払えるかぎり自動で払う。コスト支払いのうちリザーブからだけ払う簡略化）。noStack＝〔重複不可〕：同じカード名の発生源は何枚あっても1回分
    | { type: "attackRequiresCoreToll"; maxCost: number } // 両陣営とも、コストが maxCost 以下のスピリットがアタックするとき、持ち主のリザーブのコア1個を持ち主のトラッシュに置かなければアタックできない（リザーブが空ならアタック不可＝validateAttack が弾く）。払えるかぎり自動で払う（GameEngine.doAttack が宣言成立時に移す）。「断ればアタックしない」はクライアント側で表現する（public/src/main.ts の confirmExtraCost が send() 直前に確認をはさむ）。2026-09-10 ユーザー確認
    | { type: "opponentCantReturnFromTrashToHand" } // 発生源の持ち主から見た相手は、トラッシュからカードを手札に戻せない（noTrashRecovery〈両陣営〉の片側版）。トラッシュ→手札の経路の各ハンドラ冒頭が共通ヘルパーで一括して弾く
    | { type: "cantAttackIfFewOwnSpirits"; atMost: number }

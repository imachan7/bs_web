// 場全体に掛かる制約 GlobalConstraintDef（kind:"globalConstraint" の constraint の種類）
import type { EffectAction } from "./effectAction";
import { Phase, Color, CardType, FamilyFilter, TriggerEvent, Keyword } from "../type";

// フィールド全体制約の定義（kind: "globalConstraint" が参照する宣言的ルール）。
// kind: "constraint" は「発生源自身」への制約だが、こちらは発生源の持ち主に関係なく
// 両陣営のスピリット／ネクサスすべてに効く（RuleValidator.hasGlobalConstraint 経由で参照）。
export type GlobalConstraintDef =
    | { type: "singleCoreCantAct" } // コア1個しか置いていないスピリットは、アタックとブロックができない（両陣営。魔帝の墓標）
    | { type: "singleCoreCantAttack" } // コア1個しか置いていないスピリットは、アタックができない（ブロックは可能。singleCoreCantActのアタック限定版。両陣営。BS08赤き砂の座）
    | { type: "opponentCantAttackByCost"; costs: number[] } // **発生源の持ち主から見た相手**のスピリットのうち、コストが配列のいずれかと完全一致するものはアタックできない（ブロックは可能。片側限定＝costCantActの「両陣営・アタックもブロックも不可」とは別枠。BS12-X05戦神乙女ヴィエルジェ：コスト2/3/5/7/11）
    | { type: "opponentCantAttackByCores"; cores: number } // opponentCantAttackByCost のコア数版：発生源の持ち主から見た相手のスピリットのうち、コアがちょうどこの数のものはアタックできない（ブロックは可能。phase/turn は同じ。26RBS02-077）
    | { type: "cantAttackByCost"; costs: number[] } // 器AW：opponentCantAttackByCostの**両陣営版**。コストが配列のいずれかと完全一致するスピリットは、持ち主を問わずアタックできない（ブロックは可能。BS13-035オリンピアの天使オク：コスト0/1/4）
    | { type: "cantBlockByCost"; costs: number[] } // cantAttackByCost のブロック版（両陣営）
    | { type: "allSpiritsCantBounce" } // 器BS16：両陣営とも、あらゆる原因（効果・コスト支払い等）でスピリットが**フィールドから手札に戻らない**（markBounceが冒頭で止める＝戻すはずのスピリットは場に残る）。kind:"globalConstraint"のphase/turnフィールドと組み合わせて使う（allSpiritsCantBounceActiveが判定。BS16-012金狐角：「Lv1･Lv2･Lv3『自分のアタックステップ』スピリットすべては、フィールドから手札に戻らない」＝主語なしでお互いに効く）
    | { type: "noLifeDamageByCost"; maxCost?: number; costs?: number[]; keywordExclude?: Keyword; maxBp?: number; symbolCount?: number; combinedOnly?: true; ownOnly?: true; attackerLevel?: number } // symbolCount+combinedOnly指定時は「シンボル数がsymbolCountちょうど、かつ合体スピリット」のアタックでのみ保護する（両条件を優先し、maxCost等とは併用しない。BS12-020一番槍のシベルザ：「シンボル2つを持つ合体スピリットのアタックでは」） // maxBp指定時は実効BPがこれ以下のスピリットのアタックで判定する（コストでなくBPで縛る形。BS09-031守護巨獣ガラパーゾ＝BP3000以下）。// コストがmaxCost以下のスピリットのアタックでは、お互いのライフは減らされない（両陣営。BS07の「勇傑」各色に共通）。costs指定時はmaxCostの代わりに**コスト完全一致**（配列＝いずれかに一致。instAllCostsのいずれかが含まれればよい。BS08守護機獣スノパルド：コスト3/4）。keywordExclude指定時は、アタッカーがそのキーワードを持つときは保護しない（spiritHasKeyword判定。同カード：【転召】を持たない） symbolCount指定時（combinedOnlyなし）はシンボル数がちょうど一致するアタックのみ保護。ownOnly指定時は**発生源の持ち主だけ**を守る（両陣営でなく片側。BS12-069定規山脈Lv2：「シンボル2つを持つ相手のスピリットのアタックでは、自分のライフは減らない」） attackerLevel指定時はmaxCostと**両方満たすとき**だけ保護する（AND。器BA。BS13-070星宿の障壁：コスト3以下かつLv1のアタック）
    | { type: "opponentNexusesUnexhaustable"; phase?: Phase } // 発生源の持ち主から見た**相手**のネクサスは疲労させられない（【強襲】の疲労元や、ネクサスを疲労させる支払いを止める）。phase指定時はそのステップ中のみ（BS09-063花の宮殿Lv2＝『お互いのアタックステップ』）
    | { type: "cantReduceOpponentLifeWhileSelfRefreshed" } // **発生源が回復状態の間、発生源の持ち主は相手のライフを減らせない**（片側のみ。Lv3で自分を回復させる効果の見返りの制約。BS11-X06 天秤造神リブラ・ゴレムLv3。2026-09-02 ユーザー確認で「文面どおり」）
    | { type: "noDrawInMain" } // 両陣営とも、**メインステップの間はドローできない**（BS11-065 満天の牧草地Lv1-2＝「お互い、ドローできず、手札を破棄できない」のドロー側。
    | { type: "noHandDiscardInMain" } // 両陣営とも、**メインステップの間は手札を破棄できない**（BS11-065 満天の牧草地Lv1-2の破棄側。判定は shared/rules.ts の canDiscardHand に寄せる。コストとしての破棄も止まる＝COST_MODEL.md §1）
    | { type: "noDeckMillInMain" } // 両陣営とも、**メインステップの間はデッキが破棄されない**（noDrawInMain/noHandDiscardInMainのデッキ版。自分の効果によるものも含めて止める＝noDeckMillByOpponentと異なり陣営を問わない。判定はEffectModules.millDeckの冒頭。BS14-085賛美するパイプオルガンLv1-2：「お互い、メインステップでデッキは破棄されない」）
    | { type: "noRefreshByNexusOrMagic" } // 両陣営のスピリットは、ネクサス/マジックの効果では回復しない（スピリットの効果とリフレッシュステップは通る。BS09-047鮫人サンゴジョー）
    | { type: "noRefreshByAnyEffect" } // BS15共通器：両陣営とも、疲労状態のスピリットすべては効果（スピリット/ネクサス/マジックいずれも。sourceTypeが渡る呼び出し全般）では回復しない（リフレッシュステップだけが通る。noRefreshByNexusOrMagicの全種別版。BS15-072渦巻く大海峡：「疲労状態のスピリットすべては、リフレッシュステップ以外で回復できない」）
    | { type: "noHandDiscardByEffect" } // BS15共通器：両陣営とも、効果では手札を破棄できない（canDiscardHand（shared/rules.ts）の関門で止める＝「手札を破棄することで」のコストも払えなくなる。破棄する効果自体は発揮するが1枚も破棄されない。BS15-052天蒼元帥チョウハッカイ：「お互い、スピリット/ブレイヴ/ネクサス/マジックの効果で、…破棄することができない」§2.3 #18）
    | { type: "noHandGainByEffect" } // BS15共通器：両陣営とも、効果（drawアクション／returnToHandによるスピリットの手札戻し）では手札が増えない（ドロー効果自体・バウンス自体が発揮されない＝バウンスされるはずのスピリットは場に残る。ドロー枚数を増やす継続効果自体は止めない。BS15-052天蒼元帥チョウハッカイ：「お互い、スピリット/ブレイヴ/ネクサス/マジックの効果で、手札を増やす…ことができない」）
    | { type: "burstAltEventFromOpponentSummon" } // BS15共通器：**発生源の持ち主だけ**：バースト条件が【相手の『このスピリット/ブレイヴの召喚時』発揮後】（event:"opponentSummonEffectResolved"）のバーストは、【自分のライフ減少後】（event:"ownLifeDamaged"）にも発動できる（triggers.tsのバースト走査が、通常のevent一致に加えてこの読み替えを見る。BS15-069太陰の宮廷Lv2）
    | { type: "refreshOnlyOneUncombined" } // 両陣営とも、リフレッシュステップで**合体していないスピリットは1体しか回復できない**（どれを回復させるかはそのステップのプレイヤーが選ぶ。BS11-X04 宝瓶神機アクア・エリシオン）
    | { type: "nexusesCantRefresh" } // 両陣営とも、リフレッシュステップでネクサスすべては回復しない（BS11-X04 同上）
    | { type: "opponentCombinedCantRefresh" } // 発生源の持ち主から見た**相手**の合体スピリットすべては、リフレッシュステップで回復しない（片側のみ。BS11-X04【合体中】Lv3）
    | { type: "opponentCantSpiritStateBrave" } // 発生源の持ち主から見た**相手**は、ブレイヴをスピリット状態にできない（片側のみ。BS11-X02 滅神星龍ダークヴルム・ノヴァLv3）。止めるのは3経路：メインステップの任意分離／場を離れるときの「残す」／ブレイヴ単体（合体先なし）の召喚
    | { type: "ownLifeDamageToTrashByKeyword"; keyword: Keyword } // **発生源の持ち主の**、指定キーワードを持つスピリットのアタックによって減る相手のライフのコアは、リザーブでなく相手のトラッシュに置かれる（battleResolve のライフ受けが見る。26RBS01-055 Lv2）
    | { type: "noBpCompareDestroy" } // 両陣営のスピリットすべてはBP比べでは破壊されない（バトル自体は成立し、効果による破壊は通常どおり。battleResolve の破壊バッチが見る。26RBS02-054）
    | { type: "nexusIndestructible" } // すべてのネクサスは破壊されない（両陣営。要塞皇オーディーン）
    | { type: "braveBpBonusZero" } // 両陣営の合体スピリットすべての「合体時BP+」（braveBpBonus。合体しているブレイヴのbraveLevels.bpの合計）を0にする。コア数によるブレイヴ自体のLv判定は変えない＝加算値だけ無視する（BS14-090勇壮なる船上都市：「合体スピリットすべての『合体時BP+』を0として扱う」。主語が無いので両陣営が対象）
    | { type: "lifeDamagePerSpiritPerTurn"; max: number } // 両陣営とも、スピリット1体がそのターンに減らせるライフの合計はmaxまで（アタック・そのスピリットの効果のどちらも合算。CardInstance.lifeDealtThisTurnで判定＝ownLifeDamageCapPerSourcePerTurnと同じ記録を使うが、こちらは発生源がどちらの陣営にあっても**お互いに**効く。effect.whileOwnBurstSetで「発生源の持ち主がバーストをセットしている間」に絞れる。shared/rules.lifeDamagePerSpiritRemaining。BS15共通器：神将）
    | { type: "ownLifeDamageCapPerSourcePerTurn"; max: number } // **発生源の持ち主だけ**を守る片側型（ownLifeFloorと同じパターン）。「自分のライフは、ターンごとに相手のスピリット1体からmaxまでしか減らされない」＝**アタッカー個体ごとのターン累計**で判定する（1回のアタックでmax個ずつのcapLifeDamageThisTurnとは別物）。CardInstance.lifeDealtThisTurn（そのアタッカーがこのターンに与えたライフダメージ累計）を見て残り許容量を返す（shared/rules.ownLifeDamageCapRemaining）。ターン終了でリセット（SD06-010海皇龍シーマ・クリークLv1-2-3：max:1）
    | { type: "ownLifeFloor"; floor: number; costSelfToTrash?: true; then?: EffectAction } // **発生源の持ち主だけ**のライフはfloorを下回らない（globalConstraintの他の型と違い片側のみ。既存playerRule "lifeFloorForPid"（このターンの間）に対する常在・条件式版。condition:{ownFamilyCountAtLeast}と組み合わせて使う。BS12-070天の階Lv2＝「自分のフィールドに系統：「天霊」を持つスピリットが5体以上いる間、自分のライフは0にならない」floor:1）。
    // costSelfToTrash指定時：ライフが実際に0になる瞬間だけ発揮する任意コスト版（tryOwnLifeFloorByCostが life<=0 判定の直後で処理する）。
    // 発生源自身（このネクサス）を持ち主のトラッシュへ置くことでfloorを適用する。全プレイヤーが払わない理由が無い（払わなければ即敗北）ため、
    // 対話確認を省いて自動で支払う簡略化（COST_MODEL.md）。then指定時は支払い成立後にそのアクションを1回発揮する（BS14-084永久凍土の王都：ボイドからコア1個をリザーブへ）

    | { type: "ownLifeImmuneToSpiritEffects" } // **発生源の持ち主だけ**：相手のスピリットの効果（lifeCrush系。バトルの攻撃ダメージは含まない＝negateLifeDamageFromTargetが別途カバー）ではライフが減らない（ownLifeFloorと同じ片側パターン。shared/rules.ownLifeImmuneToOpponentSpiritEffectsが判定。BS13-027ムーンショウウオLv2：「相手のスピリットの効果では、自分のライフは減らされない」）
    | { type: "attackOncePerTurnBySymbolCount"; symbolCount: number } // 両陣営とも、シンボル数がちょうどsymbolCountのスピリットはターンに1回しかアタックできない（CardInstance.attackedThisTurnで判定。RuleValidator.validateAttackが見る。BS13-068遥かなる衛星砲：「シンボル2つを持つスピリットはターンに1回しかアタックできない」）
    | { type: "attackOncePerTurnTotalByCost"; maxCost: number } // attackOncePerTurnByCost の合計版：コストがmaxCost以下のスピリットは、**そのプレイヤーの該当スピリット全体で**ターンに合計1回しかアタックできない（PlayerState.minAttackCostThisTurn で判定。両陣営それぞれ。2026-10-11 ユーザー指示の解釈。26RBS02-085）
    | { type: "attackOncePerTurnByCost"; maxCost: number } // attackOncePerTurnBySymbolCountのコスト版。両陣営とも、コストがmaxCost以下のスピリットはターンに1回しかアタックできない（instHasCostで判定＝付与コストも見る。BS14-088青玉の巨大迷宮：「コスト3以下のスピリットは、ターンに1回しかアタックできない」）
    | { type: "ownNexusIndestructible"; colors?: Color[]; nameIncludes?: string; sourceColors?: Color[]; sourceTypes?: CardType[] } // colors指定時は、そのいずれかの色を持つネクサスだけを守る（BS09-062ノルンの泉Lv2＝白/黄）。nameIncludes指定時は、カード名にこの文字列を含むネクサスだけを守る（colorsと同じ絞り方。対象が分からないときは守らない側に倒す。SD06-012英雄皇の御盾Lv2＝「カード名に「英雄皇」と入っている自分のネクサスすべて」）。// 発生源の持ち主のネクサスすべては、相手の効果によって破壊されない。
    // sourceColors / sourceTypes 指定時は、**破壊しようとしている効果の発生源**をさらに絞る（SD01-032 機械神の加護＝「相手の赤のスピリット/マジックの効果では」）。
    // どちらかを指定した場合は DestroyContext が要り、発生源が不明なときは**守らない**側に倒す（colors と同じ方針）。
    // 「相手の」を明示している効果なので、指定時は sourcePid が持ち主と異なることも求める
      // （hasGlobalConstraintの両陣営走査とは異なり、destroyNexusが破壊対象ネクサスの持ち主のフィールドのみを判定する。サファイアの城壁）
    | { type: "maxSpiritsOnField"; max: number } // 両陣営とも、フィールドのスピリットがmax体以上のときは召喚できない（メインステップの通常召喚のみ。BS04旋風渦巻く渓谷＝5体以上召喚できない＝max4）
    | { type: "levelCantAct"; levels: number[] } // currentLevel がこのリストに含まれるスピリットは、アタックとブロックができない（両陣営。costCantAct のレベル版。BS07腐りゆく湖沼Lv2＝Lv1）
    | { type: "costCantAct"; maxCost?: number; costs?: number[] } // コストがmaxCost以下のスピリットは、アタックとブロックができない（両陣営。shared/rules.tsの専用判定costCantActが参照。BS05白夜の虚空Lv1=maxCost1、青嵐の虚空Lv1=maxCost2）。costs指定時はmaxCostの代わりにこのリストと完全一致するコストのみ対象（BS02グレートウォール：コスト6と8）
    | { type: "millCap"; maxCount: number; perTurn?: boolean; mutual?: true; bothSides?: true } // 発生源の持ち主のデッキは、相手の効果によるミル（mill/粉砕/voidCoresAndMillByCost等）でmaxCount枚を超えて破棄されない
      // （ownNexusIndestructibleと同様に発生源の持ち主のみに効く。EffectModules.millCapForがeffectSources経由で判定＝lendSelfThisTurnで貸与可。
      // perTurn省略時=1回のミルにつきmaxCount枚まで（BS05エターナルシールド：5枚まで＝6枚以上破棄されない）。
      // perTurn:true=ターン累計でmaxCount枚まで（GameState.millCountThisTurnで加算管理。BS04侵されざる聖域Lv2：ターンに5枚まで）
      // 器AM：mutual指定時は「相手の効果によるミルだけ」というこの型の既定を外れ、**お互いのデッキを、
      // 発生源の持ち主自身の効果によるミルも含めて**maxCount枚（perTurn前提）まで守る（GameState.millCountThisTurnMutualで加算管理。
      // EffectModules.mutualMillCapRemainingForが両陣営のeffectSourcesを見て判定。BS13-026キグナ・スワンMk-II：「お互いのデッキは〜ターンに3枚までしか破棄されない」）
      // BS15共通器：bothSides指定時は、mutualと違い**自分の効果によるミルは含めない**（相手の効果によるミルだけを見るこの型の既定判定のまま）。
      // 発生源がどちらの陣営のフィールドにあっても、**その持ち主から見た相手だけでなく、その相手のさらに相手（＝発生源の持ち主自身）のデッキも**
      // 同じmaxCountで守る＝実質「お互いのデッキが、相手の効果では1ターンにmaxCount枚までしか破棄されない」。
      // millCapPerTurnRemainingがperTurnとあわせて両陣営のeffectSourcesを走査する（BS15-069太陰の宮廷：「お互いのデッキは、相手の…効果では、1ターンに3枚までしか破棄されない」）
    | { type: "battlingCoresProtected" } // 現在バトルをしている両陣営のスピリット上のコアは、効果（コア除去アクション）によって取り除かれない
    | { type: "battlingEffectImmune" } // 現在バトルをしている両陣営のスピリットは、お互いのスピリット/マジックの効果を受けない（ネクサスの効果は通る。EffectModules.isEffectBlocked が破壊・コア除去・疲労・バウンス等のガードから参照。BS05茨の決戦地Lv2）
    | { type: "coresToOpponentReserveGoToTrash" } // 発生源の持ち主から見た**相手**のリザーブへ、スピリット/ブレイヴ/マジックの効果で置かれるコアはその相手のトラッシュへ振り替えられる（両陣営の発生源が効く＝主語なし。ネクサスの効果・ルール処理（バトル敗北・場を離れるとき等）は対象外＝効果によるコア移動だけ。removeCores〈removal.ts〉の共通フックで判定。coreSqueezeAll等の直接操作系はこの経路を通らないため対象外＝簡略化。BS12-X02魔羯邪神シュタイン・ボルグLv2-3）
      // （removeCores/removeCoresToTrash/removeCoresToVoidの共通フックで判定。coreSqueezeAll/One・coreDrainAllOthers・coreToVoidOwnなど
      // 直接コアを操作する一部アクションはこの経路を通らないため対象外＝簡略化。BS05茨の決戦地Lv1-2）
    | { type: "noTrashRecovery" } // お互い、トラッシュからカードを手札に戻せない（recoverSpiritFromTrash / recoverMagicFromTrash / recoverAllMagicFromTrashByColorChoice の各ハンドラ冒頭で判定。BS06鎖縛の武舞台Lv1-2）
    | { type: "noOpponentTriggerByColor"; color?: Color; triggers: TriggerEvent[]; bothSides?: true } // 発生源の持ち主から見た**相手**の、指定色のスピリットの、指定した『〇〇時』効果は発揮されない（color省略時は色を問わずすべての相手のスピリットが対象。BS14-X06千貌の魔神ニャルラ・トラップ：「相手のスピリットすべての『このスピリットの破壊時』効果は発揮されない」）。BS15共通器：bothSides指定時は「相手」限定を外し、**発生源の持ち主自身のスピリットも含めて**両陣営が対象になる（主語の無い効果文＝CONJUNCTION.md／SEMANTICS_AUDIT.md §3.17の既存規則。BS15-072渦巻く大海峡Lv2：「自分のバーストをセットしている間、『このスピリットの破壊時』効果は発揮されない」＝whileOwnBurstSetと組み合わせる）
    // （noSummonTriggerByCost と違い両陣営ではなく片側だけ。SD01-031 朝焼け岬Lv2＝相手の紫の『召喚時』と『破壊時』）。
    // ⚠️ 封じられるのは『』でカテゴライズされた効果＝`kind:"triggered"` だけで、
    // ネクサス等の**常在効果**による「破壊されたときフィールドに残る」（`kind:"reviveOnDestroy"`）は封じられない
    // （2026-08-16 ユーザー確認。docs/design/CONJUNCTION.md「効果ブロック（『』）の範囲」）。
    // fireTrigger の入口で判定するため、この2つが自然に分かれる
    | { type: "opponentMagicCostIncrease"; amount: number } // 発生源の持ち主の**相手**は、マジックの効果を使用するとき amount コスト余分に支払う（BS10-077 ギョクリューン）。
    // opponentSummonCostIncrease のマジック版。shared/cost.ts の effectiveCost が読む
    | { type: "opponentSummonCostIncrease"; amount: number; maxCost?: number; keywordExclude?: Keyword } // 発生源の持ち主の**相手**は、
    // 条件を満たすスピリットカードを召喚するときコストを amount だけ余分に支払う
    // （maxCost=カード記載コストがこれ以下のもの限定／keywordExclude=そのキーワードを持たないもの限定）。
    // SD02-013 転召の祭壇Lv1-2＝「【転召】を持たないコスト3以下のスピリットカードを召喚するとき、1コスト余分に」
    | { type: "noSummonTriggerByCost"; maxCost?: number; side?: "opponent" } // お互い、コストがmaxCost以下のスピリットの『このスピリットの召喚時』効果は発揮されない（召喚時トリガーの発火直前に判定して落とす。BS08共鳴する音叉の塔：コスト4以下）。**maxCost省略時はコストを問わずすべて**（BS11-072 未完成の古代戦艦：船尾Lv2＝「『このスピリットの召喚時』効果と『このブレイヴの召喚時』効果は発揮されない」）。エントリの phase / turn を書けばその区間だけ有効になる。// side:"opponent"指定時は**発生源の持ち主から見た相手**のスピリット/ブレイヴだけを対象にする（既定は両陣営。BS14-088青玉の巨大迷宮Lv2：「相手のスピリットすべての『このスピリットの召喚時』効果と、相手のブレイヴすべての『このブレイヴの召喚時』効果は発揮されない」）
    | { type: "noVoidToLife" } // お互い、ボイドからライフにコアを置けない（placeCores の void→life を落とす。【聖命】も止まる。BS11-072 未完成の古代戦艦：船尾Lv1-2）
    | { type: "noReductionBySummonCost"; maxCost: number } // お互い、コストがmaxCost以下のスピリットカードを召喚するとき、軽減シンボルによるコスト軽減ができない（**カード静的なコスト**で判定＝軽減前の値。使用コスト計算の共通経路で軽減分を0にする。BS08超時空重力炉：コスト3以下）
    | { type: "bp0DestroyedToDeckBottom"; maxCost: number } // 発生源の持ち主の**相手**のスピリットが、破壊直前の実効BPが0でコストがmaxCost以下のまま破壊されたとき、トラッシュに置くかわりに持ち主のデッキの下へ戻す（commitPendingDestruction が読む。複数体の「好きな順」は選ばせず破壊順。26RBS02-083）
    | { type: "coreFloorWhileBlockingKeyword"; keyword: Keyword; floor: number } // 発生源の持ち主の、keyword を持つスピリットをブロックしている相手のスピリット上のコアは、効果で floor 個より少なくならない（コアの動かし方を問わない。coreFloorFor が読む。26RBS01-091「【激突】を持つ自分のスピリットをブロックしている相手のスピリットすべてのコアは、1個より少なくならない」）
    | { type: "coreFloorOwnNamedByOpponent"; nameContains: string; floor: number } // 発生源自身と、持ち主のカード名に nameContains を含むスピリットのコアは、**相手の効果では** floor 個より少なくならない（actorPid が相手のときだけ床を張る。coreFloorFor が読む。26RBS03-030「このスピリットと、自分の「ソーディッシュ」すべて」）
    | { type: "coreFloorByCost"; ownOnly?: true; colorFilter?: Color; byOpponentOnly?: true } // ownOnly指定時は発生源の持ち主のスピリットだけを守る（BS09-059翡翠の社Lv2）。colorFilter指定時はこの色を持つスピリットだけを守る（BS12-065大樹茂る天守閣：「自分の緑のスピリットすべて」）。// **「Lv1コスト」＝Lv1に必要なコア数**（レベル表の表記。2026-08-14 ユーザー確認。以前は召喚コストとして実装していた）。// 両陣営のスピリット上のコアは、効果によってそのカードのコスト（Lv1コスト）を下回るまで取り除けない（removeCores/removeCoresToTrash/removeCoresToVoidの共通処理で判定。**コアの動かし方を問わず効く**＝移動（moveCoresLeavingOne）と入れ替え（swapOpponentCores）も下限を割れない。入れ替えは同時の1つの動きなので、割るときは入れ替え自体を行わない。2026-08-24 ユーザー確認。BS08聖なる柱状彫刻）
    | { type: "coresCantBeRemovedByOpponent"; nameContains: string } // 発生源の持ち主の、カード名にnameContainsを含む自分のスピリット上のコアは、相手のスピリット/ブレイヴ/マジックの効果では取り除けない（coresCantBeRemovedと違い片側限定＝相手の効果だけを止める。判定はboardResistanceAgainstのcoreRemove経路。BS12-022太陽武者ゲンジ・ボルタ：カード名に「太陽」）
    | { type: "coresCantBeRemovedAll"; side: "opponent" | "both"; exceptOwnerEffects?: true } // 器AC：coresCantBeRemoved（自身のコアだけ）を広げたフィールド全体版。side:"opponent"＝発生源から見た相手のスピリットのコアだけ、side:"both"＝両陣営すべて。exceptOwnerEffects指定時は持ち主自身の効果・操作（自分のコストの支払いも含む）は例外で通す（BS13-065八分儀の祠Lv2：相手のスピリットすべて・相手の効果以外）。未指定時は持ち主自身も含めて完全に止める（BS13-X03白羊樹神セフィロ・アリエスLv3：両陣営すべて・自分のコストも払えない）。「【転召】以外」の例外はdumpAllCoresTenshoがこのチェックを経由しないため自動的に満たされる（コード対応不要）。globalConstraintのphase/turnフィールドで区間を絞れる（065Lv2＝phase:"main" turn:"opponent"）
    | { type: "summonExhausted"; self?: true; cardTypes?: CardType[]; familyExclude?: FamilyFilter; costFilter?: { max?: number; min?: number } } // 器AB：お互い、条件を満たすカードを召喚するとき、疲労状態で召喚する（BS13-065八分儀の祠Lv1-2：cardTypes["spirit"]・familyExclude["遊精","星魂"]・costFilter.max:3／BS13-X03白羊樹神セフィロ・アリエスLv1-3：cardTypes["spirit","brave"]・familyExclude"遊精"）。ダイレクトブレイヴでは合体先のスピリットが疲労する（BS13_PLAN.md §1 #14）。「疲労する」であって「疲労状態になる」ではないため、ownSpiritExhaustedは発火しない＝【装甲】等の耐性でも防げない（同 #24）。globalConstraintのphaseフィールドで「メインステップ」に絞る（両カードとも見出しが『お互いのメインステップ』のため、神速による召喚は対象外になる）
    | { type: "handImmuneForPid"; includeNexus?: true } // 発生源の持ち主の**手札**は、相手のスピリット/ブレイヴ/マジックの効果を受けない（ネクサスの効果は防がない＝効果文の列挙にネクサスが無いため意図的。EffectModules.handImmuneForが判定し、discardOpponent等の手札を対象に取る処理の冒頭で弾く。BS12-067月光集める塔Lv1）。includeNexus指定時はネクサスの効果も防ぐ（BS14-082五角形の砦：「自分の手札は相手のスピリット/ブレイヴ/ネクサス/マジックの効果を受けない」）
    | { type: "noDeckMillByOpponent"; whileSourceDeployedTurnOnly?: true } // 相手の効果では、**この発生源の持ち主**のデッキは破棄されない（millDeck の冒頭で判定。他の globalConstraint と違い両陣営ではなく持ち主だけを守る＝millCap と同じ向き）。whileSourceDeployedTurnOnly指定時は、発生源が このターンに場へ出た（summonedTurn === state.turn）ときのみ有効（BS08鳳翼の聖剣「このネクサスが配置されたターンの間」）。自分自身の効果・コスト支払いによる破棄は止めない（millCap と同じ範囲）
    | { type: "noDrawOutsideDrawStep" } // お互い、ドローステップ以外でドローできない（GameState.drawの共通経路冒頭で判定。ドローステップ自身はfromDrawStep引数で除外する。BS08豚人チョウハッカイ）
    | { type: "summonLimitByCostForOpponent"; maxCost: number; limit: number } // 発生源の持ち主から見た**相手**は、コストがmaxCost以下のスピリットをターンにlimit体までしか召喚できない（RuleValidator.validateSummonが、相手フィールドのCardInstance.summonedTurnで自分のこのターンの該当召喚数を数えて判定。神速召喚も対象。BS08夢想法師サンゾール：コスト4以下は1体まで）
    | { type: "summonLimitByEffectForOpponent"; limit: number } // summonLimitByCostForOpponentの兄弟：コストでなく**効果の記述を持つ**（isVanillaCardがfalse）スピリットカードでターンにlimit体までしか召喚できない（BS12-071未完成の古代戦艦：帆Lv2＝1枚まで）
    | { type: "voidCoreBlockedOutsideCoreStep" } // お互い、コアステップ以外でボイドからフィールド/リザーブにコアを置けない（ライフ・トラッシュへは対象外。BS10-056蒼天大聖モンゴクウ）。
    // ボイドから直接置く各アクションが冒頭でEffectModules.voidCorePlacementBlockedを呼ぶ（コアステップ自身の`player.reserve += 1`はガート不要＝コアステップ内なので通る）
    | { type: "noSummonByEffect" } // お互い、スピリット/ブレイヴ/ネクサス/マジックの効果でスピリット/ブレイヴを召喚できない（通常のdoSummon経由の召喚は対象外。フィールド全体・主語なし。BS12-072海賊王の秘宝島Lv1）。
    // エントリの phase を書けばその区間だけ有効（BS12-072＝『お互いのメインステップ』）。summonByEffectBlockedが判定し、
    // summonFreeFromHandIndex/summonFreeFromTrashIndex/summonRevealedFree（EffectModules.tsの効果による召喚の共通経路）の冒頭で弾く
    | { type: "attackPayToll"; count: number; attackerLevel: number; noStack?: true } // 発生源の持ち主から見た相手の、現在のLvがattackerLevelのスピリットがアタックするとき、持ち主のリザーブのコアcount個をトラッシュに置かなければアタックできない（払えるかぎり自動で払う。コスト支払いのうちリザーブからだけ払う簡略化。noStack＝〔重複不可〕：同じカード名の発生源は何枚あっても1回分。26RSD06-011）
    | { type: "attackRequiresCoreToll"; maxCost: number } // 器BM：両陣営とも、コストがmaxCost以下のスピリットがアタックするとき、持ち主のリザーブのコア1個を持ち主のトラッシュに置かなければアタックできない（リザーブが空ならそもそもアタック不可＝validateAttackが弾く。払えるかぎり自動で払う＝GameEngine.doAttackが宣言成立時に自動でリザーブ→トラッシュへ移す。「断ればアタックしない」はクライアント側で表現する（public/src/main.ts の confirmExtraCost が send() 直前に確認をはさむ）。2026-09-10ユーザー確認。BS13-043鳥人イカロッシュ）
    | { type: "opponentCantReturnFromTrashToHand" } // 器BO：発生源の持ち主から見た**相手**は、トラッシュからカードを手札に戻せない（noTrashRecovery〈両陣営〉の片側版。cantSpiritStateBraveと同じ「相手側だけを見る」パターン。トラッシュ→手札の経路（recoverSpiritFromTrash/recoverMagicFromTrash/recoverAllMagicFromTrashByColorChoice/器AOの各ハンドラ冒頭）が共通ヘルパーで一括して弾く。BS13-044吟遊詩人のオルフェLv2）
    | { type: "cantAttackIfFewOwnSpirits"; atMost: number }

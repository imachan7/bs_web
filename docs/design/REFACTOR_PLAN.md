# リファクタリング計画（実装役が差し込み先を探す費用を減らす）

2026-09-22 起票。**着手は BS16 の PR がマージされてから**（`handDeck.ts` などを BS16 ブランチでも触っているため）。
1項目＝1ブランチ＝1PR（CLAUDE.md「PR は1つの作業単位で出す」）。

## 0. 測った結果（BS16 バッチ2の実装役4体、2026-09-22）

| 体 | 呼び出し | grep＋sed | 最初の Edit |
| :-- | --: | --: | --: |
| ① X03 | 119 | 96 | 57回目 |
| ② 021/065/058/067 | 203 | 129 | 34回目 |
| ③ X04/036/079 | 151 | 104 | 81回目 |
| ④ 027/P071/080 | 209 | 148 | 59回目 |

**呼び出しの約7割が grep と sed の探索だった。** 差し込み先メモ（`BS16_HOOKS_A/B.md`）を渡してもこの量になる。
探していたものは次の5種類。

| 記号 | 探していたもの | 実例 |
| :-- | :-- | :-- |
| A | 共有ヘルパーの置き場所 | `matchesFamilyFilter` を存在しないパスで6回続けて探した。`opponentOf`・`destroySpirit`・`findSpiritAny`・`ActionCtx` も同様 |
| B | 型がどのファイルにあるか | `type.ts`／`types/effectDef.ts`／`types/effectAction.ts` を行き来した。CLAUDE.md の索引1行が `type.ts` しか見ておらず、570個中144個しか出ていなかった（09-22 に修正済み） |
| C | クライアントとサーバーの二重実装 | ②のコスト支払いが `shared/rules.ts`・`RuleValidator.ts`・`GameEngine.ts`・`public/src/main.ts`・`renderer.ts` の5ファイルにまたがった |
| D | 誘発条件の軸がどこで判定されているか | `triggers.ts` の `effect.attackerOnly` などが散らばっている（`effect.X` の参照が381か所） |
| E | 巨大なファイルの中の位置 | `handDeck.ts` 4566行（09-23 に分割済み）など |

## 1. 項目（上から順に着手する）

| # | 項目 | 効くもの | 規模 | 状態 |
| :-- | :-- | :-- | :-- | :-- |
| R1 | **差し込み先の手順書** `docs/design/WHERE_TO_ADD.md`：変更の種類ごとに、触るファイルと関数を列挙する（下の表） | A・B・C | 小（メインループが書く） | 未着手 |
| R2 | **ヘルパーの索引を自動生成**：`npm run codemap` → `docs/CODEMAP.md`（export 名・ファイル:行・先頭コメント1行）。CI で「生成し直すと差分が出る」なら落とす | A | 小 | 未着手 |
| R3 | **責務単位の分割**（§3）。`handDeck.ts` の6分割を最初に、名前と中身が食い違っているファイルを概念ごとに分ける | E・A | 中（移すだけ） | handDeck・EffectModules（キーワード・デッキ破棄・疲労）・マジックは分割済み（09-23）。次は removal（ブレイヴ・復活） |
| R4 | 型3ファイルのコメント削減（CLAUDE.md「コードスタイル」の基準で） | B・E | 中（機械的） | 決定済み |
| R5 | 器の統合（§2）。手札破棄のコスト7種は M1 に含める | 器の増殖 | 大（段階的） | §2 の確認事項をユーザーに聞いてから |
| R6 | 誘発条件の軸を `triggers.ts` の1関数に集める（軸の一覧＝その関数を読めば分かる形にする） | D | 中 | 調査から |
| R7 | クライアントとサーバーの判定を `shared/rules.ts` に一本化する（まずコスト支払いから） | C | 大 | 調査から。`audit:parity` で挙動が変わらないことを確かめる |

R1 と R2 は挙動を変えずに効くので最初にやる。R6 と R7 は着手前に調査役（Sonnet）が「どこに何があるか」のメモを書き、設計をユーザーに確認する。

### R1 の手順書に載せる「変更の種類」

新しいアクション type／新しい `EffectDef` の kind／新しい fieldEvent と発火点／誘発条件の新しい軸／
新しい `TargetFilter` の軸／新しい `PendingChoice`（サーバーとクライアントの両方）／
`GameState` の一時フィールド（「直前の〜」を橋渡しするもの）／代替コスト（【神速】の支払い補助など）／
継続制約（`constraint`・`turnConstraints`）。

各行に書くのは次の4つだけ：**触るファイル:関数、既存の手本（1つ）、`validate-cards.ts`・`coverage-effects.ts` への追記要否、罠**。

## 2. 器の統合（R5）

**アクション type は328種あり、180種がカード1枚だけで使われている**（2026-09-22 集計。カードデータに現れない12種は
`tenshoResume` のような中断・再開用の内部 type で、死んでいるわけではない）。
「組み合わせ」を書く器がないので、効果の組み合わせごとに type が1つずつ増えている。
統合すれば、新しいカードは**既存の器の組み合わせ（データ役が JSON を書くだけ）**で済むことが増え、実装役に委譲する回数そのものが減る。

| # | 何をまとめるか | 数 | 入れる器 | 既にあるもの |
| :-- | :-- | --: | :-- | :-- |
| M1 | 「〜することで〜する」のコストと効果を1つにした type（`cost*`・`discardHand*Then*`・`costOwnSpiritCoresToTrashThenOpponent` など） | 約15 | `pay { cost, then }`。「両方が完全に解決できるときだけ発揮」を1か所で判定する | ステップの `cost` は kind ごとに別々の union（`effectDef.ts:143,202`） |
| M2 | 直前の結果で分岐する type（`millThenCoreIfBurst`・`destroyIfLastMillHadBurst`・`summonBurstCardFreeIf*`・`*IfFamily` など） | 約20 | `if { cond, then }`（ACTION_VOCABULARY §3.1。`cond` は直前の結果／いまの盤面／きっかけの出来事） | `sequence`（「その後」）はある。16か所で使用 |
| M3 | 「〜1体につき」を名前に入れた `*Per` 型 | 17 | 元の type の `count` に `EffectCounter` も書けるようにする | `countCounter` フィールドで同じことをしている type が10種ある（**書き方が2通り並存している**） |
| M4 | 対象の絞り込みを名前に入れた type（`exhaustAllByColor`・`exhaustAllByLevel`・`refreshAllByCost`／`ByKeyword`／`ByFamily` など） | 約15 | 元の type ＋ `TargetFilter` | `filter?: TargetFilter` を持つ type が23種ある |
| M5 | 公開系（`reveal*` 17種のうち15種が1枚だけ） | 17 | `reveal { from, count, pick, dest, rest }` | なし |
| M6 | 期間違い（`〜ThisTurn`／`〜ThisBattle`） | 数種 | `duration` 軸 | 後回しでよい |

### 2.1 単純なアクションの一覧を先に決める（M1〜M6 の前提。2026-09-22 ユーザー合意）

「単純なアクション」＝**バトスピのルール用語1つに対応する操作**。汎用の「移動」にはまとめない。
すべてのアクションは同じ軸（対象＝陣営・`filter`・体数／すべて・選ぶ人、量＝数値か `EffectCounter`、期間、行き先）を持つ。

**別のアクションにするのはルール上の処理が違うときだけ**（待機状態の種類など）。片方にだけ反応するカードがあるものは、
アクションを分けずに軸（`from`・`to`・`cause`）の値で誘発・耐性を書き分ける（2026-09-23 ユーザー決定。当初案の「反応があれば分ける」を置き換えた）。
**①〜③は済み → [ACTION_VOCABULARY.md](./ACTION_VOCABULARY.md)。④は名前からの下書きまで → [ACTION_DECOMPOSITION.md](./ACTION_DECOMPOSITION.md)。**

2026-09-22 の試算（全カードの効果文）：破壊されたとき／破壊時 399・ライフ減少 93・召喚されたとき 68・疲労したとき 31・
破棄されたとき 29・ドローしたとき 14 → 分ける。手札に戻されたとき 0 → 移動の一種。**消滅した 2・回復したとき 1 → 境界（中身を見て確認）**。

手順：①調査役がルール用語を洗い出し、反応の件数を表にするスクリプトを `scripts/` に作る（ゾーン移動・コア移動・状態変化・数値変更のすべて）
→ ②境界の語だけユーザーに確認 → ③確定した一覧を `docs/design/ACTION_VOCABULARY.md` に書く
→ ④328種を「動詞＋軸＋組み合わせ方」に1行ずつ分解する（これが M1〜M6 の作業リストになる）。

**進め方**：1項目＝1PR。①統合した器を作る → ②既存カードを移す（smoke の結果が変わらないことが完了条件）→
③使われなくなった旧 type を消す。M3 と M4 は機械的なので先にやる。M1 と M2 はルールの解釈が絡む。

**着手前にユーザーへ確認すること**
- M1：`then` の効果ごとの「完全に解決できる」の判定（ドロー＝デッキにある／コア除去＝相手にコアがある…）の一覧（COST_MODEL.md §1）
- M2：「〜とき」「そうしたとき」などの接続詞ごとに、`if` で書いてよいか（CONJUNCTION.md）
- 移行で**自動選択の挙動が揃う**（捨てる手札が末尾か先頭か、など）。AIとテストの挙動だけが変わるが、変えてよいか

## 3. 責務単位の分割（R3）

**方針**：ファイルを**ゲームの概念**（キーワード能力・マジック・ブレイヴ・バトル・選択の再開…）で切る。
「【転召】の処理はどこ」が**ファイル名で分かる**状態にし、grep で探さなくて済むようにする。行数を揃えるための分割はしない。
中身は移すだけ（挙動を変えない）。1ファイル＝1PR か、関連する2〜3ファイルで1PR。

**いま名前と中身が食い違っているもの**（2026-09-22 の関数一覧から）

| ファイル | 行 | 名前に無い責務（切り出し先の案） |
| :-- | --: | :-- |
| `actions/handDeck.ts` | 4566 | ドロー・破棄・公開・トラッシュ回収・デッキ破棄・バウンス・手元が同居 → `drawDiscard`／`tegamoto`／`reveal`／`trashRecover`／`mill`／`bounce`＋`magic`（09-23 分割済み。`familyChoiceThenBpBuffAll` は buff、`payNegateDecide` は control へ） |
| `EffectModules.ts` | 4239 | 【転召】（`tenshoSpecOf`〜`applyTenshoSubstitute*`）、【粉砕】【呪撃】【暴風】【強襲】など**キーワードごとの判定**、デッキ破棄（`millDeck`・破棄無効）、疲労・回復（`exhaustSpirit`・`refreshSpirit`） → `keywords/tensho.ts`・`keywords/<キーワード>.ts`・`zones/mill.ts`・`state/exhaust.ts` |
| `triggers.ts` | 2911 | マジックの処理は `magic/`（cast 使用の手続き／negate 無効化／redirect 対象の絞り込みと「お互い」の変更／resolve 解決・再発揮・マジックミラー）へ分割済み（09-23。GameEngine の `doCastMagic` も cast へ） |
| `removal.ts` | 2879 | ブレイヴの合体・分離・維持（`attachBrave`〜`takeBraveKeep`）、復活・【不死】（`queueReviveConfirm`〜`tryReviveOnDestroy`） → `brave.ts`・`revive.ts`。ネクサス破壊は残す |
| `GameEngine.ts` | 2877 | `doResolveChoice`（約450行）＝選択の解決と再開 → `choice.ts`。バトル解決（`resolveBattle`〜`runBattleStep`） → `battle.ts`。【烈神速】 → 召喚側へ |
| `shared/rules.ts` | 3330 | クライアントと共有する判定の全部入り → `shared/rules/`（レベルとブレイヴ／色と系統／BP とオーラ／対象の絞り込み）に分け、`shared/rules.ts` は再エクスポートだけにする（import 側は変えない） |

**再発を防ぐ**：`npm run validate:size`（仮）を定型に足す。`server/src`・`shared`・`public/src` の1ファイルが
**2000行**を超えたら落とす（型3ファイルは行が長いので KB で見て 120KB）。基準を超えたら「どの概念を切り出すか」を決めてから足す。

**順番**：handDeck → EffectModules（キーワード）→ triggers（マジック）→ removal（ブレイヴ・復活）→ GameEngine（選択・バトル）→ shared/rules。
R1（差し込み先の手順書）は分割後のファイル名で書くので、**R1 と R3 は同時に進める**（分割1つごとに手順書の該当行を更新する）。

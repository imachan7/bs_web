# 残りの効果実装を手で進めるための手引き

対象は `npm run validate:gaps` が「既知のギャップ」として抱えている **36枚**（2026-08-03 時点）。
このファイルは「次に何を、どの順で、どこを触って書くか」を1枚ずつピン留めしたもの。
着手時に §1〜§3 を読み、あとは §5 の表から担当する行だけ見れば足りる。

> 全体像を見たいときは `npm run gaps:report`。
> 実装したら `npm run gaps:update` でベースラインを縮めること（消し忘れも検出される）。

---

## 1. 1枚を実装する手順（毎回これをなぞる）

1. **効果テキストを節に割る。** `Lv1･Lv2『…』` や `メイン：` の見出しごとに1節。
   節の数と `effects[]` のエントリ数が合っているかを最初に確認する。
   → **合わせるのが目的ではない。「どの節が誰にも実装されていないか」を確定させるのが目的**
2. **その節が既存の `kind` で書けるかを探す。** §4 の早見表を先に見る。
   書けるなら `data/cards.json` にエントリを足すだけで終わる（コード変更ゼロ）
3. 書けないときだけ **3層設計**に従って器を足す:
   `server/src/type.ts` に型 → `server/src/logic/**` にハンドラ → `data/cards/BS0N.json` にデータ

   > カードデータは**弾ごとに分割**されている（2026-08-03）。1枚を直すときは該当弾のファイルだけ開けばよい。
   > スクリプトから読むときは `data/loadCards.ts` の `loadAllCards()` を通す。
   > 書き戻すときは対象の弾ファイルだけを `json.dumps(..., ensure_ascii=False, indent=1)` で上書きする
   > （この書式で元ファイルと完全一致する。他の弾を巻き込まないので diff が読める）
4. **`effects[]` はテキストのブロック順に並べ、id の連番も振り直す。**
   id はランタイムにデータから読むだけなので振り直して安全（`kind:"activated"` も同様）
5. smoke に**必ず1ケース以上**足す。新しい `scripts/smoke/part107.ts` を作り、
   `scripts/smoke.ts` に `import "./smoke/part107"` を1行追加する
6. 検証を1回流す:
   ```
   npm run gaps:update && npm run typecheck && npm run validate:cards && npm run validate:gaps && npm run smoke:quiet && npm run build:client
   ```
7. バッチ（数枚まとめ）が全緑になったらコミットする

### 新しい `kind` を足したときの追加作業（忘れやすい）

`scripts/validate-cards.ts` の `VALID_KINDS` にも名前を足す。
足さないと `未知の effect kind` で `validate:cards` が落ちる（＝落ちるので気づける。逆に
**新しい `action.type` は `ACTION_HANDLERS` から自動取得なので追記不要**）。

---

## 2. 踏みやすい罠（実際に踏んだものだけ）

- **cards.json は型検査の対象外。** 書き忘れた効果は型エラーにも smoke 失敗にもならない。
  「実装したつもり」を防ぐのは `validate:gaps` だけなので、必ず通すこと
- **`cardId` を書くときは python3 で `data/cards.json` をパースして ID・名前・色を機械確認する。**
  過去に ID が全面的にズレた事故がある。名前の記憶や既存コメントを信用しない
- **テストで Lv2 を作るときのコア数はカードごとに違う。** `levels` を引いて確認する
  （鉄槌のオズワルドの Lv2 は 6 コア、鷹人ホークアイは 5 コア。3 コア決め打ちで3回失敗した）
- **状態を足したら、それを読む述語を同時に指すこと。**
  過去に `tempFamilies` が「書き込むだけで誰も読まない」まま系統付与が無効だった事故がある。
  純粋述語（`state` を受け取らない `cardNameContains` / `instHasColor` / `instHasCost`）が読む継続効果は、
  走査ではなく `refreshLevelAsOverrides` の**都度再構築**で `CardInstance` に載せる
  （`namesAsContinuous` / `colorsAsContinuous` / `alsoCostsContinuous` / `armorColorsGranted` が先例）
- **免疫のガードは散っている。** 「効果を受けない」を新しく足すときは
  `isImmuneToArea` / `isEffectBlocked` / `hasArmorAgainst` / `hasMagicImmunity` / `hasFullEffectImmunity`
  を grep して、同種のガードを全アクションで形を揃える
- **枚数で進捗を数えない。** 1枚に効果が複数あるので、数えるなら**効果節の単位**で

---

## 3. 着手順の推奨

> **共有ヘルパーを先に整える → 単発を量産する → 重いものは最後**

1. **§5-C の「疲労の一元化」を最初にやる。** これ1つで3枚が同時に書けるようになる
2. 次に **§5-A / §5-B の単発**を5〜8枚ずつまとめて片付ける（1バッチ＝1コミット）
3. **§5-C の「このターンの間の貸与」**は6枚まとめて。先に `docs/design/TURN_EFFECT_SOURCES.md` を読む
4. **§5-D は実装しない判断を明文化する。** `data/card-notes.json` に理由を書く（黙って落とさない）

---

## 4. 早見表：この効果文はこの器で書ける

既存の器で書けるものを新しく作らないための対応表。迷ったら似たカードのデータを grep して真似る。

| 効果文の型 | 使う `kind` / `action` |
| :-- | :-- |
| 『◯◯ステップ』に〜する | `kind:"step"`（`step` / `turn` / `optional` / `condition`） |
| 〜したとき（召喚時・アタック時・破壊時…） | `kind:"triggered"`（`trigger`） |
| 場の別のカードに起きたことに反応する | `kind:"fieldEvent"`（`event`。イベント名は `FieldEvent` を参照） |
| BPを比べ相手だけを破壊したとき | `kind:"battleWon"`（`role` / `winnerFamilyFilter` / `winnerMinCores`） |
| 〜すべてをBP+ | `kind:"aura"`（`target:"ownAll"` ＋各種 Filter ＋ `phaseTurn`） |
| ブロックできない／されない・アタックできない | `kind:"constraint"`（`ConstraintDef`） |
| 相手や全体に制約をかける | `kind:"globalConstraint"` |
| 自分のスピリットに制約を配る | `kind:"constraintGrant"` |
| 自分のスピリットにキーワード／装甲を配る | `kind:"keywordGrant"`（装甲は `keyword:"armor"` ＋ `colors`） |
| 自分のスピリットに誘発効果を配る | `kind:"effectGrant"` |
| 系統／色／コスト／カード名として扱う | `familyGrant` / `colorAs` / `alsoCostGrant` / `nameAsGrant` |
| Lv◯として扱う | `kind:"levelAs"`（`treatAs` / `summonedThisTurnOnly`） |
| 破壊される代わりに残る・手札に戻る | `kind:"reviveOnDestroy"` |
| マジックの使用そのものを縛る | `kind:"magicRestriction"` |
| コストが増減する／置換される | `kind:"costMod"` |
| 相手の効果を受けない | `kind:"immunityGrant"` ／ `ConstraintDef` の `untargetableByOpponent` / `immuneToOpponentEffects` |
| 相手スピリット1体を指定してアタックできる | `ConstraintDef` の `canDirectAttack`（`targetFilter` / `targetMinBp`） |
| マジックが「このターンの間」効果を貸す | `action:"lendSelfThisTurn"` ＋ 貸される側エントリに `lentOnly:true`, `levels:null` |

---

## 5. 残り36枚：分類と方針

### A. 既存の器だけで書ける（データ追加のみ、またはフィールド1つ追加）

| cardId | カード名 | 未実装の節 | 方針 |
| :-- | :-- | :-- | :-- |
| BS03-X10 | 凍獣マン・モール | Lv2/Lv3 自分のスピリットすべてに【装甲】 | `keywordGrant` `keyword:"armor"` `target:"ownAll"` ＋ `colors`。Lv2＝赤/紫/緑、Lv3＝＋黄/青の2エントリ。**コード変更なし** |
| BS05-056 | 最古龍の顎 | Lv2 シンボル2つ以上の自分のスピリットはBP4000以上の相手を指定アタック | `constraintGrant` ＋ `canDirectAttack{targetFilter:"any", targetMinBp:4000}`。`constraintGrant` に `minSymbols` を1つ足すだけ |
| BS05-066 | 天焦がす大聖火 | Lv2「巨人」はコスト5以上の相手を指定アタック | 同上。`constraintGrant` に `nameIncludes`、`canDirectAttack` に `targetMinCost` を追加 |
| BS04-053 | 天使スローン | Lv2/Lv3 相手のスピリット2体のコアを入れ替える | `kind:"step"`（start / own）＋ 新アクション1つ（対象2体はBP上位2体の決定的簡略化でよい） |
| BS01-025 | 要塞龍ギガ | Lv2 バトル勝利時に自身のコアを他へ自由に置く | `battleWon` ＋ `moveCoresLeavingOne` に近い新アクション（置き先は決定的簡略化） |
| BS05-064 | ペンタン帝国 | Lv2 同Lvの相手にブロックされたとき回復 | 既存 `fieldEvent:"ownSpiritBlocked"`（`targetInstanceId`＝ブロッカー）＋ 「同Lv」条件を1つ追加、`refreshSelf` |
| BS02-079 | 紫水晶の森 | Lv2 ステップ終了時に回復状態3体以上で2ドロー | 「アタックステップ終了時」の誘発点が要る。`fireStepTriggers` を終了時にも呼ぶ形にするのが素直 |

### B. 小さな器（型フィールド or 1アクション）を足せば書ける

| cardId | カード名 | 未実装の節 | 足すもの |
| :-- | :-- | :-- | :-- |
| BS01-093 | 甲精ディース | Lv1/Lv2 ブロック宣言時にブロッカー以外を1体疲労 | `fieldEvent:"ownSpiritBlocked"` は既存。`exhaust` に「イベント対象を除外」する指定を足す |
| BS02-055 | チャウー | Lv2 効果でリザーブへ置かれるコアを+1 | `coreBonus` の逆向き。`removeCores` 経路に「戻すコア数を+N」の器を足す |
| BS05-044 | リトルナイト・ランスロット | Lv3 相手の召喚時効果を受けない | `immunityGrant` の `against` に「相手スピリットの召喚時効果」を追加 |
| BS04-081 | 強者統べる大地 | Lv2 BP10000以上の1体はターンに1回ブロックされない | `step`（attack/own）＋「このターン1回だけブロックされない」フラグ。`ignoreUnblockableThisTurn` の近くに置く |
| BS03-103 | 熾烈極める最前線 | Lv2 覚醒持ちの勝利時に同BPの相手1体を破壊 | `battleWon` ＋ `winnerKeywordFilter` の追加、対象は `TargetFilter.exactBp:"selfBp"` が既にある |
| BS05-065 | 青嵐の虚空 | Lv2 転召持ちがいる間、お互いコスト4以下のマジック使用不可 | `magicRestriction` に「両者・コスト上限・自分の場に指定キーワードがある間」の restriction を追加 |
| BS02-087 | 封印された魔導書 | Lv1 お互いを対象とするマジックの対象を片側だけに変更できる | 既存 `magicTargetRedirect`（`GameState.magicRedirectTo`）の近縁。**選択を挟む形は重いので、片側固定の簡略化＋ card-notes 併記でよい** |
| BS04-078 | 魔影街 | Lv1【呪撃】で破壊した相手のコア1個をボイドへ | 呪撃の破壊処理点にフックを1つ（`resolveAction` 経由ではなく呪撃解決側） |
| BS05-040 | プリンセス・スノーホワイト | Lv1-3 氷姫を対象にした効果の対象を自分のみにできる | `magicTargetRedirect` と同じ機構。**「できる」を自動適用に簡略化**（BS04-054 と同じ扱い。card-notes に記載） |
| BS04-X14 | 魔界七将パンデミウム | Lv2/Lv3 自分がバトル破壊されたとき相手を疲労／Lv3 破壊時お互い手札5枚破棄 | 前者は `fieldEvent:"ownSpiritDestroyed"` ＋ `byBattleOnly`、後者は `triggered:"onDestroy"` ＋ 手札破棄の両者版 |

### C. 先に共有ヘルパーを整える（1つ直すと複数枚が片付く）

#### C-1. 疲労の一元化 → 3枚（**最優先**）

いま `isRested = true` が **13箇所**に散っていて「疲労したとき」の誘発点が無い。
`exhaustSpirit(state, pid, inst)` を `EffectModules` に作り、13箇所をこれに置き換えて、
中で `fieldEvent`（例: `anySpiritExhausted`）を1回発火させる。

- BS05-057 藍紫の虚空 Lv1: コスト1以下が疲労 → そのコア2個を持ち主のトラッシュへ
- BS02-082 生み出される尖兵 Lv2: 武装持ちが疲労 → 1体につきボイドからリザーブへコア1個
- BS02-042 スクルディア Lv2/Lv3: 自身が疲労 → 相手の疲労スピリット1体を回復不可にする

> 置き換えは一括 sed ではなく1箇所ずつ確認する。ブロック宣言時の疲労（`GameEngine`）と
> 効果による疲労（`actions/exhaustRefresh.ts`）で発火させたい／させたくないの差が出たら、
> ヘルパーに `silent` 引数を足すのではなく**呼び分ける**こと。

#### C-2. 「このターンの間」の貸与 → 6枚

`action:"lendSelfThisTurn"` でマジック自身を仮想発生源として場に置く機構がすでにある。
**着手前に `docs/design/TURN_EFFECT_SOURCES.md` を読むこと**（守るべき制約が4つある）。

| cardId | カード名 | 貸す継続効果 |
| :-- | :-- | :-- |
| BS03-134 | パペットストリング | 自分の黄に系統「四道」＋「アルカナ」名扱い（`familyGrant` ＋ `nameAsGrant` の `lentOnly`） |
| BS04-109 | スイッチヒッター | 造兵をバニラとしても扱う（バニラ判定は `isVanillaCard`。インスタンス側に載せる器が要る） |
| BS05-070 | ソウルクラッシュ | 「魔界七将」召喚時に疲労スピリット全破壊（`fieldEvent:"ownSpiritSummoned"` の `lentOnly`） |
| BS05-081 | ネクサスブロケイド | 相手のネクサス効果を発揮させない（`effectSources` から相手ネクサスを外す器） |
| BS01-123 | リターンドロー | 自分のスピリットが手札に戻るたびドロー（「手札に戻ったとき」の誘発点が別途必要） |
| BS05-069 | トランスマイグレーション | デッキ3枚公開→転召持ちを1体召喚→エンドステップにデッキ下へ（`endTurn` に遅延処理が要る） |

⚠️ 貸される側のエントリは **`levels: null` 必須**（仮想発生源は Lv0 なので、`levels` を書くと
**エラーも出ずに一度も発火しない**）。`validate:cards` がこれを検査している。

#### C-3. 「アタック時 → ブロック時」の読み替え → 2枚

`blockTriggersAsAttackAllThisTurn` / `attackTriggersAsBlockThisTurn` という**ターン限定の**器はあるが、
「発生源が場にある間ずっと」の継続版が無い。継続版を1つ足すと下の2枚が同時に片付く。

- BS04-007 ドラグノ近衛兵 Lv1/Lv2: 竜人の『アタック時』を『ブロック時』にも
- BS03-110 星降る巡礼地 Lv2: 【光芒】の効果を『ブロック時』にも

#### C-4. 手札のカードへの継続付与 → 1枚

- BS02-081 緑芽吹く原野 Lv2: 手札の「怪虫」に【神速】

`tempHandKeywordGrants`（ターン終了でリセット）はあるが、これは一時付与。
ネクサスが場にある間ずっと効く形にするには、**手札からの召喚可否を判定する箇所**で
場の発生源を見に行く形にするのが素直（付与を手札カードに書き込まない）。

#### C-5. 系統を「持たないものとして扱う」 → 1枚

- BS03-105 暗礁海域 Lv1: コア2個以下のスピリットは系統をないものとして扱う

`spiritHasFamily` / `matchesFamilyFilter` の**両方**を通す必要がある。
`instHasColor` の `colorsAsContinuous` と同じ「都度再構築」で、
`CardInstance.familiesSuppressed` のようなフラグを立てる形が既存方式に沿う。

### D. 実装しない判断を明文化する候補（`data/card-notes.json` に理由を書く）

| cardId | カード名 | 見送る理由 |
| :-- | :-- | :-- |
| BS05-079 | スリーカード | 「数を数える」地点が条件・オーラ側に約30箇所あり、抜けが「無言で数値だけズレる」形で出る（2026-07-30 に見送り確定済み） |
| BS05-038 | シーサーズ Lv2 | 同上（2体分として数える） |
| BS03-147 | ゴーレムクラフト | ネクサスをスピリットとして扱う＝アタック・ブロック・バトルの全経路がネクサスを受け取れる必要があり、器の作り替えになる |
| BS02-083 | 鏡の回廊 Lv2 | 相手のマジック効果の**無効化**＋ターン1回制限。マジック解決の割り込み点が無い |
| BS04-088 | 栄光の表彰台 Lv1 | 配置コストの支払い方法を選ぶ仕組みが無い（記載済み） |

> 見送るときは `status` を `partial` にして、**どの節が動かないか**を日本語で書く。
> UI がこの note をそのまま表示するので、プレイヤーが読んで分かる文にすること。

---

## 6. テストの書き方（最小テンプレ）

```ts
// scripts/smoke/part107.ts
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== BSxx-xxx カード名：検証する節 ===")
{
    const s = createGame("test-id", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    // …盤面を作る → 誘発を撃つ → assert
}
```

- 誘発は `fireTrigger` / `fireStepTriggers` / `fireBattleWonTriggers` / `resolveMagic` を直接呼ぶのが速い
- プレイヤー操作を通したいときだけ `act(s, "p1", { type: … })`
- **失敗メッセージに実測値を埋める**（`` `実際: ${String(x)}` ``）。原因調査が一発で済む
- `npm run smoke:quiet` は失敗と集計だけ出る。通常はこちらを使う

---

## 7. コミットの粒度

- **バッチ（数枚）が全緑になるたびにコミット**する。未コミットの巨大 diff は再開のたびに読み直しになる
- メッセージは日本語で、**足した器（型・アクション）を1行ずつ書く**。
  あとで「この効果文はどの器で書いたか」を `git log --grep` で引けるようにしておくと効く

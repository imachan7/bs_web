# 効果を実装する

カードの効果を `effects` としてどう書くか、既存の語彙で足りないときにどう足すか。
データの形とスキーマは `ADDING_CARDS.md`、コードの構造は `ARCHITECTURE.md`。

---

## 1. まず既存の語彙を探す（ほとんどはこれで済む）

効果でできることは `server/src/type.ts` の **`EffectAction`（198種）** に列挙されている。
新しいカードの効果は、たいてい既存アクションの組み合わせで書ける。

```bash
# 「破壊」まわりで何ができるかを見る
grep -n 'type: "' server/src/type.ts | grep 破壊

# コアを動かす系
grep -n 'type: "' server/src/type.ts | grep コア
```

**`type.ts` の各行には日本語の説明と、それを使っている実例カード名が書いてある。**
似た効果のカードを思い出せるなら、カード名で引くのが最短:

```bash
grep -n "ダークスカルデーモン" server/src/type.ts
grep -n "ダークスカルデーモン" data/cards/*.json
```

既存カードのデータをそのまま雛形にするのが、いちばん失敗しない。

---

## 2. `kind` の選び方

| 効果文の形 | `kind` | 補足 |
| :-- | :-- | :-- |
| 【激突】【装甲】などキーワード名だけ | `keyword` | **これだけで終わらせない**（続きの効果があることが多い） |
| 「〜したとき、〜する」 | `triggered` | `trigger` に何が起きたかを書く |
| マジックカードの効果 | `magic` | `timing: "main"` か `"flash"` |
| 「〜の間、〜する」（状態が続く） | `aura` | BP増減・耐性など |
| 特定のステップに発揮 | `step` | |
| 「〜できない」（禁止） | `constraint` | |
| 場の他のカードに起きたことへの反応 | `fieldEvent` | ネクサスに多い（→ 3章） |

`kind` は全部で89種ある。上の7つで大半を占めるが、特殊なものは
`grep -n '          kind: "' server/src/type.ts` で一覧できる（各行に説明つき）。

---

## 3. `trigger` と `fieldEvent` の使い分け

ここを間違えると発火しない、あるいは発火しすぎる。

| | 起点 | 例 |
| :-- | :-- | :-- |
| **`TriggerEvent`**（`kind: "triggered"`） | **効果の発生源となったスピリット自身**に起きたこと | `onSummon` `onAttack` `onDestroy` `onBlock` `onBlocked` `onBattleWin` `onBattleLose` `onBattleStart` `onBattleEnd` `onLifeDealt` `onRefreshed` `onTenshoTarget` |
| **`FieldEvent`**（`kind: "fieldEvent"`） | **フィールド上の他のカード**に起きたこと | `ownLifeDamaged` `ownSpiritDestroyed` `ownSpiritSummoned` `opponentDrew` `ownMagicUsed` `anySpiritExhausted` … |

判別のしかた:

- 「**この**スピリットが〜したとき」→ `TriggerEvent`
- 「**自分の**スピリットが〜したとき」「相手が〜したとき」→ `FieldEvent`

`FieldEvent` のいくつかは `self` に**イベントを起こしたカード**が渡る（`ownSpiritSummoned` なら召喚されたスピリット）。
`type.ts` の各行にどれがそうか書いてあるので、`self` を使う効果では必ず確認する。

⚠️ `fieldEvent` の主語を取り違える事故が実際に起きているため、
**`docs/design/SEMANTICS_AUDIT.md` の §3 は効果を実装する前に読む**。
そこに「fieldEvent の主語」「『〜できる』は確認式」「ステップ限定を書くべき3種類」の一般則がまとまっている。

---

## 4. 既存の語彙で足りないとき（3層で足す）

```
① server/src/type.ts                  EffectAction に1行足す（説明コメントと実例カード名を必ず添える）
        ↓
② server/src/logic/actions/*.ts        ハンドラを書く。種類別のファイルへ:
                                         destroy / cores / handDeck / buff / grant /
                                         battleFlow / exhaustRefresh / control / filter
        ↓
③ data/cards/BS0N.json                 カードに書く
```

**①のコメントは手を抜かない。** このリポジトリで型定義が事実上の仕様書になっている。
「なぜこの形にしたか」「どのカードのどの文が根拠か」「簡略化したなら何を捨てたか」を書く。

新しいキーワードを足す場合は、`EffectModules.ts` のキーワードレジストリに登録する。

---

## 5. テストを書く

`scripts/smoke/partN.ts` を**新規に作る**だけでよい。ランナー（`scripts/smoke.ts`）が
ファイル名から自動で拾うので、**import の追記は不要**。

```typescript
// smoke パートN（何を検証するかを冒頭に書く）
import { assert, act, createGame, createInstance, getCard, runTurnStart } from "./helpers"

console.log("=== 検証したいことを1行で ===")
{
    const s = createGame("test-name", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 30                      // コアを潤沢にして支払いの都合を消す
    s.players.p1.hand[0] = "BS04-010"              // 試したいカードを手札へ

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    assert(s.players.p1.field.spirits.length === 1, "フィールドに出ている")
}
```

型は次の3つだけ覚えれば書ける。

| | |
| :-- | :-- |
| `createGame(名前, プレイヤー名, デッキ色)` | 対戦を1つ作る |
| `act(s, pid, action)` | アクションを実行。**成功で `null`、失敗でエラーメッセージ**を返す |
| `assert(条件, 説明)` | 説明は失敗時に表示されるので、**実際の値を埋め込む**と原因が分かりやすい |

盤面を直接組み立てたいときは `createInstance(cardId, turn, cores)` でスピリットを作って
`s.players.p1.field.spirits.push(...)` する。既存パートの冒頭50行ほどを見れば書き方が揃う。

⚠️ **仕様のないままテストを書かない。** テストは既存の実装を写すだけになりがちで、
実際に「対象がいなくても召喚は成立する」という**バグを仕様として固定したテスト**が存在していた
（2026-08-13 に修正）。効果文と照らして「これが正しい」と言えることだけを assert する。

---

## 6. ルールの解釈で迷ったとき

**ゲームの「手順」はリポジトリにほとんど書かれていない。** カードの効果の語彙は `type.ts` に厚く書かれているが、
解決順序や割り込みのタイミングは暗黙に決まっている部分が多い。推測で実装すると
**間違ったまま smoke が全緑になる**。

迷ったら、まず該当する一次資料を読む。

| 迷っていること | 読む文書 |
| :-- | :-- |
| 効果が2つ以上あるときの解決順（「その後」「さらに」「このとき」） | `docs/design/CONJUNCTION.md` |
| バトル中の解決順・BP比較・破壊処理の前後 | `docs/design/TIMING_CHART.md` |
| 「相手は〜」の主語＝誰が選ぶか | `docs/design/CHOOSER_RULES.md` |
| 「〜することで〜する」（コスト） | `docs/design/COST_MODEL.md` |
| プレイヤーに選ばせたい／中断したい | `docs/design/INTERRUPTION_POINTS.md` → `RESUME_STACK.md` |
| 「〜の効果で〜されたとき」の条件 | `docs/design/EFFECT_SOURCE_CONTEXT.md` |
| その規則がどこに書いてあるか分からない | `docs/design/PROCEDURES_AUDIT.md` §2（手順書の索引） |
| 残っている実装漏れをどう進めるか | `docs/design/EFFECT_GAPS_PLAYBOOK.md` |

**どこにも書かれていなかったら、決めたうえで手順書に1行足す。**
チャットやコミットメッセージに残すだけだと同じ規則を何度も発見し直す
（`chooserIsTarget` は3枚のカードで3回再発明された）。

---

## 7. よくある落とし穴

| 症状 | 原因 |
| :-- | :-- |
| 効果を書いたのに発火しない | `trigger` と `fieldEvent` の取り違え（3章）／`levels` が実際のLvと合っていない |
| typecheck も smoke も通るのに動かない | **カードデータは型検査の対象外**。`npm run validate:gaps` を回す |
| キーワードは効くが続きの効果が無い | `kind: "keyword"` を1件書いて満足している（実装漏れの最大要因） |
| 多色カードで判定がおかしい | `card.colors[0]` で色を見ている。`shared/rules.ts` の `cardHasColor` / `instHasColor` を使う |
| 中断を挟むと処理が飛ぶ | `resumeStack` に積んでいない。`docs/design/RESUME_STACK.md` |
| 起動時に `undefined is not a function` | 循環 import しているファイル同士で**トップレベルから**相手の関数を呼んだ |

### 最後に必ず通す1行

```bash
npm run typecheck && npm run validate:cards && npm run validate:notes && npm run validate:gaps && npm run smoke:quiet && npm run build:client
```

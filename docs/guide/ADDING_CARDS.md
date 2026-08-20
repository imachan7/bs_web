# カードを追加する

弾をまるごと足すときと、1枚だけ足す・直すときの実務手順。
効果の中身をどう書くかは `EFFECT_RECIPES.md`、コードの構造は `ARCHITECTURE.md` を参照。

---

## 0. 作業は2段階に分かれている

| 段階 | やること | 自動化 |
| :-- | :-- | :-- |
| **① 素データの取り込み** | 名前・コスト・BP・効果**文**などを Wiki から取る | `scripts/fetch_wiki_cards.py` で自動 |
| **② 効果の構造化** | 効果文を読んで `effects` 配列を書く | **人手**。ここが作業の本体 |

①の出力（`data/staging/`）には `effects` が入っていない。意図的にそうしてある。

---

## 1. 弾をまるごと足す

### 手順1: Wiki から取り込む

```bash
python3 scripts/fetch_wiki_cards.py --set BS10 --refer '第十弾：◯◯' --pages 2 \
    --out data/staging/BS10.json
```

- `--refer` は**必須**。無いと「パラメータ不正」ページが返る（Wiki 側の仕様）
- `--pages` は Wiki のページ数。多すぎても足りない分は空になるだけ
- 取得した HTML は `data/staging/.cache/` にキャッシュされ、2回目以降は再取得しない
- **`REQUEST_INTERVAL_SEC` を縮めたり並列化したりしない**。理由はスクリプト冒頭のコメントに書いてある

パーサーが正しく動いているかは、既存の弾で突き合わせて確認できる:

```bash
python3 scripts/fetch_wiki_cards.py --set BS04 --refer '第四弾：龍帝' --pages 3 --verify
```

### 手順2: staging から本番データへ移す

`data/staging/BS10.json` の内容を `data/cards/BS10.json` へ移す。
このとき `effects` を書き足していく（手順3）。

`data/loadCards.ts` が弾ファイルを読むので、**新しい弾を足したらローダーの対象に入っているか確認する**。

### 手順3: 効果を構造化する（作業の本体）

1枚ずつ、効果文を読んで `effects` を書く。書き方は次章と `EFFECT_RECIPES.md`。

**枚数で進捗を数えない。** 1枚に効果が2つも3つもあるため、枚数で数えると落ちが見えない。
数えるなら**効果文の節（ブロック）の単位**で数える。

### 手順4: 検証する

```bash
npm run typecheck && npm run validate:cards && npm run validate:notes && npm run validate:gaps && npm run smoke:quiet && npm run build:client
```

さらに弾がひととおり入り終わったら、**実行時カバレッジ**も回す（遅いので毎回は不要）:

```bash
npm run coverage:effects
```

これは「書いたのに一度も発火していない効果エントリ」を実測で洗い出す。
データを大量に足した直後は「書いたが smoke が一度も通していない」経路が積み上がるので、
ここでしか見つからないバグがある。実績0の行が出たら smoke の穴なのでテストを足す。

### 手順5: お知らせを出す

`data/announcements.json` に1行足す。

```json
{ "date": "2026-08-18", "category": "new", "text": "第十弾「◯◯」のカード88枚を追加しました" }
```

- `category` は `fix` / `ui` / `new` / `info` / `update`
- **`text` は対戦者が読む文面**。内部用語・ファイル名・カードIDを書かない
- 出すのは「弾などまとまった単位が入り終わったとき」と「対戦者に影響するバグを直したとき」だけ

---

## 2. カードデータのスキーマ

実例（`data/cards/BS09.json` の角竜人ドラケン）。

```json
{
  "cardId": "BS09-003",
  "name": "角竜人ドラケン",
  "type": "spirit",
  "colors": ["red"],
  "cost": 3,
  "reduction": ["red", "red"],
  "family": ["竜人", "地竜"],
  "levels": [
    { "level": 1, "cores": 1, "bp": 3000 },
    { "level": 2, "cores": 3, "bp": 5000 }
  ],
  "symbol": ["red"],
  "flash": false,
  "rarity": "",
  "limited": false,
  "effect": "Lv1･Lv2『このスピリットのアタック時』\nこのスピリットをBP+2000する。\nLv2『自分のアタックステップ』\n軽減シンボルを2色以上持つ自分のスピリットすべてをBP+2000する。",
  "effects": [ ... ]
}
```

| フィールド | 注意 |
| :-- | :-- |
| `cardId` | Wiki の表記そのまま。**他所からハードコードで参照しない** |
| `colors` | **配列**。多色カードがあるので要素1と決め打ちしない |
| `reduction` | 軽減シンボル。単色は自色×N、多色は色ごとの個数 |
| `symbol` | 場に出したときのシンボル。ダブルシンボルは要素2 |
| `effect` | 効果文の**原文**。ここは触らない（実装の答え合わせに使う） |
| `effects` | 構造化した効果。**ここが実装** |
| `limited` / `limitCount` | Wiki の禁止・制限表記。**適用するかは `server/src/logic/deckPolicy.ts` が決める**（現在は冥犬ケルル・ベロスのみ禁止） |

---

## 3. 効果文を `effects` に分解する

**原則: 効果文の1ブロック＝ `effects` の1エントリ。**

上のドラケンの例:

```
Lv1･Lv2『このスピリットのアタック時』          ← ブロック1
このスピリットをBP+2000する。
Lv2『自分のアタックステップ』                  ← ブロック2
軽減シンボルを2色以上持つ自分のスピリットすべてをBP+2000する。
```

```json
[
  {
    "id": "BS09-003-e1",
    "kind": "triggered",          // 「〜したとき」なので誘発
    "trigger": "onAttack",
    "levels": [1, 2],             // 見出しの Lv1･Lv2 をそのまま
    "optional": false,            // 「〜できる」でないので必須
    "action": { "type": "selfBuff", "amount": 2000 }
  },
  {
    "id": "BS09-003-e2",
    "kind": "aura",               // 『自分のアタックステップ』の間ずっと効く
    "levels": [2],
    "aura": {
      "type": "bp",
      "target": "ownAll",
      "amount": 2000,
      "reductionColorsAtLeast": 2,
      "phaseTurn": { "phase": "attack", "turn": "own" }
    }
  }
]
```

見るべき対応関係:

| 効果文 | データ |
| :-- | :-- |
| 見出しの `Lv1･Lv2` | `levels: [1, 2]` |
| `『このスピリットのアタック時』` | `kind: "triggered"` + `trigger: "onAttack"` |
| `『自分のアタックステップ』`（状態が続く） | `kind: "aura"` + `phaseTurn` |
| 「〜できる」 | `optional: true`（実対戦で発動確認が出る） |
| 「軽減シンボルを2色以上持つ」 | `reductionColorsAtLeast: 2` |

`id` は `<cardId>-eN` の連番。

### 落とし穴: キーワードだけ書いて満足しない

```json
{ "id": "X004-e1", "kind": "keyword", "keyword": "awaken", "levels": [1,2,3] }
```

これを1件書くと `effects` が非空になるため、**「効果あり＝実装済み」に見えてしまう**。
キーワードは効果文の1行目にすぎず、**同じカードに別の効果が続いていることが多い**。
実際に長期間見落とされていた13枚のうち8枚がこれだった。

自分の作業を検算する型:

> 対象カードの `effect` テキストを**1節ずつ列挙**し、各節にどの `effects` エントリが対応するかを並べる。
> **対応するエントリが無い節は「未実装」と明記する。**

### 実装しないと決めたときは書き残す

黙って落とさない。`data/card-notes.json` に理由を書く。

- `note` は**対戦者が読む文面**なので140文字以内・句点終わり
- 触ったら `npm run validate:notes` を通す

---

## 4. 1枚だけ足す・直す

```bash
# 1. 対象を確認（IDでなく名前で引く）
grep -n "カード名" data/cards/*.json

# 2. 編集

# 3. 検証（カードデータを触ったら3つとも通す）
npm run validate:cards && npm run validate:notes && npm run validate:gaps
npm run smoke:quiet
```

効果を実装して実装漏れが減ったら、ベースラインを縮める:

```bash
npm run gaps:update      # 減った分を data/effect-gaps-baseline.json に反映
npm run gaps:report      # 残りの全体像を見る
```

---

## 5. 追加後のチェックリスト

- [ ] 効果文の**全ブロック**に対応するエントリがあるか（キーワードだけで終わっていないか）
- [ ] `levels` は見出しの Lv 指定と一致しているか（`validate:gaps` のカテゴリ4が見る。**ここは常にゼロを維持する**）
- [ ] 「〜できる」を `optional: true` にしたか
- [ ] 実装しないと決めた効果は `data/card-notes.json` に理由を書いたか
- [ ] `npm run validate:cards` / `validate:notes` / `validate:gaps` の3つを通したか
- [ ] smoke が全緑か（`npm run smoke:quiet`）
- [ ] 弾がひととおり終わったら `npm run coverage:effects` を回したか
- [ ] お知らせ（`data/announcements.json`）は必要か

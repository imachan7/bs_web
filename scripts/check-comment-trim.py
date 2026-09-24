"""コメント削減の検査：python3 scripts/check-comment-trim.py <元ファイル> <新ファイル>（元は git show HEAD:path > 外の場所 で取る）
1. コメントと空白を除いたコードが一致する（コードを1文字も変えていない）
2. 元のコメントにあった Q番号・日付・⚠️ が新しいファイルにも残っている
"""
import re, sys
from collections import Counter

def code_only(s):
    out = []
    for l in s.split("\n"):
        i = l.find("//")
        out.append(l if i < 0 else l[:i])
    return re.sub(r"\s+", "", "\n".join(out))

def keep_tokens(s):
    toks = Counter()
    for l in s.split("\n"):
        i = l.find("//")
        if i < 0:
            continue
        c = l[i:]
        for t in re.findall(r"Q\d{3,5}|\d{4}-\d{2}-\d{2}|⚠️", c):
            toks[t] += 1
    return toks

old, new = open(sys.argv[1]).read(), open(sys.argv[2]).read()
ok = True
if code_only(old) != code_only(new):
    a, b = code_only(old), code_only(new)
    i = next(i for i in range(min(len(a), len(b))) if a[i] != b[i]) if a[:min(len(a), len(b))] != b[:min(len(a), len(b))] else min(len(a), len(b))
    print("❌ コードが変わっている。最初の違い:", repr(a[max(0, i - 80):i + 80]), "→", repr(b[max(0, i - 80):i + 80]))
    ok = False
else:
    print("✅ コードは同一")
ko, kn = keep_tokens(old), keep_tokens(new)
missing = {t: n for t, n in ko.items() if kn[t] == 0}
if missing:
    print("❌ 消えた裁定・日付:", ", ".join(sorted(missing)))
    ok = False
else:
    print(f"✅ Q番号・日付・⚠️ はすべて残っている（{len(ko)}種）")
print(f"サイズ {len(old.encode())//1024}KB → {len(new.encode())//1024}KB")
sys.exit(0 if ok else 1)

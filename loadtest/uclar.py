#!/usr/bin/env python3
"""k6 --out json çıktısından uç (name etiketi) bazında istek sayısı, hata ve süre özeti.
   python3 loadtest/uclar.py loadtest/results/veri1x.jsonl [phase=agir_altinda]
İkinci argüman verilirse yalnızca o etiketteki istekler sayılır (ör. phase=sakin)."""
import json
import sys
from collections import defaultdict


def pct(values, p):
    if not values:
        return 0
    values = sorted(values)
    k = min(len(values) - 1, max(0, int(round(p / 100 * (len(values) - 1)))))
    return values[k]


def main():
    path = sys.argv[1]
    flt = dict(a.split('=', 1) for a in sys.argv[2:])
    dur = defaultdict(list)
    fail = defaultdict(int)
    with open(path, encoding='utf-8') as f:
        for line in f:
            row = json.loads(line)
            if row.get('type') != 'Point':
                continue
            tags = row['data'].get('tags', {})
            if any(tags.get(k) != v for k, v in flt.items()):
                continue
            name = tags.get('name', '?')
            if row['metric'] == 'http_req_duration':
                dur[name].append(row['data']['value'])
            elif row['metric'] == 'http_req_failed' and row['data']['value'] == 1:
                fail[name] += 1
    print(f"{'uç':48} {'istek':>7} {'hata':>5} {'ortanca':>9} {'p95':>9} {'p99':>9} {'en çok':>9}  (ms)")
    for name, v in sorted(dur.items(), key=lambda kv: -pct(kv[1], 95)):
        print(f"{name[:48]:48} {len(v):7d} {fail[name]:5d} {pct(v, 50):9.0f} {pct(v, 95):9.0f} {pct(v, 99):9.0f} {max(v):9.0f}")


if __name__ == '__main__':
    main()

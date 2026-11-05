#!/usr/bin/env python3
"""k6 --out json çıktısını 10 sn'lik dilimlere böler: istek sayısı, hata, ortanca ve %95. Ani yükte ve dayanıklılık
testinde kesintinin etkisini ve toparlanma süresini görmek için.
   python3 loadtest/dilimler.py /tmp/k6/ani.jsonl"""
import json, sys, collections
from datetime import datetime
b = collections.defaultdict(list); f = collections.Counter(); t0 = None
for line in open(sys.argv[1]):
    r = json.loads(line)
    if r.get('type') != 'Point': continue
    ts = r['data']['time'][:19]
    t = datetime.fromisoformat(ts).timestamp()
    t0 = t if t0 is None else min(t0, t)
    k = r['metric']
    if k == 'http_req_duration': b[int(t)//10*10].append(r['data']['value'])
    elif k == 'http_req_failed' and r['data']['value'] == 1: f[int(t)//10*10] += 1
for k in sorted(b):
    v = sorted(b[k]); p = lambda q: v[min(len(v)-1, int(q*len(v)))]
    print(f"{int(k - t0//10*10):5d} sn  istek {len(v):6d}  hata {f[k]:5d}  ortanca {p(0.5):7.0f} ms  %95 {p(0.95):7.0f} ms")

s = {3, 1, 3}; s.add(7); s.discard(9)
other = {1, 8}
both = s & other; either = s | other
only = s - other; xor = s ^ other
d = {"a": 2}; d["b"] = 3
value = d.get("missing", 0)  # no insertion
d["a"] += 1
old = d.pop("b", None)
for key in list(d):          # snapshot for erasure
    if d[key] == 0: del d[key]
pairs = list(d.items())

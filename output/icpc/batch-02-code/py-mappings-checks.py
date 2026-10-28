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

assert(s=={1,3,7} and both=={1})
assert(either=={1,3,7,8} and only=={3,7} and xor=={3,7,8})
assert(value==0 and old==3 and d=={"a":3})
assert("missing" not in d and pairs==[("a",3)])
assert(len(d)==1 and bool(s))

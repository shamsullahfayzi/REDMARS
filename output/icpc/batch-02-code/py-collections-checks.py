from collections import Counter, defaultdict, deque
c = Counter("abaca"); missing = c["z"]
c.update("bb"); c["a"] -= 3
del c["a"]          # zero is not auto-deleted
g = defaultdict(list)
g[0].append(2)               # creates missing list
q = deque([2]); q.appendleft(1); q.append(3)
front = q.popleft(); back = q.pop()

assert(missing==0 and "z" not in c)
assert(c==Counter({"b":3,"c":1}) and "a" not in c)
assert(dict(g)=={0:[2]})
assert(front==1 and back==3 and list(q)==[2])
assert(g.get(9) is None and 9 not in g)

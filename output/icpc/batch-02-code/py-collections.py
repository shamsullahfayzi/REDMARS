from collections import Counter, defaultdict, deque
c = Counter("abaca"); missing = c["z"]
c.update("bb"); c["a"] -= 3
del c["a"]          # zero is not auto-deleted
g = defaultdict(list)
g[0].append(2)               # creates missing list
q = deque([2]); q.appendleft(1); q.append(3)
front = q.popleft(); back = q.pop()

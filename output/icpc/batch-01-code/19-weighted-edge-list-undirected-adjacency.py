import sys
data = sys.stdin.buffer.read().split()
it = iter(map(int, data))
n, m = next(it), next(it)
g = [[] for _ in range(n)]
edges = []
for _ in range(m):
    u, v, w = next(it)-1, next(it)-1, next(it)
    edges.append((u, v, w))
    g[u].append((v, w))
    g[v].append((u, w))
print(len(g[0]))

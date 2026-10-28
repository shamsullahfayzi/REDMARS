import sys
data = sys.stdin.buffer.read().split()
it = iter(map(int, data))
n = next(it)
g = [[] for _ in range(n)]
for _ in range(n - 1):
    u, v = next(it), next(it)
    g[u].append(v); g[v].append(u)
print(len(g[0]))

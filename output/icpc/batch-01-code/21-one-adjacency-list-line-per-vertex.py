import sys
read = sys.stdin.readline
n = int(read())
g = []
for _ in range(n):
    s = read().strip()
    row = list(map(int, s.split(","))) if s else []
    g.append(row)
print(sum(map(len, g)))

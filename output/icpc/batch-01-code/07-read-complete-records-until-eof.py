import sys
v = list(map(int, sys.stdin.read().split()))
assert len(v) % 2 == 0
for i in range(0, len(v), 2):
    print(v[i] + v[i + 1])

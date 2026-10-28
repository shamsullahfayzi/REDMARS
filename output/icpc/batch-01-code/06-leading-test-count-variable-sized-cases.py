import sys
it = iter(map(int, sys.stdin.read().split()))
T = next(it)
for _ in range(T):
    n = next(it)
    total = sum(next(it) for _ in range(n))
    print(total)

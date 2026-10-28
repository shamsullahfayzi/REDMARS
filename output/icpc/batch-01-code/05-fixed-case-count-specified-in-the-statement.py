import sys
it = iter(map(int, sys.stdin.read().split()))
for _ in range(2):
    a, b = next(it), next(it)
    print(a + b)

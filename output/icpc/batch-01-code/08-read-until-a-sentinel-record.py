import sys
it = iter(map(int, sys.stdin.read().split()))
for a in it:
    b = next(it)
    if a == 0 and b == 0:
        break
    print(a + b)

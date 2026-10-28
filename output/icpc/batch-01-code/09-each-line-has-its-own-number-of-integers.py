import sys
for line in sys.stdin:
    a = list(map(int, line.split()))
    print(len(a), sum(a))

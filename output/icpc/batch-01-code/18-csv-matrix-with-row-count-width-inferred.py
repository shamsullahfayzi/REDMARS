import sys
R = int(sys.stdin.readline())
read = sys.stdin.readline
a = [list(map(int, read().split(",")))
     for _ in range(R)]
assert all(len(row) == len(a[0]) for row in a)
print(len(a), len(a[0]))

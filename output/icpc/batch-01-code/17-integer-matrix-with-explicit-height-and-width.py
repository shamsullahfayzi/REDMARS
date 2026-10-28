import sys
data = sys.stdin.buffer.read().split()
it = iter(map(int, data))
R, C = next(it), next(it)
a = [[next(it) for _ in range(C)]
     for _ in range(R)]
print(sum(map(sum, a)))

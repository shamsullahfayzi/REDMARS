import sys
R, C = map(int, sys.stdin.readline().split())
g = []
for _ in range(R):
    row = "".join(sys.stdin.readline().split())
    assert len(row) == C
    g.append(row)
print(sum(row.count("#") for row in g))

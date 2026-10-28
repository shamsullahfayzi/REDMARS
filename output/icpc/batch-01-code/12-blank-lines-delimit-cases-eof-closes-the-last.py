import sys
total, have = 0, False
for line in sys.stdin:
    if line.strip():
        total += sum(map(int, line.split()))
        have = True
    else:
        if have: print(total)
        total, have = 0, False
if have: print(total)

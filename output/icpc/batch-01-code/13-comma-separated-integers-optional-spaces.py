import sys
s = sys.stdin.readline().strip()
a = [int(x) for x in s.split(",")] if s else []
print(sum(a))

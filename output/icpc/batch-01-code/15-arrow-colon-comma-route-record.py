import sys
s = sys.stdin.readline().strip()
route, payload = s.split(":", 1)
source, target = route.split("->", 1)
km, speed = map(float, payload.split(","))
print(source, target, f"{60 * km / speed:.2f}")

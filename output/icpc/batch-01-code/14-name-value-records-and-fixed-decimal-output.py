import sys
for field in sys.stdin.read().split():
    name, value = field.split(":", 1)
    value = float(value)
    print(f"{name:>6}:{value:7.2f}")

import sys
s = sys.stdin.readline()
if s != "":
    s = s[:-1] if s.endswith("\n") else s
    s = s[:-1] if s.endswith("\r") else s
    print("[" + s + "]")

a = [3, 1, 3]
a.append(5); a.extend([2])
a.insert(1, 9); a[0] = 4
last = a.pop(); a.remove(3)  # first matching 3
del a[1]
b = sorted(a); a.sort(reverse=True)
piece = a[1:]; copied = a[:]
t = (7, "K"); score, name = t
s = "Kabul team"
words = s.split(); joined = "-".join(words)
pos = s.find("team")        # -1 if absent

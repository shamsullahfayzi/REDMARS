from itertools import combinations, permutations
from itertools import product, accumulate, chain
rows = [(2,"B"),(1,"C"),(2,"A")]
ranked = sorted(rows, key=lambda x: (-x[0], x[1]))
ids = list(enumerate(["a","b"], start=1))
pairs = list(zip([1,2], ["a"]))
comb = list(combinations([1,2,3], 2))
perm = list(permutations([1,2]))
bits = list(product([0,1], repeat=2))
pref = [0] + list(accumulate([2,3]))
flat = list(chain.from_iterable([[1,2],[3]]))

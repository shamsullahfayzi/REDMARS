import heapq
from bisect import (bisect_left, bisect_right,
                    insort)
h = [5, 2, 7]; heapq.heapify(h)
heapq.heappush(h, 1); best = heapq.heappop(h)
mx = [-x for x in [5, 2, 7]]
heapq.heapify(mx); biggest = -heapq.heappop(mx)
a = [1, 3, 3, 7]
l = bisect_left(a, 3); r = bisect_right(a, 3)
found = l < len(a) and a[l] == 3
insort(a, 2)

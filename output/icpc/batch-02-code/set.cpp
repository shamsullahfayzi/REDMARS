#include <set>
#include <iterator>
#include <cassert>
using namespace std;
int main() {
    set<int> s{4, 1, 4, 7};    // {1,4,7}
    auto [it, added] = s.insert(3);
    bool has = s.count(4) != 0;
    auto p = s.lower_bound(4);
    if (p != s.end()) s.erase(p);
    int lo = *s.begin(), hi = *s.rbegin();
    auto k = s.lower_bound(3);
    bool hasPrev = (k != s.begin());
    int previous = hasPrev ? *prev(k) : -1;
    // {1,3,7}; previous==1

    assert(added && has && lo==1 && hi==7);
    assert(hasPrev && previous==1);
    assert(s.count(4)==0 && s.size()==3);
}

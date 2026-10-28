#include <array>
#include <algorithm>
#include <cassert>
using namespace std;
int main() {
    array<int, 4> a{};          // all zero
    a.fill(5); a[0] = 2;
    sort(a.begin(), a.end());
    int lo = a.front(), hi = a.back();
    for (const int x : a) { (void)x; }
    // size()==4; empty()==false

    assert(a.size()==4 && !a.empty());
    assert(lo==2 && hi==5);
    assert(a.at(1)==5);
}

#include <vector>
#include <algorithm>
#include <cassert>
using namespace std;
int main() {
    vector<int> a{1, 3, 3, 7};
    auto lo = lower_bound(a.begin(), a.end(), 3);
    auto hi = upper_bound(a.begin(), a.end(), 3);
    auto count3 = hi - lo;            // 2
    auto index = lo - a.begin();      // 1
    bool found = binary_search(a.begin(), a.end(), 4);
    // found=false; hi points to 7

    assert(count3==2 && index==1 && !found && *hi==7);
    assert(lower_bound(a.begin(),a.end(),8)==a.end());
    vector<int> empty;
    assert(lower_bound(empty.begin(),empty.end(),1)==empty.end());
}

#include <vector>
#include <algorithm>
#include <cassert>
using namespace std;
int main() {
    vector<int> a{2, 1, 1};
    sort(a.begin(), a.end());
    int ways = 0;
    do { ++ways; } while (
        next_permutation(a.begin(), a.end()));
    // ways==3: 112,121,211; a reset to 112

    assert(ways==3 && (a==vector<int>{1,1,2}));
    vector<int> empty;
    assert(!next_permutation(empty.begin(),empty.end()));
}

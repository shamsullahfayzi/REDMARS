#include <vector>
#include <algorithm>
#include <numeric>
#include <cassert>
using namespace std;
int main() {
    vector<int> a{3, 1, 3, 2};
    long long sum = accumulate(
        a.begin(), a.end(), 0LL);
    auto cnt = count(a.begin(), a.end(), 3);
    auto hit = find(a.begin(), a.end(), 2);
    auto small = min_element(a.begin(), a.end());
    auto large = max_element(a.begin(), a.end());
    int minValue = *small, maxValue = *large;
    sort(a.begin(), a.end());
    a.erase(unique(a.begin(), a.end()), a.end());
    // a == {1,2,3}; old iterators must not be reused

    assert(sum==9 && cnt==2 && minValue==1 && maxValue==3);
    assert((a==vector<int>{1,2,3}));
    vector<int> empty;
    assert(min_element(empty.begin(),empty.end())==empty.end());
    assert(accumulate(empty.begin(),empty.end(),0LL)==0);
}

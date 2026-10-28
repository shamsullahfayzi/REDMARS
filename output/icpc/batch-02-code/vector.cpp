#include <vector>
#include <algorithm>
#include <cassert>
using namespace std;
int main() {
    vector<int> v{3, 1, 3};
    v.reserve(10);               // size still 3
    v.push_back(7); v.emplace_back(5);
    v[1] = 2;
    auto it = v.insert(v.begin() + 1, 9);
    it = v.erase(it);            // next iterator
    v.pop_back();
    sort(v.begin(), v.end());
    v.erase(unique(v.begin(), v.end()), v.end());
    for (int& x : v) ++x;        // changes elements
    // v is now {3, 4, 8}

    assert((v == vector<int>{3,4,8}));
    assert(v.size()==3 && !v.empty());
    assert(v.capacity()>=10);
    assert(v.at(2)==8);
}

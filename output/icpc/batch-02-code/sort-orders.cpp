#include <vector>
#include <algorithm>
#include <functional>
#include <utility>
#include <cassert>
using namespace std;
int main() {
    vector<int> a{4, 1, 3};
    sort(a.begin(), a.end());          // 1,3,4
    sort(a.begin(), a.end(), greater<int>());
    reverse(a.begin(), a.end());      // 1,3,4 again
    vector<pair<int,int>> p{{2,3},{1,8},{2,1}};
    sort(p.begin(), p.end());         // lexicographic
    sort(p.begin(), p.end(), [](const auto& x,
                               const auto& y) {
        if (x.first != y.first)
            return x.first < y.first;
        return x.second > y.second;
    });                       // (1,8),(2,3),(2,1)

    assert((a==vector<int>{1,3,4}));
    assert((p==vector<pair<int,int>>{{1,8},{2,3},{2,1}}));
}

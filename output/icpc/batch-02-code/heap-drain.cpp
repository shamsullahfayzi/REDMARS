#include <vector>
#include <queue>
#include <cassert>
using namespace std;
int main() {
    vector<int> a{3, 1, 4};
    priority_queue<int> q(a.begin(), a.end());
    auto copy = q; vector<int> order;
    while (!copy.empty()) {
        order.push_back(copy.top()); copy.pop();
    }
    // order={4,3,1}; original q still has 3 items

    assert((order==vector<int>{4,3,1}));
    assert(q.size()==3 && q.top()==4 && copy.empty());
}

#include <queue>
#include <vector>
#include <functional>
#include <utility>
#include <cassert>
using namespace std;
int main() {
    priority_queue<int> mx;
    mx.push(3); mx.push(7); mx.push(2);
    int biggest = mx.top(); mx.pop();
    priority_queue<int, vector<int>, greater<int>> mn;
    mn.push(3); mn.push(7); mn.push(2);
    int smallest = mn.top(); mn.pop();
    using Node = pair<long long, int>;
    priority_queue<Node, vector<Node>,
                   greater<Node>> pq;
    pq.push({9, 2}); pq.push({4, 7});
    // pq.top() == {4,7}: distance first, vertex second

    assert(biggest==7 && smallest==2);
    assert(mx.top()==3 && mn.top()==3);
    assert(pq.top().first==4 && pq.top().second==7);
}

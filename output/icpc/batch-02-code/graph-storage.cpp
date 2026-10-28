#include <vector>
#include <utility>
#include <tuple>
#include <cassert>
using namespace std;
int main() {
    int n = 4;
    vector<vector<int>> g(n);
    g[0].push_back(2);          // one directed edge
    vector<vector<pair<int,int>>> wg(n);
    wg[0].push_back({2, 7});    // neighbor, weight
    vector<tuple<int,int,int>> edges{{0, 2, 7}};

    assert(g.size()==4 && g[0][0]==2);
    assert(wg[0][0].second==7);
    assert(get<2>(edges[0])==7);
}

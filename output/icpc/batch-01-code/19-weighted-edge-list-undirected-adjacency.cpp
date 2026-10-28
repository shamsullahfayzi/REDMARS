#include <iostream>
#include <vector>
#include <utility>
#include <tuple>
using namespace std; int main() {
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int n, m; if (!(cin >> n >> m)) return 0;
    vector<vector<pair<int,long long>>> g(n);
    vector<tuple<int,int,long long>> edges;
    for (int i = 0; i < m; ++i) {
        int u, v; long long w; cin >> u >> v >> w;
        --u; --v;
        edges.emplace_back(u, v, w);
        g[u].push_back({v, w});
        g[v].push_back({u, w});
    }
    cout << g[0].size() << '\n';
}

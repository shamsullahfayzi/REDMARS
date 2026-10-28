#include <iostream>
#include <vector>
using namespace std; int main() {
    int n; if (!(cin >> n)) return 0;
    vector<vector<int>> g(n);
    for (int i = 0; i < n - 1; ++i) {
        int u, v; cin >> u >> v;
        g[u].push_back(v); g[v].push_back(u);
    }
    cout << g[0].size() << '\n';
}

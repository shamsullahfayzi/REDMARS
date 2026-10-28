#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <algorithm>
using namespace std; int main() {
    int n; if (!(cin >> n)) return 0;
    string s; getline(cin, s);
    vector<vector<int>> g(n);
    long long entries = 0;
    for (int u = 0; u < n; ++u) {
        getline(cin, s);
        replace(s.begin(), s.end(), ',', ' ');
        istringstream row(s); int v;
        while (row >> v) g[u].push_back(v);
        entries += g[u].size();
    }
    cout << entries << '\n';
}

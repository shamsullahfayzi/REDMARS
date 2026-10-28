#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <algorithm>
using namespace std; int main() {
    int R; if (!(cin >> R)) return 0;
    string s; getline(cin, s);
    vector<vector<long long>> a;
    for (int r = 0; r < R; ++r) {
        getline(cin, s);
        replace(s.begin(), s.end(), ',', ' ');
        istringstream row(s); long long x;
        vector<long long> v;
        while (row >> x) v.push_back(x);
        if (r && v.size() != a[0].size()) return 1;
        a.push_back(v);
    }
    cout << a.size() << ' ' << a[0].size() << '\n';
}

#include <iostream>
#include <vector>
using namespace std; int main() {
    int R, C;
    if (!(cin >> R >> C)) return 0;
    vector<vector<long long>> a(R,
        vector<long long>(C));
    long long sum = 0;
    for (int r = 0; r < R; ++r)
        for (int c = 0; c < C; ++c) {
            cin >> a[r][c]; sum += a[r][c];
        }
    cout << sum << '\n';
}

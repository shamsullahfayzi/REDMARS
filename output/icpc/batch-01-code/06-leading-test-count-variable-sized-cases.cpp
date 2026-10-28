#include <iostream>
using namespace std; int main() {
    int T;
    if (!(cin >> T)) return 0;
    for (int tc = 0; tc < T; ++tc) {
        int n; cin >> n;
        long long sum = 0, x;
        for (int i = 0; i < n; ++i) {
            cin >> x; sum += x;
        }
        cout << sum << '\n';
    }
}

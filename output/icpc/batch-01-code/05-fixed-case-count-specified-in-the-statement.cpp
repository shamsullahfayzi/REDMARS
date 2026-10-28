#include <iostream>
using namespace std; int main() {
    for (int tc = 0; tc < 2; ++tc) {
        long long a, b;
        if (!(cin >> a >> b)) return 0;
        cout << a + b << '\n';
    }
}

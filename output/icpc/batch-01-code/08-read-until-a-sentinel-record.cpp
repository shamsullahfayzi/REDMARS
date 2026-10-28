#include <iostream>
using namespace std; int main() {
    long long a, b;
    while (cin >> a >> b) {
        if (a == 0 && b == 0) break;
        cout << a + b << '\n';
    }
}

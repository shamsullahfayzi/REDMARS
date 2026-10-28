#include <iostream>
#include <sstream>
#include <string>
using namespace std; int main() {
    string line;
    while (getline(cin, line)) {
        istringstream row(line);
        long long x, sum = 0; int n = 0;
        while (row >> x) { ++n; sum += x; }
        cout << n << ' ' << sum << '\n';
    }
}

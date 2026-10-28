#include <iostream>
#include <sstream>
#include <string>
using namespace std; int main() {
    string s; long long sum = 0; bool have = false;
    while (getline(cin, s)) {
        istringstream row(s); long long x;
        if (!(row >> x)) {
            if (have) cout << sum << '\n';
            sum = 0; have = false;
        } else {
            do { sum += x; } while (row >> x);
            have = true;
        }
    }
    if (have) cout << sum << '\n';
}

#include <iostream>
#include <sstream>
#include <string>
#include <algorithm>
using namespace std; int main() {
    string s;
    if (!getline(cin, s)) return 0;
    replace(s.begin(), s.end(), ',', ' ');
    istringstream row(s); long long x, sum = 0;
    while (row >> x) sum += x;
    cout << sum << '\n';
}

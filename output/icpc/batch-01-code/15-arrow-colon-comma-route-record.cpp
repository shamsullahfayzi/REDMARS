#include <iostream>
#include <string>
#include <iomanip>
using namespace std; int main() {
    string s;
    if (!(cin >> s)) return 0;
    auto a = s.find("->"), b = s.find(':');
    auto c = s.find(',');
    string from = s.substr(0, a);
    string to = s.substr(a + 2, b - a - 2);
    double km = stod(s.substr(b + 1, c - b - 1));
    double speed = stod(s.substr(c + 1));
    cout << from << ' ' << to << ' ' << fixed
         << setprecision(2) << 60 * km / speed
         << '\n';
}

#include <iostream>
#include <string>
#include <limits>
using namespace std; int main() {
    int n;
    if (!(cin >> n)) return 0;
    cin.ignore(numeric_limits<streamsize>::max(),
               '\n');
    for (int i = 0; i < n; ++i) {
        string s; getline(cin, s);
        if (s.size()&&s.back()=='\r') s.pop_back();
        cout << s.size() << '\n';
    }
}

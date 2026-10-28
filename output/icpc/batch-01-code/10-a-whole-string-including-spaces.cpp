#include <iostream>
#include <string>
using namespace std; int main() {
    string s;
    if (!getline(cin, s)) return 0;
    if (s.size() && s.back() == '\r') s.pop_back();
    cout << '[' << s << ']' << '\n';
}

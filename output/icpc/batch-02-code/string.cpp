#include <string>
#include <algorithm>
#include <cctype>
#include <cassert>
using namespace std;
int main() {
    string s = "kabul";
    s[0] = 'K'; s += " team";
    auto pos = s.find("team");
    string part;
    if (pos != string::npos) part = s.substr(pos, 4);
    s.replace(6, 4, "ICPC");
    s.insert(5, ":"); s.erase(5, 1);
    for (char& ch : s)
        ch = static_cast<char>(
            tolower(static_cast<unsigned char>(ch)));
    // s == "kabul icpc"; part == "team"

    assert(s=="kabul icpc" && part=="team");
    assert(s.find("missing")==string::npos);
    assert(s.size()==10 && !s.empty());
}

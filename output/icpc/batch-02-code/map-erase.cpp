#include <map>
#include <cassert>
using namespace std;
int main() {
    map<int, int> mp{{1, 0}, {2, 5}, {3, 0}};
    for (auto it = mp.begin(); it != mp.end(); ) {
        if (it->second == 0) it = mp.erase(it);
        else ++it;
    }
    for (auto& [key, value] : mp) ++value;
    // mp now contains only {2, 6}

    assert(mp.size()==1 && mp.at(2)==6);
    assert(mp.begin()->first==2);
}

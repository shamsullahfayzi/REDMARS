#include <map>
#include <cassert>
using namespace std;
int main() {
    map<int, int> mp{{2, 5}};
    bool seen = mp.find(3) != mp.end();
    mp[3] += 4;                 // inserts 0, then adds
    auto [it, inserted] = mp.emplace(2, 99);
    mp.at(2) = 6;
    auto removed = mp.erase(42);
    // seen=false; inserted=false; removed=0

    assert(!seen && !inserted && removed==0);
    assert(mp.size()==2 && mp.at(2)==6 && mp.at(3)==4);
    assert(it->first==2 && it->second==6);
    auto before=mp.size(); assert(mp.count(9)==0);
    assert(mp.size()==before);
}

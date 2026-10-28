#include <vector>
#include <algorithm>
#include <string>
#include <cassert>
using namespace std;
int main() {
    struct Row { int score; string name; };
    vector<Row> r{{5,"Z"},{9,"B"},{5,"A"}};
    stable_sort(r.begin(), r.end(),
        [](const Row& a, const Row& b) {
            return a.score > b.score;
        });
    // B, Z, A: equal scores keep their input order

    assert(r[0].name=="B" && r[1].name=="Z");
    assert(r[2].name=="A");
}

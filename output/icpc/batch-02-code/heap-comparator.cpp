#include <queue>
#include <vector>
#include <cassert>
using namespace std;
int main() {
    struct Job { int priority, id; };
    struct Cmp {
        bool operator()(const Job& a,
                        const Job& b) const {
            if (a.priority != b.priority)
                return a.priority < b.priority;
            return a.id > b.id;
        }
    };
    priority_queue<Job, vector<Job>, Cmp> q;
    q.push({8, 4}); q.push({8, 2}); q.push({3, 1});
    // Highest priority, then smallest ID: {8,2}

    assert(q.top().priority==8 && q.top().id==2);
    q.pop(); assert(q.top().id==4);
    q.pop(); assert(q.top().id==1);
    q.pop(); assert(q.empty());
}

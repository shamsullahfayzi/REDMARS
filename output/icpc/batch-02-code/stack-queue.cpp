#include <stack>
#include <queue>
#include <cassert>
using namespace std;
int main() {
    stack<int> st;
    st.push(4); st.emplace(8);
    int last = st.top(); st.pop();
    queue<int> q;
    q.push(4); q.emplace(8);
    int first = q.front(); q.pop();
    int newest = q.back();
    // last=8; first=4; newest=8

    assert(last==8 && first==4 && newest==8);
    assert(st.size()==1 && st.top()==4);
    assert(q.size()==1 && q.front()==8);
}

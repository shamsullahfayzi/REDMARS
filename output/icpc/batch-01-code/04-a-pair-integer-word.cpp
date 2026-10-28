#include <iostream>
#include <string>
using namespace std; int main() {
    int id;
    string name;
    if (!(cin >> id >> name)) return 0;
    cout << name << ' ' << id << '\n';
}

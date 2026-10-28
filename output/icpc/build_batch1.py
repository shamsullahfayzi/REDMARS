from pathlib import Path
import json, textwrap, subprocess, sys, re, html, zipfile
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from pypdf import PdfReader
import pdfplumber

ROOT=Path(__file__).resolve().parent
PDF=ROOT.parent/'pdf'/'kabul-icpc-part-01-pages-01-06.pdf'
PDF.parent.mkdir(parents=True,exist_ok=True)
SRC=ROOT/'batch-01-code'; SRC.mkdir(exist_ok=True)
items=[]
def C(headers,body,fast=False):
    setup='    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n' if fast else ''
    return ''.join(f'#include <{h}>\n' for h in headers.split())+'using namespace std; int main() {\n'+setup+textwrap.indent(textwrap.dedent(body).strip(),'    ')+'\n}\n'
def add(p,title,sample,meaning,cc,py,caveat,answer,extra=()):
    items.append(dict(page=p,id=f'{len(items)+1:02}',title=title,sample=sample,meaning=meaning,cpp=cc,py=textwrap.dedent(py).strip()+'\n',caveat=caveat,answer=answer,tests=[(sample,answer),*extra]))

add(1,'One integer + C++ fast-I/O setup','42\n','Read one integer; print it unchanged.',C('iostream',r'''
long long x;
if (!(cin >> x)) return 0;
cout << x << '\n';
''',True),'''
import sys
s = sys.stdin.buffer.readline()
if s.strip():
    print(int(s))
''','The two C++ setup lines belong before any I/O. After disabling synchronization, keep one I/O family; avoid mixing cin/cout with scanf/printf. Python bytes work with int().','42\n',[('', ''),('-7\n','-7\n')])
add(1,'One string token','Kabul\n','Read one word; print it unchanged.',C('iostream string',r'''
string s;
if (cin >> s) cout << s << '\n';
'''),'''
import sys
words = sys.stdin.read().split()
if words:
    print(words[0])
''','A token ends at whitespace. For names or sentences containing spaces, use whole-line input (p. 3). This Python example reads the whole small input.','Kabul\n',[('', ''),('  ICPC  \n','ICPC\n')])
add(1,'Several space-separated integers','8 -3 10\n','Read exactly three integers; print their sum.',C('iostream',r'''
long long a, b, c;
if (!(cin >> a >> b >> c)) return 0;
cout << a + b + c << '\n';
'''),'''
import sys
a, b, c = map(int, sys.stdin.read().split())
print(a + b + c)
''','Both versions accept newlines between the values. Python unpacking requires exactly three tokens. C++ long long still has a finite range: assume the sum fits.','15\n',[('8\n-3  10\n','15\n'),('0 0 0','0\n')])
add(1,'A pair: integer + word','17 Farid\n','Read an ID and a one-word name; print name then ID.',C('iostream string',r'''
int id;
string name;
if (!(cin >> id >> name)) return 0;
cout << name << ' ' << id << '\n';
'''),'''
import sys
parts = sys.stdin.read().split()
student_id = int(parts[0])
name = parts[1]
print(name, student_id)
''','The name is one token by contract. An ID followed by a full name needs line parsing; do not silently discard the rest of the name.','Farid 17\n',[('2\nAli\n','Ali 2\n')])

add(2,'Fixed case count specified in the statement','2 5\n9 1\n','Exactly TWO cases, each a pair; print each pair sum. No test-count token.',C('iostream',r'''
for (int tc = 0; tc < 2; ++tc) {
    long long a, b;
    if (!(cin >> a >> b)) return 0;
    cout << a + b << '\n';
}
'''),'''
import sys
it = iter(map(int, sys.stdin.read().split()))
for _ in range(2):
    a, b = next(it), next(it)
    print(a + b)
''','The literal 2 comes from this illustrative specification. Never invent a case count for a paper that only describes one instance.','7\n10\n',[('0 0\n-5 2\n','0\n-3\n')])
add(2,'Leading test count, variable-sized cases','2\n3\n4 5 6\n0\n','Read T; each case has n followed by n integers. Print each sum.',C('iostream',r'''
int T;
if (!(cin >> T)) return 0;
for (int tc = 0; tc < T; ++tc) {
    int n; cin >> n;
    long long sum = 0, x;
    for (int i = 0; i < n; ++i) {
        cin >> x; sum += x;
    }
    cout << sum << '\n';
}
'''),'''
import sys
it = iter(map(int, sys.stdin.read().split()))
T = next(it)
for _ in range(T):
    n = next(it)
    total = sum(next(it) for _ in range(n))
    print(total)
''','Reset per-case variables inside the loop. Consume n values, not necessarily one physical line. Empty cases may have no data line. Inputs here are complete and valid.','15\n0\n',[('0\n',''),('1\n2 -3 8','5\n')])
add(2,'Read complete records until EOF','2 3\n-1 8\n','No T: read pairs until input ends; print each sum.',C('iostream',r'''
long long a, b;
while (cin >> a >> b) {
    cout << a + b << '\n';
}
'''),'''
import sys
v = list(map(int, sys.stdin.read().split()))
assert len(v) % 2 == 0
for i in range(0, len(v), 2):
    print(v[i] + v[i + 1])
''','Never use while (!cin.eof()): EOF is detected by a failed read. This Python version uses memory proportional to input; use line streaming if one record per line is guaranteed.','5\n7\n',[('', ''),('4\n6','10\n')])
add(2,'Read until a sentinel record','3 2\n0 4\n0 0\n','Print pair sums until BOTH values are zero; sentinel produces no output.',C('iostream',r'''
long long a, b;
while (cin >> a >> b) {
    if (a == 0 && b == 0) break;
    cout << a + b << '\n';
}
'''),'''
import sys
it = iter(map(int, sys.stdin.read().split()))
for a in it:
    b = next(it)
    if a == 0 and b == 0:
        break
    print(a + b)
''','Use AND for a 0 0 sentinel. STUDY (2022) uses this termination shape, but its non-sentinel records also have a payload; read that payload only after checking the header.','5\n4\n',[('0 0\n',''),('2 3\n','5\n')])

add(3,'Each line has its own number of integers','4 8 -1\n\n5\n','Print count and sum for each line. An empty line is a zero-length record.',C('iostream sstream string',r'''
string line;
while (getline(cin, line)) {
    istringstream row(line);
    long long x, sum = 0; int n = 0;
    while (row >> x) { ++n; sum += x; }
    cout << n << ' ' << sum << '\n';
}
'''),'''
import sys
for line in sys.stdin:
    a = list(map(int, line.split()))
    print(len(a), sum(a))
''','Reading all tokens would erase line boundaries. split() accepts repeated whitespace; split(" ") creates empty fields between repeated spaces.','3 11\n0 0\n1 5\n',[('  1\t2  \n','2 3\n'),('', '')])
add(3,'A whole string, including spaces','  Kabul team  \n','Read one line; preserve its leading/trailing spaces. Brackets expose them.',C('iostream string',r'''
string s;
if (!getline(cin, s)) return 0;
if (s.size() && s.back() == '\r') s.pop_back();
cout << '[' << s << ']' << '\n';
'''),'''
import sys
s = sys.stdin.readline()
if s != "":
    s = s[:-1] if s.endswith("\\n") else s
    s = s[:-1] if s.endswith("\\r") else s
    print("[" + s + "]")
''','Do not use strip() when spaces are data. readline() returns an empty string at EOF; a blank input line is "\\n". C++ getline removes \\n; the extra check tolerates CRLF input.','[  Kabul team  ]\n',[('\n','[]\n'),('abc','[abc]\n'),('', '')])
add(3,'A count followed by exactly that many lines','3\nHello Kabul\n\nA B\n','Print each line length; the blank line is the second record.',C('iostream string limits',r'''
int n;
if (!(cin >> n)) return 0;
cin.ignore(numeric_limits<streamsize>::max(),
           '\n');
for (int i = 0; i < n; ++i) {
    string s; getline(cin, s);
    if (s.size()&&s.back()=='\r') s.pop_back();
    cout << s.size() << '\n';
}
'''),'''
import sys
n = int(sys.stdin.readline())
for _ in range(n):
    s = sys.stdin.readline().rstrip("\\r\\n")
    print(len(s))
''','The count occupies its own line. ignore clears its remainder. getline(cin >> ws, s) would skip meaningful empty lines and leading spaces. Length comparison assumes ASCII text.','11\n0\n3\n',[('0\n',''),('1\n  x\n','3\n')])
add(3,'Blank lines delimit cases; EOF closes the last','1 2\n\n3\n4\n','Sum integers in each nonempty group. Output 3, then 7.',C('iostream sstream string',r'''
string s; long long sum = 0; bool have = false;
while (getline(cin, s)) {
    istringstream row(s); long long x;
    if (!(row >> x)) {
        if (have) cout << sum << '\n';
        sum = 0; have = false;
    } else {
        do { sum += x; } while (row >> x);
        have = true;
    }
}
if (have) cout << sum << '\n';
'''),'''
import sys
total, have = 0, False
for line in sys.stdin:
    if line.strip():
        total += sum(map(int, line.split()))
        have = True
    else:
        if have: print(total)
        total, have = 0, False
if have: print(total)
''','Whitespace-only lines are delimiters here, not records. Ignore repeated separators; flush once at EOF. OVRSPED (2022) uses blank case boundaries but also declares T.','3\n7\n',[('\n \n0\n\n\n','0\n'),('', '')])

add(4,'Comma-separated integers, optional spaces','2, 5,-3, 0\n','Read one CSV line of numbers; print their sum.',C('iostream sstream string algorithm',r'''
string s;
if (!getline(cin, s)) return 0;
replace(s.begin(), s.end(), ',', ' ');
istringstream row(s); long long x, sum = 0;
while (row >> x) sum += x;
cout << sum << '\n';
'''),'''
import sys
s = sys.stdin.readline().strip()
a = [int(x) for x in s.split(",")] if s else []
print(sum(a))
''','Valid simple numeric CSV only: no quoted fields or missing values. Replacing commas also tolerates malformed repeated commas in C++; do not mistake this for CSV validation.','4\n',[('0\n','0\n'),('\n','0\n'),(' -4 , 7\n','3\n')])
add(4,'name:value records and fixed decimal output','tea:12.5 rice:3\n','Read whitespace-separated records; print right-aligned names and two decimals.',C('iostream string iomanip',r'''
string field;
cout << fixed << setprecision(2);
while (cin >> field) {
    auto k = field.find(':');
    string name = field.substr(0, k);
    double value = stod(field.substr(k + 1));
    cout << setw(6) << name << ':'
         << setw(7) << value << '\n';
}
'''),'''
import sys
for field in sys.stdin.read().split():
    name, value = field.split(":", 1)
    value = float(value)
    print(f"{name:>6}:{value:7.2f}")
''','Fields have one colon and no spaces in the name. Width is a minimum, never truncation. setw applies only to the next item; fixed/precision persist. Binary floating point is not exact decimal money.','   tea:  12.50\n  rice:   3.00\n',[('x:0\n','     x:   0.00\n'),('longname:4.25','longname:   4.25\n')])
add(4,'Arrow/colon/comma route record','a->b:5,10\n','Read a directed route: 5 km at 10 km/h. Print endpoints and 30.00 minutes.',C('iostream string iomanip',r'''
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
'''),'''
import sys
s = sys.stdin.readline().strip()
route, payload = s.split(":", 1)
source, target = route.split("->", 1)
km, speed = map(float, payload.split(","))
print(source, target, f"{60 * km / speed:.2f}")
''','Assume valid punctuation, no internal whitespace, and speed>0. In OVRSPED, a comma marks an edge payload; a query has only a time after the colon. Parse first, then choose the graph algorithm (p. 25).','a b 30.00\n',[('x->y:1.5,3\n','x y 30.00\n'),('a->a:2,60','a a 2.00\n')])

add(5,'Rectangular character grid: compact or spaced','2 3\n.#.\n# . #\n','Read six single-character cells; store the grid and count # cells.',C('iostream vector string',r'''
int R, C;
if (!(cin >> R >> C)) return 0;
vector<string> g(R, string(C, '.'));
int walls = 0;
for (int r = 0; r < R; ++r)
    for (int c = 0; c < C; ++c) {
        cin >> g[r][c];
        walls += (g[r][c] == '#');
    }
cout << walls << '\n';
'''),'''
import sys
R, C = map(int, sys.stdin.readline().split())
g = []
for _ in range(R):
    row = "".join(sys.stdin.readline().split())
    assert len(row) == C
    g.append(row)
print(sum(row.count("#") for row in g))
''','Each row occupies one line for this Python parser. Whitespace is not a cell. This also reads compact/spaced 0/1 grids; do not use it for multi-digit integers or grids where spaces are meaningful.','3\n',[('1 1\n#\n','1\n'),('2 2\n00\n0 1\n','0\n')])
add(5,'Integer matrix with explicit height and width','2 3\n10 -2 0\n4 5 6\n','Read R*C integer tokens; store a rectangular matrix and print its sum.',C('iostream vector',r'''
int R, C;
if (!(cin >> R >> C)) return 0;
vector<vector<long long>> a(R,
    vector<long long>(C));
long long sum = 0;
for (int r = 0; r < R; ++r)
    for (int c = 0; c < C; ++c) {
        cin >> a[r][c]; sum += a[r][c];
    }
cout << sum << '\n';
'''),'''
import sys
data = sys.stdin.buffer.read().split()
it = iter(map(int, data))
R, C = next(it), next(it)
a = [[next(it) for _ in range(C)]
     for _ in range(R)]
print(sum(map(sum, a)))
''','R is rows, C is columns. Python [[0]*C]*R aliases the same row; use a comprehension. All values and their sum must fit C++ long long. Tokens can wrap across physical lines.','23\n',[('1 1\n-9\n','-9\n'),('2 2\n1 2 3 4','10\n')])
add(5,'CSV matrix with row count; width inferred','2\n0,-1,3\n4,0,-2\n','Read CSV rows; confirm equal widths and print row count and column count.',C('iostream vector string sstream algorithm',r'''
int R; if (!(cin >> R)) return 0;
string s; getline(cin, s);
vector<vector<long long>> a;
for (int r = 0; r < R; ++r) {
    getline(cin, s);
    replace(s.begin(), s.end(), ',', ' ');
    istringstream row(s); long long x;
    vector<long long> v;
    while (row >> x) v.push_back(x);
    if (r && v.size() != a[0].size()) return 1;
    a.push_back(v);
}
cout << a.size() << ' ' << a[0].size() << '\n';
'''),'''
import sys
R = int(sys.stdin.readline())
read = sys.stdin.readline
a = [list(map(int, read().split(",")))
     for _ in range(R)]
assert all(len(row) == len(a[0]) for row in a)
print(len(a), len(a[0]))
''','Assume R>=1 and nonempty valid rows. Unequal height and width means a rectangle, not ragged rows. Minimum Passes (2025) uses this framing; Sudoku fixes nine rows.','2 3\n',[('1\n-1\n','1 1\n'),('2\n1,2\n3,4\n','2 2\n')])

add(6,'Weighted edge list -> undirected adjacency','3 2\n1 2 7\n2 3 4\n','Read n,m then m triples; convert 1-based endpoints to 0-based. Print degree(0).',C('iostream vector utility tuple',r'''
ios::sync_with_stdio(false); cin.tie(nullptr);
int n, m; if (!(cin >> n >> m)) return 0;
vector<vector<pair<int,long long>>> g(n);
vector<tuple<int,int,long long>> edges;
for (int i = 0; i < m; ++i) {
    int u, v; long long w; cin >> u >> v >> w;
    --u; --v;
    edges.emplace_back(u, v, w);
    g[u].push_back({v, w});
    g[v].push_back({u, w});
}
cout << g[0].size() << '\n';
'''),'''
import sys
data = sys.stdin.buffer.read().split()
it = iter(map(int, data))
n, m = next(it), next(it)
g = [[] for _ in range(n)]
edges = []
for _ in range(m):
    u, v, w = next(it)-1, next(it)-1, next(it)
    edges.append((u, v, w))
    g[u].append((v, w))
    g[v].append((u, w))
print(len(g[0]))
''','Assume n>=1 and valid endpoints. For directed edges add only u->v. For an unweighted pair format, read only u,v and use w=1. ROAD (2022) is already 0-based: do NOT subtract 1 there.','1\n',[('1 0\n','0\n'),('3 2\n1 2 8\n1 3 9\n','2\n')])
add(6,'Tree input: n vertices, exactly n-1 edges','4\n0 1\n1 2\n1 3\n','Read a promised tree with 0-based labels. Print degree(0).',C('iostream vector',r'''
int n; if (!(cin >> n)) return 0;
vector<vector<int>> g(n);
for (int i = 0; i < n - 1; ++i) {
    int u, v; cin >> u >> v;
    g[u].push_back(v); g[v].push_back(u);
}
cout << g[0].size() << '\n';
'''),'''
import sys
data = sys.stdin.buffer.read().split()
it = iter(map(int, data))
n = next(it)
g = [[] for _ in range(n)]
for _ in range(n - 1):
    u, v = next(it), next(it)
    g[u].append(v); g[v].append(u)
print(len(g[0]))
''','Assume n>=1 and a valid tree. n-1 edges alone does not prove connectedness. A singleton has zero edges; never read a phantom extra edge.','1\n',[('1\n','0\n'),('2\n0 1\n','1\n')])
add(6,'One adjacency-list line per vertex','3\n1\n0\n\n','Vertex 0 lists 1; vertex 1 lists 0; vertex 2 has no neighbors. Print total entries.',C('iostream vector string sstream algorithm',r'''
int n; if (!(cin >> n)) return 0;
string s; getline(cin, s);
vector<vector<int>> g(n);
long long entries = 0;
for (int u = 0; u < n; ++u) {
    getline(cin, s);
    replace(s.begin(), s.end(), ',', ' ');
    istringstream row(s); int v;
    while (row >> v) g[u].push_back(v);
    entries += g[u].size();
}
cout << entries << '\n';
'''),'''
import sys
read = sys.stdin.readline
n = int(read())
g = []
for _ in range(n):
    s = read().strip()
    row = list(map(int, s.split(","))) if s else []
    g.append(row)
print(sum(map(len, g)))
''','Blank lines are empty lists here: preserve them. Symmetric undirected adjacency input already contains both directions; do not insert reverse edges again. Empty graph n=0 is readable.','2\n',[('0\n','0\n'),('3\n1,2\n0\n0\n','4\n')])

titles={1:'Tokens, pairs, and first working programs',2:'Choose the correct test-case loop',3:'Lines, spaces, blank records, and EOF',4:'Delimiters, records, and exact output',5:'Grids and rectangular matrices',6:'Graphs, trees, indexing, and large input'}
intros={
1:'All examples in this section are new illustrations, not official contest samples. Each language block is a complete program. Inputs satisfy the stated format; lengths and sums fit the declared C++ types. Read the case framing before coding.',
2:'The stopping condition is part of the input format. A known fixed count, a count in the first token, EOF, and a sentinel are different contracts. Samples below use small sums so the parsing structure is easy to verify.',
3:'Use lines when spaces, empty records, or case boundaries matter. [blank] means an empty line in a sample, not literal input.',
4:'Split only the delimiters named by the statement. These are simple contest records, not general quoted CSV. Preserve source order unless sorting is requested. Headers, prompts, debug text, and extra blank lines are output errors.',
5:'Distinguish characters, single digits, and full integer tokens. Select the parser from the cell grammar; R rows and C columns need not be equal.',
6:'Convert indexing once at the input boundary. Adjacency lists help traversal; an edge list helps Kruskal (p. 27). Reinitialize both for each case.'}
notes={
1:[('FAST OUTPUT','Use \\n instead of endl when a flush is unnecessary. Python print adds a newline; for many small answers collect strings and write "\\n".join(out). Interactive tasks need explicit flushing.'),('MANUAL LOCATOR','I/O 1-6 | STL/Python 7-12 | Arrays 13-18 | Greedy/search 19-22 | Graphs 23-30 | DP 31-35 | Math 36-37 | Archetypes 38-44 | Templates 45-47 | Decisions/index 48-50. Pages 7-50 are planned, not yet issued.')],
2:[('EOF IS NOT AN EMPTY LINE','C++ getline succeeds on an empty line; Python input() returns "" on a blank line but raises EOFError at EOF. sys.stdin.readline() returns "" only at EOF. Do not stop a line loop merely because the line is blank.'),('CASE RESET','Clear containers, counters, distance arrays, and answer buffers for every case. Keep a global table only when reuse is intentional. Check the sentinel before allocating or consuming its payload.')],
3:[('PYTHON INPUT LAYERS','Use sys.stdin or sys.stdin.buffer consistently; mixing them can interact with buffering. read().split() loses line and case boundaries.')],
4:[('SPLIT A CSV RECORD','For id,name,mark with no quoted commas: C++ getline(stream, field, \',\') reads one field; Python fields = line.split(\',\') retains interior empty fields. Trim numeric fields as allowed; do not trim meaningful name spaces. These are API fragments, not standalone programs.'),('CONVERSION CHECKS','C++ stoi/stoll/stod may throw and can accept a valid numeric prefix. For validation, use the consumed-position argument and verify the entire allowed field. Python int/float reject extra non-whitespace characters. Valid contest inputs rarely need a custom parser.'),('FORMATTING CHECKS','fixed << setprecision(2) means two digits after the point. Without fixed, precision counts significant digits. setw is a minimum width. Use zero fill deliberately and restore the fill character. Match case of Yes/No or true/false exactly; booleans differ between C++ and Python.'),('ROUNDING','Printed decimal precision is not a universal rounding rule. C++ round uses halfway away from zero; Python round uses ties to even, and binary representation can affect decimal ties. For exact decimal rules, parse scaled integers and implement the specified rule.')],
5:[('SINGLE-DIGIT BINARY ROWS','The character-grid method reads both 0010 and 0 0 1 0. Convert a cell with ch-\'0\' only after knowing it is a digit. In Waterfall Streams (2023), the supplied sample mixes compact and spaced rows; this approach handles both.'),('MATRIX CHECKLIST','Allocate R rows of C values; loop r<R and c<C. Keep bounds checks before accessing neighbors. Do not confuse a zero cell with an absent cell. When only a total is needed, skip matrix storage and accumulate while reading; graph/grid algorithms usually need the cells.'),('SUDOKU FRAMING','For a fixed 9x9 CSV board, repeat the CSV row parser exactly nine times and require nine values per row. There is no leading row count in the supplied 2025 Sudoku sample. The generic example above deliberately uses a different, explicit R header.')],
6:[('LARGE INPUT: MEMORY MATTERS','C++ cin with synchronization disabled is a good default. Python buffer.read().split() is fast but holds the input and token objects; integer conversion adds objects. Stream lines when their boundaries are known and memory is tight. Parsing cannot beat O(input bytes).'),('FINAL I/O CHECK','Confirm case framing, labels, direction, delimiters, blank-line meaning, row widths, units, and output separators. Avoid while(!eof()), unchecked token/line switching, accidental debug output, repeated edge insertion, and state leaking across cases. Normalize input only when the specification permits it.')]
}

# Keep cross-cutting buffering advice on the opening page.
notes[1].extend(notes[3]); notes[3]=[]
notes[5][1]=('MATRIX CHECKLIST','Allocate R rows of C values; loop r<R and c<C. Check bounds before reading neighbors. Zero is still a cell. If only a total is needed, accumulate without storing the matrix.')
notes[5][2]=('SUDOKU FRAMING','Repeat the CSV row parser nine times and require nine values per row. The supplied 2025 Sudoku sample has no row-count header; the generic example above explicitly does.')
notes[5]=notes[5][1:]
intros[5]='R rows and C columns need not be equal. Character input handles the mixed binary rows in Waterfall Streams (2023). For integer cells, parse whole numbers.'
notes[6][1]=('FINAL I/O CHECK','Confirm case framing, labels, direction, delimiters, blank-line meaning, row widths, units, and output separators. Check for debug output, repeated edges, and state leaking between cases.')
notes[6][0]=('LARGE INPUT','C++ fast cin is a good default. Python buffer.read().split() holds the input and token objects; integer conversion adds objects. Stream lines when boundaries are known and memory is tight. Reading costs O(input bytes).')

def compact(s):
    lines=(s[:-1] if s.endswith('\n') else s).split('\n')
    return ' / '.join('[blank]' if line=='' else line for line in lines)

def export_sources():
    md=['# Part 1 - Input and output survival guide (pages 1-6)','',
        'All examples are illustrative. Every C++17 and Python block below is standalone. Sample line breaks in this source are literal.','']
    for p in range(1,7):
        md += [f'## Page {p}: {titles[p]}','',intros[p],'']
        for e in [x for x in items if x['page']==p]:
            stem=f"{e['id']}-"+re.sub('[^a-z0-9]+','-',e['title'].lower()).strip('-')
            e['stem']=stem
            (SRC/(stem+'.cpp')).write_text(e['cpp'],encoding='utf-8')
            (SRC/(stem+'.py')).write_text(e['py'],encoding='utf-8')
            md += [f"### {e['id']}. {e['title']}",'',e['meaning'],'','Input:','```text',e['sample'].rstrip('\n'),'```','', 'C++17:','```cpp',e['cpp'].rstrip(),'```','','Python 3:','```python',e['py'].rstrip(),'```','','Output:','```text',e['answer'].rstrip('\n'),'```','',f"Caveat: {e['caveat']}",'']
        for name,body in notes[p]: md += [f'**{name}:** {body}','']
    (ROOT/'part-01-pages-01-06.md').write_text('\n'.join(md),encoding='utf-8')

def validate():
    results=[]
    for e in items:
        for num,(inp,expected) in enumerate(e['tests'],1):
            r=subprocess.run([sys.executable,str(SRC/(e['stem']+'.py'))],input=inp,text=True,capture_output=True,timeout=5)
            assert r.returncode==0,(e['id'],num,r.stderr)
            assert r.stdout==expected,(e['id'],num,repr(r.stdout),repr(expected))
            results.append({'example':e['id'],'test':num,'status':'PASS'})
    (SRC/'test-cases.json').write_text(json.dumps([{k:e[k] for k in ('id','stem','tests')} for e in items],indent=2),encoding='utf-8')
    return results

FONTDIR=Path('C:/Windows/Fonts')
pdfmetrics.registerFont(TTFont('Body',str(FONTDIR/'arial.ttf')))
pdfmetrics.registerFont(TTFont('BodyBold',str(FONTDIR/'arialbd.ttf')))
pdfmetrics.registerFont(TTFont('Code',str(FONTDIR/'consola.ttf')))
W,H=A4; M=30; GAP=12; CW=(W-2*M-GAP)/2
INK=colors.HexColor('#172333'); MUTED=colors.HexColor('#415264'); ACCENT=colors.HexColor('#163e62')
BODY=ParagraphStyle('body',fontName='Body',fontSize=9.1,leading=11.4,textColor=INK)
SMALL=ParagraphStyle('small',parent=BODY,fontSize=8.6,leading=10.6)
HEAD=ParagraphStyle('head',parent=BODY,fontName='BodyBold',fontSize=10.3,leading=12.0,textColor=ACCENT)
CODE_SIZE=9; CODE_LEAD=10.1
def para(cv,text,x,y,w,style=BODY):
    escaped=re.sub(r' {2,}',lambda m:' '+'&nbsp;'*(len(m[0])-1),html.escape(text))
    p=Paragraph(escaped,style); aw,ah=p.wrap(w,1000); p.drawOn(cv,x,y-ah); return y-ah
def render():
    cv=canvas.Canvas(str(PDF),pagesize=A4)
    cv.setTitle('Kabul ICPC Contest Reference - Part 1 - Pages 1-6')
    cv.setAuthor('ICPC study reference prepared from supplied 2022-2025 papers')
    metrics=[]; code_regions=[]
    for p in range(1,7):
        cv.setFillColor(ACCENT);cv.setFont('BodyBold',8)
        cv.drawString(M,H-24,'KABUL ICPC  |  PART I: INPUT / OUTPUT  |  C++17 + PYTHON 3')
        cv.setFont('BodyBold',15);cv.drawString(M,H-46,titles[p])
        y=para(cv,intros[p],M,H-57,W-2*M,SMALL)-8
        for e in [v for v in items if v['page']==p]:
            y=para(cv,e['id']+'  '+e['title'],M,y,W-2*M,HEAD)-3
            left_y=y
            right_x=M+CW+GAP
            right_y=para(cv,e['meaning'],right_x,y,CW,SMALL)-3
            right_y=para(cv,'IN: '+compact(e['sample']),right_x,right_y,CW,SMALL)-2
            right_y=para(cv,'OUT: '+compact(e['answer']),right_x,right_y,CW,SMALL)-4
            ends=[]
            for col,code in enumerate([e['cpp'],e['py']]):
                cy=left_y if col==0 else right_y
                x=M+col*(CW+GAP)
                cv.setFillColor(MUTED);cv.setFont('BodyBold',7.7)
                cv.drawString(x+4,cy-7,'C++17 - complete program' if col==0 else 'PYTHON 3 - complete program')
                cy-=12
                ls=code.rstrip().splitlines()
                height=len(ls)*CODE_LEAD+8
                code_regions.append((p,e['id'],'cpp' if col==0 else 'py',x,cy,height,ls))
                cv.setFillColor(colors.HexColor('#f2f4f6'));cv.rect(x,cy-height,CW,height,fill=1,stroke=0)
                cv.setFont('Code',CODE_SIZE);cv.setFillColor(INK)
                for j,line in enumerate(ls):
                    width=pdfmetrics.stringWidth(line,'Code',CODE_SIZE)
                    if width>CW-8: raise ValueError(('CODE WIDTH',p,e['id'],line,width,CW-8))
                    cv.drawString(x+4,cy-4-CODE_SIZE-j*CODE_LEAD,line)
                ends.append(cy-height-3)
            watch_col=0 if ends[0]>ends[1] else 1
            watch_x=M+watch_col*(CW+GAP)
            ends[watch_col]=para(cv,'WATCH: '+e['caveat'],watch_x,ends[watch_col],CW,SMALL)-3
            y=min(ends)-4
        for label,body in notes[p]:
            y=para(cv,label+'  '+body,M,y,W-2*M,SMALL)-5
        metrics.append({'page':p,'body_bottom':round(y,2)})
        if y<35: raise ValueError(('PAGE OVERFLOW',p,y))
        cv.setStrokeColor(colors.HexColor('#a5b1bc'));cv.line(M,28,W-M,28)
        cv.setFont('Body',7.5);cv.setFillColor(MUTED)
        cv.drawString(M,17,'Illustrative samples | In compact samples, / = newline; [blank] = empty line')
        cv.drawRightString(W-M,17,f'{p:02d} / 50 planned')
        cv.showPage()
    cv.save()
    reader=PdfReader(str(PDF));assert len(reader.pages)==6
    for i,page in enumerate(reader.pages,1):
        tx=page.extract_text()
        for e in [v for v in items if v['page']==i]:assert e['title'] in tx,(i,e['title'])
    with pdfplumber.open(str(PDF)) as doc:
        for p,eid,lang,x,cy,height,ls in code_regions:
            extracted=doc.pages[p-1].crop((x,H-cy,x+CW,H-cy+height)).extract_text(x_tolerance=1,y_tolerance=2)
            normalized=lambda v: re.sub(r'\s+','',v)
            assert normalized(extracted)==normalized('\n'.join(ls)),('PDF code mismatch',p,eid,lang)
    return metrics

if __name__=='__main__':
    export_sources()
    tests=validate()
    metrics=render()
    report={'pdf':str(PDF),'page_count':6,'standalone_cpp_examples':len(items),'standalone_python_examples':len(items),'python_tests':len(tests),'python_result':'all passed','pdf_code_blocks_matched_to_sources':len(items)*2,'pdf_match_method':'Extracted each code region and compared with source, ignoring whitespace; download source files to retain exact indentation.','cpp_compiled':False,'cpp_note':'No C++ compiler found in PATH or checked common installation/runtime directories; source reviewed, not compiled.','layout':metrics,'tests':tests}
    (ROOT/'batch-01-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    with zipfile.ZipFile(ROOT/'batch-01-code.zip','w',zipfile.ZIP_DEFLATED) as z:
        for f in SRC.iterdir():
            if f.is_file():z.write(f,arcname=f.name)
    print(json.dumps({k:v for k,v in report.items() if k!='tests'},indent=2))

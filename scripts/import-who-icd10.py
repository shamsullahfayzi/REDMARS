"""Emit transactional PostgreSQL input for the WHO ICD-10 2019 English catalog.

Run on the VPS host and pipe stdout to psql -X -v ON_ERROR_STOP=1.
An optional local archive avoids the download and must match the same checksum.
"""
import argparse
import csv
import hashlib
import io
import sys
import zipfile
from pathlib import Path
from urllib.request import urlopen


URL = "https://icdcdn.who.int/icd10/meta/icd102019enMeta.zip"
SHA256 = "a9fa787fa79076e199e46ca645bbc076449853e93e62cd3b2050b96dc96bbc1d"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    if args.archive:
        data = args.archive.read_bytes()
    else:
        with urlopen(URL, timeout=60) as response:
            data = response.read()
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise ValueError("WHO archive checksum mismatch")

    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        def rows(name):
            text = archive.read(f"icd102019syst_{name}.txt").decode("utf-8-sig")
            return csv.reader(io.StringIO(text), delimiter=";")

        chapters = dict(rows("chapters"))
        payload = io.StringIO()
        writer = csv.writer(payload, lineterminator="\n")
        seen = set()
        for row in rows("codes"):
            code, title = row[6], row[8]
            if not code or not title or code in seen or row[1] not in {"T", "N"}:
                raise ValueError(f"Invalid WHO row for {code}")
            seen.add(code)
            writer.writerow((code, title, chapters[row[3]], row[1] == "T"))
        if len(seen) != 12221 or len(chapters) != 22:
            raise ValueError("Incomplete WHO catalog")

    sql = """BEGIN;
CREATE TEMP TABLE who_icd (code text PRIMARY KEY, title text, chapter text, is_billable boolean) ON COMMIT DROP;
COPY who_icd FROM STDIN WITH (FORMAT csv);
""" + payload.getvalue() + r"""\.
INSERT INTO icd_code (code, title, chapter, is_billable)
SELECT code, title, chapter, is_billable FROM who_icd ORDER BY code
ON CONFLICT (code) DO UPDATE SET title = excluded.title, chapter = excluded.chapter,
    is_billable = excluded.is_billable
WHERE (icd_code.title, icd_code.chapter, icd_code.is_billable)
    IS DISTINCT FROM (excluded.title, excluded.chapter, excluded.is_billable);
SELECT count(*) AS who_codes_present FROM who_icd JOIN icd_code USING (code);
COMMIT;
"""
    sys.stdout.buffer.write(sql.encode("utf-8"))


if __name__ == "__main__":
    main()

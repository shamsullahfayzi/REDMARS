export function download(name: string, rows: string[][]) {
  const escape = (v: string) =>
    '"' +
    (/^[=+@-]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? "'" + v : v).replaceAll(
      '"',
      '""',
    ) +
    '"'
  const url = URL.createObjectURL(
    new Blob(
      ['\uFEFF' + rows.map((r) => r.map(escape).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8' },
    ),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

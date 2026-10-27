import { useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import * as c from "@redmars/shared";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/auth/authContext";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { FinanceDateInput } from "./FinanceDateInput";
import { Form, Grid } from "./FinanceRevenue";
type Props = {
  data: c.FinanceWorkspace;
  perform: (path: string, input: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
};
type Pack = z.infer<typeof c.statementPackSchema>;
type Workspace = z.infer<typeof c.reportingWorkspaceSchema>;
const cls =
  "min-h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const money = c.formatMoney;
const date = c.gregorianToShamsi;
const today = () => c.shamsiToGregorian(c.utcToShamsi(new Date()));
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-4 p-5">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children}
    </Card>
  );
}
function Metrics({ rows }: { rows: string[][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map(([label, value]) => (
        <Card className="p-4" key={label}>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-xl font-semibold tabular-nums" dir="ltr">
            {money(value)} <small>AFN</small>
          </p>
        </Card>
      ))}
    </div>
  );
}
const fileSchema = z.object({ filename: z.string(), base64: z.string() });
async function excel(path: string) {
  const f = await apiGet(path, fileSchema),
    bytes = Uint8Array.from(atob(f.base64), (v) => v.charCodeAt(0)),
    url = URL.createObjectURL(
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = f.filename;
  a.click();
  URL.revokeObjectURL(url);
}
export function FinanceStatements({ data, perform, busy }: Props) {
  const { user, roles } = useAuth(),
    own = user!.facilityId;
  const canConfigure = roles.some((r) =>
      ["admin", "finance_manager"].includes(r),
    ),
    canWrite = roles.some((r) =>
      ["admin", "finance_manager", "accountant"].includes(r),
    ),
    canExport = roles.some((r) =>
      [
        "admin",
        "finance_manager",
        "accountant",
        "management",
        "auditor",
      ].includes(r),
    );
  const [mode, setMode] = useState("dashboard"),
    [from, setFrom] = useState(() =>
      c.shamsiToGregorian(c.utcToShamsi(new Date()).slice(0, 8) + "01"),
    ),
    [to, setTo] = useState(today),
    [ids, setIds] = useState([own]),
    [centre, setCentre] = useState(""),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [printed, setPrinted] = useState<Pack | null>(null);
  const workspace = useQuery({
    queryKey: ["finance", "reporting-workspace"],
    queryFn: () =>
      apiGet("/finance/statements/workspace", c.reportingWorkspaceSchema),
  });
  const query = new URLSearchParams({
    from,
    to,
    facilityIds: ids.join(","),
    ...(centre ? { costCentreId: centre } : {}),
  }).toString();
  const report = useQuery({
    queryKey: ["finance", "statements", query],
    queryFn: () =>
      apiGet("/finance/statements?" + query, c.statementPackSchema),
    enabled: from <= to && ids.length > 0,
    refetchInterval: 60000,
  });
  const p = report.data,
    w = workspace.data;
  const exportReport = async (kind: "excel" | "pdf") => {
    setError("");
    setExporting(true);
    try {
      if (kind === "excel") await excel("/finance/statements/excel?" + query);
      else {
        const fresh = await apiGet(
          "/finance/statements/print?" + query,
          c.statementPackSchema,
        );
        flushSync(() => setPrinted(fresh));
        window.print();
      }
    } catch {
      setError(
        "Could not export this report. Check your access and connection, then retry.",
      );
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">
        Statements & closing / گزارش‌های مالی
      </h2>
      <div className="flex flex-wrap gap-2">
        {[
          ["dashboard", "Dashboard"],
          ["accrual", "Accrual statements"],
          ["cash", "Cash reports"],
          ["departments", "Departments"],
          ["custom", "Custom reports"],
          ["close", "Period & year closing"],
          ["access", "Group access"],
        ].map(([id, label]) => (
          <Button
            key={id}
            variant={mode === id ? "default" : "outline"}
            onClick={() => setMode(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      {!["close", "access"].includes(mode) && (
        <Block title="Reporting period">
          <div className="grid gap-3 sm:grid-cols-4">
            <label>
              Shamsi period
              <select
                className={cls}
                aria-label="Reporting period"
                defaultValue=""
                onChange={(e) => {
                  const p = data.periods.find((p) => p.id === e.target.value);
                  if (p) {
                    setFrom(p.startsOn);
                    setTo(p.endsOn);
                  } else {
                    const y = data.fiscalYears.find(
                      (y) => y.id === e.target.value,
                    );
                    if (y) {
                      setFrom(
                        c.shamsiToGregorian(
                          c.utcToShamsi(new Date(y.startsAt)),
                        ),
                      );
                      setTo(
                        c.shamsiToGregorian(
                          c.utcToShamsi(
                            new Date(new Date(y.endsAt).getTime() - 1),
                          ),
                        ),
                      );
                    }
                  }
                }}
              >
                <option value="">Custom range</option>
                {data.fiscalYears.map((y) => (
                  <optgroup key={y.id} label={y.label}>
                    <option value={y.id}>Full year {y.label}</option>
                    {data.periods
                      .filter((p) => p.year === y.year)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} · {p.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              From (Shamsi)
              <FinanceDateInput
                value={from}
                onChange={setFrom}
                aria-label="Report from"
              />
            </label>
            <label>
              Through (Shamsi)
              <FinanceDateInput
                value={to}
                onChange={setTo}
                aria-label="Report through"
              />
            </label>
            <label>
              Department
              <select
                className={cls}
                aria-label="Report department"
                value={centre}
                disabled={ids.length !== 1 || ids[0] !== own}
                onChange={(e) => setCentre(e.target.value)}
              >
                <option value="">All departments</option>
                {w?.centres.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {w && w.facilities.length > 1 && (
            <fieldset className="flex flex-wrap gap-4">
              <legend className="mb-2 font-medium">
                Authorized facilities
              </legend>
              {w.facilities.map((f) => (
                <label key={f.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ids.includes(f.id)}
                    onChange={(e) => {
                      setIds(
                        e.target.checked
                          ? [...ids, f.id]
                          : ids.filter((id) => id !== f.id),
                      );
                      setCentre("");
                    }}
                  />
                  {f.name}
                </label>
              ))}
            </fieldset>
          )}
          <p className="text-sm text-muted-foreground">
            AFN · Posted journals only · Balance sheet as of the selected end
            date · Report dates use Kabul time.
          </p>
          {(from > to || !ids.length) && (
            <p role="alert">
              Choose a valid date range and at least one facility.
            </p>
          )}
          {canExport && (
            <div className="flex gap-2">
              <Button
                disabled={exporting || !p}
                variant="outline"
                onClick={() => void exportReport("excel")}
              >
                Export Excel
              </Button>
              <Button
                disabled={exporting || !p}
                variant="outline"
                onClick={() => void exportReport("pdf")}
              >
                Print / Save PDF
              </Button>
            </div>
          )}
        </Block>
      )}
      {error && <p role="alert">{error}</p>}
      {workspace.isError && (
        <p role="alert">Reporting settings could not load. Refresh to retry.</p>
      )}
      {!["close", "access"].includes(mode) && report.isError && (
        <p role="alert">
          Could not load statements. Check the selected facilities, dates, and
          access.
        </p>
      )}
      {!["close", "access"].includes(mode) && report.isFetching && (
        <p className="text-sm">Updating statements…</p>
      )}
      {p && !["close", "access"].includes(mode) && (
        <>
          {p.warnings.length > 0 && (
            <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
              {p.warnings.map((v) => (
                <p key={v}>{v}</p>
              ))}
            </div>
          )}
          {mode === "dashboard" && (
            <>
              <Metrics
                rows={[
                  ["Accrual income", p.totals.income],
                  ["Accrual expenses", p.totals.expenses],
                  ["Net income", p.totals.netIncome],
                  ["Cash position", p.cash.closing],
                  ["Receivables", p.totals.receivables],
                  ["Supplier payables", p.totals.payables],
                  ["Cash receipts", p.cash.receipts],
                  ["Cash payments", p.cash.payments],
                ]}
              />
              <Block title="Department results">
                <DepartmentTable p={p} />
              </Block>
              <p className="text-sm text-muted-foreground">
                Generated {new Date(p.generatedAt).toLocaleString()} ·{" "}
                {p.facilities.map((f) => f.name).join(" + ")}
              </p>
            </>
          )}
          {mode === "accrual" && <Accrual p={p} />}
          {mode === "departments" && (
            <Block title="Department profit and loss">
              <p>
                Unassigned includes entries without a cost centre. Department
                totals reconcile to the selected accrual P&L.
              </p>
              <DepartmentTable p={p} />
            </Block>
          )}
          {mode === "cash" && (
            <>
              <Cash p={p} />
              {canWrite && (
                <CashEditor
                  key={query}
                  p={p}
                  data={data}
                  own={own}
                  perform={perform}
                  busy={busy}
                />
              )}
            </>
          )}
          {mode === "custom" && w && (
            <CustomReports
              w={w}
              data={data}
              query={query}
              configure={canConfigure}
              canExport={canExport}
              perform={perform}
              busy={busy}
            />
          )}
        </>
      )}
      {mode === "close" && w && (
        <Closing
          data={data}
          w={w}
          canClose={canConfigure}
          perform={perform}
          busy={busy}
        />
      )}
      {mode === "access" && w && (
        <Block title="Consolidated report access">
          <p>
            Each source facility’s administrator grants access to a named
            manager or auditor. Grants allow reports only. The group roll-up
            adds facility books without elimination entries.
          </p>
          <label className="block">
            Your report-access ID
            <input
              className={cls}
              value={w.viewerId}
              readOnly
              aria-label="Your report-access ID"
            />
          </label>
          <p className="text-sm">
            Share this ID with the administrator of each facility that should
            authorize you.
          </p>
          {roles.includes("admin") && (
            <>
              <Form
                title="Grant access to this facility"
                fields={[
                  { name: "viewerId", label: "Viewer’s report-access ID" },
                  { name: "reason", label: "Reason for access" },
                ]}
                submit="Grant access"
                busy={busy}
                onSubmit={(v) =>
                  perform("statements/access", {
                    ...v,
                    active: true,
                    expectedVersion:
                      w.grants.find((g) => g.viewerId === v.viewerId)
                        ?.version ?? 0,
                  })
                }
              />
              <Grid
                headers={[
                  "Viewer",
                  "Home facility",
                  "State",
                  "Reason",
                  "Action",
                ]}
                rows={w.grants.map((g) => [
                  g.name,
                  g.facility,
                  g.active ? "Active" : "Revoked",
                  g.reason,
                  <Form
                    key={g.viewerId}
                    title={g.active ? "Revoke access" : "Restore access"}
                    fields={[{ name: "reason", label: "Reason" }]}
                    submit={g.active ? "Revoke" : "Restore"}
                    busy={busy}
                    onSubmit={(v) =>
                      perform("statements/access", {
                        ...v,
                        viewerId: g.viewerId,
                        active: !g.active,
                        expectedVersion: g.version,
                      })
                    }
                  />,
                ])}
              />
            </>
          )}
        </Block>
      )}
      {printed &&
        createPortal(
          <div id="finance-statements-print" style={{ display: "none" }}>
            <style>{`@media print {body > *:not(#finance-statements-print) {display:none!important} #finance-statements-print {display:block!important;color:black;background:white;font:10pt sans-serif} #finance-statements-print table {width:100%;border-collapse:collapse} #finance-statements-print th,#finance-statements-print td{padding:5pt;border-bottom:1px solid #ccc;text-align:left} #finance-statements-print thead{display:table-header-group} #finance-statements-print tr{break-inside:avoid} #finance-statements-print section{break-before:page} #finance-statements-print h2{margin:12pt 0} @page{size:A4 landscape;margin:12mm}}`}</style>
            <h1>Financial statements — AFN</h1>
            <p>
              {printed.facilities.map((f) => f.name).join(" + ")} ·{" "}
              {date(printed.from)} to {date(printed.to)} · Generated{" "}
              {printed.generatedAt}
            </p>
            {printed.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            <Accrual p={printed} />
            <section>
              <Cash p={printed} />
            </section>
            <section>
              <h2>Departments</h2>
              <DepartmentTable p={printed} />
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
function DepartmentTable({ p }: { p: Pack }) {
  return (
    <Grid
      headers={["Facility", "Department", "Income", "Expenses", "Net income"]}
      rows={p.departments.map((r) => [
        r.facility,
        r.name,
        money(r.income),
        money(r.expenses),
        money(r.netIncome),
      ])}
    />
  );
}
function Accrual({ p }: { p: Pack }) {
  return (
    <>
      <Block title="Profit and loss — accrual">
        <Metrics
          rows={[
            ["Income", p.totals.income],
            ["Expenses", p.totals.expenses],
            ["Net income", p.totals.netIncome],
          ]}
        />
        <Grid
          headers={["Facility", "Account", "Type", "AFN"]}
          rows={p.profitLoss
            .filter((r) => r.result !== "0.00")
            .map((r) => [
              r.facility,
              `${r.code} ${r.name}`,
              r.type,
              money(r.result),
            ])}
        />
      </Block>
      <Block title={"Balance sheet — " + date(p.to)}>
        <Metrics
          rows={[
            ["Assets", p.totals.assets],
            ["Liabilities", p.totals.liabilities],
            ["Equity on ledger", p.totals.equity],
            ["Unclosed earnings", p.totals.unclosedResult],
          ]}
        />
        <Grid
          headers={["Facility", "Account", "Type", "AFN"]}
          rows={p.accounts
            .filter(
              (r) =>
                ["asset", "liability", "equity"].includes(r.type) &&
                r.closing !== "0.00",
            )
            .map((r) => [
              r.facility,
              `${r.code} ${r.name}`,
              r.type,
              money(
                r.type === "asset"
                  ? r.closing
                  : c.moneyDecimal(r.closing).negated(),
              ),
            ])}
        />
        <p>
          Assets less liabilities, equity and unclosed earnings:{" "}
          <strong>{money(p.totals.balanceDifference)} AFN</strong>
        </p>
      </Block>
    </>
  );
}
function Cash({ p }: { p: Pack }) {
  return (
    <>
      <Block title="Cash-flow statement — direct method">
        <Grid
          headers={["Movement", "AFN"]}
          rows={[
            ["Opening cash", p.cash.opening],
            ["Operating activities", p.cash.operating],
            ["Investing activities", p.cash.investing],
            ["Financing activities", p.cash.financing],
            ["Opening imports", p.cash.openingAdjustments],
            ["Unclassified movements", p.cash.unclassified],
            ["Closing cash", p.cash.closing],
            ["Reconciliation difference", p.cash.difference],
          ].map(([l, v]) => [l, money(v)])}
        />
      </Block>
      <Block title="Cash-basis profit and loss">
        <Metrics
          rows={[
            ["Cash income", p.cash.income],
            ["Cash expenses", p.cash.expenses],
            ["Cash net income", p.cash.netIncome],
          ]}
        />
        <p className="text-sm">
          Includes operating receipts and payments allocated to income or
          expense accounts. Review any unclassified or unallocated operating
          movements before using these totals.
        </p>
        <Grid
          headers={["Income / expense allocation", "AFN"]}
          rows={p.cash.rows
            .filter((r) => r.plType)
            .map((r) => [
              `${r.number} · ${r.label}`,
              money(
                r.plType === "expense"
                  ? c.moneyDecimal(r.amount).negated()
                  : r.amount,
              ),
            ])}
        />
      </Block>
      <Block title="Cash position">
        <p className="text-sm">
          Account receipts and payments include transfers. The cash-flow
          statement excludes transfers between cash accounts.
        </p>
        <Grid
          headers={[
            "Facility",
            "Account",
            "Opening",
            "Receipts",
            "Payments",
            "Closing",
          ]}
          rows={p.cash.positions.map((r) => [
            r.facility,
            r.account,
            money(r.opening),
            money(r.receipts),
            money(r.payments),
            money(r.closing),
          ])}
        />
      </Block>
      <Block title="Receipts and payments">
        <Metrics
          rows={[
            ["External receipts", p.cash.receipts],
            ["External payments", p.cash.payments],
          ]}
        />
        <Grid
          headers={[
            "Facility",
            "Journal",
            "Date",
            "Category",
            "Allocation",
            "Signed AFN",
          ]}
          rows={p.cash.rows.map((r) => [
            r.facility,
            <a key={r.journalId} href={"/finance?journal=" + r.journalId}>{r.number}</a>,
            date(r.date),
            r.category,
            r.label,
            money(r.amount),
          ])}
        />
      </Block>
    </>
  );
}
function CashEditor({
  p,
  data,
  own,
  perform,
  busy,
}: { p: Pack; own: string } & Props) {
  const [id, setId] = useState(""),
    [reason, setReason] = useState(""),
    [rows, setRows] = useState<
      Array<{
        category: z.infer<typeof c.cashCategorySchema>;
        accountId: string | null;
        amount: string;
        label: string;
      }>
    >([]);
  const journals = [
    ...new Map(
      p.cash.rows
        .filter((r) => r.facilityId === own)
        .map((r) => [r.journalId, r]),
    ).values(),
  ];
  return (
    <Block title="Review cash classification">
      <p className="text-sm">
        Use when a movement needs an allocation or a correction. Signed
        allocations must equal the journal’s external cash movement. Closed
        periods must be reopened first.
      </p>
      <label>
        Cash journal
        <select
          className={cls}
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setRows(
              p.cash.rows
                .filter((r) => r.journalId === e.target.value)
                .map((r) => ({
                  category: r.category,
                  accountId: r.accountId,
                  amount: r.amount,
                  label: r.label,
                })),
            );
          }}
        >
          <option value="">Select journal</option>
          {journals.map((r) => (
            <option key={r.journalId} value={r.journalId}>
              {r.number} · {date(r.date)} · {r.memo}
            </option>
          ))}
        </select>
      </label>
      {id && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void perform("statements/cash/" + id, {
              rows,
              reason,
              expectedVersion: journals.find((r) => r.journalId === id)!
                .version,
            }).then((ok) => {
              if (ok) setId("");
            });
          }}
        >
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-5">
              <select
                aria-label={"Category " + (i + 1)}
                className={cls}
                value={r.category}
                onChange={(e) =>
                  setRows(
                    rows.map((r, j) =>
                      i === j
                        ? {
                            ...r,
                            category: e.target.value as typeof r.category,
                            accountId: null,
                          }
                        : r,
                    ),
                  )
                }
              >
                {c.cashCategorySchema.options.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <select
                aria-label={"Cash P&L account " + (i + 1)}
                className={cls}
                value={r.accountId ?? ""}
                disabled={r.category !== "operating"}
                onChange={(e) =>
                  setRows(
                    rows.map((r, j) =>
                      i === j ? { ...r, accountId: e.target.value || null } : r,
                    ),
                  )
                }
              >
                <option value="">No P&L allocation</option>
                {data.accounts
                  .filter(
                    (a) =>
                      a.isPosting && ["revenue", "expense"].includes(a.type),
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} {a.name}
                    </option>
                  ))}
              </select>
              <input
                required
                className={cls}
                aria-label={"Signed amount " + (i + 1)}
                value={r.amount}
                onChange={(e) =>
                  setRows(
                    rows.map((r, j) =>
                      i === j ? { ...r, amount: e.target.value } : r,
                    ),
                  )
                }
              />
              <input
                required
                className={cls}
                aria-label={"Allocation label " + (i + 1)}
                value={r.label}
                onChange={(e) =>
                  setRows(
                    rows.map((r, j) =>
                      i === j ? { ...r, label: e.target.value } : r,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="outline"
                disabled={rows.length === 1}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                Remove row
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setRows([
                ...rows,
                {
                  category: "operating",
                  accountId: null,
                  amount: "0.00",
                  label: "",
                },
              ])
            }
          >
            Add allocation
          </Button>
          <label className="block">
            Reason
            <input
              required
              className={cls}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button disabled={busy}>Save classification</Button>
        </form>
      )}
    </Block>
  );
}
function Closing({
  data,
  w,
  canClose,
  perform,
  busy,
}: Props & { w: Workspace; canClose: boolean }) {
  const [period, setPeriod] = useState(
      data.periods.find((p) => !p.closedAt)?.id ?? data.periods[0]?.id ?? "",
    ),
    [reason, setReason] = useState(""),
    [year, setYear] = useState(w.years[0]?.id ?? "");
  const check = useQuery({
    queryKey: ["finance", "close", period],
    queryFn: () =>
      apiGet(
        "/finance/statements/periods/" + period,
        c.financeCloseChecklistSchema,
      ),
    enabled: !!period,
  });
  const p = check.data,
    y = w.years.find((y) => y.id === year);
  return (
    <>
      <Block title="Month-end checklist">
        <label>
          Period
          <select
            className={cls}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {data.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {p.name}
              </option>
            ))}
          </select>
        </label>
        {check.isError && (
          <p role="alert">Could not load the closing checklist.</p>
        )}
        {p && (
          <>
            <p>
              State: <strong>{p.state}</strong>
            </p>
            <Grid
              headers={["Check", "Result", "Details"]}
              rows={p.checks.map((c) => [
                c.label,
                c.passed ? "Ready" : "Action required",
                c.detail,
              ])}
            />
            <p className="text-sm">
              Record adjustments in Journals and have another accountant post
              them. Reconcile cash in Cash & bank, then refresh this checklist.
            </p>
            {canClose && (
              <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
                <label>
                  Reason for closing, locking or reopening
                  <input
                    className={cls}
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <div className="flex gap-2">
                  {(["close", "lock", "reopen"] as const).map((action) => (
                    <Button
                      key={action}
                      variant="outline"
                      disabled={
                        busy ||
                        !reason.trim() ||
                        (action === "close"
                          ? !p.canClose
                          : action === "lock"
                            ? p.state !== "closed"
                            : p.state === "open")
                      }
                      onClick={() =>
                        void perform(`statements/periods/${period}/${action}`, {
                          reason,
                        })
                      }
                    >
                      {action === "close"
                        ? "Close month"
                        : action === "lock"
                          ? "Lock month"
                          : "Reopen with reason"}
                    </Button>
                  ))}
                </div>
              </form>
            )}
            <h4 className="font-medium">Closing history</h4>
            <Grid
              headers={["When", "Action", "User", "Reason"]}
              rows={p.events.map((e) => [
                new Date(e.at).toLocaleString(),
                e.action,
                e.actor,
                e.reason,
              ])}
            />
          </>
        )}
      </Block>
      <Block title="Year-end closing">
        <p>
          Close months 1–11 and reconcile month 12. Prepare the closing entry,
          then have another accountant review and post it in Journals.
          Finalization locks all 12 months and creates the next Shamsi year.
          Opening balances carry forward from the ledger.
        </p>
        <select
          className={cls}
          aria-label="Closing year"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          {w.years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label} ·{" "}
              {y.finalized
                ? "Finalized"
                : y.prepared
                  ? "Prepared"
                  : "Not prepared"}
            </option>
          ))}
        </select>
        {y?.journalId && (
          <a className="underline" href={"/finance?journal=" + y.journalId}>
            Review year-end journal
          </a>
        )}
        {canClose && y && !y.finalized && (
          <Form
            key={year + String(y.prepared)}
            title={
              y.prepared ? "Finalize prepared year" : "Prepare year-end journal"
            }
            fields={[{ name: "reason", label: "Reason" }]}
            submit={
              y.prepared ? "Finalize year" : "Prepare for independent review"
            }
            busy={busy}
            onSubmit={(v) =>
              perform(
                `statements/years/${year}/${y.prepared ? "finalize" : "prepare"}`,
                v,
              )
            }
          />
        )}
        {canClose && y?.prepared && !y.finalized && (
          <Form
            title="Cancel unposted preparation"
            fields={[{ name: "reason", label: "Reason" }]}
            submit="Cancel preparation"
            busy={busy}
            onSubmit={(v) => perform(`statements/years/${year}/cancel`, v)}
          />
        )}
      </Block>
    </>
  );
}
function CustomReports({
  w,
  data,
  query,
  configure,
  canExport,
  perform,
  busy,
}: Props & {
  w: Workspace;
  query: string;
  configure: boolean;
  canExport: boolean;
}) {
  const [id, setId] = useState(""),
    [name, setName] = useState(""),
    [authority, setAuthority] = useState(""),
    [error, setError] = useState(""),
    [rows, setRows] = useState<z.infer<typeof c.reportDefinitionSchema>>([
      {
        label: "",
        accountIds: [],
        measure: "movement",
        sign: "debit",
        costCentreId: null,
      },
    ]);
  const result = useQuery({
    queryKey: ["finance", "custom", id, query],
    queryFn: () =>
      apiGet(
        `/finance/statements/templates/${id}?${query}`,
        c.customReportResultSchema,
      ),
    enabled: !!id,
  });
  return (
    <>
      <Block title="Regulatory, donor and tax layouts">
        <p>
          Configure rows against the required organization’s format. Have the
          layout and account mappings reviewed before filing. These reports use
          this facility’s ledger.
        </p>
        <select
          className={cls}
          aria-label="Custom report"
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            const t = w.templates.find((t) => t.id === e.target.value);
            setName(t?.name ?? "");
            setAuthority(t?.authority ?? "");
            setRows(
              t?.definition ?? [
                {
                  label: "",
                  accountIds: [],
                  measure: "movement",
                  sign: "debit",
                  costCentreId: null,
                },
              ],
            );
          }}
        >
          <option value="">New layout</option>
          {w.templates.map((t) => (
            <option value={t.id} key={t.id}>
              {t.name} · v{t.version}
            </option>
          ))}
        </select>
        {result.data && (
          <>
            <h4 className="font-medium">
              {result.data.name} · {result.data.authority} · v
              {result.data.version}
            </h4>
            <Grid
              headers={["Row", "AFN"]}
              rows={result.data.rows.map((r) => [r.label, money(r.amount)])}
            />
            {canExport && (
              <Button
                variant="outline"
                onClick={() =>
                  void excel(
                    `/finance/statements/templates/${id}/excel?${query}`,
                  ).catch(() => setError("Could not export this report."))
                }
              >
                Export layout to Excel
              </Button>
            )}
          </>
        )}
        {result.isError && <p role="alert">Could not load this report.</p>}
        {error && <p role="alert">{error}</p>}
      </Block>
      {configure && (
        <Block title="Report layout editor">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void perform("statements/templates", {
                name,
                authority,
                definition: rows,
                expectedVersion:
                  w.templates.find((t) => t.name === name)?.version ?? 0,
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Layout name
                <input
                  required
                  className={cls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Organization / form reference
                <input
                  required
                  className={cls}
                  value={authority}
                  onChange={(e) => setAuthority(e.target.value)}
                />
              </label>
            </div>
            {rows.map((r, i) => (
              <fieldset className="space-y-2 rounded border p-3" key={i}>
                <legend>Row {i + 1}</legend>
                <div className="grid gap-2 md:grid-cols-4">
                  <label>
                    Row label
                    <input
                      required
                      className={cls}
                      value={r.label}
                      onChange={(e) =>
                        setRows(
                          rows.map((r, j) =>
                            i === j ? { ...r, label: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Measure
                    <select
                      className={cls}
                      value={r.measure}
                      onChange={(e) =>
                        setRows(
                          rows.map((r, j) =>
                            i === j
                              ? {
                                  ...r,
                                  measure: e.target.value as typeof r.measure,
                                }
                              : r,
                          ),
                        )
                      }
                    >
                      <option value="movement">Period net movement</option>
                      <option value="closing">Closing balance</option>
                      <option value="debit">Period debits</option>
                      <option value="credit">Period credits</option>
                    </select>
                  </label>
                  <label>
                    Positive side
                    <select
                      className={cls}
                      value={r.sign}
                      onChange={(e) =>
                        setRows(
                          rows.map((r, j) =>
                            i === j
                              ? { ...r, sign: e.target.value as typeof r.sign }
                              : r,
                          ),
                        )
                      }
                    >
                      <option value="debit">Debit</option>
                      <option value="credit">Credit</option>
                    </select>
                  </label>
                  <label>
                    Department
                    <select
                      className={cls}
                      value={r.costCentreId ?? ""}
                      onChange={(e) =>
                        setRows(
                          rows.map((r, j) =>
                            i === j
                              ? { ...r, costCentreId: e.target.value || null }
                              : r,
                          ),
                        )
                      }
                    >
                      <option value="">All departments</option>
                      {w.centres.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  Accounts (hold Ctrl to select several)
                  <select
                    required
                    multiple
                    className={cls + " min-h-32"}
                    value={r.accountIds}
                    onChange={(e) =>
                      setRows(
                        rows.map((r, j) =>
                          i === j
                            ? {
                                ...r,
                                accountIds: [...e.target.selectedOptions].map(
                                  (o) => o.value,
                                ),
                              }
                            : r,
                        ),
                      )
                    }
                  >
                    {data.accounts
                      .filter((a) => a.isPosting)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} {a.name}
                        </option>
                      ))}
                  </select>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                >
                  Remove row
                </Button>
              </fieldset>
            ))}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setRows([
                    ...rows,
                    {
                      label: "",
                      accountIds: [],
                      measure: "movement",
                      sign: "debit",
                      costCentreId: null,
                    },
                  ])
                }
              >
                Add report row
              </Button>
              <Button disabled={busy}>Save layout version</Button>
            </div>
          </form>
        </Block>
      )}
    </>
  );
}

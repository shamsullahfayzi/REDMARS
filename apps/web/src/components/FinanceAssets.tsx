import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  assetsWorkspaceSchema,
  budgetReportSchema,
  formatMoney,
  moneyDecimal,
  gregorianToShamsi,
  shamsiToGregorian,
  utcToShamsi,
  type FinanceWorkspace,
} from "@redmars/shared";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/auth/authContext";
import { download } from "@/lib/financeCsv";
import { Form, Grid } from "./FinanceRevenue";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
type Props = {
  data: FinanceWorkspace;
  perform: (path: string, input: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
};
const today = () => shamsiToGregorian(utcToShamsi(new Date()));
const opt = (value: string, label: string) => ({ value, label });
const cls = "h-9 rounded-md border border-input bg-background px-2 text-sm";
export function FinanceAssets({ data, perform, busy }: Props) {
  const { roles } = useAuth(),
    client = useQueryClient();
  const canWrite = roles.some((r) =>
    ["admin", "finance_manager", "accountant"].includes(r),
  );
  const [selected, setSelected] = useState(
    new URLSearchParams(window.location.search).get("asset") ?? "",
  );
  const [register, setRegister] = useState(false),
    [mode, setMode] = useState("bill"),
    [running, setRunning] = useState(false),
    [result, setResult] = useState("");
  const q = useQuery({
    queryKey: ["finance", "assets"],
    queryFn: () => apiGet("/finance/assets", assetsWorkspaceSchema),
    refetchInterval: 60000,
  });
  if (!q.data)
    return (
      <p role={q.isError ? "alert" : undefined}>
        {q.isError ? "Could not load assets." : "Loading assets…"}
      </p>
    );
  const w = q.data,
    a = w.assets.find((a) => a.id === selected);
  const cash = data.accounts
    .filter((a) => a.isCash && a.isActive && a.isPosting)
    .map((a) => opt(a.id, `${a.code} ${a.name}`));
  const active = w.assets.filter(
    (a) => a.status === "active" || a.status === "disposal pending",
  );
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Fixed assets / دارایی‌های ثابت</h2>
      <p className="text-sm text-muted-foreground">
        AFN · Straight-line depreciation · Full Shamsi months from the selected
        starting period · Separate accountant posts each draft.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Assets on books", String(active.length)],
          [
            "Cost",
            formatMoney(
              active.reduce((s, a) => s.add(a.cost), moneyDecimal("0")),
            ),
          ],
          [
            "Net book value",
            formatMoney(
              active.reduce((s, a) => s.add(a.netBookValue), moneyDecimal("0")),
            ),
          ],
        ].map(([name, value]) => (
          <Card key={name} className="p-4">
            <div className="text-sm text-muted-foreground">{name}</div>
            <strong className="text-xl">{value}</strong>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {canWrite && (
          <Button onClick={() => setRegister(!register)}>
            {register ? "Close registration" : "Register asset"}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() =>
            download("asset-register.csv", [
              [
                "Code",
                "Name",
                "Category",
                "Location",
                "Acquired (Shamsi)",
                "Cost AFN",
                "Residual",
                "Life months",
                "Start period",
                "Status",
                "Posted depreciation",
                "Net book value",
                "Bill",
              ],
              ...w.assets.map((a) => [
                a.code,
                a.name,
                a.category,
                a.location,
                gregorianToShamsi(a.acquiredOn),
                a.cost,
                a.residual,
                String(a.lifeMonths),
                a.startPeriod,
                a.status,
                a.depreciation,
                a.netBookValue,
                a.billReference ?? "Cash purchase",
              ]),
            ])
          }
        >
          Export register
        </Button>
        {canWrite && (
          <Button
            variant="outline"
            disabled={busy || running}
            onClick={() => {
              setRunning(true);
              void apiPost(
                "/finance/assets/depreciation",
                { through: today(), idempotencyKey: crypto.randomUUID() },
                z.object({ created: z.number(), errors: z.array(z.string()) }),
              )
                .then((r) => {
                  setResult(
                    `${r.created} depreciation drafts prepared.${r.errors.length ? " " + r.errors.join(" · ") : ""}`,
                  );
                  return client.invalidateQueries({ queryKey: ["finance"] });
                })
                .catch(() =>
                  setResult("Generation failed. Retry after checking the API."),
                )
                .finally(() => setRunning(false));
            }}
          >
            Prepare due depreciation
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        The server checks for completed months every minute while running and
        catches up after restart. Last check:{" "}
        {w.scheduler.lastRun
          ? new Date(w.scheduler.lastRun).toLocaleString()
          : "Pending first check"}
        .
      </p>
      {result && <p role="status">{result}</p>}
      {w.scheduler.errors.map((e) => (
        <p key={e} role="alert">
          {e}
        </p>
      ))}
      {register && canWrite && (
        <>
          <label className="flex gap-3 items-center">
            Acquisition source
            <select
              className={cls}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="bill">Posted supplier bill</option>
              <option value="cash">Cash / bank purchase</option>
            </select>
          </label>
          <Form
            key={mode}
            title="Register a new asset"
            busy={busy}
            submit="Register and prepare acquisition draft"
            fields={[
              { name: "code", label: "Asset tag / code" },
              { name: "name", label: "Asset name" },
              {
                name: "category",
                label: "Category (equipment, furniture, vehicle…)",
              },
              { name: "location", label: "Location" },
              {
                name: "date",
                label: "Acquisition / capitalization date",
                type: "date",
                value: today(),
              },
              ...(mode === "bill"
                ? [
                    {
                      name: "billLineId",
                      label: "Supplier bill line · available AFN",
                      options: w.billLines.map((l) =>
                        opt(
                          l.id,
                          `${l.reference} · ${l.account} · ${formatMoney(l.available)}`,
                        ),
                      ),
                    },
                  ]
                : [
                    {
                      name: "cashAccountId",
                      label: "Payment account",
                      options: cash,
                    },
                  ]),
              { name: "cost", label: "Acquisition cost (AFN)", type: "number" },
              {
                name: "residual",
                label: "Residual value (AFN)",
                type: "number",
                value: "0",
              },
              {
                name: "lifeMonths",
                label: "Useful life (whole months)",
                type: "number",
                value: "60",
              },
              {
                name: "startPeriodId",
                label: "First full month of depreciation",
                options: data.periods
                  .filter((p) => !p.closedAt)
                  .map((p) => opt(p.id, p.label)),
              },
              {
                name: "costCentreId",
                label: "Department / cost centre",
                optional: true,
                options: w.centres.map((c) => opt(c.id, c.name)),
              },
            ]}
            onSubmit={(v) =>
              perform("assets", {
                ...v,
                lifeMonths: Number(v.lifeMonths),
                costCentreId: v.costCentreId || null,
              })
            }
          />
          <p className="text-sm">
            Bill capitalization moves the selected amount from its original
            expense/asset account into registered fixed assets. It does not
            create another supplier payable. A cash purchase records the
            payment.
          </p>
        </>
      )}
      <Grid
        headers={[
          "Asset",
          "Category / location",
          "Cost AFN",
          "Depreciation",
          "Net book value",
          "Status",
          "Details",
        ]}
        rows={w.assets.map((a) => [
          `${a.code} · ${a.name}`,
          `${a.category} · ${a.location}`,
          formatMoney(a.cost),
          formatMoney(a.depreciation),
          formatMoney(a.netBookValue),
          a.status,
          <Button
            key={a.id}
            variant="outline"
            onClick={() => setSelected(a.id)}
          >
            View {a.code}
          </Button>,
        ])}
      />
      {a && (
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">
            {a.code} · {a.name}
          </h3>
          {a.billJournalId && <a className="text-primary underline" href={`/finance?journal=${a.billJournalId}`}>Open supplier bill {a.billReference}</a>}
          <p>
            Acquired {gregorianToShamsi(a.acquiredOn)} ·{" "}
            {a.billReference
              ? `Supplier bill ${a.billReference}`
              : "Cash / bank purchase"}{" "}
            · Residual {formatMoney(a.residual)} AFN · {a.lifeMonths} months
          </p>
          <Grid
            headers={[
              "Event / period",
              "Amount AFN",
              "Proceeds",
              "Journal status",
              "Journal",
            ]}
            rows={a.entries.map((e) => [
              `${e.kind} · ${e.period}`,
              formatMoney(e.amount),
              formatMoney(e.proceeds),
              e.reversed
                ? "reversed"
                : e.reversalPending
                  ? "reversal pending"
                  : e.status,
              <a
                key={e.id}
                className="text-primary underline"
                href={`/finance?journal=${e.journalId}`}
              >
                Review journal
              </a>,
            ])}
          />
          <details>
            <summary className="cursor-pointer font-medium">
              Planned depreciation schedule
            </summary>
            <p className="text-sm my-2">
              Planned amounts assume the asset remains in use. Disposal stops
              later depreciation.
            </p>
            <Button
              variant="outline"
              onClick={() =>
                download(`${a.code}-depreciation.csv`, [
                  ["Shamsi period", "Planned AFN"],
                  ...a.schedule.map((s) => [s.period, s.amount]),
                ])
              }
            >
              Export schedule
            </Button>
            <Grid
              headers={["Period", "Planned AFN"]}
              rows={a.schedule.map((s) => [s.period, formatMoney(s.amount)])}
            />
          </details>
          {canWrite && a.status === "active" && (
            <Form
              title="Dispose / write off asset"
              busy={busy}
              submit="Prepare disposal draft"
              fields={[
                {
                  name: "date",
                  label: "Disposal date",
                  type: "date",
                  value: today(),
                },
                {
                  name: "proceeds",
                  label: "Proceeds (AFN; zero for write-off)",
                  type: "number",
                  value: "0",
                },
                {
                  name: "cashAccountId",
                  label: "Account receiving proceeds",
                  optional: true,
                  options: cash,
                },
                { name: "reason", label: "Disposal / write-off reason" },
              ]}
              onSubmit={(v) =>
                perform(`assets/${a.id}/disposal`, {
                  ...v,
                  cashAccountId: v.cashAccountId || undefined,
                })
              }
            />
          )}
        </Card>
      )}
    </div>
  );
}
export function FinanceTransfers({ data, perform, busy }: Props) {
  const { roles } = useAuth();
  if (
    !roles.some((r) => ["admin", "accountant", "finance_manager"].includes(r))
  )
    return null;
  const cash = data.accounts
    .filter((a) => a.isCash && a.isActive && a.isPosting)
    .map((a) => opt(a.id, `${a.code} ${a.name}`));
  return (
    <Form
      title="Transfer between cash / bank accounts"
      busy={busy}
      submit="Prepare transfer draft"
      fields={[
        { name: "fromAccountId", label: "From account", options: cash },
        { name: "toAccountId", label: "To account", options: cash },
        { name: "date", label: "Transfer date", type: "date", value: today() },
        { name: "amount", label: "Amount (AFN)", type: "number" },
        { name: "reference", label: "Bank / cash transfer reference" },
      ]}
      onSubmit={(v) => perform("assets/transfers", v)}
    />
  );
}
export function FinanceBudgets({ data, perform, busy }: Props) {
  const { roles } = useAuth(),
    configure = roles.some((r) => ["admin", "finance_manager"].includes(r));
  const [year, setYear] = useState(() => {
    const current = Number(utcToShamsi(new Date()).slice(0, 4));
    const years = data.periods.map(p => Number(p.label.slice(0, 4)));
    return years.includes(current) ? current : years.length ? Math.max(...years) : current;
  }),
    [editing, setEditing] = useState<
      z.infer<typeof budgetReportSchema>["rows"][number] | null
    >(null);
  const q = useQuery({
    queryKey: ["finance", "budgets", year],
    queryFn: () =>
      apiGet(`/finance/assets/budgets?year=${year}`, budgetReportSchema),
  });
  const w = useQuery({
    queryKey: ["finance", "assets"],
    queryFn: () => apiGet("/finance/assets", assetsWorkspaceSchema),
  });
  const rows = q.data?.rows ?? [];
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Budgets & variance / بودجه</h2>
      <label className="flex items-center gap-3">
        Shamsi year
        <select
          className={cls}
          value={year}
          onChange={(e) => {
            setYear(Number(e.target.value));
            setEditing(null);
          }}
        >
          {[...new Set(data.periods.map((p) => Number(p.label.slice(0, 4))))]
            .sort()
            .map((y) => (
              <option key={y}>{y}</option>
            ))}
        </select>
      </label>
      <p className="text-sm text-muted-foreground">
        Actuals include posted entries and reversals only. Variance = actual −
        budget. Positive expense variance is overspend; positive revenue
        variance is favorable. Unbudgeted activity remains visible.
      </p>
      {q.isError && <p role="alert">Budget report could not load.</p>}
      <Button
        variant="outline"
        onClick={() =>
          download(`budget-${year}.csv`, [
            [
              "Period",
              "Account",
              "Department",
              "Budget AFN",
              "Actual AFN",
              "Actual minus budget",
              "Result",
            ],
            ...rows.map((r) => [
              r.period,
              r.account,
              r.department,
              r.budget ?? "",
              r.actual,
              r.variance ?? "",
              r.favorable === null
                ? "Unbudgeted"
                : r.favorable
                  ? "Favorable"
                  : "Unfavorable",
            ]),
          ])
        }
      >
        Export variance report
      </Button>
      <Grid
        headers={[
          "Period",
          "Account",
          "Department",
          "Budget AFN",
          "Actual AFN",
          "Variance",
          "Result",
          "Edit",
        ]}
        rows={rows.map((r) => [
          r.period,
          r.account,
          r.department,
          r.budget === null ? "—" : formatMoney(r.budget),
          formatMoney(r.actual),
          r.variance === null ? "—" : formatMoney(r.variance),
          <span
            key="v"
            className={
              r.favorable === false
                ? "text-destructive"
                : "text-muted-foreground"
            }
          >
            {r.favorable === null
              ? "Unbudgeted"
              : r.favorable
                ? "Favorable"
                : "Unfavorable"}
          </span>,
          configure && !data.periods.find(p => p.id === r.periodId)?.closedAt ? (
            <Button key="e" variant="outline" onClick={() => setEditing(r)}>
              Edit budget
            </Button>
          ) : (
            "—"
          ),
        ])}
      />
      {!q.isPending && !rows.length && (
        <p>No budgets or posted activity for {year}.</p>
      )}
      {configure && w.data && (
        <>
          {editing && (
            <Button variant="outline" onClick={() => setEditing(null)}>
              New budget line
            </Button>
          )}
          <Form
            key={`${year}/${editing?.periodId}/${editing?.accountId}/${editing?.costCentreId}/${editing?.version}`}
            title={editing ? "Edit budget line" : "Enter a budget line"}
            busy={busy}
            submit="Save budget"
            fields={[
              {
                name: "periodId",
                label: "Shamsi period",
                value: editing?.periodId,
                options: data.periods
                  .filter(
                    (p) => !p.closedAt && p.label.startsWith(String(year)),
                  )
                  .map((p) => opt(p.id, p.label)),
              },
              {
                name: "accountId",
                label: "Expense / revenue account",
                value: editing?.accountId,
                options: data.accounts
                  .filter(
                    (a) =>
                      a.isActive &&
                      a.isPosting &&
                      ["expense", "revenue"].includes(a.type),
                  )
                  .map((a) => opt(a.id, `${a.code} ${a.name}`)),
              },
              {
                name: "costCentreId",
                label: "Department (blank = whole facility)",
                optional: true,
                value: editing?.costCentreId ?? "",
                options: w.data.centres.map((c) => opt(c.id, c.name)),
              },
              {
                name: "amount",
                label: "Budget amount (AFN)",
                type: "number",
                value: editing?.budget ?? "0",
              },
            ]}
            onSubmit={async (v) => {
              const current = rows.find(
                (r) =>
                  r.periodId === v.periodId &&
                  r.accountId === v.accountId &&
                  r.costCentreId === (v.costCentreId || null),
              );
              const ok = await perform("assets/budgets", {
                ...v,
                costCentreId: v.costCentreId || null,
                expectedVersion:
                  editing &&
                  editing.periodId === v.periodId &&
                  editing.accountId === v.accountId &&
                  editing.costCentreId === (v.costCentreId || null)
                    ? editing.version
                    : (current?.version ?? 0),
              });
              if (ok) setEditing(null);
              return ok;
            }}
          />
          <p className="text-sm">
            For each account and period, use either one whole-facility budget or
            separate department budgets. Set a budget to zero to retain its
            revision history.
          </p>
        </>
      )}
    </div>
  );
}

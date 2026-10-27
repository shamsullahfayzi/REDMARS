import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { z } from "zod";
import {
  attendanceRowSchema,
  credentialStateSchema,
  departmentListResponseSchema,
  employeeListSchema,
  hrConfigSchema,
  hrCredentialSchema,
  hrEmployeeSchema,
  hrPositionSchema,
  leaveRequestSchema,
  leaveTypeSchema,
  rosterEntrySchema,
  shiftTypeSchema,
} from "@redmars/shared";
import { useAuth } from "@/auth/authContext";
import {
  apiDownload,
  apiGet,
  apiPost,
  apiPut,
  apiUpload,
  serverMessage,
} from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { FinanceDateInput } from "@/components/FinanceDateInput";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kabul" }).format(
    new Date(),
  );
const firstOfMonth = () => today().slice(0, 8) + "01";
const shiftDate = (value: string, days: number) => {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const positionsSchema = z.array(hrPositionSchema);
const leaveTypesSchema = z.array(leaveTypeSchema);
const leaveRequestsSchema = z.array(leaveRequestSchema);
const attendanceSchema = z.array(attendanceRowSchema);
const shiftsSchema = z.array(shiftTypeSchema);
const rosterSchema = z.array(rosterEntrySchema);
const rosterWarningsSchema = z.array(
  z.object({
    type: z.string(),
    date: z.string(),
    message: z.string(),
    employeeId: z.string().nullable().optional(),
    departmentId: z.string().nullable().optional(),
    shiftTypeId: z.string().nullable().optional(),
  }),
);
const credentialsSchema = z.array(
  hrCredentialSchema.extend({ employeeName: z.string() }),
);
const attendanceReportSchema = z.array(
  z.object({
    employeeId: z.string(),
    employeeNo: z.string(),
    employeeName: z.string(),
    statuses: z.record(z.string(), z.number()),
    minutesLate: z.number(),
  }),
);
const resultSchema = z.object({}).passthrough();
type Tab =
  "employees" | "credentials" | "attendance" | "leave" | "roster" | "settings";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
function Table({
  headings,
  children,
}: {
  headings: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {headings.map((h) => (
              <th key={h} className="px-3 py-2 text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function ErrorText({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {serverMessage(error) ?? "The request could not be completed."}
    </p>
  ) : null;
}
function downloadTable(
  fileName: string,
  rows: Array<Array<string | number>>,
  excel = false,
) {
  const escape = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
  const content = excel
    ? `<table>${rows.map((r) => `<tr>${r.map((v) => `<td>${String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</td>`).join("")}</tr>`).join("")}</table>`
    : rows.map((r) => r.map(escape).join(",")).join("\r\n");
  const blob = new Blob([excel ? `\ufeff${content}` : `\ufeff${content}`], {
    type: excel ? "application/vnd.ms-excel" : "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName}.${excel ? "xls" : "csv"}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function HrPage() {
  const { roles } = useAuth();
  const admin = roles.includes("admin");
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab") as Tab | null;
  const tab: Tab =
    rawTab &&
    [
      "employees",
      "credentials",
      "attendance",
      "leave",
      "roster",
      "settings",
    ].includes(rawTab)
      ? rawTab
      : admin
        ? "employees"
        : "leave";
  const tabs: Tab[] = admin
    ? ["employees", "credentials", "attendance", "leave", "roster", "settings"]
    : ["leave", "roster"];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Human resources"
        description="Axon Nura employee records, credentials, attendance, leave and duty roster."
      />
      <nav className="flex flex-wrap gap-2" aria-label="HR sections">
        {tabs.map((x) => (
          <Button
            key={x}
            variant={tab === x ? "default" : "outline"}
            onClick={() => setParams({ tab: x })}
          >
            {x[0].toUpperCase() + x.slice(1)}
          </Button>
        ))}
      </nav>
      {tab === "employees" && <Employees />}
      {tab === "credentials" && <Credentials />}
      {tab === "attendance" && <Attendance />}
      {tab === "leave" && <Leave canApprove={admin} />}
      {tab === "roster" && <Roster canEdit={admin} />}
      {tab === "settings" && <HrSettings />}
    </div>
  );
}

function useReferenceData() {
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiGet("/departments", departmentListResponseSchema),
  });
  const positions = useQuery({
    queryKey: ["hr", "positions"],
    queryFn: () => apiGet("/hr/positions", positionsSchema),
  });
  return {
    departments: departments.data?.departments.filter((x) => x.isActive) ?? [],
    positions: positions.data?.filter((x) => x.isActive) ?? [],
    positionsLoaded: positions.isSuccess,
  };
}

function Employees() {
  const qc = useQueryClient(),
    refs = useReferenceData();
  const [q, setQ] = useState(""),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const list = useQuery({
    queryKey: ["hr", "employees", q],
    queryFn: () =>
      apiGet(
        `/employees?q=${encodeURIComponent(q)}&page=1`,
        employeeListSchema,
      ),
  });
  const detail = useQuery({
    queryKey: ["hr", "employee", selectedId],
    queryFn: () => apiGet(`/employees/${selectedId}`, hrEmployeeSchema),
    enabled: Boolean(selectedId),
  });
  const save = useMutation({
    mutationFn: (body: unknown) =>
      apiPost("/employees", body, hrEmployeeSchema),
    onSuccess: (e) => {
      setSelectedId(e.id);
      setNotice(`Employee ${e.employeeNo} created.`);
      void qc.invalidateQueries({ queryKey: ["hr", "employees"] });
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const salary = String(f.get("salary") ?? "");
    save.mutate({
      firstName: f.get("firstName"),
      fatherName: f.get("fatherName") || null,
      lastName: f.get("lastName") || null,
      sex: f.get("sex"),
      phone: f.get("phone") || null,
      departmentId: f.get("departmentId"),
      positionId: f.get("positionId"),
      employmentType: f.get("employmentType"),
      joinedOn: f.get("joinedOn"),
      baseSalaryMinor: salary ? Math.round(Number(salary) * 100) : null,
      salaryCurrency: "AFN",
    });
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Employee register</h2>
          <Input
            className="max-w-xs"
            placeholder="Search name, number or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {list.isPending ? (
          <p>Loading employees…</p>
        ) : (
          <Table
            headings={["No.", "Employee", "Department", "Position", "Status"]}
          >
            {list.data?.items.map((e) => (
              <tr
                key={e.id}
                className="cursor-pointer border-t hover:bg-muted/30"
                onClick={() => setSelectedId(e.id)}
              >
                <td className="px-3 py-2 font-mono">{e.employeeNo}</td>
                <td className="px-3 py-2 font-medium">{e.fullName}</td>
                <td className="px-3 py-2">{e.departmentName}</td>
                <td className="px-3 py-2">{e.positionTitle}</td>
                <td className="px-3 py-2">{e.status}</td>
              </tr>
            ))}
          </Table>
        )}
        <ErrorText error={list.error} />
      </Card>
      <div className="space-y-5">
        {selectedId && detail.data ? (
          <EmployeeDetail employee={detail.data} />
        ) : (
          <Card className="space-y-4 p-5">
            {refs.positionsLoaded && refs.positions.length === 0 && (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p>
                  Create an active clinical position such as Doctor or Psychiatrist before adding
                  the employee.
                </p>
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  to="/hr?tab=settings"
                >
                  Create a clinical position
                </Link>
              </div>
            )}
            <form className="space-y-3" onSubmit={submit}>
              <h2 className="text-lg font-semibold">New employee</h2>
              <Field label="First name">
                <Input name="firstName" required />
              </Field>
              <Field label="Father name">
                <Input name="fatherName" />
              </Field>
              <Field label="Last name">
                <Input name="lastName" />
              </Field>
              <Field label="Sex">
                <Select name="sex" required defaultValue="">
                  <option value="">Select…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="undisclosed">Undisclosed</option>
                </Select>
              </Field>
              <Field label="Phone">
                <Input name="phone" />
              </Field>
              <Field label="Department">
                <Select name="departmentId" required defaultValue="">
                  <option value="">Select…</option>
                  {refs.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Position">
                <Select name="positionId" required defaultValue="">
                  <option value="">Select…</option>
                  {refs.positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.titleEn}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Employment type">
                <Select name="employmentType" defaultValue="permanent">
                  <option value="permanent">Permanent</option>
                  <option value="fixed_term">Fixed term</option>
                  <option value="part_time">Part time</option>
                  <option value="temporary">Temporary</option>
                  <option value="volunteer">Volunteer</option>
                </Select>
              </Field>
              <Field label="Joined date (Shamsi)">
                <DateName name="joinedOn" />
              </Field>
              <Field label="Base salary (AFN)">
                <Input name="salary" type="number" min="0" />
              </Field>
              <Button className="w-full" disabled={save.isPending}>
                Create employee
              </Button>
              <ErrorText error={save.error} />
              {notice && <p className="text-sm text-emerald-700">{notice}</p>}
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}

function DateName({
  name,
  initial = today(),
}: {
  name: string;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <FinanceDateInput value={value} onChange={setValue} required />
      <input type="hidden" name={name} value={value} />
    </>
  );
}

function EmployeeDetail({
  employee,
}: {
  employee: z.infer<typeof hrEmployeeSchema>;
}) {
  const qc = useQueryClient(),
    [message, setMessage] = useState("");
  const upload = useMutation({
    mutationFn: ({
      file,
      title,
      type,
    }: {
      file: File;
      title: string;
      type: string;
    }) => {
      const form = new FormData();
      form.set("file", file);
      form.set("title", title);
      form.set("type", type);
      return apiUpload(
        `/employees/${employee.id}/documents`,
        form,
        z.object({}).passthrough(),
      );
    },
    onSuccess: () => {
      setMessage("Document saved.");
      void qc.invalidateQueries({ queryKey: ["hr", "employee", employee.id] });
    },
  });
  const credential = useMutation({
    mutationFn: (body: unknown) =>
      apiPost(
        `/employees/${employee.id}/credentials`,
        body,
        hrCredentialSchema,
      ),
    onSuccess: () => {
      setMessage("Credential saved.");
      void qc.invalidateQueries({ queryKey: ["hr", "employee", employee.id] });
    },
  });
  const exit = useMutation({
    mutationFn: () =>
      apiPost(
        `/employees/${employee.id}/exit`,
        { exitDate: today(), exitReason: "Employment ended by HR" },
        hrEmployeeSchema,
      ),
    onSuccess: () => {
      setMessage("Employee exited and linked account disabled.");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
  });
  const account = useMutation({
    mutationFn: (body: unknown) =>
      apiPost(`/employees/${employee.id}/account`, body, resultSchema),
    onSuccess: (result) => {
      setMessage(
        result.practitionerId
          ? "Doctor account and linked practitioner profile created."
          : "Linked user account created.",
      );
      void qc.invalidateQueries({ queryKey: ["hr", "employee", employee.id] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["practitioners"] });
    },
  });
  return (
    <Card className="space-y-4 p-5">
      <div>
        <p className="font-mono text-xs text-muted-foreground">
          {employee.employeeNo}
        </p>
        <h2 className="text-xl font-semibold">{employee.fullName}</h2>
        <p className="text-sm text-muted-foreground">
          {employee.positionTitle} · {employee.departmentName}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd>{employee.status}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{employee.joinedOn}</dd>
        </div>
        {employee.baseSalaryMinor !== undefined && (
          <div>
            <dt className="text-muted-foreground">Base salary</dt>
            <dd>
              {((employee.baseSalaryMinor ?? 0) / 100).toLocaleString()} AFN
            </dd>
          </div>
        )}
      </dl>
      <form
        className="space-y-2 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const file = f.get("file");
          if (file instanceof File)
            upload.mutate({
              file,
              title: String(f.get("title")),
              type: String(f.get("type")),
            });
        }}
      >
        <h3 className="font-semibold">Private documents</h3>
        <Input name="title" placeholder="Document title" required />
        <Select name="type">
          <option value="identity">Identity</option>
          <option value="contract">Contract</option>
          <option value="education">Education</option>
          <option value="license">License</option>
          <option value="training">Training</option>
          <option value="other">Other</option>
        </Select>
        <Input
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          required
        />
        <Button size="sm">Upload</Button>
      </form>
      <div className="space-y-1">
        {employee.documents?.map((d) => (
          <button
            className="block text-sm text-primary underline"
            key={d.id}
            onClick={() =>
              void apiDownload(
                `/employees/${employee.id}/documents/${d.id}/download`,
              )
            }
          >
            {d.title} ({Math.ceil(d.sizeBytes / 1024)} KB)
          </button>
        ))}
      </div>
      <div className="border-t pt-4">
        {employee.userId ? (
          <p className="text-sm">
            <strong>System account:</strong> linked
          </p>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              account.mutate({
                username: f.get("username"),
                password: f.get("password"),
                email: f.get("email") || null,
                roleCodes: [f.get("role")],
              });
            }}
          >
            <h3 className="font-semibold">Create system account</h3>
            <Input name="username" placeholder="Username" required />
            <Input name="email" type="email" placeholder="Email (optional)" />
            <Input
              name="password"
              type="password"
              minLength={10}
              placeholder="Temporary password"
              required
            />
            <Select name="role" required defaultValue="">
              <option value="">Select role…</option>
              <option value="doctor">Doctor</option>
              <option value="nurse">Nurse</option>
              <option value="lab_tech">Lab technician</option>
              <option value="pharmacist">Pharmacist</option>
              <option value="receptionist">Receptionist</option>
              <option value="payroll_officer">Payroll officer</option>
              <option value="accountant">Accountant</option>
            </Select>
            <Button size="sm">Create linked account</Button>
          </form>
        )}
      </div>
      <form
        className="space-y-2 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          credential.mutate({
            type: f.get("type"),
            name: f.get("name"),
            issuingAuthority: f.get("authority") || null,
            referenceNo: f.get("reference") || null,
            expiresOn: f.get("expiresOn") || null,
            blocksClinicalWork: f.get("blocks") === "on",
          });
        }}
      >
        <h3 className="font-semibold">Add credential</h3>
        <Input name="name" placeholder="Credential name" required />
        <Select name="type">
          <option value="professional_license">Professional license</option>
          <option value="education">Education</option>
          <option value="certification">Certification</option>
          <option value="training">Training</option>
          <option value="other">Other</option>
        </Select>
        <Input name="authority" placeholder="Issuing authority" />
        <Input name="reference" placeholder="Reference number" />
        <Field label="Expiry date (Shamsi)">
          <DateName name="expiresOn" initial="" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="blocks" /> Blocks clinical work after
          expiry
        </label>
        <Button size="sm">Save credential</Button>
      </form>
      {employee.status !== "exited" && (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (
              window.confirm(
                "Exit this employee and disable the linked user account?",
              )
            )
              exit.mutate();
          }}
        >
          Exit employee
        </Button>
      )}
      <ErrorText
        error={upload.error ?? credential.error ?? account.error ?? exit.error}
      />
      {message && <p className="text-sm text-emerald-700">{message}</p>}
    </Card>
  );
}

function Credentials() {
  const [state, setState] = useState(""),
    query = useQuery({
      queryKey: ["hr", "credentials", state],
      queryFn: () =>
        apiGet(
          `/hr/credentials${state ? `?state=${state}` : ""}`,
          credentialsSchema,
        ),
    });
  const exportRows = [
    ["Employee", "Credential", "Expiry", "Status", "Clinical block"],
    ...(query.data ?? []).map((c) => [
      c.employeeName,
      c.name,
      c.expiresOn ?? "",
      c.state,
      c.blocksClinicalWork ? "Yes" : "No",
    ]),
  ];
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Credential expiry register</h2>
        <div className="flex gap-2">
          <Select
            className="max-w-xs"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">All credentials</option>
            {credentialStateSchema.options.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            onClick={() => downloadTable("hr-credentials", exportRows)}
          >
            CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadTable("hr-credentials", exportRows, true)}
          >
            Excel
          </Button>
        </div>
      </div>
      <Table
        headings={[
          "Employee",
          "Credential",
          "Expiry",
          "Status",
          "Clinical block",
        ]}
      >
        {query.data?.map((c) => (
          <tr key={c.id} className="border-t">
            <td className="px-3 py-2">{c.employeeName}</td>
            <td className="px-3 py-2">{c.name}</td>
            <td className="px-3 py-2">{c.expiresOn ?? "No expiry"}</td>
            <td className="px-3 py-2">{c.state.replaceAll("_", " ")}</td>
            <td className="px-3 py-2">{c.blocksClinicalWork ? "Yes" : "No"}</td>
          </tr>
        ))}
      </Table>
      <ErrorText error={query.error} />
    </Card>
  );
}

function Attendance() {
  const qc = useQueryClient(),
    [date, setDate] = useState(today()),
    query = useQuery({
      queryKey: ["hr", "attendance", date],
      queryFn: () => apiGet(`/hr/attendance?date=${date}`, attendanceSchema),
    });
  const [marks, setMarks] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () =>
      apiPut(
        "/hr/attendance",
        {
          workDate: date,
          entries: query.data?.map((r) => ({
            employeeId: r.employeeId,
            shiftTypeId: null,
            status: marks[r.employeeId] ?? r.status,
            minutesLate: 0,
            note: null,
          })),
        },
        attendanceSchema,
      ),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["hr", "attendance", date] }),
  });
  const report = useQuery({
    queryKey: ["hr", "attendance-report", firstOfMonth(), today()],
    queryFn: () =>
      apiGet(
        `/hr/reports/attendance?from=${firstOfMonth()}&to=${today()}`,
        attendanceReportSchema,
      ),
  });
  const reportRows = [
    [
      "Employee No.",
      "Employee",
      "Present",
      "Absent",
      "Late",
      "Leave",
      "Minutes late",
    ],
    ...(report.data ?? []).map((r) => [
      r.employeeNo,
      r.employeeName,
      r.statuses.present ?? 0,
      r.statuses.absent ?? 0,
      r.statuses.late ?? 0,
      r.statuses.on_leave ?? 0,
      r.minutesLate,
    ]),
  ];
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Attendance date (Shamsi)">
          <FinanceDateInput value={date} onChange={setDate} />
        </Field>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => downloadTable("hr-attendance-month", reportRows)}
          >
            CSV
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              downloadTable("hr-attendance-month", reportRows, true)
            }
          >
            Excel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!query.data?.length || save.isPending}
          >
            Save attendance
          </Button>
        </div>
      </div>
      <Table headings={["No.", "Employee", "Status", "Source"]}>
        {query.data?.map((r) => (
          <tr key={r.employeeId} className="border-t">
            <td className="px-3 py-2 font-mono">{r.employeeNo}</td>
            <td className="px-3 py-2">{r.employeeName}</td>
            <td className="px-3 py-2">
              <Select
                value={marks[r.employeeId] ?? r.status}
                disabled={
                  r.source === "holiday" ||
                  r.source === "rest_day" ||
                  r.status === "on_leave"
                }
                onChange={(e) =>
                  setMarks((m) => ({ ...m, [r.employeeId]: e.target.value }))
                }
              >
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
                <option value="on_leave">On leave</option>
              </Select>
            </td>
            <td className="px-3 py-2">{r.source}</td>
          </tr>
        ))}
      </Table>
      <ErrorText error={query.error ?? save.error} />
    </Card>
  );
}

function Leave({ canApprove }: { canApprove: boolean }) {
  const qc = useQueryClient(),
    [mine, setMine] = useState(!canApprove);
  const types = useQuery({
    queryKey: ["hr", "leave-types"],
    queryFn: () => apiGet("/hr/leave-types", leaveTypesSchema),
  });
  const employees = useQuery({
    queryKey: ["hr", "employees", "leave"],
    queryFn: () => apiGet("/employees?page=1", employeeListSchema),
    enabled: canApprove,
  });
  const requests = useQuery({
    queryKey: ["hr", "leave-requests", mine],
    queryFn: () =>
      apiGet(
        mine ? "/hr/leave-requests/mine" : "/hr/leave-requests",
        leaveRequestsSchema,
      ),
  });
  const create = useMutation({
    mutationFn: (body: unknown) =>
      apiPost("/hr/leave-requests", body, resultSchema),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["hr", "leave-requests"] }),
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      apiPost(`/hr/leave-requests/${id}/decision`, { decision }, resultSchema),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["hr", "leave-requests"] }),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    create.mutate({
      employeeId: f.get("employeeId") || undefined,
      leaveTypeId: f.get("leaveTypeId"),
      startsOn: f.get("startsOn"),
      endsOn: f.get("endsOn"),
      reason: f.get("reason") || null,
    });
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="p-5">
        <form className="space-y-3" onSubmit={submit}>
          <h2 className="text-lg font-semibold">Request leave</h2>
          {canApprove && (
            <Field label="Employee">
              <Select name="employeeId" defaultValue="">
                <option value="">My record</option>
                {employees.data?.items.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Leave type">
            <Select name="leaveTypeId" required defaultValue="">
              <option value="">Select…</option>
              {types.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nameEn}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start (Shamsi)">
            <DateName name="startsOn" />
          </Field>
          <Field label="End (Shamsi)">
            <DateName name="endsOn" />
          </Field>
          <Field label="Reason">
            <Input name="reason" />
          </Field>
          <Button className="w-full">Submit request</Button>
          <ErrorText error={create.error} />
        </form>
      </Card>
      <Card className="space-y-4 p-5">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">Leave requests</h2>
          {canApprove && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMine((x) => !x)}
            >
              {mine ? "Show all" : "Show mine"}
            </Button>
          )}
        </div>
        <Table
          headings={["Employee", "Type", "Dates", "Days", "Status", "Actions"]}
        >
          {requests.data?.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">{r.employeeName}</td>
              <td className="px-3 py-2">{r.leaveTypeName}</td>
              <td className="px-3 py-2">
                {r.startsOn} – {r.endsOn}
              </td>
              <td className="px-3 py-2">{r.daysRequested}</td>
              <td className="px-3 py-2">{r.status}</td>
              <td className="px-3 py-2">
                {canApprove && r.status === "submitted" && (
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() =>
                        decide.mutate({ id: r.id, decision: "approve" })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        decide.mutate({ id: r.id, decision: "reject" })
                      }
                    >
                      Reject
                    </Button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <ErrorText error={requests.error ?? decide.error} />
      </Card>
    </div>
  );
}

function Roster({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient(),
    [from, setFrom] = useState(firstOfMonth()),
    [to, setTo] = useState(today());
  const employees = useQuery({
    queryKey: ["hr", "employees", "roster"],
    queryFn: () => apiGet("/employees?page=1", employeeListSchema),
    enabled: canEdit,
  });
  const shifts = useQuery({
    queryKey: ["hr", "shift-types"],
    queryFn: () => apiGet("/hr/shift-types", shiftsSchema),
  });
  const roster = useQuery({
    queryKey: ["hr", "roster", from, to],
    queryFn: () => apiGet(`/hr/roster?from=${from}&to=${to}`, rosterSchema),
  });
  const warnings = useQuery({
    queryKey: ["hr", "roster-warnings", from, to],
    queryFn: () =>
      apiGet(`/hr/roster-warnings?from=${from}&to=${to}`, rosterWarningsSchema),
  });
  const onDuty = useQuery({
    queryKey: ["hr", "on-duty"],
    queryFn: () =>
      apiGet(
        "/hr/on-duty",
        z.array(
          z.object({
            employeeId: z.string(),
            employeeName: z.string(),
            departmentId: z.string(),
            shiftName: z.string(),
            roleOnShift: z.string().nullable(),
          }),
        ),
      ),
    refetchInterval: 60_000,
  });
  const create = useMutation({
    mutationFn: (body: unknown) => apiPost("/hr/roster", body, resultSchema),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr", "roster"] }),
  });
  const publish = useMutation({
    mutationFn: () =>
      apiPost(
        "/hr/roster/publish",
        { startsOn: from, endsOn: to },
        resultSchema,
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr", "roster"] }),
  });
  const copy = useMutation({
    mutationFn: () =>
      apiPost(
        "/hr/roster/copy",
        { sourceStartsOn: shiftDate(from, -7), targetStartsOn: from },
        resultSchema,
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr", "roster"] }),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      employee = employees.data?.items.find(
        (x) => x.id === f.get("employeeId"),
      );
    if (!employee) return;
    create.mutate({
      employeeId: employee.id,
      departmentId: employee.departmentId,
      shiftTypeId: f.get("shiftTypeId"),
      dutyDate: f.get("dutyDate"),
      roleOnShift: f.get("roleOnShift") || null,
      notes: null,
    });
  }
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {onDuty.data?.map((x) => (
          <Card key={x.employeeId} className="gap-1 p-4">
            <p className="text-xs uppercase text-muted-foreground">
              On duty now
            </p>
            <p className="font-semibold">{x.employeeName}</p>
            <p className="text-sm">
              {x.shiftName}
              {x.roleOnShift ? ` · ${x.roleOnShift}` : ""}
            </p>
          </Card>
        ))}
      </div>
      {warnings.data?.length ? (
        <Card className="space-y-2 border-amber-300 bg-amber-50 p-5 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
          <h2 className="font-semibold">Roster warnings</h2>
          {warnings.data.map((warning, index) => (
            <p
              key={`${warning.type}-${warning.date}-${index}`}
              className="text-sm"
            >
              <strong>{warning.date}:</strong> {warning.message}
            </p>
          ))}
        </Card>
      ) : null}
      {canEdit && (
        <Card className="p-5">
          <form className="grid gap-3 md:grid-cols-5" onSubmit={submit}>
            <Field label="Employee">
              <Select name="employeeId" required defaultValue="">
                <option value="">Select…</option>
                {employees.data?.items.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Shift">
              <Select name="shiftTypeId" required defaultValue="">
                <option value="">Select…</option>
                {shifts.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameEn}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Duty date">
              <DateName name="dutyDate" />
            </Field>
            <Field label="Role on shift">
              <Input name="roleOnShift" placeholder="on_call" />
            </Field>
            <div className="self-end">
              <Button className="w-full">Assign</Button>
            </div>
          </form>
          <ErrorText error={create.error} />
        </Card>
      )}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From (Shamsi)">
            <FinanceDateInput value={from} onChange={setFrom} />
          </Field>
          <Field label="To (Shamsi)">
            <FinanceDateInput value={to} onChange={setTo} />
          </Field>
          {canEdit && (
            <>
              <Button variant="outline" onClick={() => copy.mutate()}>
                Copy previous week
              </Button>
              <Button onClick={() => publish.mutate()}>Publish roster</Button>
            </>
          )}
        </div>
        <Table headings={["Date", "Employee", "Shift", "Role", "Status"]}>
          {roster.data?.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">{r.dutyDate}</td>
              <td className="px-3 py-2">{r.employeeName}</td>
              <td className="px-3 py-2">{r.shiftName}</td>
              <td className="px-3 py-2">{r.roleOnShift ?? "—"}</td>
              <td className="px-3 py-2">{r.status}</td>
            </tr>
          ))}
        </Table>
        <ErrorText
          error={roster.error ?? warnings.error ?? copy.error ?? publish.error}
        />
      </Card>
    </div>
  );
}

function HrSettings() {
  const qc = useQueryClient(),
    refs = useReferenceData();
  const config = useQuery({
    queryKey: ["hr", "config"],
    queryFn: () => apiGet("/hr/config", hrConfigSchema),
  });
  const leaveTypes = useQuery({
    queryKey: ["hr", "leave-types"],
    queryFn: () => apiGet("/hr/leave-types", leaveTypesSchema),
  });
  const shifts = useQuery({
    queryKey: ["hr", "shift-types"],
    queryFn: () => apiGet("/hr/shift-types", shiftsSchema),
  });
  const saveConfig = useMutation({
    mutationFn: (body: unknown) => apiPut("/hr/config", body, hrConfigSchema),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr", "config"] }),
  });
  const add = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      apiPost(path, body, resultSchema),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr"] }),
  });
  const rest = useMemo(
    () => new Set(config.data?.weeklyRestDays ?? []),
    [config.data],
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Monthly salary processing</h2>
        <p className="text-sm text-muted-foreground">
          Salary runs, adjustments, approvals, payments and accounting journals
          use REDMARS Finance so the hospital has one payroll ledger.
        </p>
        <Link className={buttonVariants()} to="/finance?payrollRun=">
          Open salary and payroll
        </Link>
      </Card>
      <Card className="p-5">
        <form
          key={
            config.data
              ? `controls-${config.data.weeklyRestDays.join("-")}-${config.data.leavePastEntryDays}-${config.data.maxConsecutiveNightShifts}`
              : "controls-loading"
          }
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            saveConfig.mutate({
              weeklyRestDays: f.getAll("rest").map(Number),
              leavePastEntryDays: Number(f.get("past")),
              maxConsecutiveNightShifts: Number(f.get("nights")),
              credentialReminderDays: [90, 60, 30, 0],
              staffingRequirements: config.data?.staffingRequirements ?? [],
            });
          }}
        >
          <h2 className="text-lg font-semibold">HR calendar and controls</h2>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              Weekly rest days
            </legend>
            <div className="flex flex-wrap gap-3">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                <label key={d} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="rest"
                    value={i}
                    defaultChecked={rest.has(i)}
                  />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Leave backdating window (days)">
            <Input
              name="past"
              type="number"
              min="0"
              defaultValue={config.data?.leavePastEntryDays ?? 7}
            />
          </Field>
          <Field label="Maximum consecutive night shifts">
            <Input
              name="nights"
              type="number"
              min="1"
              defaultValue={config.data?.maxConsecutiveNightShifts ?? 3}
            />
          </Field>
          <Button>Save controls</Button>
          <ErrorText error={saveConfig.error} />
        </form>
      </Card>
      <Card className="p-5">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!config.data) return;
            const f = new FormData(e.currentTarget);
            saveConfig.mutate({
              ...config.data,
              staffingRequirements: [
                ...config.data.staffingRequirements,
                {
                  departmentId: String(f.get("departmentId")),
                  shiftTypeId: String(f.get("shiftTypeId")),
                  minimumStaff: Number(f.get("minimumStaff")),
                  roleOnShift: String(f.get("roleOnShift") || "") || null,
                },
              ],
            });
          }}
        >
          <h2 className="text-lg font-semibold">Minimum shift coverage</h2>
          <p className="text-sm text-muted-foreground">
            {config.data?.staffingRequirements.length
              ? `${config.data.staffingRequirements.length} coverage rule(s) configured.`
              : "No coverage rules configured."}
          </p>
          <Field label="Department">
            <Select name="departmentId" required defaultValue="">
              <option value="">Select…</option>
              {refs.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Shift">
            <Select name="shiftTypeId" required defaultValue="">
              <option value="">Select…</option>
              {shifts.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameEn}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Minimum staff">
            <Input name="minimumStaff" type="number" min="1" required />
          </Field>
          <Field label="Required role (optional)">
            <Input name="roleOnShift" placeholder="on_call" />
          </Field>
          <Button disabled={!config.data}>Add coverage rule</Button>
        </form>
      </Card>
      <Card className="p-5">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            add.mutate({
              path: "/hr/positions",
              body: {
                titleEn: f.get("titleEn"),
                titlePrs: f.get("titlePrs") || null,
                titlePs: f.get("titlePs") || null,
                category: f.get("category") || null,
                isClinical: f.get("clinical") === "on",
                isActive: true,
              },
            });
          }}
        >
          <h2 className="text-lg font-semibold">Positions</h2>
          <p className="text-sm text-muted-foreground">
            {refs.positions.map((p) => p.titleEn).join(" · ") ||
              "No positions configured"}
          </p>
          <Input name="titleEn" placeholder="English title" required />
          <Input name="titlePrs" placeholder="Dari title" />
          <Input name="titlePs" placeholder="Pashto title" />
          <Input name="category" placeholder="Category" />
          <label className="flex gap-2 text-sm">
            <input type="checkbox" name="clinical" /> Clinical position
          </label>
          <Button>Add position</Button>
        </form>
      </Card>
      <Card className="p-5">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            add.mutate({
              path: "/hr/leave-types",
              body: {
                code: f.get("code"),
                nameEn: f.get("name"),
                annualEntitlement: f.get("days") ? Number(f.get("days")) : null,
                requiresAttachment: f.get("attachment") === "on",
                isPaid: f.get("paid") === "on",
                isActive: true,
              },
            });
          }}
        >
          <h2 className="text-lg font-semibold">Leave types</h2>
          <p className="text-sm text-muted-foreground">
            {leaveTypes.data
              ?.map((x) => `${x.code} (${x.annualEntitlement ?? "unlimited"})`)
              .join(" · ")}
          </p>
          <Input name="code" placeholder="Code" required />
          <Input name="name" placeholder="Name" required />
          <Input name="days" type="number" min="0" placeholder="Annual days" />
          <label className="flex gap-2 text-sm">
            <input type="checkbox" name="paid" defaultChecked /> Paid
          </label>
          <label className="flex gap-2 text-sm">
            <input type="checkbox" name="attachment" /> Requires attachment
          </label>
          <Button>Add leave type</Button>
        </form>
      </Card>
      <Card className="p-5">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            add.mutate({
              path: "/hr/shift-types",
              body: {
                code: f.get("code"),
                nameEn: f.get("name"),
                startsAt: f.get("startsAt"),
                endsAt: f.get("endsAt"),
                color: f.get("color") || null,
                isActive: true,
              },
            });
          }}
        >
          <h2 className="text-lg font-semibold">Shift types</h2>
          <p className="text-sm text-muted-foreground">
            {shifts.data
              ?.map((x) => `${x.nameEn} ${x.startsAt}–${x.endsAt}`)
              .join(" · ")}
          </p>
          <Input name="code" placeholder="Code" required />
          <Input name="name" placeholder="Name" required />
          <Field label="Starts">
            <Input name="startsAt" type="time" required />
          </Field>
          <Field label="Ends">
            <Input name="endsAt" type="time" required />
          </Field>
          <Input name="color" placeholder="Color, for example #2563eb" />
          <Button>Add shift</Button>
          <ErrorText error={add.error} />
        </form>
      </Card>
    </div>
  );
}

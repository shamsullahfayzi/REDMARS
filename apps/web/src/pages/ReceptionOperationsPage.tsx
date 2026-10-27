import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  AlertTriangle,
  BedDouble,
  ClipboardCheck,
  MessagesSquare,
  Printer,
  Search,
  UsersRound,
} from 'lucide-react'
import type { PatientSummary } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { PageHeader } from '@/components/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { usePatientSearch } from '@/hooks/usePatientSearch'
import {
  downloadPatientDocument,
  usePatientReceptionProfile,
  useReceptionAudit,
  useReceptionCommand,
  useReceptionWorkspace,
} from '@/hooks/useReceptionOperations'

type Tab = 'desk' | 'patient' | 'shift' | 'downtime'
const nowLocal = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

export function ReceptionOperationsPage() {
  const { roles } = useAuth()
  const [tab, setTab] = useState<Tab>('desk')
  const workspace = useReceptionWorkspace()
  const canReview = roles.includes('admin') || roles.includes('doctor')
  const canManageBeds = roles.includes('admin') || roles.includes('nurse')
  const canSupervise = roles.includes('admin') || roles.includes('management')
  const canCoordinate = roles.includes('admin') || roles.includes('receptionist')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reception operations"
        description="Admissions, beds, patient services, reminders, handover and supervisor controls."
      />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Reception operations">
        {([
          ['desk', 'Desk & IPD'],
          ...(canCoordinate ? [['patient', 'Patient services'], ['shift', 'Shift control']] as const : []),
          ['downtime', 'Downtime'],
        ] as const).map(([key, label]) => (
          <Button key={key} type="button" variant={tab === key ? 'default' : 'outline'} onClick={() => setTab(key)}>
            {label}
          </Button>
        ))}
      </div>

      {workspace.isPending && <Card className="p-6 text-sm text-muted-foreground">Loading reception workspace…</Card>}
      {workspace.isError && <Card className="border-destructive p-6 text-sm text-destructive">Could not load reception operations.</Card>}
      {workspace.data && tab === 'desk' && (
        <DeskPanel data={workspace.data} canReview={canReview} canManageBeds={canManageBeds} canCoordinate={canCoordinate} />
      )}
      {workspace.data && tab === 'patient' && <PatientServices data={workspace.data} />}
      {workspace.data && tab === 'shift' && <ShiftPanel data={workspace.data} canSupervise={canSupervise} />}
      {tab === 'downtime' && <DowntimePanel />}
    </div>
  )
}

function DeskPanel({ data, canReview, canManageBeds, canCoordinate }: { data: any; canReview: boolean; canManageBeds: boolean; canCoordinate: boolean }) {
  const [patient, setPatient] = useState<PatientSummary | null>(null)
  const request = useReceptionCommand('/reception/operations/requests')
  const waitlist = useReceptionCommand('/reception/operations/waitlist')
  const createBed = useReceptionCommand('/reception/operations/beds')

  function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!patient) return
    const form = new FormData(event.currentTarget)
    request.mutate({
      kind: form.get('kind'), patientId: patient.id,
      targetPatientId: form.get('targetPatientId') || null,
      visitId: form.get('visitId') || null, appointmentId: null,
      departmentId: form.get('departmentId') || null,
      sourceBedId: form.get('sourceBedId') || null, targetBedId: form.get('targetBedId') || null,
      priority: form.get('priority'), reason: form.get('reason'), notes: form.get('notes') || '',
    }, { onSuccess: () => event.currentTarget.reset() })
  }
  function addWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!patient) return
    const form = new FormData(event.currentTarget)
    waitlist.mutate({
      patientId: patient.id, departmentId: form.get('departmentId'), practitionerId: null,
      preferredOn: form.get('preferredOn') || null, priority: form.get('priority'), note: form.get('note') || '',
    }, { onSuccess: () => event.currentTarget.reset() })
  }

  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Stat label="Available beds" value={data.stats.availableBeds} icon={<BedDouble />} />
      <Stat label="Pending requests" value={data.stats.pendingCareRequests} icon={<ClipboardCheck />} />
      <Stat label="Waitlist" value={data.stats.waitingAppointments} icon={<UsersRound />} />
      <Stat label="Queued reminders" value={data.stats.queuedReminders} icon={<MessagesSquare />} />
      <Stat label="Open handovers" value={data.stats.openHandovers} icon={<AlertTriangle />} />
    </div>
    {data.alerts.length > 0 && <Card className="border-amber-300 bg-amber-50/60 p-4 dark:bg-amber-950/20">
      <h2 className="font-semibold">Reception alerts</h2>
      <div className="mt-2 flex flex-wrap gap-2">{data.alerts.map((a: any) => <span key={a.key} className="rounded-full border px-3 py-1 text-sm">{a.key.replaceAll('_', ' ')}: {a.count}</span>)}</div>
    </Card>}
    {canCoordinate && <div className="grid gap-6 xl:grid-cols-2">
      <FormCard title="Clinical coordination request" subtitle="Reception requests; a doctor or administrator approves clinical decisions.">
        <PatientPicker value={patient} onChange={setPatient} />
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={createRequest}>
          <Field label="Request type"><Select name="kind" required><option value="admission">Admission</option><option value="transfer">Transfer</option><option value="discharge">Discharge</option><option value="queue_priority">Queue priority</option><option value="patient_merge">Duplicate merge review</option></Select></Field>
          <Field label="Priority"><Select name="priority"><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></Select></Field>
          <Field label="IPD department"><Select name="departmentId"><option value="">Choose when required</option>{data.departments.filter((d:any)=>d.type==='ipd').map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Target bed"><Select name="targetBedId"><option value="">Unassigned</option>{data.beds.filter((b:any)=>b.status==='available').map((b:any)=><option key={b.id} value={b.id}>{b.code} · {b.label}</option>)}</Select></Field>
          <Field label="Source bed"><Select name="sourceBedId"><option value="">None</option>{data.beds.filter((b:any)=>b.status==='occupied').map((b:any)=><option key={b.id} value={b.id}>{b.code} · {b.label}</option>)}</Select></Field>
          <Field label="Visit ID"><Input name="visitId" placeholder="Required for transfer, discharge or priority" /></Field>
          <Field label="Possible duplicate patient ID"><Input name="targetPatientId" placeholder="Required for merge review" /></Field>
          <Field label="Reason"><Input name="reason" required maxLength={300} /></Field>
          <div className="sm:col-span-2"><Field label="Notes"><Input name="notes" maxLength={1000} /></Field></div>
          <div className="sm:col-span-2 flex gap-2"><Button disabled={!patient || request.isPending}>Submit request</Button><Link className={buttonVariants({variant:'outline'})} to="/reception?type=emergency">Emergency arrival</Link></div>
          <MutationState mutation={request} />
        </form>
      </FormCard>
      <FormCard title="Appointment waitlist" subtitle="Offer the next suitable opening, then link the booked appointment.">
        <PatientPicker value={patient} onChange={setPatient} />
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={addWaitlist}>
          <Field label="Department"><Select name="departmentId" required><option value="">Choose</option>{data.departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Preferred date"><Input name="preferredOn" type="date" /></Field>
          <Field label="Priority"><Select name="priority"><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></Select></Field>
          <Field label="Note"><Input name="note" /></Field>
          <div className="sm:col-span-2 flex gap-2"><Button disabled={!patient || waitlist.isPending}>Add to waitlist</Button><Link className={buttonVariants({variant:'outline'})} to="/appointments">Open slot calendar</Link></div>
          <MutationState mutation={waitlist} />
        </form>
      </FormCard>
    </div>}
    {canManageBeds && <FormCard title="Bed register" subtitle="Nursing or administration maintains operational bed status.">
      <form className="grid gap-3 sm:grid-cols-5" onSubmit={(event)=>{event.preventDefault(); const f=new FormData(event.currentTarget); createBed.mutate({departmentId:f.get('departmentId'),roomId:null,code:f.get('code'),label:f.get('label'),status:f.get('status'),notes:'',isActive:true},{onSuccess:()=>event.currentTarget.reset()})}}>
        <Select name="departmentId" required><option value="">IPD department</option>{data.departments.filter((d:any)=>d.type==='ipd').map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        <Input name="code" required placeholder="Code e.g. B-01" /><Input name="label" required placeholder="Bed label" />
        <Select name="status"><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="cleaning">Cleaning</option></Select>
        <Button disabled={createBed.isPending}>Add bed</Button>
      </form><MutationState mutation={createBed} />
    </FormCard>}
    <RecordList title="Bed board" empty="No beds configured.">{data.beds.map((b:any)=><BedRow key={b.id} row={b} canManage={canManageBeds}/>)}</RecordList>
    <RecordList title="Care requests" empty="No requests yet.">{data.careRequests.map((r:any)=><CareRequestRow key={r.id} row={r} canReview={canReview} />)}</RecordList>
    <RecordList title="Waitlist" empty="No active waitlist entries.">{data.waitlist.map((w:any)=><WaitlistRow key={w.id} row={w} />)}</RecordList>
  </div>
}

function BedRow({row,canManage}:{row:any;canManage:boolean}){const update=useReceptionCommand(`/reception/operations/beds/${row.id}`,'patch');return <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"><div><p className="font-medium">{row.code} · {row.label}</p><p className="text-sm text-muted-foreground">{row.departmentName}{row.roomName?` · ${row.roomName}`:''}</p></div><div className="flex items-center gap-2"><Status value={row.status}/>{canManage&&<Select defaultValue="" onChange={e=>{if(e.target.value)update.mutate({status:e.target.value});e.currentTarget.value=''}} className="h-8 w-40"><option value="">Change status…</option><option value="available">Available</option><option value="cleaning">Cleaning</option><option value="maintenance">Maintenance</option></Select>}</div></div>}

function CareRequestRow({row,canReview}:{row:any;canReview:boolean}) {
  const review=useReceptionCommand(`/reception/operations/requests/${row.id}/review`,'patch')
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"><div><p className="font-medium">{row.reference} · {row.kind.replaceAll('_',' ')}</p><p className="text-sm text-muted-foreground">{row.patientName} · {row.patientMrn} · {row.priority} · {row.reason}</p></div><div className="flex gap-2"><Status value={row.status}/>{canReview&&row.status==='pending'&&<><Button size="sm" onClick={()=>review.mutate({status:'approved',note:''})}>Approve</Button><Button size="sm" variant="outline" onClick={()=>review.mutate({status:'rejected',note:'Not approved by clinical reviewer'})}>Reject</Button></>}{canReview&&row.status==='approved'&&<Button size="sm" onClick={()=>review.mutate({status:'completed',note:''})}>Complete</Button>}</div></div>
}

function WaitlistRow({row}:{row:any}) {
  const update=useReceptionCommand(`/reception/operations/waitlist/${row.id}`,'patch')
  const [appointmentId,setAppointmentId]=useState('')
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"><div><p className="font-medium">{row.patientName} · {row.patientMrn}</p><p className="text-sm text-muted-foreground">{row.departmentName} · {row.preferredOn||'any date'} · {row.priority}</p></div><div className="flex flex-wrap items-center gap-2"><Status value={row.status}/>{row.status==='waiting'&&<Button size="sm" variant="outline" onClick={()=>update.mutate({status:'offered',appointmentId:null,note:row.note})}>Mark offered</Button>}{row.status==='offered'&&<><Input className="h-8 w-52" value={appointmentId} onChange={e=>setAppointmentId(e.target.value)} placeholder="Booked appointment ID"/><Button size="sm" disabled={!appointmentId} onClick={()=>update.mutate({status:'booked',appointmentId,note:row.note})}>Link booking</Button></>}</div></div>
}

function PatientServices({data}:{data:any}) {
  const [patient,setPatient]=useState<PatientSummary|null>(null)
  const profile=usePatientReceptionProfile(patient?.id)
  const contact=useReceptionCommand(`/reception/operations/patients/${patient?.id}/contacts`,'post',patient?.id)
  const coverage=useReceptionCommand(`/reception/operations/patients/${patient?.id}/coverages`,'post',patient?.id)
  const deposit=useReceptionCommand('/reception/operations/deposits','post',patient?.id)
  const reminder=useReceptionCommand('/reception/operations/reminders')
  const document=useReceptionCommand(`/reception/operations/patients/${patient?.id}/documents`,'post',patient?.id)
  const [fileName,setFileName]=useState('')

  async function upload(event:FormEvent<HTMLFormElement>){event.preventDefault(); if(!patient)return; const form=new FormData(event.currentTarget); const file=form.get('file') as File; if(!file?.size)return; const contentBase64=await fileToBase64(file); document.mutate({category:form.get('category'),fileName:file.name,mimeType:file.type,contentBase64},{onSuccess:()=>{event.currentTarget.reset();setFileName('')}})}
  return <div className="space-y-6">
    <Card className="p-5"><PatientPicker value={patient} onChange={setPatient}/>{patient&&<div className="mt-3 flex flex-wrap gap-2"><Link className={buttonVariants({variant:'outline'})} to={`/patients/${patient.id}`}>Identifiers & patient record</Link><Button variant="outline" onClick={()=>printReceptionForm('registration') }><Printer className="me-2 size-4"/>Registration form</Button><Button variant="outline" onClick={()=>printReceptionForm('consent')}><Printer className="me-2 size-4"/>Consent form</Button></div>}</Card>
    {!patient&&<Card className="p-8 text-center text-muted-foreground">Choose a patient to manage documents, contacts, coverage, deposits and reminders.</Card>}
    {patient&&<><ReceptionPrintForms patient={patient}/><div className="grid gap-6 xl:grid-cols-2">
      <FormCard title="Guardian, emergency contact & privacy" subtitle="Messages are allowed only through an explicitly consented contact.">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);contact.mutate({name:f.get('name'),relationship:f.get('relationship'),phone:f.get('phone'),kind:f.get('kind'),isPrimary:f.get('isPrimary')==='on',isEmergency:f.get('isEmergency')==='on',canCall:f.get('canCall')==='on',canSms:f.get('canSms')==='on',canWhatsapp:f.get('canWhatsapp')==='on',safeInstructions:f.get('safeInstructions')||''},{onSuccess:()=>e.currentTarget.reset()})}}>
          <Input name="name" required placeholder="Contact name"/><Input name="relationship" required placeholder="Relationship"/><Input name="phone" placeholder="Phone" dir="ltr"/><Select name="kind"><option value="guardian">Guardian</option><option value="emergency">Emergency</option><option value="family">Family</option><option value="other">Other</option></Select>
          <Checks names={['isPrimary','isEmergency','canCall','canSms','canWhatsapp']}/><Input name="safeInstructions" placeholder="Safe contact instructions"/>
          <Button className="sm:col-span-2" disabled={contact.isPending}>Save contact consent</Button><MutationState mutation={contact}/>
        </form>
        <div className="mt-4 space-y-2">{profile.data?.contacts.map(c=><div key={c.id} className="rounded-md border p-3 text-sm"><b>{c.name}</b> · {c.relationship} · <span dir="ltr">{c.phone}</span><p className="text-muted-foreground">Allowed: {[c.canCall&&'call',c.canSms&&'SMS',c.canWhatsapp&&'WhatsApp'].filter(Boolean).join(', ')||'none'} · {c.safeInstructions||'No special instruction'}</p></div>)}</div>
      </FormCard>
      <FormCard title="Patient documents" subtitle="PDF, JPEG or PNG; maximum 2 MB. Content is excluded from audit snapshots.">
        <form className="grid gap-3" onSubmit={upload}><Select name="category"><option value="identity">Identity</option><option value="referral">Referral</option><option value="consent">Consent</option><option value="insurance">Insurance</option><option value="other">Other</option></Select><Input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required onChange={e=>setFileName(e.target.files?.[0]?.name||'')}/><Button disabled={!fileName||document.isPending}>Upload document</Button><MutationState mutation={document}/></form>
        <div className="mt-4 space-y-2">{profile.data?.documents.map(d=><button type="button" key={d.id} className="block w-full rounded-md border p-3 text-start text-sm hover:bg-muted" onClick={()=>downloadPatientDocument(patient.id,d.id)}><b>{d.fileName}</b><span className="ms-2 text-muted-foreground">{d.category} · {Math.ceil(d.sizeBytes/1024)} KB</span></button>)}</div>
      </FormCard>
      <FormCard title="Panel / insurance eligibility" subtitle="Reception can record a pending check; authorised supervisors may confirm status.">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);coverage.mutate({panelId:f.get('panelId'),memberNo:f.get('memberNo'),status:f.get('status'),validFrom:f.get('validFrom')||null,validTo:f.get('validTo')||null,notes:f.get('notes')||''},{onSuccess:()=>e.currentTarget.reset()})}}><Select name="panelId" required><option value="">Choose panel</option>{data.panels.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</Select><Input name="memberNo" required placeholder="Member number"/><Select name="status"><option value="pending">Pending verification</option><option value="eligible">Eligible</option><option value="ineligible">Ineligible</option><option value="expired">Expired</option></Select><Input name="validFrom" type="date"/><Input name="validTo" type="date"/><Input name="notes" placeholder="Verification notes"/><Button className="sm:col-span-2" disabled={coverage.isPending}>Save coverage</Button><MutationState mutation={coverage}/></form>
        <div className="mt-4 space-y-2">{profile.data?.coverages.map(c=><div key={c.id} className="rounded-md border p-3 text-sm"><b>{c.panelName}</b> · {c.memberNo} <Status value={c.status}/></div>)}</div>
      </FormCard>
      <FormCard title="Deposits and advances" subtitle="Operational custody register in AFN. Finance posting remains a controlled accounting handoff.">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);deposit.mutate({patientId:patient.id,amount:f.get('amount'),method:f.get('method'),reference:f.get('reference')||''},{onSuccess:()=>e.currentTarget.reset()})}}><Input name="amount" required inputMode="decimal" placeholder="Amount AFN"/><Select name="method"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option></Select><Input name="reference" className="sm:col-span-2" placeholder="Bank, terminal or transfer reference"/><Button className="sm:col-span-2" disabled={deposit.isPending}>Receive deposit</Button><MutationState mutation={deposit}/></form>
        <div className="mt-4 space-y-2">{profile.data?.deposits.map(d=><DepositRow key={d.id} row={d} patientId={patient.id}/>)}</div>
      </FormCard>
      <FormCard title="Consent-aware reminders" subtitle="Only a contact that permits the selected channel can be queued.">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);reminder.mutate({patientId:patient.id,appointmentId:null,contactId:f.get('contactId')||null,channel:f.get('channel'),destination:f.get('destination'),template:f.get('template'),scheduledFor:new Date(String(f.get('scheduledFor'))).toISOString()},{onSuccess:()=>e.currentTarget.reset()})}}><Select name="contactId" required><option value="">Consented contact</option>{profile.data?.contacts.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</Select><Select name="channel"><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></Select><Input name="destination" required placeholder="Destination number" dir="ltr"/><Input name="scheduledFor" required type="datetime-local" defaultValue={nowLocal()}/><Input name="template" className="sm:col-span-2" required placeholder="Reminder message"/><Button className="sm:col-span-2" disabled={reminder.isPending}>Queue reminder</Button><MutationState mutation={reminder}/></form>
      </FormCard>
    </div></>}
  </div>
}

function DepositRow({row,patientId}:{row:any;patientId:string}){const close=useReceptionCommand(`/reception/operations/deposits/${row.id}/close`,'patch',patientId);return <div className="flex items-center justify-between rounded-md border p-3 text-sm"><span><b>{row.amount} {row.currency}</b> · {row.method} · {row.reference||'no reference'} · {row.status}</span>{row.status==='active'&&<Button size="sm" variant="outline" onClick={()=>close.mutate({status:'refunded',invoiceId:null,reason:'Refund authorised at reception'})}>Refund</Button>}</div>}

function ShiftPanel({data,canSupervise}:{data:any;canSupervise:boolean}) {
  const handover=useReceptionCommand('/reception/operations/handovers')
  const till=useReceptionCommand('/reception/operations/till-closes')
  const audit=useReceptionAudit(canSupervise)
  return <div className="space-y-6"><div className="grid gap-6 xl:grid-cols-2">
    <FormCard title="Shift handover" subtitle="The receiving staff member acknowledges separately."><form className="grid gap-3" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);handover.mutate({toUserId:f.get('toUserId')||null,note:f.get('note')},{onSuccess:()=>e.currentTarget.reset()})}}><Select name="toUserId"><option value="">Next receptionist not assigned</option>{data.staff.map((u:any)=><option key={u.id} value={u.id}>{u.name}</option>)}</Select><Input name="note" required placeholder="Outstanding patients, calls, cash or documents"/><Button disabled={handover.isPending}>Create handover</Button><MutationState mutation={handover}/></form></FormCard>
    <FormCard title="Till closing" subtitle="Cash payments and cash deposits are reconciled; differences require second-person approval."><form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);till.mutate({startsAt:new Date(String(f.get('startsAt'))).toISOString(),endsAt:new Date(String(f.get('endsAt'))).toISOString(),opening:f.get('opening'),counted:f.get('counted'),note:f.get('note')||''},{onSuccess:()=>e.currentTarget.reset()})}}><Input name="startsAt" type="datetime-local" required/><Input name="endsAt" type="datetime-local" required defaultValue={nowLocal()}/><Input name="opening" inputMode="decimal" required placeholder="Opening cash"/><Input name="counted" inputMode="decimal" required placeholder="Counted cash"/><Input name="note" className="sm:col-span-2" placeholder="Difference note"/><Button className="sm:col-span-2" disabled={till.isPending}>Close till</Button><MutationState mutation={till}/></form></FormCard>
  </div><RecordList title="Open handovers" empty="No open handovers.">{data.handovers.map((h:any)=><HandoverRow key={h.id} row={h}/>)}</RecordList><RecordList title="Till reviews" empty="No till closes.">{data.tillCloses.map((c:any)=><TillRow key={c.id} row={c} canSupervise={canSupervise}/>)}</RecordList>{canSupervise&&<RecordList title="Supervisor audit" empty="No reception audit activity.">{(audit.data?.logs??[]).slice(0,20).map(log=><div key={log.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span><b>{log.action}</b> · {log.entity} · {log.entityId||'batch'}</span><span className="text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span></div>)}</RecordList>}</div>
}

function HandoverRow({row}:{row:any}){const update=useReceptionCommand(`/reception/operations/handovers/${row.id}`,'patch');return <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"><div><p className="font-medium">{row.fromUserName} → {row.toUserName||'next shift'}</p><p className="text-sm text-muted-foreground">{row.note}</p></div><div className="flex gap-2"><Status value={row.status}/>{row.status==='open'&&<Button size="sm" onClick={()=>update.mutate({status:'acknowledged'})}>Acknowledge</Button>}{row.status==='acknowledged'&&<Button size="sm" variant="outline" onClick={()=>update.mutate({status:'closed'})}>Close</Button>}</div></div>}
function TillRow({row,canSupervise}:{row:any;canSupervise:boolean}){const approve=useReceptionCommand(`/reception/operations/till-closes/${row.id}/approve`,'patch');return <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"><div><p className="font-medium">{row.userName} · expected {row.expected} AFN · counted {row.counted} AFN</p><p className={Number(row.difference)===0?'text-sm text-muted-foreground':'text-sm font-medium text-destructive'}>Difference: {row.difference} AFN {row.note&&`· ${row.note}`}</p></div>{row.approvedAt?<Status value="approved"/>:canSupervise&&<Button size="sm" onClick={()=>approve.mutate({})}>Approve close</Button>}</div>}

type Draft={id:string;temporaryNo:string;createdAt:string}
const DRAFT_KEY='redmars.reception.downtime.v1'
function DowntimePanel(){const [drafts,setDrafts]=useState<Draft[]>(()=>{try{return JSON.parse(localStorage.getItem(DRAFT_KEY)||'[]').filter((d:Draft)=>Date.now()-new Date(d.createdAt).getTime()<86_400_000)}catch{return[]}});useEffect(()=>localStorage.setItem(DRAFT_KEY,JSON.stringify(drafts)),[drafts]);return <div className="space-y-6"><Card className="border-amber-300 p-5"><h2 className="font-semibold">Downtime registration</h2><p className="mt-1 text-sm text-muted-foreground">Use the printed form while the server is unavailable. Only the temporary number and time are stored on this workstation; patient details stay on paper. Re-enter and verify the paper record when service returns, then delete this marker.</p><form className="mt-4 flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setDrafts(v=>[{id:crypto.randomUUID(),temporaryNo:String(f.get('temporaryNo')),createdAt:new Date().toISOString()},...v]);e.currentTarget.reset()}}><Input name="temporaryNo" required placeholder="Temporary number" className="max-w-xs"/><Button>Save local marker</Button><Button type="button" variant="outline" onClick={()=>printReceptionForm('downtime')}><Printer className="me-2 size-4"/>Print blank downtime form</Button></form></Card><ReceptionPrintForms/><RecordList title="Local markers awaiting verification" empty="No local downtime markers.">{drafts.map(d=><div key={d.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3"><div><p className="font-medium">{d.temporaryNo}</p><p className="text-sm text-muted-foreground">Recorded {new Date(d.createdAt).toLocaleString()} · patient details retained on the paper form only</p></div><div className="flex gap-2"><Link className={buttonVariants({size:'sm'})} to="/reception">Re-enter online</Link><Button size="sm" variant="outline" onClick={()=>setDrafts(v=>v.filter(x=>x.id!==d.id))}>Delete verified marker</Button></div></div>)}</RecordList></div>}

function PatientPicker({value,onChange}:{value:PatientSummary|null;onChange:(patient:PatientSummary|null)=>void}){const [term,setTerm]=useState('');const query=usePatientSearch(term,1);const rows=query.data?.patients??[];return <div><Label>Patient search</Label><div className="relative mt-1"><Search className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground"/><Input value={value?`${value.mrn} · ${value.firstName} ${value.lastName||''}`:term} onChange={e=>{onChange(null);setTerm(e.target.value)}} placeholder="MRN, name or phone" className="ps-9"/>{!value&&term.length>=2&&rows.length>0&&<div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover shadow-lg">{rows.map(p=><button type="button" key={p.id} className="block w-full px-3 py-2 text-start text-sm hover:bg-muted" onClick={()=>onChange(p)}><b>{p.mrn}</b> · {p.firstName} {p.lastName} · {p.phone}</button>)}</div>}</div>{value&&<button type="button" className="mt-1 text-xs text-primary" onClick={()=>onChange(null)}>Choose another patient</button>}</div>}
function Stat({label,value,icon}:{label:string;value:number;icon:ReactNode}){return <Card className="p-4"><div className="flex items-center justify-between text-muted-foreground"><span className="text-sm">{label}</span><span className="size-5">{icon}</span></div><p className="mt-2 text-2xl font-semibold">{value}</p></Card>}
function FormCard({title,subtitle,children}:{title:string;subtitle:string;children:ReactNode}){return <Card className="p-5"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p><div className="mt-4">{children}</div></Card>}
function Field({label,children}:{label:string;children:ReactNode}){return <div className="space-y-1"><Label>{label}</Label>{children}</div>}
function RecordList({title,empty,children}:{title:string;empty:string;children:ReactNode[]}){return <Card className="p-5"><h2 className="font-semibold">{title}</h2><div className="mt-3">{children.length?children:<p className="py-4 text-sm text-muted-foreground">{empty}</p>}</div></Card>}
function Status({value}:{value:string}){return <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium capitalize">{value.replaceAll('_',' ')}</span>}
function Checks({names}:{names:string[]}){return <div className="flex flex-wrap gap-3 sm:col-span-2">{names.map(name=><label key={name} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name={name}/>{name.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase())}</label>)}</div>}
function MutationState({mutation}:{mutation:any}){return <>{mutation.isError&&<p className="text-sm text-destructive sm:col-span-2">{mutation.error instanceof Error?mutation.error.message:'Request failed.'}</p>}{mutation.isSuccess&&<p className="text-sm text-success sm:col-span-2">Saved successfully.</p>}</>}
function fileToBase64(file:File){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error);reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.readAsDataURL(file)})}
function printReceptionForm(target:string){document.documentElement.dataset.printTarget=target;window.addEventListener('afterprint',()=>{delete document.documentElement.dataset.printTarget},{once:true});window.print()}
function ReceptionPrintForms({patient}:{patient?:PatientSummary}){return <div className="reception-print-forms" aria-hidden><section className="reception-form-sheet registration-sheet"><h1>Axon Nura — Patient Registration</h1><p>MRN: {patient?.mrn||'________________'}</p><p>Name: {patient?`${patient.firstName} ${patient.lastName||''}`:'________________________________________'}</p><p>Phone: {patient?.phone||'________________'} &nbsp; DOB/Age: ________________</p><p>Address: ______________________________________________________________</p><p>Emergency contact: __________________ Relationship: __________ Phone: __________</p><p>Referral source: ______________________ Panel/member no: _____________________</p><p className="signature-line">Patient/guardian signature: __________________ Staff: __________________ Date: __________</p></section><section className="reception-form-sheet consent-sheet"><h1>Axon Nura — Contact & Treatment Consent</h1><p>Patient: {patient?`${patient.firstName} ${patient.lastName||''}`:'____________________________'} &nbsp; MRN: {patient?.mrn||'____________'}</p><p>Allowed contact: □ Call &nbsp; □ SMS &nbsp; □ WhatsApp &nbsp; Safe time/instructions: ____________________</p><p>I confirm that the information above is correct and that the selected contact methods may be used subject to the recorded privacy instructions.</p><p className="signature-line">Patient/guardian signature: __________________ Staff witness: ______________ Date: ________</p></section><section className="reception-form-sheet downtime-sheet"><h1>Axon Nura — Downtime Registration</h1><p>Temporary no: ______________ Date/time: ______________ Emergency: □ Yes □ No</p><p>Name: ______________________________ Phone: ______________ Gender: __________</p><p>DOB/estimated age: ______________ Guardian: __________________ Relationship: ________</p><p>Reason for arrival: _________________________________________________________</p><p>Department/clinician: __________________________ Payment receipt no: ______________</p><p className="signature-line">Recorded by: __________________ Verified online by: ______________ Date: ________</p></section></div>}

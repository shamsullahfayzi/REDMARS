import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  crmPatientMappingSchema,
  registerCrmPatientSchema,
} from "@redmars/shared";
import { apiGet, apiPost, serverMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PatientFormFields } from "@/components/PatientFormFields";
import { DuplicateNotice } from "@/components/DuplicateNotice";
import { duplicateMatchesFromError } from "@/hooks/usePatient";
import { usePatientForm, toPayload } from "@/hooks/usePatientForm";

export function CrmPatientLink({ leadId }: { leadId: string }) {
  const { t } = useTranslation(),
    client = useQueryClient(),
    form = usePatientForm();
  const [linkId, setLinkId] = useState(""),
    [identity, setIdentity] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [register, setRegister] = useState(false),
    [ack, setAck] = useState(false),
    [relationship, setRelationship] = useState("self"),
    [reason, setReason] = useState("wrong_patient"),
    [confirmUnlink, setConfirmUnlink] = useState(false),
    [now, setNow] = useState(Date.now());
  const [key, setKey] = useState(crypto.randomUUID());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ["crm", "patient-link", leadId],
    queryFn: () =>
      apiGet(`/crm/leads/${leadId}/patient`, crmPatientMappingSchema),
    retry: false,
    refetchInterval: 15000,
  });
  const mutation = useMutation({
    mutationFn: ({ operation, body }: { operation: string; body: unknown }) =>
      apiPost(
        `/crm/leads/${leadId}/patient/${operation}`,
        body,
        crmPatientMappingSchema,
      ),
    onSuccess: async () => {
      setKey(crypto.randomUUID());
      setIdentity(false);
      setReviewed(false);
      setAck(false);
      setConfirmUnlink(false);
      setRegister(false);
      await client.invalidateQueries({ queryKey: ["crm"] });
    },
  });
  const change = () => {
    setKey(crypto.randomUUID());
    mutation.reset();
  };
  const data = query.data;
  if (query.isPending) return <p role="status">{t("crm.loading")}</p>;
  if (query.isError || !data)
    return (
      <p role="alert">
        {t("crmPatients.loadError")}{" "}
        <Button onClick={() => void query.refetch()}>{t("crm.retry")}</Button>
      </p>
    );
  const fresh = (until: string | null) => !until || Date.parse(until) > now;
  const candidates = data.candidates.filter((c) => fresh(c.visibleUntil));
  const matches = duplicateMatchesFromError(mutation.error);
  const command = {
    expectedVersion: data.expectedVersion,
    idempotencyKey: key,
    identityConfirmed: identity,
    duplicateReviewed: reviewed,
  };
  function save() {
    if (register) {
      const parsed = registerCrmPatientSchema.safeParse({
        ...command,
        patient: toPayload(form.values, ack),
        relationship,
      });
      if (!parsed.success) {
        form.setErrors(
          Object.fromEntries(
            parsed.error.issues.map((e) => [String(e.path.at(-1)), e.message]),
          ),
        );
        return;
      }
      mutation.mutate({ operation: "register", body: parsed.data });
    } else mutation.mutate({ operation: "link", body: { ...command, linkId } });
  }
  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      aria-label={t("crmPatients.title")}
    >
      <h3 className="font-semibold">{t("crmPatients.title")}</h3>
      <p className="text-sm text-muted-foreground">{t("crmPatients.intro")}</p>
      {data.current ? (
        <p>
          {data.current.patient && fresh(data.current.visibleUntil)
            ? `${data.current.patient.name} · ${data.current.patient.mrn}`
            : t("crmPatients.restricted")}
        </p>
      ) : (
        <p>{t("crmPatients.unlinked")}</p>
      )}
      {data.canLink && (
        <>
          <label className="grid gap-1">
            {t("crmPatients.choose")}
            <select
              className="rounded border bg-background p-2"
              value={linkId}
              onChange={(e) => {
                setLinkId(e.target.value);
                setRegister(false);
                change();
              }}
            >
              <option value="">{t("crmPatients.choose")}</option>
              {candidates.map((c) => (
                <option key={c.linkId} value={c.linkId}>
                  {c.patient.name} · {c.patient.mrn}
                </option>
              ))}
            </select>
          </label>
          {!candidates.length && (
            <p className="text-sm">
              {t("crmPatients.noCandidates")}{" "}
              <Link className="underline" to="/crm?tab=contacts">
                {t("crm.tabs.contacts")}
              </Link>
            </p>
          )}
          {data.canRegister && (
            <Button
              variant="outline"
              onClick={() => {
                setRegister(!register);
                setAck(false);
                change();
              }}
            >
              {t(register ? "crmPatients.useExisting" : "crmPatients.register")}
            </Button>
          )}
          {register && (
            <div
              className="space-y-3"
              onChange={() => {
                setAck(false);
                change();
              }}
            >
              <p>{t("crmPatients.registrationNotice")}</p>
              <PatientFormFields
                values={form.values}
                set={form.set}
                errors={form.errors}
              />
              <label>
                {t("crmPatients.relationship")}{" "}
                <select
                  className="rounded border bg-background p-2"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                >
                  {[
                    "self",
                    "parent",
                    "spouse",
                    "sibling",
                    "child",
                    "guardian",
                    "other",
                  ].map((r) => (
                    <option key={r} value={r}>
                  {t(`crmContacts.values.${r}`, { defaultValue: r })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {matches && (
            <>
              <DuplicateNotice matches={matches} tone="blocking" />
              <p>{t("crmPatients.existingHint")}</p>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => {
                    setAck(e.target.checked);
                    setKey(crypto.randomUUID());
                  }}
                />
                {t("crmPatients.separate")}
              </label>
            </>
          )}
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={identity}
              onChange={(e) => {
                setIdentity(e.target.checked);
                change();
              }}
            />
            {t("crmPatients.identity")}
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => {
                setReviewed(e.target.checked);
                change();
              }}
            />
            {t("crmPatients.review")}
          </label>
          <Button
            disabled={
              mutation.isPending ||
              !identity ||
              !reviewed ||
              (!register && !candidates.some((c) => c.linkId === linkId))
            }
            onClick={save}
          >
            {t(register ? "crmPatients.registerLink" : "crmPatients.link")}
          </Button>
        </>
      )}
      {data.canUnlink && (
        <div className="space-y-2">
          <p className="text-sm">{t("crmPatients.correctionNotice")}</p>
          <label>
            {t("crmPatients.reason")}{" "}
            <select
              className="rounded border bg-background p-2"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                change();
              }}
            >
              {[
                "wrong_patient",
                "wrong_lead",
                "duplicate_inquiry",
                "authorization_withdrawn",
              ].map((r) => (
                <option key={r} value={r}>
                  {t(`crmPatients.reasons.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              if (!confirmUnlink) {
                setConfirmUnlink(true);
                return;
              }
              mutation.mutate({
                operation: "unlink",
                body: {
                  expectedVersion: data.expectedVersion,
                  idempotencyKey: key,
                  reason,
                },
              });
            }}
          >
            {t(
              confirmUnlink
                ? "crmPatients.confirmUnlink"
                : "crmPatients.unlink",
            )}
          </Button>
        </div>
      )}
      {mutation.isError && (
        <p role="alert">
          {serverMessage(mutation.error) ?? t("crmPatients.saveError")}
        </p>
      )}
      {mutation.isSuccess && <p role="status">{t("crmPatients.saved")}</p>}
      <h4 className="font-medium">{t("crmPatients.history")}</h4>
      <ul className="space-y-1 text-sm">
        {data.history.map((h) => (
          <li key={h.id}>
            {t(`crmPatients.${h.action}`)} ·{" "}
            {h.patient && fresh(h.visibleUntil)
              ? `${h.patient.name} · ${h.patient.mrn}`
              : t("crmPatients.restricted")}{" "}
            · {new Date(h.createdAt).toLocaleString()}{" "}
            {h.revokedAt &&
              `· ${t("crmPatients.unlinked")} (${t(`crmPatients.reasons.${h.reason}`)})`}
          </li>
        ))}
      </ul>
    </section>
  );
}

-- Task 4.13 — one clinical note of each type per visit.
--
-- A psychiatric assessment is written across a consultation and saved more than once, so
-- the write is a replace keyed on (visit, type). Without this constraint two saves racing
-- leave two half-notes and nothing to say which one the record is. The table is empty at
-- the time this runs; a facility with existing rows would have to de-duplicate first.
CREATE UNIQUE INDEX "clinical_note_visit_id_note_type_key" ON "clinical_note"("visit_id", "note_type");

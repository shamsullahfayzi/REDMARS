-- Read-only. Run BEFORE migration on a restored copy of the hospital database.
-- Every returned row needs review; this script never repairs historical data.
SELECT 'invoice_balance' AS issue, i.id
FROM invoice i LEFT JOIN payment p ON p.invoice_id = i.id
GROUP BY i.id
HAVING i.paid_amount <> COALESCE(SUM(p.amount), 0)
   OR i.total <> i.subtotal - i.discount OR i.paid_amount < 0 OR i.paid_amount > i.total
   OR i.subtotal < 0 OR i.discount < 0 OR i.discount > i.subtotal;

SELECT 'invoice_subtotal' AS issue, i.id FROM invoice i
LEFT JOIN invoice_item l ON l.invoice_id = i.id
GROUP BY i.id HAVING i.subtotal <> COALESCE(SUM(l.total), 0);

SELECT 'invoice_line_total' AS issue, id FROM invoice_item
WHERE quantity <= 0 OR unit_price < 0 OR discount < 0 OR total < 0
   OR total <> quantity * unit_price - discount;

SELECT 'duplicate_clinical_charge' AS issue, ref_type, ref_id, COUNT(*)
FROM invoice_item WHERE ref_type IN ('lab_order_item', 'prescription_item') AND ref_id IS NOT NULL
GROUP BY ref_type, ref_id HAVING COUNT(*) > 1;

SELECT 'missing_receipt' AS issue, p.id FROM payment p WHERE receipt_no IS NULL;
SELECT 'zero_payment' AS issue, id FROM payment WHERE amount = 0;
SELECT 'duplicate_receipt' AS issue, i.facility_id, p.receipt_no, COUNT(*)
FROM payment p JOIN invoice i ON i.id = p.invoice_id WHERE p.receipt_no IS NOT NULL
GROUP BY i.facility_id, p.receipt_no HAVING COUNT(*) > 1;

SELECT 'visit_scope' AS issue, v.id FROM visit v
JOIN patient p ON p.id = v.patient_id JOIN department d ON d.id = v.department_id
LEFT JOIN practitioner pr ON pr.id = v.practitioner_id LEFT JOIN room r ON r.id = v.room_id
WHERE v.facility_id <> p.facility_id OR v.facility_id <> d.facility_id
   OR v.facility_id <> pr.facility_id OR v.facility_id <> r.facility_id;

SELECT 'invoice_scope' AS issue, i.id FROM invoice i JOIN patient p ON p.id = i.patient_id
LEFT JOIN visit v ON v.id = i.visit_id
WHERE i.facility_id <> p.facility_id OR i.facility_id <> v.facility_id OR i.patient_id <> v.patient_id;

SELECT 'room_scope' AS issue, r.id FROM room r
JOIN department d ON d.id = r.department_id WHERE r.facility_id <> d.facility_id;

SELECT 'practitioner_scope' AS issue, pr.id FROM practitioner pr
JOIN app_user u ON u.id = pr.user_id WHERE pr.facility_id <> u.facility_id;

SELECT 'lab_order_scope' AS issue, o.id FROM lab_order o
JOIN visit v ON v.id = o.visit_id LEFT JOIN practitioner pr ON pr.id = o.practitioner_id
WHERE o.facility_id <> v.facility_id OR o.facility_id <> pr.facility_id;

SELECT 'appointment_scope' AS issue, a.id FROM appointment a
JOIN patient p ON p.id = a.patient_id LEFT JOIN practitioner pr ON pr.id = a.practitioner_id
LEFT JOIN department d ON d.id = a.department_id
WHERE a.facility_id <> p.facility_id OR a.facility_id <> pr.facility_id OR a.facility_id <> d.facility_id;

SELECT 'duplicate_visit_prescription' AS issue, visit_id, COUNT(*)
FROM prescription GROUP BY visit_id HAVING COUNT(*) > 1;

SELECT 'lab_settlement_mismatch' AS issue, i.id FROM invoice i
JOIN invoice_item l ON l.invoice_id = i.id WHERE l.ref_type = 'lab_order_item'
GROUP BY i.id HAVING i.paid_amount <> SUM(CASE WHEN l.is_paid THEN l.total ELSE 0 END);

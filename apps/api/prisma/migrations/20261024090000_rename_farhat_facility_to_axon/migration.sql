-- Rename the existing hospital in place so every linked clinical, finance and
-- administrative record keeps the same facility_id.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM facility WHERE code = 'FARHAT')
     AND EXISTS (SELECT 1 FROM facility WHERE code = 'AXON') THEN
    RAISE EXCEPTION 'Cannot rename FARHAT to AXON because facility code AXON already exists';
  END IF;

  UPDATE facility
  SET code = 'AXON',
      name = 'Axon Nura Psychiatric and Addiction Treatment Specialty Hospital',
      name_local_prs = 'شفاخانه تخصصی روانی و تداوی اعتیاد اکسون نورا',
      name_local_ps = 'د اکسون نورا د رواني او روږدو درملنې تخصصي روغتون'
  WHERE code = 'FARHAT';

  -- Keep repeat deployments aligned if the internal code was renamed earlier.
  UPDATE facility
  SET name = 'Axon Nura Psychiatric and Addiction Treatment Specialty Hospital',
      name_local_prs = 'شفاخانه تخصصی روانی و تداوی اعتیاد اکسون نورا',
      name_local_ps = 'د اکسون نورا د رواني او روږدو درملنې تخصصي روغتون'
  WHERE code = 'AXON';
END $$;

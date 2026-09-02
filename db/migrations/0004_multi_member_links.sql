ALTER TABLE pet_records ADD COLUMN petIds TEXT NOT NULL DEFAULT '[]';
UPDATE pet_records SET petIds = '["' || petId || '"]';

ALTER TABLE supplies ADD COLUMN petIds TEXT NOT NULL DEFAULT '[]';
UPDATE supplies
SET petIds = CASE
  WHEN petId IS NULL THEN '[]'
  ELSE '["' || petId || '"]'
END;

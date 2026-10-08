-- Syria is priced in US dollars for now (only where it still has the seeded default; an admin's own choice is kept)
UPDATE "Country" SET "currencyCode" = 'USD' WHERE "isoCode2" = 'SY' AND "currencyCode" = 'SYP';

-- VIDEO database dalilacom_accvideo only (never the test or production database): the plans page of the Russian video must be Russian and rouble-priced.
-- The catalogue shows plan names and features exactly as stored, so the other services' plans (Arabic text) are switched off while recording. Undo: ru-db-restore.sql
update "ServicePlan" set "isActive"=false where id in ('7202d91d-18fc-4d3d-9fef-6068df62d202','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102');
update "ServicePlan" set name='Бухгалтерия — месяц', description='Учёт доходов, расходов и склада для вашего магазина', "priceCents"=29900, currency='RUB' where id='7531ef10-eebd-444d-8dee-bd7a39c78273';
update "ServicePlan" set name='Бухгалтерия — год', description='Учёт доходов, расходов и склада для вашего магазина. Выгоднее, чем помесячно', "priceCents"=299900, currency='RUB' where id='611ef8e6-4b33-49e4-801f-86325a730c63';
insert into "PlanPrice"(id,"planId","countryId","priceCredits","cashAmountCents","currencyCode","isActive")
select gen_random_uuid(), v.pid, (select id from "Country" where "isoCode2"='RU'), 800, v.cents, 'RUB', true
from (values ('7531ef10-eebd-444d-8dee-bd7a39c78273', 29900), ('611ef8e6-4b33-49e4-801f-86325a730c63', 299900)) as v(pid, cents)
on conflict ("planId","countryId") do update set "cashAmountCents"=excluded."cashAmountCents", "currencyCode"='RUB';

-- undo ru-db-prepare.sql on the VIDEO database dalilacom_accvideo
update "ServicePlan" set "isActive"=true where id in ('7202d91d-18fc-4d3d-9fef-6068df62d202','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102');
update "ServicePlan" set name='المحاسبة – شهري', description=null, "priceCents"=200, currency='USD' where id='7531ef10-eebd-444d-8dee-bd7a39c78273';
update "ServicePlan" set name='المحاسبة – سنوي', description=null, "priceCents"=2000, currency='USD' where id='611ef8e6-4b33-49e4-801f-86325a730c63';
delete from "PlanPrice" where "currencyCode"='RUB';

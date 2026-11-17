import { HrActor, HrMe, hrAudit } from "./hrAccess.service";
import { prisma } from "../prisma";
import { ApiError } from "../lib/apiError";
import { notify } from "./notification.service";

/** The phone the app is running on, sent by the app in the X-Device-Id / X-Device-Name headers. */
export type PhoneInfo = { id?: string; name?: string };
export const phoneOf = (req: { header(n: string): string | undefined }): PhoneInfo => ({
  id: (req.header("x-device-id") ?? "").trim().slice(0, 100) || undefined,
  name: (req.header("x-device-name") ?? "").trim().slice(0, 100) || undefined,
});

/**
 * Attendance (and location reports) only from the one phone registered to the employee.
 * The first phone that is used becomes theirs; any other phone is refused and a request goes to the owner and the HR people.
 */
export async function assertOwnPhone(me: HrMe, phone: PhoneInfo) {
  if (!me.company.deviceLockRequired) return;
  if (!phone.id) throw new ApiError(403, "DEVICE_ID_REQUIRED", "حدّث تطبيق دليلكم لآخر نسخة حتى تقدر تسجّل دوامك");
  const bound = me.employee.boundDeviceId;
  if (!bound) {
    await prisma.hrEmployee.update({ where: { id: me.employee.id }, data: { boundDeviceId: phone.id, boundDeviceName: phone.name ?? null, boundAt: new Date() } });
    await hrAudit(me.company.id, me.userId, "device.bind", "HrEmployee", me.employee.id, { deviceName: phone.name });
    return;
  }
  if (bound === phone.id) return;
  const existing = await prisma.hrDeviceRequest.findUnique({ where: { employeeId_deviceId: { employeeId: me.employee.id, deviceId: phone.id } } });
  if (!existing || existing.status !== "PENDING") {
    await prisma.hrDeviceRequest.upsert({
      where: { employeeId_deviceId: { employeeId: me.employee.id, deviceId: phone.id } },
      create: { companyId: me.company.id, employeeId: me.employee.id, deviceId: phone.id, deviceName: phone.name },
      update: { status: "PENDING", decidedAt: null, decidedById: null, deviceName: phone.name },
    });
    const hr = await prisma.hrEmployee.findMany({ where: { companyId: me.company.id, role: { in: ["HR", "SECRETARY", "ATTENDANCE_SUPERVISOR"] }, employmentStatus: { not: "TERMINATED" }, userId: { not: null } }, select: { userId: true } });
    const name = `${me.employee.firstName} ${me.employee.lastName}`.trim();
    for (const userId of new Set([me.company.ownerId, ...hr.map((h) => h.userId!)])) {
      await notify({ userId, type: "SYSTEM", title: "طلب تغيير جهاز موظف", body: `${name} حاول يسجّل من جهاز جديد${phone.name ? ` (${phone.name})` : ""}`, data: { kind: "hr.device-request", employeeId: me.employee.id }, email: false }).catch((err) => console.error("HR notification failed", err));
    }
  }
  throw new ApiError(403, "DEVICE_NOT_APPROVED", "هاد مو الجهاز المسجّل لحسابك. انبعت طلب لصاحب الشركة، ولما يوافق بتقدر تسجّل من هالجهاز.");
}

export const listRequests = (companyId: string, status?: "PENDING" | "APPROVED" | "REJECTED") =>
  prisma.hrDeviceRequest.findMany({
    where: { companyId, ...(status ? { status } : {}) },
    include: { employee: { select: { id: true, firstName: true, lastName: true, boundDeviceName: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

export async function decideRequest(actor: HrActor, id: string, decision: "APPROVE" | "REJECT") {
  const req = await prisma.hrDeviceRequest.findFirst({ where: { id, companyId: actor.company.id } });
  if (!req) throw new ApiError(404, "NOT_FOUND", "الطلب غير موجود");
  if (req.status !== "PENDING") throw new ApiError(409, "CONFLICT", "الطلب انحسم من قبل");
  const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const done = await prisma.hrDeviceRequest.updateMany({ where: { id, status: "PENDING" }, data: { status, decidedAt: new Date(), decidedById: actor.userId } });
  if (done.count !== 1) throw new ApiError(409, "CONFLICT", "الطلب انحسم من قبل");
  if (status === "APPROVED") {
    await prisma.hrEmployee.update({ where: { id: req.employeeId }, data: { boundDeviceId: req.deviceId, boundDeviceName: req.deviceName, boundAt: new Date() } });
    // any other waiting request of this employee is stale now
    await prisma.hrDeviceRequest.updateMany({ where: { employeeId: req.employeeId, status: "PENDING", id: { not: id } }, data: { status: "REJECTED", decidedAt: new Date(), decidedById: actor.userId } });
  }
  await hrAudit(actor.company.id, actor.userId, `device.${decision.toLowerCase()}`, "HrDeviceRequest", id, { employeeId: req.employeeId });
  const emp = await prisma.hrEmployee.findUnique({ where: { id: req.employeeId }, select: { userId: true } });
  if (emp?.userId) await notify({ userId: emp.userId, type: "SYSTEM", title: status === "APPROVED" ? "تمت الموافقة على جهازك الجديد" : "انرفض طلب الجهاز الجديد", body: undefined, data: { kind: "hr.device-decision" }, email: false }).catch(() => undefined);
  return prisma.hrDeviceRequest.findUniqueOrThrow({ where: { id } });
}

/** The owner or an HR person clears the registered phone: the next phone the employee uses becomes theirs. */
export async function resetEmployeePhone(actor: HrActor, employeeId: string) {
  const emp = await prisma.hrEmployee.findFirst({ where: { id: employeeId, companyId: actor.company.id } });
  if (!emp) throw new ApiError(404, "NOT_FOUND", "الموظف غير موجود");
  await prisma.hrEmployee.update({ where: { id: employeeId }, data: { boundDeviceId: null, boundDeviceName: null, boundAt: null } });
  await hrAudit(actor.company.id, actor.userId, "device.reset", "HrEmployee", employeeId);
}

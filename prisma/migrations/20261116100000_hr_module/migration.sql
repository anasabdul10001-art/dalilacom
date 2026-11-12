-- Human resources section: the owner's company, employees (some linked to their own account), attendance, leave, payroll and advances.
-- CreateEnum
CREATE TYPE "HrRole" AS ENUM ('HR', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "HrEmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "HrAttendanceSource" AS ENUM ('WEB', 'MOBILE', 'MANUAL');

-- CreateEnum
CREATE TYPE "HrLeaveStatus" AS ENUM ('PENDING_MANAGER', 'PENDING_HR', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "HrComponentType" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "HrCalcType" AS ENUM ('FIXED', 'PERCENTAGE_OF_BASE');

-- CreateEnum
CREATE TYPE "HrRunStatus" AS ENUM ('DRAFT', 'PROCESSED', 'PAID');

-- CreateEnum
CREATE TYPE "HrAdvanceStatus" AS ENUM ('PENDING_MANAGER', 'PENDING_HR', 'APPROVED', 'REJECTED', 'REPAID');

-- AlterEnum
ALTER TYPE "ServiceKind" ADD VALUE 'HR';

-- CreateTable
CREATE TABLE "HrCompany" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "workingDays" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrDepartment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrEmployee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "position" TEXT,
    "departmentId" TEXT,
    "managerId" TEXT,
    "role" "HrRole" NOT NULL DEFAULT 'EMPLOYEE',
    "hireDate" TIMESTAMP(3) NOT NULL,
    "employmentStatus" "HrEmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "baseSalary" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrInvite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrAttendance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3),
    "source" "HrAttendanceSource" NOT NULL DEFAULT 'WEB',
    "editedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrLeaveType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultBalance" INTEGER NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HrLeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrLeaveBalance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "balanceDays" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "HrLeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrLeaveRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "HrLeaveStatus" NOT NULL DEFAULT 'PENDING_MANAGER',
    "managerApprovedBy" TEXT,
    "managerApprovedAt" TIMESTAMP(3),
    "hrApprovedBy" TEXT,
    "hrApprovedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrLeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrSalaryComponent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HrComponentType" NOT NULL,
    "calcType" "HrCalcType" NOT NULL DEFAULT 'FIXED',

    CONSTRAINT "HrSalaryComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrEmployeeComponent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "fixedAmount" INTEGER,
    "percentage" DOUBLE PRECISION,

    CONSTRAINT "HrEmployeeComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPayrollRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "HrRunStatus" NOT NULL DEFAULT 'DRAFT',
    "runAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrPayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPayslip" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "grossPay" INTEGER NOT NULL,
    "totalDeductions" INTEGER NOT NULL,
    "netPay" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrPayslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrAdvance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "installmentsCount" INTEGER NOT NULL,
    "status" "HrAdvanceStatus" NOT NULL DEFAULT 'PENDING_MANAGER',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrAdvanceInstallment" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidInRunId" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HrAdvanceInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrAuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HrCompany_ownerId_key" ON "HrCompany"("ownerId");

-- CreateIndex
CREATE INDEX "HrDepartment_companyId_idx" ON "HrDepartment"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "HrDepartment_companyId_name_key" ON "HrDepartment"("companyId", "name");

-- CreateIndex
CREATE INDEX "HrEmployee_companyId_idx" ON "HrEmployee"("companyId");

-- CreateIndex
CREATE INDEX "HrEmployee_userId_idx" ON "HrEmployee"("userId");

-- CreateIndex
CREATE INDEX "HrEmployee_departmentId_idx" ON "HrEmployee"("departmentId");

-- CreateIndex
CREATE INDEX "HrEmployee_managerId_idx" ON "HrEmployee"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "HrEmployee_companyId_userId_key" ON "HrEmployee"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HrInvite_employeeId_key" ON "HrInvite"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "HrInvite_codeHash_key" ON "HrInvite"("codeHash");

-- CreateIndex
CREATE INDEX "HrInvite_companyId_idx" ON "HrInvite"("companyId");

-- CreateIndex
CREATE INDEX "HrAttendance_companyId_employeeId_checkIn_idx" ON "HrAttendance"("companyId", "employeeId", "checkIn");

-- CreateIndex
CREATE UNIQUE INDEX "HrLeaveType_companyId_name_key" ON "HrLeaveType"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "HrLeaveBalance_employeeId_leaveTypeId_year_key" ON "HrLeaveBalance"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "HrLeaveRequest_companyId_employeeId_idx" ON "HrLeaveRequest"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "HrSalaryComponent_companyId_idx" ON "HrSalaryComponent"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "HrEmployeeComponent_employeeId_componentId_key" ON "HrEmployeeComponent"("employeeId", "componentId");

-- CreateIndex
CREATE INDEX "HrPayrollRun_companyId_idx" ON "HrPayrollRun"("companyId");

-- CreateIndex
CREATE INDEX "HrPayslip_runId_employeeId_idx" ON "HrPayslip"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "HrAdvance_companyId_employeeId_idx" ON "HrAdvance"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "HrAdvanceInstallment_advanceId_idx" ON "HrAdvanceInstallment"("advanceId");

-- CreateIndex
CREATE INDEX "HrAuditLog_companyId_createdAt_idx" ON "HrAuditLog"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "HrCompany" ADD CONSTRAINT "HrCompany_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrDepartment" ADD CONSTRAINT "HrDepartment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "HrCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrDepartment" ADD CONSTRAINT "HrDepartment_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "HrEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrEmployee" ADD CONSTRAINT "HrEmployee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "HrCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrEmployee" ADD CONSTRAINT "HrEmployee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrEmployee" ADD CONSTRAINT "HrEmployee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "HrDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrEmployee" ADD CONSTRAINT "HrEmployee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "HrEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrInvite" ADD CONSTRAINT "HrInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "HrCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrInvite" ADD CONSTRAINT "HrInvite_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrAttendance" ADD CONSTRAINT "HrAttendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "HrCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrAttendance" ADD CONSTRAINT "HrAttendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveType" ADD CONSTRAINT "HrLeaveType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "HrCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveBalance" ADD CONSTRAINT "HrLeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveBalance" ADD CONSTRAINT "HrLeaveBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "HrLeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveRequest" ADD CONSTRAINT "HrLeaveRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "HrCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveRequest" ADD CONSTRAINT "HrLeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLeaveRequest" ADD CONSTRAINT "HrLeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "HrLeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrSalaryComponent" ADD CONSTRAINT "HrSalaryComponent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "HrCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrEmployeeComponent" ADD CONSTRAINT "HrEmployeeComponent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrEmployeeComponent" ADD CONSTRAINT "HrEmployeeComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "HrSalaryComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPayrollRun" ADD CONSTRAINT "HrPayrollRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "HrCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPayslip" ADD CONSTRAINT "HrPayslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "HrPayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPayslip" ADD CONSTRAINT "HrPayslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrAdvance" ADD CONSTRAINT "HrAdvance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "HrCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrAdvance" ADD CONSTRAINT "HrAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrAdvanceInstallment" ADD CONSTRAINT "HrAdvanceInstallment_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "HrAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrAuditLog" ADD CONSTRAINT "HrAuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "HrCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;


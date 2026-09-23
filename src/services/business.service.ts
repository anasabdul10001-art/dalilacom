import { BusinessMemberRole, BusinessStatus, MerchantApprovalStatus, Prisma } from "@prisma/client";
import { prisma } from "../prisma";

export class NotBusinessMemberError extends Error {}

/** Any active member of the business, regardless of role. */
export async function getActiveMembership(businessId: string, userId: string) {
  return prisma.businessMember.findFirst({
    where: { businessId, userId, status: "ACTIVE" },
  });
}

/**
 * Throws unless the user is an active member of the business with one of the given roles
 * (defaults to any role). This is the foundation-level "can this user act for this business"
 * check — fine-grained per-permission RBAC is a later phase (section: Business Ownership).
 */
export async function requireBusinessMember(businessId: string, userId: string, roles?: BusinessMemberRole[]) {
  const membership = await getActiveMembership(businessId, userId);
  if (!membership) throw new NotBusinessMemberError("Not a member of this business");
  if (roles && !roles.includes(membership.role)) throw new NotBusinessMemberError("Insufficient role for this action");
  return membership;
}

function mapApprovalStatusToBusinessStatus(approvalStatus: MerchantApprovalStatus): BusinessStatus {
  if (approvalStatus === "APPROVED") return "ACTIVE";
  if (approvalStatus === "REJECTED") return "ARCHIVED";
  return "DRAFT";
}

export interface LegacyMerchantProfileLike {
  id: string;
  userId: string;
  businessName: string;
  categoryId: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  whatsapp: string | null;
  approvalStatus: MerchantApprovalStatus;
}

/**
 * Creates the Business/BusinessMember/(Main Branch) that correspond to one MerchantProfile —
 * shared by the one-time Phase 1B backfill script and by POST /merchant/register's dual-write,
 * so both paths build the new structure identically (section: Backfill / Compatibility Layer).
 * The old MerchantProfile row itself is never touched.
 */
export async function createBusinessFromMerchantProfile(
  tx: Prisma.TransactionClient,
  merchant: LegacyMerchantProfileLike,
  countryId: string,
) {
  const business = await tx.business.create({
    data: {
      name: merchant.businessName,
      categoryId: merchant.categoryId,
      phone: merchant.phone,
      whatsapp: merchant.whatsapp,
      status: mapApprovalStatusToBusinessStatus(merchant.approvalStatus),
      countryId,
      latitude: merchant.latitude,
      longitude: merchant.longitude,
      legacyMerchantProfileId: merchant.id,
    },
  });
  await tx.businessMember.create({
    data: { businessId: business.id, userId: merchant.userId, role: "OWNER" },
  });

  // Only backfill a Main Branch when there's an actual physical location to represent — a
  // Business is allowed to exist with zero branches (section: Business Without Physical Branch).
  let branch = null;
  if (merchant.address || merchant.latitude !== null) {
    let addressId: string | undefined;
    if (merchant.address) {
      const address = await tx.address.create({
        data: { countryId, additionalInfo: merchant.address, latitude: merchant.latitude, longitude: merchant.longitude },
      });
      addressId = address.id;
    }
    branch = await tx.branch.create({
      data: {
        businessId: business.id,
        name: merchant.businessName,
        phone: merchant.phone,
        whatsapp: merchant.whatsapp,
        countryId,
        latitude: merchant.latitude,
        longitude: merchant.longitude,
        addressId,
        isMain: true,
        status: "ACTIVE",
      },
    });
  }

  return { business, branch };
}
